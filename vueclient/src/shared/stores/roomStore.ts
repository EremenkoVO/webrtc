import { SignalingService, type Room, type RoomParticipant } from '@/api'
import { defineStore } from 'pinia'

type ChannelMember = { user_id: string; username: string }

export const useRoomStore = defineStore('room', {
  state: () => ({
    roomId: '' as string,
    clientId: '' as string,
    roommates: [] as string[],
    participants: [] as RoomParticipant[],
    channels: [] as Room[],
    selectedChannelId: '' as string,
    selectedChannelName: '' as string,
  }),
  getters: {
    selectedChannelType: (state): 'voice' | 'text' => {
      const ch = state.channels.find((c) => c.id === state.selectedChannelId)
      return (ch?.type as 'voice' | 'text') ?? 'voice'
    },
  },
  actions: {
    setClientAndRoomId(clientId: string, roomId: string) {
      this.roomId = roomId
      this.clientId = clientId
    },
    async getListChannels() {
      try {
        const response = await SignalingService.listRooms()
        if (Array.isArray(response)) {
          this.channels = response
        } else {
          throw { message: 'Invalid response from server' }
        }
      } catch (e) {
        console.error(e)
      }
    },
    async getRoomParticipants(roomId: string) {
      try {
        const response = await SignalingService.getRoomParticipants(roomId)
        if ('participants' in response && response.participants) {
          this.participants = response.participants
          this.roommates = response.participants
            .map((p) => p.username || p.client_id || '')
            .filter((name) => name !== '')
        } else {
          this.participants = []
          this.roommates = []
        }
      } catch (e) {
        console.error('Error fetching room participants:', e)
        this.participants = []
        this.roommates = []
      }
    },
    channelById(id: string) {
      return this.channels.find((ch) => ch.id === id)
    },
    async selectChannel(id: string | undefined, roommates?: string[]) {
      if (typeof id === 'undefined') return
      if (id === this.selectedChannelId) return

      const channel = this.channels.find((ch) => ch.id == id)

      this.selectedChannelId = id
      this.selectedChannelName = channel?.name || ''
      this.setRoommates(roommates)

      if (id) {
        await this.getRoomParticipants(id)
      }
    },
    setRoommates(roommates: string[] | undefined) {
      this.roommates = roommates || []
    },
    setParticipants(participants: RoomParticipant[]) {
      this.participants = participants
      this.roommates = participants
        .map((p) => p.username || p.client_id || '')
        .filter((name) => name !== '')
    },
    setRealtimeChannelMembers(channelMembers: Record<string, ChannelMember[]>) {
      this.channels = this.channels.map((ch) => {
        const channelId = ch.id || ''
        const members = channelMembers[channelId] || []
        const roommates = members
          .map((m) => m.username)
          .filter((name) => typeof name === 'string' && name.length > 0)
        return {
          ...ch,
          roommates,
        }
      })
    },
    updateRealtimeUserChannel(_userId: string, username: string | undefined, channelId: string) {
      this.channels = this.channels.map((ch) => {
        const chId = ch.id || ''
        const current = Array.isArray(ch.roommates) ? [...ch.roommates] : []

        // Remove user from all channels first.
        const withoutUser = current.filter((name) => name !== username)
        if (!channelId || chId !== channelId || !username) {
          return { ...ch, roommates: withoutUser }
        }
        if (withoutUser.includes(username)) {
          return { ...ch, roommates: withoutUser }
        }
        return { ...ch, roommates: [...withoutUser, username] }
      })
    },
  },
})
