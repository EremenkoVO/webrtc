"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const isDev = process.env.NODE_ENV === 'development' || !electron_1.app.isPackaged;
function createWindow() {
    const iconPath = isDev
        ? path_1.default.join(__dirname, '../public/icon-512.png')
        : path_1.default.join(__dirname, '../dist/icon-512.png');
    const mainWindow = new electron_1.BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        icon: iconPath,
        webPreferences: {
            preload: path_1.default.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
        title: 'WebRTC Client',
    });
    if (isDev) {
        mainWindow.loadURL('http://localhost:5177');
        mainWindow.webContents.openDevTools();
    }
    else {
        mainWindow.loadFile(path_1.default.join(__dirname, '../dist/index.html'));
    }
}
// Allow self-signed / untrusted certificates for the backend server
electron_1.app.on('certificate-error', (event, _webContents, _url, _error, _certificate, callback) => {
    event.preventDefault();
    callback(true);
});
electron_1.app.whenReady().then(() => {
    // ── Desktop sources (screen / window thumbnails) ──────────────────────
    electron_1.ipcMain.handle('getDesktopSources', async () => {
        const sources = await electron_1.desktopCapturer.getSources({
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
    electron_1.ipcMain.handle('getAudioCapabilities', async () => {
        const platform = process.platform;
        const caps = {
            platform,
            // Windows & Linux support chromeMediaSource:'desktop' loopback audio.
            // macOS does NOT – it needs a virtual audio driver.
            supportsDesktopAudioLoopback: platform !== 'darwin',
            requiresVirtualDriver: platform === 'darwin',
            hasMicrophonePermission: true,
        };
        // On macOS, check microphone (audio input) permission
        if (platform === 'darwin') {
            const micStatus = electron_1.systemPreferences.getMediaAccessStatus('microphone');
            caps.hasMicrophonePermission = micStatus === 'granted';
            if (micStatus === 'not-determined') {
                // Trigger the permission prompt so the user can grant it
                try {
                    const granted = await electron_1.systemPreferences.askForMediaAccess('microphone');
                    caps.hasMicrophonePermission = granted;
                }
                catch {
                    caps.hasMicrophonePermission = false;
                }
            }
        }
        return caps;
    });
    createWindow();
});
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        electron_1.app.quit();
    }
});
electron_1.app.on('activate', () => {
    if (electron_1.BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
