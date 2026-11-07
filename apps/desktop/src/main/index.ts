import { app, BrowserWindow, session } from "electron";
import { join } from "node:path";
import { registerPresetLibraryIpc } from "./preset-library-ipc.js";

// Keep backups where earlier builds and the README put them (the package name would otherwise be used).
app.setPath("userData", join(app.getPath("appData"), "voice-live-touch-editor"));

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 960,
    height: 720,
    minWidth: 720,
    minHeight: 500,
    title: "Voice Live Touch Editor",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  // Web MIDI + SysEx must be granted explicitly outside the dev server.
  const allowed = new Set(["midi", "midiSysex"]);
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) =>
    cb(allowed.has(permission))
  );
  session.defaultSession.setPermissionCheckHandler((_wc, permission) =>
    allowed.has(permission)
  );
  registerPresetLibraryIpc();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
