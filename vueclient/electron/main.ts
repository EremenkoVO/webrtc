import { app, BrowserWindow, ipcMain, desktopCapturer, session } from 'electron'
import * as path from 'path'
import * as fs from 'fs'

// ── Settings persistence ───────────────────────────────────────────────────────

const settingsPath = path.join(app.getPath('userData'), 'settings.json')

interface Settings {
  serverUrl: string
}

function readSettings(): Settings {
  try {
    if (fs.existsSync(settingsPath)) {
      return JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as Settings
    }
  } catch {
    // ignore corrupt settings
  }
  return { serverUrl: '' }
}

function writeSettings(settings: Settings): void {
  try {
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true })
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
  } catch (err) {
    console.error('[main] Failed to write settings:', err)
  }
}

let currentSettings = readSettings()

// ── Certificate bypass for self-signed certs ──────────────────────────────────

function getTrustedHostFromSettings(): string | null {
  const serverUrl = currentSettings.serverUrl?.trim()
  if (!serverUrl) return null
  try {
    return new URL(serverUrl).host.toLowerCase()
  } catch {
    return null
  }
}

function isTrustedServerRequest(urlOrHost: string): boolean {
  const trustedHost = getTrustedHostFromSettings()
  if (!trustedHost) return false

  const normalizedInput = urlOrHost.toLowerCase()
  if (!normalizedInput.includes('://')) {
    return normalizedInput === trustedHost
  }

  try {
    return new URL(urlOrHost).host.toLowerCase() === trustedHost
  } catch {
    return false
  }
}

// Trust certificate errors for requests to the configured custom server.
// This supports both HTTPS and WSS connections with self-signed certs.
app.on('certificate-error', (event, _webContents, url, _error, _certificate, callback) => {
  if (isTrustedServerRequest(url)) {
    event.preventDefault()
    callback(true)
  } else {
    callback(false)
  }
})

// ── Window creation ────────────────────────────────────────────────────────────

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged
const useSystemPicker = process.env.USE_SYSTEM_PICKER !== 'false'
const useLegacyMacScreenAudio = process.env.USE_LEGACY_MAC_SCREEN_AUDIO === 'true'

if (process.platform === 'darwin' && useLegacyMacScreenAudio) {
  // Force legacy Screen & System Audio Recording path instead of CoreAudio Tap.
  // See Electron desktopCapturer caveats for macOS 14.2+.
  app.commandLine.appendSwitch('disable-features', 'MacCatapLoopbackAudioForScreenShare')
}

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'default',
    backgroundColor: '#1e1f22',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // Grant screen-capture permissions automatically in Electron
  mainWindow.webContents.session.setPermissionRequestHandler(
    (_webContents, permission, callback) => {
      const allowed = ['media', 'display-capture', 'microphone', 'camera']
      callback(allowed.includes(permission))
    },
  )

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  // Certificate verification hook for Chromium network stack.
  // Needed for some TLS failures that do not emit app-level certificate-error.
  session.defaultSession.setCertificateVerifyProc((request, callback) => {
    if (isTrustedServerRequest(request.hostname)) {
      callback(0)
      return
    }
    callback(-3)
  })

  if (useSystemPicker) {
    // Optional system picker flow (experimental in Electron).
    // When system picker is available, this callback may be bypassed by Chromium.
    session.defaultSession.setDisplayMediaRequestHandler(
      async (_request, callback) => {
        try {
          const sources = await desktopCapturer.getSources({ types: ['screen'] })
          const source = sources[0]
          if (!source) {
            callback({})
            return
          }
          callback(
            process.platform === 'darwin'
              ? { video: source }
              : { video: source, audio: 'loopback' },
          )
        } catch {
          callback({})
        }
      },
      { useSystemPicker: true },
    )
  }

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ── IPC: Server URL ────────────────────────────────────────────────────────────

ipcMain.handle('get-server-url', () => {
  return currentSettings.serverUrl
})

ipcMain.handle('set-server-url', (_event, url: string) => {
  currentSettings.serverUrl = url
  writeSettings(currentSettings)
})

// ── IPC: App info ──────────────────────────────────────────────────────────────

ipcMain.handle('get-app-version', () => {
  return app.getVersion()
})

// ── IPC: Screen capture sources ───────────────────────────────────────────────

ipcMain.handle('get-sources', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 320, height: 180 },
    fetchWindowIcons: true,
  })

  return sources.map((src) => ({
    id: src.id,
    name: src.name,
    thumbnail: src.thumbnail.toDataURL(),
    appIcon: src.appIcon ? src.appIcon.toDataURL() : null,
    display_id: src.display_id,
    type: src.id.startsWith('screen:') ? 'screen' : 'window',
  }))
})

// ── IPC: Native audio capture (macOS SCK) ────────────────────────────────────
// Returns false for now; the renderer falls back to desktop loopback audio.

ipcMain.handle('is-native-available', () => false)

ipcMain.handle('start-app-audio', () => false)

ipcMain.handle('stop-app-audio', () => undefined)
