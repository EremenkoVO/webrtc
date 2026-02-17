import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useSidebarStore = defineStore('sidebar', () => {
  const isOpen = ref(false)
  const isMobile = ref(false)
  const chatOpen = ref(true)

  function checkMobile() {
    isMobile.value = window.innerWidth < 1024
    if (!isMobile.value) {
      isOpen.value = true
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
