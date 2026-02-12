<script setup lang="ts">
import { useAuthStore } from '@/stores/authStore'
import { useSignalingStore } from '@/stores/signalingStore'
import { onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const signalingStore = useSignalingStore()
const authStore = useAuthStore()
const route = useRoute()
const router = useRouter()

// Подключаемся к сигнализации только если пользователь авторизован и на главной странице
onMounted(() => {
  if (authStore.token && route.name === 'Home') {
    signalingStore.connect()
  }
})

// Отслеживаем изменения маршрута
watch(
  () => route.name,
  (newRouteName) => {
    if (newRouteName === 'Home' && authStore.token) {
      // Подключаемся при переходе на главную страницу
      if (!signalingStore.isConnected) {
        signalingStore.connect()
      }
    } else {
      // Отключаемся при уходе с главной страницы
      if (signalingStore.isConnected) {
        signalingStore.disconnect()
      }
    }
  }
)

// Отслеживаем изменения авторизации
watch(
  () => authStore.token,
  (hasToken) => {
    if (!hasToken && signalingStore.isConnected) {
      // Если токен удален, отключаемся
      signalingStore.disconnect()
    }
  }
)

onUnmounted(() => {
  // Отключаемся при размонтировании приложения
  if (signalingStore.isConnected) {
    signalingStore.disconnect()
  }
})
</script>

<template>
  <router-view v-slot="{ Component }">
    <Transition name="fade" mode="in-out">
      <component :is="Component"></component>
    </Transition>
  </router-view>
</template>
