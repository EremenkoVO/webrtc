import { OpenAPI } from '@/api/core/OpenAPI'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useRoomStore } from './roomStore'

type PresenceConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting'

interface PresenceSnapshotMessage {
  type: 'presence_snapshot'
  online_users: string[]
  channel_members?: Record<string, Array<{ user_id: string; username: string }>>
}

interface PresenceUpdateMessage {
  type: 'user_online' | 'user_offline'
  user_id: string
}

interface UserChannelChangedMessage {
  type: 'user_channel_changed'
  user_id: string
  username?: string
  channel_id?: string
}

type PresenceMessage = PresenceSnapshotMessage | PresenceUpdateMessage | UserChannelChangedMessage

export const usePresenceStore = defineStore('presence', () => {
  const ws = ref<WebSocket | null>(null)
  const connectionState = ref<PresenceConnectionState>('disconnected')
  const onlineUserIds = ref<Set<string>>(new Set())
  const lastSeenByUserId = ref<Map<string, string>>(new Map())
  const reconnectAttempts = ref(0)
  const maxReconnectAttempts = 8
  const reconnectTimeout = ref<ReturnType<typeof setTimeout> | null>(null)
  const shouldReconnect = ref(true)

  const isConnected = computed(() => connectionState.value === 'connected')

  function connect() {
    if (ws.value && (ws.value.readyState === WebSocket.OPEN || ws.value.readyState === WebSocket.CONNECTING)) return

    shouldReconnect.value = true
    connectionState.value = reconnectAttempts.value > 0 ? 'reconnecting' : 'connecting'

    let baseUrl = OpenAPI.BASE
    if (!baseUrl || baseUrl === '') {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      baseUrl = `${protocol}//${window.location.host}`
    } else {
      baseUrl = baseUrl.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:')
    }

    const token = typeof OpenAPI.TOKEN === 'string' ? OpenAPI.TOKEN : localStorage.getItem('token') || ''
    if (!token) {
      connectionState.value = 'disconnected'
      return
    }

    const url = `${baseUrl}/api/v1/presence/ws?token=${encodeURIComponent(token)}`
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
        const message: PresenceMessage = JSON.parse(event.data)
        handleMessage(message)
      } catch (error) {
        console.error('Failed to parse presence message:', error)
      }
    }

    newWs.onerror = (error) => {
      if (ws.value !== newWs) return
      console.error('Presence WebSocket error:', error)
    }

    newWs.onclose = () => {
      if (ws.value !== newWs) return
      ws.value = null
      connectionState.value = 'disconnected'
      if (shouldReconnect.value && reconnectAttempts.value < maxReconnectAttempts) {
        reconnectAttempts.value++
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.value), 30000)
        reconnectTimeout.value = setTimeout(() => connect(), delay)
      }
    }
  }

  function disconnect() {
    shouldReconnect.value = false
    if (reconnectTimeout.value) {
      clearTimeout(reconnectTimeout.value)
      reconnectTimeout.value = null
    }
    if (ws.value) {
      ws.value.close()
      ws.value = null
    }
    connectionState.value = 'disconnected'
    reconnectAttempts.value = 0
    onlineUserIds.value.clear()
    lastSeenByUserId.value.clear()
  }

  function handleMessage(message: PresenceMessage) {
    const roomStore = useRoomStore()
    if (message.type === 'presence_snapshot') {
      onlineUserIds.value = new Set(message.online_users)
      roomStore.setRealtimeChannelMembers(message.channel_members || {})
      return
    }
    if (message.type === 'user_online') {
      onlineUserIds.value.add(message.user_id)
      lastSeenByUserId.value.delete(message.user_id)
      return
    }
    if (message.type === 'user_channel_changed') {
      roomStore.updateRealtimeUserChannel(
        message.user_id,
        message.username,
        message.channel_id || '',
      )
      return
    }
    onlineUserIds.value.delete(message.user_id)
    lastSeenByUserId.value.set(message.user_id, new Date().toISOString())
  }

  function isUserOnline(userId: string | null | undefined): boolean {
    if (!userId) return false
    return onlineUserIds.value.has(userId)
  }

  function getLastSeenAt(userId: string | null | undefined): string | null {
    if (!userId) return null
    return lastSeenByUserId.value.get(userId) ?? null
  }

  return {
    connectionState,
    isConnected,
    onlineUserIds,
    lastSeenByUserId,
    connect,
    disconnect,
    isUserOnline,
    getLastSeenAt,
  }
})
