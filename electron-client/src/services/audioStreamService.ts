/**
 * Cross-platform audio capture service for Electron + WebRTC.
 *
 * Strategies by platform:
 *   macOS   – capture via virtual audio driver (BlackHole / Loopback / Soundflower).
 *             If no driver is detected the user is prompted to install one.
 *   Windows – Chromium's chromeMediaSource:'desktop' provides system-level loopback audio.
 *   Linux   – PulseAudio/PipeWire monitor sources appear as audioinput devices; also
 *             supports chromeMediaSource:'desktop' loopback in Electron.
 *   Browser – falls back to getDisplayMedia({ audio: true }).
 *
 * For future per-app audio capture a native addon (C++ / Rust + N-API) can push
 * PCM frames through IPC → AudioWorkletProcessor → MediaStreamDestination.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Platform = 'darwin' | 'win32' | 'linux' | 'browser'

export interface AudioCapabilities {
  platform: Platform
  /** System-level audio capture is available */
  canCaptureScreenAudio: boolean
  /** Per-app audio capture is available (requires native addon) */
  canCaptureAppAudio: boolean
  /** Detected virtual / monitor audio devices that can carry system audio */
  virtualAudioDevices: MediaDeviceInfo[]
  /** Platform requires a user-installed virtual audio driver (macOS) */
  requiresVirtualDriver: boolean
  /** Virtual driver is detected and ready to use */
  virtualDriverInstalled: boolean
  /** Human-readable guidance when the driver is missing */
  instructions?: string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Patterns that identify virtual / loopback / monitor audio sources */
const VIRTUAL_DEVICE_PATTERNS: RegExp[] = [
  // macOS
  /blackhole/i,
  /loopback/i,
  /soundflower/i,
  /existential/i,
  // Windows
  /stereo\s*mix/i,
  /wave\s*out\s*mix/i,
  /virtual.*cable/i,
  /vb[- ]?audio/i,
  /voicemeeter/i,
  // Linux (PulseAudio / PipeWire)
  /monitor\s+of/i,
  /pulse/i,
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getPlatform(): Platform {
  if (window.electronAPI?.platform) return window.electronAPI.platform as Platform
  return 'browser'
}

function isElectron(): boolean {
  return !!window.electronAPI?.isElectron
}

async function enumerateVirtualDevices(): Promise<MediaDeviceInfo[]> {
  let devices = await navigator.mediaDevices.enumerateDevices()
  const audioInputs = devices.filter((d) => d.kind === 'audioinput')

  // If labels are empty, we need microphone permission to read them.
  // This commonly happens on macOS before the first getUserMedia call.
  const hasLabels = audioInputs.some((d) => d.label.length > 0)
  if (!hasLabels && audioInputs.length > 0) {
    try {
      console.log('[audioStreamService] Device labels empty — requesting mic permission to read labels…')
      const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      tempStream.getTracks().forEach((t) => t.stop())
      devices = await navigator.mediaDevices.enumerateDevices()
    } catch (err) {
      console.warn('[audioStreamService] Could not obtain mic permission for device labels:', err)
    }
  }

  const virtual = devices.filter(
    (d) => d.kind === 'audioinput' && VIRTUAL_DEVICE_PATTERNS.some((p) => p.test(d.label)),
  )
  console.log(
    `[audioStreamService] Enumerated ${devices.filter((d) => d.kind === 'audioinput').length} audio inputs, ` +
    `${virtual.length} virtual: ${virtual.map((d) => d.label).join(', ') || '(none)'}`,
  )
  return virtual
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Detect audio capture capabilities for the current platform.
 */
export async function getAudioCapabilities(): Promise<AudioCapabilities> {
  const platform = getPlatform()
  const virtualDevices = await enumerateVirtualDevices()

  switch (platform) {
    case 'darwin':
      return {
        platform,
        canCaptureScreenAudio: virtualDevices.length > 0,
        canCaptureAppAudio: false,
        virtualAudioDevices: virtualDevices,
        requiresVirtualDriver: true,
        virtualDriverInstalled: virtualDevices.length > 0,
        instructions: virtualDevices.length > 0
          ? undefined
          : 'Для захвата системного аудио на macOS установите BlackHole:\nhttps://existential.audio/blackhole/',
      }
    case 'win32':
      return {
        platform,
        canCaptureScreenAudio: true,
        canCaptureAppAudio: false,
        virtualAudioDevices: virtualDevices,
        requiresVirtualDriver: false,
        virtualDriverInstalled: true,
      }
    case 'linux':
      return {
        platform,
        canCaptureScreenAudio: true,
        canCaptureAppAudio: false,
        virtualAudioDevices: virtualDevices,
        requiresVirtualDriver: false,
        virtualDriverInstalled: true,
      }
    default:
      return {
        platform: 'browser',
        canCaptureScreenAudio: true,
        canCaptureAppAudio: false,
        virtualAudioDevices: [],
        requiresVirtualDriver: false,
        virtualDriverInstalled: true,
      }
  }
}

/**
 * Capture screen / system audio and return a MediaStreamTrack.
 *
 * On failure returns `null` without throwing.
 */
export async function captureScreenAudio(
  sourceId?: string,
  capabilities?: AudioCapabilities,
): Promise<MediaStreamTrack | null> {
  const caps = capabilities ?? (await getAudioCapabilities())

  if (isElectron()) {
    return captureScreenAudioElectron(sourceId, caps)
  }
  return captureScreenAudioBrowser()
}

// ---------------------------------------------------------------------------
// Electron audio capture
// ---------------------------------------------------------------------------

async function captureScreenAudioElectron(
  sourceId: string | undefined,
  caps: AudioCapabilities,
): Promise<MediaStreamTrack | null> {
  if (caps.platform === 'darwin') {
    return captureMacOSAudio(caps)
  }
  // Windows & Linux — use Chromium desktop loopback
  return captureDesktopLoopback(sourceId)
}

/**
 * macOS: capture via a virtual audio device (BlackHole / Loopback / Soundflower).
 */
async function captureMacOSAudio(caps: AudioCapabilities): Promise<MediaStreamTrack | null> {
  if (caps.virtualAudioDevices.length === 0) {
    console.warn('[audioStreamService] macOS: no virtual audio device detected.')
    return null
  }
  const device = caps.virtualAudioDevices[0]
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: { exact: device.deviceId } },
      video: false,
    })
    const track = stream.getAudioTracks()[0] ?? null
    if (track && track.contentHint !== undefined) track.contentHint = 'music'
    return track
  } catch (err) {
    console.error('[audioStreamService] macOS virtual device capture failed:', err)
    return null
  }
}

/**
 * Windows / Linux (Electron): capture system loopback audio via chromeMediaSource:'desktop'.
 *
 * Chromium requires video when using chromeMediaSource:'desktop', so we request a tiny
 * 1×1 video track and immediately stop it.
 */
async function captureDesktopLoopback(sourceId?: string): Promise<MediaStreamTrack | null> {
  try {
    const mandatoryBase: Record<string, any> = { chromeMediaSource: 'desktop' }
    if (sourceId) mandatoryBase.chromeMediaSourceId = sourceId

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { mandatory: { ...mandatoryBase } } as any,
      video: {
        mandatory: {
          ...mandatoryBase,
          maxWidth: 1,
          maxHeight: 1,
          maxFrameRate: 1,
        },
      } as any,
    })

    // Dispose of the dummy video track
    stream.getVideoTracks().forEach((t) => t.stop())

    const audioTrack = stream.getAudioTracks()[0] ?? null
    if (audioTrack && audioTrack.contentHint !== undefined) audioTrack.contentHint = 'music'
    return audioTrack
  } catch (err) {
    console.error('[audioStreamService] Desktop loopback capture failed:', err)
    return null
  }
}

// ---------------------------------------------------------------------------
// Browser fallback
// ---------------------------------------------------------------------------

/**
 * Browser: use getDisplayMedia to obtain system/tab audio.
 * Note: the user will see a picker. We discard the video track.
 */
async function captureScreenAudioBrowser(): Promise<MediaStreamTrack | null> {
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true, // required by spec
      audio: true,
    })
    stream.getVideoTracks().forEach((t) => t.stop())
    const track = stream.getAudioTracks()[0] ?? null
    if (track && track.contentHint !== undefined) track.contentHint = 'music'
    return track
  } catch (err) {
    console.error('[audioStreamService] getDisplayMedia audio capture failed:', err)
    return null
  }
}

// ---------------------------------------------------------------------------
// AudioWorklet PCM pipeline (foundation for native addon path)
// ---------------------------------------------------------------------------

/**
 * Creates a MediaStreamTrack from an AudioWorklet that receives Float32 PCM
 * samples via its MessagePort. This is the injection point for a native audio
 * addon that captures per-app audio and sends PCM frames through Electron IPC.
 *
 * Usage:
 *   const { track, port, close } = await createPCMAudioTrack()
 *   // From main process via IPC → renderer → port:
 *   port.postMessage({ samples: float32Array })
 *   // Inject track into RTCPeerConnection
 *   pc.addTrack(track, stream)
 *   // When done:
 *   close()
 */
export async function createPCMAudioTrack(
  sampleRate = 48000,
): Promise<{ track: MediaStreamTrack; port: MessagePort; close: () => void }> {
  const ctx = new AudioContext({ sampleRate })
  await ctx.audioWorklet.addModule('/audio-stream-processor.js')

  const workletNode = new AudioWorkletNode(ctx, 'audio-stream-processor', {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [1],
  })

  const dest = ctx.createMediaStreamDestination()
  workletNode.connect(dest)

  const track = dest.stream.getAudioTracks()[0]
  if (track.contentHint !== undefined) track.contentHint = 'music'

  return {
    track,
    port: workletNode.port,
    close: () => {
      workletNode.disconnect()
      dest.disconnect()
      ctx.close().catch(() => undefined)
    },
  }
}
