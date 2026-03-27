/* eslint-disable @typescript-eslint/no-explicit-any */
import { SignalingMessage } from '@/api/models/SignalingMessage'
import { useSignalingStore } from '@/shared/stores/signalingStore'
import { computed, ref } from 'vue'

export interface PeerConnection {
  peerId: string
  room_mates?: Record<string, string>
  connection: RTCPeerConnection
  remoteStream: MediaStream | null
  dataChannel?: RTCDataChannel
}

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

  const localStream = ref<MediaStream | null>(null)
  const localState = ref({ video: false, microphone: true, deafened: false })
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
  let localSpeakingMonitorToken = 0

  const iceConfiguration: RTCConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      { urls: 'stun:stun.stunprotocol.org:3478' },
      { urls: 'stun:stun.nextcloud.com:3478' },
    ],
  }

  const remotePeers = computed(() => Array.from(peers.value.values()))
  const videoDevices = ref<MediaDeviceInfo[]>([])
  const audioDevices = ref<MediaDeviceInfo[]>([])
  const watchingStreams = ref<Set<string>>(new Set()) // Track which screen sharing streams user is watching
  let previousVideoTrack: MediaStreamTrack | null = null
  let previousAudioTrack: MediaStreamTrack | null = null
  let screenShareStream: MediaStream | null = null
  let activeScreenAudioTrack: MediaStreamTrack | null = null
  const screenAudioSenders = new Map<string, { sender: RTCRtpSender; track: MediaStreamTrack }>()
  const renegotiationRetries = new Map<string, ReturnType<typeof setTimeout>>()
  const pendingIceCandidates = new Map<string, RTCIceCandidateInit[]>()
  let signalingHandlersSetup = false
  let mediaDeviceChangeHandler: (() => void) | null = null

  function ensurePeerPlayback(peerId: string) {
    if (!peerPlayback.value[peerId]) {
      peerPlayback.value = {
        ...peerPlayback.value,
        [peerId]: { volume: 1, muted: false },
      }
    }
  }

  function findSenderByKind(connection: RTCPeerConnection, kind: 'audio' | 'video') {
    return connection.getSenders().find((sender) => {
      if (sender.track?.kind === kind) return true
      const transceiver = connection.getTransceivers().find((t) => t.sender === sender)
      return transceiver?.receiver?.track?.kind === kind
    })
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
    peerAudioStreams.value = { ...peerAudioStreams.value, [peerId]: audioStream }
  }

  function setPeerVolume(peerId: string, rawVolume: number) {
    ensurePeerPlayback(peerId)
    const volume = Math.min(Math.max(rawVolume, 0), 1)
    peerPlayback.value = {
      ...peerPlayback.value,
      [peerId]: { ...peerPlayback.value[peerId], volume },
    }
  }

  function setDeafened(v: boolean) {
    localState.value = { ...localState.value, deafened: v }
    broadcastState({ deafened: v })
  }

  function setPeerMuted(peerId: string, muted: boolean) {
    ensurePeerPlayback(peerId)
    peerPlayback.value = {
      ...peerPlayback.value,
      [peerId]: { ...peerPlayback.value[peerId], muted },
    }
  }

  async function createOfferSafe(peerId: string) {
    const peer = peers.value.get(peerId)
    if (!peer) return
    if (peer.connection.signalingState !== 'stable') {
      if (!renegotiationRetries.has(peerId)) {
        const timer = setTimeout(() => {
          renegotiationRetries.delete(peerId)
          void createOfferSafe(peerId)
        }, 300)
        renegotiationRetries.set(peerId, timer)
      }
      return
    }
    const existingTimer = renegotiationRetries.get(peerId)
    if (existingTimer) {
      clearTimeout(existingTimer)
      renegotiationRetries.delete(peerId)
    }
    try {
      await createOffer(peerId)
    } catch (err) {
      console.error('createOfferSafe error:', err)
    }
  }

  async function ensureConnected() {
    if (signalingStore.isConnected) return
    signalingStore.connect()
    await new Promise<void>((resolve, reject) => {
      const startedAt = Date.now()
      const timer = setInterval(() => {
        if (signalingStore.isConnected) {
          clearInterval(timer)
          resolve()
          return
        }
        if (Date.now() - startedAt > 5000) {
          clearInterval(timer)
          reject(new Error('Signaling websocket connect timeout'))
        }
      }, 100)
    })
  }

  async function fetchVideoDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      videoDevices.value = devices.filter((d) => d.kind === 'videoinput')
    } catch (error) {
      console.error('Failed to enumerate video devices:', error)
    }
  }

  async function fetchAudioDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      audioDevices.value = devices.filter((d) => d.kind === 'audioinput')
    } catch (error) {
      console.error('Failed to enumerate audio devices:', error)
    }
  }

  function cleanupLocalSpeakingMonitor() {
    localSpeakingMonitorToken += 1
    if (animationFrameId.value) {
      cancelAnimationFrame(animationFrameId.value)
      animationFrameId.value = null
    }
    if (audioContextRef.value) {
      audioContextRef.value.close().catch(() => undefined)
      audioContextRef.value = null
    }
    analyserRef.value = null
    isLocalSpeaking.value = false
  }

  function isCameraConstraintError(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false
    const name = (error as { name?: string }).name ?? ''
    return (
      name === 'OverconstrainedError' ||
      name === 'ConstraintNotSatisfiedError' ||
      name === 'NotFoundError' ||
      name === 'DevicesNotFoundError'
    )
  }

  async function getVideoStreamWithFallback(preferredDeviceId?: string) {
    await fetchVideoDevices()
    const canUsePreferred =
      !!preferredDeviceId && videoDevices.value.some((d) => d.deviceId === preferredDeviceId)

    const attempts: Array<MediaTrackConstraints | true> = []
    if (canUsePreferred && preferredDeviceId) {
      attempts.push({ deviceId: { exact: preferredDeviceId } })
      attempts.push({ deviceId: { ideal: preferredDeviceId } })
    }
    attempts.push(true)

    let lastError: unknown
    for (const videoConstraints of attempts) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: false,
        })
        return stream
      } catch (error) {
        lastError = error
        if (!isCameraConstraintError(error)) throw error
      }
    }
    throw lastError
  }

  function setupDeviceChangeListener() {
    if (mediaDeviceChangeHandler || !navigator.mediaDevices?.addEventListener) return
    mediaDeviceChangeHandler = async () => {
      await fetchAudioDevices()
      await fetchVideoDevices()
    }
    navigator.mediaDevices.addEventListener('devicechange', mediaDeviceChangeHandler)
  }

  async function initializeMedia(
    constraints: MediaStreamConstraints = {
      video: false,
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    },
  ) {
    try {
      if (localStream.value) {
        localStream.value.getTracks().forEach((track) => track.stop())
      }
      localStream.value = await navigator.mediaDevices.getUserMedia(constraints)
      localStream.value
        .getAudioTracks()
        .forEach((track) => (track.contentHint = track.contentHint || 'speech'))
      isMediaInitialized.value = true
      if (constraints.audio) monitorLocalSpeaking(localStream.value)
      return localStream.value
    } catch (error) {
      console.error('Failed to get local media:', error)
      throw error
    }
  }

  function stopMedia() {
    if (localStream.value) {
      localStream.value.getTracks().forEach((track) => track.stop())
      localStream.value = null
      isMediaInitialized.value = false
      cleanupLocalSpeakingMonitor()
    }
    if (mediaDeviceChangeHandler && navigator.mediaDevices?.removeEventListener) {
      navigator.mediaDevices.removeEventListener('devicechange', mediaDeviceChangeHandler)
      mediaDeviceChangeHandler = null
    }
  }

  function createPeerConnection(peerId: string): RTCPeerConnection {
    const pc = new RTCPeerConnection(iceConfiguration)
    const dataChannel = pc.createDataChannel('state-channel')
    setupDataChannel(peerId, dataChannel)

    if (localStream.value) {
      localStream.value.getTracks().forEach((track) => pc.addTrack(track, localStream.value!))
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) signalingStore.sendIceCandidate(peerId, event.candidate)
    }

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') removePeer(peerId)
    }
    pc.onnegotiationneeded = () => {
      void createOfferSafe(peerId)
    }

    const remoteStream = new MediaStream()
    pc.ontrack = (event) => {
      const [stream] = event.streams
      if (!stream) return
      
      // Log track information for debugging
      if (event.track.kind === 'audio') {
        console.log(`[ontrack] Audio track received from ${peerId}:`, {
          trackId: event.track.id,
          label: event.track.label,
          contentHint: event.track.contentHint,
          enabled: event.track.enabled,
          muted: event.track.muted,
          streamId: stream.id,
          streamHasVideo: stream.getVideoTracks().length > 0,
          streamHasOnlyAudio: stream.getAudioTracks().length === 1 && stream.getVideoTracks().length === 0,
          streamTracks: stream.getTracks().map(t => ({ kind: t.kind, id: t.id, contentHint: t.contentHint }))
        })
      }
      
      const updateStream = () => {
        const existingPeer = peers.value.get(peerId)
        const isScreenSharing = peerStates.value[peerId]?.screen === true
        const isWatching = watchingStreams.value.has(peerId)
        
        // If it's a screen sharing stream and user is not watching, don't add video track
        if (event.track.kind === 'video' && isScreenSharing && !isWatching) {
          return
        }
        
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
        } else {
          peers.value.forEach((_, peerIdInner) => createOfferSafe(peerIdInner))
          const existingStream = existingPeer.remoteStream || new MediaStream()
          if (!existingStream.getTracks().includes(event.track)) {
            existingStream.addTrack(event.track)
          }
          const updatedStream = new MediaStream(existingStream.getTracks())
          updatePeerRemoteStream(peerId, updatedStream)
        }
        
        // Only monitor speaking if there are microphone tracks (not screen audio)
        // Screen audio tracks come in separate audio-only streams when peer is screen sharing
        const finalStream = existingPeer?.remoteStream || stream
        const audioTracks = finalStream.getAudioTracks()
        const isScreenSharingState = peerStates.value[peerId]?.screen === true
        
        // Filter screen audio: tracks from audio-only streams when peer is screen sharing, or tracks with screen contentHint/label
        const micTracks = audioTracks.filter(track => {
          // Find which stream this track came from
          const trackStream = event.streams.find(s => s.getAudioTracks().includes(track)) || stream
          // Use improved isScreenAudioTrack with stream context
          return !isScreenAudioTrack(track, trackStream, isScreenSharingState)
        })
        
        if (micTracks.length > 0) {
          // Create a stream with only microphone tracks for monitoring
          const micOnlyStream = new MediaStream(micTracks)
          monitorSpeaking(peerId, micOnlyStream)
        } else {
          // No microphone tracks, ensure speaking is false
          speakingPeers.value[peerId] = false
        }
      }
      if (event.track.kind === 'audio') updateStream()
      event.track.onunmute = () => updateStream()
      if (event.track.kind === 'video' && !event.track.muted) {
        // Check again if user is watching (state might have changed)
        const currentIsScreenSharing = peerStates.value[peerId]?.screen === true
        const currentIsWatching = watchingStreams.value.has(peerId)
        if (currentIsScreenSharing && !currentIsWatching) {
          console.log('[ontrack] Blocking video track for unwatched screen share:', peerId)
          return
        }
        updateStream()
      }
    }

    pc.ondatachannel = (event) => {
      const existingPeer = peers.value.get(peerId)
      if (existingPeer) {
        existingPeer.dataChannel = event.channel
        peers.value.set(peerId, { ...existingPeer, dataChannel: event.channel })
        setupDataChannel(peerId, event.channel)
      } else {
        setupDataChannel(peerId, event.channel)
      }
    }

    const newPeer: PeerConnection = {
      peerId,
      connection: pc,
      remoteStream,
      room_mates: signalingStore.room_mates,
      dataChannel,
    }
    peers.value.set(peerId, newPeer)
    ensurePeerPlayback(peerId)

    // Do not add a dedicated screen-audio sender. Keeping a single audio m-line
    // (microphone) avoids SDP m-line reordering/demuxing failures on some clients.

    return pc
  }

  function handlePeerState(peerId: string, state: Record<string, any>) {
    const newPeerStates = { ...peerStates.value }
    newPeerStates[peerId] = { ...(newPeerStates[peerId] || {}), ...state }
    peerStates.value = newPeerStates
    if ('video' in state) updateRemoteVideo(peerId, state.video)
  }

  function updatePeerRemoteStream(peerId: string, newStream: MediaStream) {
    const peer = peers.value.get(peerId)
    if (peer) {
      peer.remoteStream = newStream
      peers.value.set(peerId, peer)
      ensurePeerPlayback(peerId)
      updatePeerAudioStream(peerId, newStream)
      // Force reactivity update
      peers.value = new Map(peers.value)
    }
  }

  function updateRemoteVideo(peerId: string, enabled: boolean) {
    const peer = peers.value.get(peerId)
    if (!peer || !peer.remoteStream) return
    if (enabled && peer.remoteStream.getVideoTracks().length === 0) {
      createOfferSafe(peerId)
      return
    }
    if (!enabled) {
      // Remove stale remote video tracks immediately to avoid frozen frames.
      const audioOnlyStream = new MediaStream()
      peer.remoteStream.getAudioTracks().forEach((t) => audioOnlyStream.addTrack(t))
      updatePeerRemoteStream(peerId, audioOnlyStream)
    }
  }

  const soundEventHandlers = new Set<(eventType: string) => void>()

  function onSoundEvent(handler: (eventType: string) => void) {
    soundEventHandlers.add(handler)
    return () => soundEventHandlers.delete(handler)
  }

  function triggerSoundEvent(eventType: string) {
    soundEventHandlers.forEach(handler => {
      try {
        handler(eventType)
      } catch (error) {
        console.error('Sound event handler error:', error)
      }
    })
  }

  function setupDataChannel(peerId: string, channel: RTCDataChannel) {
    channel.onopen = () => broadcastStateTo(peerId, { ...localState.value, screen: isScreenSharing.value })
    channel.onclose = () => {}
    channel.onerror = (err) => console.error('DataChannel error', err)
    channel.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        // Check if it's a sound event
        if (data.soundEvent) {
          triggerSoundEvent(data.soundEvent)
        } else {
          // Otherwise handle as peer state
          handlePeerState(peerId, data)
        }
      } catch (error) {
        console.warn('Invalid peer data', event.data, error)
      }
    }
  }

  async function createOffer(peerId: string) {
    try {
      const pc = peers.value.get(peerId)?.connection || createPeerConnection(peerId)
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      signalingStore.sendOffer(peerId, offer)
      const peer = peers.value.get(peerId)
      if (peer) {
        peers.value.set(peerId, { ...peer, connection: pc, remoteStream: peer.remoteStream })
      }
    } catch (error) {
      console.error('Failed to create offer:', error)
      throw error
    }
  }

  async function handleOffer(peerId: string, offer: RTCSessionDescriptionInit) {
    try {
      const pc = peers.value.get(peerId)?.connection || createPeerConnection(peerId)
      await pc.setRemoteDescription(new RTCSessionDescription(offer))
      await flushPendingIceCandidates(peerId)
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      signalingStore.sendAnswer(peerId, answer)
    } catch (error) {
      console.error('Failed to handle offer:', error)
    }
  }

  async function handleAnswer(peerId: string, answer: RTCSessionDescriptionInit) {
    try {
      const peer = peers.value.get(peerId)
      if (!peer) return
      if (peer.connection.signalingState === 'have-local-offer') {
        await peer.connection.setRemoteDescription(new RTCSessionDescription(answer))
        await flushPendingIceCandidates(peerId)
      }
    } catch (error) {
      console.error('Failed to handle answer:', error)
    }
  }

  async function flushPendingIceCandidates(peerId: string) {
    const peer = peers.value.get(peerId)
    if (!peer) return
    if (!peer.connection.remoteDescription) return
    const queued = pendingIceCandidates.get(peerId)
    if (!queued || queued.length === 0) return
    pendingIceCandidates.delete(peerId)
    for (const candidate of queued) {
      try {
        await peer.connection.addIceCandidate(new RTCIceCandidate(candidate))
      } catch (error) {
        console.warn('Ignoring stale queued ICE candidate:', error)
      }
    }
  }

  async function handleIceCandidate(peerId: string, candidate: RTCIceCandidateInit) {
    try {
      const peer = peers.value.get(peerId)
      if (!peer) return
      if (!peer.connection.remoteDescription) {
        const queued = pendingIceCandidates.get(peerId) || []
        queued.push(candidate)
        pendingIceCandidates.set(peerId, queued)
        return
      }
      await peer.connection.addIceCandidate(new RTCIceCandidate(candidate))
    } catch (error) {
      // Candidate can legitimately become stale across renegotiation/restarts.
      console.warn('Ignoring stale ICE candidate:', error)
    }
  }

  function removePeer(peerId: string) {
    const peer = peers.value.get(peerId)
    if (peer) {
      peer.connection.close()
      peers.value.delete(peerId)
      delete speakingPeers.value[peerId]
      delete peerStates.value[peerId]
      if (peerPlayback.value[peerId]) {
        const copy = { ...peerPlayback.value }
        delete copy[peerId]
        peerPlayback.value = copy
      }
      if (peerAudioStreams.value[peerId]) {
        const copy = { ...peerAudioStreams.value }
        delete copy[peerId]
        peerAudioStreams.value = copy
      }
      if (peerAudioContexts[peerId]) {
        peerAudioContexts[peerId].close()
        delete peerAudioContexts[peerId]
      }
      const screenSender = screenAudioSenders.get(peerId)
      if (screenSender) {
        try {
          screenSender.sender.replaceTrack(null)
        } catch {}
        if (screenSender.track.readyState !== 'ended') {
          try {
            screenSender.track.stop()
          } catch {}
        }
        screenAudioSenders.delete(peerId)
      }
      const retryTimer = renegotiationRetries.get(peerId)
      if (retryTimer) {
        clearTimeout(retryTimer)
        renegotiationRetries.delete(peerId)
      }
      pendingIceCandidates.delete(peerId)
    }
  }

  function setupSignalingHandlers() {
    if (signalingHandlersSetup) return
    signalingHandlersSetup = true
    signalingStore.onMessage(SignalingMessage.type.PEER_JOINED, (message) => {
      if (message.from && message.from !== signalingStore.clientId) {
        createOffer(message.from)
        setTimeout(() => {
          if (message.from) broadcastStateTo(message.from, { ...localState.value, screen: isScreenSharing.value })
        }, 1000)
        triggerSoundEvent('connect')
      }
    })

    signalingStore.onMessage(SignalingMessage.type.OFFER, (message) => {
      if (message.from && message.payload && 'sdp' in message.payload) {
        handleOffer(message.from, { type: 'offer', sdp: message.payload.sdp })
      }
    })

    signalingStore.onMessage(SignalingMessage.type.ANSWER, (message) => {
      if (message.from && message.payload && 'sdp' in message.payload) {
        handleAnswer(message.from, { type: 'answer', sdp: message.payload.sdp })
      }
    })

    signalingStore.onMessage(SignalingMessage.type.ICE, (message) => {
      if (message.from && message.payload && 'candidate' in message.payload) {
        handleIceCandidate(message.from, {
          candidate: message.payload.candidate,
          sdpMid: message.payload.sdpMid,
          sdpMLineIndex: message.payload.sdpMLineIndex,
        })
      }
    })

    signalingStore.onMessage(SignalingMessage.type.LEAVE, (message) => {
      if (message.from) {
        removePeer(message.from)
        triggerSoundEvent('disconnect')
      }
    })

    signalingStore.onMessage('sound-event', (message) => {
      if (message.payload && 'type' in message.payload) {
        triggerSoundEvent(message.payload.type as string)
      }
    })
  }

  async function joinRoomWithMedia(
    roomId: string,
    username?: string,
    mediaConstraints?: MediaStreamConstraints,
  ) {
    try {
      if (!isMediaInitialized.value) await initializeMedia(mediaConstraints)
      setupDeviceChangeListener()
      setupSignalingHandlers()
      await ensureConnected()
      signalingStore.joinRoom(roomId, username)
    } catch (error) {
      console.error('Failed to join room with media:', error)
      throw error
    }
  }

  function leaveRoom() {
    // Send disconnect sound event before leaving
    broadcastSoundEvent('disconnect')
    peers.value.forEach(({ connection }) => connection.close())
    peers.value.clear()
    renegotiationRetries.forEach((timer) => clearTimeout(timer))
    renegotiationRetries.clear()
    pendingIceCandidates.clear()
    signalingStore.leaveRoom()
    signalingStore.clearHandlers()
    signalingHandlersSetup = false
    speakingPeers.value = {}
    peerStates.value = {}
    peerPlayback.value = {}
    peerAudioStreams.value = {}
    watchingStreams.value = new Set()
    localState.value = { video: false, microphone: true, deafened: false }
  }

  async function switchCamera(deviceId: string): Promise<string | null> {
    try {
      if (!localStream.value) return null
      const newStream = await getVideoStreamWithFallback(deviceId)
      const newVideoTrack = newStream.getVideoTracks()[0]
      if (!newVideoTrack) return null
      const oldVideoTrack = localStream.value.getVideoTracks()[0] || null
      const replaceOps: Promise<void>[] = []
      peers.value.forEach(({ connection }, peerId) => {
        const sender = findSenderByKind(connection, 'video')
        if (sender) replaceOps.push(sender.replaceTrack(newVideoTrack))
        else connection.addTrack(newVideoTrack, localStream.value!)
        createOfferSafe(peerId)
      })
      await Promise.allSettled(replaceOps)
      if (oldVideoTrack) oldVideoTrack.stop()
      const audioTrack = localStream.value?.getAudioTracks()[0]
      localStream.value = new MediaStream([newVideoTrack, ...(audioTrack ? [audioTrack] : [])])
      return newVideoTrack.getSettings().deviceId || null
    } catch (error) {
      console.error('Failed to switch camera:', error)
      return null
    }
  }

  async function switchMicrophone(deviceId: string) {
    try {
      if (!localStream.value) return
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: { deviceId: { exact: deviceId } },
      })
      const newAudioTrack = newStream.getAudioTracks()[0]
      if (!newAudioTrack) return
      newAudioTrack.contentHint = 'speech'
      newAudioTrack.enabled = localState.value.microphone
      const oldAudioTrack = localStream.value.getAudioTracks()[0]
      peers.value.forEach(({ connection }, peerId) => {
        const sender = findSenderByKind(connection, 'audio')
        if (sender) {
          sender.replaceTrack(newAudioTrack)
        } else {
          connection.addTrack(newAudioTrack, localStream.value!)
          createOfferSafe(peerId)
        }
      })
      if (oldAudioTrack) oldAudioTrack.stop()
      const videoTracks = localStream.value.getVideoTracks()
      localStream.value = new MediaStream([newAudioTrack, ...videoTracks])
      monitorLocalSpeaking(localStream.value)
    } catch (error) {
      console.error('Failed to switch microphone:', error)
    }
  }

  async function replaceVideoTrackInPeers(newTrack: MediaStreamTrack | null) {
    peers.value.forEach(({ connection }, peerId) => {
      const videoSender = findSenderByKind(connection, 'video')
      if (videoSender) {
        if (newTrack) {
          videoSender.replaceTrack(newTrack)
        } else {
          // Keep sender/transceiver stable to preserve SDP m-line ordering.
          videoSender.replaceTrack(null)
        }
      } else if (newTrack && localStream.value) {
        connection.addTrack(newTrack, localStream.value)
      }
      createOfferSafe(peerId)
    })
  }

  function broadcastStateTo(peerId: string, state: Record<string, any>) {
    const peer = peers.value.get(peerId)
    if (!peer) return
    const json = JSON.stringify(state)
    if (peer.dataChannel?.readyState === 'open') {
      peer.dataChannel.send(json)
    } else {
      const checkInterval = setInterval(() => {
        if (peer.dataChannel?.readyState === 'open') {
          peer.dataChannel.send(json)
          clearInterval(checkInterval)
        } else if (peer.dataChannel?.readyState === 'closed') {
          clearInterval(checkInterval)
        }
      }, 100)
      setTimeout(() => clearInterval(checkInterval), 5000)
    }
  }

  function broadcastState(state: Record<string, any>) {
    const json = JSON.stringify(state)
    peers.value.forEach((peer, peerId) => {
      if (peer.dataChannel?.readyState === 'open') {
        peer.dataChannel.send(json)
      } else {
        broadcastStateTo(peerId, state)
      }
    })
  }

  function broadcastSoundEvent(eventType: string) {
    // Send via signaling (WebSocket) as primary method
    if (signalingStore.isInRoom && signalingStore.currentRoomId) {
      signalingStore.sendEvent('sound-event', { type: eventType })
    }
    // Also try to send via data channels if available (faster, but may not be ready)
    const eventData = JSON.stringify({ soundEvent: eventType })
    peers.value.forEach((peer) => {
      if (peer.dataChannel?.readyState === 'open') {
        try {
          peer.dataChannel.send(eventData)
        } catch {}
      }
    })
  }

  function watchStream(peerId: string) {
    watchingStreams.value.add(peerId)
    triggerSoundEvent('connect')
    const peer = peers.value.get(peerId)
    if (!peer) {
      console.warn('[watchStream] Peer not found:', peerId)
      return
    }

    // Check if a live video track already exists in the connection's receivers
    const receivers = peer.connection.getReceivers()
    const videoReceiver = receivers.find(
      (r) => r.track && r.track.kind === 'video' && r.track.readyState === 'live',
    )

    if (videoReceiver?.track) {
      // Build a new MediaStream so Vue detects the change (avoid mutating the same reference)
      const existingTracks = peer.remoteStream ? peer.remoteStream.getTracks() : []
      const newStream = new MediaStream()
      // Re-add existing non-video tracks (audio)
      existingTracks
        .filter((t) => t.kind !== 'video')
        .forEach((t) => newStream.addTrack(t))
      // Add the live video track
      newStream.addTrack(videoReceiver.track)
      updatePeerRemoteStream(peerId, newStream)
      console.log('[watchStream] Composed new stream with existing video track for peer:', peerId)
    } else {
      // No live video track yet — trigger renegotiation so the sender includes it
      console.log('[watchStream] No live video track found, triggering renegotiation for peer:', peerId)
      createOfferSafe(peerId)
    }
  }

  function unwatchStream(peerId: string) {
    watchingStreams.value.delete(peerId)
    const peer = peers.value.get(peerId)
    if (peer && peer.remoteStream) {
      // Build a new MediaStream with only audio tracks (drop video so the tile disappears).
      // Do NOT stop the video tracks — the sender keeps them alive and they can be reused
      // if the user clicks Watch again.
      const audioOnlyStream = new MediaStream()
      peer.remoteStream.getAudioTracks().forEach((t) => audioOnlyStream.addTrack(t))
      updatePeerRemoteStream(peerId, audioOnlyStream)
      console.log('[unwatchStream] Replaced remote stream with audio-only for peer:', peerId)
    }
  }

  async function toggleMedia(videoEnable: boolean, microphoneEnable: boolean, deviceId: string) {
    const previousState = { ...localState.value }
    try {
      localState.value = { ...localState.value, video: videoEnable, microphone: microphoneEnable }
      if (!localStream.value) return

      const videoChanged = previousState.video !== videoEnable
      const microphoneChanged = previousState.microphone !== microphoneEnable

      if (videoEnable && videoChanged && localStream.value.getVideoTracks().length === 0) {
        const newVideoStream = await getVideoStreamWithFallback(deviceId || undefined)
        const newVideoTrack = newVideoStream.getVideoTracks()[0]
        if (newVideoTrack) {
          const existingVideoTracks = localStream.value.getVideoTracks()
          localStream.value.addTrack(newVideoTrack)
          existingVideoTracks.forEach((track) => {
            track.stop()
            localStream.value?.removeTrack(track)
          })
          await replaceVideoTrackInPeers(newVideoTrack)
        }
      }
      if (!videoEnable && videoChanged) {
        const existingVideoTracks = localStream.value.getVideoTracks()
        existingVideoTracks.forEach((track) => {
          try {
            track.stop()
          } catch {}
          localStream.value?.removeTrack(track)
        })
        await replaceVideoTrackInPeers(null)
      }

      if (videoChanged) {
        localStream.value.getVideoTracks().forEach((track) => {
          if (track.enabled !== videoEnable) track.enabled = videoEnable
        })
      }
      if (microphoneChanged) {
        localStream.value.getAudioTracks().forEach((track) => {
          const isScreenAudio = track.contentHint === 'screen'
          if (!isScreenAudio && track.enabled !== microphoneEnable) track.enabled = microphoneEnable
        })
      }

      broadcastState({ video: videoEnable, microphone: microphoneEnable })
    } catch (err) {
      console.error('Failed to toggle media:', err)
      localState.value = previousState
    }
  }

  async function startScreenShare(options?: {
    resolution?: { width: number; height: number } | null
    frameRate?: number | null
    /** Pre-built tracks from Electron's desktopCapturer (skips getDisplayMedia) */
    videoTrack?: MediaStreamTrack
    audioTrack?: MediaStreamTrack | null
  }) {
    try {
      if (isScreenSharing.value) return

      let screenVideoTrack: MediaStreamTrack
      let screenAudioTrack: MediaStreamTrack | null

      if (options?.videoTrack) {
        // Electron path: caller already captured the stream
        screenVideoTrack = options.videoTrack
        screenAudioTrack = options.audioTrack ?? null
      } else {
        // Browser path: let the browser show its native picker
        const videoConstraints: MediaTrackConstraints = {}
        if (options?.resolution) {
          videoConstraints.width  = { ideal: options.resolution.width }
          videoConstraints.height = { ideal: options.resolution.height }
        }
        if (options?.frameRate) {
          videoConstraints.frameRate = { ideal: options.frameRate }
        }

        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: Object.keys(videoConstraints).length > 0 ? videoConstraints : true,
          audio: true,
        })

        screenVideoTrack = screenStream.getVideoTracks()[0]
        if (!screenVideoTrack) throw new Error('No screen video track available')
        screenAudioTrack = screenStream.getAudioTracks()[0] ?? null
      }
      
      if (screenAudioTrack) {
        screenAudioTrack.contentHint = 'screen'
      }

      previousVideoTrack = localStream.value?.getVideoTracks()[0] || null
      previousAudioTrack = localStream.value?.getAudioTracks()[0] || null
      screenShareStream = new MediaStream([
        screenVideoTrack,
        ...(screenAudioTrack ? [screenAudioTrack] : []),
      ])
      activeScreenAudioTrack = screenAudioTrack

      // Create composed stream with screen video and microphone (screen audio is sent separately)
      const composedStream = new MediaStream([
        screenVideoTrack,
        ...(previousAudioTrack ? [previousAudioTrack] : []),
      ])
      // Set content hints: microphone = 'speech'
      composedStream
        .getAudioTracks()
        .filter((track) => track !== screenAudioTrack)
        .forEach((track) => (track.contentHint = 'speech'))
      localStream.value = composedStream
      localStream.value.getVideoTracks().forEach((t) => (t.enabled = true))
      localStream.value.getAudioTracks().forEach((t) => (t.enabled = localState.value.microphone))

      peers.value.forEach(({ connection }, peerId) => {
        // Replace video track
        const videoSender = findSenderByKind(connection, 'video')
        if (videoSender) videoSender.replaceTrack(screenVideoTrack)
        else connection.addTrack(screenVideoTrack, composedStream)

        // Ensure microphone track is sent (it's in composedStream, so it should be sent automatically)
        // But we need to make sure it's not removed
        const micAudioSender = findSenderByKind(connection, 'audio')
        if (!micAudioSender && previousAudioTrack) {
          // Microphone track is missing, add it
          connection.addTrack(previousAudioTrack, composedStream)
        }

        // We intentionally do not send a separate screen-audio RTP stream.
        // Mic audio continues over the primary audio sender.
        createOfferSafe(peerId)
      })

      screenVideoTrack.onended = stopScreenShare
      if (screenAudioTrack) screenAudioTrack.onended = stopScreenShare
      isScreenSharing.value = true
      broadcastState({ screen: true })
      broadcastSoundEvent('screen-share-start')
    } catch (err) {
      console.error('Failed to start screen share:', err)
    }
  }

  async function stopScreenShare() {
    try {
      if (!isScreenSharing.value) return
      if (screenShareStream) {
        screenShareStream.getTracks().forEach((t) => t.stop())
        screenShareStream = null
      }
      activeScreenAudioTrack = null

      screenAudioSenders.forEach(({ sender, track }, peerId) => {
        try { sender.replaceTrack(null) } catch {}
        // Only stop the track if it's not already stopped (tracks from screenShareStream are stopped above)
        if (track.readyState !== 'ended') {
          try {
            track.stop()
          } catch {}
        }
      })
      screenAudioSenders.clear()

      const restoredTracks: MediaStreamTrack[] = []
      if (previousVideoTrack) restoredTracks.push(previousVideoTrack)
      if (previousAudioTrack) restoredTracks.push(previousAudioTrack)
      const restoredStream = new MediaStream(restoredTracks)
      restoredStream.getAudioTracks().forEach((t) => (t.contentHint = 'speech'))
      localStream.value = restoredStream
      localStream.value.getVideoTracks().forEach((t) => (t.enabled = localState.value.video))
      localStream.value.getAudioTracks().forEach((t) => (t.enabled = localState.value.microphone))

      peers.value.forEach(({ connection }, peerId) => {
        const videoSender = findSenderByKind(connection, 'video')
        if (videoSender && previousVideoTrack) videoSender.replaceTrack(previousVideoTrack)
        createOfferSafe(peerId)
      })

      previousVideoTrack = null
      previousAudioTrack = null
      isScreenSharing.value = false
      broadcastState({ screen: false })
      broadcastSoundEvent('screen-share-stop')
    } catch (err) {
      console.error('Failed to stop screen share:', err)
    }
  }

  function isScreenAudioTrack(track: MediaStreamTrack, stream?: MediaStream, isPeerScreenSharing?: boolean): boolean {
    // Check contentHint first (most reliable when preserved)
    const hint = track.contentHint?.toLowerCase() ?? ''
    if (hint.includes('screen') || hint.includes('presentation') || hint.includes('music')) return true
    
    // Check label
    const label = track.label.toLowerCase()
    if (label.includes('screen') || label.includes('system') || label.includes('tab') || 
        label.includes('desktop') || label.includes('window') || label.includes('display')) {
      return true
    }
    
    // If stream is provided and peer is screen sharing, check stream characteristics
    if (stream && isPeerScreenSharing) {
      const streamHasVideo = stream.getVideoTracks().length > 0
      const streamHasOnlyAudio = stream.getAudioTracks().length === 1 && stream.getVideoTracks().length === 0
      // Audio-only streams when peer is screen sharing are likely screen audio
      if (streamHasOnlyAudio && !streamHasVideo) {
        return true
      }
    }
    
    return false
  }

  function monitorLocalSpeaking(stream: MediaStream | null) {
    cleanupLocalSpeakingMonitor()
    if (!stream) return
    // Filter out screen audio tracks - only monitor microphone
    const audioTracks = stream.getAudioTracks()
    const micTracks = audioTracks.filter(track => !isScreenAudioTrack(track))
    if (micTracks.length === 0) return
    const token = localSpeakingMonitorToken
    const micOnlyStream = new MediaStream(micTracks)
    const audioContext = new AudioContext()
    audioContextRef.value = audioContext
    const source = audioContext.createMediaStreamSource(micOnlyStream)
    const analyser = audioContext.createAnalyser()
    analyserRef.value = analyser
    source.connect(analyser)
    analyser.fftSize = 512
    const dataArray = new Uint8Array(analyser.frequencyBinCount)
    function checkSpeaking() {
      if (token !== localSpeakingMonitorToken || audioContext.state === 'closed') return
      analyser.getByteFrequencyData(dataArray)
      const volume = dataArray.reduce((a, b) => a + b, 0) / dataArray.length
      isLocalSpeaking.value = volume > 5
      animationFrameId.value = requestAnimationFrame(checkSpeaking)
    }
    checkSpeaking()
  }

  const peerAudioContexts: Record<string, AudioContext> = {}

  function monitorSpeaking(peerId: string, stream: MediaStream) {
    if (peerAudioContexts[peerId]) peerAudioContexts[peerId].close().catch(() => undefined)
    
    // Filter out screen audio tracks - only monitor microphone
    const audioTracks = stream.getAudioTracks()
    const micTracks = audioTracks.filter(track => !isScreenAudioTrack(track))
    if (micTracks.length === 0) {
      // No microphone tracks, set speaking to false
      speakingPeers.value[peerId] = false
      return
    }
    
    const micOnlyStream = new MediaStream(micTracks)
    const audioContext = new AudioContext()
    peerAudioContexts[peerId] = audioContext
    const source = audioContext.createMediaStreamSource(micOnlyStream)
    const analyser = audioContext.createAnalyser()
    source.connect(analyser)
    analyser.fftSize = 512
    const dataArray = new Uint8Array(analyser.frequencyBinCount)
    function checkSpeaking() {
      if (!peerAudioContexts[peerId] || peerAudioContexts[peerId].state === 'closed') return
      analyser.getByteFrequencyData(dataArray)
      const volume = dataArray.reduce((a, b) => a + b, 0) / dataArray.length
      speakingPeers.value[peerId] = volume > 5
      requestAnimationFrame(checkSpeaking)
    }
    checkSpeaking()
  }

  // Do NOT register onUnmounted here: useWebRTC() is also used by SettingsModal,
  // CallControls, and Sidebar only for device lists. Unmounting those would call
  // leaveRoom() and clear global signaling, disconnecting the real call owned by
  // ChannelView. ChannelView's onBeforeUnmount calls leaveRoom/stopMedia/endCall.

  return {
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
    watchingStreams,
    fetchVideoDevices,
    fetchAudioDevices,
    initializeMedia,
    stopMedia,
    replaceVideoTrackInPeers,
    joinRoomWithMedia,
    leaveRoom,
    createOffer,
    removePeer,
    setDeafened,
    setPeerVolume,
    setPeerMuted,
    switchCamera,
    switchMicrophone,
    toggleMedia,
    startScreenShare,
    stopScreenShare,
    onSoundEvent,
    watchStream,
    unwatchStream,
  }
}
