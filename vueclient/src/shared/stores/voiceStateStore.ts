import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useVoiceStateStore = defineStore('voiceState', () => {
  // userId -> is speaking
  const speakingUsers = ref<Record<string, boolean>>({})
  // userId -> is mic muted
  const mutedUsers = ref<Record<string, boolean>>({})
  // userId -> is screen sharing
  const screenSharingUsers = ref<Record<string, boolean>>({})
  // userId -> is deafened
  const deafenedUsers = ref<Record<string, boolean>>({})
  // userId -> is connecting
  const connectingUsers = ref<Record<string, boolean>>({})
  // userId -> {volume, muted} — sidebar-controlled per-peer playback
  const peerVolumeSettings = ref<Record<string, { volume: number; muted: boolean }>>({})
  // userId -> MediaStream (screen share preview, set by ChannelView)
  const screenShareStreams = ref<Record<string, MediaStream | null>>({})
  // sidebar requests ChannelView to watchStream for this userId
  const watchRequest = ref<string | null>(null)
  // sidebar requests ChannelView to unwatchStream for this userId
  const unwatchRequest = ref<string | null>(null)
  // whether the local user has deafened themselves
  const isLocalDeafened = ref(false)
  // userIds whose streams are currently being watched (set by ChannelView)
  const watchingUserIds = ref<Set<string>>(new Set())
  const watchingUsernames = watchingUserIds

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

  function isSpeaking(userId: string): boolean {
    return speakingUsers.value[userId] || false
  }

  function isMuted(userId: string): boolean {
    return mutedUsers.value[userId] || false
  }

  function isScreenSharing(userId: string): boolean {
    return screenSharingUsers.value[userId] || false
  }

  function isDeafened(userId: string): boolean {
    return deafenedUsers.value[userId] || false
  }

  function isConnecting(userId: string): boolean {
    return connectingUsers.value[userId] || false
  }

  function setPeerVolume(userId: string, volume: number) {
    const prev = peerVolumeSettings.value[userId]
    peerVolumeSettings.value = {
      ...peerVolumeSettings.value,
      [userId]: { volume, muted: prev?.muted ?? false },
    }
  }

  function setPeerMuted(userId: string, muted: boolean) {
    const prev = peerVolumeSettings.value[userId]
    peerVolumeSettings.value = {
      ...peerVolumeSettings.value,
      [userId]: { volume: prev?.volume ?? 1, muted },
    }
  }

  function setScreenShareStream(userId: string, stream: MediaStream | null) {
    screenShareStreams.value = { ...screenShareStreams.value, [userId]: stream }
  }

  function requestWatch(userId: string) {
    watchRequest.value = userId
  }

  function requestUnwatch(userId: string) {
    unwatchRequest.value = userId
  }

  function setLocalDeafened(v: boolean) {
    isLocalDeafened.value = v
  }

  function setWatchingUserIds(userIds: Set<string>) {
    watchingUserIds.value = new Set(userIds)
  }

  function setWatchingUsernames(userIds: Set<string>) {
    setWatchingUserIds(userIds)
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
    watchingUserIds.value = new Set()
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
    watchingUserIds,
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
    setWatchingUserIds,
    setWatchingUsernames,
    setLocalDeafened,
    clear,
  }
})
