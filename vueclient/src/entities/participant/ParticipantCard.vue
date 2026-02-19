<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watchEffect, watch } from 'vue'

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

const audioRef = ref<HTMLAudioElement | null>(null)
const localMuted = ref(props.isMuted)
const localVolume = ref(props.volume ?? 1)
const showMenu = ref(false)

const avatarInitials = computed(() => {
  if (!props.name) return '?'
  return props.name.substring(0, 2).toUpperCase()
})

function getAvatarColor(name: string): string {
  const colors = [
    '#5865f2', '#3ba55c', '#faa61a', '#ed4245', '#eb459e',
    '#57f287', '#fee75c', '#9b59b6', '#e91e63', '#1abc9c',
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

watch(() => props.isMuted, (v) => { localMuted.value = v })
watch(() => props.volume, (v) => { if (v !== undefined) localVolume.value = v })

watchEffect(() => {
  if (props.isLocal || !audioRef.value) return
  const stream = props.audioStream
  if (stream && stream.getAudioTracks().length > 0) {
    audioRef.value.srcObject = new MediaStream(stream.getAudioTracks())
    audioRef.value.muted = false
    audioRef.value.volume = localMuted.value ? 0 : localVolume.value
    audioRef.value.play().catch(() => {})
  } else {
    audioRef.value.srcObject = null
  }
})

watch([() => localMuted.value, () => localVolume.value], () => {
  if (audioRef.value) audioRef.value.volume = localMuted.value ? 0 : localVolume.value
})

function toggleMute() {
  localMuted.value = !localMuted.value
  emit('update:muted', localMuted.value)
}

function handleVolumeInput(event: Event) {
  const target = event.target as HTMLInputElement
  const value = Math.min(Math.max(Number(target.value) / 100, 0), 1)
  localVolume.value = value
  emit('update:volume', value)
  if (value > 0 && localMuted.value) {
    localMuted.value = false
    emit('update:muted', false)
  }
}
</script>

<template>
  <div
    :class="[
      'relative flex flex-col items-center justify-center p-3 2xl:p-4 rounded-lg bg-dc-bg-secondary-alt transition-all duration-150',
      isSpeaking ? 'ring-2 ring-dc-green/60' : '',
    ]"
    @contextmenu.prevent="!isLocal && (showMenu = !showMenu)"
  >
    <audio v-if="!isLocal" ref="audioRef" autoplay playsinline />

    <!-- Avatar -->
    <div
      class="w-14 h-14 2xl:w-16 2xl:h-16 rounded-full flex items-center justify-center text-white text-lg 2xl:text-xl font-semibold mb-2 relative"
      :style="{ backgroundColor: getAvatarColor(name) }"
    >
      {{ avatarInitials }}
      <div
        v-if="isSpeaking"
        class="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-dc-green border-[3px] border-dc-bg-secondary-alt"
      />
    </div>

    <!-- Name -->
    <div class="text-xs 2xl:text-sm font-medium text-dc-text truncate max-w-full px-1 text-center">
      {{ isLocal ? `${name} (You)` : name }}
    </div>

    <!-- Mic status -->
    <div class="mt-1.5 flex items-center gap-1">
      <div
        :class="[
          'flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px]',
          localMuted ? 'bg-dc-red/20 text-dc-red' : 'bg-dc-green/15 text-dc-green',
        ]"
      >
        <font-awesome-icon :icon="localMuted ? 'microphone-slash' : 'microphone'" class="text-[10px]" />
      </div>
    </div>

    <!-- Context menu for volume -->
    <Transition name="fade">
      <div
        v-if="!isLocal && showMenu"
        class="absolute z-20 top-full left-1/2 -translate-x-1/2 mt-1 bg-dc-bg-floating border border-dc-separator rounded-lg shadow-xl p-3 w-44 flex flex-col gap-2"
        @click.stop
      >
        <button
          class="flex items-center gap-2 px-2 py-1.5 rounded text-sm text-dc-text hover:bg-dc-bg-hover transition-colors text-left w-full"
          @click="toggleMute(); showMenu = false"
        >
          {{ localMuted ? 'Unmute' : 'Mute' }}
        </button>
        <div class="flex flex-col gap-1">
          <span class="text-[10px] uppercase tracking-wide text-dc-text-muted">Volume</span>
          <input
            type="range" min="0" max="100" step="1"
            :value="Math.round(localVolume * 100)"
            class="accent-dc-blurple cursor-pointer w-full"
            @input="handleVolumeInput"
            @click.stop
          />
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.15s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
