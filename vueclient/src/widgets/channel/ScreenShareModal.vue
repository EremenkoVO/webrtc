<script setup lang="ts">
import { ref, computed } from 'vue'

export interface ScreenShareOptions {
  displaySurface?: 'monitor' | 'window' | 'application'
  resolution?: { width: number; height: number } | null
  frameRate?: number | null
  audioSource?: 'system' | 'application' | 'none'
}

const props = defineProps<{
  audioDevices: MediaDeviceInfo[]
  currentMicrophoneDeviceId: string | null
}>()

const emit = defineEmits<{
  (e: 'start', options: ScreenShareOptions): void
  (e: 'cancel'): void
}>()

const displaySurface = ref<'monitor' | 'window' | 'application'>('monitor')
const resolution = ref<{ width: number; height: number } | null>(null)
const frameRate = ref<number | null>(null)
const audioSource = ref<'system' | 'application' | 'none'>('system')

const resolutions = [
  { label: 'Native (Original)', value: null },
  { label: '1920x1080 (Full HD)', value: { width: 1920, height: 1080 } },
  { label: '1280x720 (HD)', value: { width: 1280, height: 720 } },
  { label: '1024x768 (XGA)', value: { width: 1024, height: 768 } },
  { label: '854x480 (WVGA)', value: { width: 854, height: 480 } },
]

const frameRates = [
  { label: 'Native (Original)', value: null },
  { label: '60 fps', value: 60 },
  { label: '30 fps', value: 30 },
  { label: '24 fps', value: 24 },
  { label: '15 fps', value: 15 },
]

const canStart = computed(() => {
  return true
})

function handleStart() {
  emit('start', {
    displaySurface: displaySurface.value,
    resolution: resolution.value,
    frameRate: frameRate.value,
    audioSource: audioSource.value,
  })
}

function handleCancel() {
  emit('cancel')
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" @click.self="handleCancel">
    <div class="bg-dc-bg-secondary rounded-lg shadow-xl w-full max-w-md mx-4 border border-dc-separator/40" @click.stop>
      <!-- Header -->
      <div class="px-6 py-4 border-b border-dc-separator/40">
        <div class="flex items-center justify-between">
          <h2 class="text-xl font-semibold text-dc-text-heading">Share Your Screen</h2>
          <button
            @click="handleCancel"
            class="w-8 h-8 flex items-center justify-center rounded hover:bg-dc-bg-hover text-dc-text-muted hover:text-dc-text transition-colors"
          >
            <font-awesome-icon icon="xmark" class="text-lg" />
          </button>
        </div>
      </div>

      <!-- Content -->
      <div class="px-6 py-4 space-y-6 max-h-[70vh] overflow-y-auto">
        <!-- Display Surface -->
        <div>
          <label class="block text-sm font-medium text-dc-text-heading mb-2">
            Share
          </label>
          <div class="grid grid-cols-3 gap-2">
            <button
              v-for="option in [
                { value: 'monitor', label: 'Screen', icon: 'desktop' },
                { value: 'window', label: 'Window', icon: 'window-maximize' },
                { value: 'application', label: 'App', icon: 'window-restore' },
              ]"
              :key="option.value"
              @click="displaySurface = option.value as any"
              :class="[
                'flex flex-col items-center gap-2 px-3 py-2.5 rounded-lg border-2 transition-all',
                displaySurface === option.value
                  ? 'border-dc-blurple bg-dc-blurple/10 text-dc-text-heading'
                  : 'border-dc-separator/40 bg-dc-bg-tertiary text-dc-text-muted hover:border-dc-separator hover:bg-dc-bg-hover',
              ]"
            >
              <font-awesome-icon :icon="option.icon" class="text-lg" />
              <span class="text-xs font-medium">{{ option.label }}</span>
            </button>
          </div>
        </div>

        <!-- Resolution -->
        <div>
          <label class="block text-sm font-medium text-dc-text-heading mb-2">
            Resolution
          </label>
          <select
            v-model="resolution"
            class="w-full px-3 py-2 rounded bg-dc-bg-tertiary text-dc-text border border-dc-separator/40 outline-none focus:ring-2 focus:ring-dc-blurple/40 focus:border-dc-blurple transition-colors"
          >
            <option v-for="res in resolutions" :key="res.label" :value="res.value">
              {{ res.label }}
            </option>
          </select>
        </div>

        <!-- Frame Rate -->
        <div>
          <label class="block text-sm font-medium text-dc-text-heading mb-2">
            Frame Rate
          </label>
          <select
            v-model="frameRate"
            class="w-full px-3 py-2 rounded bg-dc-bg-tertiary text-dc-text border border-dc-separator/40 outline-none focus:ring-2 focus:ring-dc-blurple/40 focus:border-dc-blurple transition-colors"
          >
            <option v-for="fr in frameRates" :key="fr.label" :value="fr.value">
              {{ fr.label }}
            </option>
          </select>
        </div>

        <!-- Audio Source -->
        <div>
          <label class="block text-sm font-medium text-dc-text-heading mb-2">
            Audio Source
          </label>
          <div class="space-y-2">
            <label
              v-for="option in [
                { value: 'system', label: 'System Audio', icon: 'volume-high', description: 'All system sounds' },
                { value: 'application', label: 'Application Audio', icon: 'window-restore', description: 'Selected app audio (browser limitation: same as system)' },
                { value: 'none', label: 'No Audio', icon: 'volume-mute', description: 'Video only' },
              ]"
              :key="option.value"
              :class="[
                'flex items-start gap-3 px-4 py-3 rounded-lg border-2 cursor-pointer transition-all',
                audioSource === option.value
                  ? 'border-dc-blurple bg-dc-blurple/10 text-dc-text-heading'
                  : 'border-dc-separator/40 bg-dc-bg-tertiary text-dc-text-muted hover:border-dc-separator hover:bg-dc-bg-hover',
              ]"
            >
              <input
                type="radio"
                :value="option.value"
                v-model="audioSource"
                class="w-4 h-4 accent-dc-blurple mt-0.5"
              />
              <font-awesome-icon :icon="option.icon" class="text-lg flex-shrink-0 mt-0.5" />
              <div class="flex-1 min-w-0">
                <span class="block text-sm font-medium">{{ option.label }}</span>
                <span class="block text-xs text-dc-text-muted mt-0.5">{{ option.description }}</span>
              </div>
            </label>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="px-6 py-4 border-t border-dc-separator/40 flex items-center justify-end gap-3">
        <button
          @click="handleCancel"
          class="px-4 py-2 rounded text-sm font-medium text-dc-text-muted hover:text-dc-text hover:bg-dc-bg-hover transition-colors"
        >
          Cancel
        </button>
        <button
          @click="handleStart"
          :disabled="!canStart"
          class="px-6 py-2 rounded bg-dc-blurple hover:bg-dc-blurple-hover disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
        >
          Start Sharing
        </button>
      </div>
    </div>
  </div>
</template>
