/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  /** Optional. Chat WebSocket server (e.g. http://localhost:3001). If set, chat uses this URL and path /ws. */
  readonly VITE_CHAT_WS_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface DesktopCaptureSource {
  id: string
  name: string
  thumbnailURL: string
  display_id?: string
  appIconURL?: string
}

interface ElectronAudioCapabilities {
  platform: 'darwin' | 'win32' | 'linux'
  supportsDesktopAudioLoopback: boolean
  requiresVirtualDriver: boolean
  hasMicrophonePermission: boolean
}

interface ElectronAPI {
  platform?: string
  isElectron?: boolean
  getDesktopSources?: () => Promise<DesktopCaptureSource[]>
  getAudioCapabilities?: () => Promise<ElectronAudioCapabilities>
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}
