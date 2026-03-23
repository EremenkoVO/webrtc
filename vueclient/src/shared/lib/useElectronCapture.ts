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
  const platform = window.electronAPI?.platform ?? ''
  // Chromium/Electron can terminate renderer with bad IPC for window-source
  // audio when using legacy chromeMediaSourceId constraints. Keep window audio
  // disabled on this path until migrated to a displayMedia handler flow.
  const allowAudio = params.captureAudio && params.sourceType === 'screen'

  // @ts-expect-error — Electron-specific chrome constraints
  const mandatoryVideo = {
    chromeMediaSource: 'desktop',
    chromeMediaSourceId: params.sourceId,
    ...(params.resolution
      ? {
          maxWidth: params.resolution.width,
          maxHeight: params.resolution.height,
        }
      : {}),
    ...(params.frameRate ? { maxFrameRate: params.frameRate } : {}),
  }

  // ── Audio ─────────────────────────────────────────────────────────────────
  let audioTrack: MediaStreamTrack | null = null
  let videoTrack: MediaStreamTrack | null = null

  if (allowAudio) {
    // On Windows, opening separate desktop capture sessions for video and audio
    // can trigger renderer termination. Prefer a single combined stream request.
    try {
      const combinedStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          // @ts-expect-error
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: params.sourceId,
          },
        },
        video: {
          // @ts-expect-error
          mandatory: mandatoryVideo,
        },
      })
      videoTrack = combinedStream.getVideoTracks()[0] ?? null
      audioTrack = combinedStream.getAudioTracks()[0] ?? null
    } catch {
      // Fall back to safer single-video capture below.
    }
  }

  // ── Video ─────────────────────────────────────────────────────────────────
  if (!videoTrack) {
    const videoStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        // @ts-expect-error
        mandatory: mandatoryVideo,
      },
    })
    videoTrack = videoStream.getVideoTracks()[0] ?? null
  }

  if (!videoTrack) {
    throw new Error('No screen video track available')
  }

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

    if (!audioTrack && platform !== 'win32') {
      // Fallback: desktop source audio via selected sourceId.
      // For screen source this is typically system loopback; for window source it is
      // source-bound window/app audio when supported by Chromium/Electron.
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

  if (audioTrack) {
    audioTrack.contentHint = params.sourceType === 'screen' ? 'screen' : 'music'
  }
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
