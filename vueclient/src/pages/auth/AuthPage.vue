<script setup lang="ts">
import LoginForm from '@/features/auth/ui/LoginForm.vue'
import RegisterForm from '@/features/auth/ui/RegisterForm.vue'
import LocaleSwitcher from '@/widgets/locale-switcher/LocaleSwitcher.vue'
import ServerPickerModal from '@/widgets/server-picker/ServerPickerModal.vue'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'

const route = useRoute()
const isLogin = ref(true)
const { t } = useI18n()
const showServerPicker = ref(false)
const isElectron = typeof window !== 'undefined' && !!window.electronAPI

const currentServerDomain = computed(() => {
  const url = localStorage.getItem('serverUrl') ?? ''
  if (!url) return ''
  try {
    return new URL(url).host
  } catch {
    return url
  }
})

onMounted(() => {
  if (route.name === 'Register') isLogin.value = false
  document.title = isLogin.value ? t('auth.login') : t('auth.register')
})

function switchMode() {
  isLogin.value = !isLogin.value
  document.title = isLogin.value ? t('auth.login') : t('auth.register')
}
</script>

<template>
  <div class="min-h-screen min-h-dvh bg-dc-bg-tertiary flex items-center justify-center p-4">
    <!-- Server picker (Electron desktop app only) -->
    <div v-if="isElectron" class="fixed top-4 left-4 z-10">
      <button
        type="button"
        class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-dc-bg-secondary/80 hover:bg-dc-bg-secondary border border-dc-separator/30 text-dc-text-muted hover:text-dc-text transition-colors text-xs backdrop-blur-sm"
        :title="t('serverPicker.title')"
        @click="showServerPicker = true"
      >
        <font-awesome-icon icon="server" class="text-xs" />
        <span class="max-w-[140px] truncate">
          {{ currentServerDomain || t('serverPicker.defaultServer') }}
        </span>
        <font-awesome-icon icon="pen-to-square" class="text-[10px] opacity-60" />
      </button>
    </div>

    <!-- Language switcher (top-right) -->
    <div class="fixed top-4 right-4 z-10">
      <LocaleSwitcher />
    </div>

    <!-- Server picker modal -->
    <ServerPickerModal v-if="isElectron && showServerPicker" @close="showServerPicker = false" />

    <!-- Background decoration -->
    <div class="fixed inset-0 overflow-hidden pointer-events-none">
      <div class="absolute -top-40 -left-40 w-96 h-96 bg-dc-blurple/5 rounded-full blur-3xl" />
      <div class="absolute -bottom-40 -right-40 w-96 h-96 bg-dc-blurple/5 rounded-full blur-3xl" />
    </div>

    <div class="relative w-full max-w-md bg-dc-bg-secondary rounded-md shadow-xl p-8">
      <Transition name="fade" mode="out-in">
        <LoginForm v-if="isLogin" @switch="switchMode" :key="'login'" />
        <RegisterForm v-else @switch="switchMode" :key="'register'" />
      </Transition>
    </div>
  </div>
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
