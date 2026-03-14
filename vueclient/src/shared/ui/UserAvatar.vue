<script setup lang="ts">
import { useAvatarStore } from '@/shared/stores/avatarStore'
import { computed, ref, watch } from 'vue'

const props = defineProps<{ username: string }>()

const avatarStore = useAvatarStore()
const imgError = ref(false)

const src = computed(() => {
  if (!props.username) return ''
  const bust = avatarStore.getCacheBust(props.username)
  const base = `/api/v1/avatars/${encodeURIComponent(props.username)}`
  return bust ? `${base}?t=${bust}` : base
})

// Reset error when src changes (username or cacheBust updated)
watch(src, () => {
  imgError.value = false
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

function getInitials(name: string): string {
  if (!name) return '?'
  return name.substring(0, 2).toUpperCase()
}
</script>

<template>
  <img
    v-if="!imgError && username"
    :src="src"
    :alt="username"
    class="w-full h-full object-cover"
    @error="imgError = true"
  />
  <div
    v-else
    class="w-full h-full flex items-center justify-center text-white font-semibold"
    :style="{ backgroundColor: getAvatarColor(username) }"
  >
    {{ getInitials(username) }}
  </div>
</template>
