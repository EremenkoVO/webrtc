import { defineStore } from 'pinia'

export const useRoomStore = defineStore('room', {
  state: () => ({
    roomId: '' as string,
    clientId: '' as string,
  }),
  actions: {
    setClientAndRoomId(clientId: string, roomId: string) {
      this.roomId = roomId
      this.clientId = clientId
    },
  },
})
