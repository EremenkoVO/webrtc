import { OpenAPI } from '@/api/core/OpenAPI'
import { useDmStore } from '@/shared/stores/dmStore'
import { useRoomStore } from '@/shared/stores/roomStore'
import {
  requestNotificationPermission,
  showNotification,
  getNotificationPermission,
} from '@/shared/lib/useNotifications'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export type ChatConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting'
export type NotificationConnectionState = 'disconnected' | 'connecting' | 'connected'

export interface ChatMessage {
  type: 'chat_message' | 'voice_message' | 'file_message'
  room: string
  from: string
  username: string
  text: string
  timestamp: string
  id?: string // Optional message ID for editing/deleting
  edited?: boolean // Whether message was edited
  reactions?: Record<string, string[]> // emoji -> array of userIds who reacted
  replyToId?: string
  replyToUsername?: string
  replyToText?: string
  voiceUrl?: string
  voiceDuration?: number
  fileUrl?: string
  fileName?: string
  fileSize?: number
  fileContentType?: string
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

export interface VoiceRecordingMessage {
  type: 'voice_recording'
  room: string
  username: string
  isRecording: boolean
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
  | VoiceRecordingMessage
  | { type: 'error'; message: string }

export interface ChatNotificationMessage {
  type: 'chat_notification'
  scopeType: 'channel' | 'dm'
  scopeId: string
  fromUserId: string
  fromUsername: string
  messageType: 'chat_message' | 'voice_message' | 'file_message'
  textPreview: string
  timestamp: string
}

export const useChatStore = defineStore('chat', () => {
  const ws = ref<WebSocket | null>(null)
  const notifyWs = ref<WebSocket | null>(null)
  const connectionState = ref<ChatConnectionState>('disconnected')
  const notificationConnectionState = ref<NotificationConnectionState>('disconnected')
  const currentRoomId = ref<string | null>(null)
  const currentScopeType = ref<'channel' | 'dm'>('channel')
  const messagesByRoom = ref<Map<string, ChatMessage[]>>(new Map())
  const unreadByScope = ref<Map<string, number>>(new Map())
  const typingUsers = ref<Set<string>>(new Set())
  const voiceRecordingUsers = ref<Set<string>>(new Set())
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

  function scopeKey(scopeType: 'channel' | 'dm', scopeId: string): string {
    return `${scopeType}:${scopeId}`
  }

  function activeScopeKey(): string | null {
    if (!currentRoomId.value) return null
    return scopeKey(currentScopeType.value, currentRoomId.value)
  }

  function unreadCountFor(scopeType: 'channel' | 'dm', scopeId: string): number {
    return unreadByScope.value.get(scopeKey(scopeType, scopeId)) || 0
  }

  function clearUnread(scopeType: 'channel' | 'dm', scopeId: string) {
    unreadByScope.value.delete(scopeKey(scopeType, scopeId))
  }

  function incrementUnread(scopeType: 'channel' | 'dm', scopeId: string) {
    const key = scopeKey(scopeType, scopeId)
    unreadByScope.value.set(key, (unreadByScope.value.get(key) || 0) + 1)
  }

  function shouldNotify(message: ChatMessage, messageScopeType: 'channel' | 'dm', messageScopeId: string): boolean {
    if (!notificationsEnabled.value) return false
    if (message.from === clientId.value) return false
    const active = activeScopeKey()
    if (!active) return true
    return scopeKey(messageScopeType, messageScopeId) !== active
  }

  function connect(roomId: string, userName: string, scopeType: 'channel' | 'dm' = 'channel') {
    if (ws.value && (ws.value.readyState === WebSocket.OPEN || ws.value.readyState === WebSocket.CONNECTING) && currentRoomId.value === roomId) return
    if (ws.value && currentRoomId.value !== roomId) {
      typingUsers.value.clear()
      voiceRecordingUsers.value.clear()
      disconnect()
    }

    connectionState.value = 'connecting'
    currentRoomId.value = roomId
    currentScopeType.value = scopeType
    username.value = userName
    clearUnread(scopeType, roomId)

    if (!messagesByRoom.value.has(roomId)) {
      messagesByRoom.value.set(roomId, [])
    }
    typingUsers.value.clear()
    voiceRecordingUsers.value.clear()

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
      const url = `${wsUrl}?token=${encodeURIComponent(token)}&scopeType=${encodeURIComponent(scopeType)}&scopeId=${encodeURIComponent(roomId)}&username=${encodeURIComponent(userName)}`

      console.log('Connecting to chat WebSocket:', url)
      const newWs = new WebSocket(url)
      ws.value = newWs

      newWs.onopen = () => {
        if (ws.value !== newWs) return
        connectionState.value = 'connected'
        reconnectAttempts.value = 0
      }

      newWs.onmessage = (event) => {
        if (ws.value !== newWs) return
        try {
          const message: ChatWebSocketMessage = JSON.parse(event.data)
          handleMessage(message)
        } catch (error) {
          console.error('Failed to parse chat message:', error)
        }
      }

      newWs.onerror = (error) => {
        if (ws.value !== newWs) return
        console.error('Chat WebSocket error:', error)
        connectionState.value = 'disconnected'
      }

      newWs.onclose = (event) => {
        console.log('Chat WebSocket closed:', event.code, event.reason)
        // Only handle if this is still the active socket (not replaced by a new connect())
        if (ws.value !== newWs) return
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

  function connectNotifications() {
    if (notifyWs.value && (notifyWs.value.readyState === WebSocket.OPEN || notifyWs.value.readyState === WebSocket.CONNECTING)) return
    notificationConnectionState.value = 'connecting'
    try {
      let baseUrl = OpenAPI.BASE
      if (!baseUrl || baseUrl === '') {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        baseUrl = `${protocol}//${window.location.host}`
      } else {
        baseUrl = baseUrl.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:')
      }
      const wsUrl = `${baseUrl}/api/v1/chat/notifications/ws`
      const token =
        typeof OpenAPI.TOKEN === 'string' ? OpenAPI.TOKEN : localStorage.getItem('token') || ''
      const url = `${wsUrl}?token=${encodeURIComponent(token)}`
      const socket = new WebSocket(url)
      notifyWs.value = socket
      socket.onopen = () => {
        if (notifyWs.value !== socket) return
        notificationConnectionState.value = 'connected'
      }
      socket.onmessage = (event) => {
        if (notifyWs.value !== socket) return
        try {
          const msg: ChatNotificationMessage = JSON.parse(event.data)
          handleNotification(msg)
        } catch (error) {
          console.error('Failed to parse notification message:', error)
        }
      }
      socket.onclose = () => {
        if (notifyWs.value !== socket) return
        notificationConnectionState.value = 'disconnected'
        notifyWs.value = null
      }
      socket.onerror = () => {
        if (notifyWs.value !== socket) return
        notificationConnectionState.value = 'disconnected'
      }
    } catch (error) {
      notificationConnectionState.value = 'disconnected'
    }
  }

  function attemptReconnect() {
    if (!currentRoomId.value || !username.value) return
    connectionState.value = 'reconnecting'
    reconnectAttempts.value++
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.value), 30000)
    reconnectTimeout.value = setTimeout(() => {
      if (currentRoomId.value && username.value) {
        connect(currentRoomId.value, username.value, currentScopeType.value)
      }
    }, delay)
  }

  function disconnect() {
    if (reconnectTimeout.value) {
      clearTimeout(reconnectTimeout.value)
      reconnectTimeout.value = null
    }
    if (ws.value) {
      const old = ws.value
      ws.value = null
      old.onopen = null
      old.onmessage = null
      old.onerror = null
      old.onclose = null
      old.close()
    }
    connectionState.value = 'disconnected'
    typingUsers.value.clear()
    voiceRecordingUsers.value.clear()
    reconnectAttempts.value = 0
  }

  function disconnectNotifications() {
    if (notifyWs.value) {
      const old = notifyWs.value
      notifyWs.value = null
      old.onopen = null
      old.onmessage = null
      old.onerror = null
      old.onclose = null
      old.close()
    }
    notificationConnectionState.value = 'disconnected'
  }

  function sendMessage(text: string, replyToId?: string) {
    if (!ws.value || ws.value.readyState !== WebSocket.OPEN) return false
    if (!text.trim()) return false
    try {
      const payload: Record<string, unknown> = { type: 'chat_message', text: text.trim() }
      if (replyToId) payload.replyToId = replyToId
      ws.value.send(JSON.stringify(payload))
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

  function sendVoiceRecording(isRecording: boolean) {
    if (!ws.value || ws.value.readyState !== WebSocket.OPEN) return
    ws.value.send(JSON.stringify({ type: 'voice_recording', isRecording }))
  }

  async function sendVoiceMessage(roomId: string, blob: Blob, duration: number): Promise<void> {
    const token = localStorage.getItem('token') || ''
    const base = OpenAPI.BASE || ''
    const fd = new FormData()
    fd.append('audio', blob, 'voice.webm')
    fd.append('duration', String(Math.round(duration)))
    await fetch(`${base}/api/v1/chat/${encodeURIComponent(roomId)}/voice?scopeType=${encodeURIComponent(currentScopeType.value)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    })
  }

  async function sendFileMessage(roomId: string, file: File): Promise<void> {
    const token = localStorage.getItem('token') || ''
    const base = OpenAPI.BASE || ''
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch(`${base}/api/v1/chat/${encodeURIComponent(roomId)}/file?scopeType=${encodeURIComponent(currentScopeType.value)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.message ?? `Upload failed: HTTP ${res.status}`)
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
        voiceRecordingUsers.value.clear()
        break

      case 'chat_history':
        if (message.room && currentRoomId.value === message.room) {
          messagesByRoom.value.set(message.room, [...message.messages])
        }
        break

      case 'chat_message':
      case 'voice_message':
      case 'file_message': {
        const roomId = message.room || currentRoomId.value
        const messageScopeType = currentScopeType.value
        if (roomId) {
          const roomMessages = messagesByRoom.value.get(roomId) || []
          const updated = roomMessages.length >= 100
            ? [...roomMessages.slice(-99), message]
            : [...roomMessages, message]
          messagesByRoom.value.set(roomId, updated)
          const key = scopeKey(messageScopeType, roomId)
          if (activeScopeKey() !== key) {
            incrementUnread(messageScopeType, roomId)
          }
          if (message.type === 'chat_message' && shouldNotify(message, messageScopeType, roomId)) {
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
        if (message.room === currentRoomId.value && message.username !== username.value) {
          if (message.isTyping) {
            typingUsers.value.add(message.username)
          } else {
            typingUsers.value.delete(message.username)
          }
        }
        break

      case 'voice_recording':
        if (message.room === currentRoomId.value && message.username !== username.value) {
          if (message.isRecording) {
            voiceRecordingUsers.value.add(message.username)
          } else {
            voiceRecordingUsers.value.delete(message.username)
          }
        }
        break

      case 'message_edited': {
        const roomId = message.room || currentRoomId.value
        if (roomId) {
          const roomMessages = messagesByRoom.value.get(roomId) || []
          const messageIndex = roomMessages.findIndex((m) => m.id === message.messageId)
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
            if (m.id) {
              return m.id !== message.messageId
            }
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

  function handleNotification(message: ChatNotificationMessage) {
    if (message.type !== 'chat_notification') return
    if (message.fromUserId === clientId.value || message.fromUserId === userId.value) return
    const active = activeScopeKey()
    const key = scopeKey(message.scopeType, message.scopeId)
    if (active !== key) {
      incrementUnread(message.scopeType, message.scopeId)
      if (notificationsEnabled.value) {
        const roomStore = useRoomStore()
        const dmStore = useDmStore()
        const channelName =
          message.scopeType === 'channel'
            ? roomStore.channelById(message.scopeId)?.name || message.scopeId
            : null
        const notificationBody =
          message.scopeType === 'channel'
            ? `#${channelName}: ${message.textPreview || '[New message]'}`
            : message.textPreview || '[New message]'
        showNotification(`${message.fromUsername}`, {
          body: notificationBody,
          tag: `chat-${message.scopeType}-${message.scopeId}-${message.fromUserId}`,
          icon: '/favicon.ico',
          onClick: () => {
            if (message.scopeType === 'channel') {
              void roomStore.selectChannel(message.scopeId)
              clearUnread('channel', message.scopeId)
              return
            }
            const conversation = dmStore.conversations.find((c) => c.id === message.scopeId)
            const dmTitle = conversation
              ? dmStore.titleFor(conversation, userId.value || null)
              : message.fromUsername || 'DM'
            roomStore.selectDirectConversation(message.scopeId, dmTitle)
            clearUnread('dm', message.scopeId)
          },
        })
      }
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
    notificationConnectionState,
    currentRoomId,
    messages,
    typingUsers,
    voiceRecordingUsers,
    clientId,
    userId,
    username,
    notificationsEnabled,
    isConnected,
    isInRoom,
    notificationPermission,
    unreadByScope,
    unreadCountFor,
    clearUnread,
    connect,
    connectNotifications,
    disconnect,
    disconnectNotifications,
    sendMessage,
    sendTyping,
    sendVoiceRecording,
    sendVoiceMessage,
    sendFileMessage,
    editMessage,
    deleteMessage,
    addReaction,
    removeReaction,
    setNotificationsEnabled,
    requestNotificationPermission: requestPermission,
    clearMessages,
  }
})
