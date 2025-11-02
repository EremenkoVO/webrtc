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

// Define a more specific type for peer states
interface PeerState {
  video?: boolean
  microphone?: boolean
  [key: string]: any
}

export function useWebRTC() {
  const signalingStore = useSignalingStore()

  // State
  const localStream = ref<MediaStream | null>(null)
  const localState = ref({ video: false, microphone: true })
  const peers = ref<Map<string, PeerConnection>>(new Map())
  const speakingPeers = ref<Record<string, boolean>>({})
  const isMediaInitialized = ref(false)
  const isScreenSharing = ref(false)
  const isLocalSpeaking = ref(false)
  const peerStates = ref<Record<string, PeerState>>({})
  const audioContextRef = ref<AudioContext | null>(null)
  const analyserRef = ref<AnalyserNode | null>(null)
  const animationFrameId = ref<number | null>(null)

  // ICE configuration
  const iceConfiguration: RTCConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      {
        urls: 'turn:176.108.251.198:3478?transport=udp',
        username: 'webrtc',
        credential: import.meta.env.VITE_PASS_STUN_SERVERS as string,
      },
    ],
  }

  // Computed
  const remotePeers = computed(() => Array.from(peers.value.values()))

  const videoDevices = ref<MediaDeviceInfo[]>([])
  const audioDevices = ref<MediaDeviceInfo[]>([])
  let previousVideoTrack: MediaStreamTrack | null = null

  // Fetch available media devices
  async function fetchVideoDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      videoDevices.value = devices.filter((device) => device.kind === 'videoinput')
    } catch (error) {
      console.error('Failed to fetch video devices:', error)
    }
  }

  async function fetchAudioDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      audioDevices.value = devices.filter((device) => device.kind === 'audioinput')
    } catch (error) {
      console.error('Failed to fetch audio devices:', error)
    }
  }

  // Initialize local media (camera and microphone)
  async function initializeMedia(
    constraints: MediaStreamConstraints = {
      video: false,
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    },
  ) {
    try {
      // Stop existing tracks before initializing new ones
      if (localStream.value) {
        localStream.value.getTracks().forEach((track) => track.stop())
      }

      localStream.value = await navigator.mediaDevices.getUserMedia(constraints)
      isMediaInitialized.value = true

      if (constraints.audio) monitorLocalSpeaking(localStream.value)

      console.log('Local media initialized:', localStream.value)
      return localStream.value
    } catch (error) {
      console.error('Failed to get local media:', error)
      throw error
    }
  }

  // Stop local media
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

  // Create a peer connection
  function createPeerConnection(peerId: string): RTCPeerConnection {
    const pc = new RTCPeerConnection(iceConfiguration)

    // Create data channel
    const dataChannel = pc.createDataChannel('state-channel')
    setupDataChannel(peerId, dataChannel)

    // Add local stream tracks to the connection
    if (localStream.value) {
      localStream.value.getTracks().forEach((track) => {
        pc.addTrack(track, localStream.value!)
      })
    } else {
      console.warn('No local stream when creating connection')
    }

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('Sending ICE candidate to', peerId)
        signalingStore.sendIceCandidate(peerId, event.candidate)
      }
    }

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      console.log(`Connection state with ${peerId}:`, pc.connectionState)

      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        removePeer(peerId)
      }
    }

    // Handle ICE connection state changes
    // После добавления видео-трека инициируем renegotiation для всех пиров
    peers.value.forEach((_, peerId) => {
      createOffer(peerId)
    })
    pc.oniceconnectionstatechange = () => {
      console.log(`ICE connection state with ${peerId}:`, pc.iceConnectionState)
    }

    // Handle remote stream
    const remoteStream = new MediaStream()
    pc.ontrack = (event) => {
      console.log('📡 Received track from', peerId, event.track.kind)
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
          console.log(`👤 New peer ${peerId} with stream`, stream)
        } else {
          // После удаления видео-трека инициируем renegotiation для всех пиров
          peers.value.forEach((_, peerId) => {
            createOffer(peerId)
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

      // вызывать при "размьюте" — когда пир включает видео без renegotiation
      event.track.onunmute = () => {
        console.log(`🔊 Track ${event.track.kind} for ${peerId} unmuted, refreshing`)
        updateStream()
      }

      // и сразу при первом включении
      if (!event.track.muted) {
        updateStream()
      }
    }

    pc.ondatachannel = (event) => {
      console.log('Data channel received from', peerId)
      setupDataChannel(peerId, event.channel)
    }

    // Store the peer connection
    const newPeer: PeerConnection = {
      peerId,
      connection: pc,
      remoteStream,
      room_mates: signalingStore.room_mates,
      dataChannel,
    }

    peers.value.set(peerId, newPeer)

    return pc
  }

  function handlePeerState(peerId: string, state: Record<string, any>) {
    peerStates.value = {
      ...peerStates.value,
      [peerId]: {
        ...(peerStates.value[peerId] || {}),
        ...state,
      },
    }

    // Если видео включено/выключено, вызываем соответствующую логику
    if ('video' in state) {
      updateRemoteVideo(peerId, state.video)
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
        `Peer ${peerId} remote stream updated. Video tracks: ${newStream.getVideoTracks().length}`,
      )
    }
  }

  function updateRemoteVideo(peerId: string, enabled: boolean) {
    const peer = peers.value.get(peerId)
    if (!peer || !peer.remoteStream) {
      console.warn(`Peer ${peerId} or remoteStream not found for video update.`)
      return
    }

    const currentVideoTracks = peer.remoteStream.getVideoTracks()
    const hasVideoTrack = currentVideoTracks.length > 0

    if (enabled && !hasVideoTrack) {
      console.log(`Requesting renegotiation to add video track for peer ${peerId}`)
      createOffer(peerId)
    }
  }

  function setupDataChannel(peerId: string, channel: RTCDataChannel) {
    channel.onopen = () => {
      console.log('DataChannel open with', peerId)
      // Отправляем своё состояние при открытии канала
      broadcastStateTo(peerId, localState.value)
    }
    channel.onclose = () => console.log('DataChannel closed with', peerId)
    channel.onerror = (err) => console.error('DataChannel error', err)
    channel.onmessage = (event) => {
      console.log('DataChannel message')
      try {
        const data = JSON.parse(event.data)
        handlePeerState(peerId, data)
      } catch {
        console.warn('Invalid data from peer', event.data)
      }
    }
  }

  // Create and send offer to a peer
  async function createOffer(peerId: string) {
    try {
      const pc = peers.value.get(peerId)?.connection || createPeerConnection(peerId)

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      console.log('Created offer for', peerId)
      signalingStore.sendOffer(peerId, offer)

      // Update peer object in Map to ensure reactivity and latest local stream
      const peer = peers.value.get(peerId)

      if (peer) {
        console.log('Creating offer, updating peer:', peer.remoteStream?.getVideoTracks())

        peers.value.set(peerId, {
          ...peer,
          connection: pc,
          remoteStream: peer.remoteStream,
        })

        console.log('Updated peer after creating offer:', peers.value.get(peerId))
      }
    } catch (error) {
      console.error('Failed to create offer:', error)
      throw error
    }
  }

  // Handle incoming offer
  async function handleOffer(peerId: string, offer: RTCSessionDescriptionInit) {
    try {
      console.log('Handling offer from', peerId)

      const pc = peers.value.get(peerId)?.connection || createPeerConnection(peerId)

      await pc.setRemoteDescription(new RTCSessionDescription(offer))

      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)

      console.log('Created answer for', peerId)
      signalingStore.sendAnswer(peerId, answer)
    } catch (error) {
      console.error('Failed to handle offer:', error)
      throw error
    }
  }

  // Handle incoming answer
  async function handleAnswer(peerId: string, answer: RTCSessionDescriptionInit) {
    try {
      console.log('Handling answer from', peerId)

      const peer = peers.value.get(peerId)
      if (!peer) {
        console.error('No peer connection found for', peerId)
        return
      }

      // Only set remote answer if signalingState is 'have-local-offer'
      if (peer.connection.signalingState === 'have-local-offer') {
        await peer.connection.setRemoteDescription(new RTCSessionDescription(answer))
      } else {
        console.warn(
          `Peer ${peerId} signalingState is '${peer.connection.signalingState}', not expecting answer. Skipping setRemoteDescription.`,
        )
      }
    } catch (error) {
      console.error('Failed to handle answer:', error)
      throw error
    }
  }

  // Handle incoming ICE candidate
  async function handleIceCandidate(peerId: string, candidate: RTCIceCandidateInit) {
    try {
      console.log('Handling ICE candidate from', peerId)

      const peer = peers.value.get(peerId)
      if (!peer) {
        console.error('No peer connection found for', peerId)
        return
      }

      await peer.connection.addIceCandidate(new RTCIceCandidate(candidate))
    } catch (error) {
      console.error('Failed to handle ICE candidate:', error)
      throw error
    }
  }

  // Remove a peer connection
  function removePeer(peerId: string) {
    const peer = peers.value.get(peerId)
    if (peer) {
      peer.connection.close()
      peers.value.delete(peerId)
      delete speakingPeers.value[peerId]
      delete peerStates.value[peerId]

      if (peerAudioContexts[peerId]) {
        peerAudioContexts[peerId].close()
        delete peerAudioContexts[peerId]
      }

      console.log('Removed peer:', peerId)
    }
  }

  // Setup signaling handlers
  function setupSignalingHandlers() {
    // Handle peer joined - initiate connection
    signalingStore.onMessage(SignalingMessage.type.PEER_JOINED, (message) => {
      if (message.from && message.from !== signalingStore.clientId) {
        console.log('Existing peer creating offer to new peer:', message.from)
        createOffer(message.from)
        // сразу отправим своё текущее состояние
        setTimeout(() => {
          if (message.from) broadcastStateTo(message.from, localState.value)
        }, 1000)
      }
    })

    // Handle offer
    signalingStore.onMessage(SignalingMessage.type.OFFER, (message) => {
      if (message.from && message.payload && 'sdp' in message.payload) {
        handleOffer(message.from, {
          type: 'offer',
          sdp: message.payload.sdp,
        })
      }
    })

    // Handle answer
    signalingStore.onMessage(SignalingMessage.type.ANSWER, (message) => {
      if (message.from && message.payload && 'sdp' in message.payload) {
        handleAnswer(message.from, {
          type: 'answer',
          sdp: message.payload.sdp,
        })
      }
    })

    // Handle ICE candidate
    signalingStore.onMessage(SignalingMessage.type.ICE, (message) => {
      if (message.from && message.payload && 'candidate' in message.payload) {
        handleIceCandidate(message.from, {
          candidate: message.payload.candidate,
          sdpMid: message.payload.sdpMid,
          sdpMLineIndex: message.payload.sdpMLineIndex,
        })
      }
    })

    // Handle peer left
    signalingStore.onMessage(SignalingMessage.type.LEAVE, (message) => {
      if (message.from) {
        console.log('Peer left:', message.from)
        removePeer(message.from)
      }
    })
  }

  // Join a room with WebRTC
  async function joinRoomWithMedia(
    roomId: string,
    username?: string,
    mediaConstraints?: MediaStreamConstraints,
  ) {
    try {
      // Initialize media only if not already initialized
      if (!isMediaInitialized.value) {
        await initializeMedia(mediaConstraints)
      }

      setupSignalingHandlers()

      if (!signalingStore.isConnected) {
        await signalingStore.connect()
      }

      signalingStore.joinRoom(roomId, username)
      console.log('Joined room with WebRTC:', roomId)
    } catch (error) {
      console.error('Failed to join room with media:', error)
      throw error
    }
  }

  // Leave room and cleanup
  function leaveRoom() {
    // Close all peer connections
    peers.value.forEach(({ connection }, peerId) => {
      connection.close()
      console.log('Closed connection with peer:', peerId)
    })

    // Очистить объект
    peers.value.clear()

    // Leave signaling room
    signalingStore.leaveRoom()

    // Clear signaling handlers
    signalingStore.clearHandlers()

    // Reset speaking states
    speakingPeers.value = {}
    peerStates.value = {}

    localState.value = { video: false, microphone: true }

    console.log('Left room')
  }

  // Switch camera
  async function switchCamera(deviceId: string) {
    try {
      if (!localStream.value) {
        console.warn('No local stream — cannot switch camera')
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
        if (sender) sender.replaceTrack(newVideoTrack)
        createOffer(peerId)
      })

      if (oldVideoTrack) {
        oldVideoTrack.stop()
      }

      const audioTrack = localStream.value?.getAudioTracks()[0]
      localStream.value = new MediaStream([newVideoTrack, ...(audioTrack ? [audioTrack] : [])])
      console.log('Camera switched successfully')
    } catch (error) {
      console.error('Failed to switch camera:', error)
    }
  }

  // Switch microphone
  async function switchMicrophone(deviceId: string) {
    try {
      if (!localStream.value) {
        console.warn('No local stream — cannot switch microphone')
        return
      }

      const newStream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: { deviceId: { exact: deviceId } },
      })

      const newAudioTrack = newStream.getAudioTracks()[0]
      if (!newAudioTrack) return

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

      console.log('Microphone switched successfully')
    } catch (error) {
      console.error('Failed to switch microphone:', error)
    }
  }

  async function replaceVideoTrackInPeers(newTrack: MediaStreamTrack | null) {
    peers.value.forEach(({ connection }) => {
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
    })
  }

  function broadcastStateTo(peerId: string, state: Record<string, any>) {
    const peer = peers.value.get(peerId)
    const json = JSON.stringify(state)
    if (peer?.dataChannel?.readyState === 'open') {
      peer.dataChannel.send(json)
    } else {
      console.warn(`Cannot send state to ${peerId}, dataChannel not open`)
    }
  }

  function broadcastState(state: Record<string, any>) {
    const json = JSON.stringify(state)
    peers.value.forEach(({ dataChannel }) => {
      if (dataChannel?.readyState === 'open') {
        dataChannel.send(json)
      }
    })
  }

  async function toggleMedia(videoEnable: boolean, microphoneEnable: boolean, deviceId: string) {
    try {
      localState.value = { video: videoEnable, microphone: microphoneEnable }

      // Если видео включено, но нет videoTrack — создаём его
      if (videoEnable && localStream.value?.getVideoTracks().length === 0) {
        const newVideoStream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: deviceId } },
          audio: false,
        })
        const newVideoTrack = newVideoStream.getVideoTracks()[0]

        console.log('Adding new video track to peers', newVideoTrack)

        if (newVideoTrack) {
          const audioTrack = localStream.value?.getAudioTracks()[0]
          localStream.value = new MediaStream([newVideoTrack, ...(audioTrack ? [audioTrack] : [])])
          await replaceVideoTrackInPeers(newVideoTrack)
          // обязательно вызвать renegotiation
          peers.value.forEach((_, peerId) => createOffer(peerId))
        }
      }

      // обновляем enable для треков, если они есть
      localStream.value?.getVideoTracks().forEach((track) => (track.enabled = videoEnable))
      localStream.value?.getAudioTracks().forEach((track) => (track.enabled = microphoneEnable))

      broadcastState({ video: videoEnable, microphone: microphoneEnable })
      console.log('Toggled media - Video:', videoEnable, 'Microphone:', microphoneEnable)
    } catch (err) {
      console.error('Failed to toggle media:', err)
    }
  }

  // Start screen sharing
  async function startScreenShare() {
    try {
      if (isScreenSharing.value) {
        console.warn('Already sharing screen')
        return
      }
      console.log('Starting screen share...')
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      })
      const screenTrack = screenStream.getVideoTracks()[0]
      if (!screenTrack) throw new Error('No screen video track')

      // Save current video track for restoration
      previousVideoTrack = localStream.value?.getVideoTracks()[0] || null

      peers.value.forEach(({ connection }) => {
        const sender = connection.getSenders().find((s) => s.track && s.track.kind === 'video')
        if (sender) sender.replaceTrack(screenTrack)
      })

      // Update local stream
      const audioTrack = localStream.value?.getAudioTracks()[0]
      localStream.value = new MediaStream([screenTrack, ...(audioTrack ? [audioTrack] : [])])
      isScreenSharing.value = true

      // When user stops screen sharing
      screenTrack.onended = () => {
        console.log('Screen sharing stopped by user')
        stopScreenShare()
      }
      console.log('Screen sharing started')
    } catch (err) {
      console.error('Failed to start screen share:', err)
    }
  }

  async function stopScreenShare() {
    try {
      if (!isScreenSharing.value) return
      console.log('Stopping screen share...')

      // Restore previous video track if available
      if (previousVideoTrack) {
        peers.value.forEach(({ connection }) => {
          const sender = connection.getSenders().find((s) => s.track && s.track.kind === 'video')
          if (sender) sender.replaceTrack(previousVideoTrack)
        })

        const audioTrack = localStream.value?.getAudioTracks()[0]
        localStream.value = new MediaStream([
          previousVideoTrack,
          ...(audioTrack ? [audioTrack] : []),
        ])
        previousVideoTrack = null
      }
      isScreenSharing.value = false
      console.log('Screen share stopped and camera restored')
    } catch (err) {
      console.error('Failed to stop screen share:', err)
    }
  }

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

  // Cleanup on unmount
  onUnmounted(() => {
    leaveRoom()
    stopMedia()
  })

  return {
    // State
    localStream,
    remotePeers,
    peers,
    peerStates,
    videoDevices,
    audioDevices,
    isMediaInitialized,
    isScreenSharing,
    speakingPeers,
    isLocalSpeaking,

    // Actions
    fetchVideoDevices,
    fetchAudioDevices,
    initializeMedia,
    stopMedia,
    replaceVideoTrackInPeers,
    joinRoomWithMedia,
    leaveRoom,
    createOffer,
    removePeer,

    // Switch devices
    switchCamera,
    switchMicrophone,
    toggleMedia,

    // Screen sharing
    startScreenShare,
    stopScreenShare,
  }
}
