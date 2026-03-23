/**
 * Manages Electron-specific screen / window capture:
 *  - Video: getUserMedia with chromeMediaSourceId
 *  - Audio: native per-app module (macOS SCK) → IPC → AudioWorklet → MediaStreamTrack
 *           or desktop loopback as fallback
 */

let audioCtx: AudioContext | null = null
let workletNode: AudioWorkletNode | null = null
let streamDest: MediaStreamAudioDestinationNode | null = null
let offAudioData: (() => void) | null = null
let offAudioError: (() => void) | null = null

async function buildAudioWorkletTrack(sampleRate = 48000): Promise<MediaStreamTrack> {
  if (audioCtx) {
    audioCtx.close()
    audioCtx = null
  }
  audioCtx = new AudioContext({ sampleRate })
  await audioCtx.audioWorklet.addModule('/app-audio-processor.js')
  workletNode = new AudioWorkletNode(audioCtx, 'app-audio-processor')
  streamDest = audioCtx.createMediaStreamDestination()
  workletNode.connect(streamDest)
  return streamDest.stream.getAudioTracks()[0]
}

export async function startElectronCapture(params: {
  sourceId: string
  sourceType: 'screen' | 'window'
  resolution?: { width: number; height: number } | null
  frameRate?: number | null
  captureAudio: boolean
}): Promise<{ videoTrack: MediaStreamTrack; audioTrack: MediaStreamTrack | null }> {
  const capturer = window.electronAPI!.capturer
  const allowAudio = params.captureAudio && params.sourceType === 'screen'

  // ── Video ─────────────────────────────────────────────────────────────────
  const constraints: MediaStreamConstraints = {
    audio: false,
    video: {
      // @ts-expect-error — Electron-specific chrome constraints
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: params.sourceId,
        ...(params.resolution
          ? {
              maxWidth: params.resolution.width,
              maxHeight: params.resolution.height,
            }
          : {}),
        ...(params.frameRate ? { maxFrameRate: params.frameRate } : {}),
      },
    },
  }
  const videoStream = await navigator.mediaDevices.getUserMedia(constraints)
  const videoTrack = videoStream.getVideoTracks()[0]

  // ── Audio ─────────────────────────────────────────────────────────────────
  let audioTrack: MediaStreamTrack | null = null

  if (allowAudio) {
    const hasNative = await capturer.isNativeAvailable()

    if (hasNative) {
      // Route through native module → IPC → AudioWorklet
      const track = await buildAudioWorkletTrack(48000)
      track.contentHint = 'screen'

      offAudioData = capturer.onAudioData((pcm, sampleRate, channels) => {
        // Resample if necessary (simple pass-through; worklet handles buffer)
        if (!workletNode) return
        const fa = new Float32Array(pcm)
        // If channels don't match (e.g. mono input, stereo output) – upmix
        let out = fa
        if (channels === 1 && fa.length > 0) {
          out = new Float32Array(fa.length * 2)
          for (let i = 0; i < fa.length; i++) {
            out[i * 2] = fa[i]
            out[i * 2 + 1] = fa[i]
          }
        }
        workletNode.port.postMessage({ type: 'pcm', pcm: out.buffer }, [out.buffer])
      })
      offAudioError = capturer.onAudioError((msg) => {
        console.warn('[ElectronCapture] audio error:', msg)
      })

      const ok = await capturer.startAppAudio(params.sourceId)
      if (ok) {
        audioTrack = track
      } else {
        // Native failed – fall through to desktop loopback below
        stopNativeAudio()
      }
    }

    if (!audioTrack) {
      // Fallback: system-wide desktop loopback audio (all supported platforms)
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            // @ts-expect-error
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: params.sourceId,
            },
          },
          video: false,
        })
        audioTrack = audioStream.getAudioTracks()[0] ?? null
      } catch {
        // Audio not available for this source; proceed without audio
      }
    }
  }

  if (audioTrack) audioTrack.contentHint = 'screen'
  return { videoTrack, audioTrack }
}

export function stopElectronCapture(): void {
  stopNativeAudio()
  if (audioCtx) {
    audioCtx.close()
    audioCtx = null
  }
  workletNode = null
  streamDest = null
}

function stopNativeAudio(): void {
  offAudioData?.()
  offAudioError?.()
  offAudioData = null
  offAudioError = null
  window.electronAPI?.capturer.stopAppAudio()
}
