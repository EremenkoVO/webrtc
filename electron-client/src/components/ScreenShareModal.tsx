import { useState, useEffect } from 'react'
import { FontAwesomeIcon } from '@/icons'
import { faDisplay, faWindowMaximize, faTimes } from '@/icons'
import { getAudioCapabilities } from '@/services/audioStreamService'
import type { AudioCapabilities } from '@/services/audioStreamService'

interface DesktopSource {
  id: string
  name: string
  thumbnailURL: string
  display_id?: string
  appIconURL?: string
}

export const RESOLUTION_PRESETS = [
  { label: '720p', width: 1280, height: 720 },
  { label: '1080p', width: 1920, height: 1080 },
  { label: '1440p', width: 2560, height: 1440 },
  { label: '4K', width: 3840, height: 2160 },
] as const

export const FRAME_RATE_OPTIONS = [15, 24, 30, 60] as const

export type AudioShareType = 'none' | 'screen' | 'application'

export interface ScreenShareOptions {
  sourceId?: string
  width: number
  height: number
  frameRate: number
  audio: boolean
  audioType: AudioShareType
}

type Props = {
  open: boolean
  onClose: () => void
  onConfirm: (options: ScreenShareOptions) => void
}

export default function ScreenShareModal({ open, onClose, onConfirm }: Props) {
  const [sources, setSources] = useState<DesktopSource[]>([])
  const [loadingSources, setLoadingSources] = useState(false)
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null)
  const [resolution, setResolution] = useState<(typeof RESOLUTION_PRESETS)[number]>(RESOLUTION_PRESETS[1])
  const [frameRate, setFrameRate] = useState<number>(30)
  const [audioType, setAudioType] = useState<AudioShareType>('none')
  const [audioCaps, setAudioCaps] = useState<AudioCapabilities | null>(null)
  const [loadingCaps, setLoadingCaps] = useState(false)

  const isElectron = typeof window !== 'undefined' && window.electronAPI?.getDesktopSources

  // Fetch desktop sources and audio capabilities when the modal opens
  useEffect(() => {
    if (!open) return

    // Audio capabilities (always)
    setLoadingCaps(true)
    getAudioCapabilities()
      .then(setAudioCaps)
      .catch((err) => console.error('getAudioCapabilities', err))
      .finally(() => setLoadingCaps(false))

    // Desktop sources (Electron only)
    if (isElectron) {
      setLoadingSources(true)
      window
        .electronAPI!.getDesktopSources!()
        .then((list: DesktopSource[]) => {
          setSources(list)
          if (list.length && !selectedSourceId) setSelectedSourceId(list[0].id)
        })
        .catch((err: unknown) => console.error('getDesktopSources', err))
        .finally(() => setLoadingSources(false))
    }
  }, [open, isElectron])

  const handleSubmit = () => {
    const options: ScreenShareOptions = {
      sourceId: selectedSourceId || undefined,
      width: resolution.width,
      height: resolution.height,
      frameRate,
      audio: audioType !== 'none',
      audioType,
    }
    onConfirm(options)
    onClose()
  }

  // Determine which audio options are available
  const canScreenAudio = audioCaps?.canCaptureScreenAudio ?? false
  const canAppAudio = audioCaps?.canCaptureAppAudio ?? false
  const platformLabel = audioCaps
    ? { darwin: 'macOS', win32: 'Windows', linux: 'Linux', browser: 'Браузер' }[audioCaps.platform]
    : ''

  if (!open) return null

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/60" onClick={onClose} aria-hidden />
      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl bg-slate-800 p-6 shadow-xl border border-slate-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Демонстрация экрана</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:bg-slate-700 hover:text-white"
            aria-label="Закрыть"
          >
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        {isElectron && (
          <div className="mb-4">
            <p className="text-sm text-slate-300 mb-2">Источник</p>
            {loadingSources ? (
              <p className="text-slate-400 text-sm">Загрузка источников…</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                {sources.map((src) => {
                  const isScreen = 'display_id' in src && src.display_id != null
                  return (
                    <button
                      type="button"
                      key={src.id}
                      onClick={() => setSelectedSourceId(src.id)}
                      className={`rounded-lg overflow-hidden border-2 text-left transition-colors ${
                        selectedSourceId === src.id
                          ? 'border-sky-500 ring-2 ring-sky-500/30'
                          : 'border-slate-600 hover:border-slate-500'
                      }`}
                    >
                      <img
                        src={src.thumbnailURL}
                        alt=""
                        className="w-full h-20 object-cover bg-slate-700"
                      />
                      <div className="p-2 bg-slate-700/80 flex items-center gap-2">
                        <FontAwesomeIcon
                          icon={isScreen ? faDisplay : faWindowMaximize}
                          className="text-slate-400 text-xs flex-shrink-0"
                        />
                        <span className="text-xs text-white truncate" title={src.name}>
                          {src.name}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {!isElectron && (
          <p className="text-sm text-slate-400 mb-4">
            После нажатия «Начать» откроется системное окно выбора экрана или окна.
          </p>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-300 mb-1">Разрешение</label>
            <select
              value={RESOLUTION_PRESETS.indexOf(resolution)}
              onChange={(e) => setResolution(RESOLUTION_PRESETS[Number(e.target.value)])}
              className="w-full rounded-lg bg-slate-700 border border-slate-600 text-white px-3 py-2 focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
            >
              {RESOLUTION_PRESETS.map((r, i) => (
                <option key={r.label} value={i}>
                  {r.label} ({r.width}×{r.height})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-slate-300 mb-1">Частота кадров (FPS)</label>
            <select
              value={frameRate}
              onChange={(e) => setFrameRate(Number(e.target.value))}
              className="w-full rounded-lg bg-slate-700 border border-slate-600 text-white px-3 py-2 focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
            >
              {FRAME_RATE_OPTIONS.map((f) => (
                <option key={f} value={f}>
                  {f} fps
                </option>
              ))}
            </select>
          </div>

          {/* ── Audio options with platform awareness ──────────────────── */}
          <div>
            <label className="block text-sm text-slate-300 mb-1">Звук</label>
            {loadingCaps ? (
              <p className="text-xs text-slate-500">Определение возможностей…</p>
            ) : (
              <>
                <select
                  value={audioType}
                  onChange={(e) => setAudioType(e.target.value as AudioShareType)}
                  className="w-full rounded-lg bg-slate-700 border border-slate-600 text-white px-3 py-2 focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                >
                  <option value="none">Без звука</option>
                  <option value="screen" disabled={!canScreenAudio}>
                    Звук экрана{!canScreenAudio ? ' (недоступно)' : ''}
                  </option>
                  <option value="application" disabled={!canAppAudio}>
                    Звук приложения{!canAppAudio ? ' (недоступно)' : ''}
                  </option>
                </select>

                {/* Platform-specific hints */}
                {audioCaps && (
                  <div className="mt-2 space-y-1">
                    {audioCaps.platform !== 'browser' && (
                      <p className="text-xs text-slate-500">
                        Платформа: {platformLabel}
                      </p>
                    )}

                    {/* macOS: virtual driver status */}
                    {audioCaps.platform === 'darwin' && audioCaps.requiresVirtualDriver && (
                      audioCaps.virtualDriverInstalled ? (
                        <p className="text-xs text-green-400">
                          Виртуальный аудиодрайвер обнаружен: {audioCaps.virtualAudioDevices[0]?.label}
                        </p>
                      ) : (
                        <div className="p-2 rounded-lg bg-amber-900/30 border border-amber-700/50">
                          <p className="text-xs text-amber-300">
                            Для захвата системного аудио на macOS необходим виртуальный аудиодрайвер.
                          </p>
                          <a
                            href="https://existential.audio/blackhole/"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-sky-400 hover:text-sky-300 underline mt-1 inline-block"
                          >
                            Установить BlackHole (бесплатно)
                          </a>
                        </div>
                      )
                    )}

                    {/* Windows/Linux: loopback info */}
                    {(audioCaps.platform === 'win32' || audioCaps.platform === 'linux') && canScreenAudio && (
                      <p className="text-xs text-slate-500">
                        Системное аудио передаётся через loopback-захват.
                      </p>
                    )}

                    {/* Virtual devices found (all platforms) */}
                    {audioCaps.virtualAudioDevices.length > 0 && audioCaps.platform !== 'darwin' && (
                      <p className="text-xs text-slate-500">
                        Виртуальные устройства: {audioCaps.virtualAudioDevices.map((d) => d.label).join(', ')}
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-600 text-white hover:bg-slate-500"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isElectron && sources.length > 0 && !selectedSourceId}
            className="px-4 py-2 rounded-lg bg-sky-600 text-white hover:bg-sky-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Начать демонстрацию
          </button>
        </div>
      </div>
    </>
  )
}
