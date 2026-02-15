import { useState, useEffect, useCallback, useRef } from 'react'
import { SignalingService } from '@/api'
import type { RoomJoinResponse, ErrorResponse } from '@/api'
import { useWebRTC } from '@/hooks/useWebRTC'
import { useRoomStore } from '@/stores/roomStore'
import { useCallStore } from '@/stores/callStore'
import { useChatStore } from '@/stores/chatStore'
import { useSignalingStore } from '@/stores/signalingStore'
import { useSidebarStore } from '@/stores/sidebarStore'
import { FontAwesomeIcon } from '@/icons'
import { faBars, faComments, faTimes, faVideo, faCircleExclamation, faDisplay, faEye, faXmark } from '@/icons'
import ChannelControls from './ChannelControls'
import ScreenShareModal from './ScreenShareModal'
import Chat from './Chat'
import VideoTile from './VideoTile'
import ParticipantCard from './ParticipantCard'
import Badge from './Badge'
import VolumeContextMenu from './VolumeContextMenu'

function isErrorResponse(r: RoomJoinResponse | ErrorResponse): r is ErrorResponse {
  return 'error' in r || 'message' in r
}

export default function Channel({ userName }: { userName?: string }) {
  const roomStore = useRoomStore()
  const signalingStore = useSignalingStore()
  const callStore = useCallStore()
  const chatStore = useChatStore()
  const sidebarStore = useSidebarStore()

  const [videoEnabled, setVideoEnabled] = useState(false)
  const [audioEnabled, setAudioEnabled] = useState(true)
  const [currentCameraDeviceId, setCurrentCameraDeviceId] = useState<string | null>(null)
  const [currentMicrophoneDeviceId, setCurrentMicrophoneDeviceId] = useState<string | null>(null)
  const [showChatMobile, setShowChatMobile] = useState(false)
  const [showScreenShareModal, setShowScreenShareModal] = useState(false)
  const [watchingStreams, setWatchingStreams] = useState<Set<string>>(new Set())
  // Peers whose video appeared but screenSharing state hasn't arrived yet (hold display briefly)
  const [pendingClassification, setPendingClassification] = useState<Set<string>>(new Set())
  const pendingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const [volumeMenu, setVolumeMenu] = useState<{
    peerId: string
    name: string
    x: number
    y: number
  } | null>(null)

  const {
    localStream,
    remotePeers,
    peerStates,
    peerPlayback,
    peerAudioStreams,
    speakingPeers,
    isLocalSpeaking,
    isScreenSharing,
    screenAudioStatus,
    screenAudioLevel,
    videoDevices,
    audioDevices,
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
  } = useWebRTC()

  // Подключаемся к комнате: HTTP join + WebSocket connect.
  // НЕ вступаем в signaling room здесь — это делает joinRoomWithMedia ПОСЛЕ инициализации медиа,
  // чтобы peer connections создавались уже с треками (как в Vue, где handlers регистрируются после initializeMedia).
  const connectToRoom = useCallback(
    async (id: string) => {
      try {
        const response = await SignalingService.joinRoom(id)
        if (isErrorResponse(response as ErrorResponse)) throw response
        const res = response as RoomJoinResponse
        if (res.client_id && res.room_id) {
          await roomStore.setClientAndRoomId(res.client_id, id)
          if (!signalingStore.isConnected()) {
            signalingStore.connect()
            await new Promise((r) => setTimeout(r, 1000))
          }
        }
      } catch (e) {
        console.error(e)
      }
    },
    [roomStore, signalingStore]
  )

  const startCall = useCallback(async () => {
    if (!roomStore.selectedChannelId) return
    await connectToRoom(roomStore.selectedChannelId)
    try {
      await joinRoomWithMedia(roomStore.selectedChannelId, userName, {
        video: videoEnabled,
        audio: audioEnabled ? { echoCancellation: true, noiseSuppression: true } : false,
      })
      callStore.setStateCall(true)
      roomStore.getListChannels()
      toggleMedia(videoEnabled, audioEnabled, currentCameraDeviceId || '')
    } catch (err) {
      console.error(err)
      alert('Не удалось начать звонок. Проверьте разрешения камеры и микрофона.')
    }
  }, [
    roomStore.selectedChannelId,
    userName,
    videoEnabled,
    audioEnabled,
    currentCameraDeviceId,
    connectToRoom,
    joinRoomWithMedia,
    callStore,
    roomStore,
    toggleMedia,
  ])

  const endCall = useCallback(() => {
    leaveRoom()
    stopMedia()
    roomStore.getListChannels()
    setVideoEnabled(false)
    setAudioEnabled(true)
    setWatchingStreams(new Set())
    setPendingClassification(new Set())
    pendingTimersRef.current.forEach((t) => clearTimeout(t))
    pendingTimersRef.current.clear()
    callStore.setStateCall(false)
  }, [leaveRoom, stopMedia, roomStore, callStore])

  const selectCamera = useCallback(
    (deviceId: string) => {
      setCurrentCameraDeviceId(deviceId)
      setVideoEnabled(true)
      if (callStore.isInCall) switchCamera(deviceId)
      toggleMedia(true, audioEnabled, deviceId)
    },
    [callStore.isInCall, switchCamera, audioEnabled, toggleMedia]
  )

  const selectMicrophone = useCallback(
    (deviceId: string) => {
      setCurrentMicrophoneDeviceId(deviceId)
      if (callStore.isInCall) switchMicrophone(deviceId)
    },
    [callStore.isInCall, switchMicrophone]
  )

  // Как в Vue: при включении видео используем selectCamera (который вызывает switchCamera для создания трека),
  // при выключении — останавливаем и удаляем видео-треки
  const toggleVideo = useCallback(() => {
    if (!videoEnabled && localStream) {
      const devId = currentCameraDeviceId || videoDevices[0]?.deviceId || ''
      if (devId) selectCamera(devId)
    } else if (videoEnabled && localStream) {
      localStream.getVideoTracks().forEach((t) => t.stop())
      if (localStream.getVideoTracks()[0]) localStream.removeTrack(localStream.getVideoTracks()[0])
      setVideoEnabled(false)
      toggleMedia(false, audioEnabled, currentCameraDeviceId || '')
    } else {
      toggleMedia(videoEnabled, audioEnabled, currentCameraDeviceId || '')
    }
  }, [localStream, videoEnabled, audioEnabled, currentCameraDeviceId, videoDevices, selectCamera, toggleMedia])

  const toggleMicrophone = useCallback(() => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0]
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled
        setAudioEnabled(audioTrack.enabled)
        toggleMedia(videoEnabled, audioTrack.enabled, currentCameraDeviceId || '')
      }
    }
  }, [localStream, videoEnabled, currentCameraDeviceId, toggleMedia])

  const participants = roomStore.participants
  const clientId = signalingStore.clientId

  type PeerWithVideo = {
    peerId: string
    connection: RTCPeerConnection | null
    remoteStream: MediaStream
    isLocal: boolean
  }
  const peersWithVideo: PeerWithVideo[] = []
  if (localStream?.getVideoTracks().length && clientId) {
    peersWithVideo.push({
      peerId: clientId,
      connection: null,
      remoteStream: localStream,
      isLocal: true,
    })
  }
  remotePeers.forEach((peer) => {
    if (peer.remoteStream?.getVideoTracks().length) {
      // Hold display if we don't have screenSharing state yet (pending classification)
      if (pendingClassification.has(peer.peerId)) return
      const isRemoteScreenSharing = peerStates[peer.peerId]?.screenSharing === true
      // If peer is screen sharing and user hasn't accepted, don't show video yet
      if (isRemoteScreenSharing && !watchingStreams.has(peer.peerId)) return
      peersWithVideo.push({
        peerId: peer.peerId,
        connection: peer.connection,
        remoteStream: peer.remoteStream,
        isLocal: false,
      })
    }
  })

  // Peers who are screen sharing but user hasn't accepted to watch yet
  type PendingStream = { peerId: string; name: string }
  const pendingScreenShares: PendingStream[] = []
  remotePeers.forEach((peer) => {
    const hasVideo = (peer.remoteStream?.getVideoTracks().length ?? 0) > 0
    const isRemoteScreenSharing = peerStates[peer.peerId]?.screenSharing === true
    if (hasVideo && isRemoteScreenSharing && !watchingStreams.has(peer.peerId)) {
      const name = participants.find((p) => p.client_id === peer.peerId)?.username || peer.peerId
      pendingScreenShares.push({ peerId: peer.peerId, name })
    }
  })

  type PeerWithoutVideo = {
    peerId: string
    name: string
    isMuted: boolean
    isSpeaking: boolean
    isLocal: boolean
    volume?: number
    playbackMuted?: boolean
    audioStream?: MediaStream
  }
  const peersWithoutVideo: PeerWithoutVideo[] = []
  if ((!localStream || !localStream.getVideoTracks().length) && clientId) {
    peersWithoutVideo.push({
      peerId: clientId,
      name: userName || 'Вы',
      isMuted: !audioEnabled,
      isSpeaking: isLocalSpeaking,
      isLocal: true,
    })
  }
  participants.forEach((p) => {
    const peerId = p.client_id || ''
    const name = p.username || peerId
    if (peerId === clientId) return
    const peer = remotePeers.find((x) => x.peerId === peerId)
    const hasVideo = peer?.remoteStream?.getVideoTracks().length
    const isRemoteScreenSharing = peerStates[peerId]?.screenSharing === true
    const isPendingStream = hasVideo && isRemoteScreenSharing && !watchingStreams.has(peerId)
    const isBeingClassified = hasVideo && pendingClassification.has(peerId)
    if (!hasVideo || isPendingStream || isBeingClassified) {
      const ps = peerStates[peerId]
      const pb = peerPlayback[peerId]
      let isMuted = true
      if (ps && typeof ps.microphone === 'boolean') isMuted = !ps.microphone
      else if (pb) isMuted = pb.muted
      peersWithoutVideo.push({
        peerId,
        name: name || peerId,
        isMuted,
        isSpeaking: !!speakingPeers[peerId],
        isLocal: false,
        volume: pb?.volume ?? 1,
        playbackMuted: pb?.muted ?? false,
        audioStream: peerAudioStreams[peerId],
      })
    }
  })

  // Pending classification: when a remote peer first appears with video but
  // we don't have their screenSharing state yet, briefly hold display.
  // Once data channel state arrives or fallback timer fires, resolve.
  useEffect(() => {
    remotePeers.forEach((peer) => {
      const hasVideo = (peer.remoteStream?.getVideoTracks().length ?? 0) > 0
      const screenSharingState = peerStates[peer.peerId]?.screenSharing
      const isInPending = pendingClassification.has(peer.peerId)

      // New video + no screenSharing state yet → add to pending
      if (hasVideo && screenSharingState === undefined && !isInPending && !watchingStreams.has(peer.peerId)) {
        setPendingClassification((prev) => new Set(prev).add(peer.peerId))
        // Fallback: if no state arrives in 500ms, assume camera → auto-accept
        const timer = setTimeout(() => {
          setPendingClassification((prev) => {
            const next = new Set(prev)
            next.delete(peer.peerId)
            return next
          })
          pendingTimersRef.current.delete(peer.peerId)
        }, 500)
        pendingTimersRef.current.set(peer.peerId, timer)
      }

      // State arrived → resolve pending immediately
      if (screenSharingState !== undefined && isInPending) {
        setPendingClassification((prev) => {
          const next = new Set(prev)
          next.delete(peer.peerId)
          return next
        })
        const timer = pendingTimersRef.current.get(peer.peerId)
        if (timer) {
          clearTimeout(timer)
          pendingTimersRef.current.delete(peer.peerId)
        }
      }
    })
  }, [remotePeers, peerStates, pendingClassification, watchingStreams])

  // Auto-remove from watchingStreams when peer stops screen sharing or leaves
  useEffect(() => {
    setWatchingStreams((prev) => {
      let changed = false
      const next = new Set(prev)
      for (const peerId of prev) {
        const stillScreenSharing = peerStates[peerId]?.screenSharing === true
        const stillConnected = remotePeers.some((p) => p.peerId === peerId)
        if (!stillScreenSharing || !stillConnected) {
          next.delete(peerId)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [peerStates, remotePeers])

  useEffect(() => {
    fetchVideoDevices()
    fetchAudioDevices()
    if (roomStore.selectedChannelId) roomStore.getRoomParticipants(roomStore.selectedChannelId)
  }, [fetchVideoDevices, fetchAudioDevices, roomStore.selectedChannelId])

  useEffect(() => {
    if (roomStore.selectedChannelId) roomStore.getRoomParticipants(roomStore.selectedChannelId)
    const t = setInterval(() => {
      if (roomStore.selectedChannelId && callStore.isInCall)
        roomStore.getRoomParticipants(roomStore.selectedChannelId)
    }, 5000)
    return () => clearInterval(t)
  }, [roomStore.selectedChannelId, callStore.isInCall])

  if (!roomStore.selectedChannelId) {
    return (
      <div className="flex h-full text-white">
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center max-w-md">
            <h2 className="text-xl font-semibold text-white mb-2">Выберите канал</h2>
            <p className="text-slate-400 text-sm">
              {sidebarStore.isMobile ? 'Откройте меню и выберите канал' : 'Выберите канал из списка слева'}
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full text-white">
      <div className="flex flex-col flex-1 min-w-0">
        <header className="p-3 border-b border-slate-800 bg-slate-900/30 flex items-center gap-3 sticky top-0 z-10">
          {sidebarStore.isMobile && (
            <button
              onClick={() => sidebarStore.toggle()}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
              aria-label="Меню"
            >
              <FontAwesomeIcon icon={faBars} className="text-lg" />
            </button>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold truncate">
              {roomStore.selectedChannelName || 'Канал'}
            </h1>
            {roomStore.selectedChannelId && (
              <div className="flex items-center gap-2 mt-1">
                <span
                  className={`w-2 h-2 rounded-full ${signalingStore.isConnected() ? 'bg-green-500' : 'bg-red-500'}`}
                />
                <span className="text-xs text-slate-400">
                  {signalingStore.isConnected() ? 'Подключено' : 'Отключено'}
                </span>
              </div>
            )}
          </div>
          {roomStore.selectedChannelId && (
            <button
              onClick={() => setShowChatMobile(true)}
              className="md:hidden p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 relative"
            >
              <FontAwesomeIcon icon={faComments} />
              {chatStore.messages().length > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-blue-600 text-white text-xs rounded-full flex items-center justify-center">
                  {Math.min(chatStore.messages().length, 9)}
                  {chatStore.messages().length > 9 ? '+' : ''}
                </span>
              )}
            </button>
          )}
        </header>

        {!callStore.isInCall ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center">
              {roomStore.roommates.length > 0 && (
                <>
                  <p className="text-slate-400 mb-3">Подключенные участники</p>
                  <ul className="text-slate-400 mb-4 space-y-1">
                    {roomStore.roommates.map((u, i) => (
                      <li key={i}>{u}</li>
                    ))}
                  </ul>
                </>
              )}
              <p className="text-slate-400 mb-4">Вы не в звонке</p>
              <button
                type="button"
                onClick={startCall}
                className="px-6 py-3 rounded-lg bg-green-600 hover:bg-green-700 text-white font-semibold flex items-center justify-center gap-2 mx-auto"
              >
                <FontAwesomeIcon icon={faVideo} /> Начать звонок
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Screen audio status banner */}
            {isScreenSharing && screenAudioStatus === 'no-driver' && (
              <div className="mx-4 mt-3 p-3 rounded-lg bg-amber-900/30 border border-amber-700/50 flex items-start gap-2">
                <FontAwesomeIcon icon={faCircleExclamation} className="text-amber-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm text-amber-300">Аудио экрана недоступно</p>
                  <p className="text-xs text-amber-400/70 mt-0.5">
                    На macOS для захвата системного аудио необходим виртуальный аудиодрайвер.{' '}
                    <a
                      href="https://existential.audio/blackhole/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sky-400 hover:text-sky-300 underline"
                    >
                      Установить BlackHole
                    </a>
                  </p>
                </div>
              </div>
            )}
            {isScreenSharing && screenAudioStatus === 'failed' && (
              <div className="mx-4 mt-3 p-3 rounded-lg bg-red-900/30 border border-red-700/50 flex items-start gap-2">
                <FontAwesomeIcon icon={faCircleExclamation} className="text-red-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm text-red-300">Не удалось захватить аудио экрана</p>
                  <p className="text-xs text-red-400/70 mt-0.5">Проверьте консоль разработчика для деталей ошибки.</p>
                </div>
              </div>
            )}

            {/* Stream notification banners (Discord-style) */}
            {pendingScreenShares.map((ps) => (
              <div
                key={`stream-notify-${ps.peerId}`}
                className="mx-4 mt-3 p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center gap-3 animate-[slideDown_0.3s_ease-out]"
              >
                <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center flex-shrink-0">
                  <FontAwesomeIcon icon={faDisplay} className="text-indigo-400 text-sm" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium truncate">
                    {ps.name} <span className="text-indigo-300 font-normal">показывает экран</span>
                  </p>
                </div>
                <button
                  onClick={() => setWatchingStreams((prev) => new Set(prev).add(ps.peerId))}
                  className="px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium flex items-center gap-1.5 transition-colors flex-shrink-0"
                >
                  <FontAwesomeIcon icon={faEye} className="text-xs" />
                  Смотреть
                </button>
              </div>
            ))}

            <div className="flex-1 p-4 overflow-auto flex flex-wrap justify-center content-center gap-4">
              {peersWithVideo.map((peer) => (
                <div
                  key={peer.isLocal ? `local-${clientId}` : peer.peerId}
                  className="group relative bg-slate-800 border border-slate-700 rounded-lg overflow-hidden aspect-video w-full max-w-md"
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setVolumeMenu({
                      peerId: peer.peerId,
                      name: peer.isLocal ? `Вы (${userName ?? ''})` : (participants.find((p) => p.client_id === peer.peerId)?.username ?? peer.peerId),
                      x: e.clientX,
                      y: e.clientY,
                    })
                  }}
                  title="ПКМ — громкость"
                >
                  <VideoTile
                    stream={peer.remoteStream}
                    muted={peer.isLocal}
                    volume={peerPlayback[peer.peerId]?.volume ?? 1}
                    peerPlaybackMuted={peerPlayback[peer.peerId]?.muted ?? false}
                    onMuteChange={(m) => setPeerMuted(peer.peerId, m)}
                    onVolumeChange={(v) => setPeerVolume(peer.peerId, v)}
                    audioStream={peerAudioStreams[peer.peerId]}
                  />
                  <Badge
                    name={peer.isLocal ? `Вы (${userName ?? ''})` : (participants.find((p) => p.client_id === peer.peerId)?.username ?? peer.peerId)}
                    showMuted={peer.isLocal ? !audioEnabled : !(peerStates[peer.peerId]?.microphone ?? true)}
                    speaking={peer.isLocal ? isLocalSpeaking : !!speakingPeers[peer.peerId]}
                  />
                  {/* "Stop watching" button for accepted screen shares */}
                  {!peer.isLocal && watchingStreams.has(peer.peerId) && (
                    <button
                      onClick={() =>
                        setWatchingStreams((prev) => {
                          const next = new Set(prev)
                          next.delete(peer.peerId)
                          return next
                        })
                      }
                      className="absolute top-2 right-2 px-2 py-1 rounded-md bg-slate-900/80 hover:bg-red-600/80 text-slate-300 hover:text-white text-xs font-medium flex items-center gap-1 transition-colors opacity-0 group-hover:opacity-100"
                      title="Перестать смотреть"
                    >
                      <FontAwesomeIcon icon={faXmark} className="text-xs" />
                      Не смотреть
                    </button>
                  )}
                </div>
              ))}
            </div>
            {peersWithoutVideo.length > 0 && (
              <div className="p-4 border-t border-slate-800">
                <h3 className="text-sm font-semibold text-slate-400 mb-3">Участники</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
                  {peersWithoutVideo.map((p) => (
                    <div
                      key={p.peerId}
                      onContextMenu={(e) => {
                        if (p.isLocal) return
                        e.preventDefault()
                        setVolumeMenu({
                          peerId: p.peerId,
                          name: p.name,
                          x: e.clientX,
                          y: e.clientY,
                        })
                      }}
                    >
                      <ParticipantCard
                        name={p.name}
                        isMuted={p.isMuted}
                        isSpeaking={p.isSpeaking}
                        isLocal={p.isLocal}
                        volume={p.volume}
                        playbackMuted={p.playbackMuted}
                        audioStream={p.audioStream}
                        onMuteChange={(m) => setPeerMuted(p.peerId, m)}
                        onVolumeChange={(v) => setPeerVolume(p.peerId, v)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
            <ChannelControls
              videoEnabled={videoEnabled}
              audioEnabled={audioEnabled}
              isScreenSharing={isScreenSharing}
              screenAudioStatus={screenAudioStatus}
              screenAudioLevel={screenAudioLevel}
              startScreenShare={startScreenShare}
              stopScreenShare={stopScreenShare}
              onOpenScreenShareModal={() => setShowScreenShareModal(true)}
              currentCameraDeviceId={currentCameraDeviceId}
              currentMicrophoneDeviceId={currentMicrophoneDeviceId}
              remotePeersCount={remotePeers.length}
              onEndCall={endCall}
              onToggleVideo={toggleVideo}
              onToggleMicrophone={toggleMicrophone}
              onSelectCamera={selectCamera}
              onSelectMicrophone={selectMicrophone}
              videoDevices={videoDevices}
              audioDevices={audioDevices}
              fetchVideoDevices={fetchVideoDevices}
              fetchAudioDevices={fetchAudioDevices}
            />
          </>
        )}
      </div>

      <div className="hidden md:block w-72 xl:w-80 border-l border-slate-800 flex-shrink-0 min-w-0 overflow-hidden">
        <Chat roomId={roomStore.selectedChannelId ? String(roomStore.selectedChannelId) : null} userName={userName} />
      </div>

      {volumeMenu && (
        <VolumeContextMenu
          x={volumeMenu.x}
          y={volumeMenu.y}
          title={volumeMenu.name}
          volume={peerPlayback[volumeMenu.peerId]?.volume ?? 1}
          muted={peerPlayback[volumeMenu.peerId]?.muted ?? false}
          onVolumeChange={(v) => setPeerVolume(volumeMenu.peerId, v)}
          onMuteChange={(m) => setPeerMuted(volumeMenu.peerId, m)}
          onClose={() => setVolumeMenu(null)}
        />
      )}

      <ScreenShareModal
        open={showScreenShareModal}
        onClose={() => setShowScreenShareModal(false)}
        onConfirm={(options) => {
          startScreenShare(options)
          setShowScreenShareModal(false)
        }}
      />

      {showChatMobile && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col bg-slate-900">
          <div className="p-3 border-b border-slate-800 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Чат</h2>
            <button
              onClick={() => setShowChatMobile(false)}
              className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300"
            >
              <FontAwesomeIcon icon={faTimes} />
            </button>
          </div>
          <div className="flex-1 overflow-hidden min-h-0">
            <Chat roomId={roomStore.selectedChannelId ? String(roomStore.selectedChannelId) : null} userName={userName} />
          </div>
        </div>
      )}
    </div>
  )
}
