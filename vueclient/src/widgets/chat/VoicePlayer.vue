<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps<{ src: string; duration: number }>()

const audioRef = ref<HTMLAudioElement | null>(null)
const seekBarRef = ref<HTMLInputElement | null>(null)
const isPlaying = ref(false)
const currentTime = ref(0)
const audioDuration = ref(props.duration)

const progress = computed(() => {
  const d = audioDuration.value || props.duration
  return d ? (currentTime.value / d) * 100 : 0
})

function togglePlay() {
  const audio = audioRef.value
  if (!audio) return
  if (isPlaying.value) {
    audio.pause()
  } else {
    audio.play().catch(console.error)
  }
}

function onSeekInput(e: Event) {
  const audio = audioRef.value
  if (!audio) return
  const val = Number((e.target as HTMLInputElement).value)
  const d = audioDuration.value || props.duration
  if (d) audio.currentTime = (val / 100) * d
}

function onTimeUpdate() {
  currentTime.value = audioRef.value?.currentTime ?? 0
}

function onDurationChange() {
  const d = audioRef.value?.duration
  if (d && isFinite(d)) audioDuration.value = d
}

function onEnded() {
  isPlaying.value = false
  currentTime.value = 0
  if (audioRef.value) audioRef.value.currentTime = 0
}

function fmt(s: number): string {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

const displayTime = computed(() => fmt(currentTime.value))
const displayDuration = computed(() => fmt(audioDuration.value || props.duration))

watch(
  () => props.src,
  () => {
    isPlaying.value = false
    currentTime.value = 0
    audioDuration.value = props.duration
  },
)

onBeforeUnmount(() => {
  audioRef.value?.pause()
})
</script>

<template>
  <div class="flex items-center gap-2.5 py-1 max-w-[300px] min-w-[220px]">
    <audio
      ref="audioRef"
      :src="src"
      preload="metadata"
      @timeupdate="onTimeUpdate"
      @durationchange="onDurationChange"
      @ended="onEnded"
      @play="isPlaying = true"
      @pause="isPlaying = false"
    />

    <!-- Play / Pause button -->
    <button
      @click="togglePlay"
      class="w-9 h-9 rounded-full bg-dc-blurple hover:bg-dc-blurple-hover flex items-center justify-center flex-shrink-0 transition-colors shadow-sm"
    >
      <font-awesome-icon
        :icon="isPlaying ? 'pause' : 'play'"
        class="text-white text-[13px]"
        :style="isPlaying ? {} : { marginLeft: '1px' }"
      />
    </button>

    <!-- Seek bar + timer -->
    <div class="flex-1 min-w-0 flex flex-col gap-0.5">
      <div class="relative flex items-center h-4">
        <input
          ref="seekBarRef"
          type="range"
          min="0"
          max="100"
          step="0.1"
          :value="progress"
          @input="onSeekInput"
          class="seek-range w-full"
        />
      </div>
      <span class="text-[11px] font-mono text-dc-text-muted tabular-nums">
        {{ displayTime }} / {{ displayDuration }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.seek-range {
  -webkit-appearance: none;
  appearance: none;
  height: 4px;
  border-radius: 2px;
  background: rgba(148, 155, 164, 0.38);
  outline: none;
  cursor: pointer;
  background-image: linear-gradient(#5865f2, #5865f2);
  background-size: v-bind('progress + "%"') 100%;
  background-repeat: no-repeat;
}

.seek-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #5865f2;
  cursor: pointer;
  transition: transform 0.1s;
}

.seek-range::-moz-range-thumb {
  width: 12px;
  height: 12px;
  border: none;
  border-radius: 50%;
  background: #5865f2;
  cursor: pointer;
}

.seek-range:hover::-webkit-slider-thumb {
  transform: scale(1.2);
}

.seek-range::-webkit-slider-runnable-track {
  height: 4px;
  border-radius: 2px;
}

.seek-range::-moz-range-track {
  height: 4px;
  border-radius: 2px;
  background: rgba(148, 155, 164, 0.38);
}

.seek-range::-moz-range-progress {
  height: 4px;
  border-radius: 2px;
  background: #5865f2;
}
</style>
