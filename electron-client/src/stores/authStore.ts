import { create } from 'zustand'

const getToken = () => (typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null)
const getRefreshToken = () =>
  typeof localStorage !== 'undefined' ? localStorage.getItem('refreshToken') : null

type AuthState = {
  token: string | null
  refreshToken: string | null
  setTokens: (token: string, refreshToken: string) => void
  clearTokens: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  token: getToken(),
  refreshToken: getRefreshToken(),
  setTokens: (token, refreshToken) => {
    localStorage.setItem('token', token)
    localStorage.setItem('refreshToken', refreshToken)
    set({ token, refreshToken })
  },
  clearTokens: () => {
    localStorage.removeItem('token')
    localStorage.removeItem('refreshToken')
    set({ token: null, refreshToken: null })
  },
}))
