<script setup lang="ts">
import { SignalingService, type ErrorResponse, type RoomJoinResponse } from '@/api'
import connectSound from '@/assets/sound/connect.wav'
import { useWebRTC } from '@/shared/lib/useWebRTC'
import { useCallStore } from '@/shared/stores/callStore'
import { useChatStore } from '@/shared/stores/chatStore'
import { useRoomStore } from '@/shared/stores/roomStore'
import { useSidebarStore } from '@/shared/stores/sidebarStore'
import { useSignalingStore } from '@/shared/stores/signalingStore'
import { useVoiceStateStore } from '@/shared/stores/voiceStateStore'
import UserBadge from '@/entities/participant/UserBadge.vue'
import VideoTile from '@/entities/participant/VideoTile.vue'
import ParticipantCard from '@/entities/participant/ParticipantCard.vue'
import CallControls from './CallControls.vue'
import ScreenShareModal, { type ScreenShareOptions } from './ScreenShareModal.vue'
import ChatPanel from '@/widgets/chat/ChatPanel.vue'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{ userName: string | undefined }>()

const roomStore = useRoomStore()
const signalingStore = useSignalingStore()
const callStore = useCallStore()
const chatStore = useChatStore()
const sidebarStore = useSidebarStore()
const voiceStateStore = useVoiceStateStore()

const {
  localStream, remotePeers, peerStates, peerPlayback, peerAudioStreams,
  videoDevices, audioDevices, fetchVideoDevices, fetchAudioDevices, stopMedia, switchMicrophone,
  isScreenSharing, startScreenShare, stopScreenShare, joinRoomWithMedia,
  speakingPeers, isLocalSpeaking, switchCamera, toggleMedia, leaveRoom,
  setPeerVolume, setPeerMuted, watchingStreams, watchStream, unwatchStream,
} = useWebRTC()

const videoEnabled = ref(false)
const audioEnabled = ref(true)
const audioElement = ref<HTMLAudioElement | null>(null)
const currentCameraDeviceId = ref<string | null>(null)
const currentMicrophoneDeviceId = ref<string | null>(null)
const videoStreamIndex = ref(0)
const showChatMobile = ref(false)
const showScreenShareModal = ref(false)

type PeerWithVideo = {
  peerId: string; connection: RTCPeerConnection | null; remoteStream: MediaStream
  room_mates?: Record<string, string>; isLocal: boolean
}

const peersWithVideo = computed<PeerWithVideo[]>(() => {
  const result: PeerWithVideo[] = []
  const localClientId = signalingStore.clientId
  if (localStream.value && localStream.value.getVideoTracks().length > 0 && localClientId) {
    result.push({ peerId: localClientId, connection: null, remoteStream: localStream.value, room_mates: {}, isLocal: true })
  }
  remotePeers.value.forEach((peer) => {
    if (peer.remoteStream && peer.remoteStream.getVideoTracks().length > 0) {
      // Check if peer is screen sharing
      const isScreenSharing = peerStates.value[peer.peerId]?.screen === true
      const isWatching = watchingStreams.value.has(peer.peerId)
      // Only show video if it's not screen sharing, or if user is watching this stream
      if (!isScreenSharing || isWatching) {
        result.push({ peerId: peer.peerId, connection: peer.connection, remoteStream: peer.remoteStream, room_mates: peer.room_mates, isLocal: false })
      }
    }
  })
  return result
})

// Available screen sharing streams (not being watched)
const availableScreenShares = computed(() => {
  return remotePeers.value
    .filter(peer => {
      const isScreenSharing = peerStates.value[peer.peerId]?.screen === true
      // Show available streams even if video track hasn't arrived yet
      // Video track will be blocked in ontrack until user watches
      return isScreenSharing && !watchingStreams.value.has(peer.peerId)
    })
    .map(peer => {
      const name = signalingStore.room_mates[peer.peerId] || 
                   roomStore.participants.find(p => p.client_id === peer.peerId)?.username || 
                   peer.peerId
      return { peerId: peer.peerId, name }
    })
})

type PeerWithoutVideo = {
  peerId: string; name: string; isMuted: boolean; isSpeaking: boolean
  isLocal: boolean; volume?: number; audioStream?: MediaStream
}

const peersWithoutVideo = computed<PeerWithoutVideo[]>(() => {
  const result: PeerWithoutVideo[] = []
  const localClientId = signalingStore.clientId
  if ((!localStream.value || localStream.value.getVideoTracks().length === 0) && localClientId) {
    result.push({ peerId: localClientId, name: props.userName || 'You', isMuted: !audioEnabled.value, isSpeaking: isLocalSpeaking.value, isLocal: true })
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
      result.push({
        peerId, name: name || peerId, isMuted, isSpeaking: speakingPeers.value[peerId] || false,
        isLocal: false, volume: playback?.volume ?? 1, audioStream: peerAudioStreams.value[peerId],
      })
    }
  })
  return result
})

const videoTileClass = computed(() => {
  const base = 'relative bg-dc-bg-secondary-alt rounded-lg overflow-hidden aspect-video transition-all duration-300'
  const count = peersWithVideo.value.length
  if (count === 1) return base + ' w-full sm:w-[85%] md:w-[75%] lg:w-[65%] xl:w-[60%] 2xl:w-[55%] 3xl:w-[50%] max-w-[1200px]'
  if (count <= 2) return base + ' w-full sm:w-[48%] md:w-[47%] lg:w-[46%] xl:w-[45%] 2xl:w-[44%] 3xl:w-[42%] max-w-[960px]'
  if (count <= 4) return base + ' w-full sm:w-[48%] md:w-[47%] lg:w-[47%] xl:w-[46%] 2xl:w-[46%] 3xl:w-[44%] max-w-[760px]'
  if (count <= 6) return base + ' w-full sm:w-[48%] md:w-[31%] lg:w-[31%] xl:w-[31%] 2xl:w-[31%] 3xl:w-[30%] max-w-[620px]'
  return base + ' w-full sm:w-[48%] md:w-[31%] lg:w-[23%] xl:w-[23%] 2xl:w-[22%] 3xl:w-[19%] max-w-[520px]'
})

function selectCamera(deviceId: string) {
  currentCameraDeviceId.value = deviceId; videoEnabled.value = true
  if (callStore.isInCall) switchCamera(deviceId)
  toggleMedia(videoEnabled.value, audioEnabled.value, deviceId)
}
function selectMicrophone(deviceId: string) {
  currentMicrophoneDeviceId.value = deviceId
  if (callStore.isInCall) switchMicrophone(deviceId)
}
function handlePeerMuteChange(peerId: string, muted: boolean) { setPeerMuted(peerId, muted) }
function handlePeerVolumeChange(peerId: string, volume: number) { setPeerVolume(peerId, volume) }

function toggleVideo() {
  if (!currentCameraDeviceId.value && localStream.value && !videoEnabled.value) {
    selectCamera(videoDevices.value[0]?.deviceId || ''); videoEnabled.value = true
  } else if (currentCameraDeviceId.value && localStream.value && !videoEnabled.value) {
    selectCamera(currentCameraDeviceId.value); videoEnabled.value = true
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
    if (t) { t.enabled = !t.enabled; audioEnabled.value = t.enabled }
  }
  toggleMedia(videoEnabled.value, audioEnabled.value, currentCameraDeviceId.value || '')
}

async function startCall() {
  if (!roomStore.selectedChannelId) return
  await connectToRoom(roomStore.selectedChannelId)
  try {
    await joinRoomWithMedia(roomStore.selectedChannelId, props.userName, {
      video: videoEnabled.value,
      audio: audioEnabled.value ? { echoCancellation: true, noiseSuppression: true, autoGainControl: true } : false,
    })
    callStore.setStateCall(true)
    roomStore.getListChannels()
    toggleMedia(videoEnabled.value, audioEnabled.value, currentCameraDeviceId.value || '')
  } catch (error) {
    console.error('Failed to start call:', error)
  }
}

function endCall() {
  leaveRoom(); stopMedia(); roomStore.getListChannels()
  videoEnabled.value = false; audioEnabled.value = true; callStore.setStateCall(false)
  voiceStateStore.clear()
}

function handleRequestScreenShare() {
  showScreenShareModal.value = true
}

async function handleStartScreenShare(options: ScreenShareOptions) {
  showScreenShareModal.value = false
  try {
    await startScreenShare(options)
  } catch (error) {
    console.error('Failed to start screen share:', error)
  }
}

function handleCancelScreenShare() {
  showScreenShareModal.value = false
}

function isErrorResponse(r: RoomJoinResponse | ErrorResponse): r is ErrorResponse { return 'error' in r }

async function connectToRoom(id: string | undefined) {
  if (!id) return
  try {
    const response = await SignalingService.joinRoom(id)
    if (isErrorResponse(response)) throw response
    if (response.client_id && response.room_id) {
      await roomStore.setClientAndRoomId(response.client_id, id)
      if (!signalingStore.isConnected) { signalingStore.connect(); await new Promise((r) => setTimeout(r, 1000)) }
      signalingStore.joinRoom(id)
    }
  } catch (e) { console.error(e) }
}

watch(() => roomStore.selectedChannelId, (newId, oldId) => {
  if (oldId && newId !== oldId && callStore.isInCall) endCall()
})
watch(() => callStore.isInCall, (inCall) => {
  if (inCall && audioElement.value) audioElement.value.play().catch(() => {})
})
watch(() => remotePeers.value.length, (n, o) => {
  if (n > o && audioElement.value) audioElement.value.play().catch(() => {})
})

watch(() => roomStore.selectedChannelId, async (newId, oldId) => {
  if (newId && newId !== oldId) await roomStore.getRoomParticipants(newId)
  else if (!newId) { roomStore.setRoommates([]); roomStore.setParticipants([]) }
}, { immediate: true })

let participantsRefreshInterval: ReturnType<typeof setInterval> | null = null
watch(
  () => [roomStore.selectedChannelId, callStore.isInCall],
  ([channelId, isInCall]) => {
    if (participantsRefreshInterval) { clearInterval(participantsRefreshInterval); participantsRefreshInterval = null }
    if (typeof channelId === 'string' && channelId && isInCall) {
      roomStore.getRoomParticipants(channelId)
      participantsRefreshInterval = setInterval(() => {
        if (roomStore.selectedChannelId && callStore.isInCall) roomStore.getRoomParticipants(roomStore.selectedChannelId)
      }, 5000)
    }
  },
  { immediate: true },
)

// Sync speaking state to voiceStateStore for sidebar
watch(
  [speakingPeers, isLocalSpeaking, () => signalingStore.room_mates, () => callStore.isInCall],
  () => {
    if (!callStore.isInCall) { voiceStateStore.updateSpeaking({}); return }
    const states: Record<string, boolean> = {}
    if (props.userName) states[props.userName] = isLocalSpeaking.value
    for (const [peerId, speaking] of Object.entries(speakingPeers.value)) {
      const name = signalingStore.room_mates[peerId] || roomStore.participants.find(p => p.client_id === peerId)?.username
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
    if (!callStore.isInCall) { voiceStateStore.updateScreenSharing({}); return }
    const states: Record<string, boolean> = {}
    if (props.userName) states[props.userName] = isScreenSharing.value
    for (const [peerId, state] of Object.entries(peerStates.value)) {
      const name = signalingStore.room_mates[peerId] || roomStore.participants.find(p => p.client_id === peerId)?.username
      if (name && typeof state.screen === 'boolean') states[name] = state.screen
    }
    voiceStateStore.updateScreenSharing(states)
  },
  { deep: true },
)

// Sync muted state to voiceStateStore for sidebar
watch(
  [peerStates, audioEnabled, () => signalingStore.room_mates, () => callStore.isInCall],
  () => {
    if (!callStore.isInCall) { voiceStateStore.updateMuted({}); return }
    const states: Record<string, boolean> = {}
    if (props.userName) states[props.userName] = !audioEnabled.value
    for (const [peerId, state] of Object.entries(peerStates.value)) {
      const name = signalingStore.room_mates[peerId] || roomStore.participants.find(p => p.client_id === peerId)?.username
      if (name && typeof state.microphone === 'boolean') states[name] = !state.microphone
    }
    voiceStateStore.updateMuted(states)
  },
  { deep: true },
)

onMounted(() => {
  fetchVideoDevices(); fetchAudioDevices()
  if (roomStore.selectedChannelId) roomStore.getRoomParticipants(roomStore.selectedChannelId)
})

onBeforeUnmount(() => {
  if (participantsRefreshInterval) clearInterval(participantsRefreshInterval)
  if (callStore.isInCall) endCall()
  stopMedia(); leaveRoom()
  voiceStateStore.clear()
})
</script>

<template>
  <div class="flex h-full">
    <!-- Main voice area -->
    <div class="flex flex-col flex-1 min-w-0">
      <!-- Header bar -->
      <div class="h-12 2xl:h-14 px-4 2xl:px-6 flex items-center gap-3 shadow-[0_1px_0_rgba(4,4,5,0.2),0_1.5px_0_rgba(6,6,7,0.05)] bg-dc-bg-primary flex-shrink-0 z-10">
        <button
          v-if="sidebarStore.isMobile"
          @click="sidebarStore.toggle"
          class="w-7 h-7 flex items-center justify-center text-dc-text-muted hover:text-dc-text transition-colors lg:hidden"
        >
          <font-awesome-icon icon="bars" class="text-lg" />
        </button>

        <!-- Voice icon -->
        <font-awesome-icon icon="volume-high" class="text-dc-text-muted flex-shrink-0 text-[16px]" />

        <h1 class="text-[15px] font-semibold text-dc-text-heading truncate flex-1">
          {{ roomStore.selectedChannelName || 'Select a channel' }}
        </h1>

        <div v-if="roomStore.selectedChannelId" class="flex items-center gap-2">
          <div :class="['w-2 h-2 rounded-full', signalingStore.isConnected ? 'bg-dc-green' : 'bg-dc-red']" />
          <span class="text-xs text-dc-text-muted hidden sm:inline">{{ signalingStore.isConnected ? 'Connected' : 'Disconnected' }}</span>
        </div>

        <!-- Mobile chat toggle -->
        <button
          v-if="roomStore.selectedChannelId"
          @click="sidebarStore.toggleChat()"
          class="w-7 h-7 flex items-center justify-center text-dc-text-muted hover:text-dc-text transition-colors"
          title="Toggle Chat"
        >
          <font-awesome-icon icon="comment" class="text-lg" />
        </button>
      </div>

      <!-- Empty state -->
      <div v-if="!roomStore.selectedChannelId" class="flex-1 flex items-center justify-center bg-dc-bg-primary">
        <div class="text-center max-w-sm px-8">
          <font-awesome-icon icon="volume-high" class="text-7xl mx-auto mb-4 text-dc-text-muted/30" />
          <h2 class="text-xl font-semibold text-dc-text-heading mb-2">No channel selected</h2>
          <p class="text-dc-text-muted text-sm">Select a voice channel from the sidebar to get started</p>
        </div>
      </div>

      <!-- Channel content -->
      <template v-else>
        <audio ref="audioElement" :src="connectSound" />

        <div class="flex-1 overflow-auto bg-dc-bg-primary">
          <!-- Not in call -->
          <div v-if="!callStore.isInCall" class="flex items-center justify-center h-full min-h-[200px]">
            <div class="text-center px-4 max-w-md">
              <div v-if="roomStore.roommates.length" class="mb-6">
                <p class="text-dc-text-muted mb-3 text-sm">Connected participants:</p>
                <div class="flex flex-wrap gap-2 justify-center">
                  <span
                    v-for="(user, i) in roomStore.roommates" :key="i"
                    class="px-3 py-1 rounded-full bg-dc-bg-secondary text-dc-text text-sm"
                  >
                    {{ user }}
                  </span>
                </div>
              </div>
              <div v-else class="mb-6">
                <p class="text-dc-text-muted text-sm">No one is in this channel yet</p>
              </div>

              <button
                @click="startCall"
                :disabled="!roomStore.selectedChannelId"
                class="px-8 py-3 rounded-full bg-dc-green hover:bg-dc-green/80 disabled:opacity-40 text-white font-medium text-sm transition-colors shadow-lg"
              >
                Join Voice
              </button>
            </div>
          </div>

          <!-- In call -->
          <div v-else class="flex flex-col min-h-0 h-auto sm:h-full overflow-hidden overflow-y-auto">
            <!-- Available Screen Shares (at top for visibility) -->
            <div
              v-if="availableScreenShares.length > 0"
              class="flex-shrink-0 px-4 py-3 border-b border-dc-separator/40 bg-dc-bg-secondary"
            >
              <h3 class="text-xs font-bold uppercase tracking-wider text-dc-text-muted mb-3">
                Screen Sharing Available
              </h3>
              <div class="flex flex-wrap gap-3">
                <div
                  v-for="share in availableScreenShares"
                  :key="share.peerId"
                  class="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-dc-bg-tertiary border border-dc-separator/40 hover:border-dc-separator transition-colors"
                >
                  <font-awesome-icon icon="desktop" class="text-dc-blurple text-base" />
                  <span class="text-sm font-medium text-dc-text-heading">{{ share.name }}</span>
                  <span class="text-xs text-dc-text-muted">is sharing their screen</span>
                  <button
                    @click="watchStream(share.peerId)"
                    class="ml-auto px-4 py-1.5 rounded text-xs font-medium bg-dc-blurple hover:bg-dc-blurple-hover text-white transition-colors flex items-center gap-1.5"
                  >
                    <font-awesome-icon icon="desktop" class="text-xs" />
                    <span>Watch</span>
                  </button>
                </div>
              </div>
            </div>

            <!-- Video grid -->
            <div
              v-if="peersWithVideo.length > 0"
              class="flex-shrink-0 sm:flex-1 sm:min-h-0 flex flex-wrap justify-center content-center items-center gap-2 sm:gap-3 lg:gap-4 2xl:gap-5 p-2 sm:p-4 lg:p-6 2xl:p-8"
            >
              <template v-for="(peer, index) in peersWithVideo" :key="peer.peerId || index">
                <div :class="videoTileClass">
                  <VideoTile
                    v-if="peer.isLocal && localStream"
                    :condition-video="true"
                    :condition-audio="localStream.getAudioTracks().length > 0"
                    :stream="localStream" :key-id="localStream.id" :muted="true"
                  />
                  <VideoTile
                    v-else
                    :condition-video="true"
                    :condition-audio="peer.remoteStream?.getAudioTracks().length"
                    :stream="peer.remoteStream!" :key-id="peer.peerId"
                    :muted="peerPlayback[peer.peerId]?.muted ?? false"
                    :volume="peerPlayback[peer.peerId]?.volume ?? 1"
                    :audio-stream="peerAudioStreams[peer.peerId]"
                    @update:muted="handlePeerMuteChange(peer.peerId, $event)"
                    @update:volume="handlePeerVolumeChange(peer.peerId, $event)"
                  />
                  <!-- Unwatch button for screen sharing streams -->
                  <button
                    v-if="!peer.isLocal && peerStates[peer.peerId]?.screen === true && watchingStreams.has(peer.peerId)"
                    @click="unwatchStream(peer.peerId)"
                    class="absolute top-2 right-2 z-10 px-2 py-1 rounded bg-dc-bg-floating/90 hover:bg-dc-bg-floating text-white text-xs font-medium transition-colors flex items-center gap-1"
                    title="Stop watching"
                  >
                    <font-awesome-icon icon="xmark" class="text-xs" />
                    <span>Unwatch</span>
                  </button>
                  <UserBadge
                    v-if="peer.isLocal"
                    :condition-show="!audioEnabled"
                    :name="`You (${props.userName})`"
                    :speaking="isLocalSpeaking"
                  />
                  <UserBadge
                    v-else
                    :condition-show="peerStates[peer.peerId] && typeof peerStates[peer.peerId]?.microphone === 'boolean' && !peerStates[peer.peerId]?.microphone"
                    :name="roomStore.participants.find(p => p.client_id === peer.peerId)?.username || peer.peerId"
                    :speaking="speakingPeers[peer.peerId]"
                  />
                </div>
              </template>
            </div>

            <!-- Participants without video -->
            <div
              v-if="peersWithoutVideo.length > 0"
              class="flex-shrink-0 sm:flex-1 min-h-[180px] sm:min-h-0 overflow-y-auto p-2 sm:p-4 lg:p-6 2xl:p-8"
            >
              <div class="max-w-[1800px] mx-auto w-full flex flex-col justify-center min-h-full sm:min-h-0">
                <h3 v-if="peersWithVideo.length > 0" class="text-[11px] font-bold uppercase tracking-wider text-dc-text-muted mb-3 px-2">
                  Participants
                </h3>
                <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 3xl:grid-cols-8 gap-2 lg:gap-3 2xl:gap-4 place-content-center">
                  <ParticipantCard
                    v-for="(p, i) in peersWithoutVideo" :key="p.peerId || i"
                    :name="p.name" :is-muted="p.isMuted" :is-speaking="p.isSpeaking"
                    :is-local="p.isLocal" :peer-id="p.peerId"
                    :volume="p.volume" :audio-stream="p.audioStream"
                    @update:muted="handlePeerMuteChange(p.peerId, $event)"
                    @update:volume="handlePeerVolumeChange(p.peerId, $event)"
                  />
                </div>
              </div>
            </div>

            <!-- Empty in call -->
            <div v-if="peersWithVideo.length === 0 && peersWithoutVideo.length === 0 && availableScreenShares.length === 0" class="flex-1 flex items-center justify-center">
              <p class="text-dc-text-muted text-sm">Waiting for participants...</p>
            </div>
          </div>
        </div>

        <!-- Call controls -->
        <CallControls
          v-if="callStore.isInCall"
          :local-stream="localStream" :remote-peers="remotePeers"
          :videoEnabled="videoEnabled" :audioEnabled="audioEnabled"
          :videoStreamIndex="videoStreamIndex"
          :currentCameraDeviceId="currentCameraDeviceId"
          :currentMicrophoneDeviceId="currentMicrophoneDeviceId"
          :isScreenSharing="isScreenSharing"
          :stopScreenShare="stopScreenShare"
          @endCall="endCall"
          @requestScreenShare="handleRequestScreenShare"
          @update:toggleVideo="toggleVideo" @update:toggleMicrophone="toggleMicrophone"
          @update:videoEnabled="(v: boolean) => (videoEnabled = v)"
          @update:audioEnabled="(v: boolean) => (audioEnabled = v)"
          @update:selectCamera="selectCamera" @update:selectMicrophone="selectMicrophone"
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
        v-if="!sidebarStore.chatOpen === false && sidebarStore.isMobile"
        class="lg:hidden fixed inset-0 z-50 flex flex-col bg-dc-bg-primary"
      >
        <div class="h-12 px-4 flex items-center justify-between border-b border-dc-separator/40">
          <h2 class="text-[15px] font-semibold text-dc-text-heading">Chat</h2>
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

    <!-- Screen Share Modal -->
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
.slide-left-enter-active, .slide-left-leave-active { transition: transform 0.2s ease-out; }
.slide-left-enter-from { transform: translateX(100%); }
.slide-left-leave-to { transform: translateX(100%); }
</style>
