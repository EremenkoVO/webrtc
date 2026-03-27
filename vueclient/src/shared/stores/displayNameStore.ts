import type { UserProfile } from '@/api'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export const useDisplayNameStore = defineStore('displayName', () => {
  const byUsername = ref<Record<string, string>>({})

  function normalize(name?: string | null): string {
    return (name ?? '').trim()
  }

  function setFromProfiles(profiles: UserProfile[]) {
    const next = { ...byUsername.value }
    for (const p of profiles) {
      const username = normalize(p.username)
      if (!username) continue
      const displayName = normalize(p.display_name)
      next[username] = displayName || username
    }
    byUsername.value = next
  }

  function setOne(username: string, displayName?: string | null) {
    const uname = normalize(username)
    if (!uname) return
    byUsername.value = {
      ...byUsername.value,
      [uname]: normalize(displayName) || uname,
    }
  }

  function get(username?: string | null): string {
    const uname = normalize(username)
    if (!uname) return ''
    return byUsername.value[uname] || uname
  }

  const count = computed(() => Object.keys(byUsername.value).length)

  return { byUsername, count, setFromProfiles, setOne, get }
})
