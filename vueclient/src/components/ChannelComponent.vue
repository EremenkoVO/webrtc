<script setup lang="ts">
import { SignalingService, type ErrorResponse, type RoomJoinResponse } from '@/api'
import connectSound from '@/assets/sound/connect.wav'
import { useWebRTC } from '@/composible/useWebRTC'
import { useCallStore } from '@/stores/callStore'
import { useRoomStore } from '@/stores/roomStore'
import { useSignalingStore } from '@/stores/signalingStore'
import {
  faChevronUp,
  faDisplay,
  faMicrophone,
  faMicrophoneSlash,
  faPhoneSlash,
  faVideo,
  faVideoSlash,
  faXmark,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import { computed, ref, watch } from 'vue'

const props = defineProps<{
  selectedChannelId: string | undefined
  selectedChannelName: string | undefined
  userName: string | undefined
}>()

const roomStore = useRoomStore()
const signalingStore = useSignalingStore()
const callStore = useCallStore()

const {
  localStream,
  remotePeers,
  stopMedia,
  joinRoomWithMedia,
  initializeMedia,
  leaveRoom,
  switchCamera,
  switchMicrophone,
  startScreenShare,
  stopScreenShare,
} = useWebRTC()

const clientId = computed(() => roomStore.clientId)
const isInCall = ref(false)
const videoEnabled = ref(false)
const audioEnabled = ref(true)
const cameraMenuOpen = ref(false)
const microphoneMenuOpen = ref(false)
const isSharingScreen = ref(false)
const videoDevices = ref<MediaDeviceInfo[]>([])
const audioDevices = ref<MediaDeviceInfo[]>([])
const audioElement = ref<HTMLAudioElement | null>(null)
const currentDeviceId = ref<string | null>(null)
const soundUrl = connectSound

const totalPeers = computed(() => 1 + remotePeers.value.length)

// динамический класс ширины
const videoTileClass = computed(() => {
  if (totalPeers.value <= 2) {
    // 1–2 участника → большие окна
    return 'w-full sm:w-[70%] md:w-[60%] max-w-[700px]'
  } else if (totalPeers.value <= 4) {
    // 3–4 участника → средние
    return 'w-full sm:w-[48%] md:w-[45%] max-w-[500px]'
  } else if (totalPeers.value <= 6) {
    // 5–6 участников → поменьше
    return 'w-full sm:w-[31%] md:w-[30%] max-w-[400px]'
  } else {
    // 7+ участников → маленькие плитки
    return 'w-full sm:w-[23%] md:w-[22%] max-w-[320px]'
  }
})

// Start call
async function startCall() {
  if (!props.selectedChannelId) {
    console.error('No channel selected')
    return
  }

  await connectToRoom(props.selectedChannelId)

  console.log(props.userName)
  try {
    await joinRoomWithMedia(props.selectedChannelId, props.userName || 'Anonymous', {
      video: videoEnabled.value,
      audio: audioEnabled.value,
    })
    isInCall.value = true
    callStore.setStateCall(true)
  } catch (error) {
    console.error('Failed to start call:', error)
    alert('Не удалось начать звонок. Проверьте разрешения на камеру и микрофон.')
  }
}

// Start screen share
async function startScreenSharing() {
  if (!props.selectedChannelId) {
    console.error('No channel selected')
    return
  }

  try {
    await startScreenShare().then(() => {
      console.log('Screen sharing started')
      isSharingScreen.value = true
    })
  } catch (error) {
    console.error('Failed to start screen share:', error)
  }
}

// Stop screen share
async function stopScreenSharing() {
  try {
    await stopScreenShare()
    isSharingScreen.value = false
  } catch (error) {
    console.error('Failed to stop screen share:', error)
  }
}

// End call
function endCall() {
  leaveRoom()
  stopMedia()
  isInCall.value = false
  callStore.setStateCall(false)
}

// Toggle video
function toggleVideo() {
  if (localStream.value) {
    if (localStream.value.getVideoTracks().length === 0) {
      initializeMedia({
        video: true,
        audio: audioEnabled.value
          ? { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
          : false,
      })
      videoEnabled.value = true
    }

    const videoTrack = localStream.value.getVideoTracks()[0]
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled
      videoEnabled.value = videoTrack.enabled
    }
  }
}

// Toggle audio
function toggleAudio() {
  if (localStream.value) {
    const audioTrack = localStream.value.getAudioTracks()[0]
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled
      audioEnabled.value = audioTrack.enabled
    }
  }
}

// Toggle camera menu
function toggleCameraMenu() {
  if (localStream.value?.getVideoTracks().length === 0) {
    initializeMedia({ video: true, audio: audioEnabled.value })
    videoEnabled.value = true
  }

  cameraMenuOpen.value = !cameraMenuOpen.value
  if (cameraMenuOpen.value) {
    // Fetch video input devices
    navigator.mediaDevices.enumerateDevices().then((devices) => {
      videoDevices.value = devices.filter((device) => device.kind === 'videoinput')
    })
  }
}

// Toggle microphone menu
function toggleMicrophoneMenu() {
  microphoneMenuOpen.value = !microphoneMenuOpen.value
  if (microphoneMenuOpen.value) {
    // Fetch audio input devices
    navigator.mediaDevices.enumerateDevices().then((devices) => {
      audioDevices.value = devices.filter((device) => device.kind === 'audioinput')
    })
  }
}

function deviceAudioIndex(device: MediaDeviceInfo) {
  return audioDevices.value.indexOf(device) + 1
}

function deviceVideoIndex(device: MediaDeviceInfo) {
  return videoDevices.value.indexOf(device) + 1
}

function selectCamera(deviceId: string) {
  currentDeviceId.value = deviceId
  cameraMenuOpen.value = false
  if (isInCall.value) {
    switchCamera(deviceId)
  }
}

function selectMicrophone(deviceId: string) {
  currentDeviceId.value = deviceId
  microphoneMenuOpen.value = false
  if (isInCall.value) {
    switchMicrophone(deviceId)
  }
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

      // Join the signaling room via WebSocket
      if (!signalingStore.isConnected) {
        signalingStore.connect()
        // Wait for connection to establish
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }

      signalingStore.joinRoom(id)
      console.log('Connected to room:', id)
    }
  } catch (e) {
    console.error(e)
    return
  }
}

// Watch for channel changes and leave current call
watch(
  () => props.selectedChannelId,
  (newId, oldId) => {
    if (oldId && newId !== oldId && isInCall.value) {
      endCall()
    }
  },
)

watch(
  () => isInCall.value,
  (inCall) => {
    if (inCall) {
      const audio = audioElement.value
      if (audio) {
        audio.play().catch((error) => {
          console.error('Error playing audio:', error)
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
          console.error('Error playing audio:', error)
        })
      }
    }
  },
)

// Setup video element refs
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setupVideoElement(el: any, stream: MediaStream | null) {
  if (el && stream && el instanceof HTMLVideoElement) {
    el.srcObject = stream
  }
}
</script>

<template>
  <div
    v-if="selectedChannelId"
    class="flex flex-col h-full bg-gradient-to-b from-slate-900 to-slate-950 text-white"
  >
    <!-- Header -->
    <div class="p-4 border-b border-slate-800">
      <h1 class="text-xl font-semibold">Канал: {{ selectedChannelName }}</h1>
      <p v-if="clientId" class="text-sm text-slate-400 mt-1">
        Client ID: {{ signalingStore.clientId || clientId }}
      </p>
      <div class="flex items-center gap-2 mt-2">
        <div
          :class="[
            'w-2 h-2 rounded-full',
            signalingStore.isConnected ? 'bg-green-500' : 'bg-red-500',
          ]"
        ></div>
        <span class="text-sm">
          {{ signalingStore.isConnected ? 'Подключено' : 'Отключено' }}
        </span>
      </div>
    </div>

    <audio ref="audioElement" :src="soundUrl"></audio>

    <!-- Video Grid -->
    <div class="flex-1 p-4 overflow-auto">
      <!-- Если не в звонке -->
      <div v-if="!isInCall" class="flex items-center justify-center h-full">
        <div class="text-center">
          <p class="text-slate-400 mb-4">Вы не в звонке</p>
          <button
            type="button"
            class="px-6 py-3 rounded-lg bg-green-600 hover:bg-green-700 text-white font-semibold transition-colors"
            @click="startCall"
            :disabled="!selectedChannelId"
          >
            <FontAwesomeIcon :icon="faVideo" class="mr-2" />
            Начать звонок
          </button>
        </div>
      </div>

      <!-- Если в звонке -->
      <div
        v-else
        class="flex flex-wrap justify-center items-center gap-4 h-full content-center transition-all duration-300"
      >
        <!-- Локальное видео -->
        <div
          :class="videoTileClass"
          class="relative bg-slate-800 border border-slate-700 rounded-lg overflow-hidden aspect-video transition-all duration-300"
        >
          <video
            v-if="localStream"
            :ref="(el: any) => setupVideoElement(el, localStream)"
            autoplay
            muted
            playsinline
            class="w-full h-full object-cover"
          ></video>
          <div class="absolute bottom-2 left-2 bg-slate-900/80 px-2 py-1 rounded text-sm">Вы</div>
        </div>

        <!-- Видео собеседников -->
        <div
          v-for="peer in remotePeers"
          :key="peer.peerId"
          :class="videoTileClass"
          class="relative bg-slate-800 border border-slate-700 rounded-lg overflow-hidden aspect-video transition-all duration-300"
        >
          <video
            v-if="peer.remoteStream"
            :ref="(el: any) => setupVideoElement(el, peer.remoteStream)"
            autoplay
            playsinline
            class="w-full h-full object-cover"
          ></video>
          <div class="absolute bottom-2 left-2 bg-slate-900/80 px-2 py-1 rounded text-sm">
            {{ peer.username || peer.peerId }}
          </div>
        </div>
      </div>
    </div>

    <!-- Call Controls -->
    <div v-if="isInCall" class="p-4">
      <div class="flex items-center justify-center gap-4">
        <div class="relative flex items-center">
          <!-- Основная кнопка включения/выключения видео -->
          <button
            type="button"
            :class="[
              'p-4 rounded-l-full transition-colors flex items-center justify-center',
              videoEnabled ? 'bg-slate-700 hover:bg-slate-600' : 'bg-red-600 hover:bg-red-700',
            ]"
            @click="toggleVideo"
            :title="videoEnabled ? 'Отключить видео' : 'Включить видео'"
          >
            <FontAwesomeIcon
              :icon="videoEnabled ? faVideo : faVideoSlash"
              class="text-xl text-white"
            />
          </button>

          <!-- Кнопка выбора камеры -->
          <div class="relative">
            <button
              type="button"
              class="p-4 rounded-r-full bg-slate-700 hover:bg-slate-600 transition-colors flex items-center justify-center"
              @click="toggleCameraMenu"
              title="Выбрать камеру"
            >
              <FontAwesomeIcon
                :icon="faChevronUp"
                class="text-xl text-white"
                :class="{ 'rotate-180': cameraMenuOpen }"
              />
            </button>

            <!-- Выпадающее меню для выбора камеры -->
            <transition name="fade">
              <ul
                v-if="cameraMenuOpen"
                class="absolute right-0 bottom-12 mt-2 w-56 bg-slate-800 text-white rounded-xl shadow-lg z-50"
                v-click-outside="() => (cameraMenuOpen = false)"
              >
                <li
                  v-for="device in videoDevices"
                  :key="device.deviceId"
                  @click="selectCamera(device.deviceId)"
                  class="px-4 py-2 hover:bg-slate-700 cursor-pointer transition-colors"
                >
                  {{ device.label || 'Камера ' + deviceVideoIndex(device) }}
                </li>
              </ul>
            </transition>
          </div>
        </div>

        <div class="relative flex justify-center items-center">
          <button
            type="button"
            :class="[
              'p-4 rounded-l-full transition-colors flex items-center justify-center',
              audioEnabled ? 'bg-slate-700 hover:bg-slate-600' : 'bg-red-600 hover:bg-red-700',
            ]"
            @click="toggleAudio"
            :title="audioEnabled ? 'Отключить микрофон' : 'Включить микрофон'"
          >
            <FontAwesomeIcon
              :icon="audioEnabled ? faMicrophone : faMicrophoneSlash"
              class="text-xl"
            />
          </button>

          <div class="relative">
            <button
              type="button"
              class="p-4 rounded-r-full bg-slate-700 hover:bg-slate-600 transition-colors flex items-center justify-center"
              @click="toggleMicrophoneMenu"
              title="Выбрать микрофон"
            >
              <FontAwesomeIcon
                :icon="faChevronUp"
                class="text-xl text-white"
                :class="{ 'rotate-180': microphoneMenuOpen }"
              />
            </button>
          </div>

          <!-- Выпадающее меню -->
          <transition name="fade">
            <ul
              v-if="microphoneMenuOpen"
              class="absolute right-0 bottom-12 mt-2 w-56 bg-slate-800 text-white rounded-xl shadow-lg z-50 items-center justify-center"
              v-click-outside="() => (microphoneMenuOpen = false)"
            >
              <li
                v-for="device in audioDevices"
                :key="device.deviceId"
                @click="selectMicrophone(device.deviceId)"
                class="px-4 py-2 rounded-xl hover:bg-slate-700 cursor-pointer transition-colors"
              >
                {{ device.label || 'Камера ' + deviceAudioIndex(device) }}
              </li>
            </ul>
          </transition>
        </div>

        <button
          v-if="!isSharingScreen"
          type="button"
          class="p-4 flex items-center justify-center rounded-full bg-slate-700 hover:bg-slate-600 transition-colors"
          @click="startScreenSharing"
          title="Начать транслирование экрана"
        >
          <FontAwesomeIcon :icon="faDisplay" class="text-xl" />
        </button>

        <button
          v-else
          type="button"
          class="p-4 flex items-center justify-center rounded-full bg-red-600 hover:bg-red-700 transition-colors"
          @click="stopScreenSharing"
          title="Остановить транслирование экрана"
        >
          <FontAwesomeIcon :icon="faXmark" class="text-xl" />
        </button>

        <button
          type="button"
          class="p-4 flex items-center justify-center rounded-full bg-red-600 hover:bg-red-700 transition-colors"
          @click="endCall"
          title="Завершить звонок"
        >
          <FontAwesomeIcon :icon="faPhoneSlash" class="text-xl" />
        </button>
      </div>

      <div class="mt-4 text-center text-sm text-slate-400">
        <p>Подключенных участников: {{ remotePeers.length + 1 }}</p>
      </div>
    </div>
  </div>
</template>
