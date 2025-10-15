<script setup lang="ts">
import { SignalingService } from '@/api/index'
import { onMounted } from 'vue'

async function getSignalingWebSocket() {
  try {
    const signalingWebSocket = SignalingService.signalingWebSocket()
    console.log('Connected to signaling WebSocket:', signalingWebSocket)
  } catch (e) {
    console.error('Failed to connect to signaling WebSocket:', e)
  }
}

onMounted(() => {
  getSignalingWebSocket()
})
</script>

<template>
  <router-view v-slot="{ Component }">
    <Transition name="fade" mode="in-out">
      <component :is="Component"></component>
    </Transition>
  </router-view>
</template>
