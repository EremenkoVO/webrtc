import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isElectron: true,
  getDesktopSources: () => ipcRenderer.invoke('getDesktopSources'),
  getAudioCapabilities: () => ipcRenderer.invoke('getAudioCapabilities'),
})
