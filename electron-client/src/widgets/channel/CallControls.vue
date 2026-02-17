<!-- eslint-disable @typescript-eslint/no-explicit-any -->
<script setup lang="ts">
import { useWebRTC, type PeerConnection } from '@/shared/lib/useWebRTC'
import { ref } from 'vue'

const props = defineProps<{
  videoEnabled: boolean
  audioEnabled: boolean
  isScreenSharing: boolean
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
  (e: 'requestScreenShare'): void
}>()

const { videoDevices, audioDevices, fetchVideoDevices, fetchAudioDevices } = useWebRTC()
const cameraMenuOpen = ref(false)
const microphoneMenuOpen = ref(false)

function toggleVideo() { emits('update:toggleVideo') }
function selectCamera(deviceId: string) {
  emits('update:selectCamera', deviceId)
  emits('update:currentCameraDeviceId', deviceId)
  cameraMenuOpen.value = false
}
function toggleAudio() {
  emits('update:toggleMicrophone')
  emits('update:audioEnabled', !props.audioEnabled)
}
async function toggleCameraMenu() {
  cameraMenuOpen.value = !cameraMenuOpen.value
  if (cameraMenuOpen.value) fetchVideoDevices()
}
function toggleMicrophoneMenu() {
  microphoneMenuOpen.value = !microphoneMenuOpen.value
  if (microphoneMenuOpen.value) fetchAudioDevices()
}
function selectMicrophone(deviceId: string) {
  emits('update:selectMicrophone', deviceId)
  microphoneMenuOpen.value = false
}
</script>

<template>
  <div class="px-4 py-3 2xl:py-4 bg-dc-bg-secondary border-t border-dc-separator/40">
    <div class="flex items-center justify-center gap-2 2xl:gap-3">
      <!-- Video toggle + camera select -->
      <div class="relative flex items-center">
        <button
          :class="[
            'w-10 h-10 2xl:w-12 2xl:h-12 rounded-l-full flex items-center justify-center transition-colors',
            props.videoEnabled
              ? 'bg-dc-bg-active hover:bg-[#4e5058] text-dc-text'
              : 'bg-dc-red hover:bg-dc-red/80 text-white',
          ]"
          @click="toggleVideo"
          :title="props.videoEnabled ? 'Turn Off Camera' : 'Turn On Camera'"
        >
          <font-awesome-icon :icon="props.videoEnabled ? 'video' : 'video-slash'" class="text-lg 2xl:text-xl" />
        </button>
        <div class="relative">
          <button
            class="w-7 h-10 2xl:w-8 2xl:h-12 rounded-r-full bg-dc-bg-active hover:bg-[#4e5058] flex items-center justify-center transition-colors text-dc-text-muted"
            @click="toggleCameraMenu"
          >
            <font-awesome-icon icon="chevron-up" :class="['text-[10px] transition-transform', { 'rotate-180': cameraMenuOpen }]" />
          </button>
          <Transition name="fade">
            <ul
              v-if="cameraMenuOpen"
              class="absolute right-0 bottom-12 w-52 bg-dc-bg-floating rounded-lg shadow-xl z-50 py-1.5 max-h-48 overflow-y-auto"
              v-click-outside="() => (cameraMenuOpen = false)"
            >
              <li
                v-for="device in videoDevices" :key="device.deviceId"
                class="px-3 py-1.5 text-sm text-dc-text hover:bg-dc-blurple hover:text-white cursor-pointer transition-colors truncate"
                :class="{ 'bg-dc-bg-active': currentCameraDeviceId === device.deviceId }"
                @click="selectCamera(device.deviceId)"
              >
                {{ device.label || `Camera ${videoDevices.indexOf(device) + 1}` }}
              </li>
            </ul>
          </Transition>
        </div>
      </div>

      <!-- Mic toggle + mic select -->
      <div class="relative flex items-center">
        <button
          :class="[
            'w-10 h-10 2xl:w-12 2xl:h-12 rounded-l-full flex items-center justify-center transition-colors',
            props.audioEnabled
              ? 'bg-dc-bg-active hover:bg-[#4e5058] text-dc-text'
              : 'bg-dc-red hover:bg-dc-red/80 text-white',
          ]"
          @click="toggleAudio"
          :title="props.audioEnabled ? 'Mute' : 'Unmute'"
        >
          <font-awesome-icon :icon="props.audioEnabled ? 'microphone' : 'microphone-slash'" class="text-lg 2xl:text-xl" />
        </button>
        <div class="relative">
          <button
            class="w-7 h-10 2xl:w-8 2xl:h-12 rounded-r-full bg-dc-bg-active hover:bg-[#4e5058] flex items-center justify-center transition-colors text-dc-text-muted"
            @click="toggleMicrophoneMenu"
          >
            <font-awesome-icon icon="chevron-up" :class="['text-[10px] transition-transform', { 'rotate-180': microphoneMenuOpen }]" />
          </button>
          <Transition name="fade">
            <ul
              v-if="microphoneMenuOpen"
              class="absolute right-0 bottom-12 w-52 bg-dc-bg-floating rounded-lg shadow-xl z-50 py-1.5 max-h-48 overflow-y-auto"
              v-click-outside="() => (microphoneMenuOpen = false)"
            >
              <li
                v-for="device in audioDevices" :key="device.deviceId"
                class="px-3 py-1.5 text-sm text-dc-text hover:bg-dc-blurple hover:text-white cursor-pointer transition-colors truncate"
                :class="{ 'bg-dc-bg-active': currentMicrophoneDeviceId === device.deviceId }"
                @click="selectMicrophone(device.deviceId)"
              >
                {{ device.label || `Microphone ${audioDevices.indexOf(device) + 1}` }}
              </li>
            </ul>
          </Transition>
        </div>
      </div>

      <!-- Screen share -->
      <button
        :class="[
          'w-10 h-10 2xl:w-12 2xl:h-12 rounded-full flex items-center justify-center transition-colors',
          props.isScreenSharing
            ? 'bg-dc-green text-white'
            : 'bg-dc-bg-active hover:bg-[#4e5058] text-dc-text',
        ]"
        @click="props.isScreenSharing ? stopScreenShare() : emits('requestScreenShare')"
        :title="props.isScreenSharing ? 'Stop Sharing' : 'Share Screen'"
      >
        <font-awesome-icon icon="desktop" class="text-lg 2xl:text-xl" />
      </button>

      <!-- Disconnect -->
      <button
        class="w-14 h-10 2xl:w-16 2xl:h-12 rounded-full bg-dc-red hover:bg-[#a12d2f] flex items-center justify-center transition-colors text-white"
        @click="emits('endCall')"
        title="Disconnect"
      >
        <font-awesome-icon icon="phone-slash" class="text-lg" />
      </button>
    </div>

    <div class="mt-2 text-center text-[11px] text-dc-text-muted">
      {{ remotePeers.length + 1 }} participant{{ remotePeers.length > 0 ? 's' : '' }}
    </div>
  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.15s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
