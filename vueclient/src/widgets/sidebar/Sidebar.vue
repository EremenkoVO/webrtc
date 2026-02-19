<script setup lang="ts">
import { SignalingService, type UserProfile } from '@/api/index'
import { useApiErrors } from '@/shared/lib/useApiErrors'
import { useCallStore } from '@/shared/stores/callStore'
import { useRoomStore } from '@/shared/stores/roomStore'
import { useSidebarStore } from '@/shared/stores/sidebarStore'
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

const props = defineProps<{ user: UserProfile }>()

const showCreateInput = ref(false)
const newChannelName = ref('')
const searchQuery = ref('')
const isLoading = ref(false)

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

onMounted(() => {
  sidebarStore.checkMobile()
  window.addEventListener('resize', handleResize)
  refreshChannels()
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
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
      'fixed lg:static inset-y-0 left-0 z-40 flex flex-col bg-dc-bg-secondary transition-transform duration-200 ease-out',
      sidebarStore.isMobile
        ? sidebarStore.isOpen
          ? 'translate-x-0 w-[280px]'
          : '-translate-x-full w-[280px]'
        : 'translate-x-0 w-60 2xl:w-[272px]',
    ]"
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
  </aside>
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
