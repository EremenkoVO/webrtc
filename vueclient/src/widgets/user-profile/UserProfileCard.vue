<script setup lang="ts">
import { UserService, type UserProfile } from '@/api'
import UserAvatar from '@/shared/ui/UserAvatar.vue'
import { onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const props = defineProps<{ username: string; open: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const loading = ref(false)
const error = ref('')
const profile = ref<UserProfile | null>(null)

async function loadProfile() {
  if (!props.username || !props.open) return
  loading.value = true
  error.value = ''
  try {
    const res = await UserService.getPublicUserProfile(props.username)
    if (res && 'username' in res) profile.value = res
  } catch {
    error.value = t('common.loading')
  } finally {
    loading.value = false
  }
}

watch(() => props.open, loadProfile)
watch(() => props.username, loadProfile)
onMounted(loadProfile)
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="open"
        class="fixed inset-0 z-[10000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
        @click.self="emit('close')"
      >
        <div
          class="w-full max-w-md rounded-2xl bg-dc-bg-secondary border border-white/10 shadow-2xl overflow-hidden"
        >
          <div
            class="h-24 bg-gradient-to-r from-indigo-500/60 to-fuchsia-500/60"
            :style="profile?.banner_url ? `background-image:url(${profile.banner_url});background-size:cover;background-position:center;` : ''"
          />
          <div class="px-5 pb-5">
            <div class="-mt-8 w-16 h-16 rounded-full overflow-hidden ring-4 ring-dc-bg-secondary">
              <UserAvatar :username="username" />
            </div>
            <div class="mt-3">
              <div class="text-lg font-semibold text-dc-text-heading">
                {{ profile?.display_name || profile?.username || username }}
              </div>
              <div class="text-xs text-dc-text-muted">@{{ profile?.username || username }}</div>
              <div
                v-if="profile?.status_text || profile?.status_emoji"
                class="mt-2 text-sm text-dc-text"
              >
                {{ profile?.status_emoji }} {{ profile?.status_text }}
              </div>
              <p v-if="profile?.bio" class="mt-3 text-sm text-dc-text">{{ profile?.bio }}</p>
            </div>
            <div class="mt-4 grid gap-2 text-sm">
              <a
                v-if="profile?.website_url"
                :href="profile.website_url"
                target="_blank"
                rel="noreferrer"
                class="text-dc-blurple hover:text-dc-blurple-hover"
              >
                {{ profile.website_url }}
              </a>
            </div>
            <div v-if="loading" class="mt-4 text-xs text-dc-text-muted">{{ t('common.loading') }}</div>
            <div v-if="error" class="mt-4 text-xs text-dc-red">{{ error }}</div>
            <div class="mt-5 flex justify-end">
              <button
                type="button"
                class="px-3 py-1.5 text-sm rounded bg-dc-bg-tertiary text-dc-text hover:bg-dc-bg-hover transition-colors"
                @click="emit('close')"
              >
                {{ t('settings.close') }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
