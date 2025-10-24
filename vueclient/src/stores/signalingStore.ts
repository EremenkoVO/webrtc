import { OpenAPI } from '@/api/core/OpenAPI'
import { SignalingMessage } from '@/api/models/SignalingMessage'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting'

export const useSignalingStore = defineStore('signaling', () => {
  // State
  const ws = ref<WebSocket | null>(null)
  const connectionState = ref<ConnectionState>('disconnected')
  const clientId = ref<string | null>(null)
  const username = ref<string | null>(null)
  const currentRoomId = ref<string | null>(null)
  const connectedPeers = ref<Set<string>>(new Set())
  const reconnectAttempts = ref(0)
  const maxReconnectAttempts = 5
  const reconnectTimeout = ref<ReturnType<typeof setTimeout> | null>(null)

  // Message handlers
  const messageHandlers = ref<Map<string, Array<(message: SignalingMessage) => void>>>(new Map())

  // Computed
  const isConnected = computed(() => connectionState.value === 'connected')
  const isInRoom = computed(() => currentRoomId.value !== null)

  // Connect to WebSocket
  function connect() {
    if (ws.value && ws.value.readyState === WebSocket.OPEN) {
      console.log('WebSocket already connected')
      return
    }

    connectionState.value = 'connecting'

    try {
      // Convert HTTP base URL to WebSocket URL
      const wsUrl = OpenAPI.BASE.replace(/^http/, 'ws') + '/api/v1/ws'

      // Get token if available
      const token = typeof OpenAPI.TOKEN === 'string' ? OpenAPI.TOKEN : undefined

      // Add token as query parameter if available
      const url = token ? `${wsUrl}?token=${token}` : wsUrl

      ws.value = new WebSocket(url)

      ws.value.onopen = () => {
        console.log('WebSocket connected')
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
        console.log('WebSocket connection closed')
        connectionState.value = 'disconnected'
        ws.value = null

        // Attempt to reconnect if we were in a room
        if (currentRoomId.value && reconnectAttempts.value < maxReconnectAttempts) {
          attemptReconnect()
        }
      }
    } catch (error) {
      console.error('Failed to connect to WebSocket:', error)
      connectionState.value = 'disconnected'
    }
  }

  // Attempt to reconnect
  function attemptReconnect() {
    connectionState.value = 'reconnecting'
    reconnectAttempts.value++

    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.value), 30000)
    console.log(
      `Attempting to reconnect in ${delay}ms (attempt ${reconnectAttempts.value}/${maxReconnectAttempts})`,
    )

    reconnectTimeout.value = setTimeout(() => {
      connect()
      // If connection is successful and we had a room, rejoin it
      if (currentRoomId.value) {
        setTimeout(() => {
          if (isConnected.value) {
            joinRoom(currentRoomId.value!)
          }
        }, 1000)
      }
    }, delay)
  }

  // Disconnect from WebSocket
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
    connectedPeers.value.clear()
    reconnectAttempts.value = 0
  }

  // Send a message through WebSocket
  function sendMessage(message: SignalingMessage) {
    if (!ws.value || ws.value.readyState !== WebSocket.OPEN) {
      console.error('WebSocket is not connected')
      return false
    }

    try {
      ws.value.send(JSON.stringify(message))
      return true
    } catch (error) {
      console.error('Failed to send message:', error)
      return false
    }
  }

  // Join a room
  function joinRoom(roomId: string, userName?: string) {
    if (!isConnected.value) {
      console.error('Cannot join room: WebSocket not connected')
      return false
    }

    currentRoomId.value = roomId
    if (userName) username.value = userName

    const message: SignalingMessage = {
      type: SignalingMessage.type.JOIN,
      room: roomId,
      username: userName || undefined,
    }

    return sendMessage(message)
  }

  // Leave the current room
  function leaveRoom() {
    if (!currentRoomId.value) {
      return false
    }

    const message: SignalingMessage = {
      type: SignalingMessage.type.LEAVE,
      room: currentRoomId.value,
    }

    const success = sendMessage(message)
    if (success) {
      currentRoomId.value = null
      connectedPeers.value.clear()
    }

    return success
  }

  // Send WebRTC offer
  function sendOffer(to: string, sdp: RTCSessionDescriptionInit) {
    if (!currentRoomId.value) {
      console.error('Cannot send offer: not in a room')
      return false
    }

    const message: SignalingMessage = {
      type: SignalingMessage.type.OFFER,
      room: currentRoomId.value,
      to,
      payload: {
        sdp: sdp.sdp || '',
        type: SignalingMessage.type.OFFER,
      },
    }

    return sendMessage(message)
  }

  // Send WebRTC answer
  function sendAnswer(to: string, sdp: RTCSessionDescriptionInit) {
    if (!currentRoomId.value) {
      console.error('Cannot send answer: not in a room')
      return false
    }

    const message: SignalingMessage = {
      type: SignalingMessage.type.ANSWER,
      room: currentRoomId.value,
      to,
      payload: {
        sdp: sdp.sdp || '',
        type: SignalingMessage.type.ANSWER,
      },
    }

    return sendMessage(message)
  }

  // Send ICE candidate
  function sendIceCandidate(to: string, candidate: RTCIceCandidateInit) {
    if (!currentRoomId.value) {
      console.error('Cannot send ICE candidate: not in a room')
      return false
    }

    const message: SignalingMessage = {
      type: SignalingMessage.type.ICE,
      room: currentRoomId.value,
      to,
      payload: {
        candidate: candidate.candidate || '',
        sdpMid: candidate.sdpMid || undefined,
        sdpMLineIndex: candidate.sdpMLineIndex || undefined,
      },
    }

    return sendMessage(message)
  }

  // Handle incoming messages
  function handleMessage(message: SignalingMessage) {
    console.log('Received signaling message:', message)

    switch (message.type) {
      case SignalingMessage.type.JOINED:
        clientId.value = message.from || null
        username.value = message.username || username.value
        console.log('Joined room as', username.value, 'with client ID:', clientId.value)
        break

      case SignalingMessage.type.PEER_JOINED:
        if (message.from) {
          connectedPeers.value.add(message.from)
          console.log('Peer joined:', message.from, 'username:', message?.username)
        }
        break

      case SignalingMessage.type.LEAVE:
        if (message.from) {
          connectedPeers.value.delete(message.from)
          console.log('Peer left:', message.from)
        }
        break
    }

    // Call registered handlers for this message type
    const handlers = messageHandlers.value.get(message.type)
    if (handlers) handlers.forEach((handler) => handler(message))

    const allHandlers = messageHandlers.value.get('*')
    if (allHandlers) allHandlers.forEach((handler) => handler(message))
  }

  // Register a message handler
  function onMessage(messageType: string, handler: (message: SignalingMessage) => void) {
    if (!messageHandlers.value.has(messageType)) {
      messageHandlers.value.set(messageType, [])
    }
    messageHandlers.value.get(messageType)!.push(handler)

    // Return unsubscribe function
    return () => {
      const handlers = messageHandlers.value.get(messageType)
      if (handlers) {
        const index = handlers.indexOf(handler)
        if (index > -1) {
          handlers.splice(index, 1)
        }
      }
    }
  }

  // Clear all message handlers
  function clearHandlers() {
    messageHandlers.value.clear()
  }

  return {
    // State
    connectionState,
    clientId,
    currentRoomId,
    connectedPeers,

    // Computed
    isConnected,
    isInRoom,

    // Actions
    connect,
    disconnect,
    joinRoom,
    leaveRoom,
    sendOffer,
    sendAnswer,
    sendIceCandidate,
    onMessage,
    clearHandlers,
  }
})
