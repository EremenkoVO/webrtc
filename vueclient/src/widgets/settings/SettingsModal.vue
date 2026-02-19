<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '@/shared/stores/settingsStore'
import { useChatStore } from '@/shared/stores/chatStore'
import { setLocale, SUPPORTED_LOCALES, type SupportedLocale } from '@/shared/i18n'
import { useWebRTC } from '@/shared/lib/useWebRTC'
import { onMounted, watch } from 'vue'

const { t } = useI18n()
const settings = useSettingsStore()
const chatStore = useChatStore()

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

onMounted(async () => {
  await fetchAudioDevices()
  await fetchVideoDevices()
})

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
