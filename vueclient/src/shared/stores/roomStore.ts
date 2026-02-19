import { SignalingService, type Room, type RoomParticipant } from '@/api'
import { defineStore } from 'pinia'
import { useCallStore } from './callStore'

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
    async selectChannel(id: string | undefined, roommates?: string[]) {
      if (typeof id === 'undefined') return
      if (id === this.selectedChannelId) return

      if (useCallStore().isInCall) {
        const result = confirm('Switch to another channel? Your current call will end.')
        if (!result) return
      }

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
  },
})
