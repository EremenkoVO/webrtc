<script setup lang="ts">
import { useRoomStore } from '@/stores/roomStore'
import { useSignalingStore } from '@/stores/signalingStore'
import { useWebRTC } from '@/composible/useWebRTC'
import { computed, ref, watch } from 'vue'
import { faVideo, faVideoSlash, faMicrophone, faMicrophoneSlash, faPhoneSlash } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'

const props = defineProps<{
  selectedChannelId: string | undefined
}>()

const roomStore = useRoomStore()
const signalingStore = useSignalingStore()
const { localStream, remotePeers, isMediaInitialized, initializeMedia, stopMedia, joinRoomWithMedia, leaveRoom } = useWebRTC()

const clientId = computed(() => roomStore.clientId)
const isInCall = ref(false)
const videoEnabled = ref(true)
const audioEnabled = ref(true)

// Start call
async function startCall() {
  if (!props.selectedChannelId) {
    console.error('No channel selected')
    return
  }

  try {
    await joinRoomWithMedia(props.selectedChannelId, {
      video: videoEnabled.value,
      audio: audioEnabled.value,
    })
    isInCall.value = true
  } catch (error) {
    console.error('Failed to start call:', error)
    alert('Не удалось начать звонок. Проверьте разрешения на камеру и микрофон.')
  }
}

// End call
function endCall() {
  leaveRoom()
  stopMedia()
  isInCall.value = false
}

// Toggle video
function toggleVideo() {
  if (localStream.value) {
    const videoTrack = localStream.value.getVideoTracks()[0]
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled
      videoEnabled.value = videoTrack.enabled
    }
  }
}

// Toggle audio
function toggleAudio() {
  if (localStream.value) {
    const audioTrack = localStream.value.getAudioTracks()[0]
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled
      audioEnabled.value = audioTrack.enabled
    }
  }
}

// Watch for channel changes and leave current call
watch(() => props.selectedChannelId, (newId, oldId) => {
  if (oldId && newId !== oldId && isInCall.value) {
    endCall()
  }
})

// Setup video element refs
function setupVideoElement(el: any, stream: MediaStream | null) {
  if (el && stream && el instanceof HTMLVideoElement) {
    el.srcObject = stream
  }
}
</script>

<template>
  <div class="flex flex-col h-full bg-gradient-to-b from-slate-900 to-slate-950 text-white">
    <!-- Header -->
    <div class="p-4 border-b border-slate-800">
      <h1 class="text-xl font-semibold">Канал: {{ selectedChannelId }}</h1>
      <p v-if="clientId" class="text-sm text-slate-400 mt-1">
        Client ID: {{ signalingStore.clientId || clientId }}
      </p>
      <div class="flex items-center gap-2 mt-2">
        <div
          :class="[
            'w-2 h-2 rounded-full',
            signalingStore.isConnected ? 'bg-green-500' : 'bg-red-500',
          ]"
        ></div>
        <span class="text-sm">
          {{ signalingStore.isConnected ? 'Подключено' : 'Отключено' }}
        </span>
      </div>
    </div>

    <!-- Video Grid -->
    <div class="flex-1 p-4 overflow-auto">
      <div
        v-if="!isInCall"
        class="flex items-center justify-center h-full"
      >
        <div class="text-center">
          <p class="text-slate-400 mb-4">Вы не в звонке</p>
          <button
            type="button"
            class="px-6 py-3 rounded-lg bg-green-600 hover:bg-green-700 text-white font-semibold transition-colors"
            @click="startCall"
            :disabled="!selectedChannelId"
          >
            <FontAwesomeIcon :icon="faVideo" class="mr-2" />
            Начать звонок
          </button>
        </div>
      </div>

      <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 h-full">
        <!-- Local Video -->
        <div class="relative bg-slate-800 rounded-lg overflow-hidden aspect-video">
          <video
            v-if="localStream"
            :ref="(el: any) => setupVideoElement(el, localStream)"
            autoplay
            muted
            playsinline
            class="w-full h-full object-cover"
          ></video>
          <div class="absolute bottom-2 left-2 bg-slate-900/80 px-2 py-1 rounded text-sm">
            Вы ({{ signalingStore.clientId }})
          </div>
        </div>

        <!-- Remote Videos -->
        <div
          v-for="peer in remotePeers"
          :key="peer.peerId"
          class="relative bg-slate-800 rounded-lg overflow-hidden aspect-video"
        >
          <video
            v-if="peer.remoteStream"
            :ref="(el: any) => setupVideoElement(el, peer.remoteStream)"
            autoplay
            playsinline
            class="w-full h-full object-cover"
          ></video>
          <div v-else class="flex items-center justify-center h-full text-slate-400">
            Подключение...
          </div>
          <div class="absolute bottom-2 left-2 bg-slate-900/80 px-2 py-1 rounded text-sm">
            Peer: {{ peer.peerId }}
          </div>
        </div>
      </div>
    </div>

    <!-- Call Controls -->
    <div v-if="isInCall" class="p-4 border-t border-slate-800">
      <div class="flex items-center justify-center gap-4">
        <button
          type="button"
          :class="[
            'p-4 rounded-full transition-colors',
            videoEnabled
              ? 'bg-slate-700 hover:bg-slate-600'
              : 'bg-red-600 hover:bg-red-700',
          ]"
          @click="toggleVideo"
          :title="videoEnabled ? 'Отключить видео' : 'Включить видео'"
        >
          <FontAwesomeIcon :icon="videoEnabled ? faVideo : faVideoSlash" class="text-xl" />
        </button>

        <button
          type="button"
          :class="[
            'p-4 rounded-full transition-colors',
            audioEnabled
              ? 'bg-slate-700 hover:bg-slate-600'
              : 'bg-red-600 hover:bg-red-700',
          ]"
          @click="toggleAudio"
          :title="audioEnabled ? 'Отключить микрофон' : 'Включить микрофон'"
        >
          <FontAwesomeIcon :icon="audioEnabled ? faMicrophone : faMicrophoneSlash" class="text-xl" />
        </button>

        <button
          type="button"
          class="p-4 rounded-full bg-red-600 hover:bg-red-700 transition-colors"
          @click="endCall"
          title="Завершить звонок"
        >
          <FontAwesomeIcon :icon="faPhoneSlash" class="text-xl" />
        </button>
      </div>

      <div class="mt-4 text-center text-sm text-slate-400">
        <p>Подключенных участников: {{ remotePeers.length + 1 }}</p>
      </div>
    </div>
  </div>
</template>
