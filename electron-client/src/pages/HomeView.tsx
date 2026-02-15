import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { UserService } from '@/api'
import type { UserProfile } from '@/api'
import { useAuthStore } from '@/stores/authStore'
import { useCallStore } from '@/stores/callStore'
import { useChatStore } from '@/stores/chatStore'
import { useRoomStore } from '@/stores/roomStore'
import { useSidebarStore } from '@/stores/sidebarStore'
import { useSignalingStore } from '@/stores/signalingStore'
import { useApiErrors } from '@/hooks/useApiErrors'
import Sidebar from '@/components/Sidebar'
import Channel from '@/components/Channel'

export default function HomeView() {
  const navigate = useNavigate()
  const userRef = useRef<UserProfile>({ id: '', username: '' })
  const [user, setUser] = useState<UserProfile>({ id: '', username: '' })

  const token = useAuthStore((s) => s.token)
  const refreshToken = useAuthStore((s) => s.refreshToken)
  const clearTokens = useAuthStore((s) => s.clearTokens)
  const { parseApiError } = useApiErrors()

  // Запуск signaling WebSocket при монтировании главной страницы
  useEffect(() => {
    const signaling = useSignalingStore.getState()
    if (!signaling.isConnected()) signaling.connect()
    return () => {
      if (useSignalingStore.getState().isConnected()) useSignalingStore.getState().disconnect()
    }
  }, [])

  function cleanup() {
    const callStore = useCallStore.getState()
    const chatStore = useChatStore.getState()
    const roomStore = useRoomStore.getState()
    const signalingStore = useSignalingStore.getState()
    if (callStore.isInCall) callStore.setStateCall(false)
    if (signalingStore.isConnected()) signalingStore.disconnect()
    roomStore.setRoommates([])
    roomStore.setParticipants([])
    if (chatStore.isConnected()) chatStore.disconnect()
    chatStore.clearMessages()
  }

  useEffect(() => {
    if (!token && !refreshToken) {
      navigate('/auth/login')
      return
    }
    useSidebarStore.getState().checkMobile()
    let cancelled = false
    UserService.getCurrentUser()
      .then((res) => {
        if (cancelled) return
        if (res && typeof res === 'object' && 'id' in res && 'username' in res) {
          const u = res as UserProfile
          userRef.current = u
          setUser(u)
        }
      })
      .catch((e) => {
        if (cancelled) return
        parseApiError(e)
        cleanup()
        clearTokens()
        navigate('/auth/login')
      })
    return () => {
      cancelled = true
      cleanup()
    }
  }, [token, refreshToken, navigate, clearTokens, parseApiError])

  return (
    <div className="flex h-screen w-screen min-w-0 overflow-hidden animated-gradient">
      <Sidebar user={user} />
      <main className="flex-1 min-w-0 overflow-hidden flex flex-col">
        <Channel userName={user.username} />
      </main>
    </div>
  )
}
