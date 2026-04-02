import { defineStore } from 'pinia'
import { ref } from 'vue'

export type InAppNotification = {
  id: string
  title: string
  body: string
  createdAt: number
  ttlMs: number
  kind: 'info' | 'channel' | 'dm' | 'error'
  onClick?: () => void
}

const DEFAULT_TTL_MS = 6000

export const useInAppNotificationStore = defineStore('inAppNotification', () => {
  const items = ref<InAppNotification[]>([])
  const timers = new Map<string, ReturnType<typeof setTimeout>>()

  function push(input: {
    title: string
    body?: string
    kind?: 'info' | 'channel' | 'dm' | 'error'
    onClick?: () => void
    ttlMs?: number
  }) {
    const id = `n-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const ttlMs = input.ttlMs ?? DEFAULT_TTL_MS
    const item: InAppNotification = {
      id,
      title: input.title,
      body: input.body ?? '',
      createdAt: Date.now(),
      ttlMs,
      kind: input.kind ?? 'info',
      onClick: input.onClick,
    }
    items.value = [item, ...items.value].slice(0, 5)

    timers.set(
      id,
      setTimeout(() => {
        remove(id)
      }, ttlMs),
    )
  }

  function remove(id: string) {
    const timer = timers.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.delete(id)
    }
    items.value = items.value.filter((i) => i.id !== id)
  }

  function clear() {
    for (const timer of timers.values()) clearTimeout(timer)
    timers.clear()
    items.value = []
  }

  return { items, push, remove, clear }
})
