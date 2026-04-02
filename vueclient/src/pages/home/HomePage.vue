<script setup lang="ts">
import { UserService, type UserProfile } from '@/api/index'
import { useApiErrors } from '@/shared/lib/useApiErrors'
import { useAuthStore } from '@/shared/stores/authStore'
import { useCallStore } from '@/shared/stores/callStore'
import { useChatStore } from '@/shared/stores/chatStore'
import { useRoomStore } from '@/shared/stores/roomStore'
import { useSidebarStore } from '@/shared/stores/sidebarStore'
import { useSignalingStore } from '@/shared/stores/signalingStore'
import { usePresenceStore } from '@/shared/stores/presenceStore'
import Sidebar from '@/widgets/sidebar/Sidebar.vue'
import ChannelView from '@/widgets/channel/ChannelView.vue'
import router from '@/app/router'
import { onBeforeUnmount, onMounted, ref, type Ref, nextTick } from 'vue'
import Hammer from 'hammerjs'
import { useI18n } from 'vue-i18n'

const { parseApiError } = useApiErrors()
const authStore = useAuthStore()
const sidebarStore = useSidebarStore()
const callStore = useCallStore()
const chatStore = useChatStore()
const roomStore = useRoomStore()
const signalingStore = useSignalingStore()
const presenceStore = usePresenceStore()
const user: Ref<UserProfile> = ref({ id: '', username: '' })
const containerRef = ref<HTMLElement | null>(null)
const channelViewRef = ref<HTMLElement | null>(null)
let hammerInstance: HammerManager | null = null
const { t } = useI18n()

const getUser = async () => {
  try {
    const response = await UserService.getCurrentUser()
    if (typeof response === 'object' && response !== null && 'id' in response && 'username' in response) {
      user.value = response
      if ('role' in response && typeof (response as any).role === 'string') {
        authStore.setUserRole((response as any).role)
      }
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
    roomStore.selectedChatScopeId = ''
    roomStore.selectedChatScopeType = 'channel'
    if (chatStore.isConnected) chatStore.disconnect()
    chatStore.disconnectNotifications()
    if (presenceStore.isConnected) presenceStore.disconnect()
    chatStore.clearMessages()
  } catch (error) {
    console.error('Cleanup error:', error)
  }
}

onMounted(async () => {
  document.title = t('sidebar.appTitle')
  if (!authStore.token && !authStore.refreshToken) {
    router.push({ name: 'Login' })
    return
  }
  sidebarStore.checkMobile()
  await getUser()
  presenceStore.connect()
  chatStore.connectNotifications()

  // Initialize HammerJS for swipe gestures after DOM is ready
  await nextTick()
  
  // Use the channel view area for swipe detection (main content area)
  const targetElement = channelViewRef.value || containerRef.value
  if (targetElement) {
    hammerInstance = new Hammer(targetElement, {
      touchAction: 'pan-y', // Allow vertical scrolling
    })
    
    // Configure pan recognizer for horizontal swipes
    const pan = hammerInstance.get('pan')
    pan.set({ direction: Hammer.DIRECTION_HORIZONTAL, threshold: 10 })
    
    // Configure swipe recognizer as fallback
    const swipe = hammerInstance.get('swipe')
    swipe.set({ direction: Hammer.DIRECTION_HORIZONTAL, threshold: 50, velocity: 0.3 })
    
    // Use pan events for more reliable detection
    hammerInstance.on('panend', (e) => {
      if (!sidebarStore.isMobile) return
      
      const deltaX = e.deltaX
      const deltaY = Math.abs(e.deltaY)
      const absDeltaX = Math.abs(deltaX)
      
      // Only trigger if horizontal movement is significant (at least 50px) and more than vertical
      if (absDeltaX > 50 && absDeltaX > deltaY) {
        if (deltaX > 0) {
          // Swipe right (left to right) - open sidebar
          if (!sidebarStore.isOpen) {
            sidebarStore.open()
          }
        } else {
          // Swipe left (right to left) - open chat
          if (!sidebarStore.chatOpen) {
            sidebarStore.toggleChat()
          }
        }
      }
    })
    
    // Fallback to swipe events
    hammerInstance.on('swiperight', () => {
      if (sidebarStore.isMobile && !sidebarStore.isOpen) {
        sidebarStore.open()
      }
    })
    
    hammerInstance.on('swipeleft', () => {
      if (sidebarStore.isMobile && !sidebarStore.chatOpen) {
        sidebarStore.toggleChat()
      }
    })
  }
})

onBeforeUnmount(() => {
  cleanup()
  if (hammerInstance) {
    hammerInstance.destroy()
    hammerInstance = null
  }
})
</script>

<template>
  <div ref="containerRef" class="flex h-dvh w-screen overflow-hidden bg-dc-bg-primary" style="touch-action: pan-y;">
    <Sidebar :user="user" />
    <div ref="channelViewRef" class="flex-1 min-w-0 overflow-hidden lg:ml-0">
      <ChannelView :user-name="user.username" />
    </div>
  </div>
</template>
