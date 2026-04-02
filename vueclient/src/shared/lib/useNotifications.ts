export type NotificationPermission = 'default' | 'granted' | 'denied'
const SERVICE_NOTIFICATION_ICON = '/apple-touch-icon.png'
const isElectronRuntime = typeof window !== 'undefined' && !!window.electronAPI
const clickCallbacksByTag = new Map<string, () => void>()
let electronClickBridgeInitialized = false

function ensureElectronClickBridge() {
  if (!isElectronRuntime || electronClickBridgeInitialized) return
  const notifications = window.electronAPI?.notifications
  if (!notifications?.onClick) return
  notifications.onClick((tag) => {
    const cb = clickCallbacksByTag.get(tag)
    if (!cb) return
    cb()
    clickCallbacksByTag.delete(tag)
  })
  electronClickBridgeInitialized = true
}

export function isNotificationSupported(): boolean {
  return 'Notification' in window
}

export function getNotificationPermission(): NotificationPermission {
  if (isElectronRuntime) return 'granted'
  if (!isNotificationSupported()) return 'denied'
  return Notification.permission as NotificationPermission
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (isElectronRuntime) return true
  if (!isNotificationSupported()) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  try {
    const result = await Notification.requestPermission()
    return result === 'granted'
  } catch (error) {
    console.error('Error requesting notification permission:', error)
    return false
  }
}

export function showNotification(
  title: string,
  options?: NotificationOptions & { body?: string; icon?: string; badge?: string; tag?: string; onClick?: () => void },
): Notification | null {
  if (isElectronRuntime && window.electronAPI?.notifications?.show) {
    if (document.hasFocus()) return null
    const tag = options?.tag || `chat-message-${Date.now()}`
    if (options?.onClick) {
      ensureElectronClickBridge()
      clickCallbacksByTag.set(tag, options.onClick)
    }
    window.electronAPI.notifications
      .show({
        title,
        body: options?.body,
        icon: options?.icon || SERVICE_NOTIFICATION_ICON,
        tag,
        silent: options?.silent ?? false,
      })
      .catch((error) => {
        console.error('Error showing Electron notification:', error)
      })
    return null
  }

  if (!isNotificationSupported() || getNotificationPermission() !== 'granted') return null
  if (document.hasFocus()) return null
  try {
    const notification = new Notification(title, {
      icon: SERVICE_NOTIFICATION_ICON,
      badge: SERVICE_NOTIFICATION_ICON,
      tag: options?.tag || 'chat-message',
      requireInteraction: false,
      silent: false,
      ...options,
    })
    setTimeout(() => notification.close(), 5000)
    notification.onclick = () => {
      window.focus()
      options?.onClick?.()
      notification.close()
    }
    return notification
  } catch (error) {
    console.error('Error showing notification:', error)
    return null
  }
}

export function isWindowFocused(): boolean {
  return document.hasFocus()
}
