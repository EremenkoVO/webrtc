import { create } from 'zustand'
import { OpenAPI, getWsBaseUrl } from '@/api/core/OpenAPI'
import type { SignalingMessage } from '@/api'
import { SignalingMessageType } from '@/api'
import { useRoomStore } from './roomStore'

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting'

type SignalingState = {
  ws: WebSocket | null
  connectionState: ConnectionState
  clientId: string | null
  username: string | null
  room_mates: Record<string, string>
  currentRoomId: string | null
  connectedPeers: Map<string, string>
  reconnectAttempts: number
  messageHandlers: Map<string, Array<(message: SignalingMessage) => void>>
  isConnected: () => boolean
  isInRoom: () => boolean
  connect: () => void
  disconnect: () => void
  sendMessage: (message: SignalingMessage) => boolean
  joinRoom: (roomId: string, userName?: string) => boolean
  leaveRoom: () => boolean
  sendOffer: (to: string, sdp: RTCSessionDescriptionInit) => boolean
  sendAnswer: (to: string, sdp: RTCSessionDescriptionInit) => boolean
  sendIceCandidate: (to: string, candidate: RTCIceCandidateInit) => boolean
  onMessage: (messageType: string, handler: (message: SignalingMessage) => void) => () => void
  clearHandlers: () => void
  handleMessage: (message: SignalingMessage) => void
}

const maxReconnectAttempts = 5

export const useSignalingStore = create<SignalingState>((set, get) => {
  const handleMessage = (message: SignalingMessage) => {
    const state = get()
    console.log('Signaling message:', message)
    switch (message.type) {
      case SignalingMessageType.JOINED:
        set({
          clientId: message.from ?? null,
          username: message.username ?? state.username,
          room_mates:
            message.payload && 'room_mates' in message.payload
              ? (message.payload as { room_mates: Record<string, string> }).room_mates
              : {},
        })
        if (state.currentRoomId) {
          useRoomStore.getState().getRoomParticipants(state.currentRoomId)
        }
        useRoomStore.getState().getListChannels()
        break
      case SignalingMessageType.PEER_JOINED:
        if (message.from) {
          const peers = new Map(state.connectedPeers)
          peers.set(message.from, message.username || 'Anonymous')
          const room_mates = { ...state.room_mates, [message.from]: message.username || 'Anonymous' }
          set({ connectedPeers: peers, room_mates })
          if (state.currentRoomId) {
            useRoomStore.getState().getRoomParticipants(state.currentRoomId)
          }
        }
        useRoomStore.getState().getListChannels()
        break
      case SignalingMessageType.LEAVE:
        if (message.from) {
          const peers = new Map(state.connectedPeers)
          peers.delete(message.from)
          const room_mates = { ...state.room_mates }
          delete room_mates[message.from]
          set({ connectedPeers: peers, room_mates })
          if (state.currentRoomId) {
            useRoomStore.getState().getRoomParticipants(state.currentRoomId)
          }
        }
        useRoomStore.getState().getListChannels()
        break
    }
    const handlers = state.messageHandlers.get(message.type)
    if (handlers) handlers.forEach((h) => h(message))
    const allHandlers = state.messageHandlers.get('*')
    if (allHandlers) allHandlers.forEach((h) => h(message))
  }

  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null

  const connect = () => {
    const state = get()
    if (state.ws?.readyState === WebSocket.OPEN) return
    set({ connectionState: 'connecting' })
    try {
      const baseUrl = getWsBaseUrl()
      const wsUrl = `${baseUrl}/api/v1/ws`
      const token =
        (typeof OpenAPI.TOKEN === 'string' ? OpenAPI.TOKEN : null) ||
        (typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null) ||
        ''
      const url = token ? `${wsUrl}?token=${encodeURIComponent(token)}` : wsUrl
      const ws = new WebSocket(url)
      ws.onopen = () => set({ connectionState: 'connected', reconnectAttempts: 0 })
      ws.onmessage = (e) => {
        try {
          handleMessage(JSON.parse(e.data) as SignalingMessage)
        } catch (err) {
          console.error('Parse WS message', err)
        }
      }
      ws.onerror = (err) => console.error('WS error', err)
      ws.onclose = () => {
        set({ connectionState: 'disconnected', ws: null })
        const s = get()
        if (s.currentRoomId && s.reconnectAttempts < maxReconnectAttempts) {
          reconnectTimeout = setTimeout(() => {
            set((x) => ({ reconnectAttempts: x.reconnectAttempts + 1 }))
            connect()
          }, Math.min(1000 * 2 ** get().reconnectAttempts, 30000))
        }
      }
      set({ ws })
    } catch (err) {
      console.error('WS connect', err)
      set({ connectionState: 'disconnected' })
    }
  }

  const disconnect = () => {
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout)
      reconnectTimeout = null
    }
    const state = get()
    if (state.ws) {
      state.ws.close()
    }
    set({
      ws: null,
      connectionState: 'disconnected',
      currentRoomId: null,
      clientId: null,
      username: null,
      room_mates: {},
      connectedPeers: new Map(),
      reconnectAttempts: 0,
    })
    useRoomStore.getState().setParticipants([])
    useRoomStore.getState().setRoommates([])
  }

  const sendMessage = (message: SignalingMessage): boolean => {
    const ws = get().ws
    if (!ws || ws.readyState !== WebSocket.OPEN) return false
    try {
      ws.send(JSON.stringify(message))
      return true
    } catch (e) {
      console.error('Send message', e)
      return false
    }
  }

  const joinRoom = (roomId: string, userName?: string): boolean => {
    const ws = get().ws
    if (!ws || ws.readyState !== WebSocket.OPEN) return false
    const state = get()
    const room_mates = state.clientId && state.username
      ? { ...state.room_mates, [state.clientId]: state.username }
      : state.room_mates
    set({ currentRoomId: roomId, username: userName ?? state.username, room_mates })
    return sendMessage({
      type: SignalingMessageType.JOIN,
      room: roomId,
      username: userName,
      payload: { room_mates },
    })
  }

  const leaveRoom = (): boolean => {
    const state = get()
    if (!state.currentRoomId) return false
    const ok = sendMessage({ type: SignalingMessageType.LEAVE, room: state.currentRoomId })
    if (ok) {
      set({
        currentRoomId: null,
        room_mates: {},
        connectedPeers: new Map(),
      })
      useRoomStore.getState().setParticipants([])
      useRoomStore.getState().setRoommates([])
    }
    return ok
  }

  const sendOffer = (to: string, sdp: RTCSessionDescriptionInit): boolean => {
    const room = get().currentRoomId
    if (!room) return false
    return sendMessage({
      type: SignalingMessageType.OFFER,
      room,
      to,
      payload: { sdp: sdp.sdp || '', type: SignalingMessageType.OFFER },
    })
  }

  const sendAnswer = (to: string, sdp: RTCSessionDescriptionInit): boolean => {
    const room = get().currentRoomId
    if (!room) return false
    return sendMessage({
      type: SignalingMessageType.ANSWER,
      room,
      to,
      payload: { sdp: sdp.sdp || '', type: SignalingMessageType.ANSWER },
    })
  }

  const sendIceCandidate = (to: string, candidate: RTCIceCandidateInit): boolean => {
    const room = get().currentRoomId
    if (!room) return false
    return sendMessage({
      type: SignalingMessageType.ICE,
      room,
      to,
      payload: {
        candidate: candidate.candidate || '',
        sdpMid: candidate.sdpMid ?? undefined,
        sdpMLineIndex: candidate.sdpMLineIndex ?? undefined,
      },
    })
  }

  const onMessage = (messageType: string, handler: (message: SignalingMessage) => void): (() => void) => {
    const handlers = new Map(get().messageHandlers)
    const list = handlers.get(messageType) || []
    list.push(handler)
    handlers.set(messageType, list)
    set({ messageHandlers: handlers })
    return () => {
      const h = get().messageHandlers.get(messageType)
      if (h) {
        const idx = h.indexOf(handler)
        if (idx > -1) h.splice(idx, 1)
      }
    }
  }

  const clearHandlers = () => set({ messageHandlers: new Map() })

  return {
    ws: null,
    connectionState: 'disconnected',
    clientId: null,
    username: null,
    room_mates: {},
    currentRoomId: null,
    connectedPeers: new Map(),
    reconnectAttempts: 0,
    messageHandlers: new Map(),
    isConnected: () => get().connectionState === 'connected',
    isInRoom: () => get().currentRoomId !== null,
    connect,
    disconnect,
    sendMessage,
    joinRoom,
    leaveRoom,
    sendOffer,
    sendAnswer,
    sendIceCandidate,
    onMessage,
    clearHandlers,
    handleMessage,
  }
})
