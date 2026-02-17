<script setup lang="ts">
import { useAuthStore } from '@/shared/stores/authStore'
import { useSignalingStore } from '@/shared/stores/signalingStore'
import { onMounted, onUnmounted, watch } from 'vue'
import { useRoute } from 'vue-router'

const signalingStore = useSignalingStore()
const authStore = useAuthStore()
const route = useRoute()

onMounted(() => {
  if (authStore.token && route.name === 'Home') {
    signalingStore.connect()
  }
})

watch(
  () => route.name,
  (newRouteName) => {
    if (newRouteName === 'Home' && authStore.token) {
      if (!signalingStore.isConnected) signalingStore.connect()
    } else {
      if (signalingStore.isConnected) signalingStore.disconnect()
    }
  },
)

watch(
  () => authStore.token,
  (hasToken) => {
    if (!hasToken && signalingStore.isConnected) signalingStore.disconnect()
  },
)

onUnmounted(() => {
  if (signalingStore.isConnected) signalingStore.disconnect()
})
</script>

<template>
  <router-view v-slot="{ Component }">
    <Transition name="fade" mode="out-in">
      <component :is="Component" />
    </Transition>
  </router-view>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
