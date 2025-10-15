<script setup lang="ts">
import { useRoomStore } from '@/stores/roomStore'
import { computed } from 'vue'

defineProps<{
  selectedChannelId: string | undefined
}>()

const roomStore = useRoomStore()

const clientId = computed(() => roomStore.clientId)
</script>

<template>
  <div class="p-4 text-white">
    <h1>Channel: {{ selectedChannelId }}</h1>
    <h2 v-if="clientId">Вы присоединились к каналу</h2>
  </div>
</template>
