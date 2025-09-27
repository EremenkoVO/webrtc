<script setup lang="ts">
import { AuthService, type AuthTokens, type RegisterRequest } from '@/api/index'
import { useApiErrors } from '@/composible/useApiErrors'
import { useAuthStore } from '@/stores/authStore'
import { faEye, faEyeSlash, faUser } from '@fortawesome/free-regular-svg-icons'
import { faCheck, faLock, faSpinner } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import { onMounted, ref } from 'vue'

const { clearErrors, errorMessages, hasErrors, parseApiError } = useApiErrors()
const authStore = useAuthStore()

const isLoading = ref<boolean>(false)
const password = ref<string>('')
const username = ref<string>('')
const showPassword = ref<boolean>(false)

const handleLogin = async () => {
  isLoading.value = true

  try {
    clearErrors()
    const registerBody: RegisterRequest = {
      username: username.value,
      password: password.value,
    }

    const response = await AuthService.registerUser(registerBody)

    if ('access_token' in response && 'refresh_token' in response) {
      const tokens: AuthTokens = response
      if (tokens.access_token && tokens.refresh_token) {
        await authStore.setTokens(tokens.access_token, tokens.refresh_token)
        setTimeout(() => {
          window.location.reload()
        }, 500)
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

onMounted(() => {
  document.title = 'Авторизация'
})
</script>

<template>
  <div class="min-h-screen flex items-center justify-center p-4">
    <div class="h-full max-w-d bg-white rounded-xl shadow-2xl overflow-hidden">
      <div class="p-8">
        <div class="mb-8 flex items-center justify-center w-full">
          <h1 class="text-5xl items-center font-bold">WebRTC Client</h1>
        </div>

        <div
          v-if="hasErrors"
          class="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded"
        >
          <ul>
            <li v-for="(error, index) in errorMessages" :key="index">{{ error }}</li>
          </ul>
        </div>

        <form @submit.prevent="handleLogin" class="space-y-6">
          <div class="relative">
            <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <FontAwesomeIcon :icon="faUser"></FontAwesomeIcon>
            </div>
            <input
              v-model="username"
              class="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-4 focus:ring-blue-500 focus:border-transparent outline-none transition"
              placeholder="Логин"
              autocomplete="on"
              required
              type="text"
            />
          </div>

          <div class="relative">
            <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <FontAwesomeIcon :icon="faLock"></FontAwesomeIcon>
            </div>

            <input
              v-model="password"
              class="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-4 focus:ring-blue-500 focus:border-transparent outline-none transition"
              :type="showPassword ? 'text' : 'password'"
              autocomplete="current-password"
              placeholder="Пароль"
              required
            />

            <button
              type="button"
              @click="showPassword = !showPassword"
              class="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500 hover:text-gray-700"
              title="Показать/Скрыть пароль"
            >
              <FontAwesomeIcon :icon="showPassword ? faEyeSlash : faEye"></FontAwesomeIcon>
            </button>
          </div>

          <div class="relative">
            <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <FontAwesomeIcon :icon="faLock"></FontAwesomeIcon>
            </div>

            <input
              v-model="password"
              class="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-4 focus:ring-blue-500 focus:border-transparent outline-none transition"
              :type="showPassword ? 'text' : 'password'"
              autocomplete="current-password"
              placeholder="Повторите пароль"
              required
            />

            <button
              type="button"
              @click="showPassword = !showPassword"
              class="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500 hover:text-gray-700"
              title="Показать/Скрыть пароль"
            >
              <FontAwesomeIcon :icon="showPassword ? faEyeSlash : faEye"></FontAwesomeIcon>
            </button>
          </div>

          <button
            type="submit"
            class="w-full bg-blue-500 text-white py-3 rounded-lg font-semibold hover:bg-blue-600 active:bg-blue-400 transition-all duration-300 shadow-md hover:shadow-lg cursor-pointer disabled:cursor-not-allowed disabled:bg-blue-300"
            title="Авторизоваться"
            :disabled="isLoading"
          >
            <FontAwesomeIcon
              :icon="isLoading ? faSpinner : faCheck"
              :spin="isLoading"
            ></FontAwesomeIcon>
            Зарегистрироваться
          </button>

          <div class="text-center">
            <RouterLink
              to="/auth/login"
              title="Авторизоваться"
              class="text-blue-500 transition-all duration-300 hover:text-blue-800"
              >Авторизоваться
            </RouterLink>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
