<script setup lang="ts">
import { faMicrophone, faMicrophoneSlash, faVolumeHigh, faVolumeLow, faVolumeXmark } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{
  name: string
  isMuted: boolean
  isSpeaking: boolean
  isLocal?: boolean
  peerId?: string
  volume?: number
  audioStream?: MediaStream
}>()

const emit = defineEmits<{
  'update:muted': [muted: boolean]
  'update:volume': [volume: number]
}>()

const containerRef = ref<HTMLElement | null>(null)
const menuRef = ref<HTMLElement | null>(null)
const contextMenu = ref({ visible: false, x: 0, y: 0 })
const localMuted = ref(props.isMuted)
const localVolume = ref(props.volume ?? 1)

const avatarInitials = computed(() => {
  if (!props.name) return '?'
  const parts = props.name.split(' ')
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return props.name[0].toUpperCase()
})

const cardClasses = computed(() => {
  const base = 'relative flex flex-col items-center justify-center p-4 rounded-lg bg-slate-800 border-2 transition-all duration-200 cursor-pointer'
  if (props.isSpeaking) {
    return base + ' border-green-500 shadow-lg shadow-green-500/20'
  }
  return base + ' border-slate-700'
})

const volumeIcon = computed(() => {
  const level = localMuted.value ? 0 : localVolume.value
  if (level === 0) return faVolumeXmark
  return level < 0.5 ? faVolumeLow : faVolumeHigh
})

watch(() => props.isMuted, (value) => {
  localMuted.value = value
})

watch(() => props.volume, (value) => {
  if (value !== undefined) {
    localVolume.value = value
  }
})

function toggleMute() {
  localMuted.value = !localMuted.value
  emit('update:muted', localMuted.value)
  hideContextMenu()
}

function handleVolumeInput(event: Event) {
  const target = event.target as HTMLInputElement
  const normalized = Number(target.value) / 100
  const value = Number.isFinite(normalized) ? Math.min(Math.max(normalized, 0), 1) : 0
  localVolume.value = value
  emit('update:volume', value)
  if (localVolume.value > 0 && localMuted.value) {
    localMuted.value = false
    emit('update:muted', false)
  }
}

function openContextMenu(event: MouseEvent) {
  if (props.isLocal) return // Не показываем меню для локального пользователя
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
    ref="containerRef"
    :class="cardClasses"
    @contextmenu="openContextMenu"
    @click="hideContextMenu"
  >
    <!-- Аватар -->
    <div
      class="w-16 h-16 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xl font-semibold mb-3 relative"
    >
      <span>{{ avatarInitials }}</span>
      
      <!-- Индикатор "говорит" -->
      <div
        v-if="isSpeaking"
        class="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-green-500 border-2 border-slate-800 flex items-center justify-center"
      >
        <FontAwesomeIcon :icon="faVolumeHigh" class="text-xs text-white" />
      </div>
    </div>

    <!-- Имя пользователя -->
    <div class="text-sm font-medium text-white mb-2 truncate max-w-full px-2">
      {{ isLocal ? `Вы (${name})` : name }}
    </div>

    <!-- Статусы -->
    <div class="flex items-center gap-2 text-xs">
      <!-- Статус микрофона -->
      <div
        :class="[
          'flex items-center gap-1 px-2 py-1 rounded',
          localMuted ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'
        ]"
      >
        <FontAwesomeIcon
          :icon="localMuted ? faMicrophoneSlash : faMicrophone"
          class="text-xs"
        />
        <span>{{ localMuted ? 'Выкл' : 'Вкл' }}</span>
      </div>
    </div>

    <!-- Контекстное меню для регулировки звука -->
    <transition name="fade">
      <div
        ref="menuRef"
        v-if="!isLocal && contextMenu.visible"
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
            localMuted ? 'Включить звук' : 'Выключить звук'
          }}</span>
        </button>

        <div class="flex flex-col gap-2 text-slate-100">
          <span class="text-xs uppercase tracking-wide">Громкость</span>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            :value="Math.round(localVolume * 100)"
            class="accent-indigo-400 cursor-pointer"
            @input="handleVolumeInput"
            @click.stop
          />
        </div>
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
