import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface AdminUser {
  id: string
  username: string
  role: string
  created_at: string
  last_seen_at?: string
}

export interface AuditEvent {
  id: number
  event_type: string
  actor: string
  target: string
  details: string
  created_at: string
}

export interface AdminRoom {
  id: string
  name: string
  created_at: string
  online: number
}

export interface AdminStats {
  total_users: number
  total_rooms: number
  online_users: number
}

function apiHeaders() {
  const token = localStorage.getItem('token')
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(path, { ...options, headers: { ...apiHeaders(), ...options?.headers } })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.message ?? `HTTP ${res.status}`)
  }
  return res
}

export const useAdminStore = defineStore('adminStore', () => {
  const users = ref<AdminUser[]>([])
  const rooms = ref<AdminRoom[]>([])
  const stats = ref<AdminStats | null>(null)
  const audit = ref<AuditEvent[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function checkSetupStatus(): Promise<boolean> {
    const res = await fetch('/api/v1/admin/setup')
    const data = await res.json()
    return data.initialized as boolean
  }

  async function setup(username: string, password: string) {
    const res = await apiFetch('/api/v1/admin/setup', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    })
    return res.json()
  }

  async function fetchStats() {
    const res = await apiFetch('/api/v1/admin/stats')
    stats.value = await res.json()
  }

  async function fetchUsers() {
    loading.value = true
    error.value = null
    try {
      const res = await apiFetch('/api/v1/admin/users')
      users.value = await res.json()
    } catch (e: any) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  async function deleteUser(id: string) {
    await apiFetch(`/api/v1/admin/users/${id}`, { method: 'DELETE' })
    users.value = users.value.filter((u) => u.id !== id)
  }

  async function updateUserRole(id: string, role: string) {
    await apiFetch(`/api/v1/admin/users/${id}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    })
    const user = users.value.find((u) => u.id === id)
    if (user) user.role = role
  }

  async function fetchRooms() {
    loading.value = true
    error.value = null
    try {
      const res = await apiFetch('/api/v1/admin/rooms')
      rooms.value = await res.json()
    } catch (e: any) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  async function deleteRoom(id: string) {
    await apiFetch(`/api/v1/admin/rooms/${id}`, { method: 'DELETE' })
    rooms.value = rooms.value.filter((r) => r.id !== id)
  }

  async function fetchAudit() {
    loading.value = true
    error.value = null
    try {
      const res = await apiFetch('/api/v1/admin/audit')
      audit.value = await res.json()
    } catch (e: any) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  return {
    users,
    rooms,
    stats,
    audit,
    loading,
    error,
    checkSetupStatus,
    setup,
    fetchStats,
    fetchUsers,
    deleteUser,
    updateUserRole,
    fetchRooms,
    deleteRoom,
    fetchAudit,
  }
})
