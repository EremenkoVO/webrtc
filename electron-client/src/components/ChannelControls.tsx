import { useState, useEffect } from 'react'
import { FontAwesomeIcon } from '@/icons'
import {
  faChevronUp,
  faDisplay,
  faMicrophone,
  faMicrophoneSlash,
  faMusic,
  faPhoneSlash,
  faStop,
  faVideo,
  faVideoSlash,
  faCircleExclamation,
} from '@/icons'
import type { ScreenAudioStatus } from '@/hooks/useWebRTC'

type Props = {
  videoEnabled: boolean
  audioEnabled: boolean
  isScreenSharing: boolean
  screenAudioStatus: ScreenAudioStatus
  screenAudioLevel: number
  startScreenShare: (options?: import('@/hooks/useWebRTC').ScreenShareOptions) => void
  stopScreenShare: () => void
  onOpenScreenShareModal?: () => void
  currentCameraDeviceId: string | null
  currentMicrophoneDeviceId: string | null
  remotePeersCount: number
  onEndCall: () => void
  onToggleVideo: () => void
  onToggleMicrophone: () => void
  onSelectCamera: (deviceId: string) => void
  onSelectMicrophone: (deviceId: string) => void
  videoDevices: MediaDeviceInfo[]
  audioDevices: MediaDeviceInfo[]
  fetchVideoDevices: () => Promise<void>
  fetchAudioDevices: () => Promise<void>
}

export default function ChannelControls({
  videoEnabled,
  audioEnabled,
  isScreenSharing,
  screenAudioStatus,
  screenAudioLevel,
  startScreenShare,
  stopScreenShare,
  onOpenScreenShareModal,
  currentCameraDeviceId,
  currentMicrophoneDeviceId,
  remotePeersCount,
  onEndCall,
  onToggleVideo,
  onToggleMicrophone,
  onSelectCamera,
  onSelectMicrophone,
  videoDevices,
  audioDevices,
  fetchVideoDevices,
  fetchAudioDevices,
}: Props) {
  const [cameraMenuOpen, setCameraMenuOpen] = useState(false)
  const [microphoneMenuOpen, setMicrophoneMenuOpen] = useState(false)

  useEffect(() => {
    if (cameraMenuOpen) fetchVideoDevices()
  }, [cameraMenuOpen, fetchVideoDevices])
  useEffect(() => {
    if (microphoneMenuOpen) fetchAudioDevices()
  }, [microphoneMenuOpen, fetchAudioDevices])

  return (
    <div className="p-4 bg-slate-900/50 border-t border-slate-800">
      <div className="flex items-center justify-center gap-4 flex-wrap">
        <div className="relative flex items-center">
          <button
            type="button"
            onClick={onToggleVideo}
            className={`p-4 rounded-l-full transition-colors ${
              videoEnabled ? 'bg-slate-700 hover:bg-slate-600' : 'bg-red-600 hover:bg-red-700'
            }`}
            title={videoEnabled ? 'Выключить видео' : 'Включить видео'}
          >
            <FontAwesomeIcon icon={videoEnabled ? faVideo : faVideoSlash} className="text-lg text-white" />
          </button>
          <button
            type="button"
            onClick={() => setCameraMenuOpen(!cameraMenuOpen)}
            className="p-4 rounded-r-full bg-slate-700 hover:bg-slate-600"
            title="Выбрать камеру"
          >
            <FontAwesomeIcon icon={faChevronUp} className={`text-lg text-white transition-transform ${cameraMenuOpen ? 'rotate-180' : ''}`} />
          </button>
          {cameraMenuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setCameraMenuOpen(false)} />
              <ul className="absolute right-0 bottom-14 w-56 bg-slate-800 text-white rounded-xl shadow-lg z-50 max-h-48 overflow-y-auto py-2">
                {videoDevices.map((d) => (
                  <li
                    key={d.deviceId}
                    onClick={() => {
                      onSelectCamera(d.deviceId)
                      setCameraMenuOpen(false)
                    }}
                    className={`px-4 py-2 cursor-pointer hover:bg-slate-700 ${
                      currentCameraDeviceId === d.deviceId ? 'bg-slate-600' : ''
                    }`}
                  >
                    {d.label || `Камера ${videoDevices.indexOf(d) + 1}`}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="relative flex items-center">
          <button
            type="button"
            onClick={onToggleMicrophone}
            className={`p-4 rounded-l-full transition-colors ${
              audioEnabled ? 'bg-slate-700 hover:bg-slate-600' : 'bg-red-600 hover:bg-red-700'
            }`}
            title={audioEnabled ? 'Выключить микрофон' : 'Включить микрофон'}
          >
            <FontAwesomeIcon icon={audioEnabled ? faMicrophone : faMicrophoneSlash} className="text-lg text-white" />
          </button>
          <button
            type="button"
            onClick={() => setMicrophoneMenuOpen(!microphoneMenuOpen)}
            className="p-4 rounded-r-full bg-slate-700 hover:bg-slate-600"
            title="Выбрать микрофон"
          >
            <FontAwesomeIcon icon={faChevronUp} className={`text-lg text-white transition-transform ${microphoneMenuOpen ? 'rotate-180' : ''}`} />
          </button>
          {microphoneMenuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMicrophoneMenuOpen(false)} />
              <ul className="absolute right-0 bottom-14 w-56 bg-slate-800 text-white rounded-xl shadow-lg z-50 max-h-48 overflow-y-auto py-2">
                {audioDevices.map((d) => (
                  <li
                    key={d.deviceId}
                    onClick={() => {
                      onSelectMicrophone(d.deviceId)
                      setMicrophoneMenuOpen(false)
                    }}
                    className={`px-4 py-2 cursor-pointer hover:bg-slate-700 ${
                      currentMicrophoneDeviceId === d.deviceId ? 'bg-slate-600' : ''
                    }`}
                  >
                    {d.label || `Микрофон ${audioDevices.indexOf(d) + 1}`}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={
            isScreenSharing
              ? stopScreenShare
              : onOpenScreenShareModal
                ? onOpenScreenShareModal
                : () => startScreenShare()
          }
          className={`p-4 rounded-full transition-colors ${
            isScreenSharing
              ? 'bg-sky-600 hover:bg-sky-700'
              : 'bg-slate-700 hover:bg-slate-600'
          }`}
          title={isScreenSharing ? 'Остановить демонстрацию экрана' : 'Демонстрация экрана'}
        >
          <FontAwesomeIcon icon={isScreenSharing ? faStop : faDisplay} className="text-lg text-white" />
        </button>

        <button
          type="button"
          onClick={onEndCall}
          className="p-4 rounded-full bg-red-600 hover:bg-red-700"
          title="Завершить звонок"
        >
          <FontAwesomeIcon icon={faPhoneSlash} className="text-lg text-white" />
        </button>
      </div>
      <div className="mt-2 flex items-center justify-center gap-3 text-xs">
        <span className="text-slate-400">Участников: {remotePeersCount + 1}</span>
        {isScreenSharing && screenAudioStatus === 'capturing' && (
          <span className="flex items-center gap-1.5 text-green-400" title="Аудио экрана передаётся">
            <FontAwesomeIcon icon={faMusic} className="text-[10px]" />
            <span>Аудио</span>
            {/* VU-meter bar */}
            <span className="inline-flex items-end gap-px h-3">
              {[0.15, 0.3, 0.5, 0.7, 0.9].map((thresh, i) => (
                <span
                  key={i}
                  className={`w-[3px] rounded-sm transition-all duration-75 ${
                    screenAudioLevel >= thresh ? 'bg-green-400' : 'bg-slate-600'
                  }`}
                  style={{ height: `${4 + i * 2}px` }}
                />
              ))}
            </span>
          </span>
        )}
        {isScreenSharing && screenAudioStatus === 'failed' && (
          <span className="flex items-center gap-1 text-red-400" title="Не удалось захватить аудио экрана">
            <FontAwesomeIcon icon={faCircleExclamation} className="text-[10px]" />
            <span>Аудио не захвачено</span>
          </span>
        )}
        {isScreenSharing && screenAudioStatus === 'no-driver' && (
          <span className="flex items-center gap-1 text-amber-400" title="Нужен виртуальный аудиодрайвер (BlackHole)">
            <FontAwesomeIcon icon={faCircleExclamation} className="text-[10px]" />
            <span>Нет аудиодрайвера</span>
          </span>
        )}
      </div>
    </div>
  )
}
