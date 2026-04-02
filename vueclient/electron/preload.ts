import { contextBridge, ipcRenderer } from 'electron'

const useSystemPicker = process.env.USE_SYSTEM_PICKER !== 'false' && process.platform === 'darwin'

// ── Audio data event listeners ────────────────────────────────────────────────
// These are stubs — native per-app audio capture (macOS SCK) is not implemented.
// The renderer's useElectronCapture.ts falls back to desktop loopback audio automatically.

type AudioDataCallback = (pcm: ArrayBuffer, sampleRate: number, channels: number) => void
type AudioErrorCallback = (msg: string) => void
type NotificationClickCallback = (tag: string) => void

// ── Expose electronAPI ─────────────────────────────────────────────────────────

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  useSystemPicker,
  useLegacyMacScreenAudio: false,
  preferScapCapture: false,
  preferredTransportMode: 'p2p',
  preferredCaptureSource: 'screen',
  preferredCaptureResolution: { width: 1920, height: 1080 },
  preferredCaptureFrameRate: 30,
  preferredCaptureAudio: true,

  getServerUrl: (): Promise<string> => ipcRenderer.invoke('get-server-url'),

  setServerUrl: (url: string): Promise<void> => ipcRenderer.invoke('set-server-url', url),

  getAppVersion: (): Promise<string> => ipcRenderer.invoke('get-app-version'),

  capturer: {
    getSources: () => ipcRenderer.invoke('get-sources'),

    isNativeAvailable: (): Promise<boolean> => ipcRenderer.invoke('is-native-available'),

    startAppAudio: (sourceId: string): Promise<boolean> =>
      ipcRenderer.invoke('start-app-audio', sourceId),

    stopAppAudio: (): Promise<void> => ipcRenderer.invoke('stop-app-audio'),

    onAudioData: (cb: AudioDataCallback): (() => void) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        pcm: ArrayBuffer,
        sampleRate: number,
        channels: number,
      ) => cb(pcm, sampleRate, channels)
      ipcRenderer.on('audio-data', handler)
      return () => ipcRenderer.removeListener('audio-data', handler)
    },

    onAudioError: (cb: AudioErrorCallback): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, msg: string) => cb(msg)
      ipcRenderer.on('audio-error', handler)
      return () => ipcRenderer.removeListener('audio-error', handler)
    },
  },

  notifications: {
    show: (payload: {
      title: string
      body?: string
      icon?: string
      tag?: string
      silent?: boolean
    }): Promise<boolean> => ipcRenderer.invoke('notifications:show', payload),

    onClick: (cb: NotificationClickCallback): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, tag: string) => cb(tag)
      ipcRenderer.on('notifications:click', handler)
      return () => ipcRenderer.removeListener('notifications:click', handler)
    },
    setBadgeCount: (count: number): Promise<boolean> =>
      ipcRenderer.invoke('notifications:set-badge-count', count),
  },
})
