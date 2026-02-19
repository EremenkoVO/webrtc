import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useVoiceStateStore = defineStore('voiceState', () => {
  // username -> is speaking
  const speakingUsers = ref<Record<string, boolean>>({})
  // username -> is mic muted
  const mutedUsers = ref<Record<string, boolean>>({})
  // username -> is screen sharing
  const screenSharingUsers = ref<Record<string, boolean>>({})
  // username -> is connecting
  const connectingUsers = ref<Record<string, boolean>>({})

  function updateSpeaking(states: Record<string, boolean>) {
    speakingUsers.value = { ...states }
  }

  function updateMuted(states: Record<string, boolean>) {
    mutedUsers.value = { ...states }
  }

  function updateScreenSharing(states: Record<string, boolean>) {
    screenSharingUsers.value = { ...states }
  }

  function updateConnecting(states: Record<string, boolean>) {
    connectingUsers.value = { ...states }
  }

  function isSpeaking(username: string): boolean {
    return speakingUsers.value[username] || false
  }

  function isMuted(username: string): boolean {
    return mutedUsers.value[username] || false
  }

  function isScreenSharing(username: string): boolean {
    return screenSharingUsers.value[username] || false
  }

  function isConnecting(username: string): boolean {
    return connectingUsers.value[username] || false
  }

  function clear() {
    speakingUsers.value = {}
    mutedUsers.value = {}
    screenSharingUsers.value = {}
    connectingUsers.value = {}
  }

  return {
    speakingUsers,
    mutedUsers,
    screenSharingUsers,
    updateSpeaking,
    updateMuted,
    updateScreenSharing,
    updateConnecting,
    isSpeaking,
    isMuted,
    isScreenSharing,
    isConnecting,
    clear,
  }
})
