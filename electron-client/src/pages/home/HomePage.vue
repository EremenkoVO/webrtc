<script setup lang="ts">
import { UserService, type UserProfile } from '@/api/index'
import { useApiErrors } from '@/shared/lib/useApiErrors'
import { useAuthStore } from '@/shared/stores/authStore'
import { useCallStore } from '@/shared/stores/callStore'
import { useChatStore } from '@/shared/stores/chatStore'
import { useRoomStore } from '@/shared/stores/roomStore'
import { useSidebarStore } from '@/shared/stores/sidebarStore'
import { useSignalingStore } from '@/shared/stores/signalingStore'
import Sidebar from '@/widgets/sidebar/Sidebar.vue'
import ChannelView from '@/widgets/channel/ChannelView.vue'
import router from '@/app/router'
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
    if (typeof response === 'object' && response !== null && 'id' in response && 'username' in response) {
      user.value = response
    } else {
      throw { message: 'Invalid user data' }
    }
  } catch (e) {
    console.error('Error fetching user:', e)
    parseApiError(e)
    cleanup()
    authStore.clearTokens()
    router.push({ name: 'Login' })
  }
}

function cleanup() {
  try {
    if (callStore.isInCall) callStore.setStateCall(false)
    if (signalingStore.isConnected) signalingStore.disconnect()
    roomStore.setRoommates([])
    roomStore.setParticipants([])
    roomStore.selectedChannelId = ''
    roomStore.selectedChannelName = ''
    if (chatStore.isConnected) chatStore.disconnect()
    chatStore.clearMessages()
  } catch (error) {
    console.error('Cleanup error:', error)
  }
}

onMounted(async () => {
  if (!authStore.token && !authStore.refreshToken) {
    router.push({ name: 'Login' })
    return
  }
  sidebarStore.checkMobile()
  await getUser()
})

onBeforeUnmount(() => cleanup())
</script>

<template>
  <div class="flex h-screen h-dvh w-screen overflow-hidden bg-dc-bg-primary">
    <Sidebar :user="user" />
    <div class="flex-1 min-w-0 overflow-hidden lg:ml-0">
      <ChannelView :user-name="user.username" />
    </div>
  </div>
</template>
