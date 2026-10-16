import { app, dialog, Menu } from 'electron';
import type { MenuItemConstructorOptions } from 'electron';
import { autoUpdater } from 'electron-updater';
import { cp, lstat, access, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { protectDirectory } from './private-directory';
import { verifyRelease, verifyInstaller, type SignedRelease } from './update-verification';
import config from '../update-config.json';

/** Main-process only. No renderer IPC, credentials, or renderer network permission. */
export function desktopUpdates() {
  let checking = false,
    ready: { file: string; release: SignedRelease } | undefined;
  let restart = false;
  const recovery = app.getPath('userData') + '-update-backups';
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowDowngrade = false;
  autoUpdater.allowPrerelease = false;
  autoUpdater.logger = null;
  autoUpdater.on('error', () => {}); // Offline checking never interrupts local work.
  autoUpdater.setFeedURL({ provider: 'github', owner: 'StMichael9', repo: 'life-os' });

  function restartNow() {
    if (!ready) return;
    restart = true;
    app.quit(); // Existing draft guard, backend stop and encrypted-session flush run first.
  }
  function menu() {
    const template: MenuItemConstructorOptions[] = [
      {
        label: 'Life OS',
        submenu: [
          { label: 'Check for updates…', click: () => void check(true) },
          { label: 'Restart to update', enabled: !!ready, click: restartNow },
          { type: 'separator' },
          { role: 'quit' },
        ],
      },
      { role: 'editMenu' },
      { role: 'windowMenu' },
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  }
  async function check(interactive = false) {
    if (checking) return;
    if (ready) {
      await offer();
      return;
    }
    checking = true;
    try {
      const result = await autoUpdater.checkForUpdates();
      if (!result?.isUpdateAvailable) {
        if (interactive) await dialog.showMessageBox({ message: 'Life OS is up to date.' });
        return;
      }
      const version = result.updateInfo.version;
      if (!/^\d{1,8}\.\d{1,8}\.\d{1,8}$/.test(version)) throw new Error('Invalid version');
      const response = await fetch(
        `https://github.com/StMichael9/life-os/releases/download/v${version}/life-os-update.json`,
        { signal: AbortSignal.timeout(30000) },
      );
      if (!response.ok || Number(response.headers.get('content-length') ?? 0) > 16384)
        throw new Error('Signed update unavailable');
      const text = await response.text();
      if (text.length > 16384) throw new Error('Invalid manifest');
      const release = verifyRelease(JSON.parse(text), config.publicKey, app.getVersion());
      const files = result.updateInfo.files;
      if (
        release.version !== version ||
        files.length !== 1 ||
        files[0]?.sha512 !== release.sha512 ||
        files[0]?.size !== release.size ||
        decodeURIComponent(files[0]?.url ?? '') !== release.filename
      )
        throw new Error('Unsigned release metadata');
      const paths = await autoUpdater.downloadUpdate();
      const file = paths.find((path) => path.toLowerCase().endsWith('.exe'));
      if (!file) throw new Error('Missing installer');
      await verifyInstaller(file, release);
      await protectDirectory(recovery);
      const retained = join(recovery, `installer-${release.version}.exe`);
      await cp(file, retained);
      await verifyInstaller(retained, release);
      ready = { file, release };
      menu();
      await offer();
    } catch {
      if (interactive)
        await dialog.showMessageBox({
          type: 'info',
          message: 'Life OS could not verify an update.',
          detail: 'Your local workspace is available. Try checking again later.',
        });
    } finally {
      checking = false;
    }
  }
  async function offer() {
    if (!ready) return;
    const choice = await dialog.showMessageBox({
      type: 'info',
      message: `Life OS ${ready.release.version} is ready.`,
      detail:
        'The update download has been verified. Saved data will be preserved. Restart when convenient.',
      buttons: ['Restart to update', 'Later'],
      defaultId: 1,
      cancelId: 1,
    });
    if (choice.response === 0) restartNow();
  }
  menu();
  const first = setTimeout(() => void check(), 20000);
  const interval = setInterval(() => void check(), 6 * 60 * 60 * 1000);
  first.unref();
  interval.unref();
  return {
    cancelRestart() {
      restart = false;
    },
    async prepareInstall() {
      if (!restart || !ready) return undefined;
      await verifyInstaller(ready.file, ready.release);
      await protectDirectory(recovery);
      const priorInstaller = join(recovery, `installer-${app.getVersion()}.exe`);
      await access(priorInstaller); // A compatible previous installer must be retained.
      const backup = join(recovery, `before-${ready.release.version}-${Date.now()}`);
      await protectDirectory(backup);
      await access(join(app.getPath('userData'), 'offline/database.life-os.lock')).then(
        () => {
          throw new Error('Database still open');
        },
        (error: NodeJS.ErrnoException) => {
          if (error.code !== 'ENOENT') throw error;
        },
      );
      await cp(app.getPath('userData'), join(backup, 'Life OS'), {
        recursive: true,
        filter: async (path) => {
          if ((await lstat(path)).isSymbolicLink()) throw new Error('Unexpected profile link');
          return true;
        },
      });
      await cp(priorInstaller, join(backup, `Life-OS-Setup-${app.getVersion()}.exe`));
      await writeFile(
        join(backup, 'recovery.json'),
        JSON.stringify({
          previousVersion: app.getVersion(),
          nextVersion: ready.release.version,
          profile: 'Life OS',
          note: 'Restore this profile only with its compatible previous installer. DPAPI requires the same Windows account.',
        }),
      );
      // Recheck immediately before invoking the maintained NSIS updater.
      await verifyInstaller(ready.file, ready.release);
      return () => autoUpdater.quitAndInstall(true, true);
    },
  };
}
