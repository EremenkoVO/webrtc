/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useRef, useCallback, useEffect } from 'react'
import { useSignalingStore } from '@/stores/signalingStore'
import { SignalingMessageType } from '@/api'
import { captureScreenAudio, getAudioCapabilities } from '@/services/audioStreamService'
import type { AudioCapabilities } from '@/services/audioStreamService'

export interface PeerConnection {
  peerId: string
  room_mates?: Record<string, string>
  connection: RTCPeerConnection
  remoteStream: MediaStream | null
  dataChannel?: RTCDataChannel
}

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]

export type ScreenShareOptions = {
  sourceId?: string
  width: number
  height: number
  frameRate: number
  audio: boolean
  audioType: 'none' | 'screen' | 'application'
}

export type ScreenAudioStatus =
  | 'inactive'     // Not screen sharing or no audio requested
  | 'capturing'    // Screen audio track is live and being sent
  | 'failed'       // Capture attempt failed
  | 'no-driver'    // macOS: no virtual audio driver detected

export function useWebRTC() {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remotePeers, setRemotePeers] = useState<PeerConnection[]>([])
  const [peerStates, setPeerStates] = useState<Record<string, { video?: boolean; microphone?: boolean; screenSharing?: boolean }>>({})
  const [peerPlayback, setPeerPlayback] = useState<Record<string, { volume: number; muted: boolean }>>({})
  const [peerAudioStreams, setPeerAudioStreams] = useState<Record<string, MediaStream>>({})
  const [speakingPeers, setSpeakingPeers] = useState<Record<string, boolean>>({})
  const [isLocalSpeaking, setIsLocalSpeaking] = useState(false)
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([])
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([])
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [screenAudioStatus, setScreenAudioStatus] = useState<ScreenAudioStatus>('inactive')
  const [screenAudioLevel, setScreenAudioLevel] = useState(0)
  const [isMediaInitialized, setIsMediaInitialized] = useState(false)

  const peersRef = useRef<Map<string, PeerConnection>>(new Map())
  const localStreamRef = useRef<MediaStream | null>(null)
  const localStateRef = useRef({ video: false, microphone: true, screenSharing: false })
  const previousVideoTrackRef = useRef<MediaStreamTrack | null>(null)
  const previousAudioTrackRef = useRef<MediaStreamTrack | null>(null)
  const screenShareStreamRef = useRef<MediaStream | null>(null)
  const activeScreenAudioTrackRef = useRef<MediaStreamTrack | null>(null)
  const screenAudioSendersRef = useRef<Map<string, { sender: RTCRtpSender; track: MediaStreamTrack }>>(new Map())
  const unsubRef = useRef<(() => void)[]>([])

  const localAudioContextRef = useRef<AudioContext | null>(null)
  const localAnalyserRef = useRef<AnalyserNode | null>(null)
  const localRafRef = useRef<number | null>(null)
  const peerAudioContextsRef = useRef<Map<string, { context: AudioContext; analyser: AnalyserNode; rafId: number }>>(new Map())

  // Screen audio level monitor
  const screenAudioCtxRef = useRef<AudioContext | null>(null)
  const screenAudioAnalyserRef = useRef<AnalyserNode | null>(null)
  const screenAudioRafRef = useRef<number | null>(null)

  localStreamRef.current = localStream

  const SPEAKING_THRESHOLD = 5

  const stopLocalSpeakingMonitor = useCallback(() => {
    if (localRafRef.current != null) {
      cancelAnimationFrame(localRafRef.current)
      localRafRef.current = null
    }
    if (localAnalyserRef.current) {
      localAnalyserRef.current = null
    }
    if (localAudioContextRef.current) {
      localAudioContextRef.current.close().catch(() => undefined)
      localAudioContextRef.current = null
    }
    setIsLocalSpeaking(false)
  }, [])

  const startLocalSpeakingMonitor = useCallback((stream: MediaStream) => {
    if (!stream.getAudioTracks().length) return
    stopLocalSpeakingMonitor()
    const ctx = new AudioContext()
    localAudioContextRef.current = ctx
    const source = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    source.connect(analyser)
    analyser.fftSize = 512
    localAnalyserRef.current = analyser
    const dataArray = new Uint8Array(analyser.frequencyBinCount)

    const check = () => {
      if (!localAnalyserRef.current) return
      analyser.getByteFrequencyData(dataArray)
      const volume = dataArray.reduce((a, b) => a + b, 0) / dataArray.length
      setIsLocalSpeaking(volume > SPEAKING_THRESHOLD)
      localRafRef.current = requestAnimationFrame(check)
    }
    localRafRef.current = requestAnimationFrame(check)
  }, [stopLocalSpeakingMonitor])

  const stopPeerSpeakingMonitor = useCallback((peerId: string) => {
    const entry = peerAudioContextsRef.current.get(peerId)
    if (entry) {
      cancelAnimationFrame(entry.rafId)
      entry.context.close().catch(() => undefined)
      peerAudioContextsRef.current.delete(peerId)
    }
    setSpeakingPeers((prev) => {
      if (!prev[peerId]) return prev
      const next = { ...prev }
      delete next[peerId]
      return next
    })
  }, [])

  const startPeerSpeakingMonitor = useCallback((peerId: string, stream: MediaStream) => {
    if (!stream.getAudioTracks().length) return
    stopPeerSpeakingMonitor(peerId)
    const ctx = new AudioContext()
    const source = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    source.connect(analyser)
    analyser.fftSize = 512
    const dataArray = new Uint8Array(analyser.frequencyBinCount)

    const check = () => {
      const entry = peerAudioContextsRef.current.get(peerId)
      if (!entry || entry.context.state === 'closed') return
      entry.analyser.getByteFrequencyData(dataArray)
      const volume = dataArray.reduce((a, b) => a + b, 0) / dataArray.length
      const speaking = volume > SPEAKING_THRESHOLD
      setSpeakingPeers((prev) => (prev[peerId] === speaking ? prev : { ...prev, [peerId]: speaking }))
      entry.rafId = requestAnimationFrame(check)
    }
    const rafId = requestAnimationFrame(check)
    peerAudioContextsRef.current.set(peerId, { context: ctx, analyser, rafId })
  }, [stopPeerSpeakingMonitor])

  // ── Screen audio level monitor ──────────────────────────────────────
  const stopScreenAudioMonitor = useCallback(() => {
    if (screenAudioRafRef.current != null) {
      cancelAnimationFrame(screenAudioRafRef.current)
      screenAudioRafRef.current = null
    }
    screenAudioAnalyserRef.current = null
    if (screenAudioCtxRef.current) {
      screenAudioCtxRef.current.close().catch(() => undefined)
      screenAudioCtxRef.current = null
    }
    setScreenAudioLevel(0)
  }, [])

  const startScreenAudioMonitor = useCallback((track: MediaStreamTrack) => {
    stopScreenAudioMonitor()
    const stream = new MediaStream([track])
    const ctx = new AudioContext()
    screenAudioCtxRef.current = ctx
    const source = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    source.connect(analyser)
    analyser.fftSize = 256
    screenAudioAnalyserRef.current = analyser
    const dataArray = new Uint8Array(analyser.frequencyBinCount)

    const check = () => {
      if (!screenAudioAnalyserRef.current) return
      analyser.getByteFrequencyData(dataArray)
      const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length
      // Normalize to 0..1
      setScreenAudioLevel(Math.min(avg / 80, 1))
      screenAudioRafRef.current = requestAnimationFrame(check)
    }
    screenAudioRafRef.current = requestAnimationFrame(check)
  }, [stopScreenAudioMonitor])

  const ensurePeerPlayback = useCallback((peerId: string) => {
    setPeerPlayback((prev) => {
      if (prev[peerId]) return prev
      return { ...prev, [peerId]: { volume: 1, muted: false } }
    })
  }, [])

  const syncRemotePeers = useCallback(() => {
    setRemotePeers(Array.from(peersRef.current.values()))
  }, [])

  const createPeerConnection = useCallback(
    (peerId: string): RTCPeerConnection => {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
      const dataChannel = pc.createDataChannel('state-channel')
      const remoteStream = new MediaStream()

      const setupDataChannel = (channel: RTCDataChannel) => {
        channel.onopen = () => {
          channel.send(JSON.stringify(localStateRef.current))
        }
        channel.onmessage = (event: MessageEvent) => {
          try {
            const data = JSON.parse(event.data)
            setPeerStates((prev) => ({ ...prev, [peerId]: { ...prev[peerId], ...data } }))
          } catch (_) {}
        }
      }
      setupDataChannel(dataChannel)

      pc.onicecandidate = (e) => {
        if (e.candidate) useSignalingStore.getState().sendIceCandidate(peerId, e.candidate)
      }
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') removePeer(peerId)
      }
      pc.ontrack = (event: RTCTrackEvent) => {
        const [stream] = event.streams
        if (!stream) return
        const peer = peersRef.current.get(peerId)
        if (peer) {
          peer.remoteStream = stream
          peersRef.current.set(peerId, peer)
          setPeerAudioStreams((prev) => ({ ...prev, [peerId]: stream }))
        } else {
          const newPeer: PeerConnection = {
            peerId,
            connection: pc,
            remoteStream: stream,
            dataChannel,
          }
          peersRef.current.set(peerId, newPeer)
          setPeerAudioStreams((prev) => ({ ...prev, [peerId]: stream }))
        }
        ensurePeerPlayback(peerId)
        if (stream.getAudioTracks().length > 0) startPeerSpeakingMonitor(peerId, stream)
        syncRemotePeers()
      }
      pc.ondatachannel = (e) => {
        const peer = peersRef.current.get(peerId)
        if (peer) {
          peer.dataChannel = e.channel
          setupDataChannel(e.channel)
          peersRef.current.set(peerId, peer)
        }
      }

      const stream = localStreamRef.current
      if (stream) {
        stream.getTracks().forEach((track) => pc.addTrack(track, stream))
      }

      const activeScreenAudio = activeScreenAudioTrackRef.current
      if (activeScreenAudio && !screenAudioSendersRef.current.has(peerId)) {
        const clonedTrack = activeScreenAudio.clone()
        if (clonedTrack.contentHint !== undefined) clonedTrack.contentHint = 'screen'
        const senderStream = new MediaStream([clonedTrack])
        const sender = pc.addTrack(clonedTrack, senderStream)
        screenAudioSendersRef.current.set(peerId, { sender, track: clonedTrack })
      }

      const newPeer: PeerConnection = {
        peerId,
        connection: pc,
        remoteStream,
        dataChannel,
      }
      peersRef.current.set(peerId, newPeer)
      ensurePeerPlayback(peerId)
      syncRemotePeers()
      return pc
    },
    [ensurePeerPlayback, syncRemotePeers, startPeerSpeakingMonitor]
  )

  const removePeer = useCallback(
    (peerId: string) => {
      const peer = peersRef.current.get(peerId)
      if (peer) {
        const screenSender = screenAudioSendersRef.current.get(peerId)
        if (screenSender) {
          screenSender.track.stop()
          screenAudioSendersRef.current.delete(peerId)
        }
        peer.connection.close()
        peersRef.current.delete(peerId)
        setPeerStates((prev) => {
          const next = { ...prev }
          delete next[peerId]
          return next
        })
        setPeerPlayback((prev) => {
          const next = { ...prev }
          delete next[peerId]
          return next
        })
        setPeerAudioStreams((prev) => {
          const next = { ...prev }
          delete next[peerId]
          return next
        })
        setSpeakingPeers((prev) => {
          const next = { ...prev }
          delete next[peerId]
          return next
        })
        stopPeerSpeakingMonitor(peerId)
        syncRemotePeers()
      }
    },
    [syncRemotePeers, stopPeerSpeakingMonitor]
  )

  // Как в Vue: создаём peer connection, если его ещё нет, затем отправляем offer
  const createOfferSafe = useCallback(
    async (peerId: string) => {
      if (!peersRef.current.has(peerId)) {
        createPeerConnection(peerId)
      }
      const peer = peersRef.current.get(peerId)
      if (!peer || peer.connection.signalingState !== 'stable') return
      try {
        const offer = await peer.connection.createOffer()
        await peer.connection.setLocalDescription(offer)
        useSignalingStore.getState().sendOffer(peerId, offer)
      } catch (err) {
        console.error('createOffer', err)
      }
    },
    [createPeerConnection]
  )

  const handleOffer = useCallback(
    async (peerId: string, offer: RTCSessionDescriptionInit) => {
      const pc = peersRef.current.get(peerId)?.connection || createPeerConnection(peerId)
      await pc.setRemoteDescription(new RTCSessionDescription(offer))
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      useSignalingStore.getState().sendAnswer(peerId, answer)
    },
    [createPeerConnection]
  )

  const handleAnswer = useCallback(async (peerId: string, answer: RTCSessionDescriptionInit) => {
    const peer = peersRef.current.get(peerId)
    if (!peer || peer.connection.signalingState !== 'have-local-offer') return
    await peer.connection.setRemoteDescription(new RTCSessionDescription(answer))
  }, [])

  const handleIceCandidate = useCallback(async (peerId: string, candidate: RTCIceCandidateInit) => {
    const peer = peersRef.current.get(peerId)
    if (!peer) return
    await peer.connection.addIceCandidate(new RTCIceCandidate(candidate))
  }, [])

  useEffect(() => {
    const unsub1 = useSignalingStore.getState().onMessage(SignalingMessageType.PEER_JOINED, (msg) => {
      if (msg.from && msg.from !== useSignalingStore.getState().clientId) {
        createOfferSafe(msg.from)
        setTimeout(() => {
          const peer = peersRef.current.get(msg.from!)
          if (peer?.dataChannel?.readyState === 'open')
            peer.dataChannel.send(JSON.stringify(localStateRef.current))
        }, 1000)
      }
    })
    const unsub2 = useSignalingStore.getState().onMessage(SignalingMessageType.OFFER, (msg) => {
      if (msg.from && msg.payload && 'sdp' in msg.payload)
        handleOffer(msg.from, { type: 'offer', sdp: msg.payload.sdp! })
    })
    const unsub3 = useSignalingStore.getState().onMessage(SignalingMessageType.ANSWER, (msg) => {
      if (msg.from && msg.payload && 'sdp' in msg.payload)
        handleAnswer(msg.from, { type: 'answer', sdp: msg.payload.sdp! })
    })
    const unsub4 = useSignalingStore.getState().onMessage(SignalingMessageType.ICE, (msg) => {
      if (msg.from && msg.payload && 'candidate' in msg.payload)
        handleIceCandidate(msg.from, {
          candidate: msg.payload.candidate!,
          sdpMid: msg.payload.sdpMid,
          sdpMLineIndex: msg.payload.sdpMLineIndex,
        })
    })
    const unsub5 = useSignalingStore.getState().onMessage(SignalingMessageType.LEAVE, (msg) => {
      if (msg.from) removePeer(msg.from)
    })
    unsubRef.current = [unsub1, unsub2, unsub3, unsub4, unsub5]
    return () => {
      unsubRef.current.forEach((u) => u())
    }
  }, [createOfferSafe, handleOffer, handleAnswer, handleIceCandidate, removePeer])

  useEffect(() => {
    if (localStream?.getAudioTracks().length) {
      startLocalSpeakingMonitor(localStream)
    } else {
      stopLocalSpeakingMonitor()
    }
    return () => stopLocalSpeakingMonitor()
  }, [localStream, startLocalSpeakingMonitor, stopLocalSpeakingMonitor])

  const initializeMedia = useCallback(
    async (constraints: MediaStreamConstraints = { video: false, audio: true }) => {
      if (localStream) localStream.getTracks().forEach((t) => t.stop())
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      // Обновляем ref сразу, чтобы createPeerConnection мог добавить треки до следующего рендера React
      localStreamRef.current = stream
      setLocalStream(stream)
      setIsMediaInitialized(true)
      localStateRef.current = {
        video: !!constraints.video,
        microphone: !!(constraints.audio && typeof constraints.audio === 'object'),
        screenSharing: false,
      }
      if (stream.getAudioTracks().length > 0) startLocalSpeakingMonitor(stream)
      return stream
    },
    [localStream, startLocalSpeakingMonitor]
  )

  const stopMedia = useCallback(() => {
    stopLocalSpeakingMonitor()
    if (localStream) {
      localStream.getTracks().forEach((t) => t.stop())
      setLocalStream(null)
    }
    setIsMediaInitialized(false)
  }, [localStream, stopLocalSpeakingMonitor])

  const leaveRoom = useCallback(() => {
    stopLocalSpeakingMonitor()
    stopScreenAudioMonitor()
    peerAudioContextsRef.current.forEach((_, peerId) => stopPeerSpeakingMonitor(peerId))
    peerAudioContextsRef.current.clear()
    peersRef.current.forEach(({ connection }) => connection.close())
    peersRef.current.clear()
    screenAudioSendersRef.current.forEach(({ track }) => track.stop())
    screenAudioSendersRef.current.clear()
    previousVideoTrackRef.current = null
    previousAudioTrackRef.current = null
    screenShareStreamRef.current = null
    activeScreenAudioTrackRef.current = null
    useSignalingStore.getState().leaveRoom()
    useSignalingStore.getState().clearHandlers()
    setRemotePeers([])
    setPeerStates({})
    setPeerPlayback({})
    setPeerAudioStreams({})
    setSpeakingPeers({})
    setIsLocalSpeaking(false)
    setScreenAudioStatus('inactive')
    setScreenAudioLevel(0)
    localStateRef.current = { video: false, microphone: true, screenSharing: false }
  }, [stopLocalSpeakingMonitor, stopPeerSpeakingMonitor, stopScreenAudioMonitor])

  const joinRoomWithMedia = useCallback(
    async (roomId: string, username?: string, mediaConstraints?: MediaStreamConstraints) => {
      if (!isMediaInitialized) await initializeMedia(mediaConstraints)
      if (!useSignalingStore.getState().isConnected()) useSignalingStore.getState().connect()
      await new Promise((r) => setTimeout(r, 500))
      useSignalingStore.getState().joinRoom(roomId, username)
    },
    [isMediaInitialized, initializeMedia]
  )

  const broadcastState = useCallback((state: Record<string, any>) => {
    const json = JSON.stringify(state)
    peersRef.current.forEach((peer) => {
      if (peer.dataChannel?.readyState === 'open') peer.dataChannel.send(json)
    })
  }, [])

  const toggleMedia = useCallback(
    async (videoEnable: boolean, microphoneEnable: boolean, deviceId: string) => {
      const previousState = { ...localStateRef.current }
      try {
        localStateRef.current = { ...localStateRef.current, video: videoEnable, microphone: microphoneEnable }
        const stream = localStreamRef.current
        if (!stream) {
          broadcastState({ video: videoEnable, microphone: microphoneEnable })
          return
        }

        const videoChanged = previousState.video !== videoEnable
        const microphoneChanged = previousState.microphone !== microphoneEnable

        // If enabling video but no video tracks exist, create one (as in Vue client)
        if (videoEnable && videoChanged && stream.getVideoTracks().length === 0 && deviceId) {
          try {
            const newVideoStream = await navigator.mediaDevices.getUserMedia({
              video: { deviceId: { exact: deviceId } },
              audio: false,
            })
            const newVideoTrack = newVideoStream.getVideoTracks()[0]
            if (newVideoTrack) {
              const existingVideoTracks = stream.getVideoTracks()
              stream.addTrack(newVideoTrack)
              existingVideoTracks.forEach((track) => {
                track.stop()
                stream.removeTrack(track)
              })
              // Replace video track in all peer connections
              peersRef.current.forEach(({ connection }) => {
                const sender = connection.getSenders().find((s) => s.track?.kind === 'video')
                if (sender) sender.replaceTrack(newVideoTrack)
                else connection.addTrack(newVideoTrack, stream)
              })
              // Update React state to trigger re-render with new video track
              const audioTracks = stream.getAudioTracks()
              const updatedStream = new MediaStream([newVideoTrack, ...audioTracks])
              localStreamRef.current = updatedStream
              setLocalStream(updatedStream)
            }
          } catch (e) {
            console.error('Failed to create video track:', e)
          }
        }

        // Only update video tracks if video state actually changed
        if (videoChanged) {
          const currentStream = localStreamRef.current
          if (currentStream) {
            currentStream.getVideoTracks().forEach((t) => {
              if (t.enabled !== videoEnable) t.enabled = videoEnable
            })
          }
        }

        // Only update audio tracks if microphone state actually changed
        if (microphoneChanged) {
          const currentStream = localStreamRef.current
          if (currentStream) {
            currentStream.getAudioTracks().forEach((t) => {
              if (t.enabled !== microphoneEnable) t.enabled = microphoneEnable
            })
          }
        }

        broadcastState({ video: videoEnable, microphone: microphoneEnable })
      } catch (err) {
        console.error('Failed to toggle media:', err)
        localStateRef.current = previousState
      }
    },
    [broadcastState]
  )

  const switchCamera = useCallback(
    async (deviceId: string) => {
      if (!localStream) return
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId } },
        audio: false,
      })
      const newVideoTrack = newStream.getVideoTracks()[0]
      if (!newVideoTrack) return
      peersRef.current.forEach((peer) => {
        const sender = peer.connection.getSenders().find((s) => s.track?.kind === 'video')
        if (sender) sender.replaceTrack(newVideoTrack)
        else if (localStream) peer.connection.addTrack(newVideoTrack, localStream)
        createOfferSafe(peer.peerId)
      })
      localStream.getVideoTracks().forEach((t) => t.stop())
      const audioTrack = localStream.getAudioTracks()[0]
      setLocalStream(new MediaStream([newVideoTrack, ...(audioTrack ? [audioTrack] : [])]))
    },
    [localStream, createOfferSafe]
  )

  const switchMicrophone = useCallback(async (deviceId: string) => {
    const stream = localStreamRef.current
    if (!stream) return
    const newStream = await navigator.mediaDevices.getUserMedia({
      video: false,
      audio: { deviceId: { exact: deviceId } },
    })
    const newAudioTrack = newStream.getAudioTracks()[0]
    if (!newAudioTrack) return
    if (newAudioTrack.contentHint !== undefined) newAudioTrack.contentHint = 'speech'

    const oldAudioTrack = stream.getAudioTracks()[0]
    peersRef.current.forEach(({ connection }) => {
      const sender = connection.getSenders().find((s) => s.track?.kind === 'audio')
      if (sender) sender.replaceTrack(newAudioTrack)
    })
    if (oldAudioTrack) oldAudioTrack.stop()

    // Как в vueclient: новый поток — сначала аудио, затем видео-треки; при смене key по stream.id плитка пересоздаётся и видео не пропадает
    const videoTracks = stream.getVideoTracks()
    setLocalStream(new MediaStream([newAudioTrack, ...videoTracks]))
  }, [])

  const startScreenShare = useCallback(
    async (options?: ScreenShareOptions) => {
      const w = options?.width ?? 1920
      const h = options?.height ?? 1080
      const fps = options?.frameRate ?? 30
      const wantAudio = options?.audio ?? false
      const audioType = options?.audioType ?? 'none'
      const sourceId = options?.sourceId
      const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron

      try {
        let screenStream: MediaStream
        let separateAudioTrack: MediaStreamTrack | null = null

        if (isElectron && sourceId) {
          // ── Electron path ────────────────────────────────────────────
          // Detect platform audio capabilities
          const caps: AudioCapabilities = await getAudioCapabilities()
          const platform = caps.platform

          if (wantAudio && (audioType === 'screen' || audioType === 'application')) {
            if (platform !== 'darwin' && caps.canCaptureScreenAudio) {
              // Windows / Linux: capture video + system audio together via
              // chromeMediaSource:'desktop' loopback
              console.log('[useWebRTC] Capturing screen + audio via desktop loopback…')
              const constraints: MediaStreamConstraints = {
                video: {
                  mandatory: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: sourceId,
                    minWidth: w,
                    maxWidth: w,
                    minHeight: h,
                    maxHeight: h,
                  },
                } as unknown as MediaStreamConstraints['video'],
                audio: {
                  mandatory: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: sourceId,
                  },
                } as unknown as MediaStreamConstraints['audio'],
              }
              screenStream = await navigator.mediaDevices.getUserMedia(constraints)
            } else {
              // macOS or fallback: capture video separately, audio via virtual device
              console.log(`[useWebRTC] macOS path — virtual devices: ${caps.virtualAudioDevices.map(d => d.label).join(', ') || '(none)'}`)
              const videoConstraints: MediaStreamConstraints = {
                video: {
                  mandatory: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: sourceId,
                    minWidth: w,
                    maxWidth: w,
                    minHeight: h,
                    maxHeight: h,
                  },
                } as unknown as MediaStreamConstraints['video'],
                audio: false,
              }
              screenStream = await navigator.mediaDevices.getUserMedia(videoConstraints)

              if (!caps.canCaptureScreenAudio) {
                // No virtual driver detected
                console.warn('[useWebRTC] macOS: no virtual audio driver — screen audio not available')
                setScreenAudioStatus('no-driver')
              } else {
                // Attempt separate audio capture (virtual device on macOS)
                separateAudioTrack = await captureScreenAudio(sourceId, caps)
                if (separateAudioTrack) {
                  console.log('[useWebRTC] Captured separate screen audio track:', separateAudioTrack.label)
                } else {
                  console.warn('[useWebRTC] Screen audio capture returned null')
                  setScreenAudioStatus('failed')
                }
              }
            }
          } else {
            // No audio requested — video only
            const constraints: MediaStreamConstraints = {
              video: {
                mandatory: {
                  chromeMediaSource: 'desktop',
                  chromeMediaSourceId: sourceId,
                  minWidth: w,
                  maxWidth: w,
                  minHeight: h,
                  maxHeight: h,
                },
              } as unknown as MediaStreamConstraints['video'],
              audio: false,
            }
            screenStream = await navigator.mediaDevices.getUserMedia(constraints)
          }
        } else {
          // ── Browser path ─────────────────────────────────────────────
          screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: {
              width: { ideal: w },
              height: { ideal: h },
              frameRate: { ideal: fps },
            },
            audio: wantAudio,
          })
        }

        const screenVideoTrack = screenStream.getVideoTracks()[0]
        if (!screenVideoTrack) return

        // Determine the screen audio track: from the combined stream or from separate capture
        const screenAudioTrack = separateAudioTrack ?? screenStream.getAudioTracks()[0] ?? null
        if (screenAudioTrack && screenAudioTrack.contentHint !== undefined) {
          screenAudioTrack.contentHint = 'music'
        }

        // Update screen audio status and start level monitor
        if (screenAudioTrack) {
          console.log(`[useWebRTC] Screen audio track active: ${screenAudioTrack.label} (${screenAudioTrack.readyState})`)
          setScreenAudioStatus('capturing')
          startScreenAudioMonitor(screenAudioTrack)
        } else if (wantAudio) {
          // Wanted audio but didn't get it — keep previous status (no-driver / failed) or set failed
          setScreenAudioStatus((prev) => prev === 'no-driver' ? prev : 'failed')
        }

        const stream = localStreamRef.current
        if (!stream) return

        previousVideoTrackRef.current = stream.getVideoTracks()[0] ?? null
        previousAudioTrackRef.current = stream.getAudioTracks()[0] ?? null
        screenShareStreamRef.current = screenStream
        activeScreenAudioTrackRef.current = screenAudioTrack

        // Как в vueclient: один составной поток — экран + текущий микрофон (не мутируем старый поток)
        const composedStream = new MediaStream([
          screenVideoTrack,
          ...(previousAudioTrackRef.current ? [previousAudioTrackRef.current] : []),
        ])
        composedStream
          .getAudioTracks()
          .forEach((t) => { if (t.contentHint !== undefined) t.contentHint = 'speech' })
        setLocalStream(composedStream)
        composedStream.getVideoTracks().forEach((t) => (t.enabled = true))
        composedStream
          .getAudioTracks()
          .forEach((t) => (t.enabled = localStateRef.current.microphone))

        // Notify all peers about screen sharing BEFORE renegotiation,
        // so the data channel message arrives before the video track.
        localStateRef.current = { ...localStateRef.current, screenSharing: true }
        setIsScreenSharing(true)
        broadcastState({ screenSharing: true })

        peersRef.current.forEach(({ connection, peerId }) => {
          const videoSender = connection.getSenders().find((s) => s.track?.kind === 'video')
          if (videoSender) videoSender.replaceTrack(screenVideoTrack)
          else connection.addTrack(screenVideoTrack, composedStream)

          if (screenAudioTrack) {
            const existing = screenAudioSendersRef.current.get(peerId)
            if (existing) {
              try {
                connection.removeTrack(existing.sender)
              } catch (_) {}
              existing.track.stop()
              screenAudioSendersRef.current.delete(peerId)
            }
            const clonedTrack = screenAudioTrack.clone()
            if (clonedTrack.contentHint !== undefined) clonedTrack.contentHint = 'music'
            const senderStream = new MediaStream([clonedTrack])
            const sender = connection.addTrack(clonedTrack, senderStream)
            screenAudioSendersRef.current.set(peerId, { sender, track: clonedTrack })
          }

          createOfferSafe(peerId)
        })

        screenVideoTrack.onended = stopScreenShare
        if (screenAudioTrack) screenAudioTrack.onended = stopScreenShare
      } catch (err) {
        console.error('Screen share', err)
      }
    },
    [createOfferSafe, broadcastState]
  )

  const stopScreenShare = useCallback(() => {
    const prevVideo = previousVideoTrackRef.current
    const prevAudio = previousAudioTrackRef.current

    // Stop screen audio level monitor
    stopScreenAudioMonitor()
    setScreenAudioStatus('inactive')

    if (screenShareStreamRef.current) {
      screenShareStreamRef.current.getTracks().forEach((t) => t.stop())
      screenShareStreamRef.current = null
    }

    // Stop separately captured audio track (e.g. macOS virtual device)
    // which may not belong to screenShareStream
    if (activeScreenAudioTrackRef.current) {
      if (activeScreenAudioTrackRef.current.readyState === 'live') {
        activeScreenAudioTrackRef.current.stop()
      }
      activeScreenAudioTrackRef.current = null
    }

    screenAudioSendersRef.current.forEach(({ sender, track }, peerId) => {
      const peer = peersRef.current.get(peerId)
      if (peer) {
        try {
          peer.connection.removeTrack(sender)
        } catch (_) {}
      }
      track.stop()
    })
    screenAudioSendersRef.current.clear()

    const restoredTracks: MediaStreamTrack[] = []
    if (prevVideo) restoredTracks.push(prevVideo)
    if (prevAudio) restoredTracks.push(prevAudio)

    const restoredStream = new MediaStream(restoredTracks)
    restoredStream.getAudioTracks().forEach((t) => { if (t.contentHint !== undefined) t.contentHint = 'speech' })
    setLocalStream(restoredStream)
    restoredStream.getVideoTracks().forEach((t) => (t.enabled = localStateRef.current.video))
    restoredStream.getAudioTracks().forEach((t) => (t.enabled = localStateRef.current.microphone))

    peersRef.current.forEach(({ connection, peerId }) => {
      const videoSender = connection.getSenders().find((s) => s.track?.kind === 'video')
      if (videoSender && prevVideo) videoSender.replaceTrack(prevVideo)
      createOfferSafe(peerId)
    })

    previousVideoTrackRef.current = null
    previousAudioTrackRef.current = null
    localStateRef.current = { ...localStateRef.current, screenSharing: false }
    setIsScreenSharing(false)
    broadcastState({ screenSharing: false })
  }, [createOfferSafe, broadcastState])

  const fetchVideoDevices = useCallback(async () => {
    const devices = await navigator.mediaDevices.enumerateDevices()
    setVideoDevices(devices.filter((d) => d.kind === 'videoinput'))
  }, [])

  const fetchAudioDevices = useCallback(async () => {
    const devices = await navigator.mediaDevices.enumerateDevices()
    setAudioDevices(devices.filter((d) => d.kind === 'audioinput'))
  }, [])

  const setPeerVolume = useCallback((peerId: string, volume: number) => {
    setPeerPlayback((prev) => ({
      ...prev,
      [peerId]: { ...(prev[peerId] || { volume: 1, muted: false }), volume: Math.max(0, Math.min(1, volume)) },
    }))
  }, [])

  const setPeerMuted = useCallback((peerId: string, muted: boolean) => {
    setPeerPlayback((prev) => ({
      ...prev,
      [peerId]: { ...(prev[peerId] || { volume: 1, muted: false }), muted },
    }))
  }, [])

  return {
    localStream,
    remotePeers,
    peerStates,
    peerPlayback,
    peerAudioStreams,
    videoDevices,
    audioDevices,
    isMediaInitialized,
    isScreenSharing,
    screenAudioStatus,
    screenAudioLevel,
    speakingPeers,
    isLocalSpeaking,
    fetchVideoDevices,
    fetchAudioDevices,
    stopMedia,
    switchMicrophone,
    switchCamera,
    toggleMedia,
    startScreenShare,
    stopScreenShare,
    joinRoomWithMedia,
    leaveRoom,
    setPeerVolume,
    setPeerMuted,
  }
}
