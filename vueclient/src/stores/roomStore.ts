import { SignalingService, type Room } from '@/api'
import { defineStore } from 'pinia'
import { useCallStore } from './callStore'

export const useRoomStore = defineStore('room', {
  state: () => ({
    roomId: '' as string,
    clientId: '' as string,
    roommates: [] as string[],
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
        return
      }
    },
    async selectChannel(id: string | undefined, roommates: string[] | undefined) {
      if (typeof id === 'undefined') return
      if (id === this.selectedChannelId) return

      if (useCallStore().isInCall) {
        const result = confirm('Вы уверены, что хотите переключиться на другой канал')

        if (!result) return
      }

      this.selectedChannelId = id
      this.selectedChannelName = roommates?.[0] || ''
      this.setRoommates(roommates)
    },
    setRoommates(roommates: string[] | undefined) {
      this.roommates = roommates || []
    },
  },
})
