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
  id?: string // Optional message ID for editing/deleting
  edited?: boolean // Whether message was edited
  reactions?: Record<string, string[]> // emoji -> array of userIds who reacted
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
  userId?: string
  username: string
  timestamp: string
}

export interface MessageEditedMessage {
  type: 'message_edited'
  room: string
  messageId: string
  text: string
  timestamp: string
}

export interface MessageDeletedMessage {
  type: 'message_deleted'
  room: string
  messageId: string
}

export interface ReactionUpdatedMessage {
  type: 'reaction_updated'
  room: string
  messageId: string
  emoji: string
  reactions: Record<string, string[]> // emoji -> array of clientIds
}

export type ChatWebSocketMessage =
  | ChatMessage
  | ChatHistoryMessage
  | UserJoinedMessage
  | UserLeftMessage
  | TypingMessage
  | JoinedMessage
  | MessageEditedMessage
  | MessageDeletedMessage
  | ReactionUpdatedMessage
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
  const userId = ref<string | null>(null)
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

      console.log('Connecting to chat WebSocket:', url)
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
        console.error('WebSocket URL was:', url)
        connectionState.value = 'disconnected'
      }

      ws.value.onclose = (event) => {
        console.log('Chat WebSocket closed:', event.code, event.reason)
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

  function editMessage(messageId: string, newText: string) {
    if (!ws.value || ws.value.readyState !== WebSocket.OPEN) return false
    if (!newText.trim()) return false
    try {
      ws.value.send(JSON.stringify({ type: 'edit_message', messageId, text: newText.trim() }))
      return true
    } catch (error) {
      console.error('Failed to edit message:', error)
      return false
    }
  }

  function deleteMessage(messageId: string) {
    if (!ws.value || ws.value.readyState !== WebSocket.OPEN) return false
    try {
      ws.value.send(JSON.stringify({ type: 'delete_message', messageId }))
      return true
    } catch (error) {
      console.error('Failed to delete message:', error)
      return false
    }
  }

  function addReaction(messageId: string, emoji: string) {
    if (!ws.value || ws.value.readyState !== WebSocket.OPEN) return false
    if (!emoji) return false
    try {
      ws.value.send(JSON.stringify({ type: 'add_reaction', messageId, emoji }))
      return true
    } catch (error) {
      console.error('Failed to add reaction:', error)
      return false
    }
  }

  function removeReaction(messageId: string, emoji: string) {
    if (!ws.value || ws.value.readyState !== WebSocket.OPEN) return false
    if (!emoji) return false
    try {
      ws.value.send(JSON.stringify({ type: 'remove_reaction', messageId, emoji }))
      return true
    } catch (error) {
      console.error('Failed to remove reaction:', error)
      return false
    }
  }

  function handleMessage(message: ChatWebSocketMessage) {
    switch (message.type) {
      case 'joined':
        clientId.value = message.clientId
        userId.value = message.userId || message.clientId
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

      case 'message_edited': {
        const roomId = message.room || currentRoomId.value
        if (roomId) {
          const roomMessages = messagesByRoom.value.get(roomId) || []
          const messageIndex = roomMessages.findIndex((m) => m.id === message.messageId || (m.from === clientId.value && m.timestamp === message.timestamp))
          if (messageIndex !== -1) {
            roomMessages[messageIndex] = { ...roomMessages[messageIndex], text: message.text, edited: true }
            messagesByRoom.value.set(roomId, roomMessages)
          }
        }
        break
      }

      case 'message_deleted': {
        const roomId = message.room || currentRoomId.value
        if (roomId) {
          const roomMessages = messagesByRoom.value.get(roomId) || []
          const filteredMessages = roomMessages.filter((m) => {
            // If message has an ID, compare by ID
            if (m.id) {
              return m.id !== message.messageId
            }
            // Otherwise, compare by from + timestamp (fallback for messages without ID)
            const messageKey = `${m.from}-${m.timestamp}`
            const deletedKey = message.messageId
            return messageKey !== deletedKey
          })
          messagesByRoom.value.set(roomId, filteredMessages)
        }
        break
      }

      case 'reaction_updated': {
        const roomId = message.room || currentRoomId.value
        if (roomId) {
          const roomMessages = messagesByRoom.value.get(roomId) || []
          const messageIndex = roomMessages.findIndex((m) => 
            m.id === message.messageId || 
            (!m.id && `${m.from}-${m.timestamp}` === message.messageId)
          )
          if (messageIndex !== -1) {
            roomMessages[messageIndex] = { 
              ...roomMessages[messageIndex], 
              reactions: message.reactions 
            }
            messagesByRoom.value.set(roomId, roomMessages)
          }
        }
        break
      }

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
    userId,
    username,
    notificationsEnabled,
    isConnected,
    isInRoom,
    notificationPermission,
    connect,
    disconnect,
    sendMessage,
    sendTyping,
    editMessage,
    deleteMessage,
    addReaction,
    removeReaction,
    setNotificationsEnabled,
    requestNotificationPermission: requestPermission,
    clearMessages,
  }
})
