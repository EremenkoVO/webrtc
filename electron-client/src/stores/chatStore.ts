import { create } from 'zustand'
import { OpenAPI, getChatWsBaseUrl, getChatWsPath } from '@/api/core/OpenAPI'

export type ChatConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting'

export interface ChatMessage {
  type: 'chat_message'
  room: string
  from: string
  username: string
  text: string
  timestamp: string
}

type ChatWsMessage =
  | ChatMessage
  | { type: 'chat_history'; room: string; messages: ChatMessage[] }
  | { type: 'joined'; room: string; clientId: string; username: string }
  | { type: 'typing'; room: string; from: string; username: string; isTyping: boolean }
  | { type: 'error'; message: string }

function getNotificationPermission(): 'default' | 'granted' | 'denied' {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'denied'
  return Notification.permission as 'default' | 'granted' | 'denied'
}

function isWindowFocused(): boolean {
  return typeof document !== 'undefined' && document.hasFocus()
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  const result = await Notification.requestPermission()
  return result === 'granted'
}

export function showNotification(
  title: string,
  options?: NotificationOptions & { body?: string; tag?: string }
): Notification | null {
  if (typeof window === 'undefined' || !('Notification' in window) || getNotificationPermission() !== 'granted')
    return null
  if (document.hasFocus()) return null
  try {
    const n = new Notification(title, {
      icon: '/favicon.ico',
      tag: options?.tag || 'chat-message',
      ...options,
    })
    setTimeout(() => n.close(), 5000)
    n.onclick = () => {
      window.focus()
      n.close()
    }
    return n
  } catch (e) {
    console.error(e)
    return null
  }
}

type ChatState = {
  ws: WebSocket | null
  connectionState: ChatConnectionState
  currentRoomId: string | null
  messagesByRoom: Map<string, ChatMessage[]>
  typingUsers: Set<string>
  clientId: string | null
  username: string | null
  notificationsEnabled: boolean
  reconnectAttempts: number
  messages: () => ChatMessage[]
  isConnected: () => boolean
  connect: (roomId: string, userName: string) => void
  disconnect: () => void
  sendMessage: (text: string) => boolean
  sendTyping: (isTyping: boolean) => boolean
  setNotificationsEnabled: (enabled: boolean) => void
  clearMessages: (roomId?: string) => void
  requestNotificationPermission: () => Promise<boolean>
}

const maxReconnectAttempts = 5

export const useChatStore = create<ChatState>((set, get) => {
  const notificationsEnabled =
    typeof localStorage !== 'undefined' ? localStorage.getItem('chatNotificationsEnabled') !== 'false' : true

  const handleMessage = (message: ChatWsMessage) => {
    const state = get()
    switch (message.type) {
      case 'joined':
        set({ clientId: message.clientId, username: message.username })
        set(() => ({ typingUsers: new Set() }))
        break
      case 'chat_history':
        if (message.room && state.currentRoomId === message.room) {
          const m = new Map(state.messagesByRoom)
          m.set(message.room, message.messages || [])
          set({ messagesByRoom: m })
        }
        break
      case 'chat_message': {
        const roomId = message.room || state.currentRoomId
        if (roomId) {
          const m = new Map(state.messagesByRoom)
          const list = m.get(roomId) || []
          list.push(message)
          if (list.length > 100) list.splice(0, list.length - 100)
          m.set(roomId, list)
          set({ messagesByRoom: m })
        }
        if (
          state.notificationsEnabled &&
          message.from !== state.clientId &&
          message.room === state.currentRoomId &&
          !isWindowFocused()
        ) {
          showNotification(message.username, {
            body: message.text.length > 100 ? message.text.slice(0, 100) + '...' : message.text,
            tag: `chat-${message.room}-${message.from}`,
          })
        }
        break
      }
      case 'typing':
        if (message.room === state.currentRoomId) {
          const next = new Set(state.typingUsers)
          if (message.isTyping) next.add(message.username)
          else next.delete(message.username)
          set({ typingUsers: next })
        }
        break
      case 'error':
        console.error('Chat error', message.message)
        break
    }
  }

  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null

  const connect = (roomId: string, userName: string) => {
    const state = get()
    if (state.ws?.readyState === WebSocket.OPEN && state.currentRoomId === roomId) return
    if (state.ws && state.currentRoomId !== roomId) {
      get().disconnect()
    }
    set({
      connectionState: 'connecting',
      currentRoomId: roomId,
      username: userName,
      typingUsers: new Set(),
    })
    const m = new Map(state.messagesByRoom)
    if (!m.has(roomId)) m.set(roomId, [])
    set({ messagesByRoom: m })
    try {
      const baseUrl = getChatWsBaseUrl()
      const path = getChatWsPath()
      const token =
        (typeof OpenAPI.TOKEN === 'string' ? OpenAPI.TOKEN : '') ||
        (typeof localStorage !== 'undefined' ? localStorage.getItem('token') : '') ||
        ''
      const url = `${baseUrl}${path}?token=${encodeURIComponent(token)}&room=${encodeURIComponent(roomId)}&username=${encodeURIComponent(userName)}`
      const ws = new WebSocket(url)
      ws.onopen = () => set({ connectionState: 'connected' })
      ws.onmessage = (e) => {
        try {
          handleMessage(JSON.parse(e.data) as ChatWsMessage)
        } catch (err) {
          console.error('Chat parse', err)
        }
      }
      ws.onerror = (err) => console.error('Chat WS error', err)
      ws.onclose = () => {
        set({ connectionState: 'disconnected', ws: null })
        const s = get()
        if (s.currentRoomId && s.reconnectAttempts < maxReconnectAttempts) {
          set((x) => ({ reconnectAttempts: x.reconnectAttempts + 1 }))
          reconnectTimeout = setTimeout(() => {
            connect(s.currentRoomId!, s.username!)
          }, 2000)
        }
      }
      set({ ws })
    } catch (err) {
      console.error('Chat connect', err)
      set({ connectionState: 'disconnected' })
    }
  }

  const disconnect = () => {
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout)
      reconnectTimeout = null
    }
    const state = get()
    if (state.ws) state.ws.close()
    set({ ws: null, connectionState: 'disconnected', typingUsers: new Set() })
  }

  const sendMessage = (text: string): boolean => {
    const state = get()
    if (!state.ws || state.ws.readyState !== WebSocket.OPEN || !text.trim()) return false
    try {
      state.ws.send(JSON.stringify({ type: 'chat_message', text: text.trim() }))
      return true
    } catch (e) {
      console.error(e)
      return false
    }
  }

  const sendTyping = (isTyping: boolean): boolean => {
    const ws = get().ws
    if (!ws || ws.readyState !== WebSocket.OPEN) return false
    try {
      ws.send(JSON.stringify({ type: 'typing', isTyping }))
      return true
    } catch (e) {
      return false
    }
  }

  const messages = (): ChatMessage[] => {
    const state = get()
    if (!state.currentRoomId) return []
    return state.messagesByRoom.get(state.currentRoomId) || []
  }

  return {
    ws: null,
    connectionState: 'disconnected',
    currentRoomId: null,
    messagesByRoom: new Map(),
    typingUsers: new Set(),
    clientId: null,
    username: null,
    notificationsEnabled,
    reconnectAttempts: 0,
    messages,
    isConnected: () => get().connectionState === 'connected',
    connect,
    disconnect,
    sendMessage,
    sendTyping,
    setNotificationsEnabled: (enabled: boolean) => {
      if (typeof localStorage !== 'undefined') localStorage.setItem('chatNotificationsEnabled', String(enabled))
      set({ notificationsEnabled: enabled })
      if (enabled) requestNotificationPermission().catch(console.error)
    },
    clearMessages: (roomId?: string) => {
      const m = new Map(get().messagesByRoom)
      if (roomId) m.delete(roomId)
      else m.clear()
      set({ messagesByRoom: m })
    },
    requestNotificationPermission,
  }
})
