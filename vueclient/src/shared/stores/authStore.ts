import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useAuthStore = defineStore('authStore', () => {
  const token = ref<string | null>(localStorage.getItem('token'))
  const refreshToken = ref<string | null>(localStorage.getItem('refreshToken'))
  const userRole = ref<string>(localStorage.getItem('userRole') ?? 'user')

  function setTokens(newToken: string, newRefreshToken: string) {
    token.value = newToken
    localStorage.setItem('token', newToken)
    refreshToken.value = newRefreshToken
    localStorage.setItem('refreshToken', newRefreshToken)
  }

  function setUserRole(role: string) {
    userRole.value = role
    localStorage.setItem('userRole', role)
  }

  function clearTokens() {
    token.value = null
    refreshToken.value = null
    userRole.value = 'user'
    localStorage.removeItem('token')
    localStorage.removeItem('refreshToken')
    localStorage.removeItem('userRole')
  }

  return { token, refreshToken, userRole, setTokens, setUserRole, clearTokens }
})
