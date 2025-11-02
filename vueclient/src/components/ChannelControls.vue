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

// Toggle video
function toggleVideo() {
  emits('update:toggleVideo')
}

function selectCamera(deviceId: string) {
  emits('update:selectCamera', deviceId)
  emits('update:currentCameraDeviceId', deviceId)
  cameraMenuOpen.value = false
}

// Toggle audio
function toggleAudio() {
  // Ask parent to perform the actual microphone toggle (it manages tracks/state)
  emits('update:toggleMicrophone')
  // Also update the parent-bound boolean so UI stays in sync (optional)
  emits('update:audioEnabled', !props.audioEnabled)
}

// Toggle camera menu
async function toggleCameraMenu() {
  cameraMenuOpen.value = !cameraMenuOpen.value
  if (cameraMenuOpen.value) {
    // Fetch video input devices
    fetchVideoDevices()
  }
}

// Toggle microphone menu
function toggleMicrophoneMenu() {
  microphoneMenuOpen.value = !microphoneMenuOpen.value
  if (microphoneMenuOpen.value) {
    // Fetch audio input devices
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
  <div class="p-4">
    <div class="flex items-center justify-center gap-4">
      <div class="relative flex items-center">
        <!-- Основная кнопка включения/выключения видео -->
        <button
          type="button"
          :class="[
            'p-4 rounded-l-full transition-colors flex items-center justify-center',
            props.videoEnabled ? 'bg-slate-700 hover:bg-slate-600' : 'bg-red-600 hover:bg-red-700',
          ]"
          @click="toggleVideo"
          :title="props.videoEnabled ? 'Отключить видео' : 'Включить видео'"
        >
          <FontAwesomeIcon
            :icon="props.videoEnabled ? faVideo : faVideoSlash"
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
                class="px-4 py-2 rounded-xl hover:bg-slate-700 cursor-pointer transition-colors"
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
            'p-4 rounded-l-full transition-colors flex items-center justify-center',
            props.audioEnabled ? 'bg-slate-700 hover:bg-slate-600' : 'bg-red-600 hover:bg-red-700',
          ]"
          @click="toggleAudio"
          :title="props.audioEnabled ? 'Отключить микрофон' : 'Включить микрофон'"
        >
          <FontAwesomeIcon
            :icon="props.audioEnabled ? faMicrophone : faMicrophoneSlash"
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
              :class="{ 'bg-slate-600': currentMicrophoneDeviceId === device.deviceId }"
              @click="selectMicrophone(device.deviceId)"
              class="px-4 py-2 rounded-xl hover:bg-slate-700 cursor-pointer transition-colors"
            >
              {{ device.label || 'Камера ' + deviceAudioIndex(device) }}
            </li>
          </ul>
        </transition>
      </div>

      <button
        type="button"
        class="p-4 flex items-center justify-center rounded-full bg-slate-700 hover:bg-slate-600 transition-color"
        @click="isScreenSharing ? stopScreenShare() : startScreenShare()"
      >
        <FontAwesomeIcon
          :icon="isScreenSharing ? faStop : faDisplay"
          class="text-xl"
        ></FontAwesomeIcon>
      </button>

      <button
        type="button"
        class="p-4 flex items-center justify-center rounded-full bg-red-600 hover:bg-red-700 transition-colors"
        @click="emits('endCall')"
        title="Завершить звонок"
      >
        <FontAwesomeIcon :icon="faPhoneSlash" class="text-xl" />
      </button>
    </div>

    <div class="mt-4 text-center text-sm text-slate-400">
      <p>Подключенных участников: {{ remotePeers.length + 1 }}</p>
    </div>
  </div>
</template>
