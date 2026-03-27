<!-- eslint-disable @typescript-eslint/no-explicit-any -->
<script setup lang="ts">
import { useWebRTC, type PeerConnection } from '@/shared/lib/useWebRTC'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps<{
  videoEnabled: boolean
  audioEnabled: boolean
  isDeafened: boolean
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
  (e: 'toggleDeafen'): void
  (e: 'requestScreenShare'): void
}>()

const { videoDevices, audioDevices, fetchVideoDevices, fetchAudioDevices } = useWebRTC()
const cameraMenuOpen = ref(false)
const microphoneMenuOpen = ref(false)

function toggleVideo() {
  emits('update:toggleVideo')
}
function selectCamera(deviceId: string) {
  emits('update:selectCamera', deviceId)
  emits('update:currentCameraDeviceId', deviceId)
  cameraMenuOpen.value = false
}
async function toggleCameraMenu() {
  cameraMenuOpen.value = !cameraMenuOpen.value
  if (cameraMenuOpen.value) fetchVideoDevices()
}
function toggleAudio() {
  emits('update:toggleMicrophone')
  emits('update:audioEnabled', !props.audioEnabled)
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
    <div class="flex items-center justify-center gap-2 2xl:gap-3 flex-wrap">
      <!-- Video toggle + camera select -->
      <div class="relative flex items-center">
        <button
          :class="[
            'w-10 h-10 2xl:w-12 2xl:h-12 rounded-l-full flex items-center justify-center transition-colors',
            props.videoEnabled
              ? 'bg-dc-bg-active hover:bg-dc-control-hover text-dc-text'
              : 'bg-dc-red hover:bg-dc-danger-hover text-white',
          ]"
          @click="toggleVideo"
          :title="props.videoEnabled ? t('call.turnOffCamera') : t('call.turnOnCamera')"
        >
          <font-awesome-icon
            :icon="props.videoEnabled ? 'video' : 'video-slash'"
            class="text-lg 2xl:text-xl"
          />
        </button>
        <div class="relative">
          <button
            class="w-7 h-10 2xl:w-8 2xl:h-12 rounded-r-full bg-dc-bg-active hover:bg-dc-control-hover flex items-center justify-center transition-colors text-dc-text-muted"
            @click="toggleCameraMenu"
          >
            <font-awesome-icon
              icon="chevron-up"
              :class="['text-[10px] transition-transform', { 'rotate-180': cameraMenuOpen }]"
            />
          </button>
          <Transition name="dropdown">
            <ul
              v-if="cameraMenuOpen"
              class="absolute right-0 bottom-12 w-52 bg-dc-bg-floating rounded-lg shadow-xl z-50 py-1.5 max-h-48 overflow-y-auto border border-dc-separator/40"
              v-click-outside="() => (cameraMenuOpen = false)"
            >
              <li
                v-for="device in videoDevices"
                :key="device.deviceId"
                class="px-4 sm:px-3 py-2 sm:py-1.5 text-base sm:text-sm text-dc-text hover:bg-dc-blurple hover:text-white cursor-pointer transition-colors truncate"
                :class="{ 'bg-dc-bg-active': currentCameraDeviceId === device.deviceId }"
                @click="selectCamera(device.deviceId)"
              >
                {{ device.label || `${t('call.camera')} ${videoDevices.indexOf(device) + 1}` }}
              </li>
            </ul>
          </Transition>
        </div>
      </div>

      <!-- Mic toggle + mic select -->
      <div class="relative flex items-center">
        <button
          :class="[
            'w-12 h-12 sm:w-10 sm:h-10 2xl:w-12 2xl:h-12 rounded-l-full flex items-center justify-center transition-colors',
            props.audioEnabled
              ? 'bg-dc-bg-active hover:bg-dc-control-hover text-dc-text'
              : 'bg-dc-red hover:bg-dc-danger-hover text-white',
          ]"
          @click="toggleAudio"
          :title="props.audioEnabled ? t('common.mute') : t('common.unmute')"
        >
          <font-awesome-icon
            :icon="props.audioEnabled ? 'microphone' : 'microphone-slash'"
            class="text-xl sm:text-lg 2xl:text-xl"
          />
        </button>
        <div class="relative">
          <button
            class="w-8 h-12 sm:w-7 sm:h-10 2xl:w-8 2xl:h-12 rounded-r-full bg-dc-bg-active hover:bg-dc-control-hover flex items-center justify-center transition-colors text-dc-text-muted"
            @click="toggleMicrophoneMenu"
          >
            <font-awesome-icon
              icon="chevron-up"
              :class="[
                'text-xs sm:text-[10px] transition-transform',
                { 'rotate-180': microphoneMenuOpen },
              ]"
            />
          </button>
          <Transition name="dropdown">
            <ul
              v-if="microphoneMenuOpen"
              class="absolute right-0 bottom-12 w-52 bg-dc-bg-floating rounded-lg shadow-xl z-50 py-1.5 max-h-48 overflow-y-auto border border-dc-separator/40"
              v-click-outside="() => (microphoneMenuOpen = false)"
            >
              <li
                v-for="device in audioDevices"
                :key="device.deviceId"
                class="px-4 sm:px-3 py-2 sm:py-1.5 text-base sm:text-sm text-dc-text hover:bg-dc-blurple hover:text-white cursor-pointer transition-colors truncate"
                :class="{ 'bg-dc-bg-active': currentMicrophoneDeviceId === device.deviceId }"
                @click="selectMicrophone(device.deviceId)"
              >
                {{ device.label || `${t('call.microphone')} ${audioDevices.indexOf(device) + 1}` }}
              </li>
            </ul>
          </Transition>
        </div>
      </div>

      <!-- Deafen -->
      <button
        :class="[
          'w-12 h-12 sm:w-10 sm:h-10 2xl:w-12 2xl:h-12 rounded-full flex items-center justify-center transition-colors',
          props.isDeafened
            ? 'bg-dc-red hover:bg-dc-danger-hover text-white'
            : 'bg-dc-bg-active hover:bg-dc-control-hover text-dc-text',
        ]"
        @click="emits('toggleDeafen')"
        :title="props.isDeafened ? t('common.undeafen') : t('common.deafen')"
      >
        <font-awesome-icon icon="headset" class="text-xl sm:text-lg 2xl:text-xl" />
      </button>

      <!-- Screen share -->
      <button
        :class="[
          'w-12 h-12 sm:w-10 sm:h-10 2xl:w-12 2xl:h-12 rounded-full flex items-center justify-center transition-colors',
          props.isScreenSharing
            ? 'bg-dc-red hover:bg-dc-danger-hover text-white'
            : 'bg-dc-bg-active hover:bg-dc-control-hover text-dc-text',
        ]"
        @click="props.isScreenSharing ? stopScreenShare() : emits('requestScreenShare')"
        :title="props.isScreenSharing ? t('call.stopSharing') : t('call.shareScreen')"
      >
        <font-awesome-icon
          :icon="props.isScreenSharing ? 'circle-stop' : 'desktop'"
          class="text-xl sm:text-lg 2xl:text-xl"
        />
      </button>

      <!-- Disconnect -->
      <button
        class="w-16 h-12 sm:w-14 sm:h-10 2xl:w-16 2xl:h-12 rounded-full bg-dc-red hover:bg-dc-danger-hover flex items-center justify-center transition-colors text-white"
        @click="emits('endCall')"
        :title="t('common.disconnect')"
      >
        <font-awesome-icon icon="phone-slash" class="text-xl sm:text-lg" />
      </button>
    </div>

    <div class="mt-2 text-center text-sm sm:text-[11px] text-dc-text-muted">
      {{ remotePeers.length + 1 }}
      {{ remotePeers.length > 0 ? t('common.participantsCount') : t('common.participant') }}
    </div>
  </div>
</template>
