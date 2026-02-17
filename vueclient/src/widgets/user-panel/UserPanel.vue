<script setup lang="ts">
import { AuthService } from '@/api/index'
import { useAuthStore } from '@/shared/stores/authStore'
import { useRouter } from 'vue-router'

const props = defineProps<{
  username: string
}>()

const authStore = useAuthStore()
const router = useRouter()

function getInitials(name: string): string {
  if (!name) return '?'
  return name.substring(0, 2).toUpperCase()
}

function getAvatarColor(name: string): string {
  const colors = [
    '#5865f2', '#3ba55c', '#faa61a', '#ed4245', '#eb459e',
    '#57f287', '#fee75c', '#5865f2', '#eb459e', '#ed4245',
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}

async function logout() {
  try {
    await AuthService.logoutUser()
  } catch {}
  await authStore.clearTokens()
  await router.push({ name: 'Login' })
  window.location.reload()
}
</script>

<template>
  <div class="flex items-center gap-2 px-2 py-1.5 bg-dc-bg-secondary-alt">
    <!-- Avatar -->
    <div
      class="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0"
      :style="{ backgroundColor: getAvatarColor(props.username) }"
    >
      {{ getInitials(props.username) }}
    </div>

    <!-- User info -->
    <div class="flex-1 min-w-0">
      <div class="text-sm font-semibold text-dc-text-heading truncate leading-tight">
        {{ props.username }}
      </div>
      <div class="text-[11px] text-dc-text-muted leading-tight">Online</div>
    </div>

    <!-- Controls -->
    <div class="flex items-center gap-0.5">
      <button
        @click="logout"
        class="w-8 h-8 rounded flex items-center justify-center text-dc-text-muted hover:text-dc-text hover:bg-dc-bg-hover transition-colors"
        title="Log out"
      >
        <font-awesome-icon icon="right-from-bracket" class="text-[16px]" />
      </button>
    </div>
  </div>
</template>
