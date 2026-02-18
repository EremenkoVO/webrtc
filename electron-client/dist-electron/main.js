"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
// Импорт нативного модуля захвата аудио
let AudioCapture = null;
try {
    console.log('[Main] Loading native audio capture module...');
    const audioCaptureModule = require('../native-audio-capture');
    console.log('[Main] Module loaded, type:', typeof audioCaptureModule, 'value:', audioCaptureModule);
    if (audioCaptureModule) {
        // napi-rs экспортирует классы напрямую
        AudioCapture = audioCaptureModule.AudioCapture || audioCaptureModule;
        console.log('[Main] ✓ Native audio capture module loaded successfully');
        console.log('[Main] AudioCapture type:', typeof AudioCapture, 'is constructor:', typeof AudioCapture === 'function');
    }
    else {
        console.warn('[Main] ⚠ Native audio capture module returned null');
    }
}
catch (error) {
    console.error('[Main] ⚠ Native audio capture module not available:', error.message);
    console.error('[Main] Error stack:', error.stack);
}
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
        autoHideMenuBar: true, // Hide menu bar (toolbar)
        webPreferences: {
            preload: path_1.default.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: false, // Allow cross-origin requests (desktop app — no web exposure)
        },
        title: 'WebRTC Client',
    });
    if (isDev) {
        mainWindow.loadURL('http://localhost:5177');
        // Open DevTools in a separate window
        mainWindow.webContents.openDevTools({ mode: 'detach' });
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
    // ── Audio capture from applications (native module) ──────────────────────
    let audioCapture = null;
    let audioCapturePolling = false;
    // Polling loop — shared by the IPC handler and the macOS screen-share path.
    const startAudioPoll = () => {
        const poll = async () => {
            if (!audioCapturePolling || !audioCapture)
                return;
            try {
                const audioData = await audioCapture.getAllAudioData();
                if (audioData && audioData.length > 0) {
                    const win = electron_1.BrowserWindow.getAllWindows()[0];
                    if (win && !win.isDestroyed()) {
                        if (Math.random() < 0.01) {
                            console.log(`[AudioCapture] Sending ${audioData.length} samples`);
                        }
                        win.webContents.send('audio-data', audioData);
                    }
                }
                if (audioCapturePolling)
                    setTimeout(poll, 10);
            }
            catch (error) {
                console.error('[AudioCapture] Poll error:', error);
                const win = electron_1.BrowserWindow.getAllWindows()[0];
                if (win && !win.isDestroyed())
                    win.webContents.send('audio-capture-error', error.message);
                audioCapturePolling = false;
            }
        };
        setTimeout(poll, 10);
    };
    // Регистрируем handlers всегда, даже если модуль не загружен
    electron_1.ipcMain.handle('get-audio-applications', async () => {
        try {
            if (!audioCapture) {
                console.log('[AudioCapture] Module not available');
                return [];
            }
            const apps = await audioCapture.getAudioApplications();
            console.log('[AudioCapture] Got applications:', apps.length, apps);
            // Убеждаемся, что все PID являются числами
            return apps.map((app) => ({
                pid: Number(app.pid),
                name: app.name,
                icon: app.icon || undefined,
            }));
        }
        catch (error) {
            console.error('Failed to get audio applications:', error);
            return [];
        }
    });
    electron_1.ipcMain.handle('start-audio-capture', async (_event, pid) => {
        try {
            console.log('[AudioCapture] start-audio-capture called with PID:', pid, 'type:', typeof pid);
            if (!audioCapture) {
                return { success: false, error: 'Audio capture not initialized' };
            }
            // Убеждаемся, что PID является числом (0 = system loopback, разрешён)
            const pidNum = Number(pid);
            if (isNaN(pidNum) || pidNum < 0) {
                console.error('[AudioCapture] Invalid PID:', pid);
                return { success: false, error: `Invalid PID: ${pid}` };
            }
            // Остановить предыдущий опрос, если есть
            audioCapturePolling = false;
            console.log('[AudioCapture] Starting capture for PID:', pidNum);
            await audioCapture.startCapture(pidNum);
            audioCapturePolling = true;
            startAudioPoll();
            return { success: true };
        }
        catch (error) {
            console.error('Failed to start audio capture:', error);
            audioCapturePolling = false;
            return { success: false, error: error.message };
        }
    });
    electron_1.ipcMain.handle('stop-audio-capture', async () => {
        try {
            audioCapturePolling = false;
            if (!audioCapture) {
                return { success: false, error: 'Audio capture not initialized' };
            }
            await audioCapture.stopCapture();
            return { success: true };
        }
        catch (error) {
            console.error('Failed to stop audio capture:', error);
            return { success: false, error: error.message };
        }
    });
    if (AudioCapture) {
        try {
            console.log('[Main] Creating AudioCapture instance...');
            console.log('[Main] AudioCapture type:', typeof AudioCapture);
            console.log('[Main] AudioCapture is function:', typeof AudioCapture === 'function');
            audioCapture = new AudioCapture();
            console.log('[Main] ✓ Audio capture instance created successfully');
            console.log('[Main] audioCapture type:', typeof audioCapture);
            console.log('[Main] audioCapture has getAudioApplications:', typeof audioCapture?.getAudioApplications === 'function');
        }
        catch (error) {
            console.error('[Main] ⚠ Failed to initialize native audio capture module:', error);
            console.error('[Main] Error details:', {
                message: error.message,
                stack: error.stack,
                name: error.name,
            });
            // Продолжаем работу без нативного модуля
        }
    }
    else {
        console.warn('[Main] ⚠ Native audio capture module not available. Install and build the module first.');
        console.warn('[Main] AudioCapture value:', AudioCapture);
    }
    // ── Set up display media request handler for getDisplayMedia() ─────────
    // Use system picker to let user choose which screen/window to share
    electron_1.session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
        console.log('[ScreenShare] Display media request received:', {
            videoRequested: request.videoRequested,
            audioRequested: request.audioRequested,
            platform: process.platform,
        });
        let callbackCalled = false;
        const safeCallback = (result) => {
            if (!callbackCalled) {
                callbackCalled = true;
                console.log('[ScreenShare] Calling Electron callback with:', {
                    hasVideo: !!result.video,
                    videoId: result.video?.id,
                    audio: result.audio,
                });
                try {
                    // If video was requested but not provided, Electron will throw an error
                    // This is expected behavior - the error will be caught by getDisplayMedia() in renderer
                    callback(result);
                }
                catch (error) {
                    console.error('[ScreenShare] Error in callback:', error);
                    // The error will propagate to getDisplayMedia() promise rejection
                    throw error;
                }
            }
            else {
                console.warn('[ScreenShare] Attempted to call callback twice');
            }
        };
        try {
            if (!request.videoRequested) {
                safeCallback({});
                return;
            }
            // Get all available sources
            console.log('[ScreenShare] Getting desktop sources...');
            const sources = await electron_1.desktopCapturer.getSources({
                types: ['screen', 'window'],
                thumbnailSize: { width: 320, height: 200 },
            });
            console.log('[ScreenShare] Found', sources.length, 'sources');
            // Filter sources based on request
            const filteredSources = sources.filter((source) => {
                // Check if videoRequested is an object with displaySurface property
                const videoRequest = request.videoRequested;
                if (videoRequest &&
                    typeof videoRequest === 'object' &&
                    'displaySurface' in videoRequest) {
                    const displaySurface = videoRequest.displaySurface;
                    // If requesting window, filter to windows only
                    if (displaySurface === 'window') {
                        return source.display_id === undefined;
                    }
                    // If requesting monitor, filter to screens only
                    if (displaySurface === 'monitor') {
                        return source.display_id !== undefined;
                    }
                }
                return true;
            });
            console.log('[ScreenShare] Filtered to', filteredSources.length, 'sources');
            if (filteredSources.length === 0) {
                console.log('[ScreenShare] No sources available, cancelling');
                safeCallback({});
                return;
            }
            // If only one source, use it directly
            if (filteredSources.length === 1) {
                console.log('[ScreenShare] Single source found, using directly:', filteredSources[0].name);
                const result = {
                    video: filteredSources[0],
                };
                if (request.audioRequested && process.platform !== 'darwin') {
                    result.audio = 'loopback';
                }
                safeCallback(result);
                return;
            }
            // Multiple sources - show selection dialog
            console.log('[ScreenShare] Multiple sources, showing selection dialog');
            const mainWindow = electron_1.BrowserWindow.getAllWindows()[0];
            if (!mainWindow) {
                console.error('[ScreenShare] Main window not found');
                safeCallback({});
                return;
            }
            // Store original sources for lookup
            const sourcesMap = new Map(filteredSources.map((s) => [s.id, s]));
            // Create unique handler ID for this request
            const handlerId = `select-screen-source-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            console.log('[ScreenShare] Handler ID:', handlerId);
            // Create selection dialog window
            console.log('[ScreenShare] Creating selection dialog window');
            const preloadPath = path_1.default.join(__dirname, 'preload.js');
            console.log('[ScreenShare] Preload path:', preloadPath);
            const selectionWindow = new electron_1.BrowserWindow({
                width: 800,
                height: 600,
                parent: mainWindow,
                modal: true,
                resizable: true,
                minimizable: false,
                maximizable: false,
                autoHideMenuBar: true,
                show: false, // Don't show until ready
                webPreferences: {
                    preload: preloadPath,
                    nodeIntegration: false,
                    contextIsolation: true,
                },
                title: 'Select source to share',
            });
            selectionWindow.once('ready-to-show', () => {
                console.log('[ScreenShare] Selection dialog ready to show');
                selectionWindow.show();
            });
            selectionWindow.once('show', () => {
                console.log('[ScreenShare] Selection dialog shown');
            });
            selectionWindow.webContents.once('did-finish-load', () => {
                console.log('[ScreenShare] Selection dialog finished loading');
            });
            // Handle source selection via IPC
            const handleSourceSelection = (_event, sourceId, includeAudio) => {
                console.log('[ScreenShare] ⚡ IPC handler triggered!', { sourceId, includeAudio, callbackCalled });
                if (callbackCalled) {
                    console.warn('[ScreenShare] Callback already called, ignoring selection');
                    return;
                }
                sourceSelectionInProgress = true;
                if (!sourceId) {
                    console.log('[ScreenShare] No source selected (cancel), cancelling');
                    sourceSelectionInProgress = false;
                    selectionWindow.close();
                    // Cancel - call callback with empty object (will cause rejection)
                    safeCallback({});
                    return;
                }
                const selectedSource = sourcesMap.get(sourceId);
                if (!selectedSource) {
                    console.error('[ScreenShare] Selected source not found:', sourceId);
                    sourceSelectionInProgress = false;
                    selectionWindow.close();
                    safeCallback({});
                    return;
                }
                const result = {
                    video: selectedSource,
                };
                // Windows / Linux: use Electron's built-in loopback.
                // macOS: loopback would capture the mic too; native module handles audio instead.
                if (includeAudio && process.platform !== 'darwin') {
                    result.audio = 'loopback';
                }
                console.log('[ScreenShare] ✓ Source selected, calling callback with result:', {
                    hasVideo: !!result.video,
                    videoId: result.video?.id,
                    videoName: result.video?.name,
                    audio: result.audio,
                });
                // Close window first, then call callback
                console.log('[ScreenShare] Closing selection window');
                selectionWindow.close();
                // Use setTimeout to ensure window closes before callback
                setTimeout(() => {
                    console.log('[ScreenShare] Calling safeCallback with selected source');
                    sourceSelectionInProgress = false;
                    safeCallback(result);
                    // macOS: Electron loopback isn't available; start native system-audio capture.
                    if (includeAudio && process.platform === 'darwin' && audioCapture) {
                        (async () => {
                            try {
                                audioCapturePolling = false;
                                console.log('[ScreenShare] macOS: starting native system-audio capture (pid=0)');
                                await audioCapture.startCapture(0);
                                audioCapturePolling = true;
                                startAudioPoll();
                                console.log('[ScreenShare] macOS: native audio capture started');
                            }
                            catch (err) {
                                console.warn('[ScreenShare] macOS native audio capture failed:', err);
                            }
                        })();
                    }
                }, 100);
            };
            console.log('[ScreenShare] Registering IPC handler for:', handlerId);
            // Register handler BEFORE loading the page
            // When using ipcMain.on(channel, handler), the channel is already matched by Electron
            // So we don't need to check event.channel - it will only fire for this specific channel
            const handler = (event, sourceId, includeAudio) => {
                console.log('[ScreenShare] ⚡ IPC handler triggered!', {
                    handlerId,
                    sourceId,
                    includeAudio,
                    senderId: event.sender.id
                });
                // Remove handler after first use (like 'once' but more reliable)
                electron_1.ipcMain.removeListener(handlerId, handler);
                handleSourceSelection(event, sourceId, includeAudio);
            };
            electron_1.ipcMain.on(handlerId, handler);
            console.log('[ScreenShare] ✓ IPC handler registered, listening for:', handlerId);
            // Listen for IPC messages to debug
            selectionWindow.webContents.on('ipc-message', (event, channel, ...args) => {
                console.log('[ScreenShare] IPC message in webContents:', channel, args);
            });
            // Also listen for errors
            selectionWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
                console.error('[ScreenShare] Window failed to load:', errorCode, errorDescription);
            });
            selectionWindow.webContents.on('console-message', (event, level, message) => {
                console.log(`[ScreenShare Dialog Console] ${message}`);
            });
            // Prepare sources data for the dialog
            const sourcesData = filteredSources.map((s) => ({
                id: s.id,
                name: s.name,
                thumbnailURL: s.thumbnail.toDataURL(),
                display_id: s.display_id,
                appIconURL: s.appIcon?.toDataURL(),
                isScreen: s.display_id !== undefined,
            }));
            // Create HTML for selection dialog
            const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Select source to share</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #1e1f22;
      color: #dbdee1;
      padding: 24px;
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }
    h2 {
      margin-bottom: 20px;
      color: #f2f3f5;
      font-size: 20px;
      font-weight: 600;
    }
    .sources-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 16px;
      flex: 1;
      overflow-y: auto;
      padding-right: 8px;
      margin-bottom: 20px;
    }
    .sources-grid::-webkit-scrollbar {
      width: 8px;
    }
    .sources-grid::-webkit-scrollbar-track {
      background: #2b2d31;
      border-radius: 4px;
    }
    .sources-grid::-webkit-scrollbar-thumb {
      background: #4f545c;
      border-radius: 4px;
    }
    .sources-grid::-webkit-scrollbar-thumb:hover {
      background: #5d6269;
    }
    .source-item {
      cursor: pointer;
      border: 2px solid #3f4147;
      border-radius: 12px;
      padding: 12px;
      text-align: center;
      transition: all 0.2s ease;
      background: #2b2d31;
      display: flex;
      flex-direction: column;
      align-items: center;
      position: relative;
    }
    .source-item:hover {
      border-color: #5865f2;
      background: #313338;
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(88, 101, 242, 0.2);
    }
    .source-item.selected {
      border-color: #5865f2;
      background: linear-gradient(135deg, #5865f2 0%, #4752c4 100%);
      box-shadow: 0 4px 16px rgba(88, 101, 242, 0.4);
    }
    .source-item.selected::before {
      content: '✓';
      position: absolute;
      top: 8px;
      right: 8px;
      width: 24px;
      height: 24px;
      background: rgba(255, 255, 255, 0.2);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      font-weight: bold;
      color: white;
    }
    .source-thumbnail {
      width: 100%;
      height: 120px;
      object-fit: contain;
      border-radius: 8px;
      margin-bottom: 10px;
      background: #1e1f22;
      border: 1px solid #3f4147;
    }
    .source-name {
      font-size: 13px;
      color: #dbdee1;
      word-break: break-word;
      line-height: 1.4;
      font-weight: 500;
    }
    .source-item.selected .source-name {
      color: #fff;
      font-weight: 600;
    }
    .buttons {
      display: flex;
      gap: 12px;
      justify-content: flex-end;
      padding-top: 16px;
      border-top: 1px solid #3f4147;
    }
    button {
      padding: 10px 24px;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      transition: all 0.2s ease;
      min-width: 100px;
    }
    .btn-primary {
      background: #5865f2;
      color: white;
    }
    .btn-primary:hover:not(:disabled) {
      background: #4752c4;
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(88, 101, 242, 0.3);
    }
    .btn-primary:active:not(:disabled) {
      transform: translateY(0);
    }
    .btn-secondary {
      background: #4f545c;
      color: white;
    }
    .btn-secondary:hover {
      background: #5d6269;
      transform: translateY(-1px);
    }
    .btn-secondary:active {
      transform: translateY(0);
    }
    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none !important;
    }
  </style>
</head>
<body>
  <h2>Select source to share</h2>
  <div class="sources-grid" id="sourcesGrid"></div>
  <div class="buttons">
    <button class="btn-secondary" id="cancelBtn">Cancel</button>
    <button class="btn-primary" id="shareBtn" disabled>Share</button>
  </div>
  <script>
    const sources = ${JSON.stringify(sourcesData)};
    const audioRequested = ${request.audioRequested ? 'true' : 'false'};
    const platform = '${process.platform}';
    const handlerId = '${handlerId}';
    console.log('[ScreenShare Dialog] Handler ID from main:', handlerId);
    let selectedSourceId = null;

    const grid = document.getElementById('sourcesGrid');
    const shareBtn = document.getElementById('shareBtn');
    const cancelBtn = document.getElementById('cancelBtn');

    sources.forEach(source => {
      const item = document.createElement('div');
      item.className = 'source-item';
      item.dataset.id = source.id;
      item.innerHTML = \`
        <img src="\${source.thumbnailURL}" alt="\${source.name}" class="source-thumbnail" />
        <div class="source-name">\${source.name}</div>
      \`;
      item.addEventListener('click', () => {
        console.log('[ScreenShare Dialog] Source item clicked:', source.id, source.name);
        document.querySelectorAll('.source-item').forEach(el => el.classList.remove('selected'));
        item.classList.add('selected');
        selectedSourceId = source.id;
        shareBtn.disabled = false;
        sourceSelected = true;
        console.log('[ScreenShare Dialog] Source selected, shareBtn enabled');
      });
      grid.appendChild(item);
    });
    
    console.log('[ScreenShare Dialog] Sources rendered:', sources.length);

    shareBtn.addEventListener('click', () => {
      console.log('[ScreenShare Dialog] Share button clicked, selectedSourceId:', selectedSourceId);
      console.log('[ScreenShare Dialog] window.electronAPI:', typeof window.electronAPI);
      console.log('[ScreenShare Dialog] window.electronAPI.selectSource:', typeof window.electronAPI?.selectSource);
      
      if (selectedSourceId) {
        sourceSelected = true;
        // Передаем audioRequested напрямую, без фильтрации по платформе
        // Логика установки audio в callback обрабатывается в handleSourceSelection
        const includeAudio = audioRequested;
        console.log('[ScreenShare Dialog] Calling selectSource with:', {
          handlerId,
          selectedSourceId,
          includeAudio,
          audioRequested,
          platform,
        });
        try {
          if (window.electronAPI?.selectSource) {
            window.electronAPI.selectSource(handlerId, selectedSourceId, includeAudio);
            console.log('[ScreenShare Dialog] selectSource called successfully');
          } else {
            console.error('[ScreenShare Dialog] selectSource is not available');
          }
        } catch (error) {
          console.error('[ScreenShare Dialog] Error calling selectSource:', error);
        }
      } else {
        console.warn('[ScreenShare Dialog] Share button clicked but no source selected');
      }
    });

    cancelBtn.addEventListener('click', () => {
      console.log('[ScreenShare Dialog] Cancel button clicked');
      try {
        if (window.electronAPI?.selectSource) {
          window.electronAPI.selectSource(handlerId, null, false);
          console.log('[ScreenShare Dialog] Cancel selectSource called');
        } else {
          console.error('[ScreenShare Dialog] selectSource is not available for cancel');
        }
      } catch (error) {
        console.error('[ScreenShare Dialog] Error calling cancel selectSource:', error);
      }
    });
    
    // Log when electronAPI is available
    if (window.electronAPI) {
      console.log('[ScreenShare Dialog] electronAPI is available');
      console.log('[ScreenShare Dialog] selectSource function:', typeof window.electronAPI.selectSource);
    } else {
      console.error('[ScreenShare Dialog] electronAPI is NOT available!');
    }
    
    // Add click listeners with logging
    console.log('[ScreenShare Dialog] Setting up button listeners');
    console.log('[ScreenShare Dialog] shareBtn:', shareBtn);
    console.log('[ScreenShare Dialog] cancelBtn:', cancelBtn);
    
    // Track if source was selected
    let sourceSelected = false;
    
    // Also prevent window close without selection
    window.addEventListener('beforeunload', (e) => {
      if (!sourceSelected) {
        console.log('[ScreenShare Dialog] Window closing without selection');
      }
    });
  </script>
</body>
</html>`;
            selectionWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
            // Track if window was closed by user (not programmatically)
            let windowClosedByUser = false;
            let sourceSelectionInProgress = false;
            selectionWindow.on('close', (event) => {
                if (!callbackCalled && !sourceSelectionInProgress) {
                    console.log('[ScreenShare] Window close event triggered, callbackCalled:', callbackCalled);
                    windowClosedByUser = true;
                    // Don't prevent close, but we'll handle it in 'closed' event
                }
            });
            selectionWindow.once('closed', () => {
                console.log('[ScreenShare] Selection dialog closed, callbackCalled:', callbackCalled, 'closedByUser:', windowClosedByUser, 'sourceSelectionInProgress:', sourceSelectionInProgress);
                // Remove handler after a delay to allow IPC event to arrive
                setTimeout(() => {
                    electron_1.ipcMain.removeAllListeners(handlerId);
                    console.log('[ScreenShare] IPC handler removed for:', handlerId);
                }, 500);
                // Don't call callback if it was already called (source was selected)
                // If callback wasn't called, it means user closed dialog without selecting
                // Wait a bit to see if IPC event arrives (it might be delayed)
                if (!callbackCalled && !sourceSelectionInProgress) {
                    console.log('[ScreenShare] Dialog closed without selection, will reject request after delay');
                    // Give IPC event a chance to arrive (it might be delayed)
                    setTimeout(() => {
                        if (!callbackCalled) {
                            console.log('[ScreenShare] No selection received after delay, rejecting request');
                            // Call callback with empty object - Electron will throw an error
                            // This error will be caught by getDisplayMedia() promise rejection in renderer
                            try {
                                safeCallback({});
                            }
                            catch (error) {
                                console.error('[ScreenShare] Error calling callback after close:', error);
                                // Error is expected - it will be caught by getDisplayMedia() promise
                            }
                        }
                        else {
                            console.log('[ScreenShare] Selection received during delay, callback already called');
                        }
                    }, 300);
                }
            });
            // Log when window is about to close
            selectionWindow.on('close', (event) => {
                console.log('[ScreenShare] Selection dialog close event, callbackCalled:', callbackCalled);
                // Prevent default close if callback already called
                if (callbackCalled) {
                    console.log('[ScreenShare] Callback already called, allowing close');
                }
            });
        }
        catch (error) {
            console.error('Display media request failed:', error);
            safeCallback({});
        }
    }, { useSystemPicker: false });
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
