export type NotificationPermission = 'default' | 'granted' | 'denied'

export function isNotificationSupported(): boolean {
  return true
}

export function getNotificationPermission(): NotificationPermission {
  return 'granted'
}

export async function requestNotificationPermission(): Promise<boolean> {
  return true
}

export function showNotification(
  title: string,
  options?: NotificationOptions & {
    body?: string
    icon?: string
    badge?: string
    tag?: string
    onClick?: () => void
  },
): Notification | null {
  void title
  void options
  return null
}

export function isWindowFocused(): boolean {
  return document.hasFocus()
}
