<script setup lang="ts">
import { AuthService, SignalingService, type UserProfile } from '@/api/index'
import { useApiErrors } from '@/composible/useApiErrors'
import router from '@/router'
import { useAuthStore } from '@/stores/authStore'
import { useRoomStore } from '@/stores/roomStore'
import { useSidebarStore } from '@/stores/sidebarStore'
import {
  faCheck,
  faHashtag,
  faPlus,
  faSearch,
  faSignOutAlt,
  faSync,
  faTimes,
  faUser,
  faXmark,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

const { clearErrors, parseApiError } = useApiErrors()
const authStore = useAuthStore()
const roomStore = useRoomStore()
const sidebarStore = useSidebarStore()

const props = defineProps<{
  user: UserProfile
}>()

const showCreateInput = ref(false)
const newChannelName = ref('')
const searchQuery = ref('')
const isLoading = ref(false)

// Фильтрация каналов по поисковому запросу
const filteredChannels = computed(() => {
  if (!searchQuery.value.trim()) {
    return roomStore.channels
  }
  const query = searchQuery.value.toLowerCase()
  return roomStore.channels.filter((ch) => ch.name?.toLowerCase().includes(query))
})

// Закрытие сайдбара на мобильных
function closeSidebar() {
  sidebarStore.close()
}

// Создание канала
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

// Отмена создания канала
function cancelCreateChannel() {
  showCreateInput.value = false
  newChannelName.value = ''
}

// Выбор канала
function selectChannel(channelId: string | undefined, roommates?: string[]) {
  if (!channelId) return
  roomStore.selectChannel(channelId, roommates)
  sidebarStore.close() // Закрываем на мобильных после выбора
}

// Обновление списка каналов
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

// Выход
async function logout() {
  try {
    await authStore.clearTokens()
    await router.push({ name: 'Login' })
    await AuthService.logoutUser()
  } catch (e) {
    console.error(e)
    parseApiError(e)
  }
}

// Обработка изменения размера окна
function handleResize() {
  sidebarStore.checkMobile()
}

// Закрытие по клику вне сайдбара (только на мобильных)
function handleClickOutside(event: MouseEvent) {
  if (sidebarStore.isMobile && sidebarStore.isOpen) {
    const target = event.target as HTMLElement
    const sidebar = document.querySelector('[data-sidebar]')
    const toggleButton = document.querySelector('[data-sidebar-toggle]')
    
    if (
      sidebar &&
      !sidebar.contains(target) &&
      toggleButton &&
      !toggleButton.contains(target)
    ) {
      sidebarStore.close()
    }
  }
}

onMounted(() => {
  sidebarStore.checkMobile()
  window.addEventListener('resize', handleResize)
  document.addEventListener('click', handleClickOutside)
  refreshChannels()
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  document.removeEventListener('click', handleClickOutside)
})

// Закрытие сайдбара при выборе канала на мобильных
watch(
  () => roomStore.selectedChannelId,
  () => {
    sidebarStore.close()
  }
)
</script>

<template>
  <!-- Overlay для мобильных -->
  <Transition name="fade">
    <div
      v-if="sidebarStore.isMobile && sidebarStore.isOpen"
      class="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden"
      @click="sidebarStore.close"
    ></div>
  </Transition>

  <!-- Sidebar -->
  <aside
    data-sidebar
    :class="[
      'fixed lg:static inset-y-0 left-0 z-40 flex flex-col bg-gradient-to-b from-slate-900/90 to-slate-950/90 backdrop-blur-sm border-r border-slate-800/50 transition-transform duration-300 ease-in-out',
      sidebarStore.isMobile
        ? sidebarStore.isOpen
          ? 'translate-x-0 w-[320px]'
          : '-translate-x-full w-[320px]'
        : 'translate-x-0 w-[280px] xl:w-[320px]',
    ]"
  >
    <!-- Header -->
    <header class="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-900/50 flex-shrink-0">
      <div class="flex items-center gap-3 min-w-0 flex-1">
        <div
          class="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm shadow-lg"
        >
          <FontAwesomeIcon :icon="faHashtag" />
        </div>
        <div class="min-w-0 flex-1">
          <h1 class="text-lg font-bold text-white truncate">Каналы</h1>
          <p class="text-xs text-slate-400 truncate">{{ filteredChannels.length }} каналов</p>
        </div>
      </div>
      <button
        v-if="sidebarStore.isMobile"
        @click="sidebarStore.close"
        class="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors touch-manipulation lg:hidden"
        aria-label="Закрыть меню"
      >
        <FontAwesomeIcon :icon="faTimes" />
      </button>
    </header>

    <!-- Search and Actions -->
    <div class="p-3 border-b border-slate-800 space-y-2 flex-shrink-0">
      <!-- Поиск -->
      <div class="relative">
        <FontAwesomeIcon
          :icon="faSearch"
          class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm"
        />
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Поиск каналов..."
          class="w-full pl-10 pr-4 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm transition-all"
        />
        <button
          v-if="searchQuery"
          @click="searchQuery = ''"
          class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors"
          aria-label="Очистить поиск"
        >
          <FontAwesomeIcon :icon="faXmark" class="text-xs" />
        </button>
      </div>

      <!-- Действия -->
      <div class="flex gap-2">
        <button
          @click="refreshChannels"
          :disabled="isLoading"
          class="flex-1 px-3 py-2 bg-slate-800/50 hover:bg-slate-700 active:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-slate-300 rounded-lg transition-all touch-manipulation text-sm font-medium"
          title="Обновить список"
        >
          <FontAwesomeIcon :icon="faSync" :class="{ 'animate-spin': isLoading }" class="mr-2" />
          Обновить
        </button>
        <button
          @click="showCreateInput = !showCreateInput"
          :class="[
            'px-3 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-lg transition-all touch-manipulation text-sm font-medium shadow-lg',
            showCreateInput ? 'ring-2 ring-indigo-400' : '',
          ]"
          title="Создать канал"
        >
          <FontAwesomeIcon :icon="faPlus" />
        </button>
      </div>

      <!-- Форма создания канала -->
      <Transition name="slide-down">
        <div
          v-if="showCreateInput"
          class="p-3 bg-slate-800/30 rounded-lg border border-slate-700 space-y-2"
        >
          <input
            v-model="newChannelName"
            @keyup.enter="addChannel"
            @keyup.escape="cancelCreateChannel"
            type="text"
            placeholder="Название канала"
            class="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
            autofocus
          />
          <div class="flex gap-2">
            <button
              @click="addChannel"
              :disabled="!newChannelName.trim() || isLoading"
              class="flex-1 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-all touch-manipulation text-sm font-medium"
            >
              <FontAwesomeIcon :icon="faCheck" class="mr-2" />
              Создать
            </button>
            <button
              @click="cancelCreateChannel"
              class="px-3 py-2 bg-slate-700 hover:bg-slate-600 active:bg-slate-500 text-slate-200 rounded-lg transition-all touch-manipulation text-sm"
            >
              <FontAwesomeIcon :icon="faXmark" />
            </button>
          </div>
        </div>
      </Transition>
    </div>

    <!-- Channels List -->
    <div class="flex-1 overflow-y-auto min-h-0">
      <!-- Empty State -->
      <div
        v-if="!isLoading && filteredChannels.length === 0"
        class="flex flex-col items-center justify-center h-full p-6 text-center"
      >
        <div
          class="w-16 h-16 rounded-full bg-slate-800/50 flex items-center justify-center mb-4"
        >
          <FontAwesomeIcon :icon="searchQuery ? faSearch : faHashtag" class="text-2xl text-slate-400" />
        </div>
        <p class="text-slate-300 font-medium mb-1">
          {{ searchQuery ? 'Каналы не найдены' : 'Нет каналов' }}
        </p>
        <p class="text-sm text-slate-500">
          {{ searchQuery ? 'Попробуйте другой запрос' : 'Создайте первый канал!' }}
        </p>
      </div>

      <!-- Loading State -->
      <div v-if="isLoading && roomStore.channels.length === 0" class="flex items-center justify-center h-full">
        <div class="text-center">
          <FontAwesomeIcon :icon="faSync" class="text-3xl text-slate-400 animate-spin mb-2" />
          <p class="text-sm text-slate-400">Загрузка каналов...</p>
        </div>
      </div>

      <!-- Channels -->
      <ul v-else class="p-2 space-y-1">
        <li v-for="ch in filteredChannels" :key="ch.id || ''">
          <button
            v-if="ch.id"
            @click="selectChannel(ch.id, ch.roommates)"
            :class="[
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all touch-manipulation group',
              ch.id === roomStore.selectedChannelId
                ? 'bg-indigo-600/20 text-indigo-300 border-l-4 border-indigo-500 shadow-lg'
                : 'text-slate-300 hover:bg-slate-800/50 hover:text-white active:bg-slate-700/50',
            ]"
          >
            <FontAwesomeIcon
              :icon="faHashtag"
              :class="[
                'flex-shrink-0 text-sm transition-colors',
                ch.id === roomStore.selectedChannelId ? 'text-indigo-400' : 'text-slate-500 group-hover:text-slate-400',
              ]"
            />
            <span class="flex-1 truncate text-sm font-medium">{{ ch.name || 'Без названия' }}</span>
            <span
              v-if="ch.roommates && ch.roommates.length > 0"
              :class="[
                'flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold transition-colors',
                ch.id === roomStore.selectedChannelId
                  ? 'bg-indigo-500/30 text-indigo-300'
                  : 'bg-slate-700/50 text-slate-400 group-hover:bg-slate-700 group-hover:text-slate-300',
              ]"
            >
              {{ ch.roommates.length }}
            </span>
          </button>
        </li>
      </ul>
    </div>

    <!-- User Profile & Logout -->
    <div class="p-4 border-t border-slate-800 bg-slate-900/50 flex-shrink-0">
      <!-- User Info -->
      <div class="flex items-center gap-3 mb-4 p-3 rounded-lg bg-slate-800/30">
        <div
          class="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center text-white font-semibold text-sm shadow-lg"
        >
          <FontAwesomeIcon :icon="faUser" />
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-semibold text-white truncate">{{ props.user.username }}</p>
          <p class="text-xs text-slate-400">Онлайн</p>
        </div>
      </div>

      <!-- Logout Button -->
      <button
        @click="logout"
        class="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600/20 hover:bg-red-600/30 active:bg-red-600/40 text-red-400 hover:text-red-300 rounded-lg transition-all touch-manipulation text-sm font-medium border border-red-600/30"
        title="Выйти из аккаунта"
      >
        <FontAwesomeIcon :icon="faSignOutAlt" />
        <span>Выйти</span>
      </button>
    </div>
  </aside>
</template>

<style scoped>
/* Анимации */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.3s ease;
  overflow: hidden;
}

.slide-down-enter-from,
.slide-down-leave-to {
  max-height: 0;
  opacity: 0;
  padding-top: 0;
  padding-bottom: 0;
  margin-top: 0;
  margin-bottom: 0;
}

.slide-down-enter-to,
.slide-down-leave-from {
  max-height: 200px;
  opacity: 1;
}

/* Кастомный скроллбар */
.overflow-y-auto::-webkit-scrollbar {
  width: 6px;
}

.overflow-y-auto::-webkit-scrollbar-track {
  background: transparent;
}

.overflow-y-auto::-webkit-scrollbar-thumb {
  background-color: rgb(51 65 85);
  border-radius: 3px;
}

.overflow-y-auto::-webkit-scrollbar-thumb:hover {
  background-color: rgb(71 85 105);
}
</style>
