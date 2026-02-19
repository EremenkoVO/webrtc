<script setup lang="ts">
import LoginForm from '@/features/auth/ui/LoginForm.vue'
import RegisterForm from '@/features/auth/ui/RegisterForm.vue'
import LocaleSwitcher from '@/widgets/locale-switcher/LocaleSwitcher.vue'
import { useI18n } from 'vue-i18n'
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const isLogin = ref(true)
const { t } = useI18n()

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
    <!-- Language switcher (top-right) -->
    <div class="fixed top-4 right-4 z-10">
      <LocaleSwitcher />
    </div>

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
