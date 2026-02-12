<script setup lang="ts">
import { UserService, type UserProfile } from '@/api/index'
import ChannelComponent from '@/components/ChannelComponent.vue'
import SidebarComponent from '@/components/SidebarComponent.vue'
import { useApiErrors } from '@/composible/useApiErrors'
import router from '@/router'
import { useAuthStore } from '@/stores/authStore'
import { useCallStore } from '@/stores/callStore'
import { useChatStore } from '@/stores/chatStore'
import { useRoomStore } from '@/stores/roomStore'
import { useSidebarStore } from '@/stores/sidebarStore'
import { useSignalingStore } from '@/stores/signalingStore'
import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

const { parseApiError } = useApiErrors()
const authStore = useAuthStore()
const sidebarStore = useSidebarStore()
const callStore = useCallStore()
const chatStore = useChatStore()
const roomStore = useRoomStore()
const signalingStore = useSignalingStore()
const user: Ref<UserProfile> = ref({ id: '', username: '' })

const getUser = async () => {
  try {
    const response = await UserService.getCurrentUser()

    if (
      typeof response === 'object' &&
      response !== null &&
      'id' in response &&
      'username' in response
    ) {
      user.value = response
    } else {
      throw { message: 'Invalid user data' }
    }
  } catch (e) {
    console.error('Ошибка получения пользователя:', e)
    parseApiError(e)
    // Очищаем все данные и редиректим на логин
    cleanup()
    authStore.clearTokens()
    router.push({ name: 'Login' })
  }
}

// Функция очистки всех данных при выходе
function cleanup() {
  try {
    // Завершаем звонок если он активен
    if (callStore.isInCall) {
      callStore.setStateCall(false)
    }
    
    // Отключаемся от сигнализации
    if (signalingStore.isConnected) {
      signalingStore.disconnect()
    }
    
    // Очищаем данные комнаты
    roomStore.setRoommates([])
    roomStore.setParticipants([])
    roomStore.selectedChannelId = ''
    roomStore.selectedChannelName = ''
    
    // Очищаем чат (отключаемся и очищаем сообщения)
    if (chatStore.isConnected) {
      chatStore.disconnect()
    }
    chatStore.clearMessages()
  } catch (error) {
    console.error('Ошибка при очистке данных:', error)
  }
}

onMounted(async () => {
  // Проверяем авторизацию перед загрузкой
  if (!authStore.token && !authStore.refreshToken) {
    router.push({ name: 'Login' })
    return
  }
  
  sidebarStore.checkMobile()
  await getUser()
})

onBeforeUnmount(() => {
  // Очищаем все данные при размонтировании компонента
  cleanup()
})
</script>

<template>
  <div class="flex h-screen w-screen overflow-hidden animated-gradient relative">
    <SidebarComponent :user="user" />
    <div class="flex-1 min-w-0 overflow-hidden lg:ml-0">
      <ChannelComponent :user-name="user.username" />
    </div>
  </div>
</template>
