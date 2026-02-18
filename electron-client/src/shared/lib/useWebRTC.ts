/* eslint-disable @typescript-eslint/no-explicit-any */
import { SignalingMessage } from '@/api/models/SignalingMessage'
import { useSignalingStore } from '@/shared/stores/signalingStore'
import { computed, onUnmounted, ref } from 'vue'
import { PCMAudioStream } from './audioCapture'

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

  function ensurePeerPlayback(peerId: string) {
    if (!peerPlayback.value[peerId]) {
      peerPlayback.value = {
        ...peerPlayback.value,
        [peerId]: { volume: 1, muted: false },
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
    if (peer.connection.signalingState !== 'stable') return
    try {
      await createOffer(peerId)
    } catch (err) {
      console.error('createOfferSafe error:', err)
    }
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

    const remoteStream = new MediaStream()
    pc.ontrack = (event) => {
      const [stream] = event.streams
      if (!stream) return
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
        if (stream.getAudioTracks().length > 0) monitorSpeaking(peerId, stream)
      }
      if (event.track.kind === 'audio') updateStream()
      event.track.onunmute = () => updateStream()
      if (event.track.kind === 'video' && !event.track.muted) {
        // Check again if user is watching (state might have changed)
        const currentPeer = peers.value.get(peerId)
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
    if (enabled && peer.remoteStream.getVideoTracks().length === 0) createOfferSafe(peerId)
  }

  function setupDataChannel(peerId: string, channel: RTCDataChannel) {
    channel.onopen = () => broadcastStateTo(peerId, { ...localState.value, screen: isScreenSharing.value })
    channel.onclose = () => {}
    channel.onerror = (err) => console.error('DataChannel error', err)
    channel.onmessage = (event) => {
      try {
        handlePeerState(peerId, JSON.parse(event.data))
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
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      signalingStore.sendAnswer(peerId, answer)
    } catch (error) {
      console.error('Failed to handle offer:', error)
      throw error
    }
  }

  async function handleAnswer(peerId: string, answer: RTCSessionDescriptionInit) {
    try {
      const peer = peers.value.get(peerId)
      if (!peer) return
      if (peer.connection.signalingState === 'have-local-offer') {
        await peer.connection.setRemoteDescription(new RTCSessionDescription(answer))
      }
    } catch (error) {
      console.error('Failed to handle answer:', error)
      throw error
    }
  }

  async function handleIceCandidate(peerId: string, candidate: RTCIceCandidateInit) {
    try {
      const peer = peers.value.get(peerId)
      if (!peer) return
      await peer.connection.addIceCandidate(new RTCIceCandidate(candidate))
    } catch (error) {
      console.error('Failed to handle ICE candidate:', error)
      throw error
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
        screenSender.track.stop()
        screenAudioSenders.delete(peerId)
      }
    }
  }

  function setupSignalingHandlers() {
    signalingStore.onMessage(SignalingMessage.type.PEER_JOINED, (message) => {
      if (message.from && message.from !== signalingStore.clientId) {
        createOffer(message.from)
        setTimeout(() => {
          if (message.from) broadcastStateTo(message.from, { ...localState.value, screen: isScreenSharing.value })
        }, 1000)
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
      if (message.from) removePeer(message.from)
    })
  }

  async function joinRoomWithMedia(
    roomId: string,
    username?: string,
    mediaConstraints?: MediaStreamConstraints,
  ) {
    try {
      if (!isMediaInitialized.value) await initializeMedia(mediaConstraints)
      setupSignalingHandlers()
      if (!signalingStore.isConnected) await signalingStore.connect()
      signalingStore.joinRoom(roomId, username)
    } catch (error) {
      console.error('Failed to join room with media:', error)
      throw error
    }
  }

  function leaveRoom() {
    peers.value.forEach(({ connection }) => connection.close())
    peers.value.clear()
    signalingStore.leaveRoom()
    signalingStore.clearHandlers()
    speakingPeers.value = {}
    peerStates.value = {}
    peerPlayback.value = {}
    peerAudioStreams.value = {}
    localState.value = { video: false, microphone: true }
  }

  async function switchCamera(deviceId: string) {
    try {
      if (!localStream.value) return
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
        else connection.addTrack(newVideoTrack, localStream.value!)
        createOfferSafe(peerId)
      })
      if (oldVideoTrack) oldVideoTrack.stop()
      const audioTrack = localStream.value?.getAudioTracks()[0]
      localStream.value = new MediaStream([newVideoTrack, ...(audioTrack ? [audioTrack] : [])])
    } catch (error) {
      console.error('Failed to switch camera:', error)
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
      const oldAudioTrack = localStream.value.getAudioTracks()[0]
      peers.value.forEach(({ connection }) => {
        const sender = connection.getSenders().find((s) => s.track && s.track.kind === 'audio')
        if (sender) sender.replaceTrack(newAudioTrack)
      })
      if (oldAudioTrack) oldAudioTrack.stop()
      const videoTracks = localStream.value.getVideoTracks()
      localStream.value = new MediaStream([newAudioTrack, ...videoTracks])
    } catch (error) {
      console.error('Failed to switch microphone:', error)
    }
  }

  async function replaceVideoTrackInPeers(newTrack: MediaStreamTrack | null) {
    peers.value.forEach(({ connection }, peerId) => {
      const videoSenders = connection.getSenders().filter((s) => s.track?.kind === 'video')
      if (videoSenders.length > 0) {
        if (newTrack) videoSenders[0].replaceTrack(newTrack)
        else connection.removeTrack(videoSenders[0])
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

  function watchStream(peerId: string) {
    watchingStreams.value.add(peerId)
    const peer = peers.value.get(peerId)
    if (peer) {
      // Check if video track already exists in connection receivers but wasn't added to remoteStream
      const receivers = peer.connection.getReceivers()
      const videoReceiver = receivers.find(r => r.track && r.track.kind === 'video' && r.track.readyState === 'live')
      
      if (videoReceiver && videoReceiver.track) {
        // Video track already exists, add it to remoteStream
        const existingStream = peer.remoteStream || new MediaStream()
        // Add audio tracks if they exist
        receivers.forEach(r => {
          if (r.track && r.track.kind === 'audio' && !existingStream.getAudioTracks().includes(r.track)) {
            existingStream.addTrack(r.track)
          }
        })
        // Add video track
        if (!existingStream.getVideoTracks().includes(videoReceiver.track)) {
          existingStream.addTrack(videoReceiver.track)
          updatePeerRemoteStream(peerId, existingStream)
          console.log('[watchStream] Added existing video track to remoteStream for peer:', peerId)
        } else {
          // Track already in stream, just ensure it's updated
          updatePeerRemoteStream(peerId, existingStream)
          console.log('[watchStream] Video track already in remoteStream for peer:', peerId)
        }
      } else {
        // No video track in receivers yet, trigger renegotiation
        console.log('[watchStream] No video track found, triggering renegotiation for peer:', peerId)
        createOfferSafe(peerId)
      }
    } else {
      console.warn('[watchStream] Peer not found:', peerId)
    }
  }

  function unwatchStream(peerId: string) {
    watchingStreams.value.delete(peerId)
    // Remove video tracks from remote stream (but don't stop them - they may be reused)
    const peer = peers.value.get(peerId)
    if (peer && peer.remoteStream) {
      const videoTracks = peer.remoteStream.getVideoTracks()
      videoTracks.forEach(track => {
        peer.remoteStream!.removeTrack(track)
        // Don't stop the track - it's still being sent and can be reused
        // track.stop() would make it unusable for reconnection
      })
      // Update peer's remote stream
      updatePeerRemoteStream(peerId, peer.remoteStream)
      console.log('[unwatchStream] Removed video tracks from remoteStream for peer:', peerId)
    }
  }

  async function toggleMedia(videoEnable: boolean, microphoneEnable: boolean, deviceId: string) {
    const previousState = { ...localState.value }
    try {
      localState.value = { video: videoEnable, microphone: microphoneEnable }
      if (!localStream.value) return

      const videoChanged = previousState.video !== videoEnable
      const microphoneChanged = previousState.microphone !== microphoneEnable

      if (videoEnable && videoChanged && localStream.value.getVideoTracks().length === 0) {
        const newVideoStream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: deviceId } },
          audio: false,
        })
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

      if (videoChanged) {
        localStream.value.getVideoTracks().forEach((track) => {
          if (track.enabled !== videoEnable) track.enabled = videoEnable
        })
      }
      if (microphoneChanged) {
        localStream.value.getAudioTracks().forEach((track) => {
          if (track.enabled !== microphoneEnable) track.enabled = microphoneEnable
        })
      }

      broadcastState({ video: videoEnable, microphone: microphoneEnable })
    } catch (err) {
      console.error('Failed to toggle media:', err)
      localState.value = previousState
    }
  }

  async function startScreenShare(options?: {
    displaySurface?: 'monitor' | 'window' | 'application'
    resolution?: { width: number; height: number } | null
    frameRate?: number | null
    audioSource?: 'system' | 'application' | 'none'
  }) {
    try {
      if (isScreenSharing.value) return
      
      // Use standard getDisplayMedia API - Electron will handle it via setDisplayMediaRequestHandler
      const videoConstraints: MediaTrackConstraints = {
        displaySurface: options?.displaySurface || 'monitor',
      }
      if (options?.resolution) {
        videoConstraints.width = { ideal: options.resolution.width }
        videoConstraints.height = { ideal: options.resolution.height }
      }
      if (options?.frameRate) {
        videoConstraints.frameRate = { ideal: options.frameRate }
      }

      // In browser API, both 'system' and 'application' audio use getDisplayMedia with audio: true
      // The browser will capture audio based on what the user selects in the system dialog
      // In Electron, the setDisplayMediaRequestHandler will handle audio capture
      const audioEnabled = options?.audioSource === 'system' || options?.audioSource === 'application'
      
      console.log('[useWebRTC] Calling getDisplayMedia with:', {
        video: videoConstraints,
        audio: audioEnabled,
      });
      
      let screenStream: MediaStream;
      try {
        screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: videoConstraints as MediaTrackConstraints,
          audio: audioEnabled,
        });
      } catch (error: any) {
        console.error('[useWebRTC] getDisplayMedia rejected:', error);
        // Convert generic error to more user-friendly message
        if (error.name === 'AbortError' || error.message?.includes('Error starting capture')) {
          throw new Error('Screen sharing was cancelled or failed to start. Please try again.');
        }
        throw error;
      }
      
      console.log('[useWebRTC] getDisplayMedia resolved, stream:', {
        videoTracks: screenStream.getVideoTracks().length,
        audioTracks: screenStream.getAudioTracks().length,
      });
      
      const screenVideoTrack = screenStream.getVideoTracks()[0]
      if (!screenVideoTrack) throw new Error('No screen video track')
      
      // Get audio track from screen stream if system or application audio is requested.
      // On macOS, Electron loopback is unavailable so screenStream has no audio track;
      // the native module fills the gap via startAudioCapture(0) + onAudioData IPC.
      let screenAudioTrack: MediaStreamTrack | null = null
      if (options?.audioSource === 'system' || options?.audioSource === 'application') {
        screenAudioTrack = screenStream.getAudioTracks()[0] || null
        if (screenAudioTrack) {
          screenAudioTrack.contentHint = options?.audioSource === 'system' ? 'screen' : 'music'
        }

        // macOS fallback: if Electron loopback produced no audio track, use the native
        // module to capture system audio (pid=0).  main.ts starts the capture automatically
        // when screen sharing on macOS, so we just need to pipe the PCM into a MediaStreamTrack.
        const isMacOS = window.electronAPI?.platform === 'darwin'
        if (!screenAudioTrack && isMacOS && window.electronAPI?.audioCapture) {
          try {
            if (applicationAudioStream) {
              applicationAudioStream.stop()
              applicationAudioStream = null
            }
            // Request system loopback (pid=0); main.ts already started capture.
            // We just subscribe to the audio-data IPC events it emits.
            applicationAudioStream = new PCMAudioStream()
            const nativeTrack = applicationAudioStream.getTrack()
            nativeTrack.contentHint = options?.audioSource === 'system' ? 'screen' : 'music'

            window.electronAPI.audioCapture.removeAudioDataListener()
            window.electronAPI.audioCapture.onAudioData((data: Float32Array) => {
              if (applicationAudioStream) applicationAudioStream.addAudioData(data)
            })

            screenAudioTrack = nativeTrack
            activeScreenAudioTrack = nativeTrack
            console.log('[useWebRTC] macOS: using native audio capture for screen share')
          } catch (err) {
            console.warn('[useWebRTC] macOS native audio fallback failed:', err)
          }
        }
      }

      previousVideoTrack = localStream.value?.getVideoTracks()[0] || null
      previousAudioTrack = localStream.value?.getAudioTracks()[0] || null
      screenShareStream = screenStream
      activeScreenAudioTrack = screenAudioTrack

      // Create composed stream with screen video, screen audio (if any), and microphone
      const composedStream = new MediaStream([
        screenVideoTrack,
        ...(screenAudioTrack ? [screenAudioTrack] : []),
        ...(previousAudioTrack ? [previousAudioTrack] : []),
      ])
      // Set content hints: screen audio = 'screen'/'music', microphone = 'speech'
      composedStream
        .getAudioTracks()
        .forEach((t) => {
          if (t === screenAudioTrack) {
            // Screen audio hint already set above
          } else {
            t.contentHint = 'speech' // Microphone
          }
        })
      localStream.value = composedStream
      localStream.value.getVideoTracks().forEach((t) => (t.enabled = true))
      localStream.value
        .getAudioTracks()
        .forEach((t) => (t.enabled = localState.value.microphone))

      peers.value.forEach(({ connection }, peerId) => {
        // Replace video track
        const videoSender = connection.getSenders().find((s) => s.track?.kind === 'video')
        if (videoSender) videoSender.replaceTrack(screenVideoTrack)
        else connection.addTrack(screenVideoTrack, composedStream)

        // Ensure microphone track is sent (it's in composedStream, so it should be sent automatically)
        // But we need to make sure it's not removed
        const audioSender = connection.getSenders().find((s) => s.track?.kind === 'audio' && s.track.contentHint !== 'screen' && s.track.contentHint !== 'music')
        if (!audioSender && previousAudioTrack) {
          // Microphone track is missing, add it
          connection.addTrack(previousAudioTrack, composedStream)
        }

        // Send screen audio track if system or application audio is selected
        if (screenAudioTrack && (options?.audioSource === 'system' || options?.audioSource === 'application')) {
          const existingSender = screenAudioSenders.get(peerId)
          if (existingSender) {
            try { connection.removeTrack(existingSender.sender) } catch {}
            existingSender.track.stop()
            screenAudioSenders.delete(peerId)
          }
          const clonedTrack = screenAudioTrack.clone()
          clonedTrack.contentHint = options?.audioSource === 'system' ? 'screen' : 'music'
          const senderStream = new MediaStream([clonedTrack])
          const sender = connection.addTrack(clonedTrack, senderStream)
          screenAudioSenders.set(peerId, { sender, track: clonedTrack })
        } else if (options?.audioSource !== 'system' && options?.audioSource !== 'application') {
          // Clean up any existing screen audio senders if not using audio
          const existingSender = screenAudioSenders.get(peerId)
          if (existingSender) {
            try { connection.removeTrack(existingSender.sender) } catch {}
            existingSender.track.stop()
            screenAudioSenders.delete(peerId)
          }
        }
        createOfferSafe(peerId)
      })

      screenVideoTrack.onended = stopScreenShare
      if (screenAudioTrack) screenAudioTrack.onended = stopScreenShare
      
      // Если выбран "Application Audio" и мы на Electron, запускаем захват через нативный модуль
      if (options?.audioSource === 'application' && window.electronAPI?.audioCapture) {
        try {
          // Получаем список приложений
          const apps = await window.electronAPI.audioCapture.getAudioApplications()
          console.log('[useWebRTC] Available audio applications:', apps, 'Type:', typeof apps, 'IsArray:', Array.isArray(apps))
          
          if (apps && Array.isArray(apps) && apps.length > 0) {
            // Фильтруем приложения с валидным PID и именем
            const validApps = apps.filter((app: any) => {
              const pid = Number(app?.pid)
              const hasValidPid = !isNaN(pid) && pid > 1
              const hasName = app?.name && typeof app.name === 'string' && app.name.length > 0
              return hasValidPid && hasName
            })
            
            console.log('[useWebRTC] Valid applications:', validApps.length, 'out of', apps.length)
            
            if (validApps.length === 0) {
              throw new Error('No valid applications found')
            }
            
            // Пока используем первое валидное приложение
            // В будущем можно добавить диалог выбора приложения
            const selectedApp = validApps[0]
            console.log('[useWebRTC] Selected app:', selectedApp, 'PID type:', typeof selectedApp?.pid, 'PID value:', selectedApp?.pid)
            
            const pid = Number(selectedApp.pid)
            if (isNaN(pid) || pid <= 1) {
              throw new Error(`Invalid PID: ${selectedApp.pid} (type: ${typeof selectedApp.pid})`)
            }
            
            console.log('[useWebRTC] Starting application audio capture for:', selectedApp.name, 'PID:', pid)
            
            const appAudioTrack = await startApplicationAudioCapture(pid)
            if (appAudioTrack) {
              // Добавляем трек в composed stream
              composedStream.addTrack(appAudioTrack)
              appAudioTrack.contentHint = 'music'
              
              // Обновляем localStream
              localStream.value = composedStream
              
              // Отправляем трек всем пирам
              peers.value.forEach(({ connection }, peerId) => {
                const audioSender = connection.getSenders().find((s) => s.track?.kind === 'audio' && s.track.contentHint === 'music')
                if (audioSender) {
                  audioSender.replaceTrack(appAudioTrack)
                } else {
                  connection.addTrack(appAudioTrack, composedStream)
                }
                createOfferSafe(peerId)
              })
              
              console.log('[useWebRTC] Application audio track added to stream')
            }
          } else {
            console.warn('[useWebRTC] No audio applications found for capture')
          }
        } catch (error) {
          console.error('[useWebRTC] Failed to start application audio capture:', error)
          // Продолжаем без аудио приложения
        }
      }
      
      isScreenSharing.value = true
      broadcastState({ screen: true })
    } catch (err) {
      console.error('Failed to start screen share:', err)
      // Re-throw to let caller handle the error (e.g., show error message to user)
      throw err
    }
  }

  async function stopScreenShare() {
    try {
      if (!isScreenSharing.value) return
      
      // Остановить захват аудио из приложения, если активен
      stopApplicationAudioCapture()
      
      if (screenShareStream) {
        screenShareStream.getTracks().forEach((t) => t.stop())
        screenShareStream = null
      }
      activeScreenAudioTrack = null

      screenAudioSenders.forEach(({ sender, track }, peerId) => {
        const peer = peers.value.get(peerId)
        if (peer) {
          try { peer.connection.removeTrack(sender) } catch {}
        }
        track.stop()
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
        const videoSender = connection.getSenders().find((s) => s.track?.kind === 'video')
        if (videoSender && previousVideoTrack) videoSender.replaceTrack(previousVideoTrack)
        createOfferSafe(peerId)
      })

      previousVideoTrack = null
      previousAudioTrack = null
      isScreenSharing.value = false
      broadcastState({ screen: false })
    } catch (err) {
      console.error('Failed to stop screen share:', err)
    }
  }

  function monitorLocalSpeaking(stream: MediaStream | null) {
    if (!stream) return
    const audioContext = new AudioContext()
    const source = audioContext.createMediaStreamSource(stream)
    const analyser = audioContext.createAnalyser()
    source.connect(analyser)
    analyser.fftSize = 512
    const dataArray = new Uint8Array(analyser.frequencyBinCount)
    function checkSpeaking() {
      analyser.getByteFrequencyData(dataArray)
      const volume = dataArray.reduce((a, b) => a + b, 0) / dataArray.length
      isLocalSpeaking.value = volume > 5
      requestAnimationFrame(checkSpeaking)
    }
    checkSpeaking()
  }

  const peerAudioContexts: Record<string, AudioContext> = {}

  function monitorSpeaking(peerId: string, stream: MediaStream) {
    if (peerAudioContexts[peerId]) peerAudioContexts[peerId].close().catch(() => undefined)
    const audioContext = new AudioContext()
    peerAudioContexts[peerId] = audioContext
    const source = audioContext.createMediaStreamSource(stream)
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

  // ── Application Audio Capture ──────────────────────────────────────────────
  let applicationAudioStream: PCMAudioStream | null = null
  
  async function startApplicationAudioCapture(pid: number) {
    if (!window.electronAPI?.audioCapture) {
      throw new Error('Audio capture API not available')
    }
    
    try {
      // Остановить предыдущий захват, если есть
      if (applicationAudioStream) {
        applicationAudioStream.stop()
        applicationAudioStream = null
      }
      
      // Начать захват
      const result = await window.electronAPI.audioCapture.startAudioCapture(pid)
      if (!result.success) {
        throw new Error(result.error || 'Failed to start audio capture')
      }
      
      // Создать поток для обработки PCM данных
      applicationAudioStream = new PCMAudioStream()
      const audioTrack = applicationAudioStream.getTrack()
      audioTrack.contentHint = 'music'
      
      // Подписаться на аудио данные
      window.electronAPI.audioCapture.onAudioData((audioData: Float32Array) => {
        if (applicationAudioStream) {
          applicationAudioStream.addAudioData(audioData)
        }
      })
      
      // Добавить трек в localStream
      if (localStream.value) {
        localStream.value.addTrack(audioTrack)
        
        // Отправить трек всем пирам
        peers.value.forEach(({ connection }, peerId) => {
          connection.addTrack(audioTrack, localStream.value!)
          createOfferSafe(peerId)
        })
      }
      
      return audioTrack
    } catch (error) {
      console.error('Failed to start application audio capture:', error)
      throw error
    }
  }
  
  function stopApplicationAudioCapture() {
    if (applicationAudioStream) {
      applicationAudioStream.stop()
      applicationAudioStream = null
    }
    
    if (window.electronAPI?.audioCapture) {
      window.electronAPI.audioCapture.stopAudioCapture()
      window.electronAPI.audioCapture.removeAudioDataListener()
    }
  }

  onUnmounted(() => {
    leaveRoom()
    stopMedia()
    stopApplicationAudioCapture()
  })

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
    setPeerVolume,
    setPeerMuted,
    switchCamera,
    switchMicrophone,
    toggleMedia,
    startScreenShare,
    stopScreenShare,
    watchStream,
    unwatchStream,
    startApplicationAudioCapture,
    stopApplicationAudioCapture,
  }
}
