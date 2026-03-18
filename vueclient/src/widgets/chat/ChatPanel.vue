<script setup lang="ts">
import { useChatStore } from '@/shared/stores/chatStore'
import { useRoomStore } from '@/shared/stores/roomStore'
import { useSignalingStore } from '@/shared/stores/signalingStore'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import UserAvatar from '@/shared/ui/UserAvatar.vue'
import MessageContent from './MessageContent.vue'

const { t } = useI18n()
const props = defineProps<{ roomId: string | null; userName: string | undefined }>()
const chatStore = useChatStore()
const signalingStore = useSignalingStore()
const roomStore = useRoomStore()
const messageInput = ref('')
const messagesContainer = ref<HTMLElement | null>(null)
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const isTypingTimeout = ref<ReturnType<typeof setTimeout> | null>(null)
const isUserTyping = ref(false)
const shouldAutoScroll = ref(true)
const editingMessageId = ref<string | null>(null)
const editingText = ref('')
const showMenuForMessage = ref<string | null>(null)
const showReactionPickerFor = ref<{
  messageId: string
  message: { id?: string; timestamp: string; reactions?: Record<string, string[]> }
  from: string
} | null>(null)
const reactionPickerPosition = ref<{ top: number; left: number } | null>(null)
const reactionButtonRefs = ref<Map<string, HTMLElement>>(new Map())
const reactionPickerRef = ref<HTMLElement | null>(null)
const quickReactions = ['👍', '❤️', '😂', '😮', '😢', '🙏']

const typingText = computed(() => {
  const users = Array.from(chatStore.typingUsers)
  if (users.length === 0) return ''
  if (users.length === 1) return t('chat.typingOne', { name: users[0] })
  if (users.length === 2) return t('chat.typingTwo', { name1: users[0], name2: users[1] })
  return t('chat.typingMany', { name: users[0], count: users.length - 1 })
})

function checkIfNearBottom() {
  if (!messagesContainer.value) return false
  const { scrollTop, scrollHeight, clientHeight } = messagesContainer.value
  return scrollHeight - scrollTop - clientHeight < 100
}

function scrollToBottom(smooth = false) {
  nextTick(() => {
    if (messagesContainer.value) {
      if (smooth)
        messagesContainer.value.scrollTo({
          top: messagesContainer.value.scrollHeight,
          behavior: 'smooth',
        })
      else messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
}

function handleScroll() {
  shouldAutoScroll.value = checkIfNearBottom()
}

function sendMessage() {
  if (!messageInput.value.trim() || !chatStore.isConnected) return
  chatStore.sendMessage(messageInput.value)
  messageInput.value = ''
  nextTick(() => {
    if (textareaRef.value) textareaRef.value.style.height = '44px'
  })
  stopTyping()
  scrollToBottom()
}

function handleKeyDown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    sendMessage()
  }
}

function connectToChat() {
  if (!props.roomId || !props.userName) {
    if (chatStore.currentRoomId) chatStore.disconnect()
    return
  }
  chatStore.connect(props.roomId, props.userName)
  setTimeout(() => scrollToBottom(), 300)
}

watch(
  () => props.roomId,
  (newId, oldId) => {
    if (newId !== oldId) {
      stopTyping()
      messageInput.value = ''
      connectToChat()
    }
  },
)
watch(
  () => props.userName,
  (n, o) => {
    if (n !== o && props.roomId) connectToChat()
  },
)
watch(
  () => chatStore.messages,
  () => {
    if (shouldAutoScroll.value) scrollToBottom()
  },
  { deep: true },
)

onBeforeUnmount(() => stopTyping())

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
  if (isUserTyping.value) {
    isUserTyping.value = false
    chatStore.sendTyping(false)
  }
  if (isTypingTimeout.value) {
    clearTimeout(isTypingTimeout.value)
    isTypingTimeout.value = null
  }
}

function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

watch(
  () => chatStore.messages.length,
  () => {
    if (shouldAutoScroll.value) scrollToBottom(true)
  },
)

const groupedMessages = computed(() => {
  const groups: Array<{
    from: string
    username: string
    messages: Array<{
      text: string
      timestamp: string
      id?: string
      edited?: boolean
      reactions?: Record<string, string[]>
    }>
    timestamp: string
  }> = []
  chatStore.messages.forEach((message) => {
    const lastGroup = groups[groups.length - 1]
    const timeDiff =
      lastGroup && lastGroup.from === message.from
        ? new Date(message.timestamp).getTime() - new Date(lastGroup.timestamp).getTime()
        : Infinity
    if (lastGroup && lastGroup.from === message.from && timeDiff < 120000) {
      lastGroup.messages.push({
        text: message.text,
        timestamp: message.timestamp,
        id: message.id,
        edited: message.edited,
        reactions: message.reactions,
      })
    } else {
      groups.push({
        from: message.from,
        username: message.username,
        messages: [
          {
            text: message.text,
            timestamp: message.timestamp,
            id: message.id,
            edited: message.edited,
            reactions: message.reactions,
          },
        ],
        timestamp: message.timestamp,
      })
    }
  })
  return groups
})

function isOwnMessage(messageFrom: string): boolean {
  return messageFrom === chatStore.clientId
}

function getMessageId(message: { id?: string; timestamp: string }, from: string): string {
  return message.id || `${from}-${message.timestamp}`
}

function startEdit(message: { text: string; id?: string; timestamp: string }, from: string) {
  const messageId = getMessageId(message, from)
  editingMessageId.value = messageId
  editingText.value = message.text
  showMenuForMessage.value = null
}

function cancelEdit() {
  editingMessageId.value = null
  editingText.value = ''
}

function saveEdit(message: { id?: string; timestamp: string }, from: string) {
  if (!editingText.value.trim()) return
  const messageId = getMessageId(message, from)
  chatStore.editMessage(messageId, editingText.value)
  cancelEdit()
}

function deleteMsg(message: { id?: string; timestamp: string }, from: string) {
  const messageId = getMessageId(message, from)
  chatStore.deleteMessage(messageId)
  showMenuForMessage.value = null
}

function toggleReaction(
  message: { id?: string; timestamp: string; reactions?: Record<string, string[]> },
  from: string,
  emoji: string,
) {
  const messageId = getMessageId(message, from)
  const hasReaction = message.reactions?.[emoji]?.includes(
    chatStore.userId || chatStore.clientId || '',
  )

  if (hasReaction) {
    chatStore.removeReaction(messageId, emoji)
  } else {
    chatStore.addReaction(messageId, emoji)
  }
  showReactionPickerFor.value = null
  reactionPickerPosition.value = null
}

function updateReactionPickerPosition() {
  if (!showReactionPickerFor.value || !reactionPickerPosition.value) return

  const messageId = showReactionPickerFor.value.messageId
  const buttonElement = reactionButtonRefs.value.get(messageId)
  if (!buttonElement) return
  const rect = buttonElement.getBoundingClientRect()
  const pickerElement = reactionPickerRef.value
  if (!pickerElement) return

  const pickerRect = pickerElement.getBoundingClientRect()
  const pickerWidth = pickerRect.width
  const pickerHeight = pickerRect.height
  const spacing = 8
  const padding = 16

  let left = rect.left
  let top = rect.top - pickerHeight - spacing

  // Check if picker would go off the right edge
  if (left + pickerWidth > window.innerWidth - padding) {
    left = window.innerWidth - pickerWidth - padding
  }

  // Check if picker would go off the left edge
  if (left < padding) {
    left = padding
  }

  // Check if picker would go off the top edge, if so show below
  if (top < padding) {
    top = rect.bottom + spacing
    // Re-check if it goes off bottom edge
    if (top + pickerHeight > window.innerHeight - padding) {
      top = window.innerHeight - pickerHeight - padding
    }
  }

  // Check if picker would go off the bottom edge
  if (top + pickerHeight > window.innerHeight - padding) {
    top = rect.top - pickerHeight - spacing
    // If still off top, center vertically
    if (top < padding) {
      top = Math.max(padding, (window.innerHeight - pickerHeight) / 2)
    }
  }

  reactionPickerPosition.value = { top, left }
}

function openReactionPicker(
  message: { id?: string; timestamp: string; reactions?: Record<string, string[]> },
  from: string,
  buttonElement: HTMLElement,
) {
  const messageId = getMessageId(message, from)

  if (showReactionPickerFor.value?.messageId === messageId) {
    showReactionPickerFor.value = null
    reactionPickerPosition.value = null
    return
  }

  showReactionPickerFor.value = { messageId, message, from }

  nextTick(() => {
    const rect = buttonElement.getBoundingClientRect()
    const spacing = 8
    const padding = 16

    // Initial position (will be adjusted after measuring)
    const left = rect.left
    const top = rect.top - 50 - spacing // Approximate height

    reactionPickerPosition.value = { top, left }

    // Update position after measuring actual picker size
    nextTick(() => {
      updateReactionPickerPosition()
    })
  })
}

function hasUserReacted(reactions: Record<string, string[]> | undefined, emoji: string): boolean {
  if (!reactions || !reactions[emoji]) return false
  return reactions[emoji].includes(chatStore.userId || chatStore.clientId || '')
}

function getReactionCount(reactions: Record<string, string[]> | undefined, emoji: string): number {
  if (!reactions || !reactions[emoji]) return 0
  return reactions[emoji].length
}

function getReactionUsers(
  reactions: Record<string, string[]> | undefined,
  emoji: string,
): string[] {
  if (!reactions || !reactions[emoji]) return []
  return reactions[emoji].map((userId) => {
    // Try to get username from various sources (userId can be used to find participant)
    // Try to find by client_id
    const participant = roomStore.participants.find((p) => p.client_id && p.client_id === userId)
    const username =
      participant?.username ||
      signalingStore.room_mates[userId] ||
      (userId === chatStore.userId || userId === chatStore.clientId ? chatStore.username : null) ||
      userId
    return username || userId
  })
}

function getReactionTooltip(
  reactions: Record<string, string[]> | undefined,
  emoji: string,
): string {
  const users = getReactionUsers(reactions, emoji)
  if (users.length === 0) return ''
  if (users.length === 1) return users[0]
  if (users.length <= 3) return users.join(', ')
  return `${users.slice(0, 2).join(', ')} and ${users.length - 2} more`
}

function getAvatarColor(name: string): string {
  const colors = [
    '#5865f2',
    '#3ba55c',
    '#faa61a',
    '#ed4245',
    '#eb459e',
    '#57f287',
    '#9b59b6',
    '#e91e63',
    '#1abc9c',
    '#f47b67',
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

watch(
  () => chatStore.isConnected,
  (connected) => {
    if (connected) {
      nextTick(() => scrollToBottom())
      if (chatStore.notificationsEnabled) chatStore.requestNotificationPermission()
    }
  },
)

// Close edit mode and reaction picker when clicking outside
function handleClickOutside(event: MouseEvent) {
  const target = event.target as HTMLElement

  // Close edit mode
  if (editingMessageId.value) {
    // Don't close if clicking on edit/delete buttons or textarea
    if (!target.closest('button') && !target.closest('textarea')) {
      // Close if clicking outside message area
      if (!target.closest('.group/message')) {
        cancelEdit()
      }
    }
  }

  // Close reaction picker
  if (showReactionPickerFor.value) {
    // Don't close if clicking on reaction picker or reaction button
    if (!target.closest('.reaction-picker') && !target.closest('[data-reaction-button]')) {
      showReactionPickerFor.value = null
      reactionPickerPosition.value = null
    }
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  window.addEventListener('scroll', updateReactionPickerPosition, true)
  window.addEventListener('resize', updateReactionPickerPosition)
  connectToChat()
  if (chatStore.isConnected && chatStore.notificationsEnabled)
    chatStore.requestNotificationPermission()
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside)
  window.removeEventListener('scroll', updateReactionPickerPosition, true)
  window.removeEventListener('resize', updateReactionPickerPosition)
  stopTyping()
})
</script>

<template>
  <div class="flex flex-col h-full w-full bg-dc-bg-secondary">
    <!-- Header -->
    <div
      class="h-12 2xl:h-14 px-4 flex items-center gap-2 border-b border-dc-separator/40 flex-shrink-0"
    >
      <font-awesome-icon icon="hashtag" class="text-dc-text-muted text-[16px]" />
      <span class="text-[15px] font-semibold text-dc-text-heading">{{ t('chat.chat') }}</span>
    </div>

    <!-- Messages -->
    <div
      ref="messagesContainer"
      @scroll="handleScroll"
      class="flex-1 overflow-y-auto dc-scrollbar-thin"
    >
      <!-- No channel -->
      <div
        v-if="!props.roomId"
        class="flex flex-col items-center justify-center h-full text-dc-text-muted px-4"
      >
        <p class="text-base sm:text-sm">{{ t('chat.selectChannelToChat') }}</p>
      </div>

      <!-- Connection states -->
      <div
        v-else-if="!chatStore.isConnected && chatStore.connectionState === 'connecting'"
        class="text-center text-dc-text-muted py-8 text-base sm:text-sm"
      >
        {{ t('chat.connecting') }}
      </div>
      <div
        v-else-if="!chatStore.isConnected && chatStore.connectionState === 'reconnecting'"
        class="text-center text-dc-text-muted py-8 text-base sm:text-sm"
      >
        {{ t('chat.reconnecting') }}
      </div>
      <div v-else-if="!chatStore.isConnected" class="text-center text-dc-text-muted py-8 text-sm">
        {{ t('chat.disconnected') }}
      </div>

      <!-- Empty -->
      <div
        v-else-if="chatStore.messages.length === 0"
        class="flex flex-col items-center justify-center h-full text-dc-text-muted px-4"
      >
        <font-awesome-icon icon="comment" class="text-5xl mb-4 opacity-30" />
        <p class="text-base sm:text-sm">{{ t('chat.noMessagesYet') }}</p>
      </div>

      <!-- Message list (Discord-style) -->
      <div v-else class="py-4">
        <TransitionGroup name="message" tag="div">
        <div
          v-for="(group, gi) in groupedMessages"
          :key="`${group.from}-${group.timestamp}-${gi}`"
          class="px-4 py-0.5 hover:bg-dc-bg-hover/30 group/msg"
        >
          <!-- First message in group - show avatar + name -->
          <div class="flex gap-4">
            <!-- Avatar (only for first message) -->
            <div class="w-12 h-12 sm:w-10 sm:h-10 rounded-full overflow-hidden flex-shrink-0 mt-0.5">
              <UserAvatar :username="group.username" />
            </div>

            <div class="flex-1 min-w-0">
              <!-- Name + timestamp -->
              <div class="flex items-baseline gap-2 mb-0.5">
                <span
                  class="font-medium text-base sm:text-sm hover:underline cursor-pointer"
                  :style="{ color: getAvatarColor(group.username) }"
                >
                  {{ group.username }}
                </span>
                <span class="text-sm sm:text-[11px] text-dc-text-muted">{{
                  formatTime(group.timestamp)
                }}</span>
              </div>

              <!-- Messages in group -->
              <div
                v-for="(msg, mi) in group.messages"
                :key="`${group.from}-${msg.timestamp}-${mi}`"
                class="group/message relative"
              >
                <!-- Edit mode -->
                <div
                  v-if="editingMessageId === getMessageId(msg, group.from)"
                  class="flex flex-col gap-2"
                >
                  <textarea
                    v-model="editingText"
                    @keydown.enter.exact.prevent="saveEdit(msg, group.from)"
                    @keydown.escape="cancelEdit"
                    class="w-full px-4 sm:px-3 py-3 sm:py-2 bg-dc-textarea rounded text-dc-text text-base sm:text-[15px] outline-none resize-none"
                    style="min-height: 64px"
                    autofocus
                  />
                  <div class="flex items-center gap-2 text-sm sm:text-xs text-dc-text-muted">
                    <span>{{ t('chat.pressEnterToSave') }}</span>
                    <span>•</span>
                    <span>{{ t('chat.pressEscapeToCancel') }}</span>
                  </div>
                </div>

                <!-- Display mode -->
                <div
                  v-else
                  class="flex items-start gap-2 group-hover/message:bg-dc-bg-hover/20 rounded px-1 -mx-1 transition-colors"
                >
                  <div
                    class="flex-1 text-dc-text text-base sm:text-[15px] leading-[1.375rem] whitespace-pre-wrap break-words"
                  >
                    <MessageContent :text="msg.text" />
                    <span
                      v-if="msg.edited"
                      class="text-sm sm:text-[11px] text-dc-text-muted ml-1"
                      >{{ t('chat.edited') }}</span
                    >
                  </div>

                  <!-- Action buttons (only for own messages) -->
                  <div
                    v-if="isOwnMessage(group.from)"
                    class="flex items-center gap-1 opacity-0 group-hover/message:opacity-100 transition-opacity"
                  >
                    <button
                      @click="startEdit(msg, group.from)"
                      class="p-1.5 rounded text-dc-text-muted hover:text-dc-text hover:bg-dc-bg-hover transition-colors"
                      :title="t('chat.edit')"
                    >
                      <font-awesome-icon icon="pencil" class="text-sm sm:text-[12px]" />
                    </button>
                    <button
                      @click="deleteMsg(msg, group.from)"
                      class="p-1.5 rounded text-dc-text-muted hover:text-dc-red hover:bg-dc-bg-hover transition-colors"
                      :title="t('chat.delete')"
                    >
                      <font-awesome-icon icon="trash" class="text-sm sm:text-[12px]" />
                    </button>
                  </div>
                </div>

                <!-- Reactions and add reaction button -->
                <div class="flex items-center justify-end gap-1 mt-1 ml-12">
                  <!-- Existing reactions -->
                  <div
                    v-if="msg.reactions && Object.keys(msg.reactions).length > 0"
                    class="flex flex-wrap gap-1 justify-end"
                  >
                    <div
                      v-for="(clientIds, emoji) in msg.reactions"
                      :key="emoji"
                      class="relative group/reaction"
                    >
                      <button
                        @click="toggleReaction(msg, group.from, emoji)"
                        :class="[
                          'flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors',
                          hasUserReacted(msg.reactions, emoji)
                            ? 'bg-dc-blurple/30 hover:bg-dc-blurple/40 text-dc-text'
                            : 'bg-dc-bg-secondary-alt hover:bg-dc-bg-hover text-dc-text-muted hover:text-dc-text',
                        ]"
                        :title="getReactionTooltip(msg.reactions, emoji)"
                      >
                        <span>{{ emoji }}</span>
                        <span class="text-[10px] font-medium">{{
                          getReactionCount(msg.reactions, emoji)
                        }}</span>
                      </button>

                      <!-- Tooltip with user names -->
                      <div
                        class="absolute bottom-full right-0 mb-2 px-2 py-1.5 bg-dc-bg-floating border border-dc-separator rounded text-xs text-dc-text opacity-0 group-hover/reaction:opacity-100 group-hover/reaction:translate-y-0 translate-y-1 pointer-events-none transition-all duration-150 z-20 shadow-lg max-w-[200px] whitespace-normal"
                      >
                        <div class="flex flex-col gap-0.5">
                          <div class="font-semibold mb-1 text-dc-text-heading">
                            {{ emoji }} {{ getReactionCount(msg.reactions, emoji) }}
                          </div>
                          <div
                            v-for="user in getReactionUsers(msg.reactions, emoji)"
                            :key="user"
                            class="text-dc-text-secondary"
                          >
                            {{ user === chatStore.username ? t('common.you') : user }}
                          </div>
                          <div
                            v-if="hasUserReacted(msg.reactions, emoji)"
                            class="mt-1 pt-1 border-t border-dc-separator text-[10px] text-dc-text-muted italic"
                          >
                            {{ t('chat.clickToRemove') }}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- Add reaction button -->
                  <div
                    class="relative opacity-0 group-hover/message:opacity-100 transition-opacity"
                  >
                    <button
                      :ref="
                        (el) => {
                          if (el)
                            reactionButtonRefs.set(getMessageId(msg, group.from), el as HTMLElement)
                        }
                      "
                      @click.stop="
                        openReactionPicker(
                          msg,
                          group.from,
                          reactionButtonRefs.get(getMessageId(msg, group.from))!,
                        )
                      "
                      class="p-1 rounded text-dc-text-muted hover:text-dc-text hover:bg-dc-bg-hover transition-colors text-xs"
                      :title="t('chat.addReaction')"
                      data-reaction-button
                    >
                      <font-awesome-icon icon="face-smile" class="text-[12px]" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        </TransitionGroup>
      </div>
    </div>

    <!-- Typing indicator -->
    <div
      v-if="typingText"
      class="px-4 py-1 text-sm sm:text-xs text-dc-text-muted flex items-center gap-1.5"
    >
      <span class="flex gap-0.5">
        <span
          class="w-1.5 h-1.5 bg-dc-text-muted rounded-full animate-bounce"
          style="animation-delay: 0s"
        />
        <span
          class="w-1.5 h-1.5 bg-dc-text-muted rounded-full animate-bounce"
          style="animation-delay: 0.15s"
        />
        <span
          class="w-1.5 h-1.5 bg-dc-text-muted rounded-full animate-bounce"
          style="animation-delay: 0.3s"
        />
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
            :placeholder="
              chatStore.isConnected ? t('chat.messagePlaceholder') : t('chat.connectingPlaceholder')
            "
            class="flex-1 px-4 sm:px-4 py-3 sm:py-2.5 bg-transparent text-dc-text placeholder-dc-text-muted text-base sm:text-[15px] outline-none resize-none disabled:opacity-40 leading-[1.375rem]"
            style="min-height: 48px; max-height: 120px"
          />
          <button
            @click="sendMessage"
            :disabled="!chatStore.isConnected || !messageInput.trim()"
            class="p-3 sm:p-2.5 text-dc-text-muted hover:text-dc-text disabled:opacity-30 transition-colors flex-shrink-0"
          >
            <font-awesome-icon icon="paper-plane" class="text-lg sm:text-[16px]" />
          </button>
        </div>
      </div>
    </div>

    <!-- Reaction picker (teleported to body) -->
    <Teleport to="body">
      <Transition name="popup">
        <div
          v-if="showReactionPickerFor && reactionPickerPosition"
          ref="reactionPickerRef"
          class="reaction-picker fixed bg-dc-bg-floating border border-dc-separator rounded-lg shadow-xl p-2 flex gap-1 z-[9999]"
          :style="{
            top: `${reactionPickerPosition.top}px`,
            left: `${reactionPickerPosition.left}px`,
          }"
          @click.stop
        >
          <button
            v-for="emoji in quickReactions"
            :key="emoji"
            @click="
              showReactionPickerFor &&
              toggleReaction(showReactionPickerFor.message, showReactionPickerFor.from, emoji)
            "
            class="w-8 h-8 flex items-center justify-center rounded hover:bg-dc-bg-hover transition-colors text-lg flex-shrink-0"
            :class="{
              'bg-dc-blurple/30':
                showReactionPickerFor &&
                hasUserReacted(showReactionPickerFor.message.reactions, emoji),
            }"
          >
            {{ emoji }}
          </button>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
@keyframes bounce {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-3px);
  }
}
.animate-bounce {
  animation: bounce 1.2s infinite;
}
</style>
