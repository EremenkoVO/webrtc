<!-- eslint-disable @typescript-eslint/no-explicit-any -->
<script setup lang="ts">
import { faUserAlt } from '@fortawesome/free-regular-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'

defineProps<{
  conditionVideo: any
  conditionAudio: any
  stream: any
  keyId: string
  muted: boolean | undefined
}>()

function setupVideoElement(el: any, stream: MediaStream | null) {
  if (el && stream && el instanceof HTMLVideoElement) {
    el.srcObject = stream
  }
}
</script>

<template>
  <div
    class="flex items-center justify-center w-full h-full bg-slate-800 rounded-lg shadow-lg border-2 border-slate-700"
  >
    <video
      v-if="conditionVideo"
      :ref="(el: any) => setupVideoElement(el, stream)"
      :muted="muted"
      :keyId="stream.id"
      autoplay
      playsinline
      class="w-full h-full object-contain rounded-lg shadow-lg"
    ></video>
    <div v-else>
      <FontAwesomeIcon :icon="faUserAlt" class="text-slate-400 text-9xl" />
      <audio :srcObject="stream" :muted="muted" autoplay></audio>
    </div>
  </div>
</template>
