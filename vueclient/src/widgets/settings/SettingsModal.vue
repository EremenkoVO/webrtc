<script setup lang="ts">
import { UserService } from '@/api'
import AvatarEditor from '@/features/avatar/AvatarEditor.vue'
import { setLocale, SUPPORTED_LOCALES, type SupportedLocale } from '@/shared/i18n'
import { useWebRTC } from '@/shared/lib/useWebRTC'
import { useAvatarStore } from '@/shared/stores/avatarStore'
import { useChatStore } from '@/shared/stores/chatStore'
import { THEMES, useSettingsStore, type Theme } from '@/shared/stores/settingsStore'
import UserAvatar from '@/shared/ui/UserAvatar.vue'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

type Section = 'profile' | 'voice-video' | 'appearance' | 'notifications' | 'security'

const { t } = useI18n()
const settings = useSettingsStore()
const chatStore = useChatStore()
const avatarStore = useAvatarStore()
const emit = defineEmits<{ (e: 'close'): void }>()

const visible = ref(true)
function close() {
  visible.value = false
  setTimeout(() => emit('close'), 200)
}

// Swipe-to-close (mobile bottom sheet)
const dragOffset = ref(0)
const isDragging = ref(false)
let dragStartY = 0

function onDragStart(e: TouchEvent) {
  dragStartY = e.touches[0].clientY
  isDragging.value = true
}

function onDragMove(e: TouchEvent) {
  if (!isDragging.value) return
  const delta = e.touches[0].clientY - dragStartY
  dragOffset.value = Math.max(0, delta)
}

function onDragEnd() {
  isDragging.value = false
  if (dragOffset.value > 100) {
    // fly off screen then emit close (skip Vue transition)
    dragOffset.value = window.innerHeight
    setTimeout(() => emit('close'), 300)
  } else {
    dragOffset.value = 0
  }
}

const activeSection = ref<Section>('profile')
const mobilePage = ref<'menu' | 'section'>('menu')

const menuItems = computed(() => [
  { id: 'profile' as Section, icon: 'user', label: t('settings.menu.profile') },
  { id: 'voice-video' as Section, icon: 'headset', label: t('settings.menu.voiceVideo') },
  { id: 'appearance' as Section, icon: 'gear', label: t('settings.menu.appearance') },
  { id: 'notifications' as Section, icon: 'bell', label: t('settings.menu.notifications') },
  { id: 'security' as Section, icon: 'lock', label: t('settings.menu.security') },
])

const { videoDevices, audioDevices, fetchVideoDevices, fetchAudioDevices } = useWebRTC()
const labels: Record<SupportedLocale, string> = { en: 'English', ru: 'Русский' }

const showAvatarEditor = ref(false)
const currentUsername = ref<string | null>(null)

// Password state
const currentPassword = ref('')
const newPassword = ref('')
const confirmNewPassword = ref('')
const passwordError = ref('')
const passwordSuccess = ref(false)
const passwordLoading = ref(false)

watch(
  () => settings.notificationsEnabled,
  (v) => {
    chatStore.notificationsEnabled = v
  },
  { immediate: true },
)

onMounted(async () => {
  await fetchAudioDevices()
  await fetchVideoDevices()
  try {
    const profile = await UserService.getCurrentUser()
    if (profile && 'username' in profile && profile.username) {
      currentUsername.value = profile.username
    }
  } catch {
    /* ignore */
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
  settings.setDefaultMicrophone((e.target as HTMLSelectElement).value || null)
}

function handleCameraChange(e: Event) {
  settings.setDefaultCamera((e.target as HTMLSelectElement).value || null)
}

async function handleChangePassword() {
  passwordError.value = ''
  passwordSuccess.value = false
  if (newPassword.value !== confirmNewPassword.value) {
    passwordError.value = t('settings.passwordMismatch')
    return
  }
  passwordLoading.value = true
  try {
    await UserService.changePassword(currentPassword.value, newPassword.value)
    passwordSuccess.value = true
    currentPassword.value = ''
    newPassword.value = ''
    confirmNewPassword.value = ''
  } catch (e: any) {
    passwordError.value =
      e?.status === 401 ? t('settings.passwordWrongCurrent') : t('settings.passwordMismatch')
  } finally {
    passwordLoading.value = false
  }
}

function selectSection(s: Section) {
  activeSection.value = s
  passwordError.value = ''
  passwordSuccess.value = false
}

function selectSectionMobile(s: Section) {
  selectSection(s)
  mobilePage.value = 'section'
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="visible"
        class="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center sm:bg-black/60 sm:backdrop-blur-sm"
        :style="
          dragOffset > 0
            ? { backgroundColor: `rgba(0,0,0,${Math.max(0, 0.4 - dragOffset / 400)})` }
            : {}
        "
        @click.self="close"
      >
        <div
          class="modal-content relative bg-dc-bg-secondary w-full h-[92dvh] sm:h-[85vh] rounded-t-2xl sm:rounded-lg shadow-2xl sm:max-w-2xl sm:mx-4 flex flex-col sm:flex-row overflow-hidden sm:border sm:border-dc-separator/40"
          :style="
            dragOffset > 0 || isDragging
              ? {
                  transform: `translateY(${dragOffset}px)`,
                  transition: isDragging
                    ? 'none'
                    : 'transform 0.32s cubic-bezier(0.34, 1.2, 0.64, 1)',
                }
              : {}
          "
          @click.stop
        >
          <!-- ── Desktop: left sidebar (hidden on mobile) ── -->
          <div
            class="hidden sm:flex w-44 flex-shrink-0 bg-dc-bg-tertiary flex-col py-4 overflow-y-auto dc-scrollbar-thin"
          >
            <p
              class="px-4 mb-2 text-[10px] font-bold uppercase tracking-widest text-dc-text-muted select-none"
            >
              {{ t('settings.title') }}
            </p>
            <nav class="flex flex-col gap-0.5 px-2">
              <button
                v-for="item in menuItems"
                :key="item.id"
                type="button"
                :class="[
                  'flex items-center gap-3 px-3 py-2 rounded text-sm font-medium text-left w-full transition-colors',
                  activeSection === item.id
                    ? 'bg-dc-bg-active text-dc-text-heading'
                    : 'text-dc-text-muted hover:bg-dc-bg-hover hover:text-dc-text',
                ]"
                @click="selectSection(item.id)"
              >
                <font-awesome-icon :icon="item.icon" class="w-4 flex-shrink-0" />
                <span class="truncate">{{ item.label }}</span>
              </button>
            </nav>
          </div>

          <!-- ── Mobile: menu list page ── -->
          <Transition name="mobile-menu">
            <div
              v-if="mobilePage === 'menu'"
              class="sm:hidden flex flex-col w-full h-full absolute inset-0 bg-dc-bg-secondary rounded-t-2xl"
            >
              <!-- Drag handle -->
              <div
                class="flex justify-center pt-3 pb-2 flex-shrink-0 touch-none cursor-grab active:cursor-grabbing"
                @touchstart.passive="onDragStart"
                @touchmove.prevent="onDragMove"
                @touchend="onDragEnd"
              >
                <div
                  :class="[
                    'rounded-full bg-dc-separator/60 transition-all duration-150',
                    isDragging ? 'w-12 h-1.5 bg-dc-separator' : 'w-9 h-1',
                  ]"
                />
              </div>
              <!-- Header -->
              <div
                class="flex items-center justify-between px-5 py-3 border-b border-dc-separator/40 flex-shrink-0"
              >
                <span class="text-base font-bold text-dc-text-heading">{{
                  t('settings.title')
                }}</span>
                <button
                  type="button"
                  class="w-8 h-8 flex items-center justify-center rounded-full bg-dc-bg-tertiary text-dc-text-muted hover:text-dc-text transition-colors"
                  @click="close"
                >
                  <font-awesome-icon icon="xmark" class="text-sm" />
                </button>
              </div>
              <!-- Menu items -->
              <nav class="flex-1 overflow-y-auto py-2">
                <button
                  v-for="item in menuItems"
                  :key="item.id"
                  type="button"
                  class="flex items-center gap-4 w-full px-5 py-3.5 text-dc-text hover:bg-dc-bg-hover active:bg-dc-bg-active transition-colors"
                  @click="selectSectionMobile(item.id)"
                >
                  <div
                    class="w-9 h-9 rounded-xl bg-dc-bg-tertiary flex items-center justify-center flex-shrink-0"
                  >
                    <font-awesome-icon :icon="item.icon" class="text-sm text-dc-text-muted" />
                  </div>
                  <span class="flex-1 text-[15px] font-medium text-left">{{ item.label }}</span>
                  <font-awesome-icon icon="chevron-right" class="text-xs text-dc-text-muted/60" />
                </button>
              </nav>
            </div>
          </Transition>

          <!-- ── Section content (desktop: always visible; mobile: when section is selected) ── -->
          <div
            :class="[
              'flex-1 flex flex-col overflow-hidden',
              mobilePage === 'menu' ? 'hidden sm:flex' : 'flex',
            ]"
          >
            <!-- Header -->
            <div
              class="flex items-center gap-2 px-3 pt-3 pb-1 flex-shrink-0 sm:touch-auto touch-none"
              @touchstart.passive="onDragStart"
              @touchmove.prevent="onDragMove"
              @touchend="onDragEnd"
            >
              <!-- Back button (mobile only) -->
              <button
                type="button"
                class="sm:hidden flex w-8 h-8 items-center justify-center rounded-full bg-dc-bg-tertiary text-dc-text-muted hover:text-dc-text transition-colors flex-shrink-0"
                @click="mobilePage = 'menu'"
              >
                <font-awesome-icon icon="chevron-left" class="text-sm" />
              </button>
              <!-- Section title (mobile only) -->
              <span class="sm:hidden flex-1 text-[15px] font-semibold text-dc-text-heading">
                {{ menuItems.find((i) => i.id === activeSection)?.label }}
              </span>
              <!-- Close button -->
              <button
                type="button"
                class="w-8 h-8 flex items-center justify-center rounded hover:bg-dc-bg-hover text-dc-text-muted hover:text-dc-text transition-colors ml-auto"
                @click="close"
              >
                <font-awesome-icon icon="xmark" class="text-base" />
              </button>
            </div>

            <!-- Section body -->
            <div class="flex-1 px-5 sm:px-8 pb-6 overflow-y-auto dc-scrollbar-thin">
              <Transition name="section" mode="out-in">
                <div :key="activeSection">
                  <!-- ── Profile ── -->
                  <template v-if="activeSection === 'profile'">
                    <h3 class="text-xs font-bold uppercase tracking-wider text-dc-text-muted mb-5">
                      {{ t('settings.menu.profile') }}
                    </h3>

                    <div class="flex items-center gap-5">
                      <div
                        class="relative group w-20 h-20 rounded-full cursor-pointer flex-shrink-0"
                        @click="showAvatarEditor = true"
                      >
                        <div
                          class="w-full h-full rounded-full overflow-hidden bg-dc-bg-tertiary flex items-center justify-center ring-2 ring-dc-separator/40"
                        >
                          <UserAvatar v-if="currentUsername" :username="currentUsername" />
                          <font-awesome-icon
                            v-else
                            icon="user"
                            class="text-3xl text-dc-text-muted"
                          />
                        </div>
                        <div
                          class="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                        >
                          <font-awesome-icon icon="camera" class="text-white text-xl" />
                        </div>
                      </div>
                      <div>
                        <p
                          v-if="currentUsername"
                          class="text-base font-semibold text-dc-text-heading"
                        >
                          {{ currentUsername }}
                        </p>
                        <button
                          class="mt-1 text-xs font-medium text-dc-blurple hover:text-dc-blurple-hover transition-colors"
                          @click="showAvatarEditor = true"
                        >
                          {{ t('settings.avatar.change') }}
                        </button>
                      </div>
                    </div>
                  </template>

                  <!-- ── Voice & Video ── -->
                  <template v-else-if="activeSection === 'voice-video'">
                    <h3 class="text-xs font-bold uppercase tracking-wider text-dc-text-muted mb-5">
                      {{ t('settings.menu.voiceVideo') }}
                    </h3>

                    <div class="space-y-5">
                      <div>
                        <label class="block text-sm font-medium text-dc-text-heading mb-2">{{
                          t('settings.defaultMicrophone')
                        }}</label>
                        <select
                          :value="settings.defaultMicrophoneId ?? ''"
                          class="w-full px-3 py-2 rounded bg-dc-bg-tertiary text-dc-text border border-dc-separator/40 outline-none focus:ring-2 focus:ring-dc-blurple/40 text-sm"
                          @change="handleMicrophoneChange"
                        >
                          <option value="">{{ t('settings.noDevice') }}</option>
                          <option v-for="d in audioDevices" :key="d.deviceId" :value="d.deviceId">
                            {{
                              d.label || `${t('call.microphone')} ${audioDevices.indexOf(d) + 1}`
                            }}
                          </option>
                        </select>
                      </div>

                      <div>
                        <label class="block text-sm font-medium text-dc-text-heading mb-2">{{
                          t('settings.defaultCamera')
                        }}</label>
                        <select
                          :value="settings.defaultCameraId ?? ''"
                          class="w-full px-3 py-2 rounded bg-dc-bg-tertiary text-dc-text border border-dc-separator/40 outline-none focus:ring-2 focus:ring-dc-blurple/40 text-sm"
                          @change="handleCameraChange"
                        >
                          <option value="">{{ t('settings.noDevice') }}</option>
                          <option v-for="d in videoDevices" :key="d.deviceId" :value="d.deviceId">
                            {{ d.label || `${t('call.camera')} ${videoDevices.indexOf(d) + 1}` }}
                          </option>
                        </select>
                      </div>
                    </div>
                  </template>

                  <!-- ── Appearance ── -->
                  <template v-else-if="activeSection === 'appearance'">
                    <h3 class="text-xs font-bold uppercase tracking-wider text-dc-text-muted mb-5">
                      {{ t('settings.menu.appearance') }}
                    </h3>

                    <div class="space-y-5">
                      <div>
                        <label class="block text-sm font-medium text-dc-text-heading mb-2">{{
                          t('settings.language')
                        }}</label>
                        <div class="flex rounded-md bg-dc-bg-tertiary p-0.5">
                          <button
                            v-for="loc in SUPPORTED_LOCALES"
                            :key="loc"
                            type="button"
                            :class="[
                              'flex-1 py-2 px-3 rounded-[5px] text-sm font-medium transition-colors',
                              $i18n.locale === loc
                                ? 'bg-dc-bg-active text-dc-text-heading'
                                : 'text-dc-text-muted hover:text-dc-text hover:bg-dc-bg-hover',
                            ]"
                            @click="selectLocale(loc)"
                          >
                            {{ labels[loc] }}
                          </button>
                        </div>
                      </div>

                      <div>
                        <label class="block text-sm font-medium text-dc-text-heading mb-2">{{
                          t('settings.theme')
                        }}</label>
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
                            <span class="flex-1 text-sm font-medium text-dc-text-heading">{{
                              th.label
                            }}</span>
                            <font-awesome-icon
                              v-if="settings.theme === th.id"
                              icon="check"
                              class="text-dc-blurple text-sm flex-shrink-0"
                            />
                          </button>
                        </div>
                      </div>
                    </div>
                  </template>

                  <!-- ── Notifications ── -->
                  <template v-else-if="activeSection === 'notifications'">
                    <h3 class="text-xs font-bold uppercase tracking-wider text-dc-text-muted mb-5">
                      {{ t('settings.menu.notifications') }}
                    </h3>

                    <div class="space-y-5">
                      <div class="flex items-start gap-3">
                        <input
                          id="settings-notifications"
                          type="checkbox"
                          :checked="settings.notificationsEnabled"
                          class="w-4 h-4 mt-0.5 rounded accent-dc-blurple flex-shrink-0"
                          @change="
                            (e) =>
                              settings.setNotificationsEnabled(
                                (e.target as HTMLInputElement).checked,
                              )
                          "
                        />
                        <label for="settings-notifications" class="flex-1 cursor-pointer">
                          <span class="block text-sm font-medium text-dc-text-heading">{{
                            t('settings.notifications')
                          }}</span>
                          <span class="block text-xs text-dc-text-muted mt-0.5">{{
                            t('settings.notificationsDesc')
                          }}</span>
                        </label>
                      </div>

                      <div class="flex items-start gap-3">
                        <input
                          id="settings-sound-connect"
                          type="checkbox"
                          :checked="settings.soundOnConnect"
                          class="w-4 h-4 mt-0.5 rounded accent-dc-blurple flex-shrink-0"
                          @change="
                            (e) =>
                              settings.setSoundOnConnect((e.target as HTMLInputElement).checked)
                          "
                        />
                        <label for="settings-sound-connect" class="flex-1 cursor-pointer">
                          <span class="block text-sm font-medium text-dc-text-heading">{{
                            t('settings.soundOnConnect')
                          }}</span>
                          <span class="block text-xs text-dc-text-muted mt-0.5">{{
                            t('settings.soundOnConnectDesc')
                          }}</span>
                        </label>
                      </div>
                    </div>
                  </template>

                  <!-- ── Security ── -->
                  <template v-else-if="activeSection === 'security'">
                    <h3 class="text-xs font-bold uppercase tracking-wider text-dc-text-muted mb-5">
                      {{ t('settings.menu.security') }}
                    </h3>

                    <div>
                      <p class="text-sm font-semibold text-dc-text-heading mb-4">
                        {{ t('settings.changePassword') }}
                      </p>

                      <div
                        v-if="passwordSuccess"
                        class="mb-4 px-3 py-2 rounded bg-dc-green/10 border border-dc-green/30 text-dc-green text-sm"
                      >
                        {{ t('settings.passwordChanged') }}
                      </div>

                      <form @submit.prevent="handleChangePassword" class="space-y-4">
                        <div
                          v-if="passwordError"
                          class="px-3 py-2 rounded bg-dc-red/10 border border-dc-red/30 text-dc-red text-sm"
                        >
                          {{ passwordError }}
                        </div>

                        <div>
                          <label class="block text-sm font-medium text-dc-text-heading mb-2">{{
                            t('settings.currentPassword')
                          }}</label>
                          <input
                            v-model="currentPassword"
                            type="password"
                            required
                            autocomplete="current-password"
                            class="w-full px-3 py-2 rounded bg-dc-bg-tertiary text-dc-text border border-dc-separator/40 outline-none focus:ring-2 focus:ring-dc-blurple/40 text-sm"
                          />
                        </div>

                        <div>
                          <label class="block text-sm font-medium text-dc-text-heading mb-2">{{
                            t('settings.newPassword')
                          }}</label>
                          <input
                            v-model="newPassword"
                            type="password"
                            required
                            autocomplete="new-password"
                            class="w-full px-3 py-2 rounded bg-dc-bg-tertiary text-dc-text border border-dc-separator/40 outline-none focus:ring-2 focus:ring-dc-blurple/40 text-sm"
                          />
                        </div>

                        <div>
                          <label class="block text-sm font-medium text-dc-text-heading mb-2">{{
                            t('settings.confirmNewPassword')
                          }}</label>
                          <input
                            v-model="confirmNewPassword"
                            type="password"
                            required
                            autocomplete="new-password"
                            class="w-full px-3 py-2 rounded bg-dc-bg-tertiary text-dc-text border border-dc-separator/40 outline-none focus:ring-2 focus:ring-dc-blurple/40 text-sm"
                          />
                        </div>

                        <button
                          type="submit"
                          :disabled="passwordLoading"
                          class="px-5 py-2 rounded bg-dc-blurple hover:bg-dc-blurple-hover disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
                        >
                          {{ passwordLoading ? t('common.loading') : t('settings.savePassword') }}
                        </button>
                      </form>
                    </div>
                  </template>
                </div>
              </Transition>
            </div>
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
/* Mobile-menu page transition (slides in/out horizontally) */
.mobile-menu-enter-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}
.mobile-menu-leave-active {
  transition:
    opacity 0.14s ease,
    transform 0.14s ease;
  position: absolute;
}
.mobile-menu-enter-from {
  opacity: 0;
  transform: translateX(-20px);
}
.mobile-menu-leave-to {
  opacity: 0;
  transform: translateX(-20px);
}

/* Modal animation (bottom sheet on mobile, scale on desktop) */
.modal-enter-active {
  transition: opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}
.modal-leave-active {
  transition: opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}
.modal-enter-active .modal-content {
  transition:
    transform 0.3s cubic-bezier(0.34, 1.2, 0.64, 1),
    opacity 0.25s ease;
}
.modal-leave-active .modal-content {
  transition:
    transform 0.22s cubic-bezier(0.4, 0, 0.2, 1),
    opacity 0.2s ease;
}
.modal-enter-from {
  opacity: 0;
}
.modal-enter-from .modal-content {
  opacity: 0;
  transform: translateY(40px);
}
.modal-leave-to {
  opacity: 0;
}
.modal-leave-to .modal-content {
  opacity: 0;
  transform: translateY(30px);
}

@media (min-width: 640px) {
  .modal-enter-from .modal-content {
    transform: scale(0.9) translateY(-16px);
  }
  .modal-leave-to .modal-content {
    transform: scale(0.95) translateY(-8px);
  }
}
</style>
