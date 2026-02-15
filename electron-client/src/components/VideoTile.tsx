import { useRef, useEffect } from 'react'

type Props = {
  stream: MediaStream
  muted: boolean
  volume: number
  peerPlaybackMuted: boolean
  onMuteChange: (muted: boolean) => void
  onVolumeChange: (volume: number) => void
  audioStream?: MediaStream
}

export default function VideoTile({
  stream,
  muted,
  volume,
  peerPlaybackMuted,
  onMuteChange: _onMuteChange,
  onVolumeChange: _onVolumeChange,
  audioStream,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  // Храним поток только с видео и привязываем к видео-элементу только при смене id видео-треков.
  // Без state — только ref и один эффект, чтобы переключение микрофона не трогало видео (как во vueclient).
  const videoOnlyStreamRef = useRef<MediaStream | null>(null)
  const videoTrackIds = stream?.getVideoTracks().map((t) => t.id).join(',') ?? ''

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    if (!stream || stream.getVideoTracks().length === 0) {
      videoOnlyStreamRef.current = null
      el.srcObject = null
      return
    }
    const ids = stream.getVideoTracks().map((t) => t.id).join(',')
    const prevIds = videoOnlyStreamRef.current?.getVideoTracks().map((t) => t.id).join(',') ?? ''
    if (prevIds === ids) return
    const videoOnly = new MediaStream(stream.getVideoTracks())
    videoOnlyStreamRef.current = videoOnly
    el.srcObject = videoOnly
    el.muted = true
  }, [videoTrackIds])

  // Set up audio stream (only when the stream itself changes)
  useEffect(() => {
    if (audioRef.current && audioStream?.getAudioTracks().length) {
      const as = new MediaStream(audioStream.getAudioTracks())
      audioRef.current.srcObject = as
      audioRef.current.muted = false
      audioRef.current.play().catch(() => {})
    } else if (audioRef.current) {
      audioRef.current.srcObject = null
    }
  }, [audioStream])

  // Apply volume / playback-mute without recreating the stream
  useEffect(() => {
    if (audioRef.current && audioRef.current.srcObject) {
      audioRef.current.volume = peerPlaybackMuted ? 0 : volume
    }
  }, [peerPlaybackMuted, volume])

  return (
    <div className="relative w-full h-full bg-slate-800">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="w-full h-full object-cover"
        muted={muted}
      />
      <audio ref={audioRef} autoPlay />
    </div>
  )
}
