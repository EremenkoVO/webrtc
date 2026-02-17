import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isElectron: true,
  getDesktopSources: () => ipcRenderer.invoke('getDesktopSources'),
  getAudioCapabilities: () => ipcRenderer.invoke('getAudioCapabilities'),
  selectSource: (handlerId: string, sourceId: string | null, includeAudio: boolean) => {
    console.log('[Preload] ⚡ selectSource called:', { handlerId, sourceId, includeAudio })
    console.log('[Preload] Handler ID type:', typeof handlerId, 'value:', handlerId)
    try {
      console.log('[Preload] Sending IPC message to channel:', handlerId)
      ipcRenderer.send(handlerId, sourceId, includeAudio)
      console.log('[Preload] ✓ IPC message sent successfully to channel:', handlerId)
    } catch (error) {
      console.error('[Preload] ✗ Error sending IPC message:', error)
      throw error
    }
  },
  // Audio capture API для захвата аудио из приложений
  audioCapture: {
    getAudioApplications: () => ipcRenderer.invoke('get-audio-applications'),
    startAudioCapture: (pid: number) => ipcRenderer.invoke('start-audio-capture', pid),
    stopAudioCapture: () => ipcRenderer.invoke('stop-audio-capture'),
    onAudioData: (callback: (data: Float32Array) => void) => {
      ipcRenderer.on('audio-data', (_event, data: number[]) => {
        callback(new Float32Array(data))
      })
    },
    onAudioError: (callback: (error: string) => void) => {
      ipcRenderer.on('audio-capture-error', (_event, error: string) => {
        callback(error)
      })
    },
    removeAudioDataListener: () => {
      ipcRenderer.removeAllListeners('audio-data')
    },
    removeAudioErrorListener: () => {
      ipcRenderer.removeAllListeners('audio-capture-error')
    },
  },
})
