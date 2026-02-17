export type NotificationPermission = 'default' | 'granted' | 'denied'

export function isNotificationSupported(): boolean {
  return 'Notification' in window
}

export function getNotificationPermission(): NotificationPermission {
  if (!isNotificationSupported()) return 'denied'
  return Notification.permission as NotificationPermission
}

export async function requestNotificationPermission(): Promise<boolean> {
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
  options?: NotificationOptions & { body?: string; icon?: string; tag?: string },
): Notification | null {
  if (!isNotificationSupported() || getNotificationPermission() !== 'granted') return null
  if (document.hasFocus()) return null
  try {
    const notification = new Notification(title, {
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: options?.tag || 'chat-message',
      requireInteraction: false,
      silent: false,
      ...options,
    })
    setTimeout(() => notification.close(), 5000)
    notification.onclick = () => {
      window.focus()
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
