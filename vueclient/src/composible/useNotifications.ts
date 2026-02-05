export type NotificationPermission = 'default' | 'granted' | 'denied'

// Проверка поддержки уведомлений
export function isNotificationSupported(): boolean {
  return 'Notification' in window
}

// Получить текущее разрешение
export function getNotificationPermission(): NotificationPermission {
  if (!isNotificationSupported()) {
    return 'denied'
  }
  return Notification.permission as NotificationPermission
}

// Запрос разрешения на уведомления
export async function requestNotificationPermission(): Promise<boolean> {
  if (!isNotificationSupported()) {
    console.warn('Браузер не поддерживает уведомления')
    return false
  }

  if (Notification.permission === 'granted') {
    return true
  }

  if (Notification.permission === 'denied') {
    return false
  }

  try {
    const result = await Notification.requestPermission()
    return result === 'granted'
  } catch (error) {
    console.error('Ошибка при запросе разрешения на уведомления:', error)
    return false
  }
}

// Показать уведомление
export function showNotification(
  title: string,
  options?: NotificationOptions & { body?: string; icon?: string; tag?: string }
): Notification | null {
  if (!isNotificationSupported() || getNotificationPermission() !== 'granted') {
    return null
  }

  // Не показываем уведомление, если окно в фокусе
  if (document.hasFocus()) {
    return null
  }

  try {
    const notification = new Notification(title, {
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: options?.tag || 'chat-message',
      requireInteraction: false,
      silent: false,
      ...options,
    })

    // Автоматически закрываем уведомление через 5 секунд
    setTimeout(() => {
      notification.close()
    }, 5000)

    // Обработка клика по уведомлению
    notification.onclick = () => {
      window.focus()
      notification.close()
    }

    return notification
  } catch (error) {
    console.error('Ошибка при показе уведомления:', error)
    return null
  }
}

// Проверка, находится ли окно в фокусе
export function isWindowFocused(): boolean {
  return document.hasFocus()
}
