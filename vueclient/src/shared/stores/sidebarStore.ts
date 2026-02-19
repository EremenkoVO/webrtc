import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useSidebarStore = defineStore('sidebar', () => {
  const isOpen = ref(false)
  const isMobile = ref(typeof window !== 'undefined' && window.innerWidth < 1024)
  // Chat is closed by default on mobile, open on desktop
  const chatOpen = ref(typeof window !== 'undefined' && window.innerWidth >= 1024)

  function checkMobile() {
    const wasMobile = isMobile.value
    isMobile.value = window.innerWidth < 1024
    if (!isMobile.value) {
      isOpen.value = true
      // Open chat on desktop if it was closed
      if (!chatOpen.value) {
        chatOpen.value = true
      }
    } else {
      // Close chat when switching to mobile
      if (!wasMobile) {
        chatOpen.value = false
      }
    }
  }

  function toggle() {
    isOpen.value = !isOpen.value
  }

  function open() {
    isOpen.value = true
  }

  function close() {
    if (isMobile.value) {
      isOpen.value = false
    }
  }

  function toggleChat() {
    chatOpen.value = !chatOpen.value
  }

  const shouldShow = computed(() => isOpen.value)

  return {
    isOpen,
    isMobile,
    chatOpen,
    shouldShow,
    checkMobile,
    toggle,
    open,
    close,
    toggleChat,
  }
})
