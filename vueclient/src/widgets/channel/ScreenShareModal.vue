<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

export interface ScreenShareOptions {
  resolution?: { width: number; height: number } | null
  frameRate?: number | null
}

const props = defineProps<{}>()

const emit = defineEmits<{
  (e: 'start', options: ScreenShareOptions): void
  (e: 'cancel'): void
}>()

const visible = ref(true)

const resolution = ref<{ width: number; height: number } | null>(null)
const frameRate = ref<number | null>(null)

const resolutions = computed(() => [
  { label: t('screenShare.resolutionNative'), value: null },
  { label: t('screenShare.resolution1080p'), value: { width: 1920, height: 1080 } },
  { label: t('screenShare.resolution720p'), value: { width: 1280, height: 720 } },
  { label: t('screenShare.resolution480p'), value: { width: 854, height: 480 } },
  { label: t('screenShare.resolution360p'), value: { width: 640, height: 360 } },
])

const frameRates = computed(() => [
  { label: t('screenShare.fpsNative'), value: null },
  { label: t('screenShare.fps60'), value: 60 },
  { label: t('screenShare.fps30'), value: 30 },
])

const canStart = computed(() => {
  return true
})

function isResolutionSelected(res: { width: number; height: number } | null): boolean {
  const r = resolution.value
  if (r == null && res == null) return true
  if (r == null || res == null) return false
  return r.width === res.width && r.height === res.height
}

function handleStart() {
  emit('start', {
    resolution: resolution.value,
    frameRate: frameRate.value,
  })
}

function handleCancel() {
  visible.value = false
  setTimeout(() => emit('cancel'), 200)
}
</script>

<template>
  <Transition name="modal">
    <div v-if="visible" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" @click.self="handleCancel">
      <div class="bg-dc-bg-secondary rounded-lg shadow-xl w-full max-w-md mx-4 border border-dc-separator/40 modal-content" @click.stop>
      <!-- Header -->
      <div class="px-6 py-4 border-b border-dc-separator/40">
        <div class="flex items-center justify-between">
          <h2 class="text-xl font-semibold text-dc-text-heading">{{ t('screenShare.title') }}</h2>
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
        <!-- Info message -->
        <div class="bg-dc-blurple/10 border border-dc-blurple/20 rounded-lg p-3 flex items-start gap-2.5">
          <font-awesome-icon icon="circle-info" class="text-dc-blurple mt-0.5 flex-shrink-0" />
          <div class="text-sm text-dc-text">
            <p class="font-medium text-dc-text-heading mb-1">{{ t('screenShare.browserDialogTitle') }}</p>
            <p class="text-dc-text-muted">{{ t('screenShare.browserDialogHint') }}</p>
          </div>
        </div>

        <!-- Resolution -->
        <div>
          <label class="block text-sm font-medium text-dc-text-heading mb-2">
            {{ t('screenShare.resolution') }}
          </label>
          <div class="flex rounded-md bg-dc-bg-tertiary p-0.5">
            <button
              v-for="res in resolutions"
              :key="res.label"
              type="button"
              @click="resolution = res.value"
              :class="[
                'flex-1 min-w-0 py-2 px-2 rounded-[5px] text-sm font-medium transition-colors',
                isResolutionSelected(res.value)
                  ? 'bg-dc-bg-active text-dc-text-heading'
                  : 'text-dc-text-muted hover:text-dc-text hover:bg-dc-bg-hover/50',
              ]"
            >
              {{ res.label }}
            </button>
          </div>
        </div>

        <!-- Frame Rate -->
        <div>
          <label class="block text-sm font-medium text-dc-text-heading mb-2">
            {{ t('screenShare.frameRate') }}
          </label>
          <div class="flex rounded-md bg-dc-bg-tertiary p-0.5">
            <button
              v-for="fr in frameRates"
              :key="fr.label"
              type="button"
              @click="frameRate = fr.value"
              :class="[
                'flex-1 py-2 px-3 rounded-[5px] text-sm font-medium transition-colors',
                frameRate === fr.value
                  ? 'bg-dc-bg-active text-dc-text-heading'
                  : 'text-dc-text-muted hover:text-dc-text hover:bg-dc-bg-hover/50',
              ]"
            >
              {{ fr.label }}
            </button>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="px-6 py-4 border-t border-dc-separator/40 flex items-center justify-end gap-3">
        <button
          @click="handleCancel"
          class="px-4 py-2 rounded text-sm font-medium text-dc-text-muted hover:text-dc-text hover:bg-dc-bg-hover transition-colors"
        >
          {{ t('common.cancel') }}
        </button>
        <button
          @click="handleStart"
          :disabled="!canStart"
          class="px-6 py-2 rounded bg-dc-blurple hover:bg-dc-blurple-hover disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
        >
          {{ t('screenShare.startSharing') }}
        </button>
      </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.modal-enter-active {
  transition: opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}
.modal-leave-active {
  transition: opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}
.modal-enter-active .modal-content {
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.modal-leave-active .modal-content {
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}
.modal-enter-from {
  opacity: 0;
}
.modal-enter-from .modal-content {
  opacity: 0;
  transform: scale(0.9) translateY(-20px);
}
.modal-leave-to {
  opacity: 0;
}
.modal-leave-to .modal-content {
  opacity: 0;
  transform: scale(0.95) translateY(-10px);
}
</style>
