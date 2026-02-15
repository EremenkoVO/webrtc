import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { AuthService, SignalingService } from '@/api'
import type { UserProfile, Room } from '@/api'
import { useAuthStore } from '@/stores/authStore'
import { useRoomStore } from '@/stores/roomStore'
import { useSidebarStore } from '@/stores/sidebarStore'
import { useApiErrors } from '@/hooks/useApiErrors'
import { FontAwesomeIcon } from '@/icons'
import { faCheck, faHashtag, faPlus, faSignOutAlt, faSync, faTimes, faUser, faXmark } from '@/icons'

export default function Sidebar({ user }: { user: UserProfile }) {
  const navigate = useNavigate()
  const [showCreateInput, setShowCreateInput] = useState(false)
  const [newChannelName, setNewChannelName] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const authStore = useAuthStore.getState()
  const roomStore = useRoomStore()
  const sidebarStore = useSidebarStore()
  const { parseApiError, clearErrors } = useApiErrors()

  const channels = roomStore.channels
  const selectedChannelId = roomStore.selectedChannelId
  const filteredChannels = searchQuery.trim()
    ? channels.filter((ch) => ch.name?.toLowerCase().includes(searchQuery.toLowerCase()))
    : channels

  const refreshChannels = useCallback(async () => {
    setIsLoading(true)
    try {
      await roomStore.getListChannels()
    } catch (e) {
      parseApiError(e)
    } finally {
      setIsLoading(false)
    }
  }, [roomStore, parseApiError])

  const addChannel = useCallback(async () => {
    if (!newChannelName.trim()) return
    clearErrors()
    setIsLoading(true)
    try {
      await SignalingService.createRoom({ name: newChannelName.trim() })
      await roomStore.getListChannels()
      setNewChannelName('')
      setShowCreateInput(false)
      setSearchQuery('')
    } catch (e) {
      parseApiError(e)
    } finally {
      setIsLoading(false)
    }
  }, [newChannelName, roomStore, parseApiError, clearErrors])

  const selectChannel = useCallback(
    (channelId: string, roommates?: string[]) => {
      roomStore.selectChannel(channelId, roommates)
      sidebarStore.close()
    },
    [roomStore, sidebarStore]
  )

  const logout = useCallback(async () => {
    try {
      await AuthService.logoutUser()
    } catch (e) {
      console.warn('Logout API failed', e)
    }
    authStore.clearTokens()
    navigate('/auth/login')
    window.location.reload()
  }, [navigate, authStore])

  useEffect(() => {
    useSidebarStore.getState().checkMobile()
    useRoomStore.getState().getListChannels().catch((e) => console.error(e))
    const onResize = () => useSidebarStore.getState().checkMobile()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return (
    <>
      {sidebarStore.isMobile && sidebarStore.isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => sidebarStore.close()}
          aria-hidden
        />
      )}
      <aside
        data-sidebar
        className={`fixed md:static inset-y-0 left-0 z-40 flex flex-col bg-slate-900/95 border-r border-slate-800 w-[260px] min-w-[260px] sm:w-[280px] sm:min-w-[280px] xl:w-[320px] xl:min-w-[320px] flex-shrink-0 transition-transform duration-300 ${
          sidebarStore.isMobile ? (sidebarStore.isOpen ? 'translate-x-0' : '-translate-x-full') : ''
        }`}
      >
        <header className="flex items-center justify-between p-4 border-b border-slate-800 flex-shrink-0">
          <div>
            <h1 className="text-lg font-bold text-white">Каналы</h1>
            <p className="text-xs text-slate-400">{filteredChannels.length} каналов</p>
          </div>
          {sidebarStore.isMobile && (
            <button
              onClick={() => sidebarStore.close()}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              aria-label="Закрыть"
            >
              <FontAwesomeIcon icon={faTimes} />
            </button>
          )}
        </header>

        <div className="p-3 border-b border-slate-800 space-y-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск каналов..."
            className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
          />
          <div className="flex gap-2">
            <button
              onClick={refreshChannels}
              disabled={isLoading}
              className="flex-1 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <FontAwesomeIcon icon={faSync} className={isLoading ? 'animate-spin' : ''} /> Обновить
            </button>
            <button
              onClick={() => setShowCreateInput(!showCreateInput)}
              className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium"
            >
              <FontAwesomeIcon icon={faPlus} />
            </button>
          </div>
          {showCreateInput && (
            <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700 space-y-2">
              <input
                value={newChannelName}
                onChange={(e) => setNewChannelName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addChannel()}
                placeholder="Название канала"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={addChannel}
                  disabled={!newChannelName.trim() || isLoading}
                  className="flex-1 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2"
                >
                  <FontAwesomeIcon icon={faCheck} /> Создать
                </button>
                <button
                  onClick={() => { setShowCreateInput(false); setNewChannelName('') }}
                  className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-sm"
                >
                  <FontAwesomeIcon icon={faXmark} />
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {!isLoading && filteredChannels.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center text-slate-400">
              <p className="font-medium">{searchQuery ? 'Каналы не найдены' : 'Нет каналов'}</p>
              <p className="text-sm">{searchQuery ? 'Попробуйте другой запрос' : 'Создайте первый канал'}</p>
            </div>
          )}
          {isLoading && channels.length === 0 && (
            <div className="flex justify-center py-12 text-slate-400">Загрузка...</div>
          )}
          <ul className="space-y-1">
            {filteredChannels.map((ch) => (
              <li key={String(ch?.id ?? '')}>
                {ch.id != null && (
                  <button
                    onClick={() => selectChannel(String(ch.id), (ch as Room).roommates)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm font-medium transition-colors ${
                      String(ch.id) === selectedChannelId
                        ? 'bg-indigo-600/20 text-indigo-300 border-l-4 border-indigo-500'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <FontAwesomeIcon icon={faHashtag} className="flex-shrink-0 text-slate-500" />
                    <span className="flex-1 truncate">{ch.name || 'Без названия'}</span>
                    {((ch as Room).roommates?.length ?? 0) > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-xs bg-slate-700 text-slate-300">
                        {(ch as Room).roommates!.length}
                      </span>
                    )}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className="p-4 border-t border-slate-800 flex-shrink-0">
          <div className="flex items-center gap-3 mb-4 p-3 rounded-lg bg-slate-800/50">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center text-white font-semibold text-sm">
              <FontAwesomeIcon icon={faUser} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white truncate">{user.username || 'User'}</p>
              <p className="text-xs text-slate-400">Онлайн</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg text-sm font-medium border border-red-600/30"
          >
            <FontAwesomeIcon icon={faSignOutAlt} /> Выйти
          </button>
        </div>
      </aside>
    </>
  )
}
