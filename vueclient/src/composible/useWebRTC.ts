/* eslint-disable @typescript-eslint/no-explicit-any */
import { SignalingMessage } from '@/api/models/SignalingMessage'
import { useSignalingStore } from '@/stores/signalingStore'
import { computed, onUnmounted, ref, watch } from 'vue'

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
  const localState = ref({ video: true, microphone: true })
  const peers = ref<Record<string, PeerConnection>>({})
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
      { urls: 'stun:stun.stunprotocol.org:3478' },
    ],
  }

  // Computed
  const remotePeers = computed(() => Object.values(peers.value))

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
      monitorLocalSpeaking(localStream.value)
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
    pc.oniceconnectionstatechange = () => {
      console.log(`ICE connection state with ${peerId}:`, pc.iceConnectionState)
    }

    // Handle remote stream
    const remoteStream = new MediaStream()
    pc.ontrack = (event) => {
      console.log('Received remote track from', peerId, event.track.kind)
      const [stream] = event.streams
      if (!stream) return

      const peer = peers.value[peerId]
      if (peer) {
        const updatedPeer: PeerConnection = {
          ...peer,
          remoteStream: stream,
        }
        peers.value[peerId] = updatedPeer
      } else {
        peers.value[peerId] = {
          peerId,
          connection: pc,
          remoteStream: stream,
          room_mates: signalingStore.room_mates,
          dataChannel,
        }
      }

      monitorSpeaking(peerId, stream)
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

    peers.value[peerId] = newPeer

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

    const peer = peers.value[peerId]
    if (!peer) return

    // Если видео выключили, убираем видео трек
    if ('video' in state) {
      updateRemoteVideo(peerId, state.video)
    }
  }

  function updateRemoteVideo(peerId: string, enabled: boolean) {
    const peer = peers.value[peerId]
    if (!peer) return

    if (enabled) {
      // Видео будет автоматически обновлено, если peer заменил трек через replaceTrack
      console.log(`Peer ${peerId} включил видео — оно отобразится автоматически`)
    } else {
      const videoTrack = peer.remoteStream?.getVideoTracks()[0]
      if (videoTrack) {
        peer.remoteStream?.removeTrack(videoTrack)

        console.log(`Peer ${peerId} выключил видео`)
      }
    }
  }

  function setupDataChannel(peerId: string, channel: RTCDataChannel) {
    channel.onopen = () => console.log('DataChannel open with', peerId)
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
      const pc = peers.value[peerId]?.connection || createPeerConnection(peerId)

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      console.log('Created offer for', peerId)
      signalingStore.sendOffer(peerId, offer)
    } catch (error) {
      console.error('Failed to create offer:', error)
      throw error
    }
  }

  // Handle incoming offer
  async function handleOffer(peerId: string, offer: RTCSessionDescriptionInit) {
    try {
      console.log('Handling offer from', peerId)

      const pc = peers.value[peerId]?.connection || createPeerConnection(peerId)

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

      const peer = peers.value[peerId]
      if (!peer) {
        console.error('No peer connection found for', peerId)
        return
      }

      await peer.connection.setRemoteDescription(new RTCSessionDescription(answer))
    } catch (error) {
      console.error('Failed to handle answer:', error)
      throw error
    }
  }

  // Handle incoming ICE candidate
  async function handleIceCandidate(peerId: string, candidate: RTCIceCandidateInit) {
    try {
      console.log('Handling ICE candidate from', peerId)

      const peer = peers.value[peerId]
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
    const peer = peers.value[peerId]
    if (peer) {
      peer.connection.close()
      delete peers.value[peerId]
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
        // Only existing participants create offers
        console.log('Existing peer creating offer to new peer:', message.from)
        createOffer(message.from)
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
    Object.values(peers.value).forEach((peer) => {
      peer.connection.close()
    })

    // Очистить объект
    peers.value = {}

    // Leave signaling room
    signalingStore.leaveRoom()

    // Clear signaling handlers
    signalingStore.clearHandlers()

    // Reset speaking states
    speakingPeers.value = {}
    peerStates.value = {}

    console.log('Left room')
  }

  // Switch camera
  async function switchCamera(deviceId: string) {
    debugger
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

      const oldVideoTrack = localStream.value.getVideoTracks()[0]

      Object.values(peers.value).forEach(({ connection }) => {
        const sender = connection.getSenders().find((s) => s.track?.kind === 'video')
        if (sender) {
          sender.replaceTrack(newVideoTrack)
        }
      })

      if (oldVideoTrack) {
        oldVideoTrack.stop()
      }

      const audioTracks = localStream.value.getAudioTracks()
      localStream.value = new MediaStream([newVideoTrack, ...audioTracks])

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

      // ✅ Исправлено: Object.values
      Object.values(peers.value).forEach(({ connection }) => {
        const sender = connection.getSenders().find((s) => s.track?.kind === 'audio')
        if (sender) {
          sender.replaceTrack(newAudioTrack)
        }
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
    Object.values(peers.value).forEach(({ connection }) => {
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

  function broadcastState(state: Record<string, any>) {
    const json = JSON.stringify(state)
    Object.values(peers.value).forEach(({ dataChannel }) => {
      if (dataChannel?.readyState === 'open') {
        dataChannel.send(json)
      }
    })
  }

  async function toggleMedia(videoEnable: boolean, microphoneEnable: boolean) {
    try {
      localState.value = { video: videoEnable, microphone: microphoneEnable }
      broadcastState({ video: videoEnable, microphone: microphoneEnable })
      console.log('Toggling media - Video:', videoEnable, 'Microphone:', microphoneEnable)
    } catch (err) {
      console.error('Failed to enable camera:', err)
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

      // ✅ Исправлено: Object.values
      Object.values(peers.value).forEach(({ connection }) => {
        const sender = connection.getSenders().find((s) => s.track?.kind === 'video')
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
        Object.values(peers.value).forEach(({ connection }) => {
          const sender = connection.getSenders().find((s) => s.track?.kind === 'video')
          if (sender) sender.replaceTrack(previousVideoTrack!)
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

    // Clean up previous monitoring if any
    if (animationFrameId.value) {
      cancelAnimationFrame(animationFrameId.value)
    }
    if (audioContextRef.value) {
      audioContextRef.value.close()
    }

    audioContextRef.value = new AudioContext()
    const source = audioContextRef.value.createMediaStreamSource(stream)
    analyserRef.value = audioContextRef.value.createAnalyser()
    source.connect(analyserRef.value)

    analyserRef.value.fftSize = 512
    const dataArray = new Uint8Array(analyserRef.value.frequencyBinCount)

    function checkSpeaking() {
      if (!analyserRef.value) return

      analyserRef.value.getByteFrequencyData(dataArray)
      const volume = dataArray.reduce((a, b) => a + b, 0) / dataArray.length

      isLocalSpeaking.value = volume > 20 // threshold for "speaking"

      animationFrameId.value = requestAnimationFrame(checkSpeaking)
    }

    checkSpeaking()
  }

  const peerAudioContexts: Record<string, AudioContext> = {}

  function monitorSpeaking(peerId: string, stream: MediaStream) {
    // Create a separate audio context for each peer to avoid conflicts
    const audioContext = new AudioContext()
    peerAudioContexts[peerId] = audioContext
    const source = audioContext.createMediaStreamSource(stream)
    const analyser = audioContext.createAnalyser()
    source.connect(analyser)

    analyser.fftSize = 512
    const dataArray = new Uint8Array(analyser.frequencyBinCount)

    function checkSpeaking() {
      analyser.getByteFrequencyData(dataArray)
      const volume = dataArray.reduce((a, b) => a + b, 0) / dataArray.length

      speakingPeers.value[peerId] = volume > 20 // threshold for "speaking"

      requestAnimationFrame(checkSpeaking)
    }

    checkSpeaking()
  }

  // Cleanup on unmount
  onUnmounted(() => {
    leaveRoom()
    stopMedia()
  })

  // Watch for changes in local stream to update monitoring
  watch(localStream, (newStream) => {
    if (newStream) {
      monitorLocalSpeaking(newStream)
    }
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
