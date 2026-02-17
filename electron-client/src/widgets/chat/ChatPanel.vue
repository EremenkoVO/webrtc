<script setup lang="ts">
import { useChatStore } from '@/shared/stores/chatStore'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{ roomId: string | null; userName: string | undefined }>()
const chatStore = useChatStore()
const messageInput = ref('')
const messagesContainer = ref<HTMLElement | null>(null)
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const isTypingTimeout = ref<ReturnType<typeof setTimeout> | null>(null)
const isUserTyping = ref(false)
const shouldAutoScroll = ref(true)

const typingText = computed(() => {
  const users = Array.from(chatStore.typingUsers)
  if (users.length === 0) return ''
  if (users.length === 1) return `${users[0]} is typing...`
  if (users.length === 2) return `${users[0]} and ${users[1]} are typing...`
  return `${users[0]} and ${users.length - 1} others are typing...`
})

function checkIfNearBottom() {
  if (!messagesContainer.value) return false
  const { scrollTop, scrollHeight, clientHeight } = messagesContainer.value
  return scrollHeight - scrollTop - clientHeight < 100
}

function scrollToBottom(smooth = false) {
  nextTick(() => {
    if (messagesContainer.value) {
      if (smooth) messagesContainer.value.scrollTo({ top: messagesContainer.value.scrollHeight, behavior: 'smooth' })
      else messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
}

function handleScroll() { shouldAutoScroll.value = checkIfNearBottom() }

function sendMessage() {
  if (!messageInput.value.trim() || !chatStore.isConnected) return
  chatStore.sendMessage(messageInput.value)
  messageInput.value = ''
  nextTick(() => { if (textareaRef.value) textareaRef.value.style.height = '44px' })
  stopTyping()
  scrollToBottom()
}

function handleKeyDown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage() }
}

function connectToChat() {
  if (!props.roomId || !props.userName) {
    if (chatStore.currentRoomId) chatStore.disconnect()
    return
  }
  // Проверяем, не подключены ли мы уже к этой комнате
  if (chatStore.isConnected && chatStore.currentRoomId === props.roomId) {
    return
  }
  chatStore.connect(props.roomId, props.userName)
  setTimeout(() => scrollToBottom(), 300)
}

onMounted(() => {
  connectToChat()
  if (chatStore.isConnected && chatStore.notificationsEnabled) chatStore.requestNotificationPermission()
})

// Единый watcher для roomId
watch(() => props.roomId, (newId, oldId) => {
  if (newId !== oldId) {
    stopTyping()
    messageInput.value = ''
    connectToChat()
  }
}, { immediate: true })

// Watcher для userName - переподключаемся только если комната уже выбрана
watch(() => props.userName, (newUserName, oldUserName) => {
  if (newUserName !== oldUserName && props.roomId && newUserName) {
    // Переподключаемся только если комната изменилась или соединение не установлено
    if (!chatStore.isConnected || chatStore.currentRoomId !== props.roomId) {
      connectToChat()
    }
  }
})

watch(() => chatStore.messages, () => { if (shouldAutoScroll.value) scrollToBottom() }, { deep: true })

onBeforeUnmount(() => {
  stopTyping()
  if (chatStore.currentRoomId) chatStore.disconnect()
})

function handleInput(event?: Event) {
  if (event && event.target instanceof HTMLTextAreaElement) {
    const t = event.target
    t.style.height = 'auto'
    t.style.height = Math.min(t.scrollHeight, 120) + 'px'
  }
  if (!isUserTyping.value && messageInput.value.trim()) {
    isUserTyping.value = true
    chatStore.sendTyping(true)
  }
  if (isTypingTimeout.value) clearTimeout(isTypingTimeout.value)
  isTypingTimeout.value = setTimeout(() => stopTyping(), 2000)
}

function stopTyping() {
  if (isUserTyping.value) { isUserTyping.value = false; chatStore.sendTyping(false) }
  if (isTypingTimeout.value) { clearTimeout(isTypingTimeout.value); isTypingTimeout.value = null }
}

function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

watch(() => chatStore.messages.length, () => {
  if (shouldAutoScroll.value) scrollToBottom(true)
})

const groupedMessages = computed(() => {
  const groups: Array<{
    from: string; username: string
    messages: Array<{ text: string; timestamp: string }>
    timestamp: string
  }> = []
  chatStore.messages.forEach((message) => {
    const lastGroup = groups[groups.length - 1]
    const timeDiff = lastGroup && lastGroup.from === message.from
      ? new Date(message.timestamp).getTime() - new Date(lastGroup.timestamp).getTime()
      : Infinity
    if (lastGroup && lastGroup.from === message.from && timeDiff < 120000) {
      lastGroup.messages.push({ text: message.text, timestamp: message.timestamp })
    } else {
      groups.push({
        from: message.from, username: message.username,
        messages: [{ text: message.text, timestamp: message.timestamp }],
        timestamp: message.timestamp,
      })
    }
  })
  return groups
})

function getInitials(name: string): string {
  if (!name) return '?'
  return name.substring(0, 2).toUpperCase()
}

function getAvatarColor(name: string): string {
  const colors = ['#5865f2', '#3ba55c', '#faa61a', '#ed4245', '#eb459e', '#57f287', '#9b59b6', '#e91e63', '#1abc9c', '#f47b67']
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

watch(() => chatStore.isConnected, (connected) => {
  if (connected) { nextTick(() => scrollToBottom()); if (chatStore.notificationsEnabled) chatStore.requestNotificationPermission() }
})
</script>

<template>
  <div class="flex flex-col h-full w-full bg-dc-bg-primary">
    <!-- Header -->
    <div class="h-12 2xl:h-14 px-4 flex items-center gap-2 shadow-[0_1px_0_rgba(4,4,5,0.2),0_1.5px_0_rgba(6,6,7,0.05)] flex-shrink-0">
      <font-awesome-icon icon="hashtag" class="text-dc-text-muted text-[16px]" />
      <span class="text-[15px] font-semibold text-dc-text-heading">Chat</span>
    </div>

    <!-- Messages -->
    <div
      ref="messagesContainer"
      @scroll="handleScroll"
      class="flex-1 overflow-y-auto dc-scrollbar-thin"
    >
      <!-- No channel -->
      <div v-if="!props.roomId" class="flex flex-col items-center justify-center h-full text-dc-text-muted px-4">
        <p class="text-sm">Select a channel to start chatting</p>
      </div>

      <!-- Connection states -->
      <div v-else-if="!chatStore.isConnected && chatStore.connectionState === 'connecting'" class="text-center text-dc-text-muted py-8 text-sm">
        Connecting to chat...
      </div>
      <div v-else-if="!chatStore.isConnected && chatStore.connectionState === 'reconnecting'" class="text-center text-dc-text-muted py-8 text-sm">
        Reconnecting...
      </div>
      <div v-else-if="!chatStore.isConnected" class="text-center text-dc-text-muted py-8 text-sm">
        Chat disconnected
      </div>

      <!-- Empty -->
      <div v-else-if="chatStore.messages.length === 0" class="flex flex-col items-center justify-center h-full text-dc-text-muted px-4">
        <p class="text-sm">No messages yet. Say something!</p>
      </div>

      <!-- Message list (Discord-style) -->
      <div v-else class="py-4">
        <div
          v-for="(group, gi) in groupedMessages"
          :key="`${group.from}-${group.timestamp}-${gi}`"
          class="px-4 py-0.5 hover:bg-dc-bg-hover/30 group/msg"
        >
          <!-- First message in group - show avatar + name -->
          <div class="flex gap-4">
            <!-- Avatar (only for first message) -->
            <div
              class="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0 mt-0.5"
              :style="{ backgroundColor: getAvatarColor(group.username) }"
            >
              {{ getInitials(group.username) }}
            </div>

            <div class="flex-1 min-w-0">
              <!-- Name + timestamp -->
              <div class="flex items-baseline gap-2 mb-0.5">
                <span
                  class="font-medium text-sm hover:underline cursor-pointer"
                  :style="{ color: getAvatarColor(group.username) }"
                >
                  {{ group.username }}
                </span>
                <span class="text-[11px] text-dc-text-muted">{{ formatTime(group.timestamp) }}</span>
              </div>

              <!-- Messages in group -->
              <div
                v-for="(msg, mi) in group.messages"
                :key="`${group.from}-${msg.timestamp}-${mi}`"
                class="text-dc-text text-[15px] leading-[1.375rem] whitespace-pre-wrap break-words"
              >
                {{ msg.text }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Typing indicator -->
    <div
      v-if="typingText"
      class="px-4 py-1 text-xs text-dc-text-muted flex items-center gap-1.5"
    >
      <span class="flex gap-0.5">
        <span class="w-1.5 h-1.5 bg-dc-text-muted rounded-full animate-bounce" style="animation-delay: 0s" />
        <span class="w-1.5 h-1.5 bg-dc-text-muted rounded-full animate-bounce" style="animation-delay: 0.15s" />
        <span class="w-1.5 h-1.5 bg-dc-text-muted rounded-full animate-bounce" style="animation-delay: 0.3s" />
      </span>
      <span>{{ typingText }}</span>
    </div>

    <!-- Input -->
    <div v-if="props.roomId" class="px-4 2xl:px-5 pb-4 2xl:pb-5 pt-0 flex-shrink-0">
      <div class="relative bg-dc-textarea rounded-lg">
        <div class="flex items-end">
          <textarea
            ref="textareaRef"
            v-model="messageInput"
            @keydown="handleKeyDown"
            @input="handleInput"
            :disabled="!chatStore.isConnected"
            :placeholder="chatStore.isConnected ? 'Message #chat' : 'Connecting...'"
            class="flex-1 px-4 py-2.5 bg-transparent text-dc-text placeholder-dc-text-muted text-[15px] outline-none resize-none disabled:opacity-40 leading-[1.375rem]"
            style="min-height: 44px; max-height: 120px;"
          />
          <button
            @click="sendMessage"
            :disabled="!chatStore.isConnected || !messageInput.trim()"
            class="p-2.5 text-dc-text-muted hover:text-dc-text disabled:opacity-30 transition-colors flex-shrink-0"
          >
            <font-awesome-icon icon="paper-plane" class="text-[16px]" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-3px); }
}
.animate-bounce { animation: bounce 1.2s infinite; }
</style>
