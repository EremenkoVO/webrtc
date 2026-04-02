// Type declarations for the API exposed by the Electron preload script.
// Only present when running inside Electron; undefined in the browser.

interface CaptureSource {
  id:        string
  name:      string
  thumbnail: string        // data URL
  appIcon:   string | null // data URL or null
  display_id: string
  type:      'screen' | 'window'
}

interface ElectronCapturer {
  getSources(): Promise<CaptureSource[]>
  isNativeAvailable(): Promise<boolean>
  startAppAudio(sourceId: string): Promise<boolean>
  stopAppAudio(): Promise<void>
  onAudioData(cb: (pcm: ArrayBuffer, sampleRate: number, channels: number) => void): () => void
  onAudioError(cb: (msg: string) => void): () => void
}

interface ElectronAPI {
  getServerUrl(): Promise<string>
  setServerUrl(url: string): Promise<void>
  getAppVersion(): Promise<string>
  platform: string
  useSystemPicker: boolean
  capturer: ElectronCapturer
  notifications?: {
    show(payload: {
      title: string
      body?: string
      icon?: string
      tag?: string
      silent?: boolean
    }): Promise<boolean>
    onClick(cb: (tag: string) => void): () => void
  }
}

interface Window {
  electronAPI?: ElectronAPI
}
