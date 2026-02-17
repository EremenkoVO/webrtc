/**
 * Пример интеграции нативного модуля захвата аудио с Electron
 * 
 * Этот файл показывает, как использовать модуль в Electron приложении
 */

import { AudioCapture, AudioApplication } from './index';

// В main process Electron
export function setupAudioCaptureIPC(ipcMain: Electron.IpcMain, mainWindow: Electron.BrowserWindow) {
  const audioCapture = new AudioCapture();

  // Получить список приложений с аудио
  ipcMain.handle('get-audio-applications', async () => {
    try {
      return await audioCapture.getAudioApplications();
    } catch (error) {
      console.error('Failed to get audio applications:', error);
      return [];
    }
  });

  // Начать захват аудио из приложения
  ipcMain.handle('start-audio-capture', async (_event, pid: number) => {
    try {
      await audioCapture.startCapture(pid);
      
      // Подписаться на аудио данные и отправлять в renderer через IPC
      audioCapture.on('data', (audioData: Float32Array) => {
        // Конвертировать Float32Array в обычный массив для IPC
        const arrayData = Array.from(audioData);
        mainWindow.webContents.send('audio-data', arrayData);
      });

      audioCapture.on('error', (error: Error) => {
        mainWindow.webContents.send('audio-capture-error', error.message);
      });

      return { success: true };
    } catch (error) {
      console.error('Failed to start audio capture:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // Остановить захват
  ipcMain.handle('stop-audio-capture', async () => {
    try {
      await audioCapture.stopCapture();
      return { success: true };
    } catch (error) {
      console.error('Failed to stop audio capture:', error);
      return { success: false, error: (error as Error).message };
    }
  });
}

// В preload скрипте
export const audioCapturePreload = `
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('audioCaptureAPI', {
  getAudioApplications: () => ipcRenderer.invoke('get-audio-applications'),
  startAudioCapture: (pid) => ipcRenderer.invoke('start-audio-capture', pid),
  stopAudioCapture: () => ipcRenderer.invoke('stop-audio-capture'),
  onAudioData: (callback) => {
    ipcRenderer.on('audio-data', (_event, data) => {
      callback(new Float32Array(data));
    });
  },
  onAudioError: (callback) => {
    ipcRenderer.on('audio-capture-error', (_event, error) => {
      callback(new Error(error));
    });
  },
});
`;

// В renderer process (Vue компонент)
export const useAudioCapture = () => {
  const audioContext = ref<AudioContext | null>(null);
  const mediaStream = ref<MediaStream | null>(null);
  const isCapturing = ref(false);

  const getAudioApplications = async (): Promise<AudioApplication[]> => {
    if (window.audioCaptureAPI) {
      return await window.audioCaptureAPI.getAudioApplications();
    }
    return [];
  };

  const startCapture = async (pid: number) => {
    if (!window.audioCaptureAPI) {
      throw new Error('Audio capture API not available');
    }

    // Создать AudioContext для обработки аудио
    audioContext.value = new AudioContext({ sampleRate: 48000 });
    
    // Создать MediaStream для WebRTC
    const destination = audioContext.value.createMediaStreamDestination();
    mediaStream.value = destination.stream;

    // Подписаться на аудио данные из нативного модуля
    window.audioCaptureAPI.onAudioData((audioData: Float32Array) => {
      if (!audioContext.value) return;

      // Конвертировать Float32Array в AudioBuffer
      const buffer = audioContext.value.createBuffer(
        2, // stereo
        audioData.length / 2,
        48000
      );

      // Заполнить каналы
      buffer.copyToChannel(audioData.slice(0, audioData.length / 2), 0);
      buffer.copyToChannel(audioData.slice(audioData.length / 2), 1);

      // Создать источник и подключить к destination
      const source = audioContext.value.createBufferSource();
      source.buffer = buffer;
      source.connect(destination);
      source.start();
    });

    window.audioCaptureAPI.onAudioError((error: Error) => {
      console.error('Audio capture error:', error);
    });

    // Начать захват
    await window.audioCaptureAPI.startAudioCapture(pid);
    isCapturing.value = true;
  };

  const stopCapture = async () => {
    if (window.audioCaptureAPI) {
      await window.audioCaptureAPI.stopAudioCapture();
    }

    if (audioContext.value) {
      await audioContext.value.close();
      audioContext.value = null;
    }

    if (mediaStream.value) {
      mediaStream.value.getTracks().forEach(track => track.stop());
      mediaStream.value = null;
    }

    isCapturing.value = false;
  };

  return {
    getAudioApplications,
    startCapture,
    stopCapture,
    isCapturing,
    mediaStream,
  };
};
