<script setup lang="ts">
import { faMinus, faPlus } from '@fortawesome/free-solid-svg-icons'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

defineProps<{ currentAvatarUrl?: string | null }>()

const emit = defineEmits<{
  (e: 'save', blob: Blob): void
  (e: 'close'): void
}>()

const CANVAS_SIZE = 300
const OUTPUT_SIZE = 256

const fileInputRef = ref<HTMLInputElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const imageEl = ref<HTMLImageElement | null>(null)
const step = ref<'select' | 'crop'>('select')
const isSaving = ref(false)

// Transform state
const offsetX = ref(0)
const offsetY = ref(0)
const scale = ref(1)
const isDragging = ref(false)
let dragStartX = 0
let dragStartY = 0
let dragStartOffsetX = 0
let dragStartOffsetY = 0

function openFilePicker() {
  fileInputRef.value?.click()
}

function handleFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const url = URL.createObjectURL(file)
  const img = new Image()
  img.onload = () => {
    imageEl.value = img
    URL.revokeObjectURL(url)
    // Cover fit: image fills the circle
    scale.value = Math.max(CANVAS_SIZE / img.naturalWidth, CANVAS_SIZE / img.naturalHeight)
    offsetX.value = 0
    offsetY.value = 0
    step.value = 'crop'
    requestAnimationFrame(draw)
  }
  img.src = url
  input.value = ''
}

function draw() {
  const canvas = canvasRef.value
  const img = imageEl.value
  if (!canvas || !img) return

  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)

  const cx = CANVAS_SIZE / 2
  const cy = CANVAS_SIZE / 2
  const radius = CANVAS_SIZE / 2 - 2
  const w = img.naturalWidth * scale.value
  const h = img.naturalHeight * scale.value
  const x = cx + offsetX.value - w / 2
  const y = cy + offsetY.value - h / 2

  // Draw dimmed image outside the circle (shows what's cropped)
  ctx.globalAlpha = 0.25
  ctx.drawImage(img, x, y, w, h)
  ctx.globalAlpha = 1

  // Draw image clipped to circle (full brightness = what you get)
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.clip()
  ctx.drawImage(img, x, y, w, h)
  ctx.restore()

  // Circle border
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.stroke()
}

function onCanvasMouseDown(e: MouseEvent) {
  isDragging.value = true
  dragStartX = e.clientX
  dragStartY = e.clientY
  dragStartOffsetX = offsetX.value
  dragStartOffsetY = offsetY.value
  e.preventDefault()
}

function onMouseMove(e: MouseEvent) {
  if (!isDragging.value) return
  offsetX.value = dragStartOffsetX + (e.clientX - dragStartX)
  offsetY.value = dragStartOffsetY + (e.clientY - dragStartY)
  requestAnimationFrame(draw)
}

function onMouseUp() {
  isDragging.value = false
}

function onCanvasWheel(e: WheelEvent) {
  e.preventDefault()
  const factor = e.deltaY > 0 ? 0.92 : 1.09
  scale.value = Math.max(0.05, Math.min(20, scale.value * factor))
  requestAnimationFrame(draw)
}

function zoomIn() {
  scale.value = Math.min(20, scale.value * 1.12)
  requestAnimationFrame(draw)
}

function zoomOut() {
  scale.value = Math.max(0.05, scale.value / 1.12)
  requestAnimationFrame(draw)
}

function resetTransform() {
  const img = imageEl.value
  if (!img) return
  scale.value = Math.max(CANVAS_SIZE / img.naturalWidth, CANVAS_SIZE / img.naturalHeight)
  offsetX.value = 0
  offsetY.value = 0
  requestAnimationFrame(draw)
}

async function handleSave() {
  const img = imageEl.value
  if (!img) return
  isSaving.value = true
  try {
    const out = document.createElement('canvas')
    out.width = OUTPUT_SIZE
    out.height = OUTPUT_SIZE
    const ctx = out.getContext('2d')!
    const ratio = OUTPUT_SIZE / CANVAS_SIZE
    const w = img.naturalWidth * scale.value * ratio
    const h = img.naturalHeight * scale.value * ratio
    const cx = OUTPUT_SIZE / 2
    const cy = OUTPUT_SIZE / 2
    const x = cx + offsetX.value * ratio - w / 2
    const y = cy + offsetY.value * ratio - h / 2
    ctx.beginPath()
    ctx.arc(cx, cy, OUTPUT_SIZE / 2, 0, Math.PI * 2)
    ctx.clip()
    ctx.drawImage(img, x, y, w, h)
    await new Promise<void>((resolve) => {
      out.toBlob(
        (blob) => {
          if (blob) emit('save', blob)
          resolve()
        },
        'image/jpeg',
        0.92,
      )
    })
  } finally {
    isSaving.value = false
  }
}

onMounted(() => {
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
})
onBeforeUnmount(() => {
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', onMouseUp)
})
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      @click.self="emit('close')"
    >
      <div
        class="bg-dc-bg-secondary rounded-xl shadow-2xl w-full max-w-sm mx-4 border border-dc-separator/40 overflow-hidden"
        @click.stop
      >
        <!-- Header -->
        <div class="px-5 py-4 border-b border-dc-separator/40 flex items-center justify-between">
          <h3 class="text-base font-semibold text-dc-text-heading">
            {{ step === 'select' ? t('settings.avatar.change') : t('settings.avatar.adjust') }}
          </h3>
          <button
            class="w-7 h-7 flex items-center justify-center rounded hover:bg-dc-bg-hover text-dc-text-muted hover:text-dc-text transition-colors"
            @click="emit('close')"
          >
            <font-awesome-icon icon="xmark" />
          </button>
        </div>

        <!-- Step: select file -->
        <div v-if="step === 'select'" class="p-6">
          <div
            class="flex flex-col items-center gap-4 p-8 rounded-xl border-2 border-dashed border-dc-separator hover:border-dc-blurple/60 transition-colors cursor-pointer select-none"
            @click="openFilePicker"
          >
            <div class="w-16 h-16 rounded-full bg-dc-bg-tertiary flex items-center justify-center">
              <font-awesome-icon icon="camera" class="text-2xl text-dc-text-muted" />
            </div>
            <div class="text-center">
              <p class="text-sm font-medium text-dc-text">
                {{ t('settings.avatar.clickToUpload') }}
              </p>
              <p class="text-xs text-dc-text-muted mt-1">{{ t('settings.avatar.fileHint') }}</p>
            </div>
          </div>
          <input
            ref="fileInputRef"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            class="hidden"
            @change="handleFileChange"
          />
        </div>

        <!-- Step: crop -->
        <div v-else class="p-5 flex flex-col items-center gap-4">
          <!-- Canvas crop area -->
          <canvas
            ref="canvasRef"
            :width="CANVAS_SIZE"
            :height="CANVAS_SIZE"
            class="rounded-full"
            style="width: 240px; height: 240px; cursor: grab"
            :style="{ cursor: isDragging ? 'grabbing' : 'grab' }"
            @mousedown="onCanvasMouseDown"
            @wheel.prevent="onCanvasWheel"
          />

          <!-- Zoom controls -->
          <div class="flex items-center gap-2">
            <button
              class="w-8 h-8 flex items-center justify-center rounded-full bg-dc-bg-tertiary hover:bg-dc-bg-hover text-dc-text transition-colors"
              @click="zoomOut"
            >
              <font-awesome-icon :icon="faMinus" class="text-xs" />
            </button>
            <button
              class="px-3 py-1 text-xs rounded bg-dc-bg-tertiary hover:bg-dc-bg-hover text-dc-text-muted transition-colors"
              @click="resetTransform"
            >
              {{ t('settings.avatar.reset') }}
            </button>
            <button
              class="w-8 h-8 flex items-center justify-center rounded-full bg-dc-bg-tertiary hover:bg-dc-bg-hover text-dc-text transition-colors"
              @click="zoomIn"
            >
              <font-awesome-icon :icon="faPlus" class="text-xs" />
            </button>
          </div>

          <button
            class="text-xs text-dc-blurple hover:text-dc-blurple-hover transition-colors"
            @click="openFilePicker"
          >
            {{ t('settings.avatar.chooseDifferent') }}
          </button>
          <input
            ref="fileInputRef"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            class="hidden"
            @change="handleFileChange"
          />
        </div>

        <!-- Footer -->
        <div class="px-5 py-4 border-t border-dc-separator/40 flex gap-3 justify-end">
          <button
            class="px-4 py-2 rounded text-sm text-dc-text-muted hover:text-dc-text hover:bg-dc-bg-hover transition-colors"
            @click="step === 'crop' ? (step = 'select') : emit('close')"
          >
            {{ t('common.cancel') }}
          </button>
          <button
            v-if="step === 'crop'"
            :disabled="isSaving"
            class="px-4 py-2 rounded bg-dc-blurple hover:bg-dc-blurple-hover text-white text-sm font-medium transition-colors disabled:opacity-50"
            @click="handleSave"
          >
            {{ isSaving ? t('common.loading') : t('common.ok') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
