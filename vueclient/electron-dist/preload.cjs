"use strict";

// electron/preload.ts
var import_electron = require("electron");
import_electron.contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,
  useSystemPicker: "true",
  useLegacyMacScreenAudio: "false",
  preferScapCapture: "false",
  preferredTransportMode: "p2p",
  preferredCaptureSource: "screen",
  preferredCaptureResolution: { width: 1920, height: 1080 },
  preferredCaptureFrameRate: 30,
  preferredCaptureAudio: true,
  getServerUrl: () => import_electron.ipcRenderer.invoke("get-server-url"),
  setServerUrl: (url) => import_electron.ipcRenderer.invoke("set-server-url", url),
  getAppVersion: () => import_electron.ipcRenderer.invoke("get-app-version"),
  capturer: {
    getSources: () => import_electron.ipcRenderer.invoke("get-sources"),
    isNativeAvailable: () => import_electron.ipcRenderer.invoke("is-native-available"),
    startAppAudio: (sourceId) => import_electron.ipcRenderer.invoke("start-app-audio", sourceId),
    stopAppAudio: () => import_electron.ipcRenderer.invoke("stop-app-audio"),
    onAudioData: (cb) => {
      const handler = (_event, pcm, sampleRate, channels) => cb(pcm, sampleRate, channels);
      import_electron.ipcRenderer.on("audio-data", handler);
      return () => import_electron.ipcRenderer.removeListener("audio-data", handler);
    },
    onAudioError: (cb) => {
      const handler = (_event, msg) => cb(msg);
      import_electron.ipcRenderer.on("audio-error", handler);
      return () => import_electron.ipcRenderer.removeListener("audio-error", handler);
    }
  }
});
//# sourceMappingURL=preload.cjs.map
