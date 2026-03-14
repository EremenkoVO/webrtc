import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useAvatarStore = defineStore('avatar', () => {
  // username → cacheBust timestamp, set after avatar upload
  const userCacheBust = ref<Record<string, number>>({})

  function refresh(username: string) {
    userCacheBust.value = { ...userCacheBust.value, [username]: Date.now() }
  }

  function getCacheBust(username: string): number | undefined {
    return userCacheBust.value[username]
  }

  return { refresh, getCacheBust }
})
