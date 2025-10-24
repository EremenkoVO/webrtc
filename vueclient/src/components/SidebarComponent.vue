<script setup lang="ts">
import { AuthService, SignalingService, type Room, type UserProfile } from '@/api/index'
import { useApiErrors } from '@/composible/useApiErrors'
import router from '@/router'
import { useAuthStore } from '@/stores/authStore'
import { useCallStore } from '@/stores/callStore'
import { faArrowAltCircleRight, faXmarkCircle } from '@fortawesome/free-regular-svg-icons'
import { faCheck, faPlus, faSignOutAlt } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import { computed, onMounted, ref, watch } from 'vue'

const { clearErrors, parseApiError } = useApiErrors()
const authStore = useAuthStore()
const callStore = useCallStore()

const props = defineProps<{
  user: UserProfile
}>()

const emit = defineEmits<{
  (e: 'channelSelected', payload: { id: string; name: string }): void
}>()

const channels = ref<Room[]>([])
const selectedChannelId = ref<string | undefined>(undefined)
const showCreateInput = ref(false)
const newChannelName = ref('')
const showSidebar = ref(true)
const serverName = ref('WebRTC App')

const selectedChannelName = computed(() => {
  return channels.value.find((ch) => ch.id === selectedChannelId.value)?.name || ''
})

watch(selectedChannelId, (newVal) => {
  if (newVal) {
    emit('channelSelected', { id: newVal, name: selectedChannelName.value })
  }
})

async function addChannel() {
  clearErrors()

  try {
    await SignalingService.createRoom({ name: newChannelName.value })
    await listChannels()
  } catch (e) {
    parseApiError(e)
    return
  } finally {
    newChannelName.value = ''
    showCreateInput.value = false
  }
}

async function listChannels() {
  clearErrors()

  try {
    const response = await SignalingService.listRooms()

    if (Array.isArray(response)) {
      channels.value = response
    } else {
      throw { message: 'Invalid response from server' }
    }
  } catch (e) {
    console.error(e)
    parseApiError(e)
    return
  }
}

function selectChannel(id: string | undefined) {
  if (typeof id === 'undefined') return
  if (id === selectedChannelId.value) return

  if (callStore.isInCall) {
    const result = confirm('Вы уверены, что хотите переключиться на другой канал')

    if (!result) return
  }

  selectedChannelId.value = id
}

async function logout() {
  try {
    await authStore.clearTokens()
    await AuthService.logoutUser()
    router.push({ name: 'Login' })
  } catch (e) {
    console.error(e)
    parseApiError(e)
    return
  }
}

onMounted(() => {
  listChannels()
})
</script>

<template>
  <div
    class="min-h-screen font-sans text-slate-100 bg-gradient-to-b from-slate-900 to-slate-950 border-r border-slate-800"
  >
    <!-- mobile header with toggle -->
    <header class="flex items-center p-2 bg-slate-900/40 border-b border-slate-800">
      <div v-if="showSidebar" class="ml-3 font-semibold">{{ serverName }}</div>
      <button
        type="button"
        class="ml-auto p-2 rounded-md text-slate-200 bg-slate-700/30 hover:bg-slate-700/50"
        :class="{ 'w-full': !showSidebar }"
        @click="showSidebar = !showSidebar"
        :aria-pressed="showSidebar"
        title="Открыть/Закрыть боковую панель"
      >
        <FontAwesomeIcon :icon="showSidebar ? faXmarkCircle : faArrowAltCircleRight" />
      </button>
    </header>

    <div class="flex flex-col justify-between h-[calc(100vh-56px)] md:h-min-screen">
      <!-- channels panel -->
      <aside
        :class="[
          'relative flex flex-col bg-slate-800/40 border-l border-slate-800/60 overflow-hidden transition-all duration-200 ease-in-out',
          showSidebar
            ? 'w-[340px] translate-x-0'
            : '-translate-x-full md:translate-x-0 w-[56px] md:w-[56px]',
        ]"
      >
        <div
          v-if="showSidebar"
          class="flex items-center justify-between px-3 py-3 border-b border-slate-800"
        >
          <div class="flex items-center gap-2">
            <i class="fa-solid fa-server text-indigo-400"></i>
            <div>
              <div :class="showSidebar ? 'text-sm font-semibold' : 'hidden'">{{ serverName }}</div>
              <div v-if="showSidebar" class="text-xs text-slate-400">Каналы</div>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <button
              type="button"
              class="p-2 rounded-md text-slate-200 bg-slate-700/30 hover:bg-slate-700/50"
              @click="showCreateInput = !showCreateInput"
              :aria-pressed="showCreateInput"
              title="Создать канал"
            >
              <FontAwesomeIcon :icon="faPlus" />
            </button>
          </div>
        </div>

        <div
          v-if="showCreateInput && showSidebar"
          class="px-3 py-2 border-b border-slate-800 flex gap-2 items-center"
        >
          <input
            v-model="newChannelName"
            @keyup.enter="addChannel"
            class="flex-1 px-3 py-2 rounded-md bg-slate-900/40 border border-slate-700 text-slate-100"
            placeholder="Наименование канала"
          />
          <button
            type="button"
            class="px-3 py-2 rounded-md bg-emerald-500 text-white"
            @click="addChannel"
          >
            <FontAwesomeIcon :icon="faCheck" />
          </button>
          <button
            class="px-3 py-2 rounded-md bg-red-700/30 text-slate-200"
            @click="
              () => {
                showCreateInput = false
                newChannelName = ''
              }
            "
          >
            <FontAwesomeIcon :icon="faXmarkCircle" />
          </button>
        </div>

        <!-- channels list -->
        <div v-if="showSidebar" class="flex-1 overflow-auto px-2 py-3">
          <div v-if="channels.length === 0" class="px-3 py-2 text-slate-400 text-sm">
            Нет каналов, создайте новый канал!
          </div>

          <ul class="space-y-1">
            <li v-for="ch in channels" :key="ch.id" class="px-2">
              <div
                @click="selectChannel(ch.id)"
                :class="[
                  'w-full flex items-center cursor-pointer gap-3 px-3 py-2 rounded-md text-left hover:bg-slate-700/30',
                  ch.id === selectedChannelId ? 'bg-indigo-600/20' : '',
                ]"
              >
                <span class="flex-1 truncate">{{ ch.name }}</span>
              </div>
            </li>
          </ul>
        </div>
      </aside>

      <!-- logout button -->
      <div class="p-4">
        <div v-if="showSidebar" class="mb-4">
          <div class="text-sm text-slate-400">Вы вошли как:</div>
          <div class="font-semibold">{{ props.user.username }}</div>
        </div>
        <button
          type="button"
          class="w-full flex items-center gap-2 p-2 rounded-md text-slate-200 bg-slate-700/30 hover:bg-slate-700/50"
          title="Выйти"
          @click="logout"
        >
          <FontAwesomeIcon :icon="faSignOutAlt" />
          <span v-if="showSidebar">Выйти</span>
        </button>
      </div>
    </div>
  </div>
</template>
