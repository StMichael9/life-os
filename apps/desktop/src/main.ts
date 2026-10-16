import { app, BrowserWindow, dialog, session } from 'electron';
import { persistSession } from './session-persistence';
import { allowedNavigation, trustedOrigin, rendererSecurity } from './security';
import { join } from 'node:path';
import { loadLocalIdentity } from './local-identity';
import { pinnedLocalCertificate, allowedLocalRequest } from './local-trust';
import { startLocalBackend, type LocalBackend } from './local-backend';
import { desktopUpdates } from './desktop-updates';

declare const __LIFE_OS_WEB_URL__: string;
declare const __LIFE_OS_OFFLINE__: boolean;
let window: BrowserWindow | null = null;
let origin: string;
let persistence: Awaited<ReturnType<typeof persistSession>> | undefined;
let canQuit = false;
let quitting = false;
let backend: LocalBackend | undefined;
let privateDirectory: string | undefined;
let backendReady = false;
let updates: ReturnType<typeof desktopUpdates> | undefined;

async function initializeOffline() {
  const local = await loadLocalIdentity(app.getPath('userData'));
  privateDirectory = local.directory;
  const resources = app.isPackaged
    ? join(process.resourcesPath, 'backend')
    : join(__dirname, '../../web/.next/standalone');
  backend = await startLocalBackend(resources, local.database, local.identity, () => {
    if (!backendReady || quitting) return;
    backendReady = false;
    void recoverBackend();
  });
  origin = backend.origin;
  if (local.identity.port === 0)
    await local.save({ ...local.identity, port: Number(new URL(origin).port) });
  const isolated = session.fromPartition('life-os-offline');
  isolated.setCertificateVerifyProc((request, callback) =>
    callback(
      request.hostname === '127.0.0.1' &&
        pinnedLocalCertificate(request.certificate.data, backend!.fingerprint)
        ? 0
        : -2,
    ),
  );
  isolated.webRequest.onBeforeRequest(
    { urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] },
    (details, callback) =>
      callback({ cancel: !backendReady || !allowedLocalRequest(details.url, origin) }),
  );
  isolated.webRequest.onBeforeSendHeaders({ urls: [origin + '/*'] }, (details, callback) => {
    const headers = { ...details.requestHeaders };
    for (const name of Object.keys(headers))
      if (name.toLowerCase() === 'x-life-os-setup') delete headers[name];
    if (
      details.webContentsId === window?.webContents.id &&
      details.method === 'POST' &&
      new URL(details.url).pathname === '/api/auth/setup'
    )
      headers['X-Life-OS-Setup'] = backend!.setupSecret;
    callback({ requestHeaders: headers });
  });
  backendReady = true;
}

async function recoverBackend() {
  const choice = await dialog.showMessageBox({
    type: 'error',
    title: 'Life OS local backend',
    message: 'The local workspace stopped unexpectedly.',
    detail: 'Your saved files have been preserved. Restart the local backend, or close Life OS.',
    buttons: ['Restart', 'Close'],
    cancelId: 1,
  });
  if (choice.response === 1) {
    app.quit();
    return;
  }
  try {
    // This callback runs only after the old utility process has exited.
    await initializeOffline();
    if (window && !window.isDestroyed()) await window.loadURL(origin);
    else await createWindow();
  } catch {
    dialog.showErrorBox(
      'Life OS recovery',
      'The local workspace could not be reopened safely. Your saved data was preserved.',
    );
    app.quit();
  }
}

async function createWindow() {
  const isolatedSession = session.fromPartition(
    __LIFE_OS_OFFLINE__ ? 'life-os-offline' : 'life-os-foundation',
  );
  persistence ??= await persistSession(
    isolatedSession,
    origin,
    privateDirectory ?? app.getPath('userData'),
  );
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
      ...rendererSecurity,
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
  let discardPrompt = false;
  current.webContents.on('will-prevent-unload', () => {
    if (discardPrompt) return;
    discardPrompt = true;
    void dialog
      .showMessageBox(current, {
        type: 'question',
        title: 'Life OS unsaved changes',
        message: 'Discard unsaved changes and close Life OS?',
        detail: 'Saved workspace data will be kept.',
        buttons: ['Keep editing', 'Discard and close'],
        defaultId: 0,
        cancelId: 0,
      })
      .then((choice) => {
        discardPrompt = false;
        if (current.isDestroyed()) return;
        if (choice.response === 1) current.destroy();
        else {
          updates?.cancelRestart();
          current.focus();
        }
      });
  });
  current.once('ready-to-show', () => current.show());
  current.on('closed', () => {
    if (window === current) window = null;
  });
  let recovery: Promise<void> | undefined;
  async function retry(url: string) {
    while (!current.isDestroyed()) {
      current.show();
      const choice = await dialog.showMessageBox(current, {
        type: 'warning',
        title: __LIFE_OS_OFFLINE__ ? 'Life OS local workspace' : 'Life OS is offline',
        message: 'Your workspace could not be reached.',
        detail: __LIFE_OS_OFFLINE__
          ? 'The local backend could not serve this page. Retry or close Life OS; saved files are preserved.'
          : 'Check your connection and try again. Life OS currently needs an internet connection.',
        buttons: ['Try again', 'Close'],
        defaultId: 0,
        cancelId: 1,
      });
      if (choice.response === 1 || current.isDestroyed()) {
        app.quit();
        return;
      }
      try {
        await current.loadURL(url);
        return;
      } catch {
        // The failed load event shares this recovery; it must not open another dialog.
      }
    }
  }
  function recover(url: string) {
    recovery ??= retry(url).finally(() => {
      recovery = undefined;
    });
    return recovery;
  }
  current.webContents.on('did-fail-load', (_event, code, _description, url, isMainFrame) => {
    // Aborted requests and subresources do not replace the workspace. Only retry trusted pages.
    if (isMainFrame && code !== -3 && allowedNavigation(url, origin)) void recover(url);
  });
  try {
    await current.loadURL(origin);
  } catch {
    await recover(origin);
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
    if (!window && backendReady && !quitting) void createWindow();
  });
  void app.whenReady().then(async () => {
    try {
      if (__LIFE_OS_OFFLINE__) await initializeOffline();
      else origin = trustedOrigin(__LIFE_OS_WEB_URL__, app.isPackaged);
    } catch {
      dialog.showErrorBox(
        'Life OS configuration',
        __LIFE_OS_OFFLINE__
          ? 'Life OS could not initialize its protected local workspace. Existing data was preserved.'
          : 'This build does not have a valid production HTTPS address. Rebuild with LIFE_OS_WEB_URL.',
      );
      app.quit();
      return;
    }
    await createWindow();
    if (
      app.isPackaged &&
      process.platform === 'win32' &&
      !process.argv.some((arg) => arg.startsWith('--user-data-dir'))
    )
      updates = desktopUpdates();
    app.on('activate', () => {
      if (!window) void createWindow();
    });
  });
}
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', (event) => {
  if (canQuit) return;
  if (!backend && !persistence) return;
  event.preventDefault();
  // Honor the renderer's draft/discard guard before stopping its backend.
  if (window && !window.isDestroyed()) {
    window.close();
    return;
  }
  if (quitting) return;
  quitting = true;
  void (async () => {
    try {
      await backend?.stop();
      await persistence?.flush();
      const install = await updates?.prepareInstall();
      canQuit = true;
      if (install) install();
      else app.quit();
    } catch {
      quitting = false;
      const choice = await dialog.showMessageBox({
        type: 'error',
        title: 'Life OS saving',
        message: 'Life OS could not finish saving.',
        detail: 'Saved files were preserved. Try again or keep the application open.',
        buttons: ['Try again', 'Keep open'],
        cancelId: 1,
      });
      if (choice.response === 0) app.quit();
    }
  })();
});
