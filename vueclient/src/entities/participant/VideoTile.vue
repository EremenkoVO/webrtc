<!-- eslint-disable @typescript-eslint/no-explicit-any -->
<script setup lang="ts">
import CustomVideoPlayer from '@/shared/ui/CustomVideoPlayer.vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps<{
  conditionVideo: any
  conditionAudio: any
  stream: any
  keyId: string
  muted: boolean | undefined
  isScreenSharing?: boolean
}>()

const containerRef = ref<HTMLElement | null>(null)
const videoPlayerRef = ref<InstanceType<typeof CustomVideoPlayer> | null>(null)
const videoRef = computed(() => videoPlayerRef.value?.videoElement || null)
const audioRef = ref<HTMLAudioElement | null>(null)
const audioStreamRef = ref<HTMLAudioElement | null>(null)
const screenAudioRef = ref<HTMLAudioElement | null>(null)
const isMuted = ref(Boolean(props.muted))
const micVolume = ref(1)
const screenVolume = ref(1)
const hasMicAudio = ref(false)
const hasScreenAudio = ref(false)
const contextMenu = ref({ visible: false, x: 0, y: 0 })
const menuRef = ref<HTMLElement | null>(null)
const audioContextRef = ref<AudioContext | null>(null)
const micGainNode = ref<GainNode | null>(null)
const processedAudioStream = ref<MediaStream | null>(null)
const screenAudioStream = ref<MediaStream | null>(null)
const needsActivation = ref(false)
let resumePlaybackHandler: ((event: Event) => void) | null = null
let resumePromise: Promise<void> | null = null

const volumeIcon = computed(() => {
  const effectiveMic = hasMicAudio.value ? micVolume.value : 0
  const effectiveScreen = hasScreenAudio.value ? screenVolume.value : 0
  const level = isMuted.value ? 0 : Math.max(effectiveMic, effectiveScreen)
  if (level === 0) return 'muted'
  return level < 0.5 ? 'low' : 'high'
})

const isFullscreen = computed(() => {
  if (typeof document === 'undefined') return false
  return !!document.fullscreenElement
})

watchEffect(() => {
  const stream = (props.stream as MediaStream | null) ?? null
  const videoEl = videoRef.value
  if (videoEl && videoEl.srcObject !== stream) {
    videoEl.srcObject = stream
    videoEl.muted = true
  }
  // Don't play audio through audioStreamRef - it will be handled by rebuildAudioGraph
  // which separates mic and screen audio into different audio elements
  if (audioStreamRef.value) {
    audioStreamRef.value.srcObject = null
    audioStreamRef.value.muted = true
    audioStreamRef.value.volume = 0
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
  () => applyMuteState(),
)
watch(
  () => screenVolume.value,
  () => applyMuteState(),
)
watch(
  () => isMuted.value,
  () => applyMuteState(),
)
watch(
  () =>
    (props.stream as MediaStream | null)
      ?.getAudioTracks()
      .map((t) => t.id)
      .join(',') ?? '',
  () => rebuildAudioGraph(),
  { immediate: true },
)
watch(
  () => props.stream,
  () => rebuildAudioGraph(),
  { immediate: true },
)
watch(
  () => processedAudioStream.value,
  () => syncAudioElement(),
)
watch(
  () => audioRef.value,
  () => syncAudioElement(),
)
watch(
  () => screenAudioStream.value,
  () => syncScreenAudioElement(),
)
watch(
  () => screenAudioRef.value,
  () => syncScreenAudioElement(),
)

function teardownAudioGraph() {
  processedAudioStream.value = null
  screenAudioStream.value = null
  hasScreenAudio.value = false
  hasMicAudio.value = false
  micGainNode.value = null
  cleanupResumeHandler()
  needsActivation.value = false
  if (audioRef.value) {
    audioRef.value.pause()
    audioRef.value.srcObject = null
  }
  if (screenAudioRef.value) {
    screenAudioRef.value.pause()
    screenAudioRef.value.srcObject = null
  }
  if (audioContextRef.value) {
    audioContextRef.value.close().catch(() => undefined)
    audioContextRef.value = null
  }
  applyMuteState()
}

function isScreenAudioTrack(track: MediaStreamTrack) {
  const hint = track.contentHint?.toLowerCase() ?? ''
  if (hint.includes('screen') || hint.includes('presentation')) return true
  const label = track.label.toLowerCase()
  return label.includes('screen') || label.includes('system') || label.includes('tab')
}

function rebuildAudioGraph() {
  teardownAudioGraph()
  if (props.muted) return
  const stream = props.stream as MediaStream | null
  if (!stream) return
  const audioTracks = stream.getAudioTracks()
  if (audioTracks.length === 0) return

  // Separate mic and screen tracks completely
  const micTracks = audioTracks.filter((track, idx) => !isScreenAudioTrack(track) && idx === 0)
  const screenTracks = audioTracks.filter((track, idx) => isScreenAudioTrack(track) || idx > 0)

  const micTrackPresent = micTracks.length > 0
  const screenTrackPresent = screenTracks.length > 0

  // Process microphone tracks separately through AudioContext for volume control
  if (micTrackPresent) {
    // Get sampleRate from mic track to avoid resampling quality loss
    let sampleRate = 48000 // Default WebRTC sample rate
    try {
      const settings = micTracks[0].getSettings()
      if (settings.sampleRate) {
        sampleRate = settings.sampleRate
      }
    } catch (e) {
      // Fallback to default
    }

    const context = new AudioContext({ sampleRate })
    const destination = context.createMediaStreamDestination()
    const micGain = context.createGain()

    micTracks.forEach((track) => {
      const sourceStream = new MediaStream([track])
      const source = context.createMediaStreamSource(sourceStream)
      source.connect(micGain)
    })

    micGain.connect(destination)

    audioContextRef.value = context
    micGainNode.value = micGain
    processedAudioStream.value = destination.stream
    hasMicAudio.value = true
  } else {
    audioContextRef.value = null
    micGainNode.value = null
    processedAudioStream.value = null
    hasMicAudio.value = false
  }

  // Process screen audio tracks separately - direct playback without AudioContext
  // This preserves original quality and keeps tracks completely separate
  if (screenTrackPresent) {
    screenAudioStream.value = new MediaStream(screenTracks)
    hasScreenAudio.value = true
  } else {
    screenAudioStream.value = null
    hasScreenAudio.value = false
  }

  syncAudioElement()
  syncScreenAudioElement()
  applyMuteState()
}

function applyMuteState() {
  const muted = isMuted.value
  // Control microphone volume through gain node
  if (micGainNode.value) {
    micGainNode.value.gain.value = muted ? 0 : micVolume.value
  }
  // Control screen audio volume through audio element volume
  if (videoRef.value) {
    videoRef.value.muted = true
  }
  if (audioRef.value) {
    audioRef.value.muted = muted
    audioRef.value.volume = 1
  }
  if (screenAudioRef.value && screenAudioStream.value) {
    screenAudioRef.value.muted = muted
    screenAudioRef.value.volume = muted ? 0 : screenVolume.value
  }

  if (!muted) {
    ensureAudioPlayback()
  }
}

function toggleMute() {
  isMuted.value = !isMuted.value
  hideContextMenu()
}
function handleMicVolumeInput(volume: number) {
  micVolume.value = Math.min(Math.max(volume, 0), 1)
  if (micVolume.value > 0 && isMuted.value) isMuted.value = false
}
function handleScreenVolumeInput(volume: number) {
  screenVolume.value = Math.min(Math.max(volume, 0), 1)
  if (screenVolume.value > 0 && isMuted.value) isMuted.value = false
}

async function enterFullscreen() {
  const el = videoRef.value ?? containerRef.value
  if (el?.requestFullscreen)
    try {
      await el.requestFullscreen()
    } catch {}
  hideContextMenu()
}

function openContextMenu(event: MouseEvent) {
  event.preventDefault()
  event.stopPropagation()
  const container = containerRef.value
  if (!container) return
  const rect = container.getBoundingClientRect()
  contextMenu.value = { visible: true, x: event.clientX - rect.left, y: event.clientY - rect.top }
  nextTick(adjustMenuPosition)
}
function hideContextMenu() {
  contextMenu.value.visible = false
}

function handleOutsideClick(event: MouseEvent) {
  if (!contextMenu.value.visible) return
  if (containerRef.value && !containerRef.value.contains(event.target as Node)) hideContextMenu()
}

function adjustMenuPosition() {
  if (!contextMenu.value.visible || !containerRef.value || !menuRef.value) return
  const cr = containerRef.value.getBoundingClientRect()
  const mr = menuRef.value.getBoundingClientRect()

  // In fullscreen mode, use viewport coordinates
  if (isFullscreen.value) {
    // Calculate position relative to viewport in fullscreen
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const menuX = Math.min(
      Math.max(contextMenu.value.x + cr.left, 8),
      Math.max(viewportWidth - mr.width - 8, 0),
    )
    const menuY = Math.min(
      Math.max(contextMenu.value.y + cr.top, 8),
      Math.max(viewportHeight - mr.height - 8, 0),
    )
    contextMenu.value = { ...contextMenu.value, x: menuX - cr.left, y: menuY - cr.top }
  } else {
    // Normal mode - use container coordinates
    let x = Math.min(Math.max(contextMenu.value.x, 8), Math.max(cr.width - mr.width - 8, 0))
    let y = Math.min(Math.max(contextMenu.value.y, 8), Math.max(cr.height - mr.height - 8, 0))
    contextMenu.value = { ...contextMenu.value, x, y }
  }
}

async function attemptResumePlayback() {
  if (resumePromise) return resumePromise
  resumePromise = (async () => {
    const ctx = audioContextRef.value
    if (ctx && ctx.state === 'suspended')
      try {
        await ctx.resume()
      } catch {}
    const el = audioRef.value
    if (el)
      try {
        await el.play()
      } catch {}
    // Also ensure screen audio element is playing
    const screenEl = screenAudioRef.value
    if (screenEl && screenAudioStream.value)
      try {
        await screenEl.play()
      } catch {}
    const contextRunning = !audioContextRef.value || audioContextRef.value.state === 'running'
    const elementActive = !audioRef.value || !audioRef.value.paused || audioRef.value.muted
    const screenPlaying =
      !screenAudioRef.value || !screenAudioRef.value.paused || screenAudioRef.value.muted
    needsActivation.value = !(contextRunning && elementActive && screenPlaying)
    if (!needsActivation.value) cleanupResumeHandler()
  })()
  try {
    await resumePromise
  } finally {
    resumePromise = null
  }
}

function ensureAudioPlayback() {
  attemptResumePlayback().catch(() => undefined)
  const ctx = audioContextRef.value
  if (ctx && ctx.state !== 'running' && !resumePlaybackHandler) {
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
  const el = audioRef.value,
    s = processedAudioStream.value
  if (!el || !s) return
  if (el.srcObject !== s) el.srcObject = s
  ensureAudioPlayback()
}

function syncScreenAudioElement() {
  const el = screenAudioRef.value,
    s = screenAudioStream.value
  if (!el) return
  if (s) {
    if (el.srcObject !== s) {
      el.srcObject = s
      el.muted = isMuted.value
      el.volume = isMuted.value ? 0 : screenVolume.value
      el.play().catch(() => {})
    }
  } else {
    // Clear if no screen audio stream
    if (el.srcObject) {
      el.pause()
      el.srcObject = null
    }
  }
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
    class="relative flex items-center justify-center w-full h-full bg-dc-bg-secondary-alt rounded-lg overflow-hidden"
    @contextmenu="openContextMenu"
    @click="hideContextMenu"
  >
    <CustomVideoPlayer
      v-if="conditionVideo"
      ref="videoPlayerRef"
      :stream="stream as MediaStream | null"
      :muted="true"
      :autoplay="true"
      :playsinline="true"
      :show-controls="true"
      :has-mic-audio="hasMicAudio"
      :has-screen-audio="hasScreenAudio"
      :mic-volume="micVolume"
      :screen-volume="screenVolume"
      class="w-full h-full"
      @contextmenu="openContextMenu"
      @mic-volume-change="handleMicVolumeInput"
      @screen-volume-change="handleScreenVolumeInput"
    />
    <div v-else class="flex flex-col items-center justify-center gap-2">
      <font-awesome-icon icon="user" class="text-6xl text-dc-text-muted" />
    </div>

    <audio ref="audioRef" autoplay playsinline class="hidden" />
    <audio ref="screenAudioRef" autoplay playsinline class="hidden" />
    <audio ref="audioStreamRef" autoplay playsinline class="hidden" />

    <!-- Context menu -->
    <Transition name="fade">
      <div
        ref="menuRef"
        v-if="(conditionAudio || conditionVideo) && contextMenu.visible"
        class="absolute z-[9999] bg-dc-bg-floating border border-dc-separator rounded-lg shadow-xl p-2.5 w-44 flex flex-col gap-2"
        :style="{
          top: `${contextMenu.y}px`,
          left: `${contextMenu.x}px`,
          position: isFullscreen ? 'fixed' : 'absolute',
        }"
        @click.stop
      >
        <button
          class="flex items-center gap-2 px-2 py-1.5 rounded text-sm text-dc-text hover:bg-dc-bg-hover transition-colors text-left"
          @click="toggleMute"
        >
          {{ isMuted ? t('common.unmute') : t('common.mute') }}
        </button>

        <button
          class="flex items-center gap-2 px-2 py-1.5 rounded text-sm text-dc-text hover:bg-dc-bg-hover transition-colors text-left"
          @click="enterFullscreen"
        >
          {{ t('common.fullscreen') }}
        </button>
      </div>
    </Transition>

    <!-- Activation prompt -->
    <div
      v-if="needsActivation && !isMuted"
      class="absolute bottom-3 left-1/2 -translate-x-1/2 z-30"
    >
      <button
        class="px-3 py-1.5 rounded bg-dc-blurple hover:bg-dc-blurple-hover text-white text-xs font-medium shadow-lg transition-colors"
        @click.stop="attemptResumePlayback"
      >
        {{ t('common.enableSound') }}
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
