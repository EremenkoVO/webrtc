import { useState, useEffect, useRef, useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useChatStore } from '@/stores/chatStore'
import type { ChatMessage } from '@/stores/chatStore'
import { FontAwesomeIcon } from '@/icons'
import { faPaperPlane } from '@/icons'

type Props = {
  roomId: string | null
  userName: string | undefined
}

export default function Chat({ roomId, userName }: Props) {
  const [messageInput, setMessageInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const currentRoomId = useChatStore((s) => s.currentRoomId)
  const messagesByRoom = useChatStore((s) => s.messagesByRoom)
  const messages = (currentRoomId ? messagesByRoom.get(currentRoomId) : []) || []
  const isConnected = useChatStore((s) => s.isConnected())
  const typingUsers = useChatStore(useShallow((s) => Array.from(s.typingUsers)))
  const connect = useChatStore((s) => s.connect)
  const disconnect = useChatStore((s) => s.disconnect)
  const sendMessageFn = useChatStore((s) => s.sendMessage)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    if (roomId == null || roomId === '' || !userName) {
      if (currentRoomId) disconnect()
      return
    }
    const roomIdStr = String(roomId)
    connect(roomIdStr, userName)
    setTimeout(scrollToBottom, 300)
  }, [roomId, userName])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  const sendMessage = () => {
    if (!messageInput.trim() || !isConnected) return
    sendMessageFn(messageInput)
    setMessageInput('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const formatTime = (timestamp: string) => {
    const d = new Date(timestamp)
    const now = new Date()
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    }
    return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  if (!roomId) {
    return (
      <div className="flex flex-col h-full p-4 text-slate-400 text-center">
        <p>Выберите канал для чата</p>
      </div>
    )
  }

  const isOwnMessage = (msg: ChatMessage) =>
    Boolean(userName && msg.username?.toLowerCase() === userName.toLowerCase())

  const getInitials = (name: string) =>
    name
      .split(/\s+/)
      .map((p) => p[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || '?'

  return (
    <div className="flex flex-col h-full bg-slate-900/40">
      <div className="px-4 py-3 border-b border-slate-700/60 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full flex-shrink-0 ${isConnected ? 'bg-emerald-500' : 'bg-slate-500'}`}
          />
          <span className="text-sm text-slate-300">
            {isConnected ? 'Чат подключён' : 'Подключение...'}
          </span>
        </div>
        {typingUsers.length > 0 && (
          <p className="text-xs text-slate-500 mt-1.5 truncate">
            {typingUsers.length === 1
              ? `${typingUsers[0]} печатает...`
              : `${typingUsers[0]} и ещё ${typingUsers.length - 1} печатают...`}
          </p>
        )}
      </div>

      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto min-h-0 px-3 py-4 space-y-2 scroll-smooth"
      >
        {messages.map((msg: ChatMessage, i: number) => {
          const own = isOwnMessage(msg)
          return (
            <div
              key={i}
              className={`flex gap-2 ${own ? 'flex-row-reverse' : ''}`}
            >
              <div
                className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-medium bg-slate-700 text-slate-300"
                title={msg.username}
              >
                {getInitials(msg.username || '?')}
              </div>
              <div
                className={`flex flex-col max-w-[85%] ${own ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`rounded-2xl px-4 py-2.5 shadow-sm ${
                    own
                      ? 'bg-indigo-600 text-white rounded-br-md'
                      : 'bg-slate-700/80 text-slate-100 rounded-bl-md'
                  }`}
                >
                  {!own && (
                    <span className="text-xs font-medium text-indigo-300 block mb-0.5">
                      {msg.username}
                    </span>
                  )}
                  <p className="text-sm break-words leading-relaxed">{msg.text}</p>
                </div>
                <span
                  className={`text-[11px] text-slate-500 mt-0.5 ${own ? 'mr-1' : 'ml-1'}`}
                >
                  {formatTime(msg.timestamp)}
                </span>
              </div>
            </div>
          )
        })}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-3 border-t border-slate-700/60 flex-shrink-0 bg-slate-900/60">
        <div className="flex gap-2 items-center">
          <input
            type="text"
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isConnected ? 'Сообщение' : 'Подключение...'}
            disabled={!isConnected}
            className="flex-1 px-4 py-2.5 bg-slate-800 border border-slate-600 rounded-full text-white placeholder-slate-500 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none disabled:opacity-50 transition-shadow"
          />
          <button
            onClick={sendMessage}
            disabled={!isConnected || !messageInput.trim()}
            className="p-2.5 rounded-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white flex items-center justify-center transition-colors min-w-[44px]"
            title="Отправить"
          >
            <FontAwesomeIcon icon={faPaperPlane} className="text-sm" />
          </button>
        </div>
      </div>
    </div>
  )
}
