<script setup lang="ts">
import { OpenAPI } from '@/api/core/OpenAPI'
import { useChatStore } from '@/shared/stores/chatStore'
import { useDisplayNameStore } from '@/shared/stores/displayNameStore'
import UserAvatar from '@/shared/ui/UserAvatar.vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import EmojiPicker from './EmojiPicker.vue'
import MediaPreview from './MediaPreview.vue'
import MessageContent from './MessageContent.vue'
import VoicePlayer from './VoicePlayer.vue'
import UserProfileCard from '@/widgets/user-profile/UserProfileCard.vue'

const { t } = useI18n()
const props = defineProps<{ roomId: string | null; userName: string | undefined }>()
const chatStore = useChatStore()
const displayNameStore = useDisplayNameStore()
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
const quickReactions = ['👍', '❤️', '😂', '😮', '😢', '🙏']
const profileUsername = ref<string | null>(null)
const showProfile = ref(false)

// Voice recording state
const isRecording = ref(false)
const recordingDuration = ref(0)
const recordingTimer = ref<ReturnType<typeof setInterval> | null>(null)
const mediaRecorder = ref<MediaRecorder | null>(null)
const audioChunks = ref<Blob[]>([])
const recordingStream = ref<MediaStream | null>(null)
const recordingCanvasRef = ref<HTMLCanvasElement | null>(null)

// Web Audio API refs for recording visualization (non-reactive for perf)
let recAudioCtx: AudioContext | null = null
let recAnalyser: AnalyserNode | null = null
let recFreqData: Uint8Array<ArrayBuffer> | null = null
let recAnimFrame: number | null = null
// Smoothed bar heights for natural decay
const smoothBars: number[] = Array(36).fill(3)

const formatRecDuration = computed(() => {
  const m = Math.floor(recordingDuration.value / 60)
  const s = recordingDuration.value % 60
  return `${m}:${s.toString().padStart(2, '0')}`
})

function drawRecordingCanvas(freq?: Uint8Array<ArrayBuffer>) {
  const canvas = recordingCanvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')!
  const dpr = window.devicePixelRatio || 1
  const w = canvas.clientWidth
  const h = canvas.clientHeight

  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)

  const BAR_W = 3
  const BAR_GAP = 2
  const NUM_BARS = 36

  for (let i = 0; i < NUM_BARS; i++) {
    let target = 3
    if (freq) {
      const binIdx = Math.floor((i * Math.floor(freq.length * 0.65)) / NUM_BARS)
      const v = freq[binIdx] / 255
      target = 3 + v * (h - 6)
    }
    // Fast attack, slow release for natural VU-meter feel
    smoothBars[i] = smoothBars[i] < target ? target : smoothBars[i] * 0.82 + target * 0.18
    const barH = Math.max(3, smoothBars[i])
    const x = i * (BAR_W + BAR_GAP)
    const y = (h - barH) / 2

    ctx.fillStyle = 'rgba(237,66,69,0.85)' // dc-red tint
    const r = Math.min(BAR_W / 2, barH / 2, 1.5)
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.lineTo(x + BAR_W - r, y)
    ctx.arcTo(x + BAR_W, y, x + BAR_W, y + r, r)
    ctx.lineTo(x + BAR_W, y + barH - r)
    ctx.arcTo(x + BAR_W, y + barH, x + BAR_W - r, y + barH, r)
    ctx.lineTo(x + r, y + barH)
    ctx.arcTo(x, y + barH, x, y + barH - r, r)
    ctx.lineTo(x, y + r)
    ctx.arcTo(x, y, x + r, y, r)
    ctx.closePath()
    ctx.fill()
  }
}

function startRecordingVisualization(stream: MediaStream) {
  try {
    recAudioCtx = new AudioContext()
    const source = recAudioCtx.createMediaStreamSource(stream)
    recAnalyser = recAudioCtx.createAnalyser()
    recAnalyser.fftSize = 128
    recAnalyser.smoothingTimeConstant = 0.5
    source.connect(recAnalyser)
    // Do NOT connect to destination — we don't want mic feedback
    recFreqData = new Uint8Array(recAnalyser.frequencyBinCount) as Uint8Array<ArrayBuffer>
    const an = recAnalyser
    const fd = recFreqData

    function loop() {
      recAnimFrame = requestAnimationFrame(loop)
      an.getByteFrequencyData(fd)
      drawRecordingCanvas(fd)
    }
    loop()
  } catch (e) {
    console.warn('Recording AudioContext failed:', e)
  }
}

function stopRecordingVisualization() {
  if (recAnimFrame !== null) {
    cancelAnimationFrame(recAnimFrame)
    recAnimFrame = null
  }
  recAudioCtx?.close()
  recAudioCtx = null
  recAnalyser = null
  recFreqData = null
  smoothBars.fill(3)
}

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    recordingStream.value = stream
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm'
    const mr = new MediaRecorder(stream, { mimeType })
    audioChunks.value = []
    mr.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunks.value.push(e.data)
    }
    mr.onstop = () => finishRecording()
    mr.start(100)
    mediaRecorder.value = mr
    isRecording.value = true
    recordingDuration.value = 0
    recordingTimer.value = setInterval(() => {
      recordingDuration.value++
      if (recordingDuration.value >= 120) stopRecording()
    }, 1000)
    chatStore.sendVoiceRecording(true)
    // Start after next tick so canvas is mounted
    nextTick(() => startRecordingVisualization(stream))
  } catch (err) {
    console.error('Microphone access denied:', err)
  }
}

function stopRecording() {
  if (mediaRecorder.value && mediaRecorder.value.state !== 'inactive') {
    mediaRecorder.value.stop()
  }
  stopRecordingVisualization()
  clearRecordingState()
  chatStore.sendVoiceRecording(false)
}

function cancelRecording() {
  if (mediaRecorder.value && mediaRecorder.value.state !== 'inactive') {
    mediaRecorder.value.ondataavailable = null
    mediaRecorder.value.onstop = null
    mediaRecorder.value.stop()
  }
  recordingStream.value?.getTracks().forEach((t) => t.stop())
  audioChunks.value = []
  stopRecordingVisualization()
  clearRecordingState()
  chatStore.sendVoiceRecording(false)
}

function clearRecordingState() {
  if (recordingTimer.value) {
    clearInterval(recordingTimer.value)
    recordingTimer.value = null
  }
  isRecording.value = false
  recordingDuration.value = 0
  mediaRecorder.value = null
  recordingStream.value = null
}

async function finishRecording() {
  recordingStream.value?.getTracks().forEach((t) => t.stop())
  const blob = new Blob(audioChunks.value, { type: 'audio/webm' })
  const dur = recordingDuration.value
  audioChunks.value = []
  recordingStream.value = null
  if (blob.size > 0 && props.roomId) {
    await chatStore.sendVoiceMessage(props.roomId, blob, dur)
  }
}

function resolveVoiceUrl(url: string): string {
  if (!url) return ''
  if (url.startsWith('http')) return url
  return (OpenAPI.BASE || '') + url
}

function resolveFileUrl(url: string): string {
  if (!url) return ''
  if (url.startsWith('http')) return url
  return (OpenAPI.BASE || '') + url
}

function openProfile(username: string) {
  profileUsername.value = username
  showProfile.value = true
}

function displayNameOf(username: string): string {
  return displayNameStore.get(username)
}

function formatFileSize(bytes?: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// File attachment state
const fileInputRef = ref<HTMLInputElement | null>(null)
const isUploading = ref(false)

// File download
const downloadingFiles = ref<Set<string>>(new Set())

async function downloadFile(fileUrl: string | undefined, fileName: string | undefined) {
  if (!fileUrl) return
  const url = resolveFileUrl(fileUrl)
  downloadingFiles.value.add(fileUrl)
  try {
    const token = localStorage.getItem('token') || ''
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const blob = await res.blob()
    const blobUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = fileName || 'download'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(blobUrl), 10000)
  } catch (err) {
    console.error('Download failed:', err)
  } finally {
    downloadingFiles.value.delete(fileUrl)
  }
}

// Media preview
const previewSrc = ref<string | null>(null)
const previewType = ref<'image' | 'video'>('image')
const previewFileName = ref<string | undefined>(undefined)

function openPreview(src: string, type: 'image' | 'video', fileName?: string) {
  previewSrc.value = src
  previewType.value = type
  previewFileName.value = fileName
}

function closePreview() {
  previewSrc.value = null
}

function openFilePicker() {
  fileInputRef.value?.click()
}

async function onFileSelected(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || !props.roomId) return
  if (file.size > 25 * 1024 * 1024) {
    alert(t('chat.fileTooLarge'))
    input.value = ''
    return
  }
  isUploading.value = true
  try {
    await chatStore.sendFileMessage(props.roomId, file)
  } catch (err) {
    console.error('File upload failed:', err)
    alert(err instanceof Error ? err.message : 'File upload failed')
  } finally {
    isUploading.value = false
    input.value = ''
  }
}

const voiceRecordingText = computed(() => {
  const users = Array.from(chatStore.voiceRecordingUsers)
  if (users.length === 0) return ''
  return t('chat.voiceRecording', { name: users[0] })
})

// Reply state
const replyingTo = ref<{ id: string; username: string; text: string } | null>(null)

function startReply(
  msg: { id?: string; timestamp: string; text: string },
  from: string,
  username: string,
) {
  replyingTo.value = { id: getMessageId(msg, from), username, text: msg.text }
  nextTick(() => textareaRef.value?.focus())
}

function cancelReply() {
  replyingTo.value = null
}

// Touch / long-press action sheet
type TouchMsg = {
  id?: string
  timestamp: string
  text: string
  username?: string
  reactions?: Record<string, string[]>
  replyToId?: string
  replyToUsername?: string
  replyToText?: string
}
const longPressTimer = ref<ReturnType<typeof setTimeout> | null>(null)
const longPressTouchOrigin = ref<{ x: number; y: number } | null>(null)
const showTouchActionsFor = ref<{ messageId: string; message: TouchMsg; from: string } | null>(null)

function handleTouchStart(event: TouchEvent, msg: TouchMsg, from: string) {
  const touch = event.touches[0]
  longPressTouchOrigin.value = { x: touch.clientX, y: touch.clientY }
  longPressTimer.value = setTimeout(() => {
    navigator.vibrate?.(50)
    showTouchActionsFor.value = { messageId: getMessageId(msg, from), message: msg, from }
    longPressTouchOrigin.value = null
  }, 500)
}

function handleTouchMove(event: TouchEvent) {
  if (!longPressTouchOrigin.value) return
  const touch = event.touches[0]
  const dx = Math.abs(touch.clientX - longPressTouchOrigin.value.x)
  const dy = Math.abs(touch.clientY - longPressTouchOrigin.value.y)
  if (dx > 8 || dy > 8) cancelLongPress()
}

function cancelLongPress() {
  if (longPressTimer.value) {
    clearTimeout(longPressTimer.value)
    longPressTimer.value = null
  }
  longPressTouchOrigin.value = null
}

function closeTouchActions() {
  showTouchActionsFor.value = null
}

function touchReact(emoji: string) {
  if (!showTouchActionsFor.value) return
  toggleReaction(showTouchActionsFor.value.message, showTouchActionsFor.value.from, emoji)
  closeTouchActions()
}

function touchEdit() {
  if (!showTouchActionsFor.value) return
  startEdit(showTouchActionsFor.value.message, showTouchActionsFor.value.from)
  closeTouchActions()
}

function touchDelete() {
  if (!showTouchActionsFor.value) return
  deleteMsg(showTouchActionsFor.value.message, showTouchActionsFor.value.from)
  closeTouchActions()
}

function touchReply() {
  if (!showTouchActionsFor.value) return
  startReply(
    showTouchActionsFor.value.message,
    showTouchActionsFor.value.from,
    showTouchActionsFor.value.message.username ?? '',
  )
  closeTouchActions()
}
const showEmojiPicker = ref(false)
const emojiButtonRef = ref<HTMLElement | null>(null)
const emojiPickerStyle = computed(() => {
  if (!emojiButtonRef.value) return {}
  const rect = emojiButtonRef.value.getBoundingClientRect()
  const pickerWidth = 288
  const pickerHeight = 320
  let left = rect.left
  let top = rect.top - pickerHeight - 8
  if (left + pickerWidth > window.innerWidth - 8) left = window.innerWidth - pickerWidth - 8
  if (left < 8) left = 8
  if (top < 8) top = rect.bottom + 8
  return { top: `${top}px`, left: `${left}px` }
})

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
  chatStore.sendMessage(messageInput.value, replyingTo.value?.id)
  replyingTo.value = null
  messageInput.value = ''
  nextTick(() => {
    if (textareaRef.value) {
      textareaRef.value.style.height = 'auto'
      textareaRef.value.style.height = '44px'
    }
  })
  stopTyping()
  scrollToBottom()
}

function insertEmoji(emoji: string) {
  const textarea = textareaRef.value
  if (!textarea) {
    messageInput.value += emoji
    showEmojiPicker.value = false
    return
  }
  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  messageInput.value = messageInput.value.slice(0, start) + emoji + messageInput.value.slice(end)
  showEmojiPicker.value = false
  nextTick(() => {
    textarea.focus()
    textarea.selectionStart = start + emoji.length
    textarea.selectionEnd = start + emoji.length
  })
}

function applyFormat(type: 'bold' | 'italic' | 'strike' | 'code' | 'codeblock') {
  const textarea = textareaRef.value
  if (!textarea) return
  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  const selected = messageInput.value.slice(start, end)
  const markers: Record<string, [string, string]> = {
    bold: ['**', '**'],
    italic: ['*', '*'],
    strike: ['~~', '~~'],
    code: ['`', '`'],
    codeblock: ['```\n', '\n```'],
  }
  const [open, close] = markers[type]
  messageInput.value =
    messageInput.value.slice(0, start) + open + selected + close + messageInput.value.slice(end)
  nextTick(() => {
    textarea.focus()
    if (selected) {
      textarea.selectionStart = start + open.length
      textarea.selectionEnd = end + open.length
    } else {
      textarea.selectionStart = start + open.length
      textarea.selectionEnd = start + open.length
    }
  })
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
  type MsgEntry = {
    text: string
    timestamp: string
    id?: string
    edited?: boolean
    reactions?: Record<string, string[]>
    replyToId?: string
    replyToUsername?: string
    replyToText?: string
    voiceUrl?: string
    voiceDuration?: number
    type?: string
    fileUrl?: string
    fileName?: string
    fileSize?: number
    fileContentType?: string
  }
  const groups: Array<{ from: string; username: string; messages: MsgEntry[]; timestamp: string }> =
    []
  chatStore.messages.forEach((message) => {
    const lastGroup = groups[groups.length - 1]
    const timeDiff =
      lastGroup && lastGroup.from === message.from
        ? new Date(message.timestamp).getTime() - new Date(lastGroup.timestamp).getTime()
        : Infinity
    const entry: MsgEntry = {
      text: message.text,
      timestamp: message.timestamp,
      id: message.id,
      edited: message.edited,
      reactions: message.reactions,
      replyToId: message.replyToId,
      replyToUsername: message.replyToUsername,
      replyToText: message.replyToText,
      voiceUrl: message.voiceUrl,
      voiceDuration: message.voiceDuration,
      type: message.type,
      fileUrl: message.fileUrl,
      fileName: message.fileName,
      fileSize: message.fileSize,
      fileContentType: message.fileContentType,
    }
    const isVoice = !!message.voiceUrl
    const isFile = message.type === 'file_message'
    if (
      lastGroup &&
      lastGroup.from === message.from &&
      timeDiff < 120000 &&
      !message.replyToId &&
      !isVoice &&
      !isFile
    ) {
      lastGroup.messages.push(entry)
    } else {
      groups.push({
        from: message.from,
        username: message.username,
        messages: [entry],
        timestamp: message.timestamp,
      })
    }
  })
  return groups
})

function isOwnMessage(messageFrom: string): boolean {
  return messageFrom === chatStore.userId || messageFrom === chatStore.clientId
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
  const hasReaction = chatStore.username
    ? message.reactions?.[emoji]?.includes(chatStore.username)
    : false

  if (hasReaction) {
    chatStore.removeReaction(messageId, emoji)
  } else {
    chatStore.addReaction(messageId, emoji)
  }
  showReactionPickerFor.value = null
  reactionPickerPosition.value = null
}

function closeReactionPicker() {
  showReactionPickerFor.value = null
  reactionPickerPosition.value = null
}

function openReactionPicker(
  message: { id?: string; timestamp: string; reactions?: Record<string, string[]> },
  from: string,
  buttonElement: HTMLElement,
) {
  const messageId = getMessageId(message, from)

  if (showReactionPickerFor.value?.messageId === messageId) {
    closeReactionPicker()
    return
  }

  showReactionPickerFor.value = { messageId, message, from }

  nextTick(() => {
    const rect = buttonElement.getBoundingClientRect()
    // Fixed dimensions: 6 × 32px buttons + 5 × 4px gaps + 2 × 8px padding
    const pickerWidth = 232
    const pickerHeight = 48
    const spacing = 6
    const margin = 8

    let left = rect.left
    let top = rect.top - pickerHeight - spacing

    if (left + pickerWidth > window.innerWidth - margin)
      left = window.innerWidth - pickerWidth - margin
    if (left < margin) left = margin
    if (top < margin) top = rect.bottom + spacing
    if (top + pickerHeight > window.innerHeight - margin)
      top = window.innerHeight - pickerHeight - margin

    reactionPickerPosition.value = { top, left }
  })
}

function hasUserReacted(reactions: Record<string, string[]> | undefined, emoji: string): boolean {
  if (!reactions || !reactions[emoji] || !chatStore.username) return false
  return reactions[emoji].includes(chatStore.username)
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
  return reactions[emoji]
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

  // Close emoji picker
  if (showEmojiPicker.value && !target.closest('.emoji-picker-portal')) {
    showEmojiPicker.value = false
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
  window.addEventListener('scroll', closeReactionPicker, true)
  window.addEventListener('resize', closeReactionPicker)
  connectToChat()
  if (chatStore.isConnected && chatStore.notificationsEnabled)
    chatStore.requestNotificationPermission()
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside)
  window.removeEventListener('scroll', closeReactionPicker, true)
  window.removeEventListener('resize', closeReactionPicker)
  stopTyping()
  if (isRecording.value) cancelRecording()
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
              <div
                class="w-12 h-12 sm:w-10 sm:h-10 rounded-full overflow-hidden flex-shrink-0 mt-0.5"
                @click="openProfile(group.username)"
              >
                <UserAvatar :username="group.username" />
              </div>

              <div class="flex-1 min-w-0">
                <!-- Name + timestamp -->
                <div class="flex items-baseline gap-2 mb-0.5">
                  <span
                    class="font-medium text-base sm:text-sm hover:underline cursor-pointer"
                    :style="{ color: getAvatarColor(group.username) }"
                    @click="openProfile(group.username)"
                  >
                    {{ displayNameOf(group.username) }}
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
                  @touchstart.passive="handleTouchStart($event, msg, group.from)"
                  @touchmove.passive="handleTouchMove"
                  @touchend="cancelLongPress"
                  @touchcancel="cancelLongPress"
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
                    class="group-hover/message:bg-dc-bg-hover/20 rounded px-1 -mx-1 transition-colors"
                  >
                    <!-- Floating action toolbar -->
                    <div
                      class="absolute -top-4 right-1 z-10 opacity-0 group-hover/message:opacity-100 transition-opacity pointer-events-none group-hover/message:pointer-events-auto"
                    >
                      <div
                        class="flex items-center gap-px bg-dc-bg-floating border border-dc-separator rounded-lg shadow-lg overflow-hidden"
                      >
                        <!-- Reply -->
                        <button
                          @click="startReply(msg, group.from, group.username)"
                          class="w-8 h-8 flex items-center justify-center text-dc-text-muted hover:text-dc-blurple hover:bg-dc-bg-hover transition-colors"
                          :title="t('chat.reply')"
                        >
                          <font-awesome-icon icon="reply" class="text-[12px]" />
                        </button>
                        <div class="w-px h-4 bg-dc-separator flex-shrink-0" />
                        <!-- Add reaction -->
                        <button
                          :ref="
                            (el) => {
                              if (el)
                                reactionButtonRefs.set(
                                  getMessageId(msg, group.from),
                                  el as HTMLElement,
                                )
                            }
                          "
                          @click.stop="
                            openReactionPicker(
                              msg,
                              group.from,
                              reactionButtonRefs.get(getMessageId(msg, group.from))!,
                            )
                          "
                          class="w-8 h-8 flex items-center justify-center text-dc-text-muted hover:text-dc-yellow hover:bg-dc-bg-hover transition-colors"
                          :title="t('chat.addReaction')"
                          data-reaction-button
                        >
                          <font-awesome-icon icon="face-smile" class="text-[13px]" />
                        </button>

                        <template v-if="isOwnMessage(group.from)">
                          <div class="w-px h-4 bg-dc-separator flex-shrink-0" />
                          <!-- Edit -->
                          <button
                            @click="startEdit(msg, group.from)"
                            class="w-8 h-8 flex items-center justify-center text-dc-text-muted hover:text-dc-text hover:bg-dc-bg-hover transition-colors"
                            :title="t('chat.edit')"
                          >
                            <font-awesome-icon icon="pencil" class="text-[12px]" />
                          </button>
                          <!-- Delete -->
                          <button
                            @click="deleteMsg(msg, group.from)"
                            class="w-8 h-8 flex items-center justify-center text-dc-text-muted hover:text-dc-red hover:bg-dc-bg-hover transition-colors"
                            :title="t('chat.delete')"
                          >
                            <font-awesome-icon icon="trash" class="text-[12px]" />
                          </button>
                        </template>
                      </div>
                    </div>

                    <!-- Reply quote block -->
                    <div
                      v-if="msg.replyToId"
                      class="flex items-stretch gap-2 mb-1 mt-0.5 opacity-80 hover:opacity-100 transition-opacity cursor-default"
                    >
                      <div class="w-0.5 bg-dc-blurple/60 rounded-full flex-shrink-0" />
                      <div class="flex-1 min-w-0 py-0.5">
                        <span
                          class="text-[11px] font-semibold text-dc-blurple block leading-none mb-0.5"
                          >{{ msg.replyToUsername }}</span
                        >
                        <p class="text-[12px] text-dc-text-muted truncate leading-snug">
                          {{ msg.replyToText }}
                        </p>
                      </div>
                    </div>

                    <!-- Voice message player -->
                    <VoicePlayer
                      v-if="msg.voiceUrl"
                      :src="resolveVoiceUrl(msg.voiceUrl)"
                      :duration="msg.voiceDuration ?? 0"
                    />

                    <!-- File message -->
                    <template v-else-if="msg.type === 'file_message'">
                      <template v-if="msg.fileUrl">
                        <!-- Image preview -->
                        <img
                          v-if="msg.fileContentType?.startsWith('image/')"
                          :src="resolveFileUrl(msg.fileUrl)"
                          class="max-w-[360px] max-h-[260px] rounded-md cursor-pointer object-cover mt-0.5 hover:brightness-90 transition-[filter]"
                          @click="openPreview(resolveFileUrl(msg.fileUrl!), 'image', msg.fileName)"
                        />
                        <!-- Video thumbnail — click to open in preview -->
                        <div
                          v-else-if="msg.fileContentType?.startsWith('video/')"
                          class="relative mt-0.5 cursor-pointer group w-fit"
                          @click="openPreview(resolveFileUrl(msg.fileUrl!), 'video', msg.fileName)"
                        >
                          <video
                            :src="resolveFileUrl(msg.fileUrl)"
                            preload="metadata"
                            class="max-w-[360px] max-h-[260px] rounded-md bg-black pointer-events-none"
                          />
                          <div
                            class="absolute inset-0 flex items-center justify-center rounded-md bg-black/30 group-hover:bg-black/45 transition-colors"
                          >
                            <div
                              class="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm"
                            >
                              <font-awesome-icon icon="play" class="text-white text-lg ml-0.5" />
                            </div>
                          </div>
                        </div>
                        <!-- Other file types — download card -->
                        <div
                          v-else
                          role="button"
                          class="inline-flex items-center gap-2 px-3 py-2 mt-0.5 bg-dc-bg-secondary rounded-md hover:bg-dc-bg-tertiary transition-colors max-w-[280px] cursor-pointer select-none"
                          @click="downloadFile(msg.fileUrl, msg.fileName)"
                        >
                          <font-awesome-icon
                            :icon="
                              msg.fileUrl && downloadingFiles.has(msg.fileUrl) ? 'spinner' : 'file'
                            "
                            :class="{
                              'animate-spin': msg.fileUrl && downloadingFiles.has(msg.fileUrl),
                            }"
                            class="text-dc-blurple text-lg flex-shrink-0"
                          />
                          <div class="min-w-0">
                            <div class="text-sm text-dc-text truncate">{{ msg.fileName }}</div>
                            <div class="text-xs text-dc-text-muted">
                              {{ formatFileSize(msg.fileSize) }}
                            </div>
                          </div>
                          <font-awesome-icon
                            icon="download"
                            class="text-dc-text-muted text-sm ml-auto flex-shrink-0"
                          />
                        </div>
                      </template>
                      <!-- File deleted -->
                      <span v-else class="text-dc-text-muted text-sm italic">{{
                        t('chat.fileDeleted')
                      }}</span>
                    </template>

                    <!-- Text message -->
                    <div
                      v-else
                      class="text-dc-text text-base sm:text-[15px] leading-[1.375rem] whitespace-pre-wrap break-words"
                    >
                      <MessageContent :text="msg.text" />
                      <span
                        v-if="msg.edited"
                        class="text-sm sm:text-[11px] text-dc-text-muted ml-1"
                      >
                        {{ t('chat.edited') }}
                      </span>
                    </div>

                    <!-- Reactions row -->
                    <div
                      v-if="msg.reactions && Object.keys(msg.reactions).length > 0"
                      class="flex flex-wrap gap-1 mt-1"
                    >
                      <div
                        v-for="(_, emoji) in msg.reactions"
                        :key="emoji"
                        class="relative group/reaction"
                      >
                        <button
                          @click="toggleReaction(msg, group.from, emoji)"
                          :class="[
                            'flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-colors',
                            hasUserReacted(msg.reactions, emoji)
                              ? 'bg-dc-blurple/30 hover:bg-dc-blurple/40 text-dc-text'
                              : 'bg-dc-bg-secondary-alt hover:bg-dc-bg-hover text-dc-text-muted hover:text-dc-text',
                          ]"
                        >
                          <span>{{ emoji }}</span>
                          <span class="text-[10px] font-medium">{{
                            getReactionCount(msg.reactions, emoji)
                          }}</span>
                        </button>
                        <!-- Tooltip -->
                        <div
                          class="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1.5 bg-dc-bg-floating border border-dc-separator rounded-lg shadow-lg text-xs pointer-events-none opacity-0 group-hover/reaction:opacity-100 transition-opacity duration-150 z-30 w-max max-w-[180px] whitespace-normal"
                        >
                          <div class="font-semibold text-dc-text-heading mb-1">{{ emoji }}</div>
                          <div
                            v-for="user in getReactionUsers(msg.reactions, emoji)"
                            :key="user"
                            :class="
                              user === chatStore.username
                                ? 'text-dc-blurple font-medium'
                                : 'text-dc-text-secondary'
                            "
                          >
                            {{ user === chatStore.username ? t('common.you') : displayNameOf(user) }}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TransitionGroup>
      </div>
      <UserProfileCard
        v-if="profileUsername"
        :username="profileUsername"
        :open="showProfile"
        @close="showProfile = false"
      />
    </div>

    <!-- Voice recording indicator -->
    <div
      v-if="chatStore.voiceRecordingUsers.size > 0"
      class="px-4 py-1 text-sm sm:text-xs text-dc-text-muted flex items-center gap-1.5"
    >
      <font-awesome-icon icon="microphone" class="text-dc-red text-[11px] animate-pulse" />
      <span>{{ voiceRecordingText }}</span>
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
    <div v-if="props.roomId" class="px-3 pb-3 pt-1 flex-shrink-0">
      <div
        class="border border-dc-separator rounded-xl bg-dc-textarea overflow-hidden transition-colors duration-150 focus-within:border-dc-text-muted/60"
      >
        <!-- Reply bar -->
        <div
          v-if="replyingTo"
          class="flex items-center gap-2 px-4 py-2 border-b border-dc-separator bg-dc-bg-hover/30"
        >
          <div class="w-0.5 h-8 bg-dc-blurple rounded-full flex-shrink-0" />
          <div class="flex-1 min-w-0">
            <p class="text-[11px] font-semibold text-dc-blurple leading-none mb-0.5">
              {{ t('chat.replyingTo') }} {{ displayNameOf(replyingTo.username) }}
            </p>
            <p class="text-[12px] text-dc-text-muted truncate leading-snug">
              {{ replyingTo.text }}
            </p>
          </div>
          <button
            @click="cancelReply"
            class="text-dc-text-muted hover:text-dc-text p-1 transition-colors"
            :title="t('chat.cancelReply')"
          >
            <font-awesome-icon icon="xmark" class="text-[14px]" />
          </button>
        </div>

        <!-- Recording UI (replaces textarea + toolbar while recording) -->
        <div v-if="isRecording" class="flex items-center gap-3 px-4 py-3 min-h-[60px]">
          <span class="w-3 h-3 rounded-full bg-red-500 flex-shrink-0 animate-pulse" />
          <span class="text-dc-red font-mono text-sm tabular-nums w-10 flex-shrink-0">{{
            formatRecDuration
          }}</span>
          <div class="flex-1 flex items-center gap-[3px] h-8 overflow-hidden">
            <span
              v-for="i in 24"
              :key="i"
              class="w-[3px] rounded-full bg-dc-red/60 recording-wave-bar"
              :style="{ animationDelay: `${i * 45}ms` }"
            />
          </div>
          <button
            @click="cancelRecording"
            class="w-8 h-8 flex items-center justify-center rounded-full text-dc-text-muted hover:text-dc-text hover:bg-dc-bg-hover transition-colors flex-shrink-0"
            :title="t('chat.cancelRecording')"
          >
            <font-awesome-icon icon="xmark" class="text-[14px]" />
          </button>
          <button
            @click="stopRecording"
            class="w-8 h-8 flex items-center justify-center rounded-full bg-dc-blurple hover:bg-dc-blurple-hover text-white transition-colors flex-shrink-0"
            title="Send"
          >
            <font-awesome-icon icon="check" class="text-[13px]" />
          </button>
        </div>

        <!-- Textarea (hidden while recording) -->
        <textarea
          v-show="!isRecording"
          ref="textareaRef"
          v-model="messageInput"
          @keydown="handleKeyDown"
          @input="handleInput"
          :disabled="!chatStore.isConnected"
          :placeholder="
            chatStore.isConnected ? t('chat.messagePlaceholder') : t('chat.connectingPlaceholder')
          "
          class="w-full px-4 pt-3 pb-2 bg-transparent text-dc-text placeholder-dc-text-muted text-[15px] outline-none focus:outline-none focus:ring-0 resize-none disabled:opacity-40 leading-[1.375rem] block"
          style="min-height: 44px; max-height: 180px; box-shadow: none; outline: none"
        />

        <!-- Toolbar (hidden while recording) -->
        <div v-show="!isRecording" class="flex items-center px-2 pb-2 pt-0.5 gap-0.5">
          <!-- Formatting buttons -->
          <button
            @click="applyFormat('bold')"
            title="Bold"
            class="w-7 h-7 flex items-center justify-center rounded text-dc-text-muted hover:text-dc-text hover:bg-dc-bg-hover transition-colors text-[13px] font-bold"
          >
            B
          </button>
          <button
            @click="applyFormat('italic')"
            title="Italic"
            class="w-7 h-7 flex items-center justify-center rounded text-dc-text-muted hover:text-dc-text hover:bg-dc-bg-hover transition-colors text-[13px] italic font-medium"
          >
            I
          </button>
          <button
            @click="applyFormat('strike')"
            title="Strikethrough"
            class="w-7 h-7 flex items-center justify-center rounded text-dc-text-muted hover:text-dc-text hover:bg-dc-bg-hover transition-colors text-[13px] font-medium line-through"
          >
            S
          </button>
          <button
            @click="applyFormat('code')"
            title="Inline code"
            class="w-7 h-7 flex items-center justify-center rounded text-dc-text-muted hover:text-dc-text hover:bg-dc-bg-hover transition-colors font-mono text-[12px]"
          >
            `·`
          </button>
          <button
            @click="applyFormat('codeblock')"
            title="Code block"
            class="w-7 h-7 flex items-center justify-center rounded text-dc-text-muted hover:text-dc-text hover:bg-dc-bg-hover transition-colors font-mono text-[10px] leading-none"
          >
            &lt;/&gt;
          </button>

          <div class="w-px h-4 bg-dc-separator mx-1 flex-shrink-0" />

          <!-- Emoji -->
          <div class="relative">
            <button
              ref="emojiButtonRef"
              @click.stop="showEmojiPicker = !showEmojiPicker"
              title="Emoji"
              :class="[
                'w-7 h-7 flex items-center justify-center rounded transition-colors',
                showEmojiPicker
                  ? 'text-dc-yellow bg-dc-bg-hover'
                  : 'text-dc-text-muted hover:text-dc-yellow hover:bg-dc-bg-hover',
              ]"
            >
              <font-awesome-icon icon="face-smile" class="text-[14px]" />
            </button>
            <Teleport to="body">
              <div
                v-if="showEmojiPicker"
                class="emoji-picker-portal fixed z-[500]"
                :style="emojiPickerStyle"
              >
                <EmojiPicker @pick="insertEmoji" />
              </div>
            </Teleport>
          </div>

          <div class="flex-1" />

          <!-- Character hint -->
          <span
            v-if="messageInput.length > 0"
            class="text-[11px] text-dc-text-muted mr-2 select-none"
          >
            Shift+Enter для переноса
          </span>

          <!-- File attachment button -->
          <input ref="fileInputRef" type="file" class="hidden" @change="onFileSelected" />
          <button
            v-if="chatStore.isConnected"
            @click="openFilePicker"
            :disabled="isUploading"
            class="w-8 h-8 flex items-center justify-center rounded-lg text-dc-text-muted hover:text-dc-blurple hover:bg-dc-bg-hover transition-colors disabled:opacity-50"
            :title="t('chat.attachFile')"
          >
            <font-awesome-icon
              :icon="isUploading ? 'spinner' : 'paperclip'"
              :class="{ 'animate-spin': isUploading }"
              class="text-[14px]"
            />
          </button>

          <!-- Mic button (shown when input is empty) -->
          <button
            v-if="!messageInput.trim() && chatStore.isConnected"
            @click="startRecording"
            class="w-8 h-8 flex items-center justify-center rounded-lg text-dc-text-muted hover:text-dc-red hover:bg-dc-bg-hover transition-colors"
            title="Voice message"
          >
            <font-awesome-icon icon="microphone" class="text-[14px]" />
          </button>

          <!-- Send button (shown when there's text) -->
          <button
            v-else
            @click="sendMessage"
            :disabled="!chatStore.isConnected || !messageInput.trim()"
            :class="[
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all',
              messageInput.trim() && chatStore.isConnected
                ? 'bg-dc-blurple hover:bg-dc-blurple-hover text-white shadow-sm'
                : 'bg-dc-bg-active text-dc-text-muted cursor-not-allowed opacity-50',
            ]"
          >
            <font-awesome-icon icon="paper-plane" class="text-[12px]" />
            {{ t('chat.send') }}
          </button>
        </div>
      </div>
    </div>

    <!-- Touch action sheet (long-press) -->
    <Teleport to="body">
      <Transition name="touch-sheet">
        <div
          v-if="showTouchActionsFor"
          class="fixed inset-0 z-[9999] flex flex-col justify-end"
          @click="closeTouchActions"
        >
          <div class="absolute inset-0 bg-black/50" />
          <div
            class="touch-sheet-panel relative bg-dc-bg-floating rounded-t-2xl overflow-hidden shadow-2xl"
            @click.stop
            @touchstart.stop
          >
            <!-- Drag handle -->
            <div class="flex justify-center pt-3 pb-1">
              <div class="w-10 h-1 bg-dc-separator rounded-full" />
            </div>
            <!-- Message preview -->
            <div class="px-4 pb-3 border-b border-dc-separator">
              <p class="text-sm text-dc-text-muted line-clamp-2 leading-snug">
                {{ showTouchActionsFor.message.text }}
              </p>
            </div>
            <!-- Quick reactions -->
            <div class="flex justify-around px-4 py-3 border-b border-dc-separator">
              <button
                v-for="emoji in quickReactions"
                :key="emoji"
                @click="touchReact(emoji)"
                :class="[
                  'w-12 h-12 flex items-center justify-center rounded-2xl text-2xl transition-colors',
                  hasUserReacted(showTouchActionsFor.message.reactions, emoji)
                    ? 'bg-dc-blurple/30'
                    : 'active:bg-dc-bg-hover',
                ]"
              >
                {{ emoji }}
              </button>
            </div>
            <!-- Actions -->
            <div class="py-1">
              <button
                @click="touchReply"
                class="w-full flex items-center gap-4 px-5 py-4 text-dc-text active:bg-dc-bg-hover text-[15px]"
              >
                <font-awesome-icon icon="reply" class="text-dc-text-muted w-5" />
                {{ t('chat.reply') }}
              </button>
              <button
                v-if="isOwnMessage(showTouchActionsFor.from)"
                @click="touchEdit"
                class="w-full flex items-center gap-4 px-5 py-4 text-dc-text active:bg-dc-bg-hover text-[15px]"
              >
                <font-awesome-icon icon="pencil" class="text-dc-text-muted w-5" />
                {{ t('chat.edit') }}
              </button>
              <button
                v-if="isOwnMessage(showTouchActionsFor.from)"
                @click="touchDelete"
                class="w-full flex items-center gap-4 px-5 py-4 text-dc-red active:bg-dc-bg-hover text-[15px]"
              >
                <font-awesome-icon icon="trash" class="w-5" />
                {{ t('chat.delete') }}
              </button>
              <div class="h-px bg-dc-separator mx-4 mt-1" />
              <button
                @click="closeTouchActions"
                class="w-full px-5 py-4 text-dc-text-muted active:bg-dc-bg-hover text-[15px] font-medium text-center"
              >
                {{ t('common.cancel') }}
              </button>
            </div>
            <div style="height: env(safe-area-inset-bottom, 0px)" />
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Reaction picker (teleported to body) -->
    <Teleport to="body">
      <Transition name="popup">
        <div
          v-if="showReactionPickerFor && reactionPickerPosition"
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

    <!-- Media preview lightbox -->
    <MediaPreview
      v-if="previewSrc"
      :src="previewSrc"
      :type="previewType"
      :file-name="previewFileName"
      @close="closePreview"
    />
  </div>
</template>

<style>
.touch-sheet-enter-active,
.touch-sheet-leave-active {
  transition: opacity 0.25s ease;
}
.touch-sheet-enter-active .touch-sheet-panel,
.touch-sheet-leave-active .touch-sheet-panel {
  transition: transform 0.25s cubic-bezier(0.32, 0.72, 0, 1);
}
.touch-sheet-enter-from,
.touch-sheet-leave-to {
  opacity: 0;
}
.touch-sheet-enter-from .touch-sheet-panel,
.touch-sheet-leave-to .touch-sheet-panel {
  transform: translateY(100%);
}
</style>

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

@keyframes recording-wave {
  0%,
  100% {
    height: 4px;
  }
  50% {
    height: 22px;
  }
}
.recording-wave-bar {
  height: 4px;
  animation: recording-wave 0.8s ease-in-out infinite;
}
</style>
