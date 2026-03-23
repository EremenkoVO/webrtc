<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

interface PickerOptions {
  resolution?: { width: number; height: number } | null
  frameRate?: number | null
}

const emit = defineEmits<{
  start: [options: PickerOptions & { sourceId: string; sourceType: 'screen' | 'window'; captureAudio: boolean }]
  cancel: []
}>()

// ── State ─────────────────────────────────────────────────────────────────────
const sources     = ref<CaptureSource[]>([])
const loading     = ref(true)
const activeTab   = ref<'screen' | 'window'>('screen')
const selectedId  = ref<string | null>(null)
const captureAudio = ref(true)
const resolution  = ref<string>('native')
const frameRate   = ref<string>('native')
const visible     = ref(true)

const screens = computed(() => sources.value.filter((s) => s.type === 'screen'))
const windows = computed(() => sources.value.filter((s) => s.type === 'window'))
const list    = computed(() => (activeTab.value === 'screen' ? screens.value : windows.value))

const selectedSource = computed(() =>
  sources.value.find((s) => s.id === selectedId.value) ?? null
)
const canCaptureAudio = computed(() => {
  return activeTab.value === 'screen'
})

const resolutionMap: Record<string, { width: number; height: number } | null> = {
  native: null,
  '1080p': { width: 1920, height: 1080 },
  '720p':  { width: 1280, height: 720 },
  '480p':  { width: 854,  height: 480 },
}
const frameRateMap: Record<string, number | null> = {
  native: null, '60': 60, '30': 30,
}

// ── Load sources ──────────────────────────────────────────────────────────────
onMounted(async () => {
  try {
    sources.value = await window.electronAPI!.capturer.getSources()
    if (screens.value.length) selectedId.value = screens.value[0].id
  } finally {
    loading.value = false
  }
})

function selectSource(s: CaptureSource) {
  selectedId.value = s.id
  activeTab.value  = s.type
}

function switchTab(tab: 'screen' | 'window') {
  activeTab.value = tab
  if (tab === 'window') captureAudio.value = false
  const first = (tab === 'screen' ? screens : windows).value[0]
  if (first) selectedId.value = first.id
}

// ── Actions ───────────────────────────────────────────────────────────────────
function cancel() {
  visible.value = false
  setTimeout(() => emit('cancel'), 200)
}

function startShare() {
  if (!selectedId.value || !selectedSource.value) return
  visible.value = false
  setTimeout(() => {
    emit('start', {
      sourceId:     selectedId.value!,
      sourceType:   selectedSource.value!.type,
      captureAudio: canCaptureAudio.value ? captureAudio.value : false,
      resolution:   resolutionMap[resolution.value],
      frameRate:    frameRateMap[frameRate.value],
    })
  }, 200)
}
</script>

<template>
  <Transition name="modal">
    <div
      v-if="visible"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      @click.self="cancel"
    >
      <div class="modal-content bg-dc-bg-secondary rounded-xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[90dvh] overflow-hidden">

        <!-- Header -->
        <div class="flex items-center justify-between px-5 py-4 border-b border-dc-separator/30 flex-shrink-0">
          <h2 class="text-dc-text-primary font-semibold text-base">
            {{ t('screenShare.pickerTitle') }}
          </h2>
          <button class="text-dc-text-muted hover:text-dc-text-primary transition-colors p-1 rounded" @click="cancel">
            <font-awesome-icon icon="xmark" />
          </button>
        </div>

        <!-- Tabs -->
        <div class="flex gap-1 px-5 pt-3 pb-2 flex-shrink-0">
          <button
            v-for="tab in (['screen', 'window'] as const)"
            :key="tab"
            class="px-4 py-1.5 rounded-md text-sm font-medium transition-colors"
            :class="activeTab === tab
              ? 'bg-dc-brand text-white'
              : 'text-dc-text-muted hover:text-dc-text-primary hover:bg-dc-bg-primary/60'"
            @click="switchTab(tab)"
          >
            {{ tab === 'screen' ? t('screenShare.screen') : t('screenShare.window') }}
            <span class="ml-1 opacity-60 text-xs">
              {{ (tab === 'screen' ? screens : windows).length }}
            </span>
          </button>
        </div>

        <!-- Source grid -->
        <div class="flex-1 overflow-y-auto px-5 py-2 min-h-0">
          <div v-if="loading" class="flex items-center justify-center h-40 text-dc-text-muted">
            <font-awesome-icon icon="circle-notch" spin class="mr-2" />
            {{ t('common.loading') }}
          </div>

          <div v-else-if="list.length === 0" class="flex items-center justify-center h-40 text-dc-text-muted text-sm">
            {{ t('screenShare.noSources') }}
          </div>

          <div v-else class="grid grid-cols-2 sm:grid-cols-3 gap-3 pb-2">
            <button
              v-for="src in list"
              :key="src.id"
              class="relative rounded-lg overflow-hidden border-2 transition-all focus:outline-none group"
              :class="selectedId === src.id
                ? 'border-dc-brand shadow-[0_0_0_2px_rgba(88,101,242,0.35)]'
                : 'border-dc-separator/30 hover:border-dc-separator'"
              @click="selectSource(src)"
              @dblclick="startShare"
            >
              <!-- Thumbnail -->
              <div class="aspect-video bg-dc-bg-primary overflow-hidden">
                <img
                  :src="src.thumbnail"
                  :alt="src.name"
                  class="w-full h-full object-cover"
                />
              </div>

              <!-- Label -->
              <div class="flex items-center gap-1.5 px-2 py-1.5 bg-dc-bg-tertiary/80">
                <img v-if="src.appIcon" :src="src.appIcon" class="w-4 h-4 object-contain flex-shrink-0" />
                <font-awesome-icon v-else icon="display" class="text-dc-text-muted text-xs flex-shrink-0" />
                <span class="text-dc-text-secondary text-xs truncate">{{ src.name }}</span>
              </div>

              <!-- Selected overlay tick -->
              <div
                v-if="selectedId === src.id"
                class="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-dc-brand flex items-center justify-center"
              >
                <font-awesome-icon icon="check" class="text-white text-xs" />
              </div>
            </button>
          </div>
        </div>

        <!-- Settings bar -->
        <div class="flex flex-wrap items-center gap-3 px-5 py-3 border-t border-dc-separator/30 flex-shrink-0 bg-dc-bg-tertiary/40">
          <!-- Audio toggle (windows only) -->
          <label
            class="flex items-center gap-2 select-none text-sm text-dc-text-secondary"
            :class="canCaptureAudio ? 'cursor-pointer' : 'opacity-60 cursor-not-allowed'"
          >
            <div
              class="w-9 h-5 rounded-full relative transition-colors"
              :class="captureAudio && canCaptureAudio ? 'bg-dc-brand' : 'bg-dc-separator'"
              @click="canCaptureAudio && (captureAudio = !captureAudio)"
            >
              <div
                class="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform"
                :class="captureAudio && canCaptureAudio ? 'translate-x-4' : 'translate-x-0.5'"
              />
            </div>
            <font-awesome-icon :icon="captureAudio && canCaptureAudio ? 'volume-high' : 'volume-xmark'" class="text-xs" />
            {{ activeTab === 'window' ? t('screenShare.appAudio') : t('screenShare.systemAudio') }}
          </label>

          <div class="flex-1" />

          <!-- Resolution -->
          <select
            v-model="resolution"
            class="text-xs bg-dc-bg-primary border border-dc-separator/40 text-dc-text-secondary rounded px-2 py-1 focus:outline-none focus:border-dc-brand"
          >
            <option value="native">{{ t('screenShare.resolutionNative') }}</option>
            <option value="1080p">1080p</option>
            <option value="720p">720p</option>
            <option value="480p">480p</option>
          </select>

          <!-- Frame rate -->
          <select
            v-model="frameRate"
            class="text-xs bg-dc-bg-primary border border-dc-separator/40 text-dc-text-secondary rounded px-2 py-1 focus:outline-none focus:border-dc-brand"
          >
            <option value="native">{{ t('screenShare.fpsNative') }}</option>
            <option value="30">30 fps</option>
            <option value="60">60 fps</option>
          </select>
        </div>

        <!-- Footer buttons -->
        <div class="flex justify-end gap-2 px-5 py-4 border-t border-dc-separator/30 flex-shrink-0">
          <button
            class="px-4 py-2 rounded-md text-sm font-medium text-dc-text-secondary hover:text-dc-text-primary hover:bg-dc-bg-primary/60 transition-colors"
            @click="cancel"
          >
            {{ t('common.cancel') }}
          </button>
          <button
            class="px-5 py-2 rounded-md text-sm font-medium bg-dc-brand hover:bg-dc-brand/90 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="!selectedId"
            @click="startShare"
          >
            {{ t('screenShare.startSharing') }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>
