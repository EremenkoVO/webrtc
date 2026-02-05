import { OpenAPI } from '@/api/core/OpenAPI'
import {
  requestNotificationPermission,
  showNotification,
  isWindowFocused,
  getNotificationPermission,
} from '@/composible/useNotifications'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export type ChatConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting'

export interface ChatMessage {
  type: 'chat_message'
  room: string
  from: string
  username: string
  text: string
  timestamp: string
}

export interface ChatHistoryMessage {
  type: 'chat_history'
  room: string
  messages: ChatMessage[]
}

export interface UserJoinedMessage {
  type: 'user_joined'
  room: string
  clientId: string
  username: string
  timestamp: string
}

export interface UserLeftMessage {
  type: 'user_left'
  room: string
  clientId: string
  username: string
  timestamp: string
}

export interface TypingMessage {
  type: 'typing'
  room: string
  from: string
  username: string
  isTyping: boolean
}

export interface JoinedMessage {
  type: 'joined'
  room: string
  clientId: string
  username: string
  timestamp: string
}

export type ChatWebSocketMessage =
  | ChatMessage
  | ChatHistoryMessage
  | UserJoinedMessage
  | UserLeftMessage
  | TypingMessage
  | JoinedMessage
  | { type: 'error'; message: string }

export const useChatStore = defineStore('chat', () => {
  // Состояние
  const ws = ref<WebSocket | null>(null)
  const connectionState = ref<ChatConnectionState>('disconnected')
  const currentRoomId = ref<string | null>(null)
  // Храним сообщения отдельно для каждого канала
  const messagesByRoom = ref<Map<string, ChatMessage[]>>(new Map())
  // Текущие пользователи, печатающие в текущей комнате
  const typingUsers = ref<Set<string>>(new Set())
  const reconnectAttempts = ref(0)
  const maxReconnectAttempts = 5
  const reconnectTimeout = ref<ReturnType<typeof setTimeout> | null>(null)
  const clientId = ref<string | null>(null)
  const username = ref<string | null>(null)
  const notificationsEnabled = ref<boolean>(
    localStorage.getItem('chatNotificationsEnabled') !== 'false'
  )

  // Вычисляемые значения - сообщения текущей комнаты
  const messages = computed(() => {
    if (!currentRoomId.value) return []
    return messagesByRoom.value.get(currentRoomId.value) || []
  })

  const isConnected = computed(() => connectionState.value === 'connected')
  const isInRoom = computed(() => currentRoomId.value !== null)
  const notificationPermission = computed(() => getNotificationPermission())

  // Подключение к WebSocket чата
  function connect(roomId: string, userName: string) {
    // Если уже подключены к этой же комнате, ничего не делаем
    if (ws.value && ws.value.readyState === WebSocket.OPEN && currentRoomId.value === roomId) {
      console.log('Chat WebSocket уже подключён к этой комнате')
      return
    }

    // Если переключаемся на другую комнату, закрываем предыдущее соединение
    if (ws.value && currentRoomId.value !== roomId) {
      // Очищаем индикаторы печати для предыдущей комнаты
      typingUsers.value.clear()
      disconnect()
    }

    connectionState.value = 'connecting'
    currentRoomId.value = roomId
    username.value = userName

    // Инициализируем массив сообщений для комнаты, если его еще нет
    if (!messagesByRoom.value.has(roomId)) {
      messagesByRoom.value.set(roomId, [])
    }

    // Очищаем индикаторы печати при переключении комнаты
    typingUsers.value.clear()

    try {
      // Получаем базовый URL
      let baseUrl = OpenAPI.BASE
      if (!baseUrl || baseUrl === '') {
        // Если BASE не установлен, используем текущий протокол и хост
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        baseUrl = `${protocol}//${window.location.host}`
      } else {
        // Преобразуем HTTP базовый адрес в WebSocket URL
        baseUrl = baseUrl.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:')
      }

      const wsUrl = `${baseUrl}/api/v1/chat/ws`

      // Получаем токен
      const token = typeof OpenAPI.TOKEN === 'string' ? OpenAPI.TOKEN : localStorage.getItem('token') || ''

      // Добавляем токен, room и username в параметры запроса
      const url = `${wsUrl}?token=${encodeURIComponent(token)}&room=${encodeURIComponent(roomId)}&username=${encodeURIComponent(userName)}`

      ws.value = new WebSocket(url)

      ws.value.onopen = () => {
        console.log('Chat WebSocket подключён')
        connectionState.value = 'connected'
        reconnectAttempts.value = 0
      }

      ws.value.onmessage = (event) => {
        try {
          const message: ChatWebSocketMessage = JSON.parse(event.data)
          handleMessage(message)
        } catch (error) {
          console.error('Не удалось разобрать сообщение чата:', error)
        }
      }

      ws.value.onerror = (error) => {
        console.error('Ошибка Chat WebSocket:', error)
      }

      ws.value.onclose = () => {
        console.log('Chat WebSocket соединение закрыто')
        connectionState.value = 'disconnected'
        ws.value = null

        // Пытаемся переподключиться, если мы находились в комнате
        if (currentRoomId.value && reconnectAttempts.value < maxReconnectAttempts) {
          attemptReconnect()
        }
      }
    } catch (error) {
      console.error('Не удалось подключиться к Chat WebSocket:', error)
      connectionState.value = 'disconnected'
    }
  }

  // Попытка переподключения
  function attemptReconnect() {
    if (!currentRoomId.value || !username.value) return

    connectionState.value = 'reconnecting'
    reconnectAttempts.value++

    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.value), 30000)
    console.log(
      `Пытаемся переподключиться к чату через ${delay} мс (попытка ${reconnectAttempts.value}/${maxReconnectAttempts})`,
    )

    reconnectTimeout.value = setTimeout(() => {
      if (currentRoomId.value && username.value) {
        connect(currentRoomId.value, username.value)
      }
    }, delay)
  }

  // Отключение от WebSocket чата
  function disconnect() {
    if (reconnectTimeout.value) {
      clearTimeout(reconnectTimeout.value)
      reconnectTimeout.value = null
    }

    if (ws.value) {
      ws.value.close()
      ws.value = null
    }

    connectionState.value = 'disconnected'
    // Не очищаем currentRoomId здесь, так как он может быть нужен для переподключения
    // Очищаем только индикаторы печати
    typingUsers.value.clear()
    reconnectAttempts.value = 0
    // Не очищаем clientId и username, они могут быть переиспользованы
  }

  // Отправка сообщения через WebSocket
  function sendMessage(text: string) {
    if (!ws.value || ws.value.readyState !== WebSocket.OPEN) {
      console.error('Chat WebSocket не подключён')
      return false
    }

    if (!text.trim()) {
      return false
    }

    try {
      const message = {
        type: 'chat_message',
        text: text.trim(),
      }
      ws.value.send(JSON.stringify(message))
      return true
    } catch (error) {
      console.error('Не удалось отправить сообщение:', error)
      return false
    }
  }

  // Отправка индикатора печати
  function sendTyping(isTyping: boolean) {
    if (!ws.value || ws.value.readyState !== WebSocket.OPEN) {
      return false
    }

    try {
      const message = {
        type: 'typing',
        isTyping,
      }
      ws.value.send(JSON.stringify(message))
      return true
    } catch (error) {
      console.error('Не удалось отправить индикатор печати:', error)
      return false
    }
  }

  // Обработка входящих сообщений
  function handleMessage(message: ChatWebSocketMessage) {
    console.log('Получено сообщение чата:', message)

    switch (message.type) {
      case 'joined':
        clientId.value = message.clientId
        username.value = message.username
        console.log('Вошли в чат комнаты:', message.room)
        // Очищаем индикаторы печати при входе в комнату
        typingUsers.value.clear()
        break

      case 'chat_history':
        // Сохраняем историю для конкретной комнаты
        if (message.room && currentRoomId.value === message.room) {
          const roomMessages = messagesByRoom.value.get(message.room) || []
          messagesByRoom.value.set(message.room, [...message.messages])
        }
        break

      case 'chat_message':
        // Добавляем сообщение в историю конкретной комнаты
        const roomId = message.room || currentRoomId.value
        if (roomId) {
          const roomMessages = messagesByRoom.value.get(roomId) || []
          roomMessages.push(message)
          // Ограничиваем количество сообщений в памяти (последние 100)
          if (roomMessages.length > 100) {
            roomMessages.splice(0, roomMessages.length - 100)
          }
          messagesByRoom.value.set(roomId, roomMessages)
        }

        // Показываем уведомление только для сообщений из текущей комнаты
        if (
          notificationsEnabled.value &&
          message.from !== clientId.value &&
          message.room === currentRoomId.value
        ) {
          // Показываем уведомление только если окно не в фокусе
          if (!isWindowFocused()) {
            showNotification(`${message.username}`, {
              body: message.text.length > 100 ? message.text.substring(0, 100) + '...' : message.text,
              tag: `chat-${message.room}-${message.from}`,
              icon: '/favicon.ico',
            })
          }
        }
        break

      case 'user_joined':
        // Можно добавить системное сообщение о входе пользователя
        console.log('Пользователь присоединился к чату:', message.username)
        break

      case 'user_left':
        // Можно добавить системное сообщение о выходе пользователя
        console.log('Пользователь покинул чат:', message.username)
        break

      case 'typing':
        // Обновляем индикаторы печати только для текущей комнаты
        if (message.room === currentRoomId.value) {
          if (message.isTyping) {
            typingUsers.value.add(message.username)
          } else {
            typingUsers.value.delete(message.username)
          }
        }
        break

      case 'error':
        console.error('Ошибка чата:', message.message)
        break
    }
  }

  // Включить/выключить уведомления
  function setNotificationsEnabled(enabled: boolean) {
    notificationsEnabled.value = enabled
    localStorage.setItem('chatNotificationsEnabled', String(enabled))
    if (enabled) {
      requestNotificationPermission().catch(console.error)
    }
  }

  // Запрос разрешения на уведомления (обёртка для удобства)
  async function requestPermission() {
    return await requestNotificationPermission()
  }

  return {
    // Состояние
    connectionState,
    currentRoomId,
    messages,
    typingUsers,
    clientId,
    username,
    notificationsEnabled,

    // Вычисляемые значения
    isConnected,
    isInRoom,
    notificationPermission,

    // Действия
    connect,
    disconnect,
    sendMessage,
    sendTyping,
    setNotificationsEnabled,
    requestNotificationPermission: requestPermission,
  }
})
