<script setup lang="ts">
import { AuthService, type LoginRequest } from '@/api/index'
import { useApiErrors } from '@/shared/lib/useApiErrors'
import { useAuthStore } from '@/shared/stores/authStore'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

const emit = defineEmits<{ (e: 'switch'): void }>()

const { t } = useI18n()
const { clearErrors, errorMessages, hasErrors, parseApiError } = useApiErrors()
const authStore = useAuthStore()

const isLoading = ref(false)
const password = ref('')
const username = ref('')
const showPassword = ref(false)

const handleLogin = async () => {
  isLoading.value = true
  try {
    clearErrors()
    const loginBody: LoginRequest = { username: username.value, password: password.value }
    const response = await AuthService.loginUser(loginBody)
    if ('access_token' in response && 'refresh_token' in response) {
      const tokens = response
      if (tokens.access_token && tokens.refresh_token) {
        await authStore.setTokens(tokens.access_token, tokens.refresh_token)
        setTimeout(() => window.location.reload(), 500)
      }
    } else {
      throw response
    }
  } catch (e) {
    parseApiError(e)
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <form @submit.prevent="handleLogin" class="space-y-5 sm:space-y-5">
    <div class="text-center mb-2">
      <h2 class="text-[1.75rem] sm:text-2xl font-bold text-dc-text-heading">
        {{ t('auth.welcomeBack') }}
      </h2>
      <p class="text-dc-text-secondary text-base sm:text-sm mt-1">{{ t('auth.welcomeBackSub') }}</p>
    </div>

    <div
      v-if="hasErrors"
      class="p-3 rounded bg-dc-red/10 border border-dc-red/30 text-dc-red text-sm"
    >
      <p v-for="(error, index) in errorMessages" :key="index">{{ error }}</p>
    </div>

    <div class="space-y-1">
      <label
        class="block text-sm sm:text-xs font-bold uppercase tracking-wide text-dc-text-secondary"
      >
        {{ t('auth.username') }} <span class="text-dc-red">*</span>
      </label>
      <input
        v-model="username"
        type="text"
        required
        autocomplete="username"
        class="w-full px-4 sm:px-3 py-3.5 sm:py-2.5 rounded bg-dc-input border-none text-dc-text text-lg sm:text-base outline-none focus:ring-2 focus:ring-dc-blurple transition-all"
      />
    </div>

    <div class="space-y-1">
      <label
        class="block text-sm sm:text-xs font-bold uppercase tracking-wide text-dc-text-secondary"
      >
        {{ t('auth.password') }} <span class="text-dc-red">*</span>
      </label>
      <div class="relative">
        <input
          v-model="password"
          :type="showPassword ? 'text' : 'password'"
          required
          autocomplete="current-password"
          class="w-full px-4 sm:px-3 py-3.5 sm:py-2.5 rounded bg-dc-input border-none text-dc-text text-lg sm:text-base outline-none focus:ring-2 focus:ring-dc-blurple transition-all pr-14 sm:pr-12"
        />
        <span
          type="button"
          @click="showPassword = !showPassword"
          class="absolute right-3 sm:right-2 top-1/2 -translate-y-1/2 text-dc-text-muted hover:text-dc-text transition-colors bg-transparent border-none p-2 sm:p-1.5"
          :title="showPassword ? t('common.hide') : t('common.show')"
        >
          <font-awesome-icon
            :icon="showPassword ? 'eye-slash' : 'eye'"
            class="text-lg sm:text-base"
          />
        </span>
      </div>
    </div>

    <button
      type="submit"
      :disabled="isLoading"
      class="w-full py-3.5 sm:py-2.5 rounded bg-dc-blurple hover:bg-dc-blurple-hover active:bg-dc-blurple-active disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-lg sm:text-base transition-colors"
    >
      <svg
        v-if="isLoading"
        class="inline w-5 h-5 mr-2 animate-spin"
        viewBox="0 0 24 24"
        fill="none"
      >
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
        <path
          class="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
      {{ t('auth.login') }}
    </button>

    <p class="text-base sm:text-sm text-dc-text-muted">
      {{ t('auth.needAccount') }}
      <button
        type="button"
        @click="emit('switch')"
        class="text-dc-text-link hover:underline bg-transparent border-none text-base sm:text-sm"
      >
        {{ t('auth.register') }}
      </button>
    </p>
  </form>
</template>
