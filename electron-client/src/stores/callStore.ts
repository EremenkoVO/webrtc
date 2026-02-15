import { create } from 'zustand'

type CallState = {
  isInCall: boolean
  setStateCall: (state: boolean) => void
}

export const useCallStore = create<CallState>((set) => ({
  isInCall: false,
  setStateCall: (state) => set({ isInCall: state }),
}))
