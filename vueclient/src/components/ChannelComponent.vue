<script setup lang="ts">
import { SignalingService, type ErrorResponse, type RoomJoinResponse } from '@/api'
import connectSound from '@/assets/sound/connect.wav'
import { useWebRTC } from '@/composible/useWebRTC'
import { useCallStore } from '@/stores/callStore'
import { useRoomStore } from '@/stores/roomStore'
import { useSignalingStore } from '@/stores/signalingStore'
import { faVideo } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import { computed, onMounted, ref, watch } from 'vue'
import BadgeComponent from './BadgeComponent.vue'
import ChannelControls from './ChannelControls.vue'
import VideoTile from './VideoTile.vue'

const props = defineProps<{
  userName: string | undefined
}>()

const roomStore = useRoomStore()
const signalingStore = useSignalingStore()
const callStore = useCallStore()

const {
  localStream,
  remotePeers,
  peerStates,
  videoDevices,
  fetchVideoDevices,
  fetchAudioDevices,
  stopMedia,
  switchMicrophone,
  isScreenSharing,
  startScreenShare,
  stopScreenShare,
  joinRoomWithMedia,
  speakingPeers,
  isLocalSpeaking,
  switchCamera,
  toggleMedia,
  leaveRoom,
} = useWebRTC()

const videoEnabled = ref(false)
const audioEnabled = ref(true)
const audioElement = ref<HTMLAudioElement | null>(null)
const soundUrl = connectSound
const totalPeers = computed(() => 1 + remotePeers.value.length)
const currentCameraDeviceId = ref<string | null>(null)
const currentMicrophoneDeviceId = ref<string | null>(null)
const videoStreamIndex = ref<number>(0)

// динамический класс ширины
const videoTileClass = computed(() => {
  const base =
    'relative bg-slate-800 border border-slate-700 rounded-lg overflow-hidden aspect-video transition-all duration-300'
  if (totalPeers.value <= 2) return base + ' w-full sm:w-[70%] md:w-[60%] max-w-[700px]'
  if (totalPeers.value <= 4) return base + ' w-full sm:w-[48%] md:w-[45%] max-w-[500px]'
  if (totalPeers.value <= 6) return base + ' w-full sm:w-[31%] md:w-[30%] max-w-[400px]'
  return base + ' w-full sm:w-[23%] md:w-[22%] max-w-[320px]'
})

function selectCamera(deviceId: string) {
  currentCameraDeviceId.value = deviceId
  videoEnabled.value = true
  if (callStore.isInCall) {
    switchCamera(deviceId)
  }

  toggleMedia(videoEnabled.value, audioEnabled.value, deviceId)
}

function selectMicrophone(deviceId: string) {
  currentMicrophoneDeviceId.value = deviceId
  if (callStore.isInCall) {
    switchMicrophone(deviceId)
  }
}

function toggleVideo() {
  if (!currentCameraDeviceId.value && localStream.value && !videoEnabled.value) {
    selectCamera(videoDevices.value[0]?.deviceId || '')
    videoEnabled.value = true
  } else if (currentCameraDeviceId.value && localStream.value && !videoEnabled.value) {
    selectCamera(currentCameraDeviceId.value)
    videoEnabled.value = true
  } else if (videoEnabled.value && localStream.value) {
    // Disable video
    localStream.value.getVideoTracks().forEach((track) => track.stop())
    localStream.value.removeTrack(localStream.value.getVideoTracks()[0])
    videoEnabled.value = false
  }

  toggleMedia(videoEnabled.value, audioEnabled.value, currentCameraDeviceId.value || '')
}

async function toggleMicrophone() {
  if (localStream.value) {
    const audioTrack = localStream.value.getAudioTracks()[0]
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled
      audioEnabled.value = audioTrack.enabled
    }
  }

  toggleMedia(videoEnabled.value, audioEnabled.value, currentCameraDeviceId.value || '')
}

// Start call
async function startCall() {
  if (!roomStore.selectedChannelId) {
    console.error('No channel selected')
    return
  }

  await connectToRoom(roomStore.selectedChannelId)

  try {
    await joinRoomWithMedia(roomStore.selectedChannelId, props.userName, {
      video: videoEnabled.value,
      audio: audioEnabled.value
        ? { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        : false,
    }).then(() => {
      callStore.setStateCall(true)
      roomStore.getListChannels()
    })
  } catch (error) {
    console.error('Failed to start call:', error)
    alert('Не удалось начать звонок. Проверьте разрешения на камеру и микрофон.')
  }
}

// End call
function endCall() {
  leaveRoom()
  stopMedia()
  roomStore.getListChannels()
  videoEnabled.value = false
  audioEnabled.value = true
  callStore.setStateCall(false)
}

function isErrorResponse(response: RoomJoinResponse | ErrorResponse): response is ErrorResponse {
  return 'error' in response
}

async function connectToRoom(id: string | undefined) {
  if (typeof id === 'undefined') return

  try {
    const response = await SignalingService.joinRoom(id)

    if (isErrorResponse(response)) {
      throw response
    }

    if (response.client_id && response.room_id) {
      await roomStore.setClientAndRoomId(response.client_id, id)

      // Join the signaling room via WebSocket
      if (!signalingStore.isConnected) {
        signalingStore.connect()
        // Wait for connection to establish
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }

      signalingStore.joinRoom(id)
      console.log('Connected to room:', id)
    }
  } catch (e) {
    console.error(e)
    return
  }
}

// Watch for channel changes and leave current call
watch(
  () => roomStore.selectedChannelId,
  (newId, oldId) => {
    if (oldId && newId !== oldId && callStore.isInCall) {
      endCall()
    }
  },
)

watch(
  () => callStore.isInCall,
  (inCall) => {
    if (inCall) {
      const audio = audioElement.value
      if (audio) {
        audio.play().catch((error) => {
          console.error('Error playing audio:', error)
        })
      }
    }
  },
)

watch(
  () => remotePeers.value.length,
  (newLength, oldLength) => {
    if (newLength > oldLength) {
      const audio = audioElement.value
      if (audio) {
        audio.play().catch((error) => {
          console.error('Error playing audio:', error)
        })
      }
    }
  },
)

watch(
  () => remotePeers.value,
  (newStream) => {
    Array.from(newStream.values()).forEach((peer) => {
      console.log('Remote stream changed:', peer?.remoteStream?.getVideoTracks())
    })
  },
  { deep: true },
)

onMounted(() => {
  fetchVideoDevices()
  fetchAudioDevices()
})
</script>

<template>
  <div
    v-if="roomStore.selectedChannelId"
    class="flex flex-col h-full bg-gradient-to-b from-slate-900 to-slate-950 text-white"
  >
    <!-- Header -->
    <div class="p-4 border-b border-slate-800">
      <h1 class="text-xl font-semibold">Канал: {{ roomStore.selectedChannelName }}</h1>
      <div class="flex items-center gap-2 mt-2">
        <div
          :class="[
            'w-2 h-2 rounded-full',
            signalingStore.isConnected ? 'bg-green-500' : 'bg-red-500',
          ]"
        ></div>
        <span class="text-sm">
          {{ signalingStore.isConnected ? 'Сервер подключен' : 'Сервер отключен' }}
        </span>
      </div>
    </div>

    <audio ref="audioElement" :src="soundUrl"></audio>

    <!-- Video Grid -->
    <div class="flex-1 p-4 overflow-auto">
      <!-- Если не в звонке -->
      <div v-if="!callStore.isInCall" class="flex items-center justify-center h-full">
        <div class="text-center">
          <div v-if="roomStore.roommates.length">
            <p class="text-slate-400 mb-4">Список подключенных участников</p>
            <ul class="text-slate-400 mb-4">
              <li v-for="(user, index) in roomStore.roommates" :key="index">{{ user }}</li>
            </ul>
          </div>
          <div v-else>
            <p class="text-slate-400 mb-4">Нет подключенных участников</p>
          </div>

          <p class="text-slate-400 mb-4">Вы не в звонке</p>
          <button
            type="button"
            class="px-6 py-3 rounded-lg bg-green-600 hover:bg-green-700 text-white font-semibold transition-colors"
            @click="startCall"
            :disabled="!roomStore.selectedChannelId"
          >
            <FontAwesomeIcon :icon="faVideo" class="mr-2" />
            Начать звонок
          </button>
        </div>
      </div>

      <!-- Если в звонке -->
      <div
        v-else
        class="flex flex-wrap justify-center items-center gap-4 h-full content-center transition-all duration-300"
      >
        <!-- Локальное видео -->
        <div
          v-if="localStream"
          :class="[videoTileClass]"
          class="relative bg-slate-800 border border-slate-700 rounded-lg overflow-hidden aspect-video transition-all duration-300"
        >
          <VideoTile
            :condition-video="localStream?.getVideoTracks().length > 0"
            :condition-audio="localStream?.getAudioTracks().length > 0"
            :stream="localStream"
            :key-id="localStream.id"
            :muted="true"
          />
          <BadgeComponent
            :condition-show="!audioEnabled"
            :name="`Вы (${props.userName})`"
            :speaking="isLocalSpeaking"
          />
        </div>

        <!-- Видео собеседников -->
        <div v-for="peer in remotePeers" :key="peer.peerId" :class="[videoTileClass]">
          <VideoTile
            :condition-video="peer.remoteStream?.getVideoTracks().length"
            :condition-audio="peer.remoteStream?.getAudioTracks().length"
            :stream="peer.remoteStream"
            :key-id="peer.peerId"
            :muted="false"
          />
          <BadgeComponent
            :condition-show="peerStates[peer.peerId] && !peerStates[peer.peerId]?.microphone"
            :name="peer.room_mates?.[peer.peerId] || peer.peerId"
            :speaking="speakingPeers[peer.peerId]"
          />
        </div>
      </div>
    </div>

    <!-- Call Controls -->
    <ChannelControls
      v-if="callStore.isInCall"
      :local-stream="localStream"
      :remote-peers="remotePeers"
      :videoEnabled="videoEnabled"
      :audioEnabled="audioEnabled"
      :videoStreamIndex="videoStreamIndex"
      :currentCameraDeviceId="currentCameraDeviceId"
      :currentMicrophoneDeviceId="currentMicrophoneDeviceId"
      :isScreenSharing="isScreenSharing"
      :startScreenShare="startScreenShare"
      :stopScreenShare="stopScreenShare"
      @endCall="endCall"
      @update:toggleVideo="toggleVideo"
      @update:toggleMicrophone="toggleMicrophone"
      @update:videoEnabled="(value: boolean) => (videoEnabled = value)"
      @update:audioEnabled="(value: boolean) => (audioEnabled = value)"
      @update:selectCamera="selectCamera"
      @update:selectMicrophone="selectMicrophone"
      @update:videoStreamIndex="(value: number) => (videoStreamIndex = value)"
    />
  </div>
</template>
