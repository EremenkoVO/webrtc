<script setup lang="ts">
import { SignalingService, type ErrorResponse, type RoomJoinResponse } from '@/api'
import connectSound from '@/assets/sound/discord-connected.mp3'
import disconnectSound from '@/assets/sound/discord-disconnect.mp3'
import streamStartSound from '@/assets/sound/discord-stream-start.mp3'
import streamStopSound from '@/assets/sound/discord-stream-stop.mp3'
import { useWebRTC } from '@/composible/useWebRTC'
import { useCallStore } from '@/stores/callStore'
import { useChatStore } from '@/stores/chatStore'
import { useRoomStore } from '@/stores/roomStore'
import { useSidebarStore } from '@/stores/sidebarStore'
import { useSignalingStore } from '@/stores/signalingStore'
import {
  faBars,
  faComments,
  faPlay,
  faTimes,
  faVideo,
  faVideoSlash,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import BadgeComponent from './BadgeComponent.vue'
import ChannelControls from './ChannelControls.vue'
import ChatComponent from './ChatComponent.vue'
import ParticipantCard from './ParticipantCard.vue'
import VideoTile from './VideoTile.vue'

const props = defineProps<{
  userName: string | undefined
}>()

const roomStore = useRoomStore()
const signalingStore = useSignalingStore()
const callStore = useCallStore()
const chatStore = useChatStore()
const sidebarStore = useSidebarStore()

const {
  localStream,
  remotePeers,
  peerStates,
  peerPlayback,
  peerAudioStreams,
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
  setPeerVolume,
  setPeerMuted,
  subscribeToPeerVideo,
  unsubscribeFromPeerVideo,
  subscribedVideoPeerIds,
} = useWebRTC()

const videoEnabled = ref(false)
const audioEnabled = ref(true)
const currentCameraDeviceId = ref<string | null>(null)
const currentMicrophoneDeviceId = ref<string | null>(null)
const videoStreamIndex = ref<number>(0)
const showChatMobile = ref(false)

// Воспроизведение звуковых эффектов
function playSound(src: string) {
  const audio = new Audio(src)
  audio.volume = 0.5
  audio.play().catch((error) => {
    console.error('Ошибка воспроизведения звука:', error)
  })
}

// Отслеживание предыдущих состояний видео пиров для звуков стрима
const previousPeerVideoStates = ref<Record<string, boolean>>({})

// Тип для участника с видео
type PeerWithVideo = {
  peerId: string
  connection: RTCPeerConnection | null
  remoteStream: MediaStream
  room_mates?: Record<string, string>
  isLocal: boolean
}

// Участники с видео, которые показываем (локальный + удалённые, к которым вручную подключились)
// Логика максимально простая: есть видеотреки в потоке → есть видео.
// При выключении стрима updateRemoteVideo удаляет треки и создаёт новый объект пира — Vue пересчитывает.
const peersWithVideo = computed<PeerWithVideo[]>(() => {
  const withVideo: PeerWithVideo[] = []
  const localClientId = signalingStore.clientId
  const subscribed = subscribedVideoPeerIds.value

  // Локальный пользователь с видео — всегда показываем
  if (localStream.value && localStream.value.getVideoTracks().length > 0 && localClientId) {
    withVideo.push({
      peerId: localClientId,
      connection: null,
      remoteStream: localStream.value,
      room_mates: {},
      isLocal: true,
    })
  }

  // Удалённые: подписанные + есть видеотреки в потоке
  remotePeers.value.forEach((peer) => {
    const hasVideoTracks = (peer.remoteStream?.getVideoTracks().length ?? 0) > 0
    if (hasVideoTracks && subscribed.has(peer.peerId) && peer.remoteStream) {
      withVideo.push({
        peerId: peer.peerId,
        connection: peer.connection,
        remoteStream: peer.remoteStream,
        room_mates: peer.room_mates,
        isLocal: false,
      })
    }
  })

  return withVideo
})

// Превью: у кого есть видеотреки, но мы ещё не подключились
type PeerStreamPreview = {
  peerId: string
  name: string
  hasTrack: boolean
}
const peersWithStreamPreview = computed<PeerStreamPreview[]>(() => {
  const previews: PeerStreamPreview[] = []
  const subscribed = subscribedVideoPeerIds.value

  remotePeers.value.forEach((peer) => {
    const hasVideoTracks = (peer.remoteStream?.getVideoTracks().length ?? 0) > 0
    if (hasVideoTracks && !subscribed.has(peer.peerId)) {
      const name =
        roomStore.participants.find((p) => p.client_id === peer.peerId)?.username || peer.peerId
      previews.push({
        peerId: peer.peerId,
        name,
        hasTrack: true,
      })
    }
  })

  return previews
})

// Тип для участника без видео
type PeerWithoutVideo = {
  peerId: string
  name: string
  isMuted: boolean
  isSpeaking: boolean
  isLocal: boolean
  volume?: number
  audioStream?: MediaStream
}

// Участники без видео (все подключенные участники без активного видео стрима)
const peersWithoutVideo = computed<PeerWithoutVideo[]>(() => {
  const withoutVideo: PeerWithoutVideo[] = []

  // Получаем всех участников из API через roomStore
  const allParticipants = roomStore.participants
  const localClientId = signalingStore.clientId

  // Локальный пользователь без видео
  if ((!localStream.value || localStream.value.getVideoTracks().length === 0) && localClientId) {
    withoutVideo.push({
      peerId: localClientId,
      name: props.userName || 'Вы',
      isMuted: !audioEnabled.value,
      isSpeaking: isLocalSpeaking.value,
      isLocal: true,
    })
  }

  // Проходим по всем участникам комнаты из API
  allParticipants.forEach((participant) => {
    const peerId = participant.client_id || ''
    const name = participant.username || peerId

    // Пропускаем локального пользователя (уже добавлен выше)
    if (peerId === localClientId) return

    // Проверяем наличие видеотреков (то же условие, что и в peersWithVideo / preview)
    const peer = remotePeers.value.find((p) => p.peerId === peerId)
    const hasVideo = (peer?.remoteStream?.getVideoTracks().length ?? 0) > 0

    // Если нет видео, добавляем в список участников без видео
    if (!hasVideo) {
      const peerState = peerStates.value[peerId]
      const playback = peerPlayback.value[peerId]

      // Определяем состояние микрофона:
      // 1. Приоритет: peerState.microphone (реальное состояние микрофона удаленного пользователя)
      // 2. Если нет peerState.microphone, используем playback.muted (локальная настройка пользователя)
      // 3. По умолчанию считаем выключенным
      let isMuted = true // по умолчанию считаем выключенным

      if (peerState && typeof peerState.microphone === 'boolean') {
        // Реальное состояние микрофона удаленного пользователя
        isMuted = !peerState.microphone
      } else if (playback) {
        // Локальная настройка пользователя (если нет данных о реальном состоянии)
        isMuted = playback.muted
      }

      withoutVideo.push({
        peerId,
        name: name || peerId,
        isMuted,
        isSpeaking: speakingPeers.value[peerId] || false,
        isLocal: false,
        volume: playback?.volume ?? 1,
        audioStream: peerAudioStreams.value[peerId],
      })
    }
  })

  return withoutVideo
})

// динамический класс ширины для видео (поддержка до 4K)
const videoTileClass = computed(() => {
  const base =
    'relative bg-slate-800 border border-slate-700 rounded-lg overflow-hidden aspect-video transition-all duration-300'
  const count = peersWithVideo.value.length + peersWithStreamPreview.value.length
  // Mobile-first, затем 2xl/3xl/4k/5xl для больших экранов
  if (count <= 2) {
    return (
      base +
      ' w-full sm:w-[70%] md:w-[60%] max-w-[700px] 2xl:max-w-[800px] 3xl:max-w-[950px] 4k:max-w-[1100px] 5xl:max-w-[1300px]'
    )
  }
  if (count <= 4) {
    return (
      base +
      ' w-full sm:w-[48%] md:w-[45%] max-w-[500px] 2xl:max-w-[550px] 3xl:max-w-[600px] 4k:max-w-[700px] 5xl:max-w-[800px]'
    )
  }
  if (count <= 6) {
    return (
      base +
      ' w-full sm:w-[31%] md:w-[30%] max-w-[400px] 2xl:max-w-[450px] 3xl:max-w-[500px] 4k:max-w-[580px] 5xl:max-w-[650px]'
    )
  }
  return (
    base +
    ' w-full sm:w-[23%] md:w-[22%] max-w-[320px] 2xl:max-w-[360px] 3xl:max-w-[400px] 4k:max-w-[480px] 5xl:max-w-[520px]'
  )
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

function handlePeerMuteChange(peerId: string, muted: boolean) {
  setPeerMuted(peerId, muted)
}

function handlePeerVolumeChange(peerId: string, volume: number) {
  setPeerVolume(peerId, volume)
}

function toggleVideo() {
  if (!currentCameraDeviceId.value && localStream.value && !videoEnabled.value) {
    selectCamera(videoDevices.value[0]?.deviceId || '')
    videoEnabled.value = true
  } else if (currentCameraDeviceId.value && localStream.value && !videoEnabled.value) {
    selectCamera(currentCameraDeviceId.value)
    videoEnabled.value = true
  } else if (videoEnabled.value && localStream.value) {
    // Отключаем видео
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
      // Немедленно отправляем состояние микрофона всем пирам
      toggleMedia(videoEnabled.value, audioEnabled.value, currentCameraDeviceId.value || '')
    }
  } else {
    // Если нет локального стрима, все равно обновляем состояние
    toggleMedia(videoEnabled.value, audioEnabled.value, currentCameraDeviceId.value || '')
  }
}

// Запуск звонка
async function startCall() {
  if (!roomStore.selectedChannelId) {
    console.error('Не выбран канал')
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
      // Отправляем начальное состояние микрофона всем пирам
      toggleMedia(videoEnabled.value, audioEnabled.value, currentCameraDeviceId.value || '')
      // Звук подключения
      playSound(connectSound)
    })
  } catch (error) {
    console.error('Не удалось начать звонок:', error)
    alert('Не удалось начать звонок. Проверьте разрешения на камеру и микрофон.')
  }
}

// Завершение звонка
function endCall() {
  // Звук отключения
  playSound(disconnectSound)
  leaveRoom()
  stopMedia()
  roomStore.getListChannels()
  videoEnabled.value = false
  audioEnabled.value = true
  callStore.setStateCall(false)
  // Очищаем отслеживание видео-состояний пиров
  previousPeerVideoStates.value = {}
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

      // Подключаемся к комнате сигнализации через WebSocket
      if (!signalingStore.isConnected) {
        signalingStore.connect()
        // Ждём установления соединения
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }

      signalingStore.joinRoom(id)
      console.log('Подключились к комнате:', id)
    }
  } catch (e) {
    console.error(e)
    return
  }
}

// Следим за сменой канала и выходим из текущего звонка
watch(
  () => roomStore.selectedChannelId,
  (newId, oldId) => {
    if (oldId && newId !== oldId && callStore.isInCall) {
      endCall()
    }
  },
)

// Звук подключения/отключения удалённых пиров
watch(
  () => remotePeers.value.length,
  (newLength, oldLength) => {
    if (!callStore.isInCall) return
    if (newLength > oldLength) {
      playSound(connectSound)
    } else if (newLength < oldLength) {
      playSound(disconnectSound)
    }
  },
)

watch(
  () => remotePeers.value,
  (newPeers) => {
    newPeers.forEach((peer) => {
      console.log('Удалённый поток изменился:', peer?.remoteStream?.getVideoTracks())
    })
  },
  { deep: true },
)

// Отслеживаем изменения состояния пиров для реактивности и звуков стрима
watch(
  () => peerStates.value,
  (newStates) => {
    console.log('Состояния пиров изменились:', newStates)

    // Проверяем изменения видео для звуков стрима
    for (const peerId of Object.keys(newStates)) {
      const newVideoState = newStates[peerId]?.video ?? false
      const prevVideoState = previousPeerVideoStates.value[peerId] ?? false

      if (newVideoState !== prevVideoState) {
        if (newVideoState) {
          playSound(streamStartSound)
        } else {
          playSound(streamStopSound)
        }
        previousPeerVideoStates.value = {
          ...previousPeerVideoStates.value,
          [peerId]: newVideoState,
        }
      }
    }

    // Удаляем записи для пиров, которых больше нет
    for (const peerId of Object.keys(previousPeerVideoStates.value)) {
      if (!(peerId in newStates)) {
        const updated = { ...previousPeerVideoStates.value }
        delete updated[peerId]
        previousPeerVideoStates.value = updated
      }
    }
  },
  { deep: true },
)

// Звук начала/остановки локальной демонстрации экрана
watch(
  () => isScreenSharing.value,
  (sharing, wasSharingBefore) => {
    if (sharing && !wasSharingBefore) {
      playSound(streamStartSound)
    } else if (!sharing && wasSharingBefore) {
      playSound(streamStopSound)
    }
  },
)

// Отслеживание смены канала для загрузки участников
watch(
  () => roomStore.selectedChannelId,
  async (newChannelId, oldChannelId) => {
    if (newChannelId && newChannelId !== oldChannelId) {
      // Загружаем участников через API при смене канала
      await roomStore.getRoomParticipants(newChannelId)
    } else if (!newChannelId) {
      // Очищаем список участников при выходе из канала
      roomStore.setRoommates([])
      roomStore.setParticipants([])
    }
  },
  { immediate: true },
)

// Периодическое обновление списка участников (каждые 5 секунд)
let participantsRefreshInterval: ReturnType<typeof setInterval> | null = null

watch(
  () => [roomStore.selectedChannelId, callStore.isInCall],
  ([channelId, isInCall]) => {
    // Очищаем предыдущий интервал
    if (participantsRefreshInterval) {
      clearInterval(participantsRefreshInterval)
      participantsRefreshInterval = null
    }

    // Запускаем обновление только если есть выбранный канал и мы в звонке
    if (typeof channelId === 'string' && channelId && isInCall) {
      // Загружаем участников сразу
      roomStore.getRoomParticipants(channelId)

      // Устанавливаем периодическое обновление каждые 5 секунд
      participantsRefreshInterval = setInterval(() => {
        if (roomStore.selectedChannelId && callStore.isInCall) {
          roomStore.getRoomParticipants(roomStore.selectedChannelId)
        }
      }, 5000)
    }
  },
  { immediate: true },
)

onMounted(() => {
  fetchVideoDevices()
  fetchAudioDevices()

  // Загружаем участников при монтировании, если канал уже выбран
  if (roomStore.selectedChannelId) {
    roomStore.getRoomParticipants(roomStore.selectedChannelId)
  }
})

// Очищаем интервал при размонтировании
onBeforeUnmount(() => {
  // Очищаем интервал обновления участников
  if (participantsRefreshInterval) {
    clearInterval(participantsRefreshInterval)
    participantsRefreshInterval = null
  }

  // Завершаем звонок если он активен
  if (callStore.isInCall) {
    endCall()
  }

  // Останавливаем медиа
  stopMedia()

  // Покидаем комнату
  leaveRoom()
})
</script>

<template>
  <div class="flex h-full text-white">
    <!-- Основная область с видео -->
    <div class="flex flex-col flex-1 min-w-0">
      <!-- Заголовок -->
      <div
        class="p-3 sm:p-4 border-b border-slate-800/50 bg-slate-900/30 backdrop-blur-sm sticky top-0 z-10"
      >
        <div class="flex items-center gap-3">
          <!-- Кнопка меню (мобильная) -->
          <button
            v-if="sidebarStore.isMobile"
            data-sidebar-toggle
            @click="sidebarStore.toggle"
            class="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-300 transition-all touch-manipulation flex-shrink-0"
            :aria-label="sidebarStore.isOpen ? 'Закрыть меню' : 'Открыть меню'"
            title="Меню"
          >
            <FontAwesomeIcon :icon="faBars" class="text-lg" />
          </button>

          <div class="flex-1 min-w-0">
            <h1 class="text-lg sm:text-xl font-semibold truncate">
              {{ roomStore.selectedChannelName || 'Выберите канал' }}
            </h1>
            <div v-if="roomStore.selectedChannelId" class="flex items-center gap-2 mt-1">
              <div
                :class="[
                  'w-2 h-2 rounded-full flex-shrink-0',
                  signalingStore.isConnected ? 'bg-green-500' : 'bg-red-500',
                ]"
              ></div>
              <span class="text-xs sm:text-sm text-slate-400">
                {{ signalingStore.isConnected ? 'Подключено' : 'Отключено' }}
              </span>
            </div>
          </div>

          <!-- Мобильная кнопка чата -->
          <button
            v-if="roomStore.selectedChannelId && !showChatMobile"
            @click="showChatMobile = true"
            class="lg:hidden p-2 rounded-lg bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-300 transition-all touch-manipulation relative flex-shrink-0"
            title="Открыть чат"
          >
            <FontAwesomeIcon :icon="faComments" />
            <span
              v-if="chatStore.messages.length > 0"
              class="absolute -top-1 -right-1 w-5 h-5 bg-blue-600 text-white text-xs rounded-full flex items-center justify-center font-semibold"
            >
              {{ chatStore.messages.length > 9 ? '9+' : chatStore.messages.length }}
            </span>
          </button>
        </div>
      </div>

      <!-- Empty State - No Channel Selected -->
      <div v-if="!roomStore.selectedChannelId" class="flex-1 flex items-center justify-center p-8">
        <div class="text-center max-w-md">
          <div
            class="w-20 h-20 rounded-full bg-slate-800/50 flex items-center justify-center mx-auto mb-4"
          >
            <FontAwesomeIcon :icon="faBars" class="text-3xl text-slate-400" />
          </div>
          <h2 class="text-xl font-semibold text-white mb-2">Выберите канал</h2>
          <p class="text-slate-400 text-sm">
            {{
              sidebarStore.isMobile
                ? 'Нажмите на кнопку меню, чтобы выбрать канал'
                : 'Выберите канал из списка слева'
            }}
          </p>
        </div>
      </div>

      <!-- Channel Content -->
      <template v-else>
        <!-- Сетка видео -->
        <div class="flex-1 p-2 sm:p-4 2xl:p-5 3xl:p-6 4k:p-8 5xl:p-10 overflow-auto">
          <!-- Если не на линии -->
          <div
            v-if="!callStore.isInCall"
            class="flex items-center justify-center h-full min-h-[200px]"
          >
            <div class="text-center px-4 max-w-md">
              <div v-if="roomStore.roommates.length">
                <p class="text-slate-400 mb-3 text-sm sm:text-base">Подключенные участники</p>
                <ul class="text-slate-400 mb-4 space-y-1">
                  <li
                    v-for="(user, index) in roomStore.roommates"
                    :key="index"
                    class="text-sm sm:text-base"
                  >
                    {{ user }}
                  </li>
                </ul>
              </div>
              <div v-else>
                <p class="text-slate-400 mb-4 text-sm sm:text-base">Нет подключенных участников</p>
              </div>

              <p class="text-slate-400 mb-4 text-sm sm:text-base">Вы не в звонке</p>
              <button
                type="button"
                class="px-4 sm:px-6 py-2 sm:py-3 rounded-lg bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-semibold transition-all transform hover:scale-105 active:scale-95 shadow-lg"
                @click="startCall"
                :disabled="!roomStore.selectedChannelId"
              >
                <FontAwesomeIcon :icon="faVideo" class="mr-2" />
                <span class="text-sm sm:text-base">Начать звонок</span>
              </button>
            </div>
          </div>

          <!-- Если в звонке -->
          <div v-else class="flex flex-col h-full overflow-hidden">
            <!-- Видео стримы и превью (подключённые + доступные для подключения) -->
            <div
              v-if="peersWithVideo.length > 0 || peersWithStreamPreview.length > 0"
              class="flex flex-wrap justify-center items-center gap-2 sm:gap-4 2xl:gap-5 3xl:gap-6 4k:gap-8 5xl:gap-10 p-2 sm:p-4 2xl:p-5 4k:p-8 transition-all duration-300"
            >
              <template v-for="(peer, index) in peersWithVideo" :key="peer.peerId || index">
                <div
                  :class="[videoTileClass]"
                  class="relative bg-slate-800 border border-slate-700 rounded-lg overflow-hidden aspect-video transition-all duration-300"
                >
                  <VideoTile
                    v-if="peer.isLocal && localStream"
                    :condition-video="true"
                    :condition-audio="localStream.getAudioTracks().length > 0"
                    :stream="localStream"
                    :key-id="localStream.id"
                    :muted="true"
                  />
                  <VideoTile
                    v-else
                    :condition-video="true"
                    :condition-audio="peer.remoteStream?.getAudioTracks().length"
                    :stream="peer.remoteStream!"
                    :key-id="peer.peerId"
                    :muted="peerPlayback[peer.peerId]?.muted ?? false"
                    :volume="peerPlayback[peer.peerId]?.volume ?? 1"
                    :audio-stream="peerAudioStreams[peer.peerId]"
                    @update:muted="handlePeerMuteChange(peer.peerId, $event)"
                    @update:volume="handlePeerVolumeChange(peer.peerId, $event)"
                  />
                  <BadgeComponent
                    v-if="peer.isLocal"
                    :condition-show="!audioEnabled"
                    :name="`Вы (${props.userName})`"
                    :speaking="isLocalSpeaking"
                  />
                  <BadgeComponent
                    v-else
                    :condition-show="
                      peerStates[peer.peerId] &&
                      typeof peerStates[peer.peerId]?.microphone === 'boolean' &&
                      !peerStates[peer.peerId]?.microphone
                    "
                    :name="
                      roomStore.participants.find((p) => p.client_id === peer.peerId)?.username ||
                      peer.peerId
                    "
                    :speaking="speakingPeers[peer.peerId]"
                  />
                  <!-- Кнопка отключиться от стрима (только для удалённых) -->
                  <button
                    v-if="!peer.isLocal"
                    type="button"
                    class="absolute top-2 right-2 z-10 p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                    title="Отключиться от стрима"
                    @click="unsubscribeFromPeerVideo(peer.peerId)"
                  >
                    <FontAwesomeIcon :icon="faVideoSlash" class="w-4 h-4" />
                  </button>
                </div>
              </template>
              <!-- Превью: стрим включён у участника, подключиться вручную -->
              <template
                v-for="(preview, index) in peersWithStreamPreview"
                :key="'preview-' + preview.peerId + '-' + index"
              >
                <div
                  :class="[videoTileClass]"
                  class="relative bg-slate-800/80 border border-slate-600 border-dashed rounded-lg overflow-hidden aspect-video flex flex-col items-center justify-center gap-3 p-4 transition-all duration-300"
                >
                  <div class="flex flex-col items-center justify-center gap-2 text-slate-400">
                    <FontAwesomeIcon :icon="faVideo" class="w-10 h-10 sm:w-12 sm:h-12 opacity-70" />
                    <span class="text-sm sm:text-base font-medium text-slate-300">{{
                      preview.name
                    }}</span>
                    <span class="text-xs sm:text-sm text-slate-500">Стрим включён</span>
                  </div>
                  <button
                    type="button"
                    class="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-colors"
                    @click="subscribeToPeerVideo(preview.peerId)"
                  >
                    <FontAwesomeIcon :icon="faPlay" class="w-4 h-4" />
                    Подключиться к стриму
                  </button>
                </div>
              </template>
            </div>

            <!-- Список участников без видео -->
            <div
              v-if="peersWithoutVideo.length > 0"
              class="flex-1 overflow-y-auto p-2 sm:p-4 2xl:p-5 4k:p-8"
            >
              <div class="max-w-6xl 3xl:max-w-7xl 4k:max-w-[1600px] 5xl:max-w-[1920px] mx-auto">
                <h3
                  v-if="peersWithVideo.length > 0 || peersWithStreamPreview.length > 0"
                  class="text-sm font-semibold text-slate-400 mb-3 px-2 4k:text-base"
                >
                  Участники
                </h3>
                <div
                  class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-6 3xl:grid-cols-7 4k:grid-cols-8 5xl:grid-cols-10 gap-3 2xl:gap-4 4k:gap-5"
                >
                  <template
                    v-for="(participant, index) in peersWithoutVideo"
                    :key="participant.peerId || index"
                  >
                    <ParticipantCard
                      :name="participant.name"
                      :is-muted="participant.isMuted"
                      :is-speaking="participant.isSpeaking"
                      :is-local="participant.isLocal"
                      :peer-id="participant.peerId"
                      :volume="participant.volume"
                      :audio-stream="participant.audioStream"
                      @update:muted="handlePeerMuteChange(participant.peerId, $event)"
                      @update:volume="handlePeerVolumeChange(participant.peerId, $event)"
                    />
                  </template>
                </div>
              </div>
            </div>

            <!-- Пустое состояние когда нет ни видео, ни превью, ни участников -->
            <div
              v-if="
                peersWithVideo.length === 0 &&
                peersWithStreamPreview.length === 0 &&
                peersWithoutVideo.length === 0
              "
              class="flex-1 flex items-center justify-center"
            >
              <div class="text-center text-slate-400">
                <p>Ожидание подключения участников...</p>
              </div>
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
      </template>
    </div>

    <!-- Боковая панель чата (Desktop, масштабируется до 4K) -->
    <div
      class="hidden lg:block w-80 xl:w-80 2xl:w-96 3xl:w-[28rem] 4k:w-[30rem] 5xl:w-[32rem] border-l border-slate-800 flex-shrink-0"
    >
      <ChatComponent :room-id="roomStore.selectedChannelId" :user-name="props.userName" />
    </div>

    <!-- Мобильная панель чата (Overlay) -->
    <Transition name="slide-left">
      <div
        v-if="showChatMobile"
        v-click-outside="() => (showChatMobile = false)"
        class="lg:hidden fixed inset-0 z-50 flex flex-col bg-slate-900"
      >
        <div
          class="p-3 border-b border-slate-800 bg-slate-800/50 flex items-center justify-between safe-area-inset-top"
        >
          <h2 class="text-lg font-semibold text-white">Чат</h2>
          <button
            @click="showChatMobile = false"
            class="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 active:bg-slate-500 text-slate-300 transition-colors touch-manipulation"
            title="Закрыть чат"
          >
            <FontAwesomeIcon :icon="faTimes" />
          </button>
        </div>
        <div class="flex-1 overflow-hidden min-h-0">
          <ChatComponent :room-id="roomStore.selectedChannelId" :user-name="props.userName" />
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* Анимация для мобильного чата */
.slide-left-enter-active,
.slide-left-leave-active {
  transition: transform 0.3s ease-in-out;
}

.slide-left-enter-from {
  transform: translateX(100%);
}

.slide-left-leave-to {
  transform: translateX(100%);
}
</style>
