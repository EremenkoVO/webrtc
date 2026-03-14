<script setup lang="ts">
import { SignalingService, type UserProfile } from '@/api/index'
import { useApiErrors } from '@/shared/lib/useApiErrors'
import { useCallStore } from '@/shared/stores/callStore'
import { useRoomStore } from '@/shared/stores/roomStore'
import { useSidebarStore } from '@/shared/stores/sidebarStore'
import { useSignalingStore } from '@/shared/stores/signalingStore'
import { useVoiceStateStore } from '@/shared/stores/voiceStateStore'
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

const props = defineProps<{ user: UserProfile }>()

const showCreateInput = ref(false)
const newChannelName = ref('')
const searchQuery = ref('')
const isLoading = ref(false)

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

async function addChannel() {
  if (!newChannelName.value.trim()) return
  clearErrors()
  isLoading.value = true
  try {
    await SignalingService.createRoom({ name: newChannelName.value.trim() })
    await roomStore.getListChannels()
    newChannelName.value = ''
    showCreateInput.value = false
    searchQuery.value = ''
  } catch (e) {
    parseApiError(e)
  } finally {
    isLoading.value = false
  }
}

function selectChannel(channelId: string | undefined, roommates?: string[]) {
  if (!channelId) return
  roomStore.selectChannel(channelId, roommates)
  sidebarStore.close()
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

function getInitials(name: string): string {
  return name.charAt(0).toUpperCase()
}

function getAvatarColor(name: string): string {
  const colors = [
    '#5865f2',
    '#57f287',
    '#fee75c',
    '#eb459e',
    '#ed4245',
    '#f47b67',
    '#e78284',
    '#3ba55d',
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
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
  if (hoverLeaveTimer) { clearTimeout(hoverLeaveTimer); hoverLeaveTimer = null }
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

function onPreviewCardEnter() {
  if (hoverLeaveTimer) { clearTimeout(hoverLeaveTimer); hoverLeaveTimer = null }
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
  if (sidebarStore.isMobile) { onResizeEnd(); return }
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
      'fixed lg:relative inset-y-0 left-0 z-40 flex flex-col bg-dc-bg-secondary transition-transform duration-200 ease-out',
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
      class="h-12 2xl:h-14 px-4 flex items-center shadow-[0_1px_0_rgba(4,4,5,0.2),0_1.5px_0_rgba(6,6,7,0.05),0_2px_0_rgba(4,4,5,0.05)] flex-shrink-0 hover:bg-dc-bg-hover transition-colors cursor-pointer"
    >
      <h1 class="text-[15px] font-semibold text-dc-text-heading truncate flex-1">
        {{ t('sidebar.appTitle') }}
      </h1>
      <button
        v-if="sidebarStore.isMobile"
        @click="sidebarStore.close"
        class="w-7 h-7 flex items-center justify-center text-dc-text-muted hover:text-dc-text transition-colors lg:hidden"
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

      <!-- Category header -->
      <div
        class="flex items-center px-2 mb-1 group cursor-pointer"
        @click="showCreateInput = !showCreateInput"
      >
        <font-awesome-icon
          icon="chevron-down"
          class="w-3 h-3 text-dc-text-muted mr-0.5 text-[10px]"
        />
        <span
          class="text-sm sm:text-[11px] font-bold uppercase tracking-wider text-dc-text-muted group-hover:text-dc-text-secondary flex-1"
        >
          {{ t('common.voiceChannels') }}
        </span>
        <button
          class="w-5 h-5 sm:w-4 sm:h-4 flex items-center justify-center text-dc-text-muted hover:text-dc-text-secondary opacity-0 group-hover:opacity-100 transition-opacity"
          :title="t('common.createChannel')"
          @click.stop="showCreateInput = !showCreateInput"
        >
          <font-awesome-icon icon="plus" class="text-sm sm:text-xs" />
        </button>
      </div>

      <!-- Create channel input -->
      <Transition name="slide-down">
        <div v-if="showCreateInput" class="px-2 mb-2">
          <div class="flex gap-1">
            <input
              v-model="newChannelName"
              @keyup.enter="addChannel"
              @keyup.escape="((showCreateInput = false), (newChannelName = ''))"
              type="text"
              :placeholder="t('common.channelNamePlaceholder')"
              autofocus
              class="flex-1 px-3 sm:px-2 py-2.5 sm:py-1.5 rounded bg-dc-bg-tertiary text-dc-text text-base sm:text-sm placeholder-dc-text-muted border-none outline-none focus:ring-1 focus:ring-dc-blurple/40"
            />
            <button
              @click="addChannel"
              :disabled="!newChannelName.trim() || isLoading"
              class="px-3 sm:px-2 py-2.5 sm:py-1.5 rounded bg-dc-green hover:bg-dc-green/80 disabled:opacity-40 text-white text-sm sm:text-xs font-medium transition-colors"
            >
              {{ t('common.ok') }}
            </button>
          </div>
        </div>
      </Transition>

      <!-- Loading -->
      <div v-if="isLoading && roomStore.channels.length === 0" class="px-2 py-8 text-center">
        <div class="text-dc-text-muted text-base sm:text-sm">
          {{ t('sidebar.loadingChannels') }}
        </div>
      </div>

      <!-- Empty -->
      <div v-else-if="filteredChannels.length === 0" class="px-2 py-8 text-center">
        <div class="text-dc-text-muted text-base sm:text-sm">
          {{ searchQuery ? t('common.noChannelsFound') : t('common.noChannelsYet') }}
        </div>
      </div>

      <!-- Channel items -->
      <div v-else class="px-2 space-y-px">
        <div v-for="ch in filteredChannels" :key="ch.id || ''">
          <!-- Channel button -->
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

          <!-- Participants list under channel -->
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
              <!-- Avatar with speaking indicator -->
              <div class="relative flex-shrink-0">
                <div
                  :class="[
                    'w-7 h-7 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-xs sm:text-[10px] font-semibold text-white transition-all duration-200',
                    voiceStateStore.isSpeaking(mate) ? 'ring-[2.5px] ring-dc-green' : '',
                  ]"
                  :style="{ backgroundColor: getAvatarColor(mate) }"
                >
                  {{ getInitials(mate) }}
                </div>
                <!-- Connecting indicator -->
                <div
                  v-if="voiceStateStore.isConnecting(mate)"
                  class="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-dc-blurple border-2 border-dc-bg-secondary-alt flex items-center justify-center"
                >
                  <div class="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                </div>
              </div>

              <!-- Username -->
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
                >
                  {{ t('common.connecting') }}
                </span>
              </span>

              <!-- Screen sharing badge -->
              <span
                v-if="voiceStateStore.isScreenSharing(mate)"
                class="flex items-center gap-0.5 px-1 py-px rounded bg-dc-red/20 text-dc-red text-[9px] font-bold uppercase leading-none flex-shrink-0"
              >
                <font-awesome-icon icon="desktop" class="text-[8px]" />
                {{ t('common.live') }}
              </span>

              <!-- Muted mic icon -->
              <font-awesome-icon
                v-if="voiceStateStore.isMuted(mate)"
                icon="microphone-slash"
                class="text-sm sm:text-[11px] flex-shrink-0 text-dc-red/80"
              />
            </div>
          </div>
        </div>
      </div>

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

    <!-- Voice connected indicator -->
    <div
      v-if="callStore.isInCall && roomStore.selectedChannelName"
      class="px-3 py-2 bg-dc-bg-secondary-alt border-t border-white/[0.04]"
    >
      <div class="flex items-center gap-2">
        <div class="relative">
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
            {{ roomStore.selectedChannelName }}
          </div>
        </div>
        <button
          @click="callStore.requestDisconnect()"
          class="w-9 h-9 sm:w-7 sm:h-7 flex items-center justify-center rounded hover:bg-dc-bg-hover text-dc-text-muted hover:text-dc-red transition-colors"
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
    <Transition name="fade">
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
            :srcObject="(getScreenShareStream(hoveredStreamUser) as any)"
            autoplay
            muted
            playsinline
            class="w-full h-full object-contain"
          />
          <div v-else class="w-full h-full flex items-center justify-center text-dc-text-muted">
            <font-awesome-icon icon="desktop" class="text-2xl" />
          </div>
          <span class="absolute top-1 left-1 px-1 py-0.5 rounded bg-dc-red text-white text-[9px] font-bold uppercase">
            {{ t('common.live') }}
          </span>
        </div>
        <div class="p-2">
          <p class="text-xs font-semibold text-dc-text truncate">{{ hoveredStreamUser }}</p>
          <p class="text-[10px] text-dc-text-muted mb-1.5">{{ t('common.isStreaming') }}</p>
          <button
            v-if="voiceStateStore.watchingUsernames.has(hoveredStreamUser!)"
            @click="voiceStateStore.requestUnwatch(hoveredStreamUser!); hoveredStreamUser = null"
            class="w-full text-[11px] py-1 rounded bg-dc-red/80 hover:bg-dc-red text-white font-medium transition-colors"
          >
            {{ t('common.stopWatching') }}
          </button>
          <button
            v-else
            @click="handleWatchStream(hoveredStreamUser!, channelForUser(hoveredStreamUser!)?.id, channelForUser(hoveredStreamUser!)?.roommates)"
            class="w-full text-[11px] py-1 rounded bg-dc-blurple hover:bg-dc-blurple/80 text-white font-medium transition-colors"
          >
            {{
              callStore.isInCall && roomStore.selectedChannelId === channelForUser(hoveredStreamUser!)?.id
                ? t('common.watchStream')
                : t('common.joinChannel')
            }}
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- Context menu portal -->
  <Teleport to="body">
    <div
      v-if="contextMenuUser"
      v-click-outside="closeContextMenu"
      class="fixed z-[200] bg-dc-bg-floating border border-dc-separator rounded shadow-xl p-2 w-44 flex flex-col gap-1"
      :style="{ top: contextMenuY + 'px', left: contextMenuX + 'px' }"
      @click.stop
    >
      <div class="px-2 py-1 text-[11px] font-semibold text-dc-text-muted uppercase tracking-wide truncate">
        {{ contextMenuUser }}
      </div>
      <div class="border-t border-dc-separator my-0.5" />
      <button
        class="flex items-center gap-2 px-2 py-1.5 rounded text-sm text-dc-text-secondary hover:bg-dc-bg-hover hover:text-dc-text transition-colors text-left"
        @click="handleMuteToggle(contextMenuUser!); closeContextMenu()"
      >
        <font-awesome-icon :icon="isMutedByUs(contextMenuUser!) ? 'volume-high' : 'volume-xmark'" class="text-xs w-3" />
        {{ isMutedByUs(contextMenuUser!) ? t('common.unmute') : t('common.mute') }}
      </button>
      <div class="flex flex-col gap-1 px-2 pb-1 pt-0.5">
        <span class="text-[10px] text-dc-text-muted uppercase tracking-wide">{{ t('common.volume') }}</span>
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          :value="Math.round(getVolumeForUser(contextMenuUser!) * 100)"
          class="accent-dc-blurple w-full"
          @input="handleVolumeChange(contextMenuUser!, +($event.target as HTMLInputElement).value)"
          @click.stop
        />
      </div>
    </div>
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
.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.2s ease;
  overflow: hidden;
}
.slide-down-enter-from,
.slide-down-leave-to {
  max-height: 0;
  opacity: 0;
}
.slide-down-enter-to,
.slide-down-leave-from {
  max-height: 100px;
  opacity: 1;
}
</style>
