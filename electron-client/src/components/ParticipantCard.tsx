import { useRef, useEffect } from 'react'
import { FontAwesomeIcon } from '@/icons'
import { faMicrophone, faMicrophoneSlash } from '@/icons'

type Props = {
  name: string
  isMuted: boolean
  isSpeaking: boolean
  isLocal?: boolean
  volume?: number
  playbackMuted?: boolean
  audioStream?: MediaStream
  onMuteChange: (muted: boolean) => void
  onVolumeChange: (volume: number) => void
}

export default function ParticipantCard({
  name,
  isMuted,
  isSpeaking,
  isLocal,
  volume = 1,
  playbackMuted = false,
  audioStream,
  onMuteChange: _onMuteChange,
  onVolumeChange: _onVolumeChange,
}: Props) {
  const audioRef = useRef<HTMLAudioElement>(null)

  // Set up audio stream (only when stream changes, not on every volume tweak)
  useEffect(() => {
    if (isLocal || !audioRef.current) return
    if (audioStream?.getAudioTracks().length) {
      const as = new MediaStream(audioStream.getAudioTracks())
      audioRef.current.srcObject = as
      audioRef.current.muted = false
      audioRef.current.play().catch(() => {})
    } else {
      audioRef.current.srcObject = null
    }
  }, [audioStream, isLocal])

  // Apply volume / playback-mute without recreating the stream
  useEffect(() => {
    if (isLocal || !audioRef.current || !audioRef.current.srcObject) return
    audioRef.current.volume = playbackMuted ? 0 : volume
  }, [volume, playbackMuted, isLocal])

  const initials = name
    ? name
        .split(' ')
        .map((p) => p[0])
        .join('')
        .toUpperCase()
        .slice(0, 2) || '?'
    : '?'

  return (
    <div
      className={`relative flex flex-col items-center justify-center p-4 rounded-lg bg-slate-800 border-2 transition-all ${
        isSpeaking ? 'border-green-500 shadow-lg' : 'border-slate-700'
      }`}
    >
      <div className="w-12 h-12 rounded-full bg-slate-700 flex items-center justify-center text-lg font-bold text-slate-300 mb-2">
        {initials}
      </div>
      <p className="text-sm font-medium text-white truncate w-full text-center">{name}</p>
      <div className="flex items-center gap-1 mt-1">
        <FontAwesomeIcon
          icon={isMuted ? faMicrophoneSlash : faMicrophone}
          className={`text-xs ${isMuted ? 'text-slate-500' : 'text-slate-400'}`}
        />
        {isSpeaking && <span className="text-xs text-green-400">Говорит</span>}
      </div>
      <audio ref={audioRef} autoPlay />
    </div>
  )
}
