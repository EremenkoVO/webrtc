import { OpenAPI } from '@/api/core/OpenAPI'
import { SignalingMessage } from '@/api/models/SignalingMessage'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useRoomStore } from './roomStore'

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting'

export const useSignalingStore = defineStore('signaling', () => {
  const ws = ref<WebSocket | null>(null)
  const connectionState = ref<ConnectionState>('disconnected')
  const clientId = ref<string | null>(null)
  const username = ref<string | null>(null)
  const room_mates = ref<Record<string, string>>({})
  const currentRoomId = ref<string | null>(null)
  const connectedPeers = ref<Map<string, string>>(new Map())
  const reconnectAttempts = ref(0)
  const maxReconnectAttempts = 5
  const reconnectTimeout = ref<ReturnType<typeof setTimeout> | null>(null)
  const messageHandlers = ref<Map<string, Array<(message: SignalingMessage) => void>>>(new Map())

  const isConnected = computed(() => connectionState.value === 'connected')
  const isInRoom = computed(() => currentRoomId.value !== null)

  function connect() {
    if (ws.value && ws.value.readyState === WebSocket.OPEN) return

    connectionState.value = 'connecting'
    try {
      let baseUrl = OpenAPI.BASE
      if (!baseUrl || baseUrl === '') {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        baseUrl = `${protocol}//${window.location.host}`
      } else {
        baseUrl = baseUrl.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:')
      }

      const wsUrl = `${baseUrl}/api/v1/ws`
      const token = typeof OpenAPI.TOKEN === 'string' ? OpenAPI.TOKEN : localStorage.getItem('token') || ''
      if (!token) {
        connectionState.value = 'disconnected'
        return
      }
      const url = `${wsUrl}?token=${encodeURIComponent(token)}`

      ws.value = new WebSocket(url)

      ws.value.onopen = () => {
        connectionState.value = 'connected'
        reconnectAttempts.value = 0
      }

      ws.value.onmessage = (event) => {
        try {
          const message: SignalingMessage = JSON.parse(event.data)
          handleMessage(message)
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error)
        }
      }

      ws.value.onerror = (error) => {
        console.error('WebSocket error:', error)
      }

      ws.value.onclose = () => {
        connectionState.value = 'disconnected'
        ws.value = null
        if (currentRoomId.value && reconnectAttempts.value < maxReconnectAttempts) {
          attemptReconnect()
        }
      }
    } catch (error) {
      console.error('Failed to connect WebSocket:', error)
      connectionState.value = 'disconnected'
    }
  }

  function attemptReconnect() {
    connectionState.value = 'reconnecting'
    reconnectAttempts.value++
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.value), 30000)
    reconnectTimeout.value = setTimeout(() => {
      connect()
      if (currentRoomId.value) {
        setTimeout(() => {
          if (isConnected.value) joinRoom(currentRoomId.value!)
        }, 1000)
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
    currentRoomId.value = null
    clientId.value = null
    username.value = null
    room_mates.value = {}
    connectedPeers.value.clear()
    reconnectAttempts.value = 0
    const roomStore = useRoomStore()
    roomStore.setParticipants([])
    roomStore.setRoommates([])
  }

  function sendMessage(message: SignalingMessage) {
    if (!ws.value || ws.value.readyState !== WebSocket.OPEN) return false
    try {
      ws.value.send(JSON.stringify(message))
      return true
    } catch (error) {
      console.error('Failed to send message:', error)
      return false
    }
  }

  function joinRoom(roomId: string, userName?: string) {
    if (!isConnected.value) return false
    currentRoomId.value = roomId
    if (userName) username.value = userName
    room_mates.value = {}
    return sendMessage({
      type: SignalingMessage.type.JOIN,
      room: roomId,
      username: userName || undefined,
      payload: { room_mates: room_mates.value },
    })
  }

  function leaveRoom() {
    if (!currentRoomId.value) return false
    const success = sendMessage({
      type: SignalingMessage.type.LEAVE,
      room: currentRoomId.value,
    })
    if (success) {
      currentRoomId.value = null
      room_mates.value = {}
      connectedPeers.value.clear()
      const roomStore = useRoomStore()
      roomStore.setParticipants([])
      roomStore.setRoommates([])
    }
    return success
  }

  function sendOffer(to: string, sdp: RTCSessionDescriptionInit) {
    if (!currentRoomId.value) return false
    return sendMessage({
      type: SignalingMessage.type.OFFER,
      room: currentRoomId.value,
      to,
      payload: { sdp: sdp.sdp || '', type: SignalingMessage.type.OFFER },
    })
  }

  function sendAnswer(to: string, sdp: RTCSessionDescriptionInit) {
    if (!currentRoomId.value) return false
    return sendMessage({
      type: SignalingMessage.type.ANSWER,
      room: currentRoomId.value,
      to,
      payload: { sdp: sdp.sdp || '', type: SignalingMessage.type.ANSWER },
    })
  }

  function sendIceCandidate(to: string, candidate: RTCIceCandidateInit) {
    if (!currentRoomId.value) return false
    return sendMessage({
      type: SignalingMessage.type.ICE,
      room: currentRoomId.value,
      to,
      payload: {
        candidate: candidate.candidate || '',
        sdpMid: candidate.sdpMid || undefined,
        sdpMLineIndex: candidate.sdpMLineIndex || undefined,
      },
    })
  }

  function handleMessage(message: SignalingMessage) {
    switch (message.type) {
      case SignalingMessage.type.JOINED:
        clientId.value = message.from || null
        username.value = message.username || username.value
        if (message.payload && 'room_mates' in message.payload) {
          room_mates.value = (message.payload as { room_mates: Record<string, string> }).room_mates
        } else {
          room_mates.value = {}
        }
        {
          const roomStore = useRoomStore()
          if (currentRoomId.value) roomStore.getRoomParticipants(currentRoomId.value)
          roomStore.getListChannels()
        }
        break

      case SignalingMessage.type.PEER_JOINED:
        if (message.from && message.username) {
          connectedPeers.value.set(message.from, message.username || 'Anonymous')
          room_mates.value[message.from] = message.username || 'Anonymous'
          const roomStore = useRoomStore()
          if (currentRoomId.value) roomStore.getRoomParticipants(currentRoomId.value)
        }
        useRoomStore().getListChannels()
        break

      case SignalingMessage.type.LEAVE:
        if (message.from) {
          connectedPeers.value.delete(message.from)
          delete room_mates.value[message.from]
          const roomStore = useRoomStore()
          if (currentRoomId.value) roomStore.getRoomParticipants(currentRoomId.value)
          useRoomStore().getListChannels()
        }
        break
    }

    const handlers = messageHandlers.value.get(message.type)
    if (handlers) handlers.forEach((handler) => handler(message))
    const allHandlers = messageHandlers.value.get('*')
    if (allHandlers) allHandlers.forEach((handler) => handler(message))
  }

  function sendEvent(eventType: string, payload?: any) {
    if (!currentRoomId.value) return false
    return sendMessage({
      type: eventType as any,
      room: currentRoomId.value,
      payload: payload,
    })
  }

  function onMessage(messageType: string, handler: (message: SignalingMessage) => void) {
    if (!messageHandlers.value.has(messageType)) {
      messageHandlers.value.set(messageType, [])
    }
    messageHandlers.value.get(messageType)!.push(handler)
    return () => {
      const handlers = messageHandlers.value.get(messageType)
      if (handlers) {
        const index = handlers.indexOf(handler)
        if (index > -1) handlers.splice(index, 1)
      }
    }
  }

  function clearHandlers() {
    messageHandlers.value.clear()
  }

  return {
    connectionState,
    clientId,
    currentRoomId,
    connectedPeers,
    room_mates,
    isConnected,
    isInRoom,
    connect,
    disconnect,
    sendEvent,
    joinRoom,
    leaveRoom,
    sendOffer,
    sendAnswer,
    sendIceCandidate,
    onMessage,
    clearHandlers,
  }
})
