<!-- eslint-disable @typescript-eslint/no-explicit-any -->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = withDefaults(
  defineProps<{
    stream: MediaStream | null
    muted?: boolean
    autoplay?: boolean
    playsinline?: boolean
    showControls?: boolean
  }>(),
  {
    muted: false,
    autoplay: true,
    playsinline: true,
    showControls: true,
  },
)

const emit = defineEmits<{
  (e: 'play'): void
  (e: 'pause'): void
  (e: 'volumechange', volume: number): void
  (e: 'fullscreenchange', isFullscreen: boolean): void
}>()

const videoRef = ref<HTMLVideoElement | null>(null)
const containerRef = ref<HTMLElement | null>(null)
const controlsVisible = ref(false)
const isPlaying = ref(false)
const isFullscreen = ref(false)
const volume = ref(1)
const showVolumeSlider = ref(false)
const controlsTimeout = ref<ReturnType<typeof setTimeout> | null>(null)

const isLive = computed(() => {
  if (!videoRef.value) return true
  return isNaN(videoRef.value.duration) || videoRef.value.duration === Infinity
})

const currentTime = ref(0)
const duration = ref(0)
const progress = computed(() => {
  if (duration.value === 0 || isLive.value) return 0
  return (currentTime.value / duration.value) * 100
})

const formattedTime = computed(() => {
  const format = (seconds: number) => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = Math.floor(seconds % 60)
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
    return `${m}:${s.toString().padStart(2, '0')}`
  }
  return {
    current: format(currentTime.value),
    total: isLive.value ? 'LIVE' : format(duration.value),
  }
})

// Expose video element ref for parent components
defineExpose({
  videoElement: videoRef,
})

function showControls() {
  if (!props.showControls) return
  controlsVisible.value = true
  resetControlsTimeout()
}

function hideControls() {
  if (showVolumeSlider.value) return
  controlsVisible.value = false
}

function resetControlsTimeout() {
  if (controlsTimeout.value) clearTimeout(controlsTimeout.value)
  controlsTimeout.value = setTimeout(() => {
    hideControls()
  }, 3000)
}

function togglePlay() {
  if (!videoRef.value) return
  if (videoRef.value.paused) {
    videoRef.value.play()
    emit('play')
  } else {
    videoRef.value.pause()
    emit('pause')
  }
}

function handleSeek(e: MouseEvent) {
  if (!videoRef.value || isLive.value) return
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const percent = (e.clientX - rect.left) / rect.width
  const newTime = percent * duration.value
  videoRef.value.currentTime = newTime
}

function toggleFullscreen() {
  if (!containerRef.value) return
  if (!isFullscreen.value) {
    if (containerRef.value.requestFullscreen) {
      containerRef.value.requestFullscreen()
    }
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen()
    }
  }
}

function handleVolumeInput(e: Event) {
  const target = e.target as HTMLInputElement
  const newVolume = Number(target.value) / 100
  volume.value = newVolume
  if (videoRef.value) {
    videoRef.value.volume = newVolume
  }
  emit('volumechange', newVolume)
}

function toggleMute() {
  if (!videoRef.value) return
  videoRef.value.muted = !videoRef.value.muted
}

function handleFullscreenChange() {
  isFullscreen.value = !!document.fullscreenElement
  emit('fullscreenchange', isFullscreen.value)
}

watch(
  () => props.stream,
  (stream) => {
    if (videoRef.value && stream) {
      videoRef.value.srcObject = stream
    }
  },
  { immediate: true },
)

watch(
  () => props.muted,
  (muted) => {
    if (videoRef.value && typeof muted === 'boolean') {
      videoRef.value.muted = muted
    }
  },
  { immediate: true },
)

watch(
  () => videoRef.value,
  (videoEl) => {
    if (!videoEl) return

    videoEl.addEventListener('play', () => {
      isPlaying.value = true
    })
    videoEl.addEventListener('pause', () => {
      isPlaying.value = false
    })
    videoEl.addEventListener('timeupdate', () => {
      if (videoEl) {
        currentTime.value = videoEl.currentTime
        duration.value = videoEl.duration || 0
      }
    })
    videoEl.addEventListener('loadedmetadata', () => {
      if (videoEl) {
        duration.value = videoEl.duration || 0
      }
    })
    videoEl.addEventListener('volumechange', () => {
      if (videoEl) {
        volume.value = videoEl.volume
      }
    })
  },
  { immediate: true },
)

onMounted(() => {
  document.addEventListener('fullscreenchange', handleFullscreenChange)
  document.addEventListener('webkitfullscreenchange', handleFullscreenChange)
  document.addEventListener('mozfullscreenchange', handleFullscreenChange)
  document.addEventListener('MSFullscreenChange', handleFullscreenChange)

  if (props.showControls) {
    showControls()
  }
})

onBeforeUnmount(() => {
  if (controlsTimeout.value) clearTimeout(controlsTimeout.value)
  document.removeEventListener('fullscreenchange', handleFullscreenChange)
  document.removeEventListener('webkitfullscreenchange', handleFullscreenChange)
  document.removeEventListener('mozfullscreenchange', handleFullscreenChange)
  document.removeEventListener('MSFullscreenChange', handleFullscreenChange)
})
</script>

<template>
  <div
    ref="containerRef"
    class="relative w-full h-full bg-black overflow-hidden group"
    @mouseenter="showControls"
    @mousemove="showControls"
    @mouseleave="hideControls"
  >
    <video
      ref="videoRef"
      :autoplay="autoplay"
      :playsinline="playsinline"
      class="w-full h-full object-contain"
    />

    <!-- Controls overlay -->
    <Transition name="fade">
      <div
        v-if="controlsVisible || showVolumeSlider"
        class="absolute inset-0 z-10 flex flex-col justify-end bg-gradient-to-t from-black/80 via-black/40 to-transparent pointer-events-none"
      >
        <!-- Progress bar (only for non-live) -->
        <div
          v-if="!isLive && duration > 0"
          class="w-full h-1 bg-white/20 cursor-pointer pointer-events-auto"
          @click="handleSeek"
        >
          <div
            class="h-full bg-dc-blurple transition-all"
            :style="{ width: `${progress}%` }"
          />
        </div>

        <!-- Controls bar -->
        <div class="px-4 py-3 flex items-center gap-3 pointer-events-auto">
          <!-- Play/Pause -->
          <button
            v-if="!isLive"
            @click="togglePlay"
            class="w-8 h-8 flex items-center justify-center text-white hover:text-dc-blurple transition-colors"
          >
            <font-awesome-icon :icon="isPlaying ? 'pause' : 'play'" class="text-sm" />
          </button>

          <!-- Time -->
          <div v-if="!isLive && duration > 0" class="text-xs text-white/80 font-mono min-w-[80px]">
            {{ formattedTime.current }} / {{ formattedTime.total }}
          </div>
          <div v-else-if="isLive" class="flex items-center gap-1.5 text-xs text-dc-red font-semibold">
            <div class="w-2 h-2 bg-dc-red rounded-full animate-pulse" />
            LIVE
          </div>

          <div class="flex-1" />

          <!-- Volume -->
          <div
            class="relative flex items-center gap-2"
            @mouseenter="showVolumeSlider = true"
            @mouseleave="showVolumeSlider = false"
          >
            <button
              @click="toggleMute"
              class="w-8 h-8 flex items-center justify-center text-white hover:text-dc-blurple transition-colors"
            >
              <font-awesome-icon
                :icon="videoRef?.muted || volume === 0 ? 'volume-mute' : volume < 0.5 ? 'volume-high' : 'volume-high'"
                class="text-sm"
              />
            </button>
            <Transition name="fade">
              <div
                v-if="showVolumeSlider"
                class="absolute right-0 bottom-full mb-2 px-3 py-2 bg-dc-bg-floating rounded-lg shadow-xl"
              >
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  :value="Math.round(volume * 100)"
                  class="w-24 accent-dc-blurple cursor-pointer"
                  @input="handleVolumeInput"
                />
              </div>
            </Transition>
          </div>

          <!-- Fullscreen -->
          <button
            @click="toggleFullscreen"
            class="w-8 h-8 flex items-center justify-center text-white hover:text-dc-blurple transition-colors"
          >
            <font-awesome-icon :icon="isFullscreen ? 'window-restore' : 'window-maximize'" class="text-sm" />
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
