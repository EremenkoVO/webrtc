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
    class="absolute flex flex-row items-center bottom-2 left-2 bg-slate-900/80 px-2 py-1 rounded text-sm"
  >
    <FontAwesomeIcon v-show="conditionShow" :icon="faMicrophoneSlash" class="mr-1 text-red-500" />
    {{ name }}
    <FontAwesomeIcon
      v-show="speaking"
      :icon="faMicrophone"
      class="ml-2 text-green-500"
    ></FontAwesomeIcon>
  </div>
</template>
