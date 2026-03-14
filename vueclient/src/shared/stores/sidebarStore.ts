import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

const MIN_WIDTH = 180
const MAX_WIDTH = 420

export const useSidebarStore = defineStore('sidebar', () => {
  const isOpen = ref(false)
  const isMobile = ref(typeof window !== 'undefined' && window.innerWidth < 1024)
  // Chat is closed by default on mobile, open on desktop
  const chatOpen = ref(typeof window !== 'undefined' && window.innerWidth >= 1024)
  const width = ref<number>(
    typeof window !== 'undefined'
      ? parseInt(localStorage.getItem('sidebarWidth') || '240', 10)
      : 240,
  )

  function setWidth(w: number) {
    const clamped = Math.min(Math.max(w, MIN_WIDTH), MAX_WIDTH)
    width.value = clamped
    localStorage.setItem('sidebarWidth', String(clamped))
  }

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
    width,
    MIN_WIDTH,
    MAX_WIDTH,
    shouldShow,
    checkMobile,
    toggle,
    open,
    close,
    toggleChat,
    setWidth,
  }
})
