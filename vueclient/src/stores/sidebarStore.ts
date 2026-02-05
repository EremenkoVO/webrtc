import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useSidebarStore = defineStore('sidebar', () => {
  const isOpen = ref(false)
  const isMobile = ref(false)

  // Проверка мобильного устройства
  function checkMobile() {
    isMobile.value = window.innerWidth < 1024
    if (!isMobile.value) {
      isOpen.value = true // На десктопе всегда открыт
    }
  }

  // Переключение сайдбара
  function toggle() {
    isOpen.value = !isOpen.value
  }

  // Открыть сайдбар
  function open() {
    isOpen.value = true
  }

  // Закрыть сайдбар
  function close() {
    if (isMobile.value) {
      isOpen.value = false
    }
  }

  // Вычисляемые значения
  const shouldShow = computed(() => isOpen.value)

  return {
    isOpen,
    isMobile,
    shouldShow,
    checkMobile,
    toggle,
    open,
    close,
  }
})
