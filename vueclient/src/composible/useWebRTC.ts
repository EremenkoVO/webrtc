import { ref, onUnmounted, computed } from 'vue'
import { useSignalingStore } from '@/stores/signalingStore'
import { SignalingMessage } from '@/api/models/SignalingMessage'

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
    ],
  }

  // Computed
  const remotePeers = computed(() => Array.from(peers.value.values()))

  // Initialize local media (camera and microphone)
  async function initializeMedia(constraints: MediaStreamConstraints = { video: true, audio: true }) {
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
      event.streams[0].getTracks().forEach((track) => {
        remoteStream.addTrack(track)
      })

      const peer = peers.value.get(peerId)
      if (peer) {
        peer.remoteStream = remoteStream
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
      if (message.from) {
        console.log('Peer joined, creating offer:', message.from)
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
        signalingStore.connect()
        // Wait a bit for connection to establish
        await new Promise((resolve) => setTimeout(resolve, 1000))
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
  }
}
