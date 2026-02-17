export interface AudioApplication {
  pid: number
  name: string
  icon?: string
}

export interface ElectronAPI {
  platform: string
  isElectron: boolean
  getDesktopSources: () => Promise<Array<{
    id: string
    name: string
    thumbnailURL: string
    display_id?: string
    appIconURL?: string
  }>>
  getAudioCapabilities: () => Promise<{
    platform: string
    supportsDesktopAudioLoopback: boolean
    requiresVirtualDriver: boolean
    hasMicrophonePermission: boolean
  }>
  selectSource?: (handlerId: string, sourceId: string | null, includeAudio: boolean) => void
  audioCapture?: {
    getAudioApplications: () => Promise<AudioApplication[]>
    startAudioCapture: (pid: number) => Promise<{ success: boolean; error?: string }>
    stopAudioCapture: () => Promise<{ success: boolean; error?: string }>
    onAudioData: (callback: (data: Float32Array) => void) => void
    onAudioError: (callback: (error: string) => void) => void
    removeAudioDataListener: () => void
    removeAudioErrorListener: () => void
  }
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}
