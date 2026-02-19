import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

const STORAGE_KEY = 'app-settings'

export interface AppSettings {
  defaultMicrophoneId: string | null
  defaultCameraId: string | null
  notificationsEnabled: boolean
  soundOnConnect: boolean
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
  const defaultMicrophoneId = ref<string | null>(loadSettings().defaultMicrophoneId)
  const defaultCameraId = ref<string | null>(loadSettings().defaultCameraId)
  const notificationsEnabled = ref<boolean>(loadSettings().notificationsEnabled)
  const soundOnConnect = ref<boolean>(loadSettings().soundOnConnect)

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

  watch(
    () => ({
      defaultMicrophoneId: defaultMicrophoneId.value,
      defaultCameraId: defaultCameraId.value,
      notificationsEnabled: notificationsEnabled.value,
      soundOnConnect: soundOnConnect.value,
    }),
    (s) => saveSettings(s),
    { deep: true },
  )

  return {
    defaultMicrophoneId,
    defaultCameraId,
    notificationsEnabled,
    soundOnConnect,
    setDefaultMicrophone,
    setDefaultCamera,
    setNotificationsEnabled,
    setSoundOnConnect,
  }
})
