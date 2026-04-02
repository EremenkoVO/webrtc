"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// electron/main.ts
var import_electron = require("electron");
var path = __toESM(require("path"), 1);
var fs = __toESM(require("fs"), 1);
var settingsPath = path.join(import_electron.app.getPath("userData"), "settings.json");
function readSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      return JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    }
  } catch {
  }
  return { serverUrl: "" };
}
function writeSettings(settings) {
  try {
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf-8");
  } catch (err) {
    console.error("[main] Failed to write settings:", err);
  }
}
var currentSettings = readSettings();
import_electron.app.setName("WebRTC Voice");
function resolveAppAssetPath(assetPath) {
  const normalized = assetPath.startsWith("/") ? assetPath.slice(1) : assetPath;
  if (import_electron.app.isPackaged) {
    return path.join(process.resourcesPath, "app.asar", "dist", normalized);
  }
  return path.join(import_electron.app.getAppPath(), "public", normalized);
}
function getTrustedHostFromSettings() {
  const serverUrl = currentSettings.serverUrl?.trim();
  if (!serverUrl) return null;
  try {
    return new URL(serverUrl).host.toLowerCase();
  } catch {
    return null;
  }
}
function isTrustedServerRequest(urlOrHost) {
  const trustedHost = getTrustedHostFromSettings();
  if (!trustedHost) return false;
  const normalizedInput = urlOrHost.toLowerCase();
  if (!normalizedInput.includes("://")) {
    return normalizedInput === trustedHost;
  }
  try {
    return new URL(urlOrHost).host.toLowerCase() === trustedHost;
  } catch {
    return false;
  }
}
import_electron.app.on("certificate-error", (event, _webContents, url, _error, _certificate, callback) => {
  if (isTrustedServerRequest(url)) {
    event.preventDefault();
    callback(true);
  } else {
    callback(false);
  }
});
var isDev = process.env.NODE_ENV === "development" || !import_electron.app.isPackaged;
var useSystemPicker = process.env.USE_SYSTEM_PICKER !== "false";
var shouldUseSystemPicker = useSystemPicker && process.platform === "darwin";
var useLegacyMacScreenAudio = process.env.USE_LEGACY_MAC_SCREEN_AUDIO === "true";
if (process.platform === "darwin" && useLegacyMacScreenAudio) {
  import_electron.app.commandLine.appendSwitch("disable-features", "MacCatapLoopbackAudioForScreenShare");
}
var mainWindow = null;
function createWindow() {
  const appIconPath = resolveAppAssetPath("/icon-512.png");
  mainWindow = new import_electron.BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: "WebRTC Voice",
    icon: fs.existsSync(appIconPath) ? appIconPath : void 0,
    titleBarStyle: "default",
    backgroundColor: "#1e1f22",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      devTools: isDev,
      preload: path.join(__dirname, "preload.cjs")
    }
  });
  if (!isDev) {
    mainWindow.setMenuBarVisibility(false);
    mainWindow.removeMenu();
  }
  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
    mainWindow.webContents.on("before-input-event", (event, input) => {
      const isF12 = input.key === "F12";
      const isCtrlShiftI = input.key.toLowerCase() === "i" && input.control && input.shift;
      const isMetaAltI = input.key.toLowerCase() === "i" && input.meta && input.alt;
      if (isF12 || isCtrlShiftI || isMetaAltI) {
        event.preventDefault();
      }
    });
  }
  mainWindow.webContents.session.setPermissionRequestHandler(
    (_webContents, permission, callback) => {
      const allowed = ["media", "display-capture", "microphone", "camera"];
      callback(allowed.includes(permission));
    }
  );
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}
import_electron.app.whenReady().then(() => {
  if (process.platform === "darwin") {
    import_electron.app.setActivationPolicy("accessory");
    import_electron.Menu.setApplicationMenu(null);
  }
  import_electron.session.defaultSession.setCertificateVerifyProc((request, callback) => {
    if (isTrustedServerRequest(request.hostname)) {
      callback(0);
      return;
    }
    callback(-3);
  });
  if (shouldUseSystemPicker) {
    import_electron.session.defaultSession.setDisplayMediaRequestHandler(
      async (_request, callback) => {
        try {
          const sources = await import_electron.desktopCapturer.getSources({ types: ["screen"] });
          const source = sources[0];
          if (!source) {
            callback({});
            return;
          }
          callback(
            process.platform === "darwin" ? { video: source } : { video: source, audio: "loopback" }
          );
        } catch {
          callback({});
        }
      },
      { useSystemPicker: true }
    );
  }
  createWindow();
  import_electron.app.on("activate", () => {
    if (import_electron.BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
import_electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") import_electron.app.quit();
});
import_electron.ipcMain.handle("get-server-url", () => {
  return currentSettings.serverUrl;
});
import_electron.ipcMain.handle("set-server-url", (_event, url) => {
  currentSettings.serverUrl = url;
  writeSettings(currentSettings);
});
import_electron.ipcMain.handle("get-app-version", () => {
  return import_electron.app.getVersion();
});
import_electron.ipcMain.handle("get-sources", async () => {
  const sources = await import_electron.desktopCapturer.getSources({
    types: ["screen", "window"],
    thumbnailSize: { width: 320, height: 180 },
    fetchWindowIcons: true
  });
  return sources.map((src) => ({
    id: src.id,
    name: src.name,
    thumbnail: src.thumbnail.toDataURL(),
    appIcon: src.appIcon ? src.appIcon.toDataURL() : null,
    display_id: src.display_id,
    type: src.id.startsWith("screen:") ? "screen" : "window"
  }));
});
import_electron.ipcMain.handle("is-native-available", () => false);
import_electron.ipcMain.handle("start-app-audio", () => false);
import_electron.ipcMain.handle("stop-app-audio", () => void 0);
import_electron.ipcMain.handle(
  "notifications:show",
  (_event, payload) => {
    try {
      if (!import_electron.Notification.isSupported()) return false;
      const resolvedIcon = payload.icon ? resolveAppAssetPath(payload.icon) : resolveAppAssetPath("/icon-192.png");
      const notification = new import_electron.Notification({
        title: payload.title,
        body: payload.body,
        icon: fs.existsSync(resolvedIcon) ? resolvedIcon : void 0,
        silent: payload.silent ?? false
      });
      notification.on("click", () => {
        if (mainWindow) {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();
          if (payload.tag) {
            mainWindow.webContents.send("notifications:click", payload.tag);
          }
        }
      });
      notification.show();
      return true;
    } catch (error) {
      console.error("[main] Failed to show notification:", error);
      return false;
    }
  }
);
//# sourceMappingURL=main.cjs.map
