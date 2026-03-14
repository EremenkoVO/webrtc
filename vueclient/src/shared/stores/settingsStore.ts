import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

const STORAGE_KEY = 'app-settings'

export type Theme = 'dark' | 'light' | 'midnight' | 'nord' | 'dracula' | 'tokyo-night'

export const THEMES: Array<{ id: Theme; label: string; colors: [string, string, string] }> = [
  { id: 'dark', label: 'Dark', colors: ['#313338', '#2b2d31', '#5865f2'] },
  { id: 'light', label: 'Light', colors: ['#ffffff', '#f2f3f5', '#5865f2'] },
  { id: 'midnight', label: 'Midnight', colors: ['#1e1e2e', '#181825', '#cba6f7'] },
  { id: 'nord', label: 'Nord', colors: ['#3b4252', '#2e3440', '#81a1c1'] },
  { id: 'dracula', label: 'Dracula', colors: ['#282a36', '#44475a', '#bd93f9'] },
  { id: 'tokyo-night', label: 'Tokyo Night', colors: ['#1a1b26', '#16161e', '#7aa2f7'] },
]

export interface AppSettings {
  defaultMicrophoneId: string | null
  defaultCameraId: string | null
  notificationsEnabled: boolean
  soundOnConnect: boolean
  theme: Theme
}

function loadSettings(): AppSettings {
  const fallbackNotifications = localStorage.getItem('chatNotificationsEnabled') !== 'false'
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AppSettings>
      return {
        defaultMicrophoneId: parsed.defaultMicrophoneId ?? null,
        defaultCameraId: parsed.defaultCameraId ?? null,
        notificationsEnabled: parsed.notificationsEnabled ?? fallbackNotifications,
        soundOnConnect: parsed.soundOnConnect ?? true,
        theme: (parsed.theme as Theme) ?? 'dark',
      }
    }
  } catch {
    // ignore
  }
  return {
    defaultMicrophoneId: null,
    defaultCameraId: null,
    notificationsEnabled: fallbackNotifications,
    soundOnConnect: true,
    theme: 'dark',
  }
}

function saveSettings(settings: AppSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    localStorage.setItem('chatNotificationsEnabled', settings.notificationsEnabled ? 'true' : 'false')
  } catch {
    // ignore
  }
}

export const useSettingsStore = defineStore('settings', () => {
  const saved = loadSettings()
  const defaultMicrophoneId = ref<string | null>(saved.defaultMicrophoneId)
  const defaultCameraId = ref<string | null>(saved.defaultCameraId)
  const notificationsEnabled = ref<boolean>(saved.notificationsEnabled)
  const soundOnConnect = ref<boolean>(saved.soundOnConnect)
  const theme = ref<Theme>(saved.theme)

  function setDefaultMicrophone(deviceId: string | null) {
    defaultMicrophoneId.value = deviceId
  }

  function setDefaultCamera(deviceId: string | null) {
    defaultCameraId.value = deviceId
  }

  function setNotificationsEnabled(value: boolean) {
    notificationsEnabled.value = value
  }

  function setSoundOnConnect(value: boolean) {
    soundOnConnect.value = value
  }

  function setTheme(t: Theme) {
    theme.value = t
  }

  watch(
    theme,
    (t) => document.documentElement.setAttribute('data-theme', t),
    { immediate: true },
  )

  watch(
    () => ({
      defaultMicrophoneId: defaultMicrophoneId.value,
      defaultCameraId: defaultCameraId.value,
      notificationsEnabled: notificationsEnabled.value,
      soundOnConnect: soundOnConnect.value,
      theme: theme.value,
    }),
    (s) => saveSettings(s),
    { deep: true },
  )

  return {
    defaultMicrophoneId,
    defaultCameraId,
    notificationsEnabled,
    soundOnConnect,
    theme,
    setDefaultMicrophone,
    setDefaultCamera,
    setNotificationsEnabled,
    setSoundOnConnect,
    setTheme,
  }
})
