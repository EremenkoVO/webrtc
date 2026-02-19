/* eslint-disable @typescript-eslint/no-explicit-any */
import { SignalingMessage } from '@/api/models/SignalingMessage'
import { useSignalingStore } from '@/shared/stores/signalingStore'
import { computed, onUnmounted, ref } from 'vue'

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
    // Send disconnect sound event before leaving
    broadcastSoundEvent('disconnect')
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
  }) {
    try {
      if (isScreenSharing.value) return
      
      // Prepare display media options - requesting both video and audio
      const videoConstraints: MediaTrackConstraints = {}
      if (options?.resolution) {
        videoConstraints.width = { ideal: options.resolution.width }
        videoConstraints.height = { ideal: options.resolution.height }
      }
      if (options?.frameRate) {
        videoConstraints.frameRate = { ideal: options.frameRate }
      }

      const displayMediaOptions: MediaStreamConstraints = {
        video: Object.keys(videoConstraints).length > 0 ? videoConstraints : true,
        audio: true, // Requesting audio - browser dialog will let user choose to include system audio
      }

      // Request screen share stream with audio
      const screenStream = await navigator.mediaDevices.getDisplayMedia(displayMediaOptions)
      
      // Extract video and audio tracks from the stream
      const screenVideoTrack = screenStream.getVideoTracks()[0]
      if (!screenVideoTrack) {
        throw new Error('No screen video track available')
      }
      
      // Get audio track from screen stream if user selected it in browser dialog
      const audioTracks = screenStream.getAudioTracks()
      const screenAudioTrack: MediaStreamTrack | null = audioTracks[0] || null
      
      if (!screenAudioTrack) {
        console.log('No audio track returned from getDisplayMedia - user may not have selected audio in browser dialog')
        console.log('Available tracks:', screenStream.getTracks().map(t => ({ 
          kind: t.kind, 
          label: t.label, 
          enabled: t.enabled, 
          muted: t.muted 
        })))
      }
      
      if (screenAudioTrack) {
        screenAudioTrack.contentHint = 'screen'
      }

      previousVideoTrack = localStream.value?.getVideoTracks()[0] || null
      previousAudioTrack = localStream.value?.getAudioTracks()[0] || null
      screenShareStream = screenStream
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
        const videoSender = connection.getSenders().find((s) => s.track?.kind === 'video')
        if (videoSender) videoSender.replaceTrack(screenVideoTrack)
        else connection.addTrack(screenVideoTrack, composedStream)

        // Ensure microphone track is sent (it's in composedStream, so it should be sent automatically)
        // But we need to make sure it's not removed
        const micAudioSender = connection.getSenders().find((s) => s.track?.kind === 'audio' && s.track.contentHint !== 'screen' && s.track.contentHint !== 'music')
        if (!micAudioSender && previousAudioTrack) {
          // Microphone track is missing, add it
          connection.addTrack(previousAudioTrack, composedStream)
        }

        // Send screen audio track separately (not in composedStream) if it was obtained from the stream
        if (screenAudioTrack) {
          const existingSender = screenAudioSenders.get(peerId)
          if (existingSender) {
            try {
              connection.removeTrack(existingSender.sender)
            } catch (error) {
              console.warn('Failed to remove existing screen audio sender:', error)
            }
            existingSender.track.stop()
            screenAudioSenders.delete(peerId)
          }

          const clonedTrack = screenAudioTrack.clone()
          clonedTrack.contentHint = 'screen'
          const senderStream = new MediaStream([clonedTrack])
          const sender = connection.addTrack(clonedTrack, senderStream)
          screenAudioSenders.set(peerId, { sender, track: clonedTrack })
        } else {
          // No screen audio track available - clean up any existing senders
          const existingSender = screenAudioSenders.get(peerId)
          if (existingSender) {
            try {
              connection.removeTrack(existingSender.sender)
              existingSender.track.stop()
            } catch {}
            screenAudioSenders.delete(peerId)
          }
        }
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
        const peer = peers.value.get(peerId)
        if (peer) {
          try { peer.connection.removeTrack(sender) } catch {}
        }
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
        const videoSender = connection.getSenders().find((s) => s.track?.kind === 'video')
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
    if (!stream) return
    // Filter out screen audio tracks - only monitor microphone
    const audioTracks = stream.getAudioTracks()
    const micTracks = audioTracks.filter(track => !isScreenAudioTrack(track))
    if (micTracks.length === 0) return
    
    const micOnlyStream = new MediaStream(micTracks)
    const audioContext = new AudioContext()
    const source = audioContext.createMediaStreamSource(micOnlyStream)
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

  onUnmounted(() => {
    leaveRoom()
    stopMedia()
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
    onSoundEvent,
    watchStream,
    unwatchStream,
  }
}
