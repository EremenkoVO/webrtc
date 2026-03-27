<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps<{
  src: string
  type: 'image' | 'video'
  fileName?: string
}>()

const emit = defineEmits<{ close: [] }>()

const overlayRef = ref<HTMLElement | null>(null)

function close() {
  emit('close')
}

function onOverlayClick(e: MouseEvent) {
  if (e.target === overlayRef.value) close()
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <div
      ref="overlayRef"
      class="fixed inset-0 z-50 flex items-center justify-center bg-dc-modal-backdrop backdrop-blur-sm"
      @click="onOverlayClick"
    >
      <!-- Close button -->
      <button
        class="absolute top-4 right-4 z-10 w-9 h-9 flex items-center justify-center rounded-full bg-dc-bg-floating/95 hover:bg-dc-bg-hover text-dc-text-heading border border-dc-separator/50 shadow-md transition-colors"
        @click="close"
      >
        <font-awesome-icon icon="xmark" class="text-lg" />
      </button>

      <!-- Download button -->
      <a
        :href="src"
        :download="fileName"
        class="absolute top-4 right-16 z-10 w-9 h-9 flex items-center justify-center rounded-full bg-dc-bg-floating/95 hover:bg-dc-bg-hover text-dc-text-heading border border-dc-separator/50 shadow-md transition-colors"
        @click.stop
      >
        <font-awesome-icon icon="download" class="text-sm" />
      </a>

      <!-- Media content -->
      <div class="max-w-[90vw] max-h-[90vh] flex items-center justify-center" @click.stop>
        <img
          v-if="type === 'image'"
          :src="src"
          class="max-w-[90vw] max-h-[90vh] rounded-lg object-contain shadow-2xl select-none"
          draggable="false"
        />
        <video
          v-else
          :src="src"
          controls
          autoplay
          class="max-w-[90vw] max-h-[90vh] rounded-lg shadow-2xl"
        />
      </div>
    </div>
  </Teleport>
</template>
