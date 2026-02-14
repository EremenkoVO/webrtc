<!-- eslint-disable @typescript-eslint/no-explicit-any -->
<script setup lang="ts">
import { useWebRTC, type PeerConnection } from '@/composible/useWebRTC'
import {
  faChevronUp,
  faDisplay,
  faMicrophone,
  faMicrophoneSlash,
  faPhoneSlash,
  faStop,
  faVideo,
  faVideoSlash,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import { ref } from 'vue'

const props = defineProps<{
  videoEnabled: boolean
  audioEnabled: boolean
  isScreenSharing: boolean
  startScreenShare: any
  stopScreenShare: any
  videoStreamIndex: number
  localStream: MediaStream | null
  currentCameraDeviceId: string | null
  currentMicrophoneDeviceId: string | null
  remotePeers: PeerConnection[]
}>()

const emits = defineEmits<{
  (e: 'endCall'): void
  (e: 'update:videoEnabled', value: boolean): void
  (e: 'update:audioEnabled', value: boolean): void
  (e: 'update:videoStreamIndex', value: number): void
  (e: 'update:selectCamera', value: string): void
  (e: 'update:currentCameraDeviceId', value: string): void
  (e: 'update:selectMicrophone', value: string): void
  (e: 'update:toggleMicrophone'): void
  (e: 'update:toggleVideo'): void
}>()

const { videoDevices, audioDevices, fetchVideoDevices, fetchAudioDevices } = useWebRTC()

const cameraMenuOpen = ref(false)
const microphoneMenuOpen = ref(false)

// Переключение состояния видео
function toggleVideo() {
  emits('update:toggleVideo')
}

function selectCamera(deviceId: string) {
  emits('update:selectCamera', deviceId)
  emits('update:currentCameraDeviceId', deviceId)
  cameraMenuOpen.value = false
}

// Переключение состояния микрофона
function toggleAudio() {
  // Просим родительский компонент выполнить фактическое переключение микрофона (он управляет треками и состоянием)
  emits('update:toggleMicrophone')
  // Обновляем булево значение в родителе, чтобы интерфейс оставался синхронизирован
  emits('update:audioEnabled', !props.audioEnabled)
}

// Переключение меню выбора камеры
async function toggleCameraMenu() {
  cameraMenuOpen.value = !cameraMenuOpen.value
  if (cameraMenuOpen.value) {
    // Загружаем список видеоустройств
    fetchVideoDevices()
  }
}

// Переключение меню выбора микрофона
function toggleMicrophoneMenu() {
  microphoneMenuOpen.value = !microphoneMenuOpen.value
  if (microphoneMenuOpen.value) {
    // Загружаем список аудиоустройств
    fetchAudioDevices()
  }
}

function deviceAudioIndex(device: MediaDeviceInfo) {
  return audioDevices.value.indexOf(device) + 1
}

function deviceVideoIndex(device: MediaDeviceInfo) {
  return videoDevices.value.indexOf(device) + 1
}

function selectMicrophone(deviceId: string) {
  emits('update:selectMicrophone', deviceId)
  microphoneMenuOpen.value = false
}
</script>

<template>
  <div class="p-2 sm:p-4 2xl:p-5 4k:p-6 5xl:p-8 bg-slate-900/50 border-t border-slate-800">
    <div class="flex items-center justify-center gap-2 sm:gap-4 2xl:gap-5 4k:gap-6 flex-wrap">
      <div class="relative flex items-center">
        <!-- Основная кнопка включения/выключения видео -->
        <button
          type="button"
          :class="[
            'p-3 sm:p-4 rounded-l-full transition-all flex items-center justify-center touch-manipulation active:scale-95',
            props.videoEnabled ? 'bg-slate-700 hover:bg-slate-600' : 'bg-red-600 hover:bg-red-700',
          ]"
          @click="toggleVideo"
          :title="props.videoEnabled ? 'Отключить видео' : 'Включить видео'"
        >
          <FontAwesomeIcon
            :icon="props.videoEnabled ? faVideo : faVideoSlash"
            class="text-lg sm:text-xl text-white"
          />
        </button>

        <!-- Кнопка выбора камеры -->
        <div class="relative">
          <button
            type="button"
            class="p-3 sm:p-4 rounded-r-full bg-slate-700 hover:bg-slate-600 active:bg-slate-500 transition-all flex items-center justify-center touch-manipulation active:scale-95"
            @click="toggleCameraMenu"
            title="Выбрать камеру"
          >
            <FontAwesomeIcon
              :icon="faChevronUp"
              class="text-lg sm:text-xl text-white"
              :class="{ 'rotate-180': cameraMenuOpen }"
            />
          </button>

          <!-- Выпадающее меню для выбора камеры -->
          <transition name="fade">
            <ul
              v-if="cameraMenuOpen"
              class="absolute right-0 bottom-12 mt-2 w-48 sm:w-56 bg-slate-800 text-white rounded-xl shadow-lg z-50 max-h-48 overflow-y-auto"
              v-click-outside="() => (cameraMenuOpen = false)"
            >
              <li
                v-for="device in videoDevices"
                :key="device.deviceId"
                class="px-3 sm:px-4 py-2 text-sm sm:text-base rounded-xl hover:bg-slate-700 active:bg-slate-600 cursor-pointer transition-colors touch-manipulation"
                :class="{ 'bg-slate-600': currentCameraDeviceId === device.deviceId }"
                @click="selectCamera(device.deviceId)"
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
            'p-3 sm:p-4 rounded-l-full transition-all flex items-center justify-center touch-manipulation active:scale-95',
            props.audioEnabled ? 'bg-slate-700 hover:bg-slate-600' : 'bg-red-600 hover:bg-red-700',
          ]"
          @click="toggleAudio"
          :title="props.audioEnabled ? 'Отключить микрофон' : 'Включить микрофон'"
        >
          <FontAwesomeIcon
            :icon="props.audioEnabled ? faMicrophone : faMicrophoneSlash"
            class="text-lg sm:text-xl text-white"
          />
        </button>

        <div class="relative">
          <button
            type="button"
            class="p-3 sm:p-4 rounded-r-full bg-slate-700 hover:bg-slate-600 active:bg-slate-500 transition-all flex items-center justify-center touch-manipulation active:scale-95"
            @click="toggleMicrophoneMenu"
            title="Выбрать микрофон"
          >
            <FontAwesomeIcon
              :icon="faChevronUp"
              class="text-lg sm:text-xl text-white"
              :class="{ 'rotate-180': microphoneMenuOpen }"
            />
          </button>
        </div>

        <!-- Выпадающее меню -->
        <transition name="fade">
          <ul
            v-if="microphoneMenuOpen"
            class="absolute right-0 bottom-12 mt-2 w-48 sm:w-56 bg-slate-800 text-white rounded-xl shadow-lg z-50 items-center justify-center max-h-48 overflow-y-auto"
            v-click-outside="() => (microphoneMenuOpen = false)"
          >
            <li
              v-for="device in audioDevices"
              :key="device.deviceId"
              :class="{ 'bg-slate-600': currentMicrophoneDeviceId === device.deviceId }"
              @click="selectMicrophone(device.deviceId)"
              class="px-3 sm:px-4 py-2 text-sm sm:text-base rounded-xl hover:bg-slate-700 active:bg-slate-600 cursor-pointer transition-colors touch-manipulation"
            >
              {{ device.label || 'Микрофон ' + deviceAudioIndex(device) }}
            </li>
          </ul>
        </transition>
      </div>

      <button
        type="button"
        class="p-3 sm:p-4 flex items-center justify-center rounded-full bg-slate-700 hover:bg-slate-600 active:bg-slate-500 transition-all touch-manipulation active:scale-95"
        @click="isScreenSharing ? stopScreenShare() : startScreenShare()"
        :title="isScreenSharing ? 'Остановить демонстрацию экрана' : 'Начать демонстрацию экрана'"
      >
        <FontAwesomeIcon
          :icon="isScreenSharing ? faStop : faDisplay"
          class="text-lg sm:text-xl text-white"
        ></FontAwesomeIcon>
      </button>

      <button
        type="button"
        class="p-3 sm:p-4 flex items-center justify-center rounded-full bg-red-600 hover:bg-red-700 active:bg-red-800 transition-all touch-manipulation active:scale-95 shadow-lg"
        @click="emits('endCall')"
        title="Завершить звонок"
      >
        <FontAwesomeIcon :icon="faPhoneSlash" class="text-lg sm:text-xl text-white" />
      </button>
    </div>

    <div class="mt-2 sm:mt-4 4k:mt-5 text-center text-xs sm:text-sm 4k:text-base text-slate-400 px-2">
      <p>Участников: {{ remotePeers.length + 1 }}</p>
    </div>
  </div>
</template>
