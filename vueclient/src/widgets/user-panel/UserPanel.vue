<script setup lang="ts">
import { AuthService } from '@/api/index'
import { useAuthStore } from '@/shared/stores/authStore'
import UserAvatar from '@/shared/ui/UserAvatar.vue'
import SettingsModal from '@/widgets/settings/SettingsModal.vue'
import AdminPage from '@/pages/admin/AdminPage.vue'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

const { t } = useI18n()

const props = defineProps<{
  username: string
}>()

const authStore = useAuthStore()
const router = useRouter()
const showSettings = ref(false)
const showAdmin = ref(false)
const isAdmin = computed(() => authStore.userRole === 'admin')

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
  <div class="flex items-center gap-2 px-2 py-4 bg-dc-bg-secondary-alt">
    <!-- Avatar -->
    <div class="w-8 h-8 rounded-full overflow-hidden flex-shrink-0">
      <UserAvatar :username="props.username" />
    </div>

    <!-- User info -->
    <div class="flex-1 min-w-0">
      <div class="text-sm font-semibold text-dc-text-heading truncate leading-tight">
        {{ props.username }}
      </div>
      <div class="text-[11px] text-dc-text-muted leading-tight">{{ t('common.online') }}</div>
    </div>

    <!-- Controls -->
    <div class="flex items-center gap-0.5">
      <button
        v-if="isAdmin"
        type="button"
        class="w-8 h-8 rounded flex items-center justify-center text-dc-text-muted hover:text-dc-blurple hover:bg-dc-bg-hover transition-colors"
        :title="t('admin.title')"
        @click="showAdmin = true"
      >
        <font-awesome-icon icon="shield-halved" class="text-[16px]" />
      </button>
      <button
        type="button"
        class="w-8 h-8 rounded flex items-center justify-center text-dc-text-muted hover:text-dc-text hover:bg-dc-bg-hover transition-colors"
        :title="t('settings.title')"
        @click="showSettings = true"
      >
        <font-awesome-icon icon="gear" class="text-[16px]" />
      </button>
      <button
        @click="logout"
        class="w-8 h-8 rounded flex items-center justify-center text-dc-text-muted hover:text-dc-text hover:bg-dc-bg-hover transition-colors"
        :title="t('auth.logOut')"
      >
        <font-awesome-icon icon="right-from-bracket" class="text-[16px]" />
      </button>
    </div>
    <SettingsModal v-if="showSettings" @close="showSettings = false" />

    <Teleport to="body">
      <Transition name="admin-modal">
        <div
          v-if="showAdmin"
          class="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm"
          @click.self="showAdmin = false"
        >
          <div class="w-full h-full">
            <AdminPage modal @close="showAdmin = false" />
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.admin-modal-enter-active,
.admin-modal-leave-active {
  transition: opacity 0.2s ease;
}
.admin-modal-enter-from,
.admin-modal-leave-to {
  opacity: 0;
}
</style>
