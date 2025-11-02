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
const isMuted = ref(Boolean(props.muted))
const volume = ref(1)
const contextMenu = ref({ visible: false, x: 0, y: 0 })
const menuRef = ref<HTMLElement | null>(null)

const activeMediaElement = computed<HTMLVideoElement | HTMLAudioElement | null>(
  () => videoRef.value ?? audioRef.value ?? null,
)

const volumeIcon = computed(() => {
  if (isMuted.value || volume.value === 0) return faVolumeXmark
  return volume.value < 0.5 ? faVolumeLow : faVolumeHigh
})

watchEffect(() => {
  const stream = (props.stream as MediaStream | null) ?? null
  if (videoRef.value && videoRef.value.srcObject !== stream) {
    videoRef.value.srcObject = stream
  }
  if (audioRef.value && audioRef.value.srcObject !== stream) {
    audioRef.value.srcObject = stream
  }
})

watchEffect(() => {
  const el = activeMediaElement.value
  if (!el) return
  el.muted = isMuted.value
  el.volume = volume.value
})

watch(
  () => props.muted,
  (value) => {
    if (typeof value === 'boolean') {
      isMuted.value = value
    }
  },
)

function toggleMute() {
  isMuted.value = !isMuted.value
  hideContextMenu()
}

function handleVolumeInput(event: Event) {
  const target = event.target as HTMLInputElement
  const normalized = Number(target.value) / 100
  volume.value = Number.isFinite(normalized) ? Math.min(Math.max(normalized, 0), 1) : 0
  if (volume.value > 0 && isMuted.value) {
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

onMounted(() => {
  document.addEventListener('click', handleOutsideClick)
  document.addEventListener('contextmenu', handleOutsideClick)
  window.addEventListener('resize', adjustMenuPosition)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleOutsideClick)
  document.removeEventListener('contextmenu', handleOutsideClick)
  window.removeEventListener('resize', adjustMenuPosition)
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
      :muted="isMuted"
      autoplay
      playsinline
      class="w-full h-full object-contain"
      @dblclick="enterFullscreen"
    ></video>
    <div v-else class="flex flex-col items-center justify-center gap-4">
      <FontAwesomeIcon :icon="faUserAlt" class="text-slate-400 text-9xl" />
      <audio ref="audioRef" autoplay playsinline class="hidden"></audio>
    </div>

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

        <div class="flex flex-col gap-2 text-slate-100">
          <span class="text-xs uppercase tracking-wide">Громкость</span>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            :value="Math.round(volume * 100)"
            class="accent-indigo-400 cursor-pointer"
            @input="handleVolumeInput"
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
