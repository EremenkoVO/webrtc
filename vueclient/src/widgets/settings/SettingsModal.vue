<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useSettingsStore, THEMES, type Theme } from '@/shared/stores/settingsStore'
import { useChatStore } from '@/shared/stores/chatStore'
import { useAvatarStore } from '@/shared/stores/avatarStore'
import { setLocale, SUPPORTED_LOCALES, type SupportedLocale } from '@/shared/i18n'
import { useWebRTC } from '@/shared/lib/useWebRTC'
import { UserService } from '@/api'
import AvatarEditor from '@/features/avatar/AvatarEditor.vue'
import UserAvatar from '@/shared/ui/UserAvatar.vue'
import { onMounted, ref, watch } from 'vue'

const { t } = useI18n()
const settings = useSettingsStore()
const chatStore = useChatStore()
const avatarStore = useAvatarStore()

watch(
  () => settings.notificationsEnabled,
  (v) => {
    chatStore.notificationsEnabled = v
  },
  { immediate: true },
)
const { videoDevices, audioDevices, fetchVideoDevices, fetchAudioDevices } = useWebRTC()

const emit = defineEmits<{ (e: 'close'): void }>()

const labels: Record<SupportedLocale, string> = {
  en: 'English',
  ru: 'Русский',
}

const showAvatarEditor = ref(false)
const currentUsername = ref<string | null>(null)

onMounted(async () => {
  await fetchAudioDevices()
  await fetchVideoDevices()
  try {
    const profile = await UserService.getCurrentUser()
    if (profile && 'username' in profile && profile.username) {
      currentUsername.value = profile.username
    }
  } catch {
    // ignore
  }
})

async function handleAvatarSave(blob: Blob) {
  await UserService.uploadAvatar(blob)
  if (currentUsername.value) avatarStore.refresh(currentUsername.value)
  showAvatarEditor.value = false
}

function selectLocale(locale: SupportedLocale) {
  setLocale(locale)
}

function handleMicrophoneChange(e: Event) {
  const target = e.target as HTMLSelectElement
  const value = target.value || null
  settings.setDefaultMicrophone(value)
}

function handleCameraChange(e: Event) {
  const target = e.target as HTMLSelectElement
  const value = target.value || null
  settings.setDefaultCamera(value)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm"
        @click.self="emit('close')"
      >
        <div
          class="bg-dc-bg-secondary rounded-lg shadow-xl w-full max-w-md mx-4 border border-dc-separator/40 max-h-[90vh] overflow-hidden flex flex-col modal-content"
          @click.stop
        >
          <!-- Header -->
          <div
            class="px-6 py-4 border-b border-dc-separator/40 flex items-center justify-between flex-shrink-0"
          >
            <h2 class="text-xl font-semibold text-dc-text-heading">{{ t('settings.title') }}</h2>
            <button
              type="button"
              class="w-8 h-8 flex items-center justify-center rounded hover:bg-dc-bg-hover text-dc-text-muted hover:text-dc-text transition-colors"
              @click="emit('close')"
            >
              <font-awesome-icon icon="xmark" class="text-lg" />
            </button>
          </div>

          <!-- Content -->
          <div class="px-6 py-4 space-y-6 overflow-y-auto dc-scrollbar-thin">
            <!-- Avatar -->
            <div class="flex flex-col items-center gap-3 pb-2 border-b border-dc-separator/30">
              <div
                class="relative group w-20 h-20 rounded-full cursor-pointer flex-shrink-0"
                @click="showAvatarEditor = true"
              >
                <div class="w-full h-full rounded-full overflow-hidden bg-dc-bg-tertiary flex items-center justify-center ring-2 ring-dc-separator/40">
                  <UserAvatar v-if="currentUsername" :username="currentUsername" />
                  <font-awesome-icon v-else icon="user" class="text-3xl text-dc-text-muted" />
                </div>
                <div class="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                  <font-awesome-icon icon="camera" class="text-white text-xl" />
                </div>
              </div>
              <button
                class="text-xs font-medium text-dc-blurple hover:text-dc-blurple-hover transition-colors"
                @click="showAvatarEditor = true"
              >
                {{ t('settings.avatar.change') }}
              </button>
            </div>

            <!-- Default microphone -->
            <div>
              <label class="block text-sm font-medium text-dc-text-heading mb-2">
                {{ t('settings.defaultMicrophone') }}
              </label>
              <select
                :value="settings.defaultMicrophoneId ?? ''"
                class="w-full px-3 py-2 rounded bg-dc-bg-tertiary text-dc-text border border-dc-separator/40 outline-none focus:ring-2 focus:ring-dc-blurple/40"
                @change="handleMicrophoneChange"
              >
                <option value="">{{ t('settings.noDevice') }}</option>
                <option v-for="d in audioDevices" :key="d.deviceId" :value="d.deviceId">
                  {{ d.label || `${t('call.microphone')} ${audioDevices.indexOf(d) + 1}` }}
                </option>
              </select>
            </div>

            <!-- Default camera -->
            <div>
              <label class="block text-sm font-medium text-dc-text-heading mb-2">
                {{ t('settings.defaultCamera') }}
              </label>
              <select
                :value="settings.defaultCameraId ?? ''"
                class="w-full px-3 py-2 rounded bg-dc-bg-tertiary text-dc-text border border-dc-separator/40 outline-none focus:ring-2 focus:ring-dc-blurple/40"
                @change="handleCameraChange"
              >
                <option value="">{{ t('settings.noDevice') }}</option>
                <option v-for="d in videoDevices" :key="d.deviceId" :value="d.deviceId">
                  {{ d.label || `${t('call.camera')} ${videoDevices.indexOf(d) + 1}` }}
                </option>
              </select>
            </div>

            <!-- Language -->
            <div>
              <label class="block text-sm font-medium text-dc-text-heading mb-2">
                {{ t('settings.language') }}
              </label>
              <div class="flex rounded-md bg-dc-bg-tertiary p-0.5">
                <button
                  v-for="loc in SUPPORTED_LOCALES"
                  :key="loc"
                  type="button"
                  :class="[
                    'flex-1 py-2 px-3 rounded-[5px] text-sm font-medium transition-colors',
                    $i18n.locale === loc
                      ? 'bg-dc-bg-active text-dc-text-heading'
                      : 'text-dc-text-muted hover:text-dc-text hover:bg-dc-bg-hover/50',
                  ]"
                  @click="selectLocale(loc)"
                >
                  {{ labels[loc] }}
                </button>
              </div>
            </div>

            <!-- Theme -->
            <div>
              <label class="block text-sm font-medium text-dc-text-heading mb-2">
                {{ t('settings.theme') }}
              </label>
              <div class="grid grid-cols-2 gap-2">
                <button
                  v-for="th in THEMES"
                  :key="th.id"
                  type="button"
                  @click="settings.setTheme(th.id as Theme)"
                  :class="[
                    'flex items-center gap-2.5 px-3 py-2.5 rounded-lg border-2 text-left transition-colors',
                    settings.theme === th.id
                      ? 'border-dc-blurple bg-dc-blurple/10'
                      : 'border-dc-separator/40 hover:border-dc-separator bg-dc-bg-tertiary/50',
                  ]"
                >
                  <div class="flex rounded overflow-hidden flex-shrink-0">
                    <div class="w-3.5 h-7" :style="{ background: th.colors[0] }" />
                    <div class="w-3.5 h-7" :style="{ background: th.colors[1] }" />
                    <div class="w-3.5 h-7" :style="{ background: th.colors[2] }" />
                  </div>
                  <span class="flex-1 text-sm font-medium text-dc-text-heading">{{ th.label }}</span>
                  <font-awesome-icon
                    v-if="settings.theme === th.id"
                    icon="check"
                    class="text-dc-blurple text-sm flex-shrink-0"
                  />
                </button>
              </div>
            </div>

            <!-- Chat notifications -->
            <div class="flex items-start gap-3">
              <input
                :id="'settings-notifications'"
                type="checkbox"
                :checked="settings.notificationsEnabled"
                class="w-4 h-4 mt-0.5 rounded accent-dc-blurple"
                @change="
                  (e) => settings.setNotificationsEnabled((e.target as HTMLInputElement).checked)
                "
              />
              <label :for="'settings-notifications'" class="flex-1 cursor-pointer">
                <span class="block text-sm font-medium text-dc-text-heading">{{
                  t('settings.notifications')
                }}</span>
                <span class="block text-xs text-dc-text-muted mt-0.5">{{
                  t('settings.notificationsDesc')
                }}</span>
              </label>
            </div>

            <!-- Sound on connect -->
            <div class="flex items-start gap-3">
              <input
                :id="'settings-sound-connect'"
                type="checkbox"
                :checked="settings.soundOnConnect"
                class="w-4 h-4 mt-0.5 rounded accent-dc-blurple"
                @change="(e) => settings.setSoundOnConnect((e.target as HTMLInputElement).checked)"
              />
              <label :for="'settings-sound-connect'" class="flex-1 cursor-pointer">
                <span class="block text-sm font-medium text-dc-text-heading">{{
                  t('settings.soundOnConnect')
                }}</span>
                <span class="block text-xs text-dc-text-muted mt-0.5">{{
                  t('settings.soundOnConnectDesc')
                }}</span>
              </label>
            </div>
          </div>

          <!-- Footer -->
          <div class="px-6 py-4 border-t border-dc-separator/40 flex justify-end flex-shrink-0">
            <button
              type="button"
              class="px-4 py-2 rounded bg-dc-blurple hover:bg-dc-blurple-hover text-white text-sm font-medium transition-colors"
              @click="emit('close')"
            >
              {{ t('settings.close') }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <AvatarEditor
    v-if="showAvatarEditor"
    @save="handleAvatarSave"
    @close="showAvatarEditor = false"
  />
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
