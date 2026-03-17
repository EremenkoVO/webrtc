<script setup lang="ts">
import { SignalingService, type ErrorResponse, type RoomJoinResponse } from '@/api'
import connectSound from '@/assets/sound/connect.mp3'
import disconnectSound from '@/assets/sound/disconnect.mp3'
import screencastStartSound from '@/assets/sound/screencast-start.mp3'
import ParticipantCard from '@/entities/participant/ParticipantCard.vue'
import UserBadge from '@/entities/participant/UserBadge.vue'
import VideoTile from '@/entities/participant/VideoTile.vue'
import { useWebRTC } from '@/shared/lib/useWebRTC'
import { useCallStore } from '@/shared/stores/callStore'
import { useChatStore } from '@/shared/stores/chatStore'
import { useRoomStore } from '@/shared/stores/roomStore'
import { useSettingsStore } from '@/shared/stores/settingsStore'
import { useSidebarStore } from '@/shared/stores/sidebarStore'
import { useSignalingStore } from '@/shared/stores/signalingStore'
import { useVoiceStateStore } from '@/shared/stores/voiceStateStore'
import ChatPanel from '@/widgets/chat/ChatPanel.vue'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { startElectronCapture, stopElectronCapture } from '@/shared/lib/useElectronCapture'
import CallControls from './CallControls.vue'
import ElectronScreenPicker from './ElectronScreenPicker.vue'
import ScreenShareModal, { type ScreenShareOptions } from './ScreenShareModal.vue'

const { t } = useI18n()

const props = defineProps<{ userName: string | undefined }>()

const roomStore = useRoomStore()
const signalingStore = useSignalingStore()
const callStore = useCallStore()
const chatStore = useChatStore()
const sidebarStore = useSidebarStore()
const voiceStateStore = useVoiceStateStore()
const settingsStore = useSettingsStore()

const {
  localStream,
  remotePeers,
  peerStates,
  peerPlayback,
  peerAudioStreams,
  videoDevices,
  audioDevices,
  fetchVideoDevices,
  fetchAudioDevices,
  stopMedia,
  switchMicrophone,
  isScreenSharing,
  startScreenShare,
  stopScreenShare,
  joinRoomWithMedia,
  speakingPeers,
  isLocalSpeaking,
  switchCamera,
  toggleMedia,
  leaveRoom,
  setPeerVolume,
  setPeerMuted,
  setDeafened,
  watchingStreams,
  watchStream,
  unwatchStream,
  onSoundEvent,
} = useWebRTC()

const videoEnabled = ref(false)
const audioEnabled = ref(true)
const isDeafened = ref(false)
const micMutedBeforeDeafen = ref(false)
const audioElement = ref<HTMLAudioElement | null>(null)
const disconnectAudioElement = ref<HTMLAudioElement | null>(null)
const screencastAudioElement = ref<HTMLAudioElement | null>(null)
const currentCameraDeviceId = ref<string | null>(null)
const currentMicrophoneDeviceId = ref<string | null>(null)
const videoStreamIndex = ref(0)
const showChatMobile = ref(false)
const showScreenShareModal = ref(false)
const showElectronPicker   = ref(false)
const isElectron           = !!window.electronAPI

type PeerWithVideo = {
  peerId: string
  connection: RTCPeerConnection | null
  remoteStream: MediaStream
  room_mates?: Record<string, string>
  isLocal: boolean
}

const showParticipantsPanel = ref(true)
const showLocalPreview = ref(false)

const peersWithVideo = computed<PeerWithVideo[]>(() => {
  const result: PeerWithVideo[] = []
  const localClientId = signalingStore.clientId
  if (localStream.value && localStream.value.getVideoTracks().length > 0 && localClientId) {
    // Skip local tile when screen sharing and preview is disabled
    if (!isScreenSharing.value || showLocalPreview.value) {
      result.push({
        peerId: localClientId,
        connection: null,
        remoteStream: localStream.value,
        room_mates: {},
        isLocal: true,
      })
    }
  }
  remotePeers.value.forEach((peer) => {
    if (peer.remoteStream && peer.remoteStream.getVideoTracks().length > 0) {
      // Check if peer is screen sharing
      const isScreenSharing = peerStates.value[peer.peerId]?.screen === true
      const isWatching = watchingStreams.value.has(peer.peerId)
      // Only show video if it's not screen sharing, or if user is watching this stream
      if (!isScreenSharing || isWatching) {
        result.push({
          peerId: peer.peerId,
          connection: peer.connection,
          remoteStream: peer.remoteStream,
          room_mates: peer.room_mates,
          isLocal: false,
        })
      }
    }
  })
  return result
})

// Set of peer IDs whose streams we're currently watching (computed for reliable reactivity)
const watchingPeerIds = computed(() => new Set(watchingStreams.value))

// Available screen sharing streams (not being watched)
const availableScreenShares = computed(() => {
  return remotePeers.value
    .filter((peer) => {
      const isScreenSharing = peerStates.value[peer.peerId]?.screen === true
      return isScreenSharing && !watchingPeerIds.value.has(peer.peerId)
    })
    .map((peer) => {
      const name =
        signalingStore.room_mates[peer.peerId] ||
        roomStore.participants.find((p) => p.client_id === peer.peerId)?.username ||
        peer.peerId
      return { peerId: peer.peerId, name }
    })
})

type PeerWithoutVideo = {
  peerId: string
  name: string
  isMuted: boolean
  isSpeaking: boolean
  isLocal: boolean
  volume?: number
  audioStream?: MediaStream
  isConnecting?: boolean
}

const peersWithoutVideo = computed<PeerWithoutVideo[]>(() => {
  const result: PeerWithoutVideo[] = []
  const localClientId = signalingStore.clientId
  if ((!localStream.value || localStream.value.getVideoTracks().length === 0) && localClientId) {
    result.push({
      peerId: localClientId,
      name: props.userName || t('common.you'),
      isMuted: !audioEnabled.value,
      isSpeaking: isLocalSpeaking.value,
      isLocal: true,
    })
  }
  roomStore.participants.forEach((participant) => {
    const peerId = participant.client_id || ''
    const name = participant.username || peerId
    if (peerId === localClientId) return
    const peer = remotePeers.value.find((p) => p.peerId === peerId)
    const hasVideo = peer?.remoteStream && peer.remoteStream.getVideoTracks().length > 0
    if (!hasVideo) {
      const peerState = peerStates.value[peerId]
      const playback = peerPlayback.value[peerId]
      let isMuted = true
      if (peerState && typeof peerState.microphone === 'boolean') isMuted = !peerState.microphone
      else if (playback) isMuted = playback.muted
      const hasPeerState = peerState !== undefined
      const isConnecting = !peer || !hasPeerState
      result.push({
        peerId,
        name: name || peerId,
        isMuted,
        isSpeaking: speakingPeers.value[peerId] || false,
        isLocal: false,
        volume: playback?.volume ?? 1,
        audioStream: peerAudioStreams.value[peerId],
        isConnecting,
      })
    }
  })
  return result
})

// Compute grid columns/rows to fill available space with tiles
const videoGridStyle = computed(() => {
  const n = peersWithVideo.value.length
  if (n === 0) return {}
  let cols: number
  let rows: number
  if (n === 1) {
    cols = 1
    rows = 1
  } else if (n === 2) {
    cols = 2
    rows = 1
  } else if (n <= 4) {
    cols = 2
    rows = 2
  } else if (n <= 6) {
    cols = 3
    rows = 2
  } else if (n <= 9) {
    cols = 3
    rows = 3
  } else if (n <= 12) {
    cols = 4
    rows = 3
  } else {
    cols = 4
    rows = Math.ceil(n / 4)
  }
  return {
    gridTemplateColumns: `repeat(${cols}, 1fr)`,
    gridTemplateRows: `repeat(${rows}, 1fr)`,
  }
})

function selectCamera(deviceId: string) {
  currentCameraDeviceId.value = deviceId
  videoEnabled.value = true
  if (callStore.isInCall) switchCamera(deviceId)
  toggleMedia(videoEnabled.value, audioEnabled.value, deviceId)
}
function selectMicrophone(deviceId: string) {
  currentMicrophoneDeviceId.value = deviceId
  if (callStore.isInCall) switchMicrophone(deviceId)
}
function handlePeerMuteChange(peerId: string, muted: boolean) {
  setPeerMuted(peerId, muted)
}
function handlePeerVolumeChange(peerId: string, volume: number) {
  setPeerVolume(peerId, volume)
}

function toggleVideo() {
  if (!currentCameraDeviceId.value && localStream.value && !videoEnabled.value) {
    selectCamera(videoDevices.value[0]?.deviceId || '')
    videoEnabled.value = true
  } else if (currentCameraDeviceId.value && localStream.value && !videoEnabled.value) {
    selectCamera(currentCameraDeviceId.value)
    videoEnabled.value = true
  } else if (videoEnabled.value && localStream.value) {
    localStream.value.getVideoTracks().forEach((t) => t.stop())
    localStream.value.removeTrack(localStream.value.getVideoTracks()[0])
    videoEnabled.value = false
  }
  toggleMedia(videoEnabled.value, audioEnabled.value, currentCameraDeviceId.value || '')
}

async function toggleMicrophone() {
  if (localStream.value) {
    const t = localStream.value.getAudioTracks()[0]
    if (t) {
      t.enabled = !t.enabled
      audioEnabled.value = t.enabled
    }
  }
  toggleMedia(videoEnabled.value, audioEnabled.value, currentCameraDeviceId.value || '')
}

async function startCall() {
  if (!roomStore.selectedChannelId) return
  await connectToRoom(roomStore.selectedChannelId)
  const preferredMic = currentMicrophoneDeviceId.value || settingsStore.defaultMicrophoneId
  const preferredCamera = currentCameraDeviceId.value || settingsStore.defaultCameraId
  try {
    await joinRoomWithMedia(roomStore.selectedChannelId, props.userName, {
      video: videoEnabled.value
        ? preferredCamera
          ? { deviceId: { ideal: preferredCamera } }
          : true
        : false,
      audio: audioEnabled.value
        ? {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            ...(preferredMic ? { deviceId: { ideal: preferredMic } } : {}),
          }
        : false,
    })
    callStore.setStateCall(true)
    roomStore.getListChannels()
    toggleMedia(videoEnabled.value, audioEnabled.value, preferredCamera || '')
  } catch (error) {
    console.error('Failed to start call:', error)
  }
}

function toggleDeafen() {
  if (!isDeafened.value) {
    // Remember whether mic was already muted before deafening
    micMutedBeforeDeafen.value = !audioEnabled.value
    isDeafened.value = true
    voiceStateStore.setLocalDeafened(true)
    setDeafened(true)
    // Mute mic if it was on
    if (audioEnabled.value) toggleMicrophone()
  } else {
    isDeafened.value = false
    voiceStateStore.setLocalDeafened(false)
    setDeafened(false)
    // Unmute mic only if it was on before deafening
    if (!micMutedBeforeDeafen.value && !audioEnabled.value) toggleMicrophone()
  }
}

function endCall() {
  // Play disconnect sound if enabled
  if (settingsStore.soundOnConnect && disconnectAudioElement.value) {
    disconnectAudioElement.value.play().catch(() => {})
  }
  leaveRoom()
  stopMedia()
  roomStore.getListChannels()
  videoEnabled.value = false
  audioEnabled.value = true
  isDeafened.value = false
  micMutedBeforeDeafen.value = false
  callStore.setStateCall(false)
  voiceStateStore.clear()
}

function handleRequestScreenShare() {
  if (isElectron) {
    showElectronPicker.value = true
  } else {
    showScreenShareModal.value = true
  }
}

async function handleStartScreenShare(options: ScreenShareOptions) {
  showScreenShareModal.value = false
  try {
    await startScreenShare(options)
    if (settingsStore.soundOnConnect && screencastAudioElement.value) {
      screencastAudioElement.value.play().catch(() => {})
    }
  } catch (error) {
    console.error('Failed to start screen share:', error)
  }
}

async function handleStartElectronCapture(params: {
  sourceId: string
  sourceType: 'screen' | 'window'
  captureAudio: boolean
  resolution?: { width: number; height: number } | null
  frameRate?: number | null
}) {
  showElectronPicker.value = false
  try {
    const { videoTrack, audioTrack } = await startElectronCapture(params)
    await startScreenShare({ videoTrack, audioTrack, resolution: params.resolution, frameRate: params.frameRate })
    if (settingsStore.soundOnConnect && screencastAudioElement.value) {
      screencastAudioElement.value.play().catch(() => {})
    }
  } catch (error) {
    console.error('Failed to start electron screen share:', error)
    stopElectronCapture()
  }
}

function handleCancelScreenShare() {
  showScreenShareModal.value = false
  showElectronPicker.value   = false
}

function isErrorResponse(r: RoomJoinResponse | ErrorResponse): r is ErrorResponse {
  return 'error' in r
}

async function connectToRoom(id: string | undefined) {
  if (!id) return
  try {
    const response = await SignalingService.joinRoom(id)
    if (isErrorResponse(response)) throw response
    if (response.client_id && response.room_id) {
      await roomStore.setClientAndRoomId(response.client_id, id)
      if (!signalingStore.isConnected) {
        signalingStore.connect()
        await new Promise((r) => setTimeout(r, 1000))
      }
      signalingStore.joinRoom(id)
    }
  } catch (e) {
    console.error(e)
  }
}

watch(
  () => roomStore.selectedChannelId,
  (newId, oldId) => {
    if (oldId && newId !== oldId && callStore.isInCall) endCall()
  },
)
watch(
  () => callStore.disconnectRequested,
  (requested) => {
    if (requested && callStore.isInCall) {
      endCall()
      callStore.clearDisconnectRequest()
    }
  },
)
watch(
  () => callStore.isInCall,
  (inCall) => {
    if (inCall && settingsStore.soundOnConnect && audioElement.value) {
      audioElement.value.currentTime = 0
      audioElement.value.play().catch(() => {})
    }
  },
)

watch(
  () => roomStore.selectedChannelId,
  async (newId, oldId) => {
    if (newId && newId !== oldId) await roomStore.getRoomParticipants(newId)
    else if (!newId) {
      roomStore.setRoommates([])
      roomStore.setParticipants([])
    }
  },
  { immediate: true },
)

let participantsRefreshInterval: ReturnType<typeof setInterval> | null = null
watch(
  () => [roomStore.selectedChannelId, callStore.isInCall],
  ([channelId, isInCall]) => {
    if (participantsRefreshInterval) {
      clearInterval(participantsRefreshInterval)
      participantsRefreshInterval = null
    }
    if (typeof channelId === 'string' && channelId && isInCall) {
      roomStore.getRoomParticipants(channelId)
      participantsRefreshInterval = setInterval(() => {
        if (roomStore.selectedChannelId && callStore.isInCall)
          roomStore.getRoomParticipants(roomStore.selectedChannelId)
      }, 5000)
    }
  },
  { immediate: true },
)

// Sync speaking state to voiceStateStore for sidebar
watch(
  [speakingPeers, isLocalSpeaking, () => signalingStore.room_mates, () => callStore.isInCall],
  () => {
    if (!callStore.isInCall) {
      voiceStateStore.updateSpeaking({})
      return
    }
    const states: Record<string, boolean> = {}
    if (props.userName) states[props.userName] = isLocalSpeaking.value
    for (const [peerId, speaking] of Object.entries(speakingPeers.value)) {
      const name =
        signalingStore.room_mates[peerId] ||
        roomStore.participants.find((p) => p.client_id === peerId)?.username
      if (name) states[name] = speaking
    }
    voiceStateStore.updateSpeaking(states)
  },
  { deep: true },
)

// Sync screen sharing state to voiceStateStore for sidebar
watch(
  [isScreenSharing, peerStates, () => signalingStore.room_mates, () => callStore.isInCall],
  () => {
    if (!callStore.isInCall) {
      voiceStateStore.updateScreenSharing({})
      return
    }
    const states: Record<string, boolean> = {}
    if (props.userName) states[props.userName] = isScreenSharing.value
    for (const [peerId, state] of Object.entries(peerStates.value)) {
      const name =
        signalingStore.room_mates[peerId] ||
        roomStore.participants.find((p) => p.client_id === peerId)?.username
      if (name && typeof state.screen === 'boolean') states[name] = state.screen
    }
    voiceStateStore.updateScreenSharing(states)
  },
  { deep: true },
)

// Sync connecting state to voiceStateStore
watch(
  [
    () => roomStore.participants,
    remotePeers,
    peerStates,
    () => signalingStore.room_mates,
    () => callStore.isInCall,
  ],
  () => {
    if (!callStore.isInCall) {
      voiceStateStore.updateConnecting({})
      return
    }
    const states: Record<string, boolean> = {}
    const localClientId = signalingStore.clientId
    roomStore.participants.forEach((participant) => {
      const peerId = participant.client_id || ''
      if (peerId === localClientId) return
      const name = participant.username || peerId
      const peer = remotePeers.value.find((p) => p.peerId === peerId)
      const hasPeerState = peerStates.value[peerId] !== undefined
      // Participant is connecting if they're in the list but don't have a peer connection or peer state yet
      const isConnecting = !peer || !hasPeerState
      if (name) states[name] = isConnecting
    })
    voiceStateStore.updateConnecting(states)
  },
  { deep: true },
)

// Auto-unwatch screen sharing streams when they stop
watch(
  [peerStates, () => Array.from(watchingStreams.value)],
  () => {
    // Copy to avoid mutation-during-iteration
    const streamsToCheck = Array.from(watchingStreams.value)
    streamsToCheck.forEach((peerId) => {
      // Unwatch only when the peer has explicitly stopped sharing (or disconnected)
      // Do NOT use hasVideoTrack here — that causes a race where the watcher fires
      // before the video track arrives and immediately kills the watching session.
      const isStillSharing = peerStates.value[peerId]?.screen === true
      if (!isStillSharing) {
        unwatchStream(peerId)
      }
    })
  },
  { deep: true },
)

// Sync muted state to voiceStateStore for sidebar
watch(
  [peerStates, audioEnabled, () => signalingStore.room_mates, () => callStore.isInCall],
  () => {
    if (!callStore.isInCall) {
      voiceStateStore.updateMuted({})
      return
    }
    const states: Record<string, boolean> = {}
    if (props.userName) states[props.userName] = !audioEnabled.value
    for (const [peerId, state] of Object.entries(peerStates.value)) {
      const name =
        signalingStore.room_mates[peerId] ||
        roomStore.participants.find((p) => p.client_id === peerId)?.username
      if (name && typeof state.microphone === 'boolean') states[name] = !state.microphone
    }
    voiceStateStore.updateMuted(states)
  },
  { deep: true },
)

// Sync deafened state to voiceStateStore for sidebar
watch(
  [peerStates, isDeafened, () => signalingStore.room_mates, () => callStore.isInCall],
  () => {
    if (!callStore.isInCall) {
      voiceStateStore.updateDeafened({})
      return
    }
    const states: Record<string, boolean> = {}
    if (props.userName) states[props.userName] = isDeafened.value
    for (const [peerId, state] of Object.entries(peerStates.value)) {
      const name =
        signalingStore.room_mates[peerId] ||
        roomStore.participants.find((p) => p.client_id === peerId)?.username
      if (name && typeof state.deafened === 'boolean') states[name] = state.deafened
    }
    voiceStateStore.updateDeafened(states)
  },
  { deep: true },
)

// Sync volume/mute from voiceStateStore (sidebar) → useWebRTC
watch(
  () => voiceStateStore.peerVolumeSettings,
  (settings) => {
    for (const [username, { volume, muted }] of Object.entries(settings)) {
      const peerId = Object.entries(signalingStore.room_mates).find(
        ([, name]) => name === username,
      )?.[0]
      if (!peerId) continue
      setPeerVolume(peerId, volume)
      setPeerMuted(peerId, muted)
    }
  },
  { deep: true },
)

// Watch request from sidebar: watch a peer's screen share stream
watch(
  () => voiceStateStore.watchRequest,
  (username) => {
    if (!username) return
    const peerId = Object.entries(signalingStore.room_mates).find(
      ([, name]) => name === username,
    )?.[0]
    if (peerId) watchStream(peerId)
    voiceStateStore.watchRequest = null
  },
)

// Unwatch request from sidebar
watch(
  () => voiceStateStore.unwatchRequest,
  (username) => {
    if (!username) return
    const peerId = Object.entries(signalingStore.room_mates).find(
      ([, name]) => name === username,
    )?.[0]
    if (peerId) unwatchStream(peerId)
    voiceStateStore.unwatchRequest = null
  },
)

// Sync screen share streams + watching usernames to voiceStateStore for sidebar
watch(
  [watchingStreams, peerStates, remotePeers],
  () => {
    // Sync watching usernames (peerId → username mapping)
    const newWatchingUsernames = new Set<string>()
    for (const peerId of watchingStreams.value) {
      const username = signalingStore.room_mates[peerId]
      if (username) newWatchingUsernames.add(username)
    }
    voiceStateStore.setWatchingUsernames(newWatchingUsernames)

    // Sync live preview streams
    for (const peerId of watchingStreams.value) {
      if (peerStates.value[peerId]?.screen) {
        const peer = remotePeers.value.find((p) => p.peerId === peerId)
        const username = signalingStore.room_mates[peerId]
        if (username && peer?.remoteStream) {
          voiceStateStore.setScreenShareStream(username, peer.remoteStream)
        }
      }
    }
    // Clear streams for peers who stopped sharing
    for (const username of Object.keys(voiceStateStore.screenShareStreams)) {
      const peerId = Object.entries(signalingStore.room_mates).find(([, n]) => n === username)?.[0]
      if (!peerId || !peerStates.value[peerId]?.screen) {
        voiceStateStore.setScreenShareStream(username, null)
      }
    }
  },
  { deep: true },
)

let cleanupSoundHandler: (() => void) | null = null

onMounted(async () => {
  await fetchVideoDevices()
  await fetchAudioDevices()
  if (roomStore.selectedChannelId) roomStore.getRoomParticipants(roomStore.selectedChannelId)
  // Apply default devices from settings
  if (!currentMicrophoneDeviceId.value && settingsStore.defaultMicrophoneId) {
    const exists = audioDevices.value.some((d) => d.deviceId === settingsStore.defaultMicrophoneId)
    if (exists) currentMicrophoneDeviceId.value = settingsStore.defaultMicrophoneId
  }
  if (!currentCameraDeviceId.value && settingsStore.defaultCameraId) {
    const exists = videoDevices.value.some((d) => d.deviceId === settingsStore.defaultCameraId)
    if (exists) currentCameraDeviceId.value = settingsStore.defaultCameraId
  }

  cleanupSoundHandler = onSoundEvent((eventType) => {
    if (!settingsStore.soundOnConnect) return
    const playEl = (el: HTMLAudioElement | null) => {
      if (!el) return
      el.currentTime = 0
      el.play().catch(() => {})
    }
    if (eventType === 'connect') playEl(audioElement.value)
    else if (eventType === 'disconnect') playEl(disconnectAudioElement.value)
    else if (eventType === 'screen-share-start') playEl(screencastAudioElement.value)
  })
})

onBeforeUnmount(() => {
  if (participantsRefreshInterval) clearInterval(participantsRefreshInterval)
  cleanupSoundHandler?.()
  if (callStore.isInCall) endCall()
  stopMedia()
  leaveRoom()
  voiceStateStore.clear()
})
</script>

<template>
  <div class="flex h-full">
    <!-- Main voice area -->
    <div class="flex flex-col flex-1 min-w-0">
      <!-- Header bar -->
      <div
        class="h-12 2xl:h-14 px-4 2xl:px-6 flex items-center gap-3 shadow-[0_1px_0_rgba(4,4,5,0.2),0_1.5px_0_rgba(6,6,7,0.05)] bg-dc-bg-primary flex-shrink-0 z-10"
      >
        <button
          v-if="sidebarStore.isMobile"
          @click="sidebarStore.toggle"
          class="w-7 h-7 flex items-center justify-center text-dc-text-muted hover:text-dc-text transition-colors lg:hidden"
        >
          <font-awesome-icon icon="bars" class="text-lg" />
        </button>

        <!-- Voice icon -->
        <font-awesome-icon
          icon="volume-high"
          class="text-dc-text-muted flex-shrink-0 text-[16px]"
        />

        <h1 class="text-[15px] font-semibold text-dc-text-heading truncate flex-1">
          {{ roomStore.selectedChannelName || t('channel.selectChannel') }}
        </h1>

        <div v-if="roomStore.selectedChannelId" class="flex items-center gap-2">
          <div
            :class="[
              'w-2 h-2 rounded-full',
              signalingStore.isConnected ? 'bg-dc-green' : 'bg-dc-red',
            ]"
          />
          <span class="text-xs text-dc-text-muted hidden sm:inline">{{
            signalingStore.isConnected ? t('common.connected') : t('common.disconnected')
          }}</span>
        </div>

        <!-- Mobile chat toggle -->
        <button
          v-if="roomStore.selectedChannelId"
          @click="sidebarStore.toggleChat()"
          class="w-7 h-7 flex items-center justify-center text-dc-text-muted hover:text-dc-text transition-colors"
          :title="t('channel.toggleChat')"
        >
          <font-awesome-icon icon="comment" class="text-lg" />
        </button>
      </div>

      <!-- Empty state -->
      <div
        v-if="!roomStore.selectedChannelId"
        class="flex-1 flex items-center justify-center bg-dc-bg-primary"
      >
        <div class="text-center max-w-sm px-8">
          <font-awesome-icon
            icon="volume-high"
            class="text-7xl mx-auto mb-4 text-dc-text-muted/30"
          />
          <h2 class="text-xl font-semibold text-dc-text-heading mb-2">
            {{ t('channel.noChannelSelected') }}
          </h2>
          <p class="text-dc-text-muted text-sm">{{ t('channel.selectVoiceChannelHint') }}</p>
        </div>
      </div>

      <!-- Channel content -->
      <template v-else>
        <audio ref="audioElement" :src="connectSound" />
        <audio ref="disconnectAudioElement" :src="disconnectSound" />
        <audio ref="screencastAudioElement" :src="screencastStartSound" />

        <div class="flex-1 min-h-0 flex flex-col bg-dc-bg-primary">
          <!-- Not in call -->
          <div
            v-if="!callStore.isInCall"
            class="flex-1 flex items-center justify-center min-h-[200px] overflow-y-auto"
          >
            <div class="text-center px-4 max-w-md">
              <div v-if="roomStore.roommates.length" class="mb-6">
                <p class="text-dc-text-muted mb-3 text-sm">
                  {{ t('channel.connectedParticipants') }}
                </p>
                <div class="flex flex-wrap gap-2 justify-center">
                  <span
                    v-for="(user, i) in roomStore.roommates"
                    :key="i"
                    class="px-3 py-1 rounded-full bg-dc-bg-secondary text-dc-text text-sm"
                  >
                    {{ user }}
                  </span>
                </div>
              </div>
              <div v-else class="mb-6">
                <p class="text-dc-text-muted text-sm">{{ t('channel.noOneInChannel') }}</p>
              </div>

              <button
                @click="startCall"
                :disabled="!roomStore.selectedChannelId"
                class="px-8 py-3 rounded-full bg-dc-green hover:bg-dc-green/80 disabled:opacity-40 text-white font-medium text-sm transition-colors shadow-lg"
              >
                {{ t('channel.joinVoice') }}
              </button>
            </div>
          </div>

          <!-- In call -->
          <div v-else class="flex-1 min-h-0 flex flex-col overflow-hidden">
            <!-- Available Screen Shares bar -->
            <div
              v-if="availableScreenShares.length > 0"
              class="flex-shrink-0 px-4 py-3 border-b border-dc-separator/40 bg-dc-bg-secondary"
            >
              <h3 class="text-xs font-bold uppercase tracking-wider text-dc-text-muted mb-3">
                {{ t('channel.screenSharingAvailable') }}
              </h3>
              <div class="flex flex-wrap gap-3">
                <div
                  v-for="share in availableScreenShares"
                  :key="share.peerId"
                  class="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-dc-bg-tertiary border border-dc-separator/40 hover:border-dc-separator transition-colors"
                >
                  <font-awesome-icon icon="desktop" class="text-dc-blurple text-base" />
                  <span class="text-sm font-medium text-dc-text-heading">{{ share.name }}</span>
                  <span class="text-xs text-dc-text-muted">{{ t('channel.isSharingScreen') }}</span>
                  <button
                    @click="watchStream(share.peerId)"
                    class="ml-auto px-4 py-1.5 rounded text-xs font-medium bg-dc-blurple hover:bg-dc-blurple-hover text-white transition-colors flex items-center gap-1.5"
                  >
                    <font-awesome-icon icon="desktop" class="text-xs" />
                    <span>{{ t('channel.watch') }}</span>
                  </button>
                </div>
              </div>
            </div>

            <!-- "You are streaming" banner (when screen sharing and own preview is hidden) -->
            <div
              v-if="isScreenSharing && !showLocalPreview"
              class="flex-shrink-0 flex items-center gap-3 px-4 py-2 bg-dc-red/10 border-b border-dc-red/20"
            >
              <div class="flex items-center gap-1.5">
                <div class="w-2 h-2 rounded-full bg-dc-red animate-pulse" />
                <span class="text-dc-red text-xs font-bold uppercase tracking-wide">{{
                  t('common.live')
                }}</span>
              </div>
              <span class="text-dc-text-muted text-sm flex-1">{{ t('call.youAreStreaming') }}</span>
              <button
                @click="showLocalPreview = true"
                class="flex items-center gap-1.5 px-3 py-1 rounded text-xs bg-dc-bg-floating hover:bg-dc-bg-hover text-dc-text transition-colors"
              >
                <font-awesome-icon icon="eye" class="text-[10px]" />
                {{ t('call.showPreview') }}
              </button>
            </div>

            <!-- Main area: video tiles -->
            <template v-if="peersWithVideo.length > 0">
              <!-- Video grid — fills all remaining space -->
              <div class="flex-1 min-h-0 relative">
                <div
                  class="absolute inset-2 sm:inset-3 lg:inset-4 grid gap-2 sm:gap-3"
                  :style="videoGridStyle"
                >
                  <template v-for="(peer, index) in peersWithVideo" :key="peer.peerId || index">
                    <div class="relative rounded-lg overflow-hidden bg-dc-bg-secondary-alt">
                      <VideoTile
                        v-if="peer.isLocal && localStream"
                        :condition-video="true"
                        :condition-audio="localStream.getAudioTracks().length > 0"
                        :stream="localStream"
                        :key-id="localStream.id"
                        :muted="true"
                        :show-hide-preview="isScreenSharing"
                        @hide-preview="showLocalPreview = false"
                      />
                      <VideoTile
                        v-else
                        :condition-video="true"
                        :condition-audio="peer.remoteStream?.getAudioTracks().length"
                        :stream="peer.remoteStream!"
                        :key-id="peer.peerId"
                        :muted="peerPlayback[peer.peerId]?.muted ?? false"
                        :volume="peerPlayback[peer.peerId]?.volume ?? 1"
                        :audio-stream="peerAudioStreams[peer.peerId]"
                        :is-screen-sharing="watchingPeerIds.has(peer.peerId)"
                        :is-deafened="isDeafened"
                        @update:muted="handlePeerMuteChange(peer.peerId, $event)"
                        @update:volume="handlePeerVolumeChange(peer.peerId, $event)"
                        @stop-watching="unwatchStream(peer.peerId)"
                      />
                      <UserBadge
                        v-if="peer.isLocal"
                        :condition-show="!audioEnabled"
                        :name="`${t('common.you')} (${props.userName})`"
                        :speaking="isLocalSpeaking"
                      />
                      <UserBadge
                        v-else
                        :condition-show="
                          peerStates[peer.peerId] &&
                          typeof peerStates[peer.peerId]?.microphone === 'boolean' &&
                          !peerStates[peer.peerId]?.microphone
                        "
                        :name="
                          roomStore.participants.find((p) => p.client_id === peer.peerId)
                            ?.username || peer.peerId
                        "
                        :speaking="speakingPeers[peer.peerId]"
                      />
                    </div>
                  </template>
                </div>
              </div>

              <!-- Participants without video — collapsible strip at bottom -->
              <div
                v-if="peersWithoutVideo.length > 0"
                class="flex-shrink-0 border-t border-dc-separator/30"
              >
                <button
                  @click="showParticipantsPanel = !showParticipantsPanel"
                  class="w-full flex items-center justify-between px-4 py-2 hover:bg-dc-bg-hover/40 transition-colors"
                >
                  <span class="text-[11px] font-bold uppercase tracking-wider text-dc-text-muted">
                    {{ t('common.participants') }} · {{ peersWithoutVideo.length }}
                  </span>
                  <font-awesome-icon
                    :icon="showParticipantsPanel ? 'chevron-down' : 'chevron-up'"
                    class="text-dc-text-muted text-xs"
                  />
                </button>
                <div
                  v-if="showParticipantsPanel"
                  class="px-3 pb-3 flex flex-wrap justify-center gap-2"
                >
                  <div
                    v-for="(p, i) in peersWithoutVideo"
                    :key="p.peerId || i"
                    class="w-[calc(50%-4px)] sm:w-[152px]"
                  >
                    <ParticipantCard
                      :name="p.name"
                      :is-muted="p.isMuted"
                      :is-speaking="p.isSpeaking"
                      :is-local="p.isLocal"
                      :peer-id="p.peerId"
                      :volume="p.volume"
                      :audio-stream="p.audioStream"
                      :is-connecting="p.isConnecting"
                      :is-deafened="isDeafened"
                      @update:muted="handlePeerMuteChange(p.peerId, $event)"
                      @update:volume="handlePeerVolumeChange(p.peerId, $event)"
                    />
                  </div>
                </div>
              </div>
            </template>

            <!-- No video tiles — participants fill the area -->
            <template v-else-if="peersWithoutVideo.length > 0">
              <div class="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6 flex items-center">
                <div class="w-full flex flex-wrap justify-center gap-2 lg:gap-3 content-center">
                  <div
                    v-for="(p, i) in peersWithoutVideo"
                    :key="p.peerId || i"
                    class="w-[calc(50%-4px)] sm:w-[152px] lg:w-[168px] 2xl:w-[184px]"
                  >
                    <ParticipantCard
                      :name="p.name"
                      :is-muted="p.isMuted"
                      :is-speaking="p.isSpeaking"
                      :is-local="p.isLocal"
                      :peer-id="p.peerId"
                      :volume="p.volume"
                      :audio-stream="p.audioStream"
                      :is-connecting="p.isConnecting"
                      :is-deafened="isDeafened"
                      @update:muted="handlePeerMuteChange(p.peerId, $event)"
                      @update:volume="handlePeerVolumeChange(p.peerId, $event)"
                    />
                  </div>
                </div>
              </div>
            </template>

            <!-- Empty in call -->
            <template v-else>
              <div class="flex-1 flex items-center justify-center">
                <p class="text-dc-text-muted text-sm">{{ t('channel.waitingForParticipants') }}</p>
              </div>
            </template>
          </div>
        </div>

        <!-- Call controls -->
        <CallControls
          v-if="callStore.isInCall"
          :local-stream="localStream"
          :remote-peers="remotePeers"
          :videoEnabled="videoEnabled"
          :audioEnabled="audioEnabled"
          :isDeafened="isDeafened"
          :videoStreamIndex="videoStreamIndex"
          :currentCameraDeviceId="currentCameraDeviceId"
          :currentMicrophoneDeviceId="currentMicrophoneDeviceId"
          :isScreenSharing="isScreenSharing"
          :stopScreenShare="stopScreenShare"
          @endCall="endCall"
          @requestScreenShare="handleRequestScreenShare"
          @toggleDeafen="toggleDeafen"
          @update:toggleVideo="toggleVideo"
          @update:toggleMicrophone="toggleMicrophone"
          @update:videoEnabled="(v: boolean) => (videoEnabled = v)"
          @update:audioEnabled="(v: boolean) => (audioEnabled = v)"
          @update:selectCamera="selectCamera"
          @update:selectMicrophone="selectMicrophone"
          @update:videoStreamIndex="(v: number) => (videoStreamIndex = v)"
        />
      </template>
    </div>

    <!-- Chat panel (desktop) -->
    <div
      v-if="sidebarStore.chatOpen"
      class="hidden lg:flex w-80 2xl:w-96 3xl:w-[420px] border-l border-dc-separator/40 flex-shrink-0"
    >
      <ChatPanel :room-id="roomStore.selectedChannelId" :user-name="props.userName" />
    </div>

    <!-- Chat panel (mobile overlay) -->
    <Transition name="slide-left">
      <div
        v-if="sidebarStore.chatOpen && sidebarStore.isMobile"
        class="lg:hidden fixed inset-0 z-50 flex flex-col bg-dc-bg-primary"
      >
        <div class="h-12 px-4 flex items-center justify-between border-b border-dc-separator/40">
          <h2 class="text-[15px] font-semibold text-dc-text-heading">{{ t('channel.chat') }}</h2>
          <button
            @click="sidebarStore.toggleChat()"
            class="w-7 h-7 flex items-center justify-center text-dc-text-muted hover:text-dc-text transition-colors"
          >
            <font-awesome-icon icon="xmark" class="text-lg" />
          </button>
        </div>
        <div class="flex-1 overflow-hidden min-h-0">
          <ChatPanel :room-id="roomStore.selectedChannelId" :user-name="props.userName" />
        </div>
      </div>
    </Transition>

    <!-- Electron Screen Picker (replaces browser picker when in Electron) -->
    <ElectronScreenPicker
      v-if="showElectronPicker"
      @start="handleStartElectronCapture"
      @cancel="handleCancelScreenShare"
    />

    <!-- Screen Share Modal (web / browser only) -->
    <ScreenShareModal
      v-if="showScreenShareModal"
      :audio-devices="audioDevices"
      :current-microphone-device-id="currentMicrophoneDeviceId"
      @start="handleStartScreenShare"
      @cancel="handleCancelScreenShare"
    />
  </div>
</template>

<style scoped>
.slide-left-enter-active,
.slide-left-leave-active {
  transition: transform 0.2s ease-out;
}
.slide-left-enter-from {
  transform: translateX(100%);
}
.slide-left-leave-to {
  transform: translateX(100%);
}
</style>
