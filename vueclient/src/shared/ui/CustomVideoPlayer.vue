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
    hasMicAudio?: boolean
    hasScreenAudio?: boolean
    micVolume?: number
    screenVolume?: number
  }>(),
  {
    muted: false,
    autoplay: true,
    playsinline: true,
    showControls: true,
    hasMicAudio: false,
    hasScreenAudio: false,
    micVolume: 1,
    screenVolume: 1,
  },
)

const emit = defineEmits<{
  (e: 'play'): void
  (e: 'pause'): void
  (e: 'fullscreenchange', isFullscreen: boolean): void
  (e: 'contextmenu', event: MouseEvent): void
  (e: 'micVolumeChange', volume: number): void
  (e: 'screenVolumeChange', volume: number): void
}>()

const videoRef = ref<HTMLVideoElement | null>(null)
const containerRef = ref<HTMLElement | null>(null)
const controlsVisible = ref(false)
const isPlaying = ref(false)
const isFullscreen = ref(false)
const controlsTimeout = ref<ReturnType<typeof setTimeout> | null>(null)
const isHovering = ref(false)
const showMicVolumeSlider = ref(false)
const showScreenVolumeSlider = ref(false)

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
  if (isHovering.value || showMicVolumeSlider.value || showScreenVolumeSlider.value) return
  controlsVisible.value = false
}

function resetControlsTimeout() {
  if (controlsTimeout.value) clearTimeout(controlsTimeout.value)
  // В полноэкранном режиме элементы управления остаются видимыми дольше
  const timeout = isFullscreen.value ? 5000 : 3000
  controlsTimeout.value = setTimeout(() => {
    if (!isHovering.value && !showMicVolumeSlider.value && !showScreenVolumeSlider.value) {
      hideControls()
    }
  }, timeout)
}

function handleMouseEnter() {
  isHovering.value = true
  showControls()
}

function handleMouseLeave() {
  isHovering.value = false
  if (!showMicVolumeSlider.value && !showScreenVolumeSlider.value) {
    resetControlsTimeout()
  }
}

function handleMouseMove() {
  if (!isHovering.value) {
    isHovering.value = true
  }
  showControls()
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

function handleFullscreenChange() {
  isFullscreen.value = !!document.fullscreenElement
  emit('fullscreenchange', isFullscreen.value)
  // Показываем элементы управления при входе в полноэкранный режим
  if (isFullscreen.value && props.showControls) {
    showControls()
  }
}

function handleMicVolumeInput(e: Event) {
  const target = e.target as HTMLInputElement
  const newVolume = Number(target.value) / 100
  emit('micVolumeChange', newVolume)
}

function handleScreenVolumeInput(e: Event) {
  const target = e.target as HTMLInputElement
  const newVolume = Number(target.value) / 100
  emit('screenVolumeChange', newVolume)
}

watch(
  () => props.stream,
  (stream) => {
    if (videoRef.value && stream) {
      videoRef.value.srcObject = stream
      videoRef.value.muted = true // Always mute video element for audio (handled by parent)
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
    @mouseenter="handleMouseEnter"
    @mousemove="handleMouseMove"
    @mouseleave="handleMouseLeave"
    @contextmenu="(e) => emit('contextmenu', e)"
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
        v-if="controlsVisible || showMicVolumeSlider || showScreenVolumeSlider"
        class="absolute inset-0 z-10 flex flex-col justify-end bg-gradient-to-t from-black/80 via-black/40 to-transparent pointer-events-none"
      >
        <!-- Progress bar (only for non-live) -->
        <div
          v-if="!isLive && duration > 0"
          class="w-full bg-white/20 cursor-pointer pointer-events-auto transition-opacity duration-200"
          :class="{ 'h-1': !isFullscreen, 'h-2': isFullscreen }"
          @click="handleSeek"
        >
          <div class="h-full bg-dc-blurple transition-all" :style="{ width: `${progress}%` }" />
        </div>

        <!-- Controls bar -->
        <div class="px-4 py-3 flex items-center gap-3 pointer-events-auto">
          <!-- Play/Pause -->
          <button
            v-if="!isLive"
            @click="togglePlay"
            class="w-12 h-12 2xl:w-14 2xl:h-14 flex items-center justify-center text-white hover:text-dc-blurple transition-colors rounded-full hover:bg-white/10"
            :class="{ 'w-14 h-14 2xl:w-16 2xl:h-16': isFullscreen }"
          >
            <font-awesome-icon
              :icon="isPlaying ? 'pause' : 'play'"
              :class="isFullscreen ? 'text-xl 2xl:text-2xl' : 'text-lg 2xl:text-xl'"
            />
          </button>

          <!-- Time -->
          <div
            v-if="!isLive && duration > 0"
            class="text-xs text-white/80 font-mono min-w-[80px]"
            :class="{ 'text-sm': isFullscreen }"
          >
            {{ formattedTime.current }} / {{ formattedTime.total }}
          </div>
          <div
            v-else-if="isLive"
            class="flex items-center gap-1.5 text-xs text-dc-red font-semibold"
            :class="{ 'text-sm': isFullscreen }"
          >
            <div
              class="w-2 h-2 bg-dc-red rounded-full animate-pulse"
              :class="{ 'w-2.5 h-2.5': isFullscreen }"
            />
            LIVE
          </div>

          <div class="flex-1" />

          <!-- Volume Controls -->
          <div class="relative flex items-center gap-2">
            <!-- Mic Volume -->
            <div
              v-if="props.hasMicAudio"
              class="relative flex items-center"
              @mouseenter="showMicVolumeSlider = true"
              @mouseleave="showMicVolumeSlider = false"
            >
              <button
                class="w-10 h-10 flex items-center justify-center text-white hover:text-dc-blurple transition-colors rounded-full hover:bg-white/10 flex-shrink-0"
                :class="{ 'w-12 h-12': isFullscreen }"
                :title="t('common.micVolume')"
              >
                <font-awesome-icon
                  icon="microphone"
                  :class="[
                    isFullscreen ? 'text-lg' : 'text-sm',
                    props.micVolume === 0 || props.muted ? 'opacity-50' : '',
                  ]"
                />
              </button>
              <Transition name="slide-up">
                <div
                  v-if="showMicVolumeSlider"
                  class="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 flex flex-col items-center px-3 py-2 bg-dc-bg-floating rounded-lg shadow-xl"
                  :class="{ 'px-4 py-3': isFullscreen }"
                >
                  <span class="text-xs text-white/80 mb-1">{{ t('common.micVolume') }}</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    :value="Math.round(props.micVolume * 100)"
                    class="accent-dc-blurple cursor-pointer"
                    :class="isFullscreen ? 'w-32 h-2' : 'w-24 h-2'"
                    @input="handleMicVolumeInput"
                  />
                </div>
              </Transition>
            </div>

            <!-- Screen Audio Volume -->
            <div
              v-if="props.hasScreenAudio"
              class="relative flex items-center"
              @mouseenter="showScreenVolumeSlider = true"
              @mouseleave="showScreenVolumeSlider = false"
            >
              <button
                class="w-10 h-10 flex items-center justify-center text-white hover:text-dc-blurple transition-colors rounded-full hover:bg-white/10 flex-shrink-0"
                :class="{ 'w-12 h-12': isFullscreen }"
                :title="t('common.streamVolume')"
              >
                <font-awesome-icon
                  icon="desktop"
                  :class="[
                    isFullscreen ? 'text-xl 2xl:text-2xl' : 'text-lg 2xl:text-xl',
                    props.screenVolume === 0 || props.muted ? 'opacity-50' : '',
                  ]"
                />
              </button>
              <Transition name="slide-up">
                <div
                  v-if="showScreenVolumeSlider"
                  class="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 flex flex-col items-center px-4 py-3 bg-dc-bg-floating rounded-lg shadow-xl"
                  :class="{ 'px-5 py-4': isFullscreen }"
                >
                  <span class="text-sm 2xl:text-base text-white/80 mb-2">{{
                    t('common.streamVolume')
                  }}</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    :value="Math.round(props.screenVolume * 100)"
                    class="accent-dc-blurple cursor-pointer"
                    :class="isFullscreen ? 'w-40 h-3' : 'w-32 h-2.5'"
                    @input="handleScreenVolumeInput"
                  />
                </div>
              </Transition>
            </div>
          </div>

          <!-- Fullscreen -->
          <button
            @click="toggleFullscreen"
            class="w-12 h-12 2xl:w-14 2xl:h-14 flex items-center justify-center text-white hover:text-dc-blurple transition-colors rounded-full hover:bg-white/10"
            :class="{ 'w-14 h-14 2xl:w-16 2xl:h-16': isFullscreen }"
          >
            <font-awesome-icon
              :icon="isFullscreen ? 'window-restore' : 'window-maximize'"
              :class="isFullscreen ? 'text-xl 2xl:text-2xl' : 'text-lg 2xl:text-xl'"
            />
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

.slide-up-enter-active {
  transition: all 0.2s ease-out;
}
.slide-up-leave-active {
  transition: all 0.15s ease-in;
}
.slide-up-enter-from {
  opacity: 0;
  transform: translateX(-50%) translateY(20px);
}
.slide-up-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(20px);
}

/* Улучшенные стили для полноэкранного режима */
:deep(.group:fullscreen) {
  background-color: #000;
}

:deep(.group:fullscreen video) {
  object-fit: contain;
}
</style>
