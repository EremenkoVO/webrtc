<script setup lang="ts">
import UserAvatar from '@/shared/ui/UserAvatar.vue'
import { useDisplayNameStore } from '@/shared/stores/displayNameStore'
import UserProfileCard from '@/widgets/user-profile/UserProfileCard.vue'
import { computed, ref, watch, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps<{
  name: string
  isMuted: boolean
  isSpeaking: boolean
  isLocal?: boolean
  peerId?: string
  volume?: number
  audioStream?: MediaStream
  isConnecting?: boolean
  isDeafened?: boolean
}>()

const emit = defineEmits<{
  'update:muted': [muted: boolean]
  'update:volume': [volume: number]
}>()

const audioRef = ref<HTMLAudioElement | null>(null)
const localMuted = ref(props.isMuted)
const localVolume = ref(props.volume ?? 1)
const showMenu = ref(false)
const showProfile = ref(false)
const displayNameStore = useDisplayNameStore()
const shownName = computed(() => displayNameStore.get(props.name))

watch(
  () => props.isMuted,
  (v) => {
    localMuted.value = v
  },
)
watch(
  () => props.volume,
  (v) => {
    if (v !== undefined) localVolume.value = v
  },
)

watchEffect(() => {
  if (props.isLocal || !audioRef.value) return
  const stream = props.audioStream
  if (stream && stream.getAudioTracks().length > 0) {
    audioRef.value.srcObject = new MediaStream(stream.getAudioTracks())
    audioRef.value.muted = false
    audioRef.value.volume = (localMuted.value || props.isDeafened) ? 0 : localVolume.value
    audioRef.value.play().catch(() => {})
  } else {
    audioRef.value.srcObject = null
  }
})

watch([() => localMuted.value, () => localVolume.value, () => props.isDeafened], () => {
  if (audioRef.value) audioRef.value.volume = (localMuted.value || props.isDeafened) ? 0 : localVolume.value
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
    <button
      type="button"
      class="w-14 h-14 2xl:w-16 2xl:h-16 rounded-full mb-2 relative"
      @click="showProfile = true"
    >
      <div class="absolute inset-0 rounded-full overflow-hidden">
        <UserAvatar :username="name" />
      </div>
      <div
        v-if="isSpeaking"
        class="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-dc-green border-[3px] border-dc-bg-secondary-alt"
      />
      <!-- Connecting indicator -->
      <div
        v-if="isConnecting && !isSpeaking"
        class="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-dc-blurple border-[3px] border-dc-bg-secondary-alt flex items-center justify-center"
      >
        <div class="w-2 h-2 bg-white rounded-full animate-pulse" />
      </div>
    </button>

    <!-- Name -->
    <div class="text-xs 2xl:text-sm font-medium text-dc-text truncate max-w-full px-1 text-center">
      {{ isLocal ? `${shownName} (${t('common.you')})` : shownName }}
      <span v-if="isConnecting" class="block text-[10px] text-dc-text-muted mt-0.5">
        {{ t('common.connecting') }}
      </span>
    </div>

    <!-- Mic status -->
    <div class="mt-1.5 flex items-center gap-1">
      <div
        :class="[
          'flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px]',
          localMuted ? 'bg-dc-red/20 text-dc-red' : 'bg-dc-green/15 text-dc-green',
        ]"
      >
        <font-awesome-icon
          :icon="localMuted ? 'microphone-slash' : 'microphone'"
          class="text-[10px]"
        />
      </div>
    </div>

    <!-- Context menu for volume -->
    <Transition name="fade">
      <div
        v-if="!isLocal && showMenu"
        class="absolute z-20 top-full left-1/2 -translate-x-1/2 mt-1 bg-dc-bg-floating border border-dc-separator rounded shadow-lg p-2 w-40 flex flex-col gap-1.5"
        @click.stop
      >
        <button
          class="flex items-center gap-2 px-2 py-1.5 rounded text-sm text-dc-text hover:bg-dc-bg-hover transition-colors text-left w-full"
          @click="toggleMute(); showMenu = false"
        >
          {{ localMuted ? t('common.unmute') : t('common.mute') }}
        </button>
        <div class="flex flex-col gap-1">
          <span class="text-[10px] uppercase tracking-wide text-dc-text-muted">{{
            t('common.volume')
          }}</span>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            :value="Math.round(localVolume * 100)"
            class="accent-dc-blurple cursor-pointer w-full"
            @input="handleVolumeInput"
            @click.stop
          />
        </div>
      </div>
    </Transition>
  </div>
  <UserProfileCard :username="name" :open="showProfile" @close="showProfile = false" />
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
