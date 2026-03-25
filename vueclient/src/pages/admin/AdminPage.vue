<script setup lang="ts">
import {
  useAdminStore,
  type AdminUser,
  type AdminRoom,
  type AuditEvent,
} from '@/shared/stores/adminStore'
import { useAuthStore } from '@/shared/stores/authStore'
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'

const props = defineProps<{ modal?: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const { t } = useI18n()
const router = useRouter()
const authStore = useAuthStore()
const adminStore = useAdminStore()

// ─── State machine ───────────────────────────────────────────────
type Screen = 'loading' | 'setup' | 'forbidden' | 'panel'
const screen = ref<Screen>('loading')
const activeTab = ref<'dashboard' | 'users' | 'rooms' | 'audit' | 'storage'>('dashboard')
const sidebarOpen = ref(false)

// ─── Setup form ──────────────────────────────────────────────────
const setupUsername = ref('')
const setupPassword = ref('')
const setupConfirm = ref('')
const setupError = ref('')
const setupLoading = ref(false)

// ─── Current admin user ──────────────────────────────────────────
const currentUserId = ref<string | null>(null)

// ─── Delete confirm ──────────────────────────────────────────────
const confirmDeleteUser = ref<AdminUser | null>(null)
const confirmDeleteRoom = ref<AdminRoom | null>(null)

// ─── Purge storage ───────────────────────────────────────────────
const confirmPurge = ref(false)
const isPurging = ref(false)

// ─── User search ─────────────────────────────────────────────────
const userSearch = ref('')
const filteredUsers = computed(() =>
  adminStore.users.filter((u) =>
    u.username.toLowerCase().includes(userSearch.value.toLowerCase()),
  ),
)

// ─── Init ────────────────────────────────────────────────────────
onMounted(async () => {
  if (props.modal) {
    screen.value = 'panel'
    loadTab('dashboard')
    return
  }

  try {
    const initialized = await adminStore.checkSetupStatus()
    if (!initialized) {
      screen.value = 'setup'
      return
    }

    if (!authStore.token) {
      window.location.href = '/auth/login'
      return
    }

    const { OpenAPI } = await import('@/api/core/OpenAPI')
    const base = OpenAPI.BASE || ''
    const res = await fetch(`${base}/api/v1/me`, {
      headers: { Authorization: `Bearer ${authStore.token}` },
    })
    if (!res.ok) {
      authStore.clearTokens()
      window.location.href = '/auth/login'
      return
    }
    const me = await res.json()
    if (me.role !== 'admin') {
      screen.value = 'forbidden'
      return
    }
    currentUserId.value = me.id
    authStore.setUserRole('admin')
    screen.value = 'panel'
    loadTab('dashboard')
  } catch {
    window.location.href = '/auth/login'
  }
})

async function loadTab(tab: typeof activeTab.value) {
  activeTab.value = tab
  sidebarOpen.value = false
  if (tab === 'dashboard') await adminStore.fetchStats()
  if (tab === 'users') await adminStore.fetchUsers()
  if (tab === 'rooms') await adminStore.fetchRooms()
  if (tab === 'audit') await adminStore.fetchAudit()
  if (tab === 'storage') await adminStore.fetchStorage()
}

// ─── Setup ───────────────────────────────────────────────────────
async function submitSetup() {
  setupError.value = ''
  if (!setupUsername.value.trim() || !setupPassword.value) {
    setupError.value = t('admin.setup.errorRequired')
    return
  }
  if (setupPassword.value !== setupConfirm.value) {
    setupError.value = t('admin.setup.passwordMismatch')
    return
  }
  setupLoading.value = true
  try {
    const alreadyInitialized = await adminStore.checkSetupStatus()
    if (alreadyInitialized) {
      setupError.value = t('admin.setup.alreadyInitialized')
      setupLoading.value = false
      setTimeout(() => router.push({ name: 'Login', query: { redirect: '/admin' } }), 2000)
      return
    }

    const tokens = await adminStore.setup(setupUsername.value.trim(), setupPassword.value)
    authStore.setTokens(tokens.access_token, tokens.refresh_token)
    authStore.setUserRole('admin')
    currentUserId.value = null
    screen.value = 'panel'
    loadTab('dashboard')
  } catch (e: any) {
    if (e.message?.includes('already')) {
      setupError.value = t('admin.setup.alreadyInitialized')
      setTimeout(() => router.push({ name: 'Login', query: { redirect: '/admin' } }), 2000)
    } else {
      setupError.value = e.message ?? t('admin.setup.error')
    }
  } finally {
    setupLoading.value = false
  }
}

// ─── Actions ─────────────────────────────────────────────────────
async function doDeleteUser(user: AdminUser) {
  if (isPrimaryAdminProtected(user)) return
  confirmDeleteUser.value = null
  try {
    await adminStore.deleteUser(user.id)
  } catch (e: any) {
    alert(e.message)
  }
}

function isPrimaryAdminProtected(user: AdminUser) {
  return user.role === 'admin' && user.bootstrap_admin === true
}

async function toggleRole(user: AdminUser) {
  if (isPrimaryAdminProtected(user)) return
  try {
    await adminStore.updateUserRole(user.id, user.role === 'admin' ? 'user' : 'admin')
  } catch (e: any) {
    alert(e.message)
  }
}

async function doDeleteRoom(room: AdminRoom) {
  confirmDeleteRoom.value = null
  try {
    await adminStore.deleteRoom(room.id)
  } catch (e: any) {
    alert(e.message)
  }
}

async function doPurge() {
  isPurging.value = true
  try {
    await adminStore.purgeStorage()
    confirmPurge.value = false
  } catch (e: any) {
    alert(e.message)
  } finally {
    isPurging.value = false
  }
}

function goBack() {
  if (props.modal) {
    emit('close')
  } else {
    window.location.href = '/'
  }
}

function formatDate(s: string) {
  return s.replace('T', ' ').slice(0, 16)
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

const auditEventMeta: Record<string, { color: string; icon: string }> = {
  user_register:     { color: 'text-dc-blurple bg-dc-blurple/10',    icon: 'user' },
  user_login:        { color: 'text-dc-green bg-dc-green/10',         icon: 'right-from-bracket' },
  user_logout:       { color: 'text-dc-text-muted bg-dc-bg-tertiary', icon: 'right-from-bracket' },
  room_create:       { color: 'text-dc-yellow bg-dc-yellow/10',       icon: 'door-open' },
  room_delete:       { color: 'text-dc-red bg-dc-red/10',             icon: 'trash' },
  admin_setup:       { color: 'text-dc-blurple bg-dc-blurple/10',     icon: 'shield-halved' },
  admin_delete_user: { color: 'text-dc-red bg-dc-red/10',             icon: 'trash' },
  admin_change_role: { color: 'text-dc-yellow bg-dc-yellow/10',       icon: 'crown' },
}

function auditMeta(eventType: string) {
  return auditEventMeta[eventType] ?? { color: 'text-dc-text-muted bg-dc-bg-tertiary', icon: 'circle-info' }
}

const tabs = [
  { id: 'dashboard', icon: 'chart-bar'    },
  { id: 'users',     icon: 'users'        },
  { id: 'rooms',     icon: 'door-open'    },
  { id: 'audit',     icon: 'shield-halved'},
  { id: 'storage',   icon: 'hard-drive'   },
] as const

const tabBadge = computed(() => ({
  users: adminStore.users.length,
  rooms: adminStore.rooms.length,
  audit: adminStore.audit.length,
}))
</script>

<template>
  <!-- ═══════════════════════════════════════════════════════
       LOADING
  ═══════════════════════════════════════════════════════ -->
  <div v-if="screen === 'loading'" class="flex h-dvh items-center justify-center bg-dc-bg-primary">
    <div class="flex flex-col items-center gap-3 text-dc-text-muted">
      <font-awesome-icon icon="circle-notch" class="text-4xl animate-spin text-dc-blurple" />
      <span class="text-sm">{{ t('common.loading') }}</span>
    </div>
  </div>

  <!-- ═══════════════════════════════════════════════════════
       SETUP WIZARD
  ═══════════════════════════════════════════════════════ -->
  <div
    v-else-if="screen === 'setup'"
    class="flex min-h-dvh items-center justify-center bg-dc-bg-primary px-4 py-8"
    style="background: radial-gradient(ellipse at 50% 0%, rgba(88,101,242,0.15) 0%, transparent 70%)"
  >
    <div class="w-full max-w-md">
      <div class="bg-dc-bg-secondary rounded-2xl shadow-2xl overflow-hidden border border-white/[0.06]">
        <div class="bg-dc-blurple/10 border-b border-white/[0.06] px-6 sm:px-8 pt-8 pb-6 text-center">
          <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-dc-blurple/20 mb-4">
            <font-awesome-icon icon="shield-halved" class="text-3xl text-dc-blurple" />
          </div>
          <h1 class="text-xl sm:text-2xl font-bold text-dc-text-heading">{{ t('admin.setup.title') }}</h1>
          <p class="text-sm text-dc-text-muted mt-1">{{ t('admin.setup.subtitle') }}</p>
        </div>

        <div class="px-6 sm:px-8 py-6 flex flex-col gap-4">
          <div class="bg-dc-bg-tertiary/60 rounded-lg px-4 py-3 text-xs text-dc-text-muted flex gap-2 items-start">
            <font-awesome-icon icon="circle-info" class="text-dc-blurple mt-0.5 flex-shrink-0" />
            <span>{{ t('admin.setup.hint') }}</span>
          </div>

          <div class="flex flex-col gap-1">
            <label class="text-xs font-semibold text-dc-text-muted uppercase tracking-wide">
              {{ t('admin.setup.username') }}
            </label>
            <input
              v-model="setupUsername"
              type="text"
              autocomplete="username"
              class="w-full px-3 py-2.5 rounded-lg bg-dc-bg-tertiary text-dc-text placeholder-dc-text-muted border border-white/[0.06] outline-none focus:ring-2 focus:ring-dc-blurple/50 text-sm"
              :placeholder="t('admin.setup.usernamePlaceholder')"
              @keyup.enter="submitSetup"
            />
          </div>

          <div class="flex flex-col gap-1">
            <label class="text-xs font-semibold text-dc-text-muted uppercase tracking-wide">
              {{ t('admin.setup.password') }}
            </label>
            <input
              v-model="setupPassword"
              type="password"
              autocomplete="new-password"
              class="w-full px-3 py-2.5 rounded-lg bg-dc-bg-tertiary text-dc-text placeholder-dc-text-muted border border-white/[0.06] outline-none focus:ring-2 focus:ring-dc-blurple/50 text-sm"
              :placeholder="t('admin.setup.passwordPlaceholder')"
              @keyup.enter="submitSetup"
            />
          </div>

          <div class="flex flex-col gap-1">
            <label class="text-xs font-semibold text-dc-text-muted uppercase tracking-wide">
              {{ t('admin.setup.confirmPassword') }}
            </label>
            <input
              v-model="setupConfirm"
              type="password"
              autocomplete="new-password"
              class="w-full px-3 py-2.5 rounded-lg bg-dc-bg-tertiary text-dc-text placeholder-dc-text-muted border border-white/[0.06] outline-none focus:ring-2 focus:ring-dc-blurple/50 text-sm"
              :placeholder="t('admin.setup.confirmPlaceholder')"
              @keyup.enter="submitSetup"
            />
          </div>

          <p v-if="setupError" class="text-dc-red text-sm text-center">{{ setupError }}</p>

          <button
            :disabled="setupLoading"
            class="w-full py-2.5 rounded-lg bg-dc-blurple hover:bg-dc-blurple/80 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2"
            @click="submitSetup"
          >
            <font-awesome-icon v-if="setupLoading" icon="circle-notch" class="animate-spin" />
            {{ t('admin.setup.submit') }}
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- ═══════════════════════════════════════════════════════
       FORBIDDEN
  ═══════════════════════════════════════════════════════ -->
  <div v-else-if="screen === 'forbidden'" class="flex h-dvh items-center justify-center bg-dc-bg-primary px-4">
    <div class="text-center flex flex-col items-center gap-4">
      <font-awesome-icon icon="shield-halved" class="text-6xl text-dc-red/60" />
      <h1 class="text-xl sm:text-2xl font-bold text-dc-text-heading">{{ t('admin.forbidden') }}</h1>
      <p class="text-dc-text-muted text-sm">{{ t('admin.forbiddenDesc') }}</p>
      <button
        class="mt-2 px-6 py-2 rounded-lg bg-dc-bg-hover text-dc-text text-sm hover:bg-dc-bg-active transition-colors"
        @click="goBack"
      >
        {{ t('admin.backToApp') }}
      </button>
    </div>
  </div>

  <!-- ═══════════════════════════════════════════════════════
       ADMIN PANEL
  ═══════════════════════════════════════════════════════ -->
  <div v-else-if="screen === 'panel'" class="flex h-dvh bg-dc-bg-primary overflow-hidden">

    <!-- Mobile overlay -->
    <Transition name="fade">
      <div
        v-if="sidebarOpen"
        class="fixed inset-0 z-20 bg-black/60 md:hidden"
        @click="sidebarOpen = false"
      />
    </Transition>

    <!-- Sidebar -->
    <aside
      :class="[
        'fixed md:relative inset-y-0 left-0 z-30 w-64 sm:w-56 flex-shrink-0 bg-dc-bg-secondary flex flex-col border-r border-white/[0.04] transition-transform duration-200 ease-out',
        sidebarOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full md:translate-x-0',
      ]"
    >
      <!-- Logo -->
      <div class="h-14 px-4 flex items-center gap-2 border-b border-white/[0.04]">
        <font-awesome-icon icon="shield-halved" class="text-dc-blurple text-xl flex-shrink-0" />
        <span class="font-bold text-dc-text-heading text-[15px] truncate">{{ t('admin.title') }}</span>
        <!-- Close on mobile -->
        <button
          class="ml-auto md:hidden p-1.5 rounded text-dc-text-muted hover:text-dc-text hover:bg-dc-bg-hover transition-colors"
          @click="sidebarOpen = false"
        >
          <font-awesome-icon icon="xmark" />
        </button>
      </div>

      <!-- Nav -->
      <nav class="flex-1 p-2 flex flex-col gap-0.5 overflow-y-auto">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          :class="[
            'flex items-center gap-2.5 px-3 py-2.5 sm:py-2 rounded-md text-sm font-medium transition-colors text-left w-full',
            activeTab === tab.id
              ? 'bg-dc-bg-active text-dc-text-heading'
              : 'text-dc-text-muted hover:text-dc-text-secondary hover:bg-dc-bg-hover',
          ]"
          @click="loadTab(tab.id)"
        >
          <font-awesome-icon :icon="tab.icon" class="w-4 text-center flex-shrink-0" />
          {{ t(`admin.nav.${tab.id}`) }}
          <span
            v-if="tabBadge[tab.id as keyof typeof tabBadge]"
            class="ml-auto text-[11px] bg-dc-bg-tertiary text-dc-text-muted px-1.5 py-0.5 rounded-full"
          >
            {{ tabBadge[tab.id as keyof typeof tabBadge] }}
          </span>
        </button>
      </nav>

      <!-- Back to app -->
      <div class="p-2 border-t border-white/[0.04]">
        <button
          class="flex items-center gap-2 px-3 py-2.5 sm:py-2 rounded-md text-sm text-dc-text-muted hover:text-dc-text-secondary hover:bg-dc-bg-hover transition-colors w-full"
          @click="goBack"
        >
          <font-awesome-icon icon="arrow-left" class="text-xs flex-shrink-0" />
          {{ t('admin.backToApp') }}
        </button>
      </div>
    </aside>

    <!-- Main content -->
    <main class="flex-1 flex flex-col min-w-0 overflow-hidden">
      <!-- Top bar -->
      <div class="h-14 px-3 sm:px-6 flex items-center gap-2 border-b border-white/[0.04] flex-shrink-0">
        <!-- Hamburger (mobile) -->
        <button
          class="md:hidden w-9 h-9 flex items-center justify-center rounded text-dc-text-muted hover:text-dc-text hover:bg-dc-bg-hover transition-colors flex-shrink-0"
          @click="sidebarOpen = true"
        >
          <font-awesome-icon icon="bars" />
        </button>

        <h2 class="text-base sm:text-lg font-semibold text-dc-text-heading truncate">
          {{ t(`admin.nav.${activeTab}`) }}
        </h2>

        <button
          class="ml-auto p-2 rounded text-dc-text-muted hover:text-dc-text hover:bg-dc-bg-hover transition-colors flex-shrink-0"
          :title="t('common.refresh')"
          @click="loadTab(activeTab)"
        >
          <font-awesome-icon icon="arrows-rotate" :class="{ 'animate-spin': adminStore.loading }" />
        </button>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-y-auto p-3 sm:p-6 dc-scrollbar-thin">

        <!-- ── DASHBOARD ────────────────────────────────── -->
        <div v-if="activeTab === 'dashboard'">
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-6 sm:mb-8">
            <div
              v-for="card in [
                { key: 'total_users', icon: 'users',     color: 'text-dc-blurple', bg: 'bg-dc-blurple/10', label: t('admin.dashboard.totalUsers'), value: adminStore.stats?.total_users ?? '—' },
                { key: 'total_rooms', icon: 'door-open', color: 'text-dc-green',   bg: 'bg-dc-green/10',   label: t('admin.dashboard.totalRooms'), value: adminStore.stats?.total_rooms ?? '—' },
                { key: 'online',      icon: 'circle',    color: 'text-dc-yellow',  bg: 'bg-dc-yellow/10',  label: t('admin.dashboard.onlineUsers'), value: adminStore.stats?.online_users ?? '—' },
              ]"
              :key="card.key"
              class="bg-dc-bg-secondary rounded-xl border border-white/[0.06] p-4 sm:p-5 flex items-center gap-4"
            >
              <div :class="['w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center flex-shrink-0', card.bg]">
                <font-awesome-icon :icon="card.icon" :class="['text-lg sm:text-xl', card.color]" />
              </div>
              <div>
                <div class="text-2xl sm:text-3xl font-bold text-dc-text-heading">{{ card.value }}</div>
                <div class="text-xs sm:text-sm text-dc-text-muted">{{ card.label }}</div>
              </div>
            </div>
          </div>

          <div class="bg-dc-bg-secondary rounded-xl border border-white/[0.06] p-4 sm:p-5">
            <p class="text-sm text-dc-text-muted">{{ t('admin.dashboard.hint') }}</p>
          </div>
        </div>

        <!-- ── USERS ───────────────────────────────────── -->
        <div v-else-if="activeTab === 'users'">
          <div class="mb-3 sm:mb-4">
            <input
              v-model="userSearch"
              type="text"
              :placeholder="t('common.search')"
              class="w-full sm:max-w-xs px-3 py-2 rounded-lg bg-dc-bg-secondary text-dc-text placeholder-dc-text-muted border border-white/[0.06] outline-none focus:ring-2 focus:ring-dc-blurple/40 text-sm"
            />
          </div>

          <div v-if="adminStore.loading" class="text-dc-text-muted text-sm py-8 text-center">
            <font-awesome-icon icon="circle-notch" class="animate-spin mr-2" />
            {{ t('common.loading') }}
          </div>

          <!-- Mobile: card list -->
          <div v-else class="sm:hidden flex flex-col gap-2">
            <div
              v-for="user in filteredUsers"
              :key="user.id"
              class="bg-dc-bg-secondary rounded-xl border border-white/[0.06] p-4 flex items-center gap-3"
            >
              <div class="w-8 h-8 rounded-full bg-dc-blurple/20 flex items-center justify-center flex-shrink-0">
                <font-awesome-icon icon="user" class="text-xs text-dc-blurple" />
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-1.5 flex-wrap">
                  <span class="font-medium text-dc-text-heading text-sm truncate">{{ user.username }}</span>
                  <span v-if="user.id === currentUserId" class="text-[10px] text-dc-text-muted">({{ t('common.you') }})</span>
                  <span
                    :class="[
                      'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold',
                      user.role === 'admin' ? 'bg-dc-blurple/20 text-dc-blurple' : 'bg-dc-bg-tertiary text-dc-text-muted',
                    ]"
                  >
                    <font-awesome-icon :icon="user.role === 'admin' ? 'crown' : 'user'" class="text-[8px]" />
                    {{ user.role }}
                  </span>
                </div>
                <div class="text-[11px] text-dc-text-muted mt-0.5">{{ formatDate(user.created_at) }}</div>
              </div>
              <div v-if="user.id !== currentUserId" class="flex items-center gap-1 flex-shrink-0">
                <button
                  type="button"
                  :disabled="isPrimaryAdminProtected(user)"
                  :class="[
                    'w-8 h-8 rounded flex items-center justify-center transition-colors',
                    isPrimaryAdminProtected(user)
                      ? 'opacity-40 cursor-not-allowed'
                      : '',
                    user.role === 'admin'
                      ? 'bg-dc-bg-tertiary hover:bg-dc-bg-hover text-dc-text-muted hover:text-dc-text'
                      : 'bg-dc-blurple/10 hover:bg-dc-blurple/20 text-dc-blurple',
                  ]"
                  :title="
                    isPrimaryAdminProtected(user)
                      ? t('admin.users.primaryAdminLocked')
                      : user.role === 'admin'
                        ? t('admin.users.makeUser')
                        : t('admin.users.makeAdmin')
                  "
                  @click="toggleRole(user)"
                >
                  <font-awesome-icon :icon="user.role === 'admin' ? 'user' : 'crown'" class="text-xs" />
                </button>
                <button
                  type="button"
                  :disabled="isPrimaryAdminProtected(user)"
                  class="w-8 h-8 rounded flex items-center justify-center transition-colors"
                  :class="
                    isPrimaryAdminProtected(user)
                      ? 'opacity-40 cursor-not-allowed text-dc-text-muted'
                      : 'text-dc-text-muted hover:text-dc-red hover:bg-dc-red/10'
                  "
                  :title="
                    isPrimaryAdminProtected(user)
                      ? t('admin.users.primaryAdminLocked')
                      : t('admin.users.delete')
                  "
                  @click="confirmDeleteUser = user"
                >
                  <font-awesome-icon icon="trash" class="text-xs" />
                </button>
              </div>
            </div>
            <div v-if="filteredUsers.length === 0" class="py-8 text-center text-dc-text-muted text-sm">
              {{ t('common.noChannelsFound') }}
            </div>
          </div>

          <!-- Desktop: table -->
          <div v-if="!adminStore.loading" class="hidden sm:block bg-dc-bg-secondary rounded-xl border border-white/[0.06] overflow-hidden">
            <div class="overflow-x-auto">
              <table class="w-full text-sm min-w-[520px]">
                <thead>
                  <tr class="border-b border-white/[0.06]">
                    <th class="text-left px-4 py-3 text-[11px] font-semibold text-dc-text-muted uppercase tracking-wide">{{ t('admin.users.username') }}</th>
                    <th class="text-left px-4 py-3 text-[11px] font-semibold text-dc-text-muted uppercase tracking-wide">{{ t('admin.users.role') }}</th>
                    <th class="text-left px-4 py-3 text-[11px] font-semibold text-dc-text-muted uppercase tracking-wide hidden md:table-cell">{{ t('admin.users.createdAt') }}</th>
                    <th class="text-left px-4 py-3 text-[11px] font-semibold text-dc-text-muted uppercase tracking-wide hidden lg:table-cell">{{ t('admin.users.lastSeen') }}</th>
                    <th class="text-right px-4 py-3 text-[11px] font-semibold text-dc-text-muted uppercase tracking-wide">{{ t('admin.users.actions') }}</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-white/[0.04]">
                  <tr
                    v-for="user in filteredUsers"
                    :key="user.id"
                    class="hover:bg-dc-bg-hover/40 transition-colors"
                  >
                    <td class="px-4 py-3">
                      <div class="flex items-center gap-2">
                        <div class="w-7 h-7 rounded-full bg-dc-blurple/20 flex items-center justify-center flex-shrink-0">
                          <font-awesome-icon icon="user" class="text-xs text-dc-blurple" />
                        </div>
                        <span class="font-medium text-dc-text-heading">{{ user.username }}</span>
                        <span v-if="user.id === currentUserId" class="text-[10px] text-dc-text-muted">({{ t('common.you') }})</span>
                      </div>
                    </td>
                    <td class="px-4 py-3">
                      <span
                        :class="[
                          'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold',
                          user.role === 'admin' ? 'bg-dc-blurple/20 text-dc-blurple' : 'bg-dc-bg-tertiary text-dc-text-muted',
                        ]"
                      >
                        <font-awesome-icon :icon="user.role === 'admin' ? 'crown' : 'user'" class="text-[9px]" />
                        {{ user.role }}
                      </span>
                    </td>
                    <td class="px-4 py-3 text-dc-text-muted hidden md:table-cell">{{ formatDate(user.created_at) }}</td>
                    <td class="px-4 py-3 text-dc-text-muted hidden lg:table-cell">
                      <span v-if="user.last_seen_at" class="inline-flex items-center gap-1">
                        <span class="w-1.5 h-1.5 rounded-full bg-dc-green/60 inline-block" />
                        {{ formatDate(user.last_seen_at) }}
                      </span>
                      <span v-else class="opacity-40">—</span>
                    </td>
                    <td class="px-4 py-3">
                      <div class="flex items-center justify-end gap-1">
                        <button
                          v-if="user.id !== currentUserId"
                          type="button"
                          :disabled="isPrimaryAdminProtected(user)"
                          class="px-2 sm:px-2.5 py-1 rounded text-xs font-medium transition-colors"
                          :class="[
                            user.role === 'admin'
                              ? 'bg-dc-bg-tertiary hover:bg-dc-bg-hover text-dc-text-muted hover:text-dc-text'
                              : 'bg-dc-blurple/10 hover:bg-dc-blurple/20 text-dc-blurple',
                            isPrimaryAdminProtected(user) ? 'opacity-40 cursor-not-allowed' : '',
                          ]"
                          :title="
                            isPrimaryAdminProtected(user)
                              ? t('admin.users.primaryAdminLocked')
                              : user.role === 'admin'
                                ? t('admin.users.makeUser')
                                : t('admin.users.makeAdmin')
                          "
                          @click="toggleRole(user)"
                        >
                          <font-awesome-icon :icon="user.role === 'admin' ? 'user' : 'crown'" class="mr-0 sm:mr-1" />
                          <span class="hidden sm:inline">{{ user.role === 'admin' ? t('admin.users.makeUser') : t('admin.users.makeAdmin') }}</span>
                        </button>
                        <button
                          v-if="user.id !== currentUserId"
                          type="button"
                          :disabled="isPrimaryAdminProtected(user)"
                          class="p-1.5 rounded transition-colors"
                          :class="
                            isPrimaryAdminProtected(user)
                              ? 'opacity-40 cursor-not-allowed text-dc-text-muted'
                              : 'text-dc-text-muted hover:text-dc-red hover:bg-dc-red/10'
                          "
                          :title="
                            isPrimaryAdminProtected(user)
                              ? t('admin.users.primaryAdminLocked')
                              : t('admin.users.delete')
                          "
                          @click="confirmDeleteUser = user"
                        >
                          <font-awesome-icon icon="trash" class="text-xs" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  <tr v-if="filteredUsers.length === 0">
                    <td colspan="5" class="px-4 py-8 text-center text-dc-text-muted text-sm">
                      {{ t('common.noChannelsFound') }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- ── AUDIT ───────────────────────────────────── -->
        <div v-else-if="activeTab === 'audit'">
          <div v-if="adminStore.loading" class="text-dc-text-muted text-sm py-8 text-center">
            <font-awesome-icon icon="circle-notch" class="animate-spin mr-2" />
            {{ t('common.loading') }}
          </div>

          <!-- Mobile: card list -->
          <div v-else class="sm:hidden flex flex-col gap-2">
            <div
              v-for="event in adminStore.audit"
              :key="event.id"
              class="bg-dc-bg-secondary rounded-xl border border-white/[0.06] p-4 flex gap-3"
            >
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap mb-1">
                  <span
                    :class="[
                      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold flex-shrink-0',
                      auditMeta(event.event_type).color,
                    ]"
                  >
                    <font-awesome-icon :icon="auditMeta(event.event_type).icon" class="text-[8px]" />
                    {{ t(`admin.audit.events.${event.event_type}`, event.event_type) }}
                  </span>
                  <span class="text-[11px] text-dc-text-muted tabular-nums">{{ formatDate(event.created_at) }}</span>
                </div>
                <div class="text-sm text-dc-text-heading font-medium truncate">
                  {{ event.actor || '—' }}
                  <span v-if="event.target" class="text-dc-text-muted font-normal"> → {{ event.target }}</span>
                </div>
                <div v-if="event.details" class="text-[11px] text-dc-text-muted mt-0.5">{{ event.details }}</div>
              </div>
            </div>
            <div v-if="adminStore.audit.length === 0" class="py-8 text-center text-dc-text-muted text-sm">
              {{ t('admin.audit.empty') }}
            </div>
          </div>

          <!-- Desktop: table -->
          <div v-if="!adminStore.loading" class="hidden sm:block bg-dc-bg-secondary rounded-xl border border-white/[0.06] overflow-hidden">
            <div class="overflow-x-auto">
              <table class="w-full text-sm min-w-[540px]">
                <thead>
                  <tr class="border-b border-white/[0.06]">
                    <th class="text-left px-4 py-3 text-[11px] font-semibold text-dc-text-muted uppercase tracking-wide w-36">{{ t('admin.audit.time') }}</th>
                    <th class="text-left px-4 py-3 text-[11px] font-semibold text-dc-text-muted uppercase tracking-wide w-40">{{ t('admin.audit.event') }}</th>
                    <th class="text-left px-4 py-3 text-[11px] font-semibold text-dc-text-muted uppercase tracking-wide">{{ t('admin.audit.actor') }}</th>
                    <th class="text-left px-4 py-3 text-[11px] font-semibold text-dc-text-muted uppercase tracking-wide hidden md:table-cell">{{ t('admin.audit.target') }}</th>
                    <th class="text-left px-4 py-3 text-[11px] font-semibold text-dc-text-muted uppercase tracking-wide hidden lg:table-cell">{{ t('admin.audit.details') }}</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-white/[0.04]">
                  <tr
                    v-for="event in adminStore.audit"
                    :key="event.id"
                    class="hover:bg-dc-bg-hover/40 transition-colors"
                  >
                    <td class="px-4 py-3 text-dc-text-muted text-xs tabular-nums whitespace-nowrap">{{ formatDate(event.created_at) }}</td>
                    <td class="px-4 py-3">
                      <span
                        :class="[
                          'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold',
                          auditMeta(event.event_type).color,
                        ]"
                      >
                        <font-awesome-icon :icon="auditMeta(event.event_type).icon" class="text-[9px]" />
                        {{ t(`admin.audit.events.${event.event_type}`, event.event_type) }}
                      </span>
                    </td>
                    <td class="px-4 py-3 font-medium text-dc-text-heading">{{ event.actor || '—' }}</td>
                    <td class="px-4 py-3 text-dc-text-muted hidden md:table-cell">{{ event.target || '—' }}</td>
                    <td class="px-4 py-3 text-dc-text-muted hidden lg:table-cell">{{ event.details || '—' }}</td>
                  </tr>
                  <tr v-if="adminStore.audit.length === 0">
                    <td colspan="5" class="px-4 py-8 text-center text-dc-text-muted text-sm">
                      {{ t('admin.audit.empty') }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- ── STORAGE ─────────────────────────────────── -->
        <div v-else-if="activeTab === 'storage'">
          <div v-if="adminStore.loading" class="text-dc-text-muted text-sm py-8 text-center">
            <font-awesome-icon icon="circle-notch" class="animate-spin mr-2" />
            {{ t('common.loading') }}
          </div>
          <div v-else-if="adminStore.storage" class="flex flex-col gap-4">
            <!-- Disk usage card -->
            <div class="bg-dc-bg-secondary rounded-xl border border-white/[0.06] p-5">
              <div class="flex items-center justify-between mb-3">
                <h3 class="text-sm font-semibold text-dc-text-heading">{{ t('admin.storage.diskUsage') }}</h3>
                <button
                  @click="adminStore.fetchStorage()"
                  class="text-xs text-dc-text-muted hover:text-dc-text transition-colors flex items-center gap-1"
                >
                  <font-awesome-icon icon="rotate" class="text-[10px]" />
                  {{ t('admin.storage.refresh') }}
                </button>
              </div>
              <div class="w-full bg-dc-bg-tertiary rounded-full h-3 overflow-hidden mb-3">
                <div
                  class="h-full rounded-full transition-all duration-500"
                  :class="[
                    adminStore.storage.disk_total > 0
                      ? (1 - adminStore.storage.disk_free / adminStore.storage.disk_total) >= 0.9
                        ? 'bg-red-500'
                        : (1 - adminStore.storage.disk_free / adminStore.storage.disk_total) >= 0.7
                          ? 'bg-yellow-500'
                          : 'bg-dc-blurple'
                      : 'bg-dc-blurple'
                  ]"
                  :style="{ width: adminStore.storage.disk_total > 0 ? ((1 - adminStore.storage.disk_free / adminStore.storage.disk_total) * 100).toFixed(1) + '%' : '0%' }"
                />
              </div>
              <div class="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <div class="text-dc-text-muted text-xs mb-0.5">{{ t('admin.storage.diskUsed') }}</div>
                  <div class="font-semibold text-dc-text-heading">{{ formatBytes(adminStore.storage.disk_total - adminStore.storage.disk_free) }}</div>
                </div>
                <div>
                  <div class="text-dc-text-muted text-xs mb-0.5">{{ t('admin.storage.diskFree') }}</div>
                  <div class="font-semibold text-dc-text-heading">{{ formatBytes(adminStore.storage.disk_free) }}</div>
                </div>
                <div>
                  <div class="text-dc-text-muted text-xs mb-0.5">{{ t('admin.storage.diskTotal') }}</div>
                  <div class="font-semibold text-dc-text-heading">{{ formatBytes(adminStore.storage.disk_total) }}</div>
                </div>
              </div>
            </div>
            <!-- Upload dir card -->
            <div class="bg-dc-bg-secondary rounded-xl border border-white/[0.06] p-5">
              <div class="flex items-center justify-between mb-3">
                <h3 class="text-sm font-semibold text-dc-text-heading">{{ t('admin.storage.uploadedFiles') }}</h3>
                <button
                  class="text-xs text-dc-red hover:text-dc-red/80 transition-colors flex items-center gap-1.5 px-2.5 py-1 rounded bg-dc-red/10 hover:bg-dc-red/20"
                  @click="confirmPurge = true"
                >
                  <font-awesome-icon icon="trash" class="text-[10px]" />
                  {{ t('admin.storage.purge') }}
                </button>
              </div>
              <div class="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div class="text-dc-text-muted text-xs mb-0.5">{{ t('admin.storage.fileCount') }}</div>
                  <div class="font-semibold text-dc-text-heading">{{ adminStore.storage.file_count }}</div>
                </div>
                <div>
                  <div class="text-dc-text-muted text-xs mb-0.5">{{ t('admin.storage.uploadDirSize') }}</div>
                  <div class="font-semibold text-dc-text-heading">{{ formatBytes(adminStore.storage.upload_dir_size) }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ── ROOMS ───────────────────────────────────── -->
        <div v-else-if="activeTab === 'rooms'">
          <div v-if="adminStore.loading" class="text-dc-text-muted text-sm py-8 text-center">
            <font-awesome-icon icon="circle-notch" class="animate-spin mr-2" />
            {{ t('common.loading') }}
          </div>

          <!-- Mobile: card list -->
          <div v-else class="sm:hidden flex flex-col gap-2">
            <div
              v-for="room in adminStore.rooms"
              :key="room.id"
              class="bg-dc-bg-secondary rounded-xl border border-white/[0.06] p-4 flex items-center gap-3"
            >
              <div class="w-8 h-8 rounded-full bg-dc-bg-tertiary flex items-center justify-center flex-shrink-0">
                <font-awesome-icon icon="volume-high" class="text-dc-text-muted text-xs" />
              </div>
              <div class="flex-1 min-w-0">
                <div class="font-medium text-dc-text-heading text-sm truncate">{{ room.name }}</div>
                <div class="text-[11px] text-dc-text-muted mt-0.5 flex items-center gap-2">
                  <span>{{ formatDate(room.created_at) }}</span>
                  <span v-if="room.online > 0" class="inline-flex items-center gap-1 text-dc-green">
                    <span class="w-1.5 h-1.5 rounded-full bg-dc-green inline-block" />
                    {{ room.online }}
                  </span>
                </div>
              </div>
              <button
                class="w-8 h-8 rounded flex items-center justify-center text-dc-text-muted hover:text-dc-red hover:bg-dc-red/10 transition-colors flex-shrink-0"
                :title="t('admin.rooms.delete')"
                @click="confirmDeleteRoom = room"
              >
                <font-awesome-icon icon="trash" class="text-xs" />
              </button>
            </div>
            <div v-if="adminStore.rooms.length === 0" class="py-8 text-center text-dc-text-muted text-sm">
              {{ t('common.noChannelsYet') }}
            </div>
          </div>

          <!-- Desktop: table -->
          <div v-if="!adminStore.loading" class="hidden sm:block bg-dc-bg-secondary rounded-xl border border-white/[0.06] overflow-hidden">
            <div class="overflow-x-auto">
              <table class="w-full text-sm min-w-[400px]">
                <thead>
                  <tr class="border-b border-white/[0.06]">
                    <th class="text-left px-4 py-3 text-[11px] font-semibold text-dc-text-muted uppercase tracking-wide">{{ t('admin.rooms.name') }}</th>
                    <th class="text-left px-4 py-3 text-[11px] font-semibold text-dc-text-muted uppercase tracking-wide">{{ t('common.participants') }}</th>
                    <th class="text-left px-4 py-3 text-[11px] font-semibold text-dc-text-muted uppercase tracking-wide hidden md:table-cell">{{ t('admin.rooms.createdAt') }}</th>
                    <th class="text-right px-4 py-3 text-[11px] font-semibold text-dc-text-muted uppercase tracking-wide">{{ t('admin.rooms.actions') }}</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-white/[0.04]">
                  <tr
                    v-for="room in adminStore.rooms"
                    :key="room.id"
                    class="hover:bg-dc-bg-hover/40 transition-colors"
                  >
                    <td class="px-4 py-3">
                      <div class="flex items-center gap-2">
                        <font-awesome-icon icon="volume-high" class="text-dc-text-muted text-xs w-3" />
                        <span class="font-medium text-dc-text-heading">{{ room.name }}</span>
                      </div>
                    </td>
                    <td class="px-4 py-3">
                      <span v-if="room.online > 0" class="inline-flex items-center gap-1 text-dc-green text-xs font-medium">
                        <span class="w-1.5 h-1.5 rounded-full bg-dc-green inline-block" />
                        {{ room.online }}
                      </span>
                      <span v-else class="text-dc-text-muted text-xs">0</span>
                    </td>
                    <td class="px-4 py-3 text-dc-text-muted hidden md:table-cell">{{ formatDate(room.created_at) }}</td>
                    <td class="px-4 py-3 text-right">
                      <button
                        class="p-1.5 rounded text-dc-text-muted hover:text-dc-red hover:bg-dc-red/10 transition-colors"
                        :title="t('admin.rooms.delete')"
                        @click="confirmDeleteRoom = room"
                      >
                        <font-awesome-icon icon="trash" class="text-xs" />
                      </button>
                    </td>
                  </tr>
                  <tr v-if="adminStore.rooms.length === 0">
                    <td colspan="4" class="px-4 py-8 text-center text-dc-text-muted text-sm">
                      {{ t('common.noChannelsYet') }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </div>

      <!-- Mobile bottom nav -->
      <nav class="md:hidden flex-shrink-0 border-t border-white/[0.04] bg-dc-bg-secondary flex items-center safe-area-bottom">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          :class="[
            'flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors',
            activeTab === tab.id ? 'text-dc-blurple' : 'text-dc-text-muted',
          ]"
          @click="loadTab(tab.id)"
        >
          <font-awesome-icon :icon="tab.icon" class="text-base" />
          <span>{{ t(`admin.nav.${tab.id}`) }}</span>
        </button>
        <button
          class="flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium text-dc-text-muted transition-colors"
          @click="goBack"
        >
          <font-awesome-icon icon="arrow-left" class="text-base" />
          <span>{{ t('admin.backToApp') }}</span>
        </button>
      </nav>
    </main>
  </div>

  <!-- ═══════════════════════════════════════════════════════
       CONFIRM DELETE USER
  ═══════════════════════════════════════════════════════ -->
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="confirmDeleteUser"
        class="fixed inset-0 z-[10050] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
        @click.self="confirmDeleteUser = null"
      >
        <div class="bg-dc-bg-secondary rounded-t-2xl sm:rounded-xl border border-white/[0.06] shadow-2xl p-6 w-full sm:max-w-sm">
          <h3 class="text-base font-semibold text-dc-text-heading mb-2">{{ t('admin.users.deleteTitle') }}</h3>
          <p class="text-sm text-dc-text-muted mb-4">
            {{ t('admin.users.deleteConfirm', { name: confirmDeleteUser.username }) }}
          </p>
          <div class="flex gap-2 justify-end">
            <button
              class="px-4 py-2 rounded-lg text-sm text-dc-text-muted hover:text-dc-text hover:bg-dc-bg-hover transition-colors"
              @click="confirmDeleteUser = null"
            >
              {{ t('common.cancel') }}
            </button>
            <button
              class="px-4 py-2 rounded-lg text-sm bg-dc-red hover:bg-dc-red/80 text-white font-medium transition-colors"
              @click="doDeleteUser(confirmDeleteUser!)"
            >
              {{ t('admin.users.delete') }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- ═══════════════════════════════════════════════════════
       CONFIRM PURGE STORAGE
  ═══════════════════════════════════════════════════════ -->
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="confirmPurge"
        class="fixed inset-0 z-[10050] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
        @click.self="confirmPurge = false"
      >
        <div class="bg-dc-bg-secondary rounded-2xl border border-white/[0.06] shadow-2xl p-6 w-full max-w-sm flex flex-col gap-4">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-dc-red/20 flex items-center justify-center flex-shrink-0">
              <font-awesome-icon icon="trash" class="text-dc-red" />
            </div>
            <h2 class="text-base font-bold text-dc-text-heading">{{ t('admin.storage.purgeConfirmTitle') }}</h2>
          </div>
          <p class="text-sm text-dc-text-muted">{{ t('admin.storage.purgeConfirmText') }}</p>
          <div class="flex justify-end gap-2">
            <button
              class="px-4 py-2 rounded-lg text-sm text-dc-text-muted hover:text-dc-text hover:bg-dc-bg-hover transition-colors"
              @click="confirmPurge = false"
            >
              {{ t('common.cancel') }}
            </button>
            <button
              :disabled="isPurging"
              class="px-4 py-2 rounded-lg text-sm font-semibold bg-dc-red hover:bg-dc-red/80 disabled:opacity-50 text-white transition-colors flex items-center gap-2"
              @click="doPurge"
            >
              <font-awesome-icon v-if="isPurging" icon="circle-notch" class="animate-spin" />
              {{ t('admin.storage.purgeButton') }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- ═══════════════════════════════════════════════════════
       CONFIRM DELETE ROOM
  ═══════════════════════════════════════════════════════ -->
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="confirmDeleteRoom"
        class="fixed inset-0 z-[10050] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
        @click.self="confirmDeleteRoom = null"
      >
        <div class="bg-dc-bg-secondary rounded-t-2xl sm:rounded-xl border border-white/[0.06] shadow-2xl p-6 w-full sm:max-w-sm">
          <h3 class="text-base font-semibold text-dc-text-heading mb-2">{{ t('admin.rooms.deleteTitle') }}</h3>
          <p class="text-sm text-dc-text-muted mb-4">
            {{ t('admin.rooms.deleteConfirm', { name: confirmDeleteRoom.name }) }}
          </p>
          <div class="flex gap-2 justify-end">
            <button
              class="px-4 py-2 rounded-lg text-sm text-dc-text-muted hover:text-dc-text hover:bg-dc-bg-hover transition-colors"
              @click="confirmDeleteRoom = null"
            >
              {{ t('common.cancel') }}
            </button>
            <button
              class="px-4 py-2 rounded-lg text-sm bg-dc-red hover:bg-dc-red/80 text-white font-medium transition-colors"
              @click="doDeleteRoom(confirmDeleteRoom!)"
            >
              {{ t('admin.rooms.delete') }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
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

.safe-area-bottom {
  padding-bottom: env(safe-area-inset-bottom, 0px);
}
</style>
