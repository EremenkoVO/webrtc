"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    platform: process.platform,
    isElectron: true,
    getDesktopSources: () => electron_1.ipcRenderer.invoke('getDesktopSources'),
    getAudioCapabilities: () => electron_1.ipcRenderer.invoke('getAudioCapabilities'),
});
