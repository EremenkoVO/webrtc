import { defineStore } from 'pinia'

export const useCallStore = defineStore('call', {
  state: () => ({
    isInCall: false,
  }),
  actions: {
    setStateCall(state: boolean) {
      this.isInCall = state
    },
  },
})
