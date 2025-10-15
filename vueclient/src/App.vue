<script setup lang="ts">
import { useSignalingStore } from '@/stores/signalingStore'
import { onMounted, onUnmounted } from 'vue'

const signalingStore = useSignalingStore()

onMounted(() => {
  // Connect to signaling server on app mount
  signalingStore.connect()
})

onUnmounted(() => {
  // Disconnect on app unmount
  signalingStore.disconnect()
})
</script>

<template>
  <router-view v-slot="{ Component }">
    <Transition name="fade" mode="in-out">
      <component :is="Component"></component>
    </Transition>
  </router-view>
</template>
