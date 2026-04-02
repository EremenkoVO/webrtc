import { ChatService, type DirectConversation } from '@/api'
import { defineStore } from 'pinia'

export const useDmStore = defineStore('dm', {
  state: () => ({
    conversations: [] as DirectConversation[],
    loading: false,
  }),
  actions: {
    async fetchConversations() {
      this.loading = true
      try {
        const res = await ChatService.listDirectConversations()
        this.conversations = Array.isArray(res) ? res : []
      } catch (error) {
        console.error('Failed to load direct conversations', error)
      } finally {
        this.loading = false
      }
    },
    async createOrGet(peerUserId: string) {
      const res = await ChatService.createOrGetDirectConversation({ peer_user_id: peerUserId })
      if (!res || Array.isArray(res) || !('id' in res)) return null
      const conv = res as DirectConversation
      const idx = this.conversations.findIndex((c) => c.id === conv.id)
      if (idx >= 0) this.conversations[idx] = conv
      else this.conversations.unshift(conv)
      return conv
    },
    titleFor(conv: DirectConversation, currentUserId: string | null): string {
      const peer = conv.participants.find((p) => p.user_id !== currentUserId)
      return peer?.display_name || peer?.username || 'DM'
    },
  },
})
