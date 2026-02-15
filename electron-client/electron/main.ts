import {
  app,
  BrowserWindow,
  desktopCapturer,
  ipcMain,
  systemPreferences,
} from 'electron';
import path from 'path';

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

function createWindow() {
  const iconPath = isDev
    ? path.join(__dirname, '../public/icon-512.png')
    : path.join(__dirname, '../dist/icon-512.png');

  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false, // Allow cross-origin requests (desktop app — no web exposure)
    },
    title: 'WebRTC Client',
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5177');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

// Allow self-signed / untrusted certificates for the backend server
app.on('certificate-error', (event, _webContents, _url, _error, _certificate, callback) => {
  event.preventDefault();
  callback(true);
});

app.whenReady().then(() => {
  // ── Desktop sources (screen / window thumbnails) ──────────────────────
  ipcMain.handle('getDesktopSources', async () => {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 320, height: 200 },
    });
    return sources.map((s) => ({
      id: s.id,
      name: s.name,
      thumbnailURL: s.thumbnail.toDataURL(),
      display_id: s.display_id,
      appIconURL: s.appIcon?.toDataURL(),
    }));
  });

  // ── Audio capabilities for the current platform ───────────────────────
  ipcMain.handle('getAudioCapabilities', async () => {
    const platform = process.platform as 'darwin' | 'win32' | 'linux';
    const caps: {
      platform: string;
      supportsDesktopAudioLoopback: boolean;
      requiresVirtualDriver: boolean;
      hasMicrophonePermission: boolean;
    } = {
      platform,
      // Windows & Linux support chromeMediaSource:'desktop' loopback audio.
      // macOS does NOT – it needs a virtual audio driver.
      supportsDesktopAudioLoopback: platform !== 'darwin',
      requiresVirtualDriver: platform === 'darwin',
      hasMicrophonePermission: true,
    };

    // On macOS, check microphone (audio input) permission
    if (platform === 'darwin') {
      const micStatus = systemPreferences.getMediaAccessStatus('microphone');
      caps.hasMicrophonePermission = micStatus === 'granted';
      if (micStatus === 'not-determined') {
        // Trigger the permission prompt so the user can grant it
        try {
          const granted =
            await systemPreferences.askForMediaAccess('microphone');
          caps.hasMicrophonePermission = granted;
        } catch {
          caps.hasMicrophonePermission = false;
        }
      }
    }

    return caps;
  });

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
