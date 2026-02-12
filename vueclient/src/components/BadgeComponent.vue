<script setup lang="ts">
import { faMicrophone, faMicrophoneSlash } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'

defineProps<{
  name: string
  conditionShow: boolean
  speaking: boolean
}>()
</script>

<template>
  <div
    :class="[
      'absolute flex flex-row items-center bottom-2 left-2 bg-slate-900/90 backdrop-blur-sm px-3 py-1.5 rounded-lg text-sm border transition-all duration-200',
      speaking ? 'border-green-500/50 shadow-lg shadow-green-500/20' : 'border-slate-700/50'
    ]"
  >
    <FontAwesomeIcon
      v-if="conditionShow"
      :icon="faMicrophoneSlash"
      class="mr-2 text-red-400 flex-shrink-0"
    />
    <span class="truncate max-w-[200px]">{{ name }}</span>
    <FontAwesomeIcon
      v-if="speaking"
      :icon="faMicrophone"
      class="ml-2 text-green-400 flex-shrink-0 animate-pulse"
    />
  </div>
</template>
