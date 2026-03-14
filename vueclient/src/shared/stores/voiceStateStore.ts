import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useVoiceStateStore = defineStore('voiceState', () => {
  // username -> is speaking
  const speakingUsers = ref<Record<string, boolean>>({})
  // username -> is mic muted
  const mutedUsers = ref<Record<string, boolean>>({})
  // username -> is screen sharing
  const screenSharingUsers = ref<Record<string, boolean>>({})
  // username -> is deafened
  const deafenedUsers = ref<Record<string, boolean>>({})
  // username -> is connecting
  const connectingUsers = ref<Record<string, boolean>>({})
  // username -> {volume, muted} — sidebar-controlled per-peer playback
  const peerVolumeSettings = ref<Record<string, { volume: number; muted: boolean }>>({})
  // username -> MediaStream (screen share preview, set by ChannelView)
  const screenShareStreams = ref<Record<string, MediaStream | null>>({})
  // sidebar requests ChannelView to watchStream for this username
  const watchRequest = ref<string | null>(null)
  // sidebar requests ChannelView to unwatchStream for this username
  const unwatchRequest = ref<string | null>(null)
  // whether the local user has deafened themselves
  const isLocalDeafened = ref(false)
  // usernames whose streams are currently being watched (set by ChannelView)
  const watchingUsernames = ref<Set<string>>(new Set())

  function updateSpeaking(states: Record<string, boolean>) {
    speakingUsers.value = { ...states }
  }

  function updateMuted(states: Record<string, boolean>) {
    mutedUsers.value = { ...states }
  }

  function updateScreenSharing(states: Record<string, boolean>) {
    screenSharingUsers.value = { ...states }
  }

  function updateDeafened(states: Record<string, boolean>) {
    deafenedUsers.value = { ...states }
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

  function isDeafened(username: string): boolean {
    return deafenedUsers.value[username] || false
  }

  function isConnecting(username: string): boolean {
    return connectingUsers.value[username] || false
  }

  function setPeerVolume(username: string, volume: number) {
    const prev = peerVolumeSettings.value[username]
    peerVolumeSettings.value = {
      ...peerVolumeSettings.value,
      [username]: { volume, muted: prev?.muted ?? false },
    }
  }

  function setPeerMuted(username: string, muted: boolean) {
    const prev = peerVolumeSettings.value[username]
    peerVolumeSettings.value = {
      ...peerVolumeSettings.value,
      [username]: { volume: prev?.volume ?? 1, muted },
    }
  }

  function setScreenShareStream(username: string, stream: MediaStream | null) {
    screenShareStreams.value = { ...screenShareStreams.value, [username]: stream }
  }

  function requestWatch(username: string) {
    watchRequest.value = username
  }

  function requestUnwatch(username: string) {
    unwatchRequest.value = username
  }

  function setLocalDeafened(v: boolean) {
    isLocalDeafened.value = v
  }

  function setWatchingUsernames(usernames: Set<string>) {
    watchingUsernames.value = new Set(usernames)
  }

  function clear() {
    speakingUsers.value = {}
    mutedUsers.value = {}
    screenSharingUsers.value = {}
    deafenedUsers.value = {}
    connectingUsers.value = {}
    peerVolumeSettings.value = {}
    screenShareStreams.value = {}
    watchRequest.value = null
    unwatchRequest.value = null
    watchingUsernames.value = new Set()
    isLocalDeafened.value = false
  }

  return {
    speakingUsers,
    mutedUsers,
    screenSharingUsers,
    peerVolumeSettings,
    screenShareStreams,
    watchRequest,
    unwatchRequest,
    watchingUsernames,
    updateSpeaking,
    updateMuted,
    updateScreenSharing,
    updateDeafened,
    updateConnecting,
    isDeafened,
    isSpeaking,
    isMuted,
    isScreenSharing,
    isConnecting,
    setPeerVolume,
    setPeerMuted,
    setScreenShareStream,
    isLocalDeafened,
    requestWatch,
    requestUnwatch,
    setWatchingUsernames,
    setLocalDeafened,
    clear,
  }
})
