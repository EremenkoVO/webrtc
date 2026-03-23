import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useCallStore = defineStore('call', () => {
  const isInCall = ref(false)
  const disconnectRequested = ref(false)
  const pendingAutoJoin = ref(false)
  const audioEnabled = ref(true)
  const isDeafened = ref(false)
  const toggleMicRequested = ref(false)
  const toggleDeafenRequested = ref(false)
  const currentMicrophoneDeviceId = ref<string | null>(null)
  const pendingMicrophoneDeviceId = ref<string | null>(null)

  const videoEnabled = ref(false)
  const toggleVideoRequested = ref(false)
  const currentCameraDeviceId = ref<string | null>(null)
  const pendingCameraDeviceId = ref<string | null>(null)

  const isScreenSharing = ref(false)
  const screenShareStartRequested = ref(false)
  const screenShareStopRequested = ref(false)

  function setStateCall(state: boolean) {
    isInCall.value = state
  }
  function requestDisconnect() {
    if (isInCall.value) disconnectRequested.value = true
  }
  function clearDisconnectRequest() {
    disconnectRequested.value = false
  }
  function requestAutoJoin() {
    pendingAutoJoin.value = true
  }
  function clearAutoJoin() {
    pendingAutoJoin.value = false
  }
  function setAudioEnabled(v: boolean) {
    audioEnabled.value = v
  }
  function setDeafened(v: boolean) {
    isDeafened.value = v
  }
  function requestToggleMic() {
    if (isInCall.value) toggleMicRequested.value = true
  }
  function clearToggleMicRequest() {
    toggleMicRequested.value = false
  }
  function requestToggleDeafen() {
    if (isInCall.value) toggleDeafenRequested.value = true
  }
  function clearToggleDeafenRequest() {
    toggleDeafenRequested.value = false
  }
  function setCurrentMicrophoneDeviceId(id: string | null) {
    currentMicrophoneDeviceId.value = id
  }
  function requestSelectMicrophone(deviceId: string) {
    if (isInCall.value) pendingMicrophoneDeviceId.value = deviceId
  }
  function clearMicrophoneDeviceRequest() {
    pendingMicrophoneDeviceId.value = null
  }

  function setVideoEnabled(v: boolean) {
    videoEnabled.value = v
  }
  function requestToggleVideo() {
    if (isInCall.value) toggleVideoRequested.value = true
  }
  function clearToggleVideoRequest() {
    toggleVideoRequested.value = false
  }
  function setCurrentCameraDeviceId(id: string | null) {
    currentCameraDeviceId.value = id
  }
  function requestSelectCamera(deviceId: string) {
    if (isInCall.value) pendingCameraDeviceId.value = deviceId
  }
  function clearCameraDeviceRequest() {
    pendingCameraDeviceId.value = null
  }

  function setScreenSharing(v: boolean) {
    isScreenSharing.value = v
  }
  function requestScreenShare() {
    if (isInCall.value && !isScreenSharing.value) screenShareStartRequested.value = true
  }
  function clearScreenShareStartRequest() {
    screenShareStartRequested.value = false
  }
  function requestStopScreenShare() {
    if (isInCall.value && isScreenSharing.value) screenShareStopRequested.value = true
  }
  function clearScreenShareStopRequest() {
    screenShareStopRequested.value = false
  }

  return {
    isInCall,
    disconnectRequested,
    pendingAutoJoin,
    audioEnabled,
    isDeafened,
    toggleMicRequested,
    toggleDeafenRequested,
    currentMicrophoneDeviceId,
    pendingMicrophoneDeviceId,
    videoEnabled,
    toggleVideoRequested,
    currentCameraDeviceId,
    pendingCameraDeviceId,
    isScreenSharing,
    screenShareStartRequested,
    screenShareStopRequested,
    setStateCall,
    requestDisconnect,
    clearDisconnectRequest,
    requestAutoJoin,
    clearAutoJoin,
    setAudioEnabled,
    setDeafened,
    requestToggleMic,
    clearToggleMicRequest,
    requestToggleDeafen,
    clearToggleDeafenRequest,
    setCurrentMicrophoneDeviceId,
    requestSelectMicrophone,
    clearMicrophoneDeviceRequest,
    setVideoEnabled,
    requestToggleVideo,
    clearToggleVideoRequest,
    setCurrentCameraDeviceId,
    requestSelectCamera,
    clearCameraDeviceRequest,
    setScreenSharing,
    requestScreenShare,
    clearScreenShareStartRequest,
    requestStopScreenShare,
    clearScreenShareStopRequest,
  }
})
