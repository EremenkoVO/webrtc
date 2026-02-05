<script setup lang="ts">
import { SignalingService, type ErrorResponse, type RoomJoinResponse } from '@/api'
import connectSound from '@/assets/sound/connect.wav'
import { useWebRTC } from '@/composible/useWebRTC'
import { useCallStore } from '@/stores/callStore'
import { useChatStore } from '@/stores/chatStore'
import { useRoomStore } from '@/stores/roomStore'
import { useSidebarStore } from '@/stores/sidebarStore'
import { useSignalingStore } from '@/stores/signalingStore'
import { faVideo, faBars } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import { computed, onMounted, ref, watch } from 'vue'
import BadgeComponent from './BadgeComponent.vue'
import ChannelControls from './ChannelControls.vue'
import ChatComponent from './ChatComponent.vue'
import VideoTile from './VideoTile.vue'
import { faComments, faTimes } from '@fortawesome/free-solid-svg-icons'

const props = defineProps<{
  userName: string | undefined
}>()

const roomStore = useRoomStore()
const signalingStore = useSignalingStore()
const callStore = useCallStore()
const chatStore = useChatStore()
const sidebarStore = useSidebarStore()

const {
  localStream,
  remotePeers,
  peerStates,
  peerPlayback,
  peerAudioStreams,
  videoDevices,
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
} = useWebRTC()

const videoEnabled = ref(false)
const audioEnabled = ref(true)
const audioElement = ref<HTMLAudioElement | null>(null)
const soundUrl = connectSound
const totalPeers = computed(() => 1 + remotePeers.value.length)
const currentCameraDeviceId = ref<string | null>(null)
const currentMicrophoneDeviceId = ref<string | null>(null)
const videoStreamIndex = ref<number>(0)
const showChatMobile = ref(false)

// динамический класс ширины
const videoTileClass = computed(() => {
  const base =
    'relative bg-slate-800 border border-slate-700 rounded-lg overflow-hidden aspect-video transition-all duration-300'
  // Mobile-first: full width on mobile, then responsive
  if (totalPeers.value <= 2) return base + ' w-full sm:w-[70%] md:w-[60%] max-w-[700px]'
  if (totalPeers.value <= 4) return base + ' w-full sm:w-[48%] md:w-[45%] max-w-[500px]'
  if (totalPeers.value <= 6) return base + ' w-full sm:w-[31%] md:w-[30%] max-w-[400px]'
  return base + ' w-full sm:w-[23%] md:w-[22%] max-w-[320px]'
})

function selectCamera(deviceId: string) {
  currentCameraDeviceId.value = deviceId
  videoEnabled.value = true
  if (callStore.isInCall) {
    switchCamera(deviceId)
  }

  toggleMedia(videoEnabled.value, audioEnabled.value, deviceId)
}

function selectMicrophone(deviceId: string) {
  currentMicrophoneDeviceId.value = deviceId
  if (callStore.isInCall) {
    switchMicrophone(deviceId)
  }
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
    // Отключаем видео
    localStream.value.getVideoTracks().forEach((track) => track.stop())
    localStream.value.removeTrack(localStream.value.getVideoTracks()[0])
    videoEnabled.value = false
  }

  toggleMedia(videoEnabled.value, audioEnabled.value, currentCameraDeviceId.value || '')
}

async function toggleMicrophone() {
  if (localStream.value) {
    const audioTrack = localStream.value.getAudioTracks()[0]
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled
      audioEnabled.value = audioTrack.enabled
    }
  }

  toggleMedia(videoEnabled.value, audioEnabled.value, currentCameraDeviceId.value || '')
}

// Запуск звонка
async function startCall() {
  if (!roomStore.selectedChannelId) {
    console.error('Не выбран канал')
    return
  }

  await connectToRoom(roomStore.selectedChannelId)

  try {
    await joinRoomWithMedia(roomStore.selectedChannelId, props.userName, {
      video: videoEnabled.value,
      audio: audioEnabled.value
        ? { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        : false,
    }).then(() => {
      callStore.setStateCall(true)
      roomStore.getListChannels()
    })
  } catch (error) {
    console.error('Не удалось начать звонок:', error)
    alert('Не удалось начать звонок. Проверьте разрешения на камеру и микрофон.')
  }
}

// Завершение звонка
function endCall() {
  leaveRoom()
  stopMedia()
  roomStore.getListChannels()
  videoEnabled.value = false
  audioEnabled.value = true
  callStore.setStateCall(false)
}

function isErrorResponse(response: RoomJoinResponse | ErrorResponse): response is ErrorResponse {
  return 'error' in response
}

async function connectToRoom(id: string | undefined) {
  if (typeof id === 'undefined') return

  try {
    const response = await SignalingService.joinRoom(id)

    if (isErrorResponse(response)) {
      throw response
    }

    if (response.client_id && response.room_id) {
      await roomStore.setClientAndRoomId(response.client_id, id)

      // Подключаемся к комнате сигнализации через WebSocket
      if (!signalingStore.isConnected) {
        signalingStore.connect()
        // Ждём установления соединения
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }

      signalingStore.joinRoom(id)
      console.log('Подключились к комнате:', id)
    }
  } catch (e) {
    console.error(e)
    return
  }
}

// Следим за сменой канала и выходим из текущего звонка
watch(
  () => roomStore.selectedChannelId,
  (newId, oldId) => {
    if (oldId && newId !== oldId && callStore.isInCall) {
      endCall()
    }
  },
)

watch(
  () => callStore.isInCall,
  (inCall) => {
    if (inCall) {
      const audio = audioElement.value
      if (audio) {
        audio.play().catch((error) => {
          console.error('Ошибка воспроизведения звука:', error)
        })
      }
    }
  },
)

watch(
  () => remotePeers.value.length,
  (newLength, oldLength) => {
    if (newLength > oldLength) {
      const audio = audioElement.value
      if (audio) {
        audio.play().catch((error) => {
          console.error('Ошибка воспроизведения звука:', error)
        })
      }
    }
  },
)

watch(
  () => remotePeers.value,
  (newStream) => {
    Array.from(newStream.values()).forEach((peer) => {
      console.log('Удалённый поток изменился:', peer?.remoteStream?.getVideoTracks())
    })
  },
  { deep: true },
)

// Отслеживание изменений участников в реальном времени
watch(
  () => signalingStore.room_mates,
  (newRoomMates) => {
    // Обновляем список участников в roomStore при изменении room_mates
    const roommatesArray = Object.values(newRoomMates)
    roomStore.setRoommates(roommatesArray)
  },
  { deep: true, immediate: true }
)

// Отслеживание смены канала для очистки списка участников
watch(
  () => roomStore.selectedChannelId,
  (newChannelId, oldChannelId) => {
    if (newChannelId !== oldChannelId) {
      // Очищаем список участников при смене канала
      roomStore.setRoommates([])
    }
  }
)

onMounted(() => {
  fetchVideoDevices()
  fetchAudioDevices()
  
  // Инициализируем список участников при монтировании
  const roommatesArray = Object.values(signalingStore.room_mates)
  roomStore.setRoommates(roommatesArray)
})
</script>

<template>
  <div class="flex h-full text-white">
    <!-- Основная область с видео -->
    <div class="flex flex-col flex-1 min-w-0">
      <!-- Заголовок -->
      <div class="p-3 sm:p-4 border-b border-slate-800/50 bg-slate-900/30 backdrop-blur-sm sticky top-0 z-10">
        <div class="flex items-center gap-3">
          <!-- Кнопка меню (мобильная) -->
          <button
            v-if="sidebarStore.isMobile"
            data-sidebar-toggle
            @click="sidebarStore.toggle"
            class="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-300 transition-all touch-manipulation flex-shrink-0"
            :aria-label="sidebarStore.isOpen ? 'Закрыть меню' : 'Открыть меню'"
            title="Меню"
          >
            <FontAwesomeIcon :icon="faBars" class="text-lg" />
          </button>

          <div class="flex-1 min-w-0">
            <h1 class="text-lg sm:text-xl font-semibold truncate">
              {{ roomStore.selectedChannelName || 'Выберите канал' }}
            </h1>
            <div v-if="roomStore.selectedChannelId" class="flex items-center gap-2 mt-1">
              <div
                :class="[
                  'w-2 h-2 rounded-full flex-shrink-0',
                  signalingStore.isConnected ? 'bg-green-500' : 'bg-red-500',
                ]"
              ></div>
              <span class="text-xs sm:text-sm text-slate-400">
                {{ signalingStore.isConnected ? 'Подключено' : 'Отключено' }}
              </span>
            </div>
          </div>

          <!-- Мобильная кнопка чата -->
          <button
            v-if="roomStore.selectedChannelId && !showChatMobile"
            @click="showChatMobile = true"
            class="lg:hidden p-2 rounded-lg bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-300 transition-all touch-manipulation relative flex-shrink-0"
            title="Открыть чат"
          >
            <FontAwesomeIcon :icon="faComments" />
            <span
              v-if="chatStore.messages.length > 0"
              class="absolute -top-1 -right-1 w-5 h-5 bg-blue-600 text-white text-xs rounded-full flex items-center justify-center font-semibold"
            >
              {{ chatStore.messages.length > 9 ? '9+' : chatStore.messages.length }}
            </span>
          </button>
        </div>
      </div>

      <!-- Empty State - No Channel Selected -->
      <div
        v-if="!roomStore.selectedChannelId"
        class="flex-1 flex items-center justify-center p-8"
      >
        <div class="text-center max-w-md">
          <div class="w-20 h-20 rounded-full bg-slate-800/50 flex items-center justify-center mx-auto mb-4">
            <FontAwesomeIcon :icon="faBars" class="text-3xl text-slate-400" />
          </div>
          <h2 class="text-xl font-semibold text-white mb-2">Выберите канал</h2>
          <p class="text-slate-400 text-sm">
            {{ sidebarStore.isMobile ? 'Нажмите на кнопку меню, чтобы выбрать канал' : 'Выберите канал из списка слева' }}
          </p>
        </div>
      </div>

      <!-- Channel Content -->
      <template v-else>
        <audio ref="audioElement" :src="soundUrl"></audio>

        <!-- Сетка видео -->
        <div class="flex-1 p-2 sm:p-4 overflow-auto">
      <!-- Если не на линии -->
      <div v-if="!callStore.isInCall" class="flex items-center justify-center h-full min-h-[200px]">
        <div class="text-center px-4 max-w-md">
          <div v-if="roomStore.roommates.length">
            <p class="text-slate-400 mb-3 text-sm sm:text-base">Подключенные участники</p>
            <ul class="text-slate-400 mb-4 space-y-1">
              <li
                v-for="(user, index) in roomStore.roommates"
                :key="index"
                class="text-sm sm:text-base"
              >
                {{ user }}
              </li>
            </ul>
          </div>
          <div v-else>
            <p class="text-slate-400 mb-4 text-sm sm:text-base">Нет подключенных участников</p>
          </div>

          <p class="text-slate-400 mb-4 text-sm sm:text-base">Вы не в звонке</p>
          <button
            type="button"
            class="px-4 sm:px-6 py-2 sm:py-3 rounded-lg bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-semibold transition-all transform hover:scale-105 active:scale-95 shadow-lg"
            @click="startCall"
            :disabled="!roomStore.selectedChannelId"
          >
            <FontAwesomeIcon :icon="faVideo" class="mr-2" />
            <span class="text-sm sm:text-base">Начать звонок</span>
          </button>
        </div>
      </div>

      <!-- Если в звонке -->
      <div
        v-else
        class="flex flex-wrap justify-center items-center gap-2 sm:gap-4 h-full content-center transition-all duration-300 p-2"
      >
        <!-- Локальное видео -->
        <div
          v-if="localStream"
          :class="[videoTileClass]"
          class="relative bg-slate-800 border border-slate-700 rounded-lg overflow-hidden aspect-video transition-all duration-300"
        >
          <VideoTile
            :condition-video="localStream?.getVideoTracks().length > 0"
            :condition-audio="localStream?.getAudioTracks().length > 0"
            :stream="localStream"
            :key-id="localStream.id"
            :muted="true"
          />
          <BadgeComponent
            :condition-show="!audioEnabled"
            :name="`Вы (${props.userName})`"
            :speaking="isLocalSpeaking"
          />
        </div>

        <!-- Видео собеседников -->
        <div v-for="peer in remotePeers" :key="peer.peerId" :class="[videoTileClass]">
          <VideoTile
            :condition-video="peer.remoteStream?.getVideoTracks().length"
            :condition-audio="peer.remoteStream?.getAudioTracks().length"
            :stream="peer.remoteStream"
            :key-id="peer.peerId"
            :muted="peerPlayback[peer.peerId]?.muted ?? false"
            :volume="peerPlayback[peer.peerId]?.volume ?? 1"
            :audio-stream="peerAudioStreams[peer.peerId]"
            @update:muted="handlePeerMuteChange(peer.peerId, $event)"
            @update:volume="handlePeerVolumeChange(peer.peerId, $event)"
          />
          <BadgeComponent
            :condition-show="peerStates[peer.peerId] && !peerStates[peer.peerId]?.microphone"
            :name="peer.room_mates?.[peer.peerId] || peer.peerId"
            :speaking="speakingPeers[peer.peerId]"
          />
        </div>
      </div>
    </div>

        <!-- Call Controls -->
        <ChannelControls
          v-if="callStore.isInCall"
          :local-stream="localStream"
          :remote-peers="remotePeers"
          :videoEnabled="videoEnabled"
          :audioEnabled="audioEnabled"
          :videoStreamIndex="videoStreamIndex"
          :currentCameraDeviceId="currentCameraDeviceId"
          :currentMicrophoneDeviceId="currentMicrophoneDeviceId"
          :isScreenSharing="isScreenSharing"
          :startScreenShare="startScreenShare"
          :stopScreenShare="stopScreenShare"
          @endCall="endCall"
          @update:toggleVideo="toggleVideo"
          @update:toggleMicrophone="toggleMicrophone"
          @update:videoEnabled="(value: boolean) => (videoEnabled = value)"
          @update:audioEnabled="(value: boolean) => (audioEnabled = value)"
          @update:selectCamera="selectCamera"
          @update:selectMicrophone="selectMicrophone"
          @update:videoStreamIndex="(value: number) => (videoStreamIndex = value)"
        />
      </template>
    </div>

    <!-- Боковая панель чата (Desktop) -->
    <div class="hidden lg:block w-80 border-l border-slate-800 flex-shrink-0">
      <ChatComponent :room-id="roomStore.selectedChannelId" :user-name="props.userName" />
    </div>

    <!-- Мобильная панель чата (Overlay) -->
    <Transition name="slide-left">
      <div
        v-if="showChatMobile"
        v-click-outside="() => (showChatMobile = false)"
        class="lg:hidden fixed inset-0 z-50 flex flex-col bg-slate-900"
      >
        <div class="p-3 border-b border-slate-800 bg-slate-800/50 flex items-center justify-between safe-area-inset-top">
          <h2 class="text-lg font-semibold text-white">Чат</h2>
          <button
            @click="showChatMobile = false"
            class="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 active:bg-slate-500 text-slate-300 transition-colors touch-manipulation"
            title="Закрыть чат"
          >
            <FontAwesomeIcon :icon="faTimes" />
          </button>
        </div>
        <div class="flex-1 overflow-hidden min-h-0">
          <ChatComponent :room-id="roomStore.selectedChannelId" :user-name="props.userName" />
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* Анимация для мобильного чата */
.slide-left-enter-active,
.slide-left-leave-active {
  transition: transform 0.3s ease-in-out;
}

.slide-left-enter-from {
  transform: translateX(100%);
}

.slide-left-leave-to {
  transform: translateX(100%);
}
</style>
