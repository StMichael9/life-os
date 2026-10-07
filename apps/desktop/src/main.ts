import { app, BrowserWindow, dialog, session } from 'electron';
import { allowedNavigation, trustedOrigin } from './security';

declare const __LIFE_OS_WEB_URL__: string;
let window: BrowserWindow | null = null;
let origin: string;

async function createWindow() {
  // Memory-only in Phase 0. Persistent credentials require the Phase 1 main-process
  // safeStorage implementation; never silently fall back to renderer storage.
  const isolatedSession = session.fromPartition('life-os-foundation');
  isolatedSession.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false),
  );
  isolatedSession.setPermissionCheckHandler(() => false);
  window = new BrowserWindow({
    width: 1380,
    height: 940,
    minWidth: 390,
    minHeight: 650,
    title: 'Life OS',
    backgroundColor: '#101210',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      session: isolatedSession,
      devTools: !app.isPackaged,
    },
  });
  const current = window;
  current.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  current.webContents.on('will-navigate', (event, url) => {
    if (!allowedNavigation(url, origin)) event.preventDefault();
  });
  current.webContents.on('will-redirect', (event, url) => {
    if (!allowedNavigation(url, origin)) event.preventDefault();
  });
  current.webContents.on('will-attach-webview', (event) => event.preventDefault());
  current.once('ready-to-show', () => current.show());
  current.on('closed', () => {
    if (window === current) window = null;
  });
  for (;;) {
    try {
      await current.loadURL(origin);
      return;
    } catch {
      current.show();
      const choice = await dialog.showMessageBox(current, {
        type: 'warning',
        title: 'Life OS is offline',
        message: 'Your workspace could not be reached.',
        detail:
          'Check your connection and try again. Life OS currently needs an internet connection.',
        buttons: ['Try again', 'Close'],
        defaultId: 0,
        cancelId: 1,
      });
      if (choice.response === 1 || current.isDestroyed()) {
        app.quit();
        return;
      }
    }
  }
}

app.on('web-contents-created', (_event, contents) => {
  contents.on('will-attach-webview', (event) => event.preventDefault());
});
app.on('certificate-error', (event, _contents, _url, _error, _certificate, callback) => {
  event.preventDefault();
  callback(false);
});
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    window?.restore();
    window?.focus();
  });
  void app.whenReady().then(async () => {
    try {
      origin = trustedOrigin(__LIFE_OS_WEB_URL__, app.isPackaged);
    } catch {
      dialog.showErrorBox(
        'Life OS configuration',
        'This build does not have a valid production HTTPS address. Rebuild with LIFE_OS_WEB_URL.',
      );
      app.quit();
      return;
    }
    await createWindow();
    app.on('activate', () => {
      if (!window) void createWindow();
    });
  });
}
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
