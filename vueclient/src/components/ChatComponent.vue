<script setup lang="ts">
import { useChatStore } from '@/stores/chatStore'
import { faPaperPlane, faComments, faCircle, faBell, faBellSlash } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{
  roomId: string | null
  userName: string | undefined
}>()

const chatStore = useChatStore()
const messageInput = ref('')
const messagesContainer = ref<HTMLElement | null>(null)
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const isTypingTimeout = ref<ReturnType<typeof setTimeout> | null>(null)
const isUserTyping = ref(false)
const isNearBottom = ref(true)
const shouldAutoScroll = ref(true)

// Вычисляемые значения
const typingText = computed(() => {
  const users = Array.from(chatStore.typingUsers)
  if (users.length === 0) return ''
  if (users.length === 1) return `${users[0]} печатает...`
  if (users.length === 2) return `${users[0]} и ${users[1]} печатают...`
  return `${users[0]} и ещё ${users.length - 1} печатают...`
})

// Проверка, находится ли пользователь внизу списка сообщений
function checkIfNearBottom() {
  if (!messagesContainer.value) return false
  const { scrollTop, scrollHeight, clientHeight } = messagesContainer.value
  const threshold = 100 // пикселей от низа
  return scrollHeight - scrollTop - clientHeight < threshold
}

// Прокрутка вниз при новых сообщениях
function scrollToBottom(smooth = false) {
  nextTick(() => {
    if (messagesContainer.value) {
      if (smooth) {
        messagesContainer.value.scrollTo({
          top: messagesContainer.value.scrollHeight,
          behavior: 'smooth',
        })
      } else {
        messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
      }
    }
  })
}

// Обработка прокрутки
function handleScroll() {
  isNearBottom.value = checkIfNearBottom()
  shouldAutoScroll.value = isNearBottom.value
}

// Отправка сообщения
function sendMessage() {
  if (!messageInput.value.trim() || !chatStore.isConnected) {
    return
  }

  chatStore.sendMessage(messageInput.value)
  messageInput.value = ''
  
  // Сброс размера textarea
  nextTick(() => {
    if (textareaRef.value) {
      textareaRef.value.style.height = '44px'
    }
  })
  
  stopTyping()
  scrollToBottom()
}

// Отправка по Enter
function handleKeyDown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    sendMessage()
  }
}

// Подключение к чату при монтировании или смене комнаты
function connectToChat() {
  if (!props.roomId || !props.userName) {
    // Если нет комнаты или имени пользователя, отключаемся
    if (chatStore.currentRoomId) {
      chatStore.disconnect()
    }
    return
  }

  // Подключаемся к чату комнаты
  chatStore.connect(props.roomId, props.userName)

  // Прокрутка вниз после подключения (с небольшой задержкой для загрузки истории)
  setTimeout(() => {
    scrollToBottom()
  }, 300)
}

// Инициализация при монтировании
onMounted(() => {
  connectToChat()

  // Запрашиваем разрешение на уведомления при первом подключении
  if (chatStore.isConnected && chatStore.notificationsEnabled) {
    chatStore.requestNotificationPermission()
  }
})

// Отслеживание смены комнаты
watch(
  () => props.roomId,
  (newRoomId, oldRoomId) => {
    if (newRoomId !== oldRoomId) {
      // Останавливаем индикатор печати при смене комнаты
      stopTyping()
      // Очищаем поле ввода
      messageInput.value = ''
      // Переподключаемся к новой комнате
      connectToChat()
    }
  }
)

// Отслеживание смены имени пользователя
watch(
  () => props.userName,
  (newUserName, oldUserName) => {
    if (newUserName !== oldUserName && props.roomId) {
      connectToChat()
    }
  }
)

// Отслеживание новых сообщений для автоскролла
watch(
  () => chatStore.messages,
  () => {
    if (shouldAutoScroll.value) {
      scrollToBottom()
    }
  },
  { deep: true }
)

// Очистка при размонтировании
onBeforeUnmount(() => {
  stopTyping()
  // Не отключаемся от чата полностью, так как компонент может быть переиспользован
  // Просто останавливаем индикатор печати
})

// Обработка ввода для индикатора печати и авто-размера textarea
function handleInput(event?: Event) {
  // Авто-размер textarea
  if (event && event.target instanceof HTMLTextAreaElement) {
    const target = event.target
    target.style.height = 'auto'
    target.style.height = Math.min(target.scrollHeight, 120) + 'px'
  }

  // Индикатор печати
  if (!isUserTyping.value && messageInput.value.trim()) {
    isUserTyping.value = true
    chatStore.sendTyping(true)
  }

  // Сбрасываем таймер
  if (isTypingTimeout.value) {
    clearTimeout(isTypingTimeout.value)
  }

  // Останавливаем индикатор через 2 секунды бездействия
  isTypingTimeout.value = setTimeout(() => {
    stopTyping()
  }, 2000)
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

// Форматирование времени
function formatTime(timestamp: string, showFull = false): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const minutes = Math.floor(diff / 60000)

  if (showFull || minutes < 1) {
    return date.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  if (minutes < 60) return `${minutes} мин назад`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} ч назад`

  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} дн назад`

  return date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Подключение/отключение при смене комнаты
watch(
  () => props.roomId,
  (newRoomId, oldRoomId) => {
    if (newRoomId && newRoomId !== oldRoomId && props.userName) {
      chatStore.connect(newRoomId, props.userName)
    } else if (!newRoomId) {
      chatStore.disconnect()
    }
  },
  { immediate: true },
)

// Прокрутка при новых сообщениях (только если пользователь внизу)
watch(
  () => chatStore.messages.length,
  () => {
    if (shouldAutoScroll.value) {
      scrollToBottom(true)
    }
  },
)

// Группировка сообщений от одного пользователя
const groupedMessages = computed(() => {
  const groups: Array<{
    from: string
    username: string
    messages: Array<{ text: string; timestamp: string }>
    timestamp: string
  }> = []

  chatStore.messages.forEach((message) => {
    const lastGroup = groups[groups.length - 1]
    const timeDiff =
      lastGroup && lastGroup.from === message.from
        ? new Date(message.timestamp).getTime() -
          new Date(lastGroup.timestamp).getTime()
        : Infinity

    // Группируем сообщения от одного пользователя, если между ними меньше 2 минут
    if (
      lastGroup &&
      lastGroup.from === message.from &&
      timeDiff < 120000
    ) {
      lastGroup.messages.push({
        text: message.text,
        timestamp: message.timestamp,
      })
    } else {
      groups.push({
        from: message.from,
        username: message.username,
        messages: [
          {
            text: message.text,
            timestamp: message.timestamp,
          },
        ],
        timestamp: message.timestamp,
      })
    }
  })

  return groups
})

// Получить инициалы пользователя
function getInitials(username: string): string {
  if (!username || username.trim().length === 0) {
    return '?'
  }
  
  const parts = username.trim().split(' ').filter(p => p.length > 0)
  
  if (parts.length === 0) {
    return username[0]?.toUpperCase() || '?'
  }
  
  if (parts.length === 1) {
    // Если одно слово, берем первые две буквы
    return parts[0].substring(0, 2).toUpperCase()
  }
  
  // Если несколько слов, берем первые буквы первых двух слов
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

// Получить цвет для аватара на основе имени
function getAvatarColor(username: string): string {
  const colors = [
    'bg-blue-500',
    'bg-green-500',
    'bg-purple-500',
    'bg-pink-500',
    'bg-yellow-500',
    'bg-indigo-500',
    'bg-red-500',
    'bg-teal-500',
    'bg-cyan-500',
    'bg-orange-500',
  ]
  
  if (!username || username.trim().length === 0) {
    return colors[0]
  }
  
  let hash = 0
  const normalizedUsername = username.trim().toLowerCase()
  for (let i = 0; i < normalizedUsername.length; i++) {
    hash = normalizedUsername.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}

// Переключение уведомлений
async function toggleNotifications() {
  const newValue = !chatStore.notificationsEnabled
  chatStore.setNotificationsEnabled(newValue)
  
  // Если включаем уведомления и разрешение не получено, запрашиваем его
  if (newValue && chatStore.notificationPermission !== 'granted') {
    await chatStore.requestNotificationPermission()
  }
}

// Очистка при размонтировании
onBeforeUnmount(() => {
  stopTyping()
  // Не отключаемся от чата полностью, так как компонент может быть переиспользован
  // Просто останавливаем индикатор печати
})

// Прокрутка вниз при подключении
watch(
  () => chatStore.isConnected,
  (connected) => {
    if (connected) {
      nextTick(() => {
        scrollToBottom()
      })
      // Запрашиваем разрешение на уведомления при подключении
      if (chatStore.notificationsEnabled) {
        chatStore.requestNotificationPermission()
      }
    }
  },
)
</script>

<template>
  <div class="flex flex-col h-full bg-slate-900/80 backdrop-blur-sm border-l border-slate-800/50 lg:border-l">
    <!-- Заголовок чата -->
    <div class="p-3 sm:p-4 border-b border-slate-800 bg-slate-800/50 backdrop-blur-sm sticky top-0 z-10">
      <div class="flex items-center gap-2 sm:gap-3">
        <div class="relative flex-shrink-0">
          <FontAwesomeIcon :icon="faComments" class="text-slate-300 text-base sm:text-lg" />
          <div
            :class="[
              'absolute -top-1 -right-1 w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full border-2 border-slate-900',
              chatStore.isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500',
            ]"
            :title="chatStore.isConnected ? 'Подключено' : 'Отключено'"
          ></div>
        </div>
        <div class="flex-1 min-w-0">
          <h2 class="text-base sm:text-lg font-semibold text-white truncate">Чат</h2>
          <p class="text-xs text-slate-400">
            {{ chatStore.isConnected ? 'Онлайн' : 'Офлайн' }}
          </p>
        </div>
        <!-- Кнопка уведомлений -->
        <button
          @click="toggleNotifications"
          :class="[
            'p-2 rounded-lg transition-colors touch-manipulation relative active:scale-95',
            chatStore.notificationsEnabled && chatStore.notificationPermission === 'granted'
              ? 'bg-blue-600/20 hover:bg-blue-600/30 text-blue-400'
              : chatStore.notificationPermission === 'denied'
                ? 'bg-red-600/20 hover:bg-red-600/30 text-red-400'
                : chatStore.notificationsEnabled
                  ? 'bg-yellow-600/20 hover:bg-yellow-600/30 text-yellow-400'
                  : 'bg-slate-700/30 hover:bg-slate-700/50 text-slate-400',
          ]"
          :title="
            chatStore.notificationPermission === 'denied'
              ? 'Разрешение на уведомления отклонено. Разрешите в настройках браузера.'
              : chatStore.notificationsEnabled && chatStore.notificationPermission === 'granted'
                ? 'Уведомления включены (нажмите, чтобы выключить)'
                : chatStore.notificationsEnabled
                  ? 'Ожидание разрешения (нажмите, чтобы выключить)'
                  : 'Уведомления выключены (нажмите, чтобы включить)'
          "
        >
          <FontAwesomeIcon
            :icon="chatStore.notificationsEnabled && chatStore.notificationPermission === 'granted' ? faBell : faBellSlash"
            class="text-sm sm:text-base"
          />
          <div
            v-if="chatStore.notificationPermission === 'denied'"
            class="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse"
            title="Разрешение отклонено"
          ></div>
        </button>
      </div>
    </div>

    <!-- Сообщения -->
    <div
      ref="messagesContainer"
      @scroll="handleScroll"
      class="flex-1 overflow-y-auto p-2 sm:p-4 2xl:p-5 4k:p-6 space-y-3 sm:space-y-4 4k:space-y-5 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-900"
    >
      <!-- Нет выбранного канала -->
      <div v-if="!props.roomId" class="flex flex-col items-center justify-center h-full text-slate-400 px-4">
        <div class="bg-slate-800/50 rounded-full p-6 mb-4">
          <FontAwesomeIcon :icon="faComments" class="text-5xl opacity-50" />
        </div>
        <p class="text-lg font-medium mb-1">Выберите канал</p>
        <p class="text-sm text-center">Выберите канал, чтобы начать общение</p>
      </div>

      <!-- Состояние подключения -->
      <div v-else-if="!chatStore.isConnected && chatStore.connectionState === 'connecting'" class="text-center text-slate-400 py-4">
        Подключение к чату...
      </div>
      <div v-else-if="!chatStore.isConnected && chatStore.connectionState === 'reconnecting'" class="text-center text-slate-400 py-4">
        Переподключение к чату...
      </div>
      <div v-else-if="!chatStore.isConnected" class="text-center text-slate-400 py-4">
        Чат отключен
      </div>

      <!-- Пустое состояние -->
      <div
        v-else-if="chatStore.messages.length === 0"
        class="flex flex-col items-center justify-center h-full text-slate-400 px-4"
      >
        <div class="bg-slate-800/50 rounded-full p-6 mb-4">
          <FontAwesomeIcon :icon="faComments" class="text-5xl opacity-50" />
        </div>
        <p class="text-lg font-medium mb-1">Нет сообщений</p>
        <p class="text-sm text-center">Начните общение с участниками канала!</p>
      </div>

      <!-- Список сообщений -->
      <div v-else class="space-y-3 sm:space-y-4">
        <div
          v-for="(group, groupIndex) in groupedMessages"
          :key="`${group.from}-${group.timestamp}-${groupIndex}`"
          class="flex gap-2 sm:gap-3"
          :class="group.from === chatStore.clientId ? 'flex-row-reverse' : 'flex-row'"
        >
          <!-- Аватар -->
          <div
            class="flex-shrink-0 w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white shadow-lg"
            :class="getAvatarColor(group.username)"
          >
            {{ getInitials(group.username) }}
          </div>

          <!-- Группа сообщений -->
          <div
            class="flex flex-col gap-0.5 sm:gap-1 flex-1 min-w-0"
            :class="group.from === chatStore.clientId ? 'items-end' : 'items-start'"
          >
            <!-- Имя пользователя и время -->
            <div
              class="flex items-center gap-1.5 sm:gap-2 px-1 mb-0.5"
              :class="group.from === chatStore.clientId ? 'flex-row-reverse' : 'flex-row'"
            >
              <span class="text-xs sm:text-sm font-semibold text-slate-300 truncate">{{ group.username }}</span>
              <span class="text-xs text-slate-500 flex-shrink-0">{{ formatTime(group.timestamp, true) }}</span>
            </div>

            <!-- Сообщения в группе -->
            <div
              v-for="(msg, msgIndex) in group.messages"
              :key="`${group.from}-${msg.timestamp}-${msgIndex}`"
              class="group relative"
            >
              <div
                class="rounded-2xl px-3 sm:px-4 py-1.5 sm:py-2 break-words shadow-sm transition-all hover:shadow-md"
                :class="
                  group.from === chatStore.clientId
                    ? 'bg-blue-600 text-white rounded-br-md'
                    : 'bg-slate-800 text-slate-100 rounded-bl-md'
                "
                style="max-width: 100%"
              >
                <!-- Текст сообщения -->
                <div class="text-sm sm:text-base whitespace-pre-wrap leading-relaxed">{{ msg.text }}</div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>

    <!-- Индикатор печати -->
    <div
      v-if="typingText"
      class="px-4 py-3 text-sm text-slate-400 italic border-t border-slate-800 bg-slate-800/30 animate-pulse"
    >
      <div class="flex items-center gap-2">
        <div class="flex gap-1">
          <span class="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style="animation-delay: 0s"></span>
          <span class="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style="animation-delay: 0.2s"></span>
          <span class="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style="animation-delay: 0.4s"></span>
        </div>
        <span>{{ typingText }}</span>
      </div>
    </div>

    <!-- Поле ввода -->
    <div v-if="props.roomId" class="p-3 sm:p-4 2xl:p-5 4k:p-6 border-t border-slate-800 bg-slate-800/50 backdrop-blur-sm safe-area-inset-bottom">
      <div class="flex gap-2 items-end">
        <div class="flex-1 relative">
          <textarea
            ref="textareaRef"
            v-model="messageInput"
            @keydown="handleKeyDown"
            @input="handleInput"
            @focus="scrollToBottom(true)"
            :disabled="!chatStore.isConnected"
            placeholder="Написать сообщение..."
            class="w-full px-3 sm:px-4 py-2 sm:py-3 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm sm:text-base"
            style="min-height: 44px; max-height: 120px;"
          ></textarea>
          <div
            v-if="!chatStore.isConnected"
            class="absolute inset-0 flex items-center justify-center bg-slate-900/50 rounded-xl pointer-events-none"
          >
            <span class="text-xs text-slate-500">Подключение...</span>
          </div>
        </div>
        <button
          @click="sendMessage"
          :disabled="!chatStore.isConnected || !messageInput.trim()"
          class="px-3 sm:px-4 py-2 sm:py-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-xl transition-all flex items-center justify-center min-w-[44px] h-[44px] shadow-lg hover:shadow-xl disabled:shadow-none transform hover:scale-105 active:scale-95 disabled:transform-none touch-manipulation"
          title="Отправить сообщение (Enter)"
        >
          <FontAwesomeIcon :icon="faPaperPlane" class="text-sm" />
        </button>
      </div>
      <div class="hidden sm:block mt-2 text-xs text-slate-500 px-1">
        Нажмите Enter для отправки, Shift+Enter для новой строки
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Кастомный скроллбар для WebKit браузеров */
.scrollbar-thin::-webkit-scrollbar {
  width: 8px;
}

.scrollbar-thin::-webkit-scrollbar-track {
  background: transparent;
}

.scrollbar-thin::-webkit-scrollbar-thumb {
  background-color: rgb(51 65 85);
  border-radius: 4px;
  transition: background-color 0.2s;
}

.scrollbar-thin::-webkit-scrollbar-thumb:hover {
  background-color: rgb(71 85 105);
}

/* Плавная прокрутка */
.scrollbar-thin {
  scroll-behavior: smooth;
}

/* Анимация для индикатора печати */
@keyframes bounce {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-4px);
  }
}

.animate-bounce {
  animation: bounce 1.4s infinite;
}
</style>
