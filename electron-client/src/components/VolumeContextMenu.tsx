import { useEffect, useRef, useState } from 'react'
import { FontAwesomeIcon } from '@/icons'
import { faVolumeHigh, faVolumeXmark } from '@/icons'

type Props = {
  x: number
  y: number
  title: string
  volume: number
  muted: boolean
  onVolumeChange: (v: number) => void
  onMuteChange: (muted: boolean) => void
  onClose: () => void
}

export default function VolumeContextMenu({
  x,
  y,
  title,
  volume,
  muted,
  onVolumeChange,
  onMuteChange,
  onClose,
}: Props) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [localVolume, setLocalVolume] = useState(volume)
  const [localMuted, setLocalMuted] = useState(muted)

  useEffect(() => {
    setLocalVolume(volume)
    setLocalMuted(muted)
  }, [volume, muted])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const handleVolumeChange = (v: number) => {
    setLocalVolume(v)
    onVolumeChange(v)
    if (v > 0 && localMuted) {
      setLocalMuted(false)
      onMuteChange(false)
    }
  }

  const toggleMute = () => {
    const next = !localMuted
    setLocalMuted(next)
    onMuteChange(next)
  }

  return (
    <>
      <div className="fixed inset-0 z-40" aria-hidden onClick={onClose} />
      <div
        ref={menuRef}
        className="fixed z-50 w-56 py-2 bg-slate-800 border border-slate-600 rounded-xl shadow-xl"
        style={{ left: Math.min(x, window.innerWidth - 224), top: Math.min(y, window.innerHeight - 180) }}
      >
        <p className="px-4 py-1.5 text-sm font-medium text-slate-200 truncate border-b border-slate-700" title={title}>
          {title}
        </p>
        <div className="px-4 py-3 space-y-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleMute}
              className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200"
              title={localMuted ? 'Включить звук' : 'Выключить звук'}
            >
              <FontAwesomeIcon icon={localMuted ? faVolumeXmark : faVolumeHigh} className="text-sm" />
            </button>
            <span className="text-xs text-slate-400">{localMuted ? 'Выкл' : 'Вкл'}</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={localMuted ? 0 : localVolume}
              onChange={(e) => handleVolumeChange(Number(e.target.value))}
              className="flex-1 h-2 rounded-full appearance-none bg-slate-600 accent-indigo-500"
            />
            <span className="text-xs text-slate-400 w-8">{Math.round((localMuted ? 0 : localVolume) * 100)}%</span>
          </div>
        </div>
      </div>
    </>
  )
}
