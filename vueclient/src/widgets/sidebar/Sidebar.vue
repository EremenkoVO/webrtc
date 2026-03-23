<script setup lang="ts">
import { SignalingService, type UserProfile } from '@/api/index'
import { useApiErrors } from '@/shared/lib/useApiErrors'
import { useCallStore } from '@/shared/stores/callStore'
import { useRoomStore } from '@/shared/stores/roomStore'
import { useSidebarStore } from '@/shared/stores/sidebarStore'
import { useSignalingStore } from '@/shared/stores/signalingStore'
import { useVoiceStateStore } from '@/shared/stores/voiceStateStore'
import { useWebRTC } from '@/shared/lib/useWebRTC'
import UserAvatar from '@/shared/ui/UserAvatar.vue'
import UserPanel from '@/widgets/user-panel/UserPanel.vue'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const { clearErrors, parseApiError } = useApiErrors()
const roomStore = useRoomStore()
const sidebarStore = useSidebarStore()
const callStore = useCallStore()
const voiceStateStore = useVoiceStateStore()
const signalingStore = useSignalingStore()

const { audioDevices, videoDevices, fetchAudioDevices, fetchVideoDevices } = useWebRTC()
const microphoneMenuOpen = ref(false)
const cameraMenuOpen = ref(false)

function toggleMicrophoneDeviceMenu() {
  microphoneMenuOpen.value = !microphoneMenuOpen.value
  if (microphoneMenuOpen.value) void fetchAudioDevices()
}

function closeMicrophoneMenu() {
  microphoneMenuOpen.value = false
}

function pickMicrophoneDevice(deviceId: string) {
  if (callStore.isInCall) {
    callStore.requestSelectMicrophone(deviceId)
  }
  microphoneMenuOpen.value = false
}

function toggleCameraDeviceMenu() {
  cameraMenuOpen.value = !cameraMenuOpen.value
  if (cameraMenuOpen.value) void fetchVideoDevices()
}

function closeCameraMenu() {
  cameraMenuOpen.value = false
}

function pickCameraDevice(deviceId: string) {
  if (callStore.isInCall) {
    callStore.requestSelectCamera(deviceId)
  }
  cameraMenuOpen.value = false
}

const props = defineProps<{ user: UserProfile }>()

const showCreateModal = ref(false)
const newChannelName = ref('')
const newChannelType = ref<'voice' | 'text'>('voice')
const searchQuery = ref('')
const isLoading = ref(false)

const showSwitchModal = ref(false)
const pendingSwitchChannelId = ref<string | undefined>()
const pendingSwitchRoommates = ref<string[] | undefined>()

// Context menu state
const contextMenuUser = ref<string | null>(null)
const contextMenuX = ref(0)
const contextMenuY = ref(0)

// Stream preview hover state
const hoveredStreamUser = ref<string | null>(null)
const previewCardY = ref(0)
let hoverLeaveTimer: ReturnType<typeof setTimeout> | null = null

// Resize state
const isResizing = ref(false)

const filteredChannels = computed(() => {
  if (!searchQuery.value.trim()) return roomStore.channels
  const q = searchQuery.value.toLowerCase()
  return roomStore.channels.filter((ch) => ch.name?.toLowerCase().includes(q))
})

const filteredVoiceChannels = computed(() =>
  filteredChannels.value.filter((ch) => (ch.type ?? 'voice') !== 'text'),
)

const filteredTextChannels = computed(() =>
  filteredChannels.value.filter((ch) => ch.type === 'text'),
)

function openCreateModal() {
  newChannelName.value = ''
  newChannelType.value = 'voice'
  showCreateModal.value = true
}

function closeCreateModal() {
  showCreateModal.value = false
  newChannelName.value = ''
  newChannelType.value = 'voice'
}

async function addChannel() {
  if (!newChannelName.value.trim()) return
  clearErrors()
  isLoading.value = true
  try {
    await SignalingService.createRoom({
      name: newChannelName.value.trim(),
      type: newChannelType.value,
    })
    await roomStore.getListChannels()
    closeCreateModal()
    searchQuery.value = ''
  } catch (e) {
    parseApiError(e)
  } finally {
    isLoading.value = false
  }
}

function selectChannel(channelId: string | undefined, roommates?: string[]) {
  if (!channelId) return
  if (channelId === roomStore.selectedChannelId) return

  const target = roomStore.channelById(channelId)
  const isTargetVoice = (target?.type ?? 'voice') !== 'text'

  if (isTargetVoice && callStore.isInCall && channelId !== roomStore.roomId) {
    pendingSwitchChannelId.value = channelId
    pendingSwitchRoommates.value = roommates
    showSwitchModal.value = true
    return
  }

  roomStore.selectChannel(channelId, roommates)
  sidebarStore.close()
}

function confirmSwitchChannel() {
  showSwitchModal.value = false
  if (pendingSwitchChannelId.value) {
    callStore.requestAutoJoin()
    roomStore.selectChannel(pendingSwitchChannelId.value, pendingSwitchRoommates.value)
    sidebarStore.close()
  }
  pendingSwitchChannelId.value = undefined
  pendingSwitchRoommates.value = undefined
}

function cancelSwitchChannel() {
  showSwitchModal.value = false
  pendingSwitchChannelId.value = undefined
  pendingSwitchRoommates.value = undefined
}

async function refreshChannels() {
  isLoading.value = true
  try {
    await roomStore.getListChannels()
  } catch (e) {
    parseApiError(e)
  } finally {
    isLoading.value = false
  }
}

function handleResize() {
  sidebarStore.checkMobile()
}

// Context menu helpers
function openContextMenu(event: MouseEvent, username: string) {
  if (!callStore.isInCall) return
  if (username === props.user.username) return
  contextMenuUser.value = username
  contextMenuX.value = Math.min(event.clientX, window.innerWidth - 176)
  contextMenuY.value = Math.min(event.clientY, window.innerHeight - 130)
}

function closeContextMenu() {
  contextMenuUser.value = null
}

function getVolumeForUser(username: string): number {
  return voiceStateStore.peerVolumeSettings[username]?.volume ?? 1
}

function isMutedByUs(username: string): boolean {
  return voiceStateStore.peerVolumeSettings[username]?.muted ?? false
}

function handleVolumeChange(username: string, raw: number) {
  const volume = raw / 100
  voiceStateStore.setPeerVolume(username, volume)
  if (volume > 0 && isMutedByUs(username)) voiceStateStore.setPeerMuted(username, false)
}

function handleMuteToggle(username: string) {
  voiceStateStore.setPeerMuted(username, !isMutedByUs(username))
}

// Stream preview helpers
function getScreenShareStream(username: string): MediaStream | null {
  return voiceStateStore.screenShareStreams[username] ?? null
}

function handleWatchStream(username: string, channelId: string | undefined, roommates?: string[]) {
  if (!callStore.isInCall || roomStore.selectedChannelId !== channelId) {
    selectChannel(channelId, roommates)
  } else {
    voiceStateStore.requestWatch(username)
  }
  hoveredStreamUser.value = null
}

function onParticipantRowEnter(event: MouseEvent, mate: string) {
  if (!voiceStateStore.isScreenSharing(mate)) return
  if (hoverLeaveTimer) {
    clearTimeout(hoverLeaveTimer)
    hoverLeaveTimer = null
  }
  hoveredStreamUser.value = mate
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  previewCardY.value = rect.top
}

function onParticipantRowLeave() {
  hoverLeaveTimer = setTimeout(() => {
    hoveredStreamUser.value = null
    hoverLeaveTimer = null
  }, 150)
}

function stopWatchingStream() {
  voiceStateStore.requestUnwatch(hoveredStreamUser.value!)
  hoveredStreamUser.value = null
}

function muteAndCloseMenu() {
  handleMuteToggle(contextMenuUser.value!)
  closeContextMenu()
}

function onPreviewCardEnter() {
  if (hoverLeaveTimer) {
    clearTimeout(hoverLeaveTimer)
    hoverLeaveTimer = null
  }
}

function onPreviewCardLeave() {
  hoveredStreamUser.value = null
}

function channelForUser(username: string) {
  return filteredChannels.value.find((c) => c.roommates?.includes(username))
}

// Resize handle
function onResizeStart(e: MouseEvent) {
  isResizing.value = true
  document.addEventListener('mousemove', onResizeMove)
  document.addEventListener('mouseup', onResizeEnd)
  e.preventDefault()
}

function onResizeMove(e: MouseEvent) {
  if (sidebarStore.isMobile) {
    onResizeEnd()
    return
  }
  sidebarStore.setWidth(e.clientX)
}

function onResizeEnd() {
  isResizing.value = false
  document.removeEventListener('mousemove', onResizeMove)
  document.removeEventListener('mouseup', onResizeEnd)
}

onMounted(() => {
  sidebarStore.checkMobile()
  window.addEventListener('resize', handleResize)
  refreshChannels()
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  if (hoverLeaveTimer) clearTimeout(hoverLeaveTimer)
  document.removeEventListener('mousemove', onResizeMove)
  document.removeEventListener('mouseup', onResizeEnd)
})

watch(
  () => roomStore.selectedChannelId,
  () => sidebarStore.close(),
)
</script>

<template>
  <!-- Overlay for mobile -->
  <Transition name="fade">
    <div
      v-if="sidebarStore.isMobile && sidebarStore.isOpen"
      class="fixed inset-0 bg-black/60 z-40 lg:hidden"
      @click="sidebarStore.close"
    />
  </Transition>

  <aside
    :class="[
      'fixed lg:relative inset-y-0 left-0 z-40 flex flex-col border-r border-dc-separator/80 shadow-[1px_0_0_rgba(0,0,0,0.28)] bg-dc-bg-secondary transition-transform duration-200 ease-out',
      sidebarStore.isMobile
        ? sidebarStore.isOpen
          ? 'translate-x-0 w-[280px]'
          : '-translate-x-full w-[280px]'
        : 'translate-x-0',
    ]"
    :style="!sidebarStore.isMobile ? { width: sidebarStore.width + 'px' } : {}"
  >
    <!-- Server header -->
    <div
      class="h-12 2xl:h-14 px-4 flex items-center shadow-[0_1px_0_rgba(4,4,5,0.2),0_1.5px_0_rgba(6,6,7,0.05),0_2px_0_rgba(4,4,5,0.05)] flex-shrink-0"
    >
      <h1 class="text-[15px] font-semibold text-dc-text-heading truncate flex-1">
        {{ t('sidebar.appTitle') }}
      </h1>
      <button
        @click="openCreateModal()"
        class="w-7 h-7 flex items-center justify-center rounded text-dc-text-muted hover:text-dc-text hover:bg-dc-bg-hover transition-colors"
        :title="t('common.createChannel')"
      >
        <font-awesome-icon icon="plus" class="text-base" />
      </button>
      <button
        v-if="sidebarStore.isMobile"
        @click="sidebarStore.close"
        class="ml-1 w-7 h-7 flex items-center justify-center text-dc-text-muted hover:text-dc-text transition-colors lg:hidden"
      >
        <font-awesome-icon icon="xmark" class="text-lg" />
      </button>
    </div>

    <!-- Channel list -->
    <div class="flex-1 overflow-y-auto pt-4 dc-scrollbar-thin">
      <!-- Search (compact) -->
      <div v-if="searchQuery || roomStore.channels.length > 5" class="px-2 mb-2">
        <input
          v-model="searchQuery"
          type="text"
          :placeholder="t('common.search')"
          class="w-full px-3 sm:px-2 py-2 sm:py-1 rounded bg-dc-bg-tertiary text-dc-text text-base sm:text-sm placeholder-dc-text-muted border-none outline-none focus:ring-1 focus:ring-dc-blurple/40"
        />
      </div>

      <!-- Loading -->
      <div v-if="isLoading && roomStore.channels.length === 0" class="px-2 py-8 text-center">
        <div class="text-dc-text-muted text-base sm:text-sm">
          {{ t('sidebar.loadingChannels') }}
        </div>
      </div>

      <!-- Empty -->
      <div v-else-if="filteredChannels.length === 0" class="px-2 py-4 text-center">
        <div class="text-dc-text-muted text-base sm:text-sm mb-3">
          {{ searchQuery ? t('common.noChannelsFound') : t('common.noChannelsYet') }}
        </div>
      </div>

      <template v-else>
        <!-- VOICE CHANNELS section -->
        <div v-if="filteredVoiceChannels.length > 0" class="mb-1">
          <div class="flex items-center px-2 mb-1">
            <font-awesome-icon
              icon="chevron-down"
              class="w-3 h-3 text-dc-text-muted mr-0.5 text-[10px]"
            />
            <span
              class="text-sm sm:text-[11px] font-bold uppercase tracking-wider text-dc-text-muted flex-1"
            >
              {{ t('common.voiceChannels') }}
            </span>
          </div>
          <div class="px-2 space-y-px">
            <div v-for="ch in filteredVoiceChannels" :key="ch.id || ''">
              <button
                @click="selectChannel(ch.id, ch.roommates)"
                :class="[
                  'w-full flex items-center gap-2 sm:gap-1.5 px-3 sm:px-2 py-2.5 sm:py-[6px] rounded group transition-colors text-left',
                  ch.id === roomStore.selectedChannelId
                    ? 'bg-dc-bg-active text-dc-text-heading'
                    : 'text-dc-text-muted hover:text-dc-text-secondary hover:bg-dc-bg-hover',
                ]"
              >
                <font-awesome-icon
                  icon="volume-high"
                  class="w-6 h-6 sm:w-5 sm:h-5 flex-shrink-0 opacity-70 text-lg sm:text-[16px]"
                />
                <span class="flex-1 text-base sm:text-[15px] truncate font-medium leading-5">{{
                  ch.name || t('common.unnamed')
                }}</span>
              </button>
              <!-- Participants list -->
              <div
                v-if="ch.roommates && ch.roommates.length > 0"
                class="ml-[22px] pl-2 border-l border-dc-bg-active/30"
              >
                <div
                  v-for="mate in ch.roommates"
                  :key="mate"
                  class="flex items-center gap-2 py-[3px] px-1.5 rounded group/user hover:bg-dc-bg-hover/50 transition-colors"
                  @contextmenu.prevent="openContextMenu($event, mate)"
                  @mouseenter="onParticipantRowEnter($event, mate)"
                  @mouseleave="onParticipantRowLeave()"
                >
                  <div class="relative flex-shrink-0">
                    <div
                      :class="[
                        'w-7 h-7 sm:w-6 sm:h-6 rounded-full overflow-hidden transition-all duration-200',
                        voiceStateStore.isSpeaking(mate) ? 'ring-[2.5px] ring-dc-green' : '',
                      ]"
                    >
                      <UserAvatar :username="mate" />
                    </div>
                    <div
                      v-if="voiceStateStore.isConnecting(mate)"
                      class="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-dc-blurple border-2 border-dc-bg-secondary-alt flex items-center justify-center"
                    >
                      <div class="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                    </div>
                  </div>
                  <span
                    :class="[
                      'flex-1 text-base sm:text-[13px] leading-4 truncate transition-colors',
                      voiceStateStore.isSpeaking(mate)
                        ? 'text-dc-text-heading'
                        : 'text-dc-text-secondary',
                    ]"
                  >
                    {{ mate }}
                    <span
                      v-if="voiceStateStore.isConnecting(mate)"
                      class="ml-1.5 text-xs sm:text-[10px] text-dc-text-muted"
                      >{{ t('common.connecting') }}</span
                    >
                  </span>
                  <span
                    v-if="voiceStateStore.isScreenSharing(mate)"
                    class="flex items-center gap-0.5 px-1 py-px rounded bg-dc-red/20 text-dc-red text-[9px] font-bold uppercase leading-none flex-shrink-0"
                  >
                    <font-awesome-icon icon="desktop" class="text-[8px]" />
                    {{ t('common.live') }}
                  </span>
                  <font-awesome-icon
                    v-if="voiceStateStore.isDeafened(mate)"
                    icon="headset"
                    class="text-sm sm:text-[11px] flex-shrink-0 text-dc-red/80"
                  />
                  <font-awesome-icon
                    v-if="voiceStateStore.isMuted(mate)"
                    icon="microphone-slash"
                    class="text-sm sm:text-[11px] flex-shrink-0 text-dc-red/80"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- TEXT CHANNELS section -->
        <div v-if="filteredTextChannels.length > 0" class="mb-1">
          <div class="flex items-center px-2 mb-1 mt-2">
            <font-awesome-icon
              icon="chevron-down"
              class="w-3 h-3 text-dc-text-muted mr-0.5 text-[10px]"
            />
            <span
              class="text-sm sm:text-[11px] font-bold uppercase tracking-wider text-dc-text-muted flex-1"
            >
              {{ t('common.textChannels') }}
            </span>
          </div>
          <div class="px-2 space-y-px">
            <button
              v-for="ch in filteredTextChannels"
              :key="ch.id || ''"
              @click="selectChannel(ch.id)"
              :class="[
                'w-full flex items-center gap-2 sm:gap-1.5 px-3 sm:px-2 py-2.5 sm:py-[6px] rounded group transition-colors text-left',
                ch.id === roomStore.selectedChannelId
                  ? 'bg-dc-bg-active text-dc-text-heading'
                  : 'text-dc-text-muted hover:text-dc-text-secondary hover:bg-dc-bg-hover',
              ]"
            >
              <font-awesome-icon
                icon="hashtag"
                class="w-6 h-6 sm:w-5 sm:h-5 flex-shrink-0 opacity-70 text-lg sm:text-[16px]"
              />
              <span class="flex-1 text-base sm:text-[15px] truncate font-medium leading-5">{{
                ch.name || t('common.unnamed')
              }}</span>
            </button>
          </div>
        </div>
      </template>

      <!-- Refresh -->
      <div class="px-2 mt-4">
        <button
          @click="refreshChannels"
          :disabled="isLoading"
          class="w-full flex items-center justify-center gap-1 px-3 sm:px-2 py-2 sm:py-1 text-sm sm:text-[11px] text-dc-text-muted hover:text-dc-text-secondary transition-colors"
        >
          <font-awesome-icon
            icon="arrows-rotate"
            :class="['text-[10px]', { 'animate-spin': isLoading }]"
          />
          {{ t('common.refresh') }}
        </button>
      </div>
    </div>

    <!-- Voice connected panel -->
    <div
      v-if="callStore.isInCall"
      class="bg-dc-bg-secondary-alt border-t border-white/[0.04]"
    >
      <div class="px-3 pt-2 pb-1.5 flex items-center gap-2">
        <div class="relative flex-shrink-0">
          <font-awesome-icon icon="volume-high" class="text-dc-green text-lg sm:text-[16px]" />
          <div
            class="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-dc-green border-2 border-dc-bg-secondary-alt"
          />
        </div>
        <div class="flex-1 min-w-0">
          <div class="text-sm sm:text-xs font-semibold text-dc-green leading-tight">
            {{ t('common.voiceConnected') }}
          </div>
          <div class="text-sm sm:text-[11px] text-dc-text-muted truncate leading-tight">
            {{ roomStore.channelById(roomStore.roomId)?.name ?? roomStore.selectedChannelName }}
          </div>
        </div>
      </div>

      <div class="px-2 pb-2 flex flex-wrap items-center justify-center gap-1">
        <!-- Camera + device picker -->
        <div class="relative flex items-center">
          <button
            @click="callStore.requestToggleVideo()"
            :class="[
              'w-9 h-9 sm:w-8 sm:h-8 rounded-l-md flex items-center justify-center transition-colors',
              callStore.videoEnabled
                ? 'bg-dc-bg-active hover:bg-[#4e5058] text-dc-text-secondary'
                : 'bg-dc-red/20 text-dc-red hover:bg-dc-red/30',
            ]"
            :title="callStore.videoEnabled ? t('call.turnOffCamera') : t('call.turnOnCamera')"
          >
            <font-awesome-icon
              :icon="callStore.videoEnabled ? 'video' : 'video-slash'"
              class="text-base sm:text-sm"
            />
          </button>
          <div class="relative">
            <button
              type="button"
              :class="[
                'w-6 h-9 sm:h-8 rounded-r-md border-l border-black/20 flex items-center justify-center transition-colors text-dc-text-muted',
                callStore.videoEnabled
                  ? 'bg-dc-bg-active hover:bg-[#4e5058]'
                  : 'bg-dc-red/20 hover:bg-dc-red/30 text-dc-red',
              ]"
              :title="t('call.camera')"
              @click="toggleCameraDeviceMenu()"
            >
              <font-awesome-icon
                icon="chevron-up"
                :class="['text-[9px] transition-transform', { 'rotate-180': cameraMenuOpen }]"
              />
            </button>
            <Transition name="dropdown">
              <ul
                v-if="cameraMenuOpen"
                class="absolute left-0 bottom-full mb-1 w-52 max-w-[min(13rem,calc(100vw-2rem))] bg-dc-bg-floating rounded-lg shadow-xl z-[60] py-1.5 max-h-48 overflow-y-auto border border-dc-separator/40"
                v-click-outside="closeCameraMenu"
              >
                <li
                  v-for="device in videoDevices"
                  :key="device.deviceId"
                  class="px-3 py-1.5 text-xs text-dc-text hover:bg-dc-blurple hover:text-white cursor-pointer transition-colors truncate"
                  :class="{
                    'bg-dc-bg-active': callStore.currentCameraDeviceId === device.deviceId,
                  }"
                  @click="pickCameraDevice(device.deviceId)"
                >
                  {{ device.label || `${t('call.camera')} ${videoDevices.indexOf(device) + 1}` }}
                </li>
              </ul>
            </Transition>
          </div>
        </div>

        <!-- Mic + input device picker -->
        <div class="relative flex items-center">
          <button
            @click="callStore.requestToggleMic()"
            :class="[
              'w-9 h-9 sm:w-8 sm:h-8 rounded-l-md flex items-center justify-center transition-colors',
              callStore.audioEnabled
                ? 'bg-dc-bg-active hover:bg-[#4e5058] text-dc-text-secondary'
                : 'bg-dc-red/20 text-dc-red hover:bg-dc-red/30',
            ]"
            :title="callStore.audioEnabled ? t('common.mute') : t('common.unmute')"
          >
            <font-awesome-icon
              :icon="callStore.audioEnabled ? 'microphone' : 'microphone-slash'"
              class="text-base sm:text-sm"
            />
          </button>
          <div class="relative">
            <button
              type="button"
              :class="[
                'w-6 h-9 sm:h-8 rounded-r-md border-l border-black/20 flex items-center justify-center transition-colors text-dc-text-muted',
                callStore.audioEnabled
                  ? 'bg-dc-bg-active hover:bg-[#4e5058]'
                  : 'bg-dc-red/20 hover:bg-dc-red/30 text-dc-red',
              ]"
              :title="t('call.microphone')"
              @click="toggleMicrophoneDeviceMenu()"
            >
              <font-awesome-icon
                icon="chevron-up"
                :class="['text-[9px] transition-transform', { 'rotate-180': microphoneMenuOpen }]"
              />
            </button>
            <Transition name="dropdown">
              <ul
                v-if="microphoneMenuOpen"
                class="absolute left-0 bottom-full mb-1 w-52 max-w-[min(13rem,calc(100vw-2rem))] bg-dc-bg-floating rounded-lg shadow-xl z-[60] py-1.5 max-h-48 overflow-y-auto border border-dc-separator/40"
                v-click-outside="closeMicrophoneMenu"
              >
                <li
                  v-for="device in audioDevices"
                  :key="device.deviceId"
                  class="px-3 py-1.5 text-xs text-dc-text hover:bg-dc-blurple hover:text-white cursor-pointer transition-colors truncate"
                  :class="{
                    'bg-dc-bg-active': callStore.currentMicrophoneDeviceId === device.deviceId,
                  }"
                  @click="pickMicrophoneDevice(device.deviceId)"
                >
                  {{ device.label || `${t('call.microphone')} ${audioDevices.indexOf(device) + 1}` }}
                </li>
              </ul>
            </Transition>
          </div>
        </div>

        <button
          @click="callStore.requestToggleDeafen()"
          :class="[
            'w-9 h-9 sm:w-8 sm:h-8 rounded-md flex items-center justify-center transition-colors',
            callStore.isDeafened
              ? 'bg-dc-red/20 text-dc-red hover:bg-dc-red/30'
              : 'bg-dc-bg-active hover:bg-[#4e5058] text-dc-text-secondary',
          ]"
          :title="callStore.isDeafened ? t('common.undeafen') : t('common.deafen')"
        >
          <font-awesome-icon icon="headset" class="text-base sm:text-sm" />
        </button>

        <button
          @click="
            callStore.isScreenSharing
              ? callStore.requestStopScreenShare()
              : callStore.requestScreenShare()
          "
          :class="[
            'w-9 h-9 sm:w-8 sm:h-8 rounded-md flex items-center justify-center transition-colors',
            callStore.isScreenSharing
              ? 'bg-dc-red/20 text-dc-red hover:bg-dc-red/30'
              : 'bg-dc-bg-active hover:bg-[#4e5058] text-dc-text-secondary',
          ]"
          :title="callStore.isScreenSharing ? t('call.stopSharing') : t('call.shareScreen')"
        >
          <font-awesome-icon
            :icon="callStore.isScreenSharing ? 'circle-stop' : 'desktop'"
            class="text-base sm:text-sm"
          />
        </button>

        <button
          @click="callStore.requestDisconnect()"
          class="w-9 h-9 sm:w-8 sm:h-8 rounded-md flex items-center justify-center bg-dc-red/20 text-dc-red hover:bg-dc-red/30 transition-colors"
          :title="t('common.disconnect')"
        >
          <font-awesome-icon icon="phone-slash" class="text-base sm:text-sm" />
        </button>
      </div>
    </div>

    <!-- User panel -->
    <UserPanel :username="props.user.username || ''" />

    <!-- Resize handle (desktop only) -->
    <div
      v-if="!sidebarStore.isMobile"
      class="absolute top-0 right-0 h-full w-1 cursor-col-resize hover:bg-dc-blurple/40 transition-colors z-10"
      :class="{ 'bg-dc-blurple/40': isResizing }"
      @mousedown="onResizeStart"
    />
  </aside>

  <!-- Stream preview portal (right of sidebar) -->
  <Teleport to="body">
    <Transition name="popup">
      <div
        v-if="hoveredStreamUser && voiceStateStore.isScreenSharing(hoveredStreamUser)"
        class="fixed z-[150] w-52 bg-dc-bg-floating border border-dc-separator rounded-lg shadow-xl overflow-hidden"
        :style="{
          top: previewCardY + 'px',
          left: (sidebarStore.isMobile ? 280 : sidebarStore.width) + 8 + 'px',
        }"
        @mouseenter="onPreviewCardEnter()"
        @mouseleave="onPreviewCardLeave()"
      >
        <div class="relative bg-black aspect-video">
          <video
            v-if="getScreenShareStream(hoveredStreamUser)"
            :srcObject="getScreenShareStream(hoveredStreamUser) as any"
            autoplay
            muted
            playsinline
            class="w-full h-full object-contain"
          />
          <div v-else class="w-full h-full flex items-center justify-center text-dc-text-muted">
            <font-awesome-icon icon="desktop" class="text-2xl" />
          </div>
          <span
            class="absolute top-1 left-1 px-1 py-0.5 rounded bg-dc-red text-white text-[9px] font-bold uppercase"
          >
            {{ t('common.live') }}
          </span>
        </div>
        <div class="p-2">
          <p class="text-xs font-semibold text-dc-text truncate">{{ hoveredStreamUser }}</p>
          <p class="text-[10px] text-dc-text-muted mb-1.5">{{ t('common.isStreaming') }}</p>
          <button
            v-if="voiceStateStore.watchingUsernames.has(hoveredStreamUser!)"
            @click="stopWatchingStream()"
            class="w-full text-[11px] py-1 rounded bg-dc-red/80 hover:bg-dc-red text-white font-medium transition-colors"
          >
            {{ t('common.stopWatching') }}
          </button>
          <button
            v-else
            @click="
              handleWatchStream(
                hoveredStreamUser!,
                channelForUser(hoveredStreamUser!)?.id,
                channelForUser(hoveredStreamUser!)?.roommates,
              )
            "
            class="w-full text-[11px] py-1 rounded bg-dc-blurple hover:bg-dc-blurple/80 text-white font-medium transition-colors"
          >
            {{
              callStore.isInCall &&
              roomStore.selectedChannelId === channelForUser(hoveredStreamUser!)?.id
                ? t('common.watchStream')
                : t('common.joinChannel')
            }}
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- Create Channel Modal -->
  <Teleport to="body">
    <Transition name="modal-fade">
      <div
        v-if="showCreateModal"
        class="fixed inset-0 z-[300] flex items-center justify-center p-4"
        @click.self="closeCreateModal()"
      >
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/70" />

        <!-- Modal card -->
        <div
          class="relative z-10 w-full max-w-md bg-dc-bg-secondary rounded-xl shadow-2xl overflow-hidden"
        >
          <!-- Header -->
          <div class="px-6 pt-6 pb-4">
            <h2 class="text-xl font-bold text-dc-text-heading">
              {{ t('sidebar.createChannelTitle') }}
            </h2>
          </div>

          <!-- Channel type cards -->
          <div class="px-6 flex flex-col gap-3 pb-5">
            <!-- Voice Channel -->
            <button
              @click="newChannelType = 'voice'"
              :class="[
                'w-full flex items-center gap-4 px-4 py-4 rounded-lg border-2 text-left transition-all',
                newChannelType === 'voice'
                  ? 'border-dc-blurple bg-dc-blurple/10'
                  : 'border-dc-separator bg-dc-bg-tertiary hover:border-dc-text-muted/40 hover:bg-dc-bg-hover',
              ]"
            >
              <div
                :class="[
                  'w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0',
                  newChannelType === 'voice'
                    ? 'bg-dc-blurple/20 text-dc-blurple'
                    : 'bg-dc-bg-active text-dc-text-muted',
                ]"
              >
                <font-awesome-icon icon="volume-high" class="text-lg" />
              </div>
              <div class="flex-1 min-w-0">
                <div
                  :class="[
                    'font-semibold text-sm',
                    newChannelType === 'voice' ? 'text-dc-text-heading' : 'text-dc-text-secondary',
                  ]"
                >
                  {{ t('sidebar.createVoiceChannel') }}
                </div>
                <div class="text-xs text-dc-text-muted mt-0.5 leading-snug">
                  {{ t('sidebar.voiceChannelDesc') }}
                </div>
              </div>
              <div
                :class="[
                  'w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors',
                  newChannelType === 'voice'
                    ? 'border-dc-blurple bg-dc-blurple'
                    : 'border-dc-text-muted/40',
                ]"
              >
                <div v-if="newChannelType === 'voice'" class="w-2 h-2 rounded-full bg-white" />
              </div>
            </button>

            <!-- Text Channel -->
            <button
              @click="newChannelType = 'text'"
              :class="[
                'w-full flex items-center gap-4 px-4 py-4 rounded-lg border-2 text-left transition-all',
                newChannelType === 'text'
                  ? 'border-dc-blurple bg-dc-blurple/10'
                  : 'border-dc-separator bg-dc-bg-tertiary hover:border-dc-text-muted/40 hover:bg-dc-bg-hover',
              ]"
            >
              <div
                :class="[
                  'w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0',
                  newChannelType === 'text'
                    ? 'bg-dc-blurple/20 text-dc-blurple'
                    : 'bg-dc-bg-active text-dc-text-muted',
                ]"
              >
                <font-awesome-icon icon="hashtag" class="text-lg" />
              </div>
              <div class="flex-1 min-w-0">
                <div
                  :class="[
                    'font-semibold text-sm',
                    newChannelType === 'text' ? 'text-dc-text-heading' : 'text-dc-text-secondary',
                  ]"
                >
                  {{ t('sidebar.createTextChannel') }}
                </div>
                <div class="text-xs text-dc-text-muted mt-0.5 leading-snug">
                  {{ t('sidebar.textChannelDesc') }}
                </div>
              </div>
              <div
                :class="[
                  'w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors',
                  newChannelType === 'text'
                    ? 'border-dc-blurple bg-dc-blurple'
                    : 'border-dc-text-muted/40',
                ]"
              >
                <div v-if="newChannelType === 'text'" class="w-2 h-2 rounded-full bg-white" />
              </div>
            </button>
          </div>

          <!-- Divider -->
          <div class="h-px bg-dc-separator mx-6" />

          <!-- Name input -->
          <div class="px-6 pt-4 pb-2">
            <label class="block text-xs font-bold uppercase tracking-wider text-dc-text-muted mb-2">
              {{ t('sidebar.channelNameLabel') }}
            </label>
            <input
              v-model="newChannelName"
              @keyup.enter="addChannel"
              @keyup.escape="closeCreateModal()"
              type="text"
              :placeholder="t('common.channelNamePlaceholder')"
              autofocus
              class="w-full px-3 py-2.5 rounded-md bg-dc-bg-tertiary text-dc-text text-sm placeholder-dc-text-muted border border-dc-separator outline-none focus:border-dc-blurple/60 focus:ring-1 focus:ring-dc-blurple/30 transition-colors"
            />
          </div>

          <!-- Actions -->
          <div class="px-6 py-4 flex justify-end gap-3">
            <button
              @click="closeCreateModal()"
              class="px-4 py-2 rounded-md text-sm font-medium text-dc-text-secondary hover:text-dc-text hover:bg-dc-bg-hover transition-colors"
            >
              {{ t('common.cancel') }}
            </button>
            <button
              @click="addChannel"
              :disabled="!newChannelName.trim() || isLoading"
              class="px-5 py-2 rounded-md bg-dc-blurple hover:bg-dc-blurple/80 disabled:opacity-40 text-white text-sm font-medium transition-colors"
            >
              {{ t('sidebar.create') }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- Switch Voice Channel Modal -->
  <Teleport to="body">
    <Transition name="modal-fade">
      <div
        v-if="showSwitchModal"
        class="fixed inset-0 z-[300] flex items-center justify-center p-4"
        @click.self="cancelSwitchChannel()"
      >
        <div class="absolute inset-0 bg-black/70" />

        <div
          class="relative z-10 w-full max-w-sm bg-dc-bg-secondary rounded-xl shadow-2xl overflow-hidden"
        >
          <div class="px-6 pt-6 pb-2">
            <h2 class="text-xl font-bold text-dc-text-heading">
              {{ t('sidebar.switchVoiceTitle') }}
            </h2>
          </div>

          <div class="px-6 pb-5">
            <p class="text-sm text-dc-text-secondary leading-relaxed">
              {{
                t('sidebar.switchVoiceBody', {
                  current: roomStore.channelById(roomStore.roomId)?.name ?? roomStore.selectedChannelName,
                  target: roomStore.channelById(pendingSwitchChannelId ?? '')?.name ?? '',
                })
              }}
            </p>
          </div>

          <div class="h-px bg-dc-separator mx-6" />

          <div class="px-6 py-4 flex justify-end gap-3">
            <button
              @click="cancelSwitchChannel()"
              class="px-4 py-2 rounded-md text-sm font-medium text-dc-text-secondary hover:text-dc-text hover:bg-dc-bg-hover transition-colors"
            >
              {{ t('common.cancel') }}
            </button>
            <button
              @click="confirmSwitchChannel()"
              class="px-5 py-2 rounded-md bg-dc-blurple hover:bg-dc-blurple/80 text-white text-sm font-medium transition-colors"
            >
              {{ t('sidebar.switchVoiceConfirm') }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- Context menu portal -->
  <Teleport to="body">
    <Transition name="popup">
      <div
        v-if="contextMenuUser"
        v-click-outside="closeContextMenu"
        class="fixed z-[200] bg-dc-bg-floating border border-dc-separator rounded shadow-xl p-2 w-44 flex flex-col gap-1"
        :style="{ top: contextMenuY + 'px', left: contextMenuX + 'px' }"
        @click.stop
      >
        <div
          class="px-2 py-1 text-[11px] font-semibold text-dc-text-muted uppercase tracking-wide truncate"
        >
          {{ contextMenuUser }}
        </div>

        <div class="border-t border-dc-separator my-0.5" />
        <button
          class="flex items-center gap-2 px-2 py-1.5 rounded text-sm text-dc-text-secondary hover:bg-dc-bg-hover hover:text-dc-text transition-colors text-left"
          @click="muteAndCloseMenu()"
        >
          <font-awesome-icon
            :icon="isMutedByUs(contextMenuUser!) ? 'volume-high' : 'volume-xmark'"
            class="text-xs w-3"
          />
          {{ isMutedByUs(contextMenuUser!) ? t('common.unmute') : t('common.mute') }}
        </button>
        <div class="flex flex-col gap-1 px-2 pb-1 pt-0.5">
          <span class="text-[10px] text-dc-text-muted uppercase tracking-wide">{{
            t('common.volume')
          }}</span>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            :value="Math.round(getVolumeForUser(contextMenuUser!) * 100)"
            class="accent-dc-blurple w-full"
            @input="
              handleVolumeChange(contextMenuUser!, +($event.target as HTMLInputElement).value)
            "
            @click.stop
          />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.2s ease;
}
.modal-fade-enter-active .relative.z-10,
.modal-fade-leave-active .relative.z-10 {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}
.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}
.modal-fade-enter-from .relative.z-10,
.modal-fade-leave-to .relative.z-10 {
  opacity: 0;
  transform: scale(0.95) translateY(-8px);
}
</style>
