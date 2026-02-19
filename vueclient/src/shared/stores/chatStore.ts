import { OpenAPI } from '@/api/core/OpenAPI'
import {
  requestNotificationPermission,
  showNotification,
  isWindowFocused,
  getNotificationPermission,
} from '@/shared/lib/useNotifications'
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
  const ws = ref<WebSocket | null>(null)
  const connectionState = ref<ChatConnectionState>('disconnected')
  const currentRoomId = ref<string | null>(null)
  const messagesByRoom = ref<Map<string, ChatMessage[]>>(new Map())
  const typingUsers = ref<Set<string>>(new Set())
  const reconnectAttempts = ref(0)
  const maxReconnectAttempts = 5
  const reconnectTimeout = ref<ReturnType<typeof setTimeout> | null>(null)
  const clientId = ref<string | null>(null)
  const username = ref<string | null>(null)
  const notificationsEnabled = ref<boolean>(
    localStorage.getItem('chatNotificationsEnabled') !== 'false',
  )

  const messages = computed(() => {
    if (!currentRoomId.value) return []
    return messagesByRoom.value.get(currentRoomId.value) || []
  })

  const isConnected = computed(() => connectionState.value === 'connected')
  const isInRoom = computed(() => currentRoomId.value !== null)
  const notificationPermission = computed(() => getNotificationPermission())

  function connect(roomId: string, userName: string) {
    if (ws.value && ws.value.readyState === WebSocket.OPEN && currentRoomId.value === roomId) return
    if (ws.value && currentRoomId.value !== roomId) {
      typingUsers.value.clear()
      disconnect()
    }

    connectionState.value = 'connecting'
    currentRoomId.value = roomId
    username.value = userName

    if (!messagesByRoom.value.has(roomId)) {
      messagesByRoom.value.set(roomId, [])
    }
    typingUsers.value.clear()

    try {
      let baseUrl = OpenAPI.BASE
      if (!baseUrl || baseUrl === '') {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        baseUrl = `${protocol}//${window.location.host}`
      } else {
        baseUrl = baseUrl.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:')
      }

      const wsUrl = `${baseUrl}/api/v1/chat/ws`
      const token =
        typeof OpenAPI.TOKEN === 'string' ? OpenAPI.TOKEN : localStorage.getItem('token') || ''
      const url = `${wsUrl}?token=${encodeURIComponent(token)}&room=${encodeURIComponent(roomId)}&username=${encodeURIComponent(userName)}`

      ws.value = new WebSocket(url)

      ws.value.onopen = () => {
        connectionState.value = 'connected'
        reconnectAttempts.value = 0
      }

      ws.value.onmessage = (event) => {
        try {
          const message: ChatWebSocketMessage = JSON.parse(event.data)
          handleMessage(message)
        } catch (error) {
          console.error('Failed to parse chat message:', error)
        }
      }

      ws.value.onerror = (error) => {
        console.error('Chat WebSocket error:', error)
      }

      ws.value.onclose = () => {
        connectionState.value = 'disconnected'
        ws.value = null
        if (currentRoomId.value && reconnectAttempts.value < maxReconnectAttempts) {
          attemptReconnect()
        }
      }
    } catch (error) {
      console.error('Failed to connect Chat WebSocket:', error)
      connectionState.value = 'disconnected'
    }
  }

  function attemptReconnect() {
    if (!currentRoomId.value || !username.value) return
    connectionState.value = 'reconnecting'
    reconnectAttempts.value++
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.value), 30000)
    reconnectTimeout.value = setTimeout(() => {
      if (currentRoomId.value && username.value) {
        connect(currentRoomId.value, username.value)
      }
    }, delay)
  }

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
    typingUsers.value.clear()
    reconnectAttempts.value = 0
  }

  function sendMessage(text: string) {
    if (!ws.value || ws.value.readyState !== WebSocket.OPEN) return false
    if (!text.trim()) return false
    try {
      ws.value.send(JSON.stringify({ type: 'chat_message', text: text.trim() }))
      return true
    } catch (error) {
      console.error('Failed to send message:', error)
      return false
    }
  }

  function sendTyping(isTyping: boolean) {
    if (!ws.value || ws.value.readyState !== WebSocket.OPEN) return false
    try {
      ws.value.send(JSON.stringify({ type: 'typing', isTyping }))
      return true
    } catch (error) {
      return false
    }
  }

  function handleMessage(message: ChatWebSocketMessage) {
    switch (message.type) {
      case 'joined':
        clientId.value = message.clientId
        username.value = message.username
        typingUsers.value.clear()
        break

      case 'chat_history':
        if (message.room && currentRoomId.value === message.room) {
          messagesByRoom.value.set(message.room, [...message.messages])
        }
        break

      case 'chat_message': {
        const roomId = message.room || currentRoomId.value
        if (roomId) {
          const roomMessages = messagesByRoom.value.get(roomId) || []
          roomMessages.push(message)
          if (roomMessages.length > 100) {
            roomMessages.splice(0, roomMessages.length - 100)
          }
          messagesByRoom.value.set(roomId, roomMessages)
        }
        if (
          notificationsEnabled.value &&
          message.from !== clientId.value &&
          message.room === currentRoomId.value
        ) {
          if (!isWindowFocused()) {
            showNotification(`${message.username}`, {
              body: message.text.length > 100 ? message.text.substring(0, 100) + '...' : message.text,
              tag: `chat-${message.room}-${message.from}`,
              icon: '/favicon.ico',
            })
          }
        }
        break
      }

      case 'typing':
        if (message.room === currentRoomId.value) {
          if (message.isTyping) {
            typingUsers.value.add(message.username)
          } else {
            typingUsers.value.delete(message.username)
          }
        }
        break

      case 'error':
        console.error('Chat error:', message.message)
        break
    }
  }

  function setNotificationsEnabled(enabled: boolean) {
    notificationsEnabled.value = enabled
    localStorage.setItem('chatNotificationsEnabled', String(enabled))
    if (enabled) requestNotificationPermission().catch(console.error)
  }

  async function requestPermission() {
    return await requestNotificationPermission()
  }

  function clearMessages(roomId?: string) {
    if (roomId) {
      messagesByRoom.value.delete(roomId)
    } else {
      messagesByRoom.value.clear()
    }
  }

  return {
    connectionState,
    currentRoomId,
    messages,
    typingUsers,
    clientId,
    username,
    notificationsEnabled,
    isConnected,
    isInRoom,
    notificationPermission,
    connect,
    disconnect,
    sendMessage,
    sendTyping,
    setNotificationsEnabled,
    requestNotificationPermission: requestPermission,
    clearMessages,
  }
})
