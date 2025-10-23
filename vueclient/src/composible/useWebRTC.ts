import { SignalingMessage } from '@/api/models/SignalingMessage'
import { useSignalingStore } from '@/stores/signalingStore'
import { computed, onUnmounted, ref } from 'vue'

export interface PeerConnection {
  peerId: string
  connection: RTCPeerConnection
  remoteStream: MediaStream | null
}

export function useWebRTC() {
  const signalingStore = useSignalingStore()

  // State
  const localStream = ref<MediaStream | null>(null)
  const peers = ref<Map<string, PeerConnection>>(new Map())
  const isMediaInitialized = ref(false)

  // ICE configuration
  const iceConfiguration: RTCConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      {
        urls: 'turn:176.108.251.198:3478?transport=udp',
        username: 'webrtc',
        credential: 'dfe277NDR987fapq196',
      },
    ],
  }

  // Computed
  const remotePeers = computed(() => Array.from(peers.value.values()))

  // Initialize local media (camera and microphone)
  async function initializeMedia(
    constraints: MediaStreamConstraints = { video: false, audio: true },
  ) {
    try {
      localStream.value = await navigator.mediaDevices.getUserMedia(constraints)
      isMediaInitialized.value = true
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
    }
  }

  // Create a peer connection
  function createPeerConnection(peerId: string): RTCPeerConnection {
    const pc = new RTCPeerConnection(iceConfiguration)

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

      const peer = peers.value.get(peerId)
      if (peer) {
        peer.remoteStream = stream
      } else {
        peers.value.set(peerId, {
          peerId,
          connection: pc,
          remoteStream: stream,
        })
      }
    }

    // Store the peer connection
    peers.value.set(peerId, {
      peerId,
      connection: pc,
      remoteStream,
    })

    return pc
  }

  // Create and send offer to a peer
  async function createOffer(peerId: string) {
    try {
      const pc = peers.value.get(peerId)?.connection || createPeerConnection(peerId)

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
      console.log('Removed peer:', peerId)
    }
  }

  // Setup signaling handlers
  function setupSignalingHandlers() {
    // Handle peer joined - initiate connection
    signalingStore.onMessage(SignalingMessage.type.PEER_JOINED, (message) => {
      if (message.from && message.from !== signalingStore.clientId) {
        // Только существующие участники создают offer
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
  async function joinRoomWithMedia(roomId: string, mediaConstraints?: MediaStreamConstraints) {
    try {
      // Initialize media if not already done
      if (!isMediaInitialized.value) {
        await initializeMedia(mediaConstraints)
      }

      // Setup signaling handlers
      setupSignalingHandlers()

      // Connect to signaling server if not connected
      if (!signalingStore.isConnected) {
        await signalingStore.connect() // сделай connect() возвращающим Promise, когда socket открыт
      }

      // Join the room
      signalingStore.joinRoom(roomId)

      console.log('Joined room with WebRTC:', roomId)
    } catch (error) {
      console.error('Failed to join room with media:', error)
      throw error
    }
  }

  // Leave room and cleanup
  function leaveRoom() {
    // Close all peer connections
    peers.value.forEach((peer) => {
      peer.connection.close()
    })
    peers.value.clear()

    // Leave signaling room
    signalingStore.leaveRoom()

    // Clear signaling handlers
    signalingStore.clearHandlers()

    console.log('Left room')
  }

  // Смена видеокамеры
  async function switchCamera(deviceId: string) {
    try {
      console.log('Switching camera to device:', deviceId)
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId } },
        audio: false,
      })

      const newVideoTrack = newStream.getVideoTracks()[0]
      if (!newVideoTrack) return

      const oldVideoTrack = localStream.value?.getVideoTracks()[0]

      // Заменяем трек во всех соединениях
      peers.value.forEach(({ connection }) => {
        const sender = connection.getSenders().find((s) => s.track && s.track.kind === 'video')
        if (sender) sender.replaceTrack(newVideoTrack)
      })

      // Останавливаем старый трек и обновляем localStream
      if (oldVideoTrack) oldVideoTrack.stop()
      const audioTrack = localStream.value?.getAudioTracks()[0]
      localStream.value = new MediaStream([newVideoTrack, ...(audioTrack ? [audioTrack] : [])])

      console.log('Camera switched successfully')
    } catch (error) {
      console.error('Failed to switch camera:', error)
    }
  }

  // Смена микрофона
  async function switchMicrophone(deviceId: string) {
    try {
      console.log('Switching microphone to device:', deviceId)
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: { deviceId: { exact: deviceId } },
      })

      const newAudioTrack = newStream.getAudioTracks()[0]
      if (!newAudioTrack) return

      const oldAudioTrack = localStream.value?.getAudioTracks()[0]

      // Заменяем трек во всех соединениях
      peers.value.forEach(({ connection }) => {
        const sender = connection.getSenders().find((s) => s.track && s.track.kind === 'audio')
        if (sender) sender.replaceTrack(newAudioTrack)
      })

      // Останавливаем старый трек и обновляем localStream
      if (oldAudioTrack) oldAudioTrack.stop()
      const videoTrack = localStream.value?.getVideoTracks()[0]
      localStream.value = new MediaStream([newAudioTrack, ...(videoTrack ? [videoTrack] : [])])

      console.log('Microphone switched successfully')
    } catch (error) {
      console.error('Failed to switch microphone:', error)
    }
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
    isMediaInitialized,

    // Actions
    initializeMedia,
    stopMedia,
    joinRoomWithMedia,
    leaveRoom,
    createOffer,
    removePeer,

    // Switch devices
    switchCamera,
    switchMicrophone,
  }
}
