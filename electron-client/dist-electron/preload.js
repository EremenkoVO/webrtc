"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    platform: process.platform,
    isElectron: true,
    getDesktopSources: () => electron_1.ipcRenderer.invoke('getDesktopSources'),
    getAudioCapabilities: () => electron_1.ipcRenderer.invoke('getAudioCapabilities'),
    selectSource: (handlerId, sourceId, includeAudio) => {
        console.log('[Preload] ⚡ selectSource called:', { handlerId, sourceId, includeAudio });
        console.log('[Preload] Handler ID type:', typeof handlerId, 'value:', handlerId);
        try {
            console.log('[Preload] Sending IPC message to channel:', handlerId);
            electron_1.ipcRenderer.send(handlerId, sourceId, includeAudio);
            console.log('[Preload] ✓ IPC message sent successfully to channel:', handlerId);
        }
        catch (error) {
            console.error('[Preload] ✗ Error sending IPC message:', error);
            throw error;
        }
    },
    // Audio capture API для захвата аудио из приложений
    audioCapture: {
        getAudioApplications: () => electron_1.ipcRenderer.invoke('get-audio-applications'),
        startAudioCapture: (pid) => electron_1.ipcRenderer.invoke('start-audio-capture', pid),
        stopAudioCapture: () => electron_1.ipcRenderer.invoke('stop-audio-capture'),
        onAudioData: (callback) => {
            electron_1.ipcRenderer.on('audio-data', (_event, data) => {
                callback(new Float32Array(data));
            });
        },
        onAudioError: (callback) => {
            electron_1.ipcRenderer.on('audio-capture-error', (_event, error) => {
                callback(error);
            });
        },
        removeAudioDataListener: () => {
            electron_1.ipcRenderer.removeAllListeners('audio-data');
        },
        removeAudioErrorListener: () => {
            electron_1.ipcRenderer.removeAllListeners('audio-capture-error');
        },
    },
});
