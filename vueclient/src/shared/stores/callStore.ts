import { defineStore } from 'pinia'

export const useCallStore = defineStore('call', {
  state: () => ({
    isInCall: false,
    disconnectRequested: false,
  }),
  actions: {
    setStateCall(state: boolean) {
      this.isInCall = state
    },
    requestDisconnect() {
      if (this.isInCall) {
        this.disconnectRequested = true
      }
    },
    clearDisconnectRequest() {
      this.disconnectRequested = false
    },
  },
})
