<!-- eslint-disable @typescript-eslint/no-explicit-any -->
<script setup lang="ts">
import { faUserAlt } from '@fortawesome/free-regular-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'

defineProps<{
  condition: boolean | undefined
  stream: any
  keyId: string
}>()
</script>

<template>
  <video
    v-if="condition"
    :key="keyId"
    :srcObject="stream"
    autoplay
    muted
    playsinline
    class="z-10 w-full h-full object-contain rounded-lg shadow-lg border-2 border-slate-700"
  ></video>
  <div v-else class="absolute inset-0 flex items-center justify-center border-2 border-slate-700">
    <FontAwesomeIcon :icon="faUserAlt" class="z-0 text-9xl text-white/50" />
  </div>
</template>
