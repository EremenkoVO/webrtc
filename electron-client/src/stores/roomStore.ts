import { create } from 'zustand'
import { SignalingService } from '@/api'
import type { Room, RoomParticipant } from '@/api'
import { useCallStore } from './callStore'

type RoomState = {
  roomId: string
  clientId: string
  roommates: string[]
  participants: RoomParticipant[]
  channels: Room[]
  selectedChannelId: string
  selectedChannelName: string
  setClientAndRoomId: (clientId: string, roomId: string) => void
  getListChannels: () => Promise<void>
  getRoomParticipants: (roomId: string) => Promise<void>
  selectChannel: (id: string | undefined, roommates?: string[]) => Promise<void>
  setRoommates: (roommates: string[] | undefined) => void
  setParticipants: (participants: RoomParticipant[]) => void
}

export const useRoomStore = create<RoomState>((set, get) => ({
  roomId: '',
  clientId: '',
  roommates: [],
  participants: [],
  channels: [],
  selectedChannelId: '',
  selectedChannelName: '',
  setClientAndRoomId: (clientId, roomId) => set({ clientId, roomId }),
  getListChannels: async () => {
    try {
      const response = await SignalingService.listRooms()
      if (Array.isArray(response)) set({ channels: response })
    } catch (e) {
      console.error(e)
    }
  },
  getRoomParticipants: async (roomId: string) => {
    const roomIdStr = String(roomId)
    try {
      const response = await SignalingService.getRoomParticipants(roomIdStr)
      if (response && typeof response === 'object' && 'participants' in response && Array.isArray(response.participants)) {
        const participants = response.participants
        const roommates = participants
          .map((p) => p.username || p.client_id || '')
          .filter((n) => n !== '')
        set({ participants, roommates })
      } else {
        set({ participants: [], roommates: [] })
      }
    } catch (e) {
      console.error('Room participants error', e)
      set({ participants: [], roommates: [] })
    }
  },
  selectChannel: async (id, roommates) => {
    if (id === undefined) return
    const idStr = String(id)
    if (idStr === get().selectedChannelId) return
    if (useCallStore.getState().isInCall) {
      if (!window.confirm('Переключиться на другой канал?')) return
    }
    const channels = get().channels
    const channel = channels.find((ch) => String(ch?.id) === idStr)
    set({
      selectedChannelId: idStr,
      selectedChannelName: channel?.name || '',
      roommates: roommates || [],
    })
    try {
      await get().getRoomParticipants(idStr)
    } catch (e) {
      console.error('getRoomParticipants', e)
      set({ participants: [], roommates: [] })
    }
  },
  setRoommates: (roommates) => set({ roommates: roommates || [] }),
  setParticipants: (participants) => {
    const roommates = participants
      .map((p) => p.username || p.client_id || '')
      .filter((n) => n !== '')
    set({ participants, roommates })
  },
}))
