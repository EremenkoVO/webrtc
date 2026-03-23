<script setup lang="ts">
import { OpenAPI } from '@/api/index'
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const visible = ref(true)

const isElectron = typeof window !== 'undefined' && !!window.electronAPI

// ── State ──────────────────────────────────────────────────────────────────────

const serverUrl = ref('')
const testStatus = ref<'idle' | 'testing' | 'ok' | 'error'>('idle')
const testError = ref('')

const SAVED_KEY = 'savedServers'
const MAX_SAVED = 5

const savedServers = ref<string[]>([])

function normalizeServerUrl(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

function loadSaved(): void {
  try {
    const raw = localStorage.getItem(SAVED_KEY)
    savedServers.value = raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    savedServers.value = []
  }
}

function addToSaved(url: string): void {
  if (!url) return
  const list = savedServers.value.filter((s) => s !== url)
  list.unshift(url)
  savedServers.value = list.slice(0, MAX_SAVED)
  localStorage.setItem(SAVED_KEY, JSON.stringify(savedServers.value))
}

function clearSaved(): void {
  savedServers.value = []
  localStorage.removeItem(SAVED_KEY)
}

onMounted(() => {
  loadSaved()
  serverUrl.value = localStorage.getItem('serverUrl') ?? ''
})

// ── Validation ─────────────────────────────────────────────────────────────────

const isValidUrl = computed(() => {
  if (!serverUrl.value.trim()) return true // empty = default (relative)
  try {
    const u = new URL(serverUrl.value.trim())
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch {
    return false
  }
})

// ── Test connection ────────────────────────────────────────────────────────────

async function testConnection(): Promise<void> {
  const url = normalizeServerUrl(serverUrl.value)
  if (!url || !isValidUrl.value) return

  testStatus.value = 'testing'
  testError.value = ''
  try {
    await fetch(`${url}/api/v1/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: '__connection_test__',
        password: '__connection_test__',
      }),
      signal: AbortSignal.timeout(5000),
    })
    // For connectivity checks, any HTTP response means host/cert/network are reachable.
    // Login will usually return 400/401 for dummy credentials, which is expected.
    testStatus.value = 'ok'
  } catch (err) {
    testStatus.value = 'error'
    testError.value = err instanceof Error ? err.message : String(err)
  }
}

// ── Save & close ───────────────────────────────────────────────────────────────

function save(): void {
  const url = normalizeServerUrl(serverUrl.value)
  OpenAPI.BASE = url
  localStorage.setItem('serverUrl', url)
  if (url) addToSaved(url)
  window.electronAPI?.setServerUrl(url)
  close()
}

function close(): void {
  visible.value = false
  setTimeout(() => emit('close'), 200)
}

function selectSaved(url: string): void {
  serverUrl.value = url
  testStatus.value = 'idle'
}

function useDefault(): void {
  serverUrl.value = ''
  testStatus.value = 'idle'
}
</script>

<template>
  <Transition name="modal">
    <div
      v-if="visible"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      @click.self="close"
    >
      <div
        class="modal-content bg-dc-bg-secondary rounded-xl shadow-2xl w-full max-w-lg border border-dc-separator/30 flex flex-col"
        @click.stop
      >
        <!-- Header -->
        <div class="flex items-center justify-between px-6 py-4 border-b border-dc-separator/30">
          <div class="flex items-center gap-2.5">
            <font-awesome-icon icon="server" class="text-dc-blurple" />
            <h2 class="text-dc-text-heading font-semibold text-base">
              {{ t('serverPicker.title') }}
            </h2>
          </div>
          <button
            class="w-7 h-7 flex items-center justify-center rounded hover:bg-dc-bg-hover text-dc-text-muted hover:text-dc-text transition-colors"
            @click="close"
          >
            <font-awesome-icon icon="xmark" />
          </button>
        </div>

        <!-- Body -->
        <div class="px-6 py-5 space-y-5">
          <!-- URL input -->
          <div class="space-y-1.5">
            <label class="block text-xs font-bold uppercase tracking-wide text-dc-text-secondary">
              {{ t('serverPicker.serverUrl') }}
            </label>
            <div class="relative flex gap-2">
              <input
                v-model="serverUrl"
                type="url"
                :placeholder="t('serverPicker.placeholder')"
                autocomplete="url"
                spellcheck="false"
                class="flex-1 px-3 py-2.5 rounded bg-dc-input text-dc-text text-sm outline-none focus:ring-2 transition-all"
                :class="
                  isValidUrl
                    ? 'focus:ring-dc-blurple'
                    : 'ring-2 ring-dc-red focus:ring-dc-red'
                "
                @input="testStatus = 'idle'"
                @keydown.enter.prevent="testConnection"
              />
              <!-- Test button -->
              <button
                type="button"
                :disabled="!serverUrl.trim() || !isValidUrl || testStatus === 'testing'"
                class="px-3 py-2 rounded text-sm font-medium transition-colors flex items-center gap-1.5 flex-shrink-0"
                :class="
                  testStatus === 'ok'
                    ? 'bg-dc-green/20 text-dc-green border border-dc-green/30'
                    : testStatus === 'error'
                      ? 'bg-dc-red/10 text-dc-red border border-dc-red/20'
                      : 'bg-dc-bg-tertiary text-dc-text-muted hover:text-dc-text hover:bg-dc-bg-hover border border-dc-separator/30 disabled:opacity-40 disabled:cursor-not-allowed'
                "
                @click="testConnection"
              >
                <font-awesome-icon
                  :icon="
                    testStatus === 'testing'
                      ? 'circle-notch'
                      : testStatus === 'ok'
                        ? 'circle-check'
                        : testStatus === 'error'
                          ? 'xmark'
                          : 'plug'
                  "
                  :spin="testStatus === 'testing'"
                  class="text-xs"
                />
                <span>{{
                  testStatus === 'testing'
                    ? t('serverPicker.testing')
                    : testStatus === 'ok'
                      ? t('serverPicker.connected')
                      : testStatus === 'error'
                        ? t('serverPicker.failed')
                        : t('serverPicker.test')
                }}</span>
              </button>
            </div>

            <!-- Validation / test error message -->
            <p v-if="!isValidUrl" class="text-xs text-dc-red mt-1">
              {{ t('serverPicker.invalidUrl') }}
            </p>
            <p v-else-if="testStatus === 'error' && testError" class="text-xs text-dc-red mt-1">
              {{ testError }}
            </p>
          </div>

          <!-- Use default -->
          <button
            type="button"
            class="text-xs text-dc-text-muted hover:text-dc-text-link transition-colors"
            @click="useDefault"
          >
            {{ t('serverPicker.defaultServer') }}
          </button>

          <!-- Saved servers -->
          <div v-if="savedServers.length > 0" class="space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold uppercase tracking-wide text-dc-text-secondary">
                {{ t('serverPicker.savedServers') }}
              </span>
              <button
                type="button"
                class="text-xs text-dc-text-muted hover:text-dc-red transition-colors"
                @click="clearSaved"
              >
                {{ t('serverPicker.clearSaved') }}
              </button>
            </div>
            <ul class="space-y-1">
              <li
                v-for="saved in savedServers"
                :key="saved"
                class="flex items-center gap-2 px-3 py-2 rounded cursor-pointer transition-colors group"
                :class="
                  serverUrl === saved
                    ? 'bg-dc-blurple/15 border border-dc-blurple/25'
                    : 'bg-dc-bg-tertiary/60 hover:bg-dc-bg-hover border border-transparent'
                "
                @click="selectSaved(saved)"
              >
                <font-awesome-icon
                  icon="server"
                  class="text-xs flex-shrink-0"
                  :class="serverUrl === saved ? 'text-dc-blurple' : 'text-dc-text-muted'"
                />
                <span class="text-sm text-dc-text truncate flex-1">{{ saved }}</span>
                <font-awesome-icon
                  v-if="serverUrl === saved"
                  icon="check"
                  class="text-xs text-dc-blurple flex-shrink-0"
                />
              </li>
            </ul>
          </div>

          <!-- Self-signed cert note (Electron only) -->
          <div
            v-if="isElectron"
            class="flex items-start gap-2.5 bg-dc-blurple/8 border border-dc-blurple/15 rounded-lg px-3 py-2.5"
          >
            <font-awesome-icon icon="shield-halved" class="text-dc-blurple text-sm mt-0.5 flex-shrink-0" />
            <p class="text-xs text-dc-text-muted leading-relaxed">
              {{ t('serverPicker.selfSignedNote') }}
            </p>
          </div>
        </div>

        <!-- Footer -->
        <div class="px-6 py-4 border-t border-dc-separator/30 flex items-center justify-end gap-2">
          <button
            type="button"
            class="px-4 py-2 rounded text-sm font-medium text-dc-text-muted hover:text-dc-text hover:bg-dc-bg-hover transition-colors"
            @click="close"
          >
            {{ t('common.cancel') }}
          </button>
          <button
            type="button"
            :disabled="!isValidUrl"
            class="px-5 py-2 rounded bg-dc-blurple hover:bg-dc-blurple-hover disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
            @click="save"
          >
            {{ t('serverPicker.save') }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.modal-enter-active {
  transition: opacity 0.2s ease;
}
.modal-leave-active {
  transition: opacity 0.15s ease;
}
.modal-enter-active .modal-content {
  transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.modal-leave-active .modal-content {
  transition: all 0.15s ease;
}
.modal-enter-from {
  opacity: 0;
}
.modal-enter-from .modal-content {
  opacity: 0;
  transform: scale(0.92) translateY(-16px);
}
.modal-leave-to {
  opacity: 0;
}
.modal-leave-to .modal-content {
  opacity: 0;
  transform: scale(0.96);
}
</style>
