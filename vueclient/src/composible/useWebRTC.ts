/* eslint-disable @typescript-eslint/no-explicit-any */
import { SignalingMessage } from '@/api/models/SignalingMessage'
import { useSignalingStore } from '@/stores/signalingStore'
import { computed, onUnmounted, ref } from 'vue'

export interface PeerConnection {
  peerId: string
  room_mates?: Record<string, string>
  connection: RTCPeerConnection
  remoteStream: MediaStream | null
  dataChannel?: RTCDataChannel
}

// Более специфичный тип для состояния пира
interface PeerState {
  video?: boolean
  microphone?: boolean
  [key: string]: any
}

interface PeerPlaybackSettings {
  volume: number
  muted: boolean
}

export function useWebRTC() {
  const signalingStore = useSignalingStore()

  // Состояния
  const localStream = ref<MediaStream | null>(null)
  const localState = ref({ video: false, microphone: true })
  const peers = ref<Map<string, PeerConnection>>(new Map())
  const speakingPeers = ref<Record<string, boolean>>({})
  const isMediaInitialized = ref(false)
  const isScreenSharing = ref(false)
  const isLocalSpeaking = ref(false)
  const peerStates = ref<Record<string, PeerState>>({})
  const peerPlayback = ref<Record<string, PeerPlaybackSettings>>({})
  const peerAudioStreams = ref<Record<string, MediaStream>>({})
  const audioContextRef = ref<AudioContext | null>(null)
  const analyserRef = ref<AnalyserNode | null>(null)
  const animationFrameId = ref<number | null>(null)

  // Конфигурация ICE
  const iceConfiguration: RTCConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },

      // Добавленные бесплатные публичные STUN‑серверы
      { urls: 'stun:stun.stunprotocol.org:3478' },
      { urls: 'stun:stun.voipawesome.com:3478' },
      { urls: 'stun:stun.nextcloud.com:3478' },
      { urls: 'stun:stun.counterpath.com:3478' },
      { urls: 'stun:stun.voipstunt.com:3478' },
      { urls: 'stun:stun.voipbuster.com:3478' },
      { urls: 'stun:stun.ekiga.net:3478' },
    ],
  }

  // Вычисляемые значения
  const remotePeers = computed(() => Array.from(peers.value.values()))

  const videoDevices = ref<MediaDeviceInfo[]>([])
  const audioDevices = ref<MediaDeviceInfo[]>([])
  let previousVideoTrack: MediaStreamTrack | null = null
  let previousAudioTrack: MediaStreamTrack | null = null
  let screenShareStream: MediaStream | null = null
  let activeScreenAudioTrack: MediaStreamTrack | null = null
  const screenAudioSenders = new Map<string, { sender: RTCRtpSender; track: MediaStreamTrack }>()

  function ensurePeerPlayback(peerId: string) {
    if (!peerPlayback.value[peerId]) {
      peerPlayback.value = {
        ...peerPlayback.value,
        [peerId]: {
          volume: 1,
          muted: false,
        },
      }
    }
  }

  function updatePeerAudioStream(peerId: string, stream: MediaStream | null) {
    if (!stream) {
      if (peerAudioStreams.value[peerId]) {
        const updated = { ...peerAudioStreams.value }
        delete updated[peerId]
        peerAudioStreams.value = updated
      }
      return
    }

    const audioTracks = stream.getAudioTracks()
    if (audioTracks.length === 0) {
      if (peerAudioStreams.value[peerId]) {
        const updated = { ...peerAudioStreams.value }
        delete updated[peerId]
        peerAudioStreams.value = updated
      }
      return
    }

    const audioStream = new MediaStream()
    audioTracks.forEach((track) => audioStream.addTrack(track))

    peerAudioStreams.value = {
      ...peerAudioStreams.value,
      [peerId]: audioStream,
    }
  }

  function setPeerVolume(peerId: string, rawVolume: number) {
    ensurePeerPlayback(peerId)
    const volume = Math.min(Math.max(rawVolume, 0), 1)
    peerPlayback.value = {
      ...peerPlayback.value,
      [peerId]: {
        ...peerPlayback.value[peerId],
        volume,
      },
    }
  }

  function setPeerMuted(peerId: string, muted: boolean) {
    ensurePeerPlayback(peerId)
    peerPlayback.value = {
      ...peerPlayback.value,
      [peerId]: {
        ...peerPlayback.value[peerId],
        muted,
      },
    }
  }

  // Вызывает createOffer только если signallingState === 'stable'
  async function createOfferSafe(peerId: string) {
    const peer = peers.value.get(peerId)
    if (!peer) {
      console.warn(`createOfferSafe: нет пира ${peerId}`)
      return
    }
    const pc = peer.connection
    if (pc.signalingState !== 'stable') {
      // если не stable — отложим. Логируем и пропускаем, чтобы не ломать SDP.
      console.warn(
        `createOfferSafe: пропускаю createOffer для ${peerId}, signalingState = ${pc.signalingState}`,
      )
      return
    }
    // безопасно вызываем оригинальную createOffer
    try {
      await createOffer(peerId)
    } catch (err) {
      console.error('createOfferSafe: ошибка при createOffer', err)
    }
  }

  // Получить доступные медиа-устройства
  async function fetchVideoDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      videoDevices.value = devices.filter((device) => device.kind === 'videoinput')
    } catch (error) {
      console.error('Не удалось получить список видеоустройств:', error)
    }
  }

  async function fetchAudioDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      audioDevices.value = devices.filter((device) => device.kind === 'audioinput')
    } catch (error) {
      console.error('Не удалось получить список аудиоустройств:', error)
    }
  }

  // Инициализация локальных медиа (камера и микрофон)
  async function initializeMedia(
    constraints: MediaStreamConstraints = {
      video: false,
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    },
  ) {
    try {
      // Останавливаем существующие треки перед повторной инициализацией
      if (localStream.value) {
        localStream.value.getTracks().forEach((track) => track.stop())
      }

      localStream.value = await navigator.mediaDevices.getUserMedia(constraints)
      localStream.value
        .getAudioTracks()
        .forEach((track) => (track.contentHint = track.contentHint || 'speech'))
      isMediaInitialized.value = true

      if (constraints.audio) monitorLocalSpeaking(localStream.value)

      console.log('Локальные медиа инициализированы:', localStream.value)
      return localStream.value
    } catch (error) {
      console.error('Не удалось получить локальные медиа:', error)
      throw error
    }
  }

  // Остановить локальные медиа
  function stopMedia() {
    if (localStream.value) {
      localStream.value.getTracks().forEach((track) => track.stop())
      localStream.value = null
      isMediaInitialized.value = false
      if (animationFrameId.value) {
        cancelAnimationFrame(animationFrameId.value)
        animationFrameId.value = null
      }
      if (audioContextRef.value) {
        audioContextRef.value.close()
        audioContextRef.value = null
        analyserRef.value = null
      }
    }
  }

  // Создать соединение с пиром
  function createPeerConnection(peerId: string): RTCPeerConnection {
    const pc = new RTCPeerConnection(iceConfiguration)

    // Создать data channel (работает даже без треков)
    const dataChannel = pc.createDataChannel('state-channel')
    setupDataChannel(peerId, dataChannel)

    // Добавить треки локального потока в соединение (если есть)
    if (localStream.value) {
      localStream.value.getTracks().forEach((track) => {
        pc.addTrack(track, localStream.value!)
      })
    } else {
      // Даже без треков создаем соединение для data channel
      console.log('Локальный поток отсутствует, но создаем соединение для data channel с', peerId)
    }

    // Обработка ICE кандидатов
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('Отправляю ICE-кандидата для', peerId)
        signalingStore.sendIceCandidate(peerId, event.candidate)
      }
    }

    // Обработка изменений состояния соединения
    pc.onconnectionstatechange = () => {
      console.log(`Состояние соединения с ${peerId}:`, pc.connectionState)

      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        removePeer(peerId)
      }
    }

    pc.oniceconnectionstatechange = () => {
      console.log(`Состояние ICE соединения с ${peerId}:`, pc.iceConnectionState)
    }

    // Обработка удалённого потока
    const remoteStream = new MediaStream()
    pc.ontrack = (event) => {
      console.log('📡 Получен трек от', peerId, event.track.kind)
      const [stream] = event.streams
      if (!stream) return

      const updateStream = () => {
        const existingPeer = peers.value.get(peerId)
        if (!existingPeer) {
          peers.value.set(peerId, {
            peerId,
            connection: pc,
            remoteStream: stream,
            room_mates: signalingStore.room_mates,
            dataChannel,
          })
          ensurePeerPlayback(peerId)
          updatePeerAudioStream(peerId, stream)
          console.log(`👤 Новый пир ${peerId} с потоком`, stream)
        } else {
          // После удаления видео-трека инициируем renegotiation для всех пиров
          peers.value.forEach((_, peerIdInner) => {
            createOfferSafe(peerIdInner)
          })
          // добавляем трек, если его нет
          const existingStream = existingPeer.remoteStream || new MediaStream()
          if (!existingStream.getTracks().includes(event.track)) {
            existingStream.addTrack(event.track)
          }
          // принудительно обновляем ссылку, чтобы Vue отреагировал
          const updatedStream = new MediaStream(existingStream.getTracks())
          updatePeerRemoteStream(peerId, updatedStream)
        }

        monitorSpeaking(peerId, stream)
      }

      // вызывать при "размьюте" — когда пир включает видео без повторных переговоров
      event.track.onunmute = () => {
        console.log(`🔊 Трек ${event.track.kind} для ${peerId} размьючен, обновляю`)
        updateStream()
      }

      // и сразу при первом включении
      if (!event.track.muted) {
        updateStream()
      }
    }

    pc.ondatachannel = (event) => {
      console.log('Получен DataChannel от', peerId)
      const existingPeer = peers.value.get(peerId)
      if (existingPeer) {
        // Обновляем dataChannel в существующем пире
        existingPeer.dataChannel = event.channel
        // Обновляем пира в Map для реактивности
        peers.value.set(peerId, { ...existingPeer, dataChannel: event.channel })
        setupDataChannel(peerId, event.channel)
      } else {
        setupDataChannel(peerId, event.channel)
      }
    }

    // Сохранить соединение с пиром
    const newPeer: PeerConnection = {
      peerId,
      connection: pc,
      remoteStream,
      room_mates: signalingStore.room_mates,
      dataChannel,
    }

    peers.value.set(peerId, newPeer)
    ensurePeerPlayback(peerId)

    if (isScreenSharing.value && activeScreenAudioTrack && !screenAudioSenders.has(peerId)) {
      const clonedTrack = activeScreenAudioTrack.clone()
      clonedTrack.contentHint = 'screen'
      const senderStream = new MediaStream([clonedTrack])
      const sender = pc.addTrack(clonedTrack, senderStream)
      screenAudioSenders.set(peerId, { sender, track: clonedTrack })
    }

    return pc
  }

  function handlePeerState(peerId: string, state: Record<string, any>) {
    console.log('Получено состояние от', peerId, ':', state)

    // Создаем новый объект для реактивности Vue
    const newPeerStates = { ...peerStates.value }
    newPeerStates[peerId] = {
      ...(newPeerStates[peerId] || {}),
      ...state,
    }
    peerStates.value = newPeerStates

    // Если видео включено/выключено, вызываем соответствующую логику
    if ('video' in state) {
      updateRemoteVideo(peerId, state.video)
    }

    // Логируем состояние микрофона для отладки
    if ('microphone' in state) {
      const micStatus = state.microphone ? 'включен' : 'выключен'
      const peer = peers.value.get(peerId)
      const hasVideo = peer?.remoteStream && peer.remoteStream.getVideoTracks().length > 0
      console.log(`Микрофон ${peerId} (${hasVideo ? 'с видео' : 'без видео'}):`, micStatus)
      console.log('Обновленное состояние пира', peerId, ':', peerStates.value[peerId])
    }
  }

  function updatePeerRemoteStream(peerId: string, newStream: MediaStream) {
    const peer = peers.value.get(peerId)
    if (peer) {
      // Прямое присваивание свойства объекта, отслеживаемого реактивно
      peer.remoteStream = newStream
      // Если используете ref для peers, то:
      peers.value.set(peerId, peer)
      console.log(
        `Удалённый поток пира ${peerId} обновлён. Количество видеотреков: ${newStream.getVideoTracks().length}`,
      )
      ensurePeerPlayback(peerId)
      updatePeerAudioStream(peerId, newStream)
    }
  }

  function updateRemoteVideo(peerId: string, enabled: boolean) {
      const peer = peers.value.get(peerId)
      if (!peer || !peer.remoteStream) {
        console.warn(`Пир ${peerId} или remoteStream не найдены для обновления видео.`)
        return
      }

      const currentVideoTracks = peer.remoteStream.getVideoTracks()
      const hasVideoTrack = currentVideoTracks.length > 0

      if (enabled && !hasVideoTrack) {
        console.log(`Запрашиваю повторные переговоры для добавления видеотрека пиру ${peerId}`)
        createOfferSafe(peerId)
      }
    }

  function setupDataChannel(peerId: string, channel: RTCDataChannel) {
    channel.onopen = () => {
      console.log('DataChannel открыт с', peerId)
      // Отправляем своё состояние при открытии канала
      const stateToSend = { ...localState.value }
      console.log('Отправляю начальное состояние', peerId, ':', stateToSend)
      broadcastStateTo(peerId, stateToSend)
    }
    channel.onclose = () => console.log('DataChannel закрыт с', peerId)
    channel.onerror = (err) => console.error('Ошибка DataChannel', err)
    channel.onmessage = (event) => {
      console.log('Сообщение по DataChannel от', peerId, ':', event.data)
      try {
        const data = JSON.parse(event.data)
        console.log('Распарсенные данные от', peerId, ':', data)
        handlePeerState(peerId, data)
      } catch (error) {
        console.warn('Некорректные данные от пира', event.data, error)
      }
    }
  }

  // Создать и отправить offer пирy
  async function createOffer(peerId: string) {
      try {
        const pc = peers.value.get(peerId)?.connection || createPeerConnection(peerId)

        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)

        console.log('Создан offer для', peerId)
        signalingStore.sendOffer(peerId, offer)

        // Обновить объект пира в Map для реактивности и актуального потока
        const peer = peers.value.get(peerId)

        if (peer) {
          console.log('Создаю offer, обновляю пира:', peer.remoteStream?.getVideoTracks())

          peers.value.set(peerId, {
            ...peer,
            connection: pc,
            remoteStream: peer.remoteStream,
          })

          console.log('Пир обновлён после создания offer:', peers.value.get(peerId))
        }
      } catch (error) {
        console.error('Не удалось создать offer:', error)
        throw error
      }
    }

  // Обработка входящего offer
  async function handleOffer(peerId: string, offer: RTCSessionDescriptionInit) {
      try {
        console.log('Обрабатываю offer от', peerId)

        const pc = peers.value.get(peerId)?.connection || createPeerConnection(peerId)

        await pc.setRemoteDescription(new RTCSessionDescription(offer))

        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)

        console.log('Создан answer для', peerId)
        signalingStore.sendAnswer(peerId, answer)
      } catch (error) {
        console.error('Не удалось обработать offer:', error)
        throw error
      }
    }

  // Обработка входящего answer
  async function handleAnswer(peerId: string, answer: RTCSessionDescriptionInit) {
      try {
        console.log('Обрабатываю answer от', peerId)

        const peer = peers.value.get(peerId)
        if (!peer) {
          console.error('Не найдено соединение с пиром для', peerId)
          return
        }

        // Устанавливать remote answer только если signalingState равен 'have-local-offer'
        if (peer.connection.signalingState === 'have-local-offer') {
          await peer.connection.setRemoteDescription(new RTCSessionDescription(answer))
        } else {
          console.warn(
            `Пир ${peerId} находится в состоянии '${peer.connection.signalingState}', ответ не ожидается. Пропускаю setRemoteDescription.`,
          )
        }
      } catch (error) {
        console.error('Не удалось обработать answer:', error)
        throw error
      }
    }

  // Обработка входящего ICE кандидата
  async function handleIceCandidate(peerId: string, candidate: RTCIceCandidateInit) {
      try {
        console.log('Обрабатываю ICE-кандидата от', peerId)

        const peer = peers.value.get(peerId)
        if (!peer) {
          console.error('Не найдено соединение с пиром для', peerId)
          return
        }

        await peer.connection.addIceCandidate(new RTCIceCandidate(candidate))
      } catch (error) {
        console.error('Не удалось обработать ICE-кандидата:', error)
        throw error
      }
    }

  // Удалить соединение с пиром
  function removePeer(peerId: string) {
    const peer = peers.value.get(peerId)
    if (peer) {
      peer.connection.close()
      peers.value.delete(peerId)
      delete speakingPeers.value[peerId]
      delete peerStates.value[peerId]

      if (peerPlayback.value[peerId]) {
        const playbackCopy = { ...peerPlayback.value }
        delete playbackCopy[peerId]
        peerPlayback.value = playbackCopy
      }

      if (peerAudioStreams.value[peerId]) {
        const audioCopy = { ...peerAudioStreams.value }
        delete audioCopy[peerId]
        peerAudioStreams.value = audioCopy
      }

      if (peerAudioContexts[peerId]) {
        peerAudioContexts[peerId].close()
        delete peerAudioContexts[peerId]
      }

      const screenSender = screenAudioSenders.get(peerId)
      if (screenSender) {
        screenSender.track.stop()
        screenAudioSenders.delete(peerId)
      }

      console.log('Пир удалён:', peerId)
    }
  }

  // Настроить обработчики сигнализации
  function setupSignalingHandlers() {
    // Обработка события присоединения пира — инициируем соединение
    signalingStore.onMessage(SignalingMessage.type.PEER_JOINED, (message) => {
      if (message.from && message.from !== signalingStore.clientId) {
        console.log('Текущий пир создаёт offer новому участнику:', message.from)
        createOffer(message.from)
        // сразу отправим своё текущее состояние
        setTimeout(() => {
          if (message.from) broadcastStateTo(message.from, localState.value)
        }, 1000)
      }
    })

    // Обработка offer
    signalingStore.onMessage(SignalingMessage.type.OFFER, (message) => {
      if (message.from && message.payload && 'sdp' in message.payload) {
        handleOffer(message.from, {
          type: 'offer',
          sdp: message.payload.sdp,
        })
      }
    })

    // Обработка answer
    signalingStore.onMessage(SignalingMessage.type.ANSWER, (message) => {
      if (message.from && message.payload && 'sdp' in message.payload) {
        handleAnswer(message.from, {
          type: 'answer',
          sdp: message.payload.sdp,
        })
      }
    })

    // Обработка ICE-кандидата
    signalingStore.onMessage(SignalingMessage.type.ICE, (message) => {
      if (message.from && message.payload && 'candidate' in message.payload) {
        handleIceCandidate(message.from, {
          candidate: message.payload.candidate,
          sdpMid: message.payload.sdpMid,
          sdpMLineIndex: message.payload.sdpMLineIndex,
        })
      }
    })

    // Обработка выхода пира
    signalingStore.onMessage(SignalingMessage.type.LEAVE, (message) => {
      if (message.from) {
        console.log('Пир покинул комнату:', message.from)
        removePeer(message.from)
      }
    })
  }

  // Присоединиться к комнате с WebRTC
  async function joinRoomWithMedia(
    roomId: string,
    username?: string,
    mediaConstraints?: MediaStreamConstraints,
  ) {
    try {
      // Инициализируем медиа только если этого ещё не сделано
      if (!isMediaInitialized.value) {
        await initializeMedia(mediaConstraints)
      }

      setupSignalingHandlers()

      if (!signalingStore.isConnected) {
        await signalingStore.connect()
      }

      signalingStore.joinRoom(roomId, username)
      console.log('Вошёл в комнату WebRTC:', roomId)
    } catch (error) {
      console.error('Не удалось войти в комнату с медиа:', error)
      throw error
    }
  }

  // Покинуть комнату и очистить
  function leaveRoom() {
    // Закрываем все соединения с пирами
    peers.value.forEach(({ connection }, peerId) => {
      connection.close()
      console.log('Соединение с пиром закрыто:', peerId)
    })

    // Очистить объект
    peers.value.clear()

    // Выходим из комнаты сигнализации
    signalingStore.leaveRoom()

    // Очищаем обработчики сигнализации
    signalingStore.clearHandlers()

    // Сбрасываем состояния "говорит"
    speakingPeers.value = {}
    peerStates.value = {}
    peerPlayback.value = {}
    peerAudioStreams.value = {}

    localState.value = { video: false, microphone: true }

    console.log('Комната покинута')
  }

  // Переключить камеру
  async function switchCamera(deviceId: string) {
      try {
        if (!localStream.value) {
          console.warn('Локальный поток отсутствует — невозможно переключить камеру')
          return
        }

        const newStream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: deviceId } },
          audio: false,
        })

        const newVideoTrack = newStream.getVideoTracks()[0]
        if (!newVideoTrack) return

        const oldVideoTrack = localStream.value.getVideoTracks()[0] || null

        peers.value.forEach(({ connection }, peerId) => {
          const sender = connection.getSenders().find((s) => s.track && s.track.kind === 'video')
          if (sender) {
            sender.replaceTrack(newVideoTrack)
          } else {
            connection.addTrack(newVideoTrack, localStream.value!)
          }
          createOfferSafe(peerId)
        })

        if (oldVideoTrack) {
          oldVideoTrack.stop()
        }

        const audioTrack = localStream.value?.getAudioTracks()[0]
        localStream.value = new MediaStream([newVideoTrack, ...(audioTrack ? [audioTrack] : [])])
        console.log('Камера успешно переключена')
      } catch (error) {
        console.error('Не удалось переключить камеру:', error)
      }
    }

  // Переключить микрофон
  async function switchMicrophone(deviceId: string) {
      try {
        if (!localStream.value) {
          console.warn('Локальный поток отсутствует — невозможно переключить микрофон')
          return
        }

        const newStream = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: { deviceId: { exact: deviceId } },
        })

        const newAudioTrack = newStream.getAudioTracks()[0]
        if (!newAudioTrack) return
        newAudioTrack.contentHint = 'speech'

        const oldAudioTrack = localStream.value.getAudioTracks()[0]

        peers.value.forEach(({ connection }) => {
          const sender = connection.getSenders().find((s) => s.track && s.track.kind === 'audio')
          if (sender) sender.replaceTrack(newAudioTrack)
        })

        if (oldAudioTrack) {
          oldAudioTrack.stop()
        }

        const videoTracks = localStream.value.getVideoTracks()
        localStream.value = new MediaStream([newAudioTrack, ...videoTracks])

        console.log('Микрофон успешно переключён')
      } catch (error) {
        console.error('Не удалось переключить микрофон:', error)
      }
    }

  // Заменить видео-трек у всех пиров
  async function replaceVideoTrackInPeers(newTrack: MediaStreamTrack | null) {
      peers.value.forEach(({ connection }, peerId) => {
        const videoSenders = connection.getSenders().filter((s) => s.track?.kind === 'video')
        if (videoSenders.length > 0) {
          const sender = videoSenders[0]
          if (newTrack) {
            sender.replaceTrack(newTrack)
          } else {
            connection.removeTrack(sender)
          }
        } else if (newTrack && localStream.value) {
          connection.addTrack(newTrack, localStream.value)
        }
        createOfferSafe(peerId)
      })
    }

  // Отправить состояние конкретному пиру
  function broadcastStateTo(peerId: string, state: Record<string, any>) {
    const peer = peers.value.get(peerId)
    if (!peer) {
      console.warn(`Пир ${peerId} не найден для отправки состояния`)
      return
    }

    const json = JSON.stringify(state)
    if (peer.dataChannel?.readyState === 'open') {
      console.log('Отправляю состояние пиру', peerId, ':', state)
      peer.dataChannel.send(json)
    } else {
      console.warn(
        'Нельзя отправить состояние пиру',
        peerId,
        ': dataChannel не открыт (readyState:',
        peer.dataChannel?.readyState,
        ')',
      )
      // Пытаемся отправить позже, когда канал откроется
      const checkInterval = setInterval(() => {
        if (peer.dataChannel?.readyState === 'open') {
          console.log('DataChannel открыт, отправляю состояние пиру', peerId)
          peer.dataChannel.send(json)
          clearInterval(checkInterval)
        } else if (peer.dataChannel?.readyState === 'closed') {
          clearInterval(checkInterval)
        }
      }, 100)

      // Очищаем интервал через 5 секунд
      setTimeout(() => clearInterval(checkInterval), 5000)
    }
  }

  // Отправить состояние всем пирам
  function broadcastState(state: Record<string, any>) {
    const json = JSON.stringify(state)
    console.log('Отправляю состояние всем пирам:', state, 'Количество пиров:', peers.value.size)
    peers.value.forEach((peer, peerId) => {
      if (peer.dataChannel?.readyState === 'open') {
        console.log('Отправляю состояние пиру', peerId)
        peer.dataChannel.send(json)
      } else {
        console.warn(
          'Пропускаю пира',
          peerId,
          ': dataChannel не открыт (readyState:',
          peer.dataChannel?.readyState,
          ')',
        )
        // Пытаемся отправить позже через broadcastStateTo
        broadcastStateTo(peerId, state)
      }
    })
  }

  // Включить/выключить медиа (видео/микрофон)
  async function toggleMedia(videoEnable: boolean, microphoneEnable: boolean, deviceId: string) {
    // Сохраняем предыдущее состояние для возможного восстановления при ошибке
    const previousState = { ...localState.value }
    try {
      // Обновляем локальное состояние
      localState.value = { video: videoEnable, microphone: microphoneEnable }
      console.log('Обновлено локальное состояние:', localState.value)

      if (!localStream.value) {
        console.warn('Локальный поток отсутствует, пропускаю переключение медиа')
        return
      }

      // Определяем, что именно изменилось
      const videoChanged = previousState.video !== videoEnable
      const microphoneChanged = previousState.microphone !== microphoneEnable

      // Если видео включено, но нет videoTrack — создаём его
      // Только если видео действительно включилось (было выключено, стало включено)
      if (videoEnable && videoChanged && localStream.value.getVideoTracks().length === 0) {
        const newVideoStream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: deviceId } },
          audio: false,
        })
        const newVideoTrack = newVideoStream.getVideoTracks()[0]

        console.log('Добавляю новый видеотрек пирам', newVideoTrack)

        if (newVideoTrack) {
          // Сохраняем существующие треки (особенно аудио)
          const existingAudioTracks = localStream.value.getAudioTracks()
          const existingVideoTracks = localStream.value.getVideoTracks()
          
          // Добавляем новый видео-трек в существующий стрим вместо пересоздания
          localStream.value.addTrack(newVideoTrack)
          
          // Останавливаем старые видео-треки, если они есть
          existingVideoTracks.forEach(track => {
            track.stop()
            localStream.value?.removeTrack(track)
          })
          
          await replaceVideoTrackInPeers(newVideoTrack)
        }
      }

      // Обновляем enable для треков, если они есть
      // Важно: не пересоздаем стрим, только меняем состояние треков
      // Это безопасная операция, которая не нарушает соединения
      const videoTracks = localStream.value.getVideoTracks()
      const audioTracks = localStream.value.getAudioTracks()
      
      // Обновляем видео-треки только если видео действительно изменилось
      if (videoChanged && videoTracks.length > 0) {
        videoTracks.forEach((track) => {
          if (track.enabled !== videoEnable) {
            track.enabled = videoEnable
          }
        })
      }
      
      // Обновляем аудио-треки только если микрофон действительно изменился
      if (microphoneChanged && audioTracks.length > 0) {
        audioTracks.forEach((track) => {
          if (track.enabled !== microphoneEnable) {
            track.enabled = microphoneEnable
          }
        })
      }

      // Отправляем состояние всем пирам через data channel
      // Это не требует реинициализации соединений
      const stateToSend = { video: videoEnable, microphone: microphoneEnable }
      console.log('Отправляю состояние всем пирам:', stateToSend)
      broadcastState(stateToSend)
      console.log('Переключены медиа — видео:', videoEnable, 'микрофон:', microphoneEnable)
    } catch (err) {
      console.error('Не удалось переключить медиа:', err)
      // Восстанавливаем предыдущее состояние при ошибке
      localState.value = previousState
    }
  }

  // Начало демонстрации экрана
  async function startScreenShare() {
      try {
        if (isScreenSharing.value) {
          console.warn('Экран уже транслируется')
          return
        }

        console.log('Запускаю демонстрацию экрана...')

        // Получаем экран
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        })

        const screenVideoTrack = screenStream.getVideoTracks()[0]
        if (!screenVideoTrack) throw new Error('Нет видеотрека для экрана')
        const screenAudioTrack = screenStream.getAudioTracks()[0] || null
        if (screenAudioTrack) {
          screenAudioTrack.contentHint = 'screen'
        }

        // Сохраняем текущие локальные треки для восстановления
        previousVideoTrack = localStream.value?.getVideoTracks()[0] || null
        previousAudioTrack = localStream.value?.getAudioTracks()[0] || null
        screenShareStream = screenStream
        activeScreenAudioTrack = screenAudioTrack

        const composedStream = new MediaStream([
          screenVideoTrack,
          ...(previousAudioTrack ? [previousAudioTrack] : []),
        ])
        composedStream
          .getAudioTracks()
          .filter((track) => track !== screenAudioTrack)
          .forEach((track) => (track.contentHint = 'speech'))
        localStream.value = composedStream
        localStream.value.getVideoTracks().forEach((track) => (track.enabled = true))
        localStream.value
          .getAudioTracks()
          .forEach((track) => (track.enabled = localState.value.microphone))

        // Обновляем треки у всех пиров
        peers.value.forEach(({ connection }, peerId) => {
          // Видео
          const videoSender = connection.getSenders().find((s) => s.track?.kind === 'video')
          if (videoSender) videoSender.replaceTrack(screenVideoTrack)
          else connection.addTrack(screenVideoTrack, composedStream)

          if (screenAudioTrack) {
            const existingSender = screenAudioSenders.get(peerId)
            if (existingSender) {
              try {
                connection.removeTrack(existingSender.sender)
              } catch (error) {
                console.warn('Не удалось удалить предыдущий аудио-сендер экрана:', error)
              }
              existingSender.track.stop()
              screenAudioSenders.delete(peerId)
            }

            const clonedTrack = screenAudioTrack.clone()
            clonedTrack.contentHint = 'screen'
            const senderStream = new MediaStream([clonedTrack])
            const sender = connection.addTrack(clonedTrack, senderStream)
            screenAudioSenders.set(peerId, { sender, track: clonedTrack })
          }

          createOfferSafe(peerId)
        })

        // Обработчик окончания демонстрации экрана
        screenVideoTrack.onended = stopScreenShare
        if (screenAudioTrack) {
          screenAudioTrack.onended = stopScreenShare
        }

        isScreenSharing.value = true
        console.log('Демонстрация экрана запущена')
      } catch (err) {
        console.error('Не удалось запустить демонстрацию экрана:', err)
      }
    }

  // Остановка демонстрации экрана
  async function stopScreenShare() {
      try {
        if (!isScreenSharing.value) return
        console.log('Останавливаю демонстрацию экрана...')

        // Останавливаем треки экрана
        if (screenShareStream) {
          screenShareStream.getTracks().forEach((track) => track.stop())
          screenShareStream = null
        }
        activeScreenAudioTrack = null

        screenAudioSenders.forEach(({ sender, track }, peerId) => {
          const peer = peers.value.get(peerId)
          if (peer) {
            try {
              peer.connection.removeTrack(sender)
            } catch (error) {
              console.warn('Не удалось удалить аудио-сендер экрана при остановке:', error)
            }
          }
          track.stop()
        })
        screenAudioSenders.clear()

        // Восстанавливаем камеру
        const restoredTracks: MediaStreamTrack[] = []
        if (previousVideoTrack) restoredTracks.push(previousVideoTrack)
        if (previousAudioTrack) restoredTracks.push(previousAudioTrack)

        const restoredStream = new MediaStream(restoredTracks)
        restoredStream.getAudioTracks().forEach((track) => (track.contentHint = 'speech'))
        localStream.value = restoredStream
        localStream.value
          .getVideoTracks()
          .forEach((track) => (track.enabled = localState.value.video))
        localStream.value
          .getAudioTracks()
          .forEach((track) => (track.enabled = localState.value.microphone))

        // Заменяем треки у всех пиров обратно
        peers.value.forEach(({ connection }, peerId) => {
          // Видео
          const videoSender = connection.getSenders().find((s) => s.track?.kind === 'video')
          if (videoSender && previousVideoTrack) videoSender.replaceTrack(previousVideoTrack)

          createOfferSafe(peerId)
        })

        previousVideoTrack = null
        previousAudioTrack = null
        isScreenSharing.value = false

        console.log('Демонстрация экрана остановлена, камера и микрофон восстановлены')
      } catch (err) {
        console.error('Не удалось остановить демонстрацию экрана:', err)
      }
    }

  // Отслеживать, говорит ли локальный пользователь
  function monitorLocalSpeaking(stream: MediaStream | null) {
    if (!stream) return

    const audioContext = new AudioContext()
    const source = audioContext?.createMediaStreamSource(stream)
    const analyser = audioContext?.createAnalyser()
    source.connect(analyser)

    analyser.fftSize = 512
    const dataArray = new Uint8Array(analyser.frequencyBinCount)

    function checkSpeaking() {
      analyser.getByteFrequencyData(dataArray)
      const volume = dataArray.reduce((a, b) => a + b, 0) / dataArray.length

      isLocalSpeaking.value = volume > 5 // порог для "говорящего"

      requestAnimationFrame(checkSpeaking)
    }

    checkSpeaking()
  }

  const peerAudioContexts: Record<string, AudioContext> = {}

  // Отслеживать, говорит ли пир
  function monitorSpeaking(peerId: string, stream: MediaStream) {
    const audioContext = new AudioContext()
    const source = audioContext?.createMediaStreamSource(stream)
    const analyser = audioContext?.createAnalyser()
    source.connect(analyser)

    analyser.fftSize = 512
    const dataArray = new Uint8Array(analyser.frequencyBinCount)

    function checkSpeaking() {
      analyser.getByteFrequencyData(dataArray)
      const volume = dataArray.reduce((a, b) => a + b, 0) / dataArray.length

      speakingPeers.value[peerId] = volume > 5 // порог для "говорящего"

      requestAnimationFrame(checkSpeaking)
    }

    checkSpeaking()
  }

  // Очистка при размонтировании компонента
  onUnmounted(() => {
    leaveRoom()
    stopMedia()
  })

  return {
    // Состояния
    localStream,
    remotePeers,
    peers,
    peerStates,
    peerPlayback,
    peerAudioStreams,
    videoDevices,
    audioDevices,
    isMediaInitialized,
    isScreenSharing,
    speakingPeers,
    isLocalSpeaking,

    // Методы
    fetchVideoDevices,
    fetchAudioDevices,
    initializeMedia,
    stopMedia,
    replaceVideoTrackInPeers,
    joinRoomWithMedia,
    leaveRoom,
    createOffer,
    removePeer,
    setPeerVolume,
    setPeerMuted,

    // Переключение устройств
    switchCamera,
    switchMicrophone,
    toggleMedia,

    // Совместное использование экрана
    startScreenShare,
    stopScreenShare,
  }
  
}
