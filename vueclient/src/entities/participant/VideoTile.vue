<!-- eslint-disable @typescript-eslint/no-explicit-any -->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import CustomVideoPlayer from '@/shared/ui/CustomVideoPlayer.vue'

const { t } = useI18n()

const props = defineProps<{
  conditionVideo: any
  conditionAudio: any
  stream: any
  keyId: string
  muted: boolean | undefined
}>()

const containerRef = ref<HTMLElement | null>(null)
const videoPlayerRef = ref<InstanceType<typeof CustomVideoPlayer> | null>(null)
const videoRef = computed(() => videoPlayerRef.value?.videoElement || null)
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
  if (level === 0) return 'muted'
  return level < 0.5 ? 'low' : 'high'
})

watchEffect(() => {
  const stream = (props.stream as MediaStream | null) ?? null
  const videoEl = videoRef.value
  if (videoEl && videoEl.srcObject !== stream) {
    videoEl.srcObject = stream
    videoEl.muted = true
  }
  if (audioStreamRef.value && stream) {
    const audioTracks = stream.getAudioTracks()
    if (audioTracks.length > 0) {
      audioStreamRef.value.srcObject = new MediaStream(audioTracks)
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
  const micTracks = audioTracks.filter((t, i) => !isScreenAudioTrack(t) && i === 0)
  const screenTracks = audioTracks.filter((t, i) => isScreenAudioTrack(t) || i > 0)
  const context = new AudioContext()
  const destination = context.createMediaStreamDestination()
  const micGain = context.createGain()
  const screenGain = context.createGain()
  micTracks.forEach((t) => {
    context.createMediaStreamSource(new MediaStream([t])).connect(micGain)
  })
  screenTracks.forEach((t) => {
    context.createMediaStreamSource(new MediaStream([t])).connect(screenGain)
  })
  micGain.connect(destination)
  screenGain.connect(destination)
  audioContextRef.value = context
  micGainNode.value = micTracks.length > 0 ? micGain : null
  screenGainNode.value = screenTracks.length > 0 ? screenGain : null
  hasMicAudio.value = micTracks.length > 0
  hasScreenAudio.value = screenTracks.length > 0
  processedAudioStream.value = destination.stream
  syncAudioElement()
  applyMuteState()
}

function applyMuteState() {
  if (micGainNode.value) micGainNode.value.gain.value = isMuted.value ? 0 : micVolume.value
  if (screenGainNode.value) screenGainNode.value.gain.value = isMuted.value ? 0 : screenVolume.value
  if (videoRef.value) videoRef.value.muted = true
  if (audioRef.value) {
    audioRef.value.muted = isMuted.value
    audioRef.value.volume = 1
  }
  if (!isMuted.value) ensureAudioPlayback()
}

function toggleMute() {
  isMuted.value = !isMuted.value
  hideContextMenu()
}
function handleMicVolumeInput(e: Event) {
  const v = Math.min(Math.max(Number((e.target as HTMLInputElement).value) / 100, 0), 1)
  micVolume.value = v
  if (v > 0 && isMuted.value) isMuted.value = false
}
function handleScreenVolumeInput(e: Event) {
  const v = Math.min(Math.max(Number((e.target as HTMLInputElement).value) / 100, 0), 1)
  screenVolume.value = v
  if (v > 0 && isMuted.value) isMuted.value = false
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
  let x = Math.min(Math.max(contextMenu.value.x, 8), Math.max(cr.width - mr.width - 8, 0))
  let y = Math.min(Math.max(contextMenu.value.y, 8), Math.max(cr.height - mr.height - 8, 0))
  contextMenu.value = { ...contextMenu.value, x, y }
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
    const running = !audioContextRef.value || audioContextRef.value.state === 'running'
    const playing = !audioRef.value || !audioRef.value.paused || audioRef.value.muted
    needsActivation.value = !(running && playing)
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
      :stream="(stream as MediaStream | null)"
      :muted="true"
      :autoplay="true"
      :playsinline="true"
      :show-controls="false"
      class="w-full h-full"
    />
    <div v-else class="flex flex-col items-center justify-center gap-2">
      <font-awesome-icon icon="user" class="text-6xl text-dc-text-muted" />
    </div>

    <audio ref="audioRef" autoplay playsinline class="hidden" />
    <audio ref="audioStreamRef" autoplay playsinline class="hidden" />

    <!-- Context menu -->
    <Transition name="fade">
      <div
        ref="menuRef"
        v-if="(conditionAudio || conditionVideo) && contextMenu.visible"
        class="absolute z-20 bg-dc-bg-floating border border-dc-separator rounded-lg shadow-xl p-2.5 w-44 flex flex-col gap-2"
        :style="{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }"
        @click.stop
      >
        <button
          class="flex items-center gap-2 px-2 py-1.5 rounded text-sm text-dc-text hover:bg-dc-bg-hover transition-colors text-left"
          @click="toggleMute"
        >
          {{ isMuted ? t('common.unmute') : t('common.mute') }}
        </button>

        <div v-if="hasMicAudio" class="flex flex-col gap-1 px-1">
          <span class="text-[10px] uppercase tracking-wide text-dc-text-muted">{{
            t('common.micVolume')
          }}</span>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            :value="Math.round(micVolume * 100)"
            class="accent-dc-blurple cursor-pointer"
            @input="handleMicVolumeInput"
            @click.stop
          />
        </div>

        <div v-if="hasScreenAudio" class="flex flex-col gap-1 px-1">
          <span class="text-[10px] uppercase tracking-wide text-dc-text-muted">{{
            t('common.streamVolume')
          }}</span>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            :value="Math.round(screenVolume * 100)"
            class="accent-dc-blurple cursor-pointer"
            @input="handleScreenVolumeInput"
            @click.stop
          />
        </div>

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
