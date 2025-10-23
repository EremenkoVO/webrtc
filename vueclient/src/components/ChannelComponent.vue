<script setup lang="ts">
import { SignalingService, type ErrorResponse, type RoomJoinResponse } from '@/api'
import { useWebRTC } from '@/composible/useWebRTC'
import { useRoomStore } from '@/stores/roomStore'
import { useSignalingStore } from '@/stores/signalingStore'
import { faUser } from '@fortawesome/free-regular-svg-icons'
import {
  faChevronUp,
  faMicrophone,
  faMicrophoneSlash,
  faPhoneSlash,
  faVideo,
  faVideoSlash,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import { computed, ref, watch } from 'vue'

const props = defineProps<{
  selectedChannelId: string | undefined
  selectedChannelName: string | undefined
}>()

const roomStore = useRoomStore()
const signalingStore = useSignalingStore()
const {
  localStream,
  remotePeers,
  stopMedia,
  joinRoomWithMedia,
  leaveRoom,
  switchCamera,
  switchMicrophone,
} = useWebRTC()

const clientId = computed(() => roomStore.clientId)
const isInCall = ref(false)
const videoEnabled = ref(true)
const audioEnabled = ref(true)
const cameraMenuOpen = ref(false)
const microphoneMenuOpen = ref(false)
const videoDevices = ref<MediaDeviceInfo[]>([])
const audioDevices = ref<MediaDeviceInfo[]>([])
const currentDeviceId = ref<string | null>(null)

// Start call
async function startCall() {
  if (!props.selectedChannelId) {
    console.error('No channel selected')
    return
  }

  await connectToRoom(props.selectedChannelId)

  try {
    await joinRoomWithMedia(props.selectedChannelId, {
      video: videoEnabled.value,
      audio: audioEnabled.value,
    })
    isInCall.value = true
  } catch (error) {
    console.error('Failed to start call:', error)
    alert('Не удалось начать звонок. Проверьте разрешения на камеру и микрофон.')
  }
}

// End call
function endCall() {
  leaveRoom()
  stopMedia()
  isInCall.value = false
}

// Toggle video
function toggleVideo() {
  if (localStream.value) {
    console.log(localStream.value.getVideoTracks())
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

    <!-- Video Grid -->
    <div class="flex-1 p-4 overflow-auto">
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

      <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 h-full">
        <!-- Local Video -->
        <div class="relative bg-slate-800 rounded-lg overflow-hidden aspect-video">
          <video
            v-if="localStream"
            :ref="(el: any) => setupVideoElement(el, localStream)"
            autoplay
            muted
            playsinline
            class="w-full h-full object-cover"
          ></video>
          <div v-else class="flex items-center justify-center h-full text-slate-400">
            <FontAwesomeIcon :icon="faUser" class="text-4xl" />
          </div>
          <div class="absolute bottom-2 left-2 bg-slate-900/80 px-2 py-1 rounded text-sm">
            Вы {{ localStream?.id }}
          </div>
        </div>

        <!-- Remote Videos -->
        <div
          v-for="peer in remotePeers"
          :key="peer.peerId"
          class="relative bg-slate-800 rounded-lg overflow-hidden aspect-video"
        >
          <video
            v-if="peer.remoteStream"
            :ref="(el: any) => setupVideoElement(el, peer.remoteStream)"
            autoplay
            playsinline
            class="w-full h-full object-cover"
          ></video>
          <div v-else class="flex items-center justify-center h-full text-slate-400">
            <FontAwesomeIcon :icon="faUser" class="text-4xl" />
          </div>
          <div class="absolute bottom-2 left-2 bg-slate-900/80 px-2 py-1 rounded text-sm">
            Peer: {{ peer.peerId }}
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
              <FontAwesomeIcon :icon="faChevronUp" class="text-xl text-white" />
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

        <div class="relative flex items-center">
          <button
            type="button"
            :class="[
              'p-4 rounded-l-full transition-colors',
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
              class="p-4 rounded-r-full bg-slate-700 hover:bg-slate-600 transition-colors"
              @click="toggleMicrophoneMenu"
              title="Выбрать микрофон"
            >
              <FontAwesomeIcon :icon="faChevronUp" class="text-xl text-white" />
            </button>
          </div>

          <!-- Выпадающее меню -->
          <transition name="fade">
            <ul
              v-if="microphoneMenuOpen"
              class="absolute right-0 bottom-12 mt-2 w-56 bg-slate-800 text-white rounded-xl shadow-lg z-50"
              v-click-outside="() => (microphoneMenuOpen = false)"
            >
              <li
                v-for="device in audioDevices"
                :key="device.deviceId"
                @click="selectMicrophone(device.deviceId)"
                class="px-4 py-2 hover:bg-slate-700 cursor-pointer transition-colors"
              >
                {{ device.label || 'Камера ' + deviceAudioIndex(device) }}
              </li>
            </ul>
          </transition>
        </div>

        <button
          type="button"
          class="p-4 rounded-full bg-red-600 hover:bg-red-700 transition-colors"
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
