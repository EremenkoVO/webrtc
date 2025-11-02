<script setup lang="ts">
import { useSignalingStore } from '@/stores/signalingStore'
import { onMounted, onUnmounted } from 'vue'

const signalingStore = useSignalingStore()

onMounted(() => {
  // Подключаемся к серверу сигнализации при монтировании приложения
  signalingStore.connect()
})

onUnmounted(() => {
  // Отключаемся при размонтировании приложения
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
