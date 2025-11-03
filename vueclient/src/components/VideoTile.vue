<!-- eslint-disable @typescript-eslint/no-explicit-any -->
<script setup lang="ts">
import { faUserAlt } from '@fortawesome/free-regular-svg-icons'
import {
  faExpand,
  faVolumeHigh,
  faVolumeLow,
  faVolumeXmark,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue'

const props = defineProps<{
  conditionVideo: any
  conditionAudio: any
  stream: any
  keyId: string
  muted: boolean | undefined
}>()

const containerRef = ref<HTMLElement | null>(null)
const videoRef = ref<HTMLVideoElement | null>(null)
const audioRef = ref<HTMLAudioElement | null>(null)
const audioStreamRef = ref<HTMLAudioElement | null>(null)
const isMuted = ref(Boolean(props.muted))
const micVolume = ref(1)
const screenVolume = ref(1)
const hasMicAudio = ref(false)
const hasScreenAudio = ref(false)
const contextMenu = ref({ visible: false, x: 0, y: 0 })
const menuRef = ref<HTMLElement | null>(null)
const audioContextRef = ref<AudioContext | null>(null)
const micGainNode = ref<GainNode | null>(null)
const screenGainNode = ref<GainNode | null>(null)
const processedAudioStream = ref<MediaStream | null>(null)
const needsActivation = ref(false)
let resumePlaybackHandler: ((event: Event) => void) | null = null
let resumePromise: Promise<void> | null = null

const volumeIcon = computed(() => {
  const effectiveMic = hasMicAudio.value ? micVolume.value : 0
  const effectiveScreen = hasScreenAudio.value ? screenVolume.value : 0
  const level = isMuted.value ? 0 : Math.max(effectiveMic, effectiveScreen)
  if (level === 0) return faVolumeXmark
  return level < 0.5 ? faVolumeLow : faVolumeHigh
})

watchEffect(() => {
  const stream = (props.stream as MediaStream | null) ?? null
  if (videoRef.value && videoRef.value.srcObject !== stream) {
    videoRef.value.srcObject = stream
    videoRef.value.muted = true
  }
  // Separate audio tracks for stream and peers
  if (audioStreamRef.value && stream) {
    const audioTracks = stream.getAudioTracks()
    if (audioTracks.length > 0) {
      const audioOnlyStream = new MediaStream(audioTracks)
      audioStreamRef.value.srcObject = audioOnlyStream
      audioStreamRef.value.muted = true
      audioStreamRef.value.volume = 0
    } else {
      audioStreamRef.value.srcObject = null
    }
  }
})

watch(
  () => props.muted,
  (value) => {
    if (typeof value === 'boolean') {
      isMuted.value = value
      applyMuteState()
    }
  },
)

watch(
  () => micVolume.value,
  () => {
    applyMuteState()
  },
)

watch(
  () => screenVolume.value,
  () => {
    applyMuteState()
  },
)

watch(
  () => isMuted.value,
  () => {
    applyMuteState()
  },
)

watch(
  () =>
    (props.stream as MediaStream | null)
      ?.getAudioTracks()
      .map((track) => track.id)
      .join(',') ?? '',
  () => {
    rebuildAudioGraph()
  },
  { immediate: true },
)

watch(
  () => props.stream,
  () => {
    rebuildAudioGraph()
  },
  { immediate: true },
)

watch(
  () => processedAudioStream.value,
  () => {
    syncAudioElement()
  },
)

watch(
  () => audioRef.value,
  () => {
    syncAudioElement()
  },
)

function teardownAudioGraph() {
  processedAudioStream.value = null
  hasScreenAudio.value = false
  hasMicAudio.value = false
  micGainNode.value = null
  screenGainNode.value = null
  cleanupResumeHandler()
  needsActivation.value = false

  if (audioRef.value) {
    audioRef.value.pause()
    audioRef.value.srcObject = null
  }

  if (audioContextRef.value) {
    audioContextRef.value.close().catch(() => undefined)
    audioContextRef.value = null
  }

  applyMuteState()
}

// Простая эвристика помогает отличить звук экрана от микрофона
function isScreenAudioTrack(track: MediaStreamTrack) {
  const hint = track.contentHint?.toLowerCase() ?? ''
  if (hint.includes('screen') || hint.includes('presentation')) return true
  const label = track.label.toLowerCase()
  return label.includes('screen') || label.includes('system') || label.includes('tab')
}

function rebuildAudioGraph() {
  teardownAudioGraph()

  if (props.muted) {
    return
  }

  const stream = props.stream as MediaStream | null
  if (!stream) return

  const audioTracks = stream.getAudioTracks()
  if (audioTracks.length === 0) return

  // Separate mic and screen tracks
  const micTracks = audioTracks.filter((track, idx) => !isScreenAudioTrack(track) && idx === 0)
  const screenTracks = audioTracks.filter((track, idx) => isScreenAudioTrack(track) || idx > 0)

  const context = new AudioContext()
  const destination = context.createMediaStreamDestination()

  const micGain = context.createGain()
  const screenGain = context.createGain()
  const micTrackPresent = micTracks.length > 0
  const screenTrackPresent = screenTracks.length > 0

  micTracks.forEach((track) => {
    const sourceStream = new MediaStream([track])
    const source = context.createMediaStreamSource(sourceStream)
    source.connect(micGain)
  })
  screenTracks.forEach((track) => {
    const sourceStream = new MediaStream([track])
    const source = context.createMediaStreamSource(sourceStream)
    source.connect(screenGain)
  })

  micGain.connect(destination)
  screenGain.connect(destination)

  audioContextRef.value = context
  micGainNode.value = micTrackPresent ? micGain : null
  screenGainNode.value = screenTrackPresent ? screenGain : null
  hasMicAudio.value = micTrackPresent
  hasScreenAudio.value = screenTrackPresent
  processedAudioStream.value = destination.stream

  syncAudioElement()
  applyMuteState()
}

function applyMuteState() {
  const muted = isMuted.value
  if (micGainNode.value) {
    micGainNode.value.gain.value = muted ? 0 : micVolume.value
  }
  if (screenGainNode.value) {
    screenGainNode.value.gain.value = muted ? 0 : screenVolume.value
  }
  if (videoRef.value) {
    videoRef.value.muted = true
  }
  if (audioRef.value) {
    audioRef.value.muted = muted
    audioRef.value.volume = 1
  }

  if (!muted) {
    ensureAudioPlayback()
  }
}

function toggleMute() {
  isMuted.value = !isMuted.value
  hideContextMenu()
}

function handleMicVolumeInput(event: Event) {
  const target = event.target as HTMLInputElement
  const normalized = Number(target.value) / 100
  const value = Number.isFinite(normalized) ? Math.min(Math.max(normalized, 0), 1) : 0
  micVolume.value = value
  if (micVolume.value > 0 && isMuted.value) {
    isMuted.value = false
  }
}

function handleScreenVolumeInput(event: Event) {
  const target = event.target as HTMLInputElement
  const normalized = Number(target.value) / 100
  const value = Number.isFinite(normalized) ? Math.min(Math.max(normalized, 0), 1) : 0
  screenVolume.value = value
  if (screenVolume.value > 0 && isMuted.value) {
    isMuted.value = false
  }
}

async function enterFullscreen() {
  const host = videoRef.value ?? containerRef.value
  if (host && host.requestFullscreen) {
    try {
      await host.requestFullscreen()
    } catch (error) {
      console.error('Не удалось открыть видео на весь экран:', error)
    }
  }
  hideContextMenu()
}

function openContextMenu(event: MouseEvent) {
  event.preventDefault()
  const container = containerRef.value
  if (!container) return
  const rect = container.getBoundingClientRect()
  contextMenu.value = {
    visible: true,
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  }
  nextTick(adjustMenuPosition)
}

function hideContextMenu() {
  if (contextMenu.value.visible) {
    contextMenu.value.visible = false
  }
}

function handleOutsideClick(event: MouseEvent) {
  if (!contextMenu.value.visible) return
  const container = containerRef.value
  if (container && !container.contains(event.target as Node)) {
    hideContextMenu()
  }
}

function adjustMenuPosition() {
  if (!contextMenu.value.visible) return
  const container = containerRef.value
  const menu = menuRef.value
  if (!container || !menu) return

  const containerRect = container.getBoundingClientRect()
  const menuRect = menu.getBoundingClientRect()

  const padding = 8
  const availableWidth = containerRect.width - menuRect.width
  const availableHeight = containerRect.height - menuRect.height

  let x = Math.min(Math.max(contextMenu.value.x, 0), Math.max(availableWidth, 0))
  let y = Math.min(Math.max(contextMenu.value.y, 0), Math.max(availableHeight, 0))

  if (availableWidth > padding * 2) {
    x = Math.min(x, availableWidth - padding)
    x = Math.max(x, padding)
  }
  if (availableHeight > padding * 2) {
    y = Math.min(y, availableHeight - padding)
    y = Math.max(y, padding)
  }

  if (x !== contextMenu.value.x || y !== contextMenu.value.y) {
    contextMenu.value = {
      ...contextMenu.value,
      x,
      y,
    }
  }
}

async function attemptResumePlayback() {
  if (resumePromise) return resumePromise

  resumePromise = (async () => {
    const context = audioContextRef.value
    if (context && context.state === 'suspended') {
      try {
        await context.resume()
      } catch (error) {
        console.warn('Не удалось активировать аудиоконтекст:', error)
      }
    }

    const element = audioRef.value
    if (element) {
      try {
        await element.play()
      } catch (error) {
        console.warn('Воспроизведение аудио заблокировано браузером:', error)
      }
    }

    const contextRunning = !audioContextRef.value || audioContextRef.value.state === 'running'
    const elementActive = !audioRef.value || !audioRef.value.paused || audioRef.value.muted
    needsActivation.value = !(contextRunning && elementActive)

    if (!needsActivation.value) {
      cleanupResumeHandler()
    }
  })()

  try {
    await resumePromise
  } finally {
    resumePromise = null
  }
}

function ensureAudioPlayback() {
  attemptResumePlayback().catch(() => undefined)

  const context = audioContextRef.value
  if (context && context.state !== 'running' && !resumePlaybackHandler) {
    // Chrome блокирует AudioContext до первого взаимодействия, поэтому подписываемся на жесты.
    resumePlaybackHandler = () => attemptResumePlayback()
    document.addEventListener('pointerdown', resumePlaybackHandler)
    document.addEventListener('keydown', resumePlaybackHandler)
  }
}

function cleanupResumeHandler() {
  if (resumePlaybackHandler) {
    document.removeEventListener('pointerdown', resumePlaybackHandler)
    document.removeEventListener('keydown', resumePlaybackHandler)
    resumePlaybackHandler = null
  }
}

function syncAudioElement() {
  const audioEl = audioRef.value
  const stream = processedAudioStream.value
  if (!audioEl || !stream) return

  if (audioEl.srcObject !== stream) {
    audioEl.srcObject = stream
  }

  ensureAudioPlayback()
}

function handleManualActivation() {
  attemptResumePlayback().catch(() => undefined)
}

onMounted(() => {
  document.addEventListener('click', handleOutsideClick)
  document.addEventListener('contextmenu', handleOutsideClick)
  window.addEventListener('resize', adjustMenuPosition)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleOutsideClick)
  document.removeEventListener('contextmenu', handleOutsideClick)
  window.removeEventListener('resize', adjustMenuPosition)
  teardownAudioGraph()
})
</script>

<template>
  <div
    :key="keyId"
    ref="containerRef"
    class="relative flex items-center justify-center w-full h-full bg-slate-800 rounded-lg shadow-lg border-2 border-slate-700 overflow-hidden"
    @contextmenu="openContextMenu"
    @click="hideContextMenu"
  >
    <video
      v-if="conditionVideo"
      ref="videoRef"
      autoplay
      playsinline
      class="w-full h-full object-contain"
      @dblclick="enterFullscreen"
    ></video>
    <div v-else class="flex flex-col items-center justify-center gap-4">
      <FontAwesomeIcon :icon="faUserAlt" class="text-slate-400 text-9xl" />
    </div>

    <audio ref="audioRef" autoplay playsinline class="hidden"></audio>
    <audio ref="audioStreamRef" autoplay playsinline class="hidden"></audio>

    <transition name="fade">
      <div
        ref="menuRef"
        v-if="(conditionAudio || conditionVideo) && contextMenu.visible"
        class="absolute z-20 bg-slate-900/90 border border-slate-700 rounded-lg shadow-xl p-3 w-48 flex flex-col gap-3"
        :style="{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }"
        @click.stop
      >
        <button
          type="button"
          class="flex items-center gap-3 px-3 py-2 rounded-md bg-slate-800 hover:bg-slate-700 transition-colors text-left"
          @click="toggleMute"
        >
          <FontAwesomeIcon :icon="volumeIcon" class="text-lg text-slate-100" />
          <span class="text-sm text-slate-100">{{
            isMuted ? 'Включить звук' : 'Выключить звук'
          }}</span>
        </button>

        <div v-if="hasMicAudio" class="flex flex-col gap-2 text-slate-100">
          <span class="text-xs uppercase tracking-wide">Громкость собеседника</span>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            :value="Math.round(micVolume * 100)"
            class="accent-indigo-400 cursor-pointer"
            @input="handleMicVolumeInput"
            @click.stop
          />
        </div>

        <div v-if="hasScreenAudio" class="flex flex-col gap-2 text-slate-100">
          <span class="text-xs uppercase tracking-wide">Громкость стрима</span>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            :value="Math.round(screenVolume * 100)"
            class="accent-indigo-400 cursor-pointer"
            @input="handleScreenVolumeInput"
            @click.stop
          />
        </div>

        <button
          type="button"
          class="flex items-center gap-3 px-3 py-2 rounded-md bg-slate-800 hover:bg-slate-700 transition-colors text-left"
          @click="enterFullscreen"
        >
          <FontAwesomeIcon :icon="faExpand" class="text-lg text-slate-100" />
          <span class="text-sm text-slate-100">На весь экран</span>
        </button>
      </div>
    </transition>

    <div
      v-if="needsActivation && !isMuted"
      class="absolute bottom-4 left-1/2 -translate-x-1/2 z-30"
    >
      <button
        type="button"
        class="px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 transition-colors text-sm font-medium shadow-lg"
        @click.stop="handleManualActivation"
      >
        Включить звук
      </button>
    </div>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
