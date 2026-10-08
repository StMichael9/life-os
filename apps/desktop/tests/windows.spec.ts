import { _electron, test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { build } from 'esbuild';
import { E2E_PASSWORD, clearE2ELimits } from '../../../packages/api/src/e2e-fixtures';

test.skip(process.platform !== 'win32', 'Actual Windows Electron required');
test.skip(!process.env.LIFE_OS_E2E_DATABASE_URL, 'Disposable _e2e PostgreSQL required');
const require = createRequire(import.meta.url);
let desktop: ElectronApplication, page: Page, directory: string;
test.beforeEach(async () => {
  await clearE2ELimits(process.env.LIFE_OS_E2E_DATABASE_URL!);
  directory = await mkdtemp(join(tmpdir(), 'life-os-window-qa-'));
  const entry = join(directory, 'launch.cjs');
  const main = fileURLToPath(new URL('../dist/main.cjs', import.meta.url));
  await writeFile(
    entry,
    `require('electron').app.setPath('userData', ${JSON.stringify(directory)});\nrequire(${JSON.stringify(main)});`,
  );
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
  delete env.ELECTRON_RUN_AS_NODE;
  desktop = await _electron.launch({ executablePath: require('electron'), args: [entry], env });
  page = await desktop.firstWindow();
  page.on('dialog', (dialog) => {
    void dialog.accept().catch(() => {});
  });
  await page.waitForURL('http://127.0.0.1:3000/');
  await page.waitForLoadState('load');
  await expect(page.getByRole('heading', { name: 'Make today count.', exact: true })).toBeVisible();
});
test.afterEach(async () => {
  await desktop?.close();
  if (directory && resolve(directory).startsWith(resolve(tmpdir()) + sep))
    await rm(directory, { recursive: true, force: true });
});

test('native shell denies renderer privileges, foreign navigation, popups and permissions', async () => {
  expect(
    await desktop.evaluate(({ BrowserWindow }) => {
      const contents = BrowserWindow.getAllWindows()[0]!.webContents;
      const prefs = (
        contents as typeof contents & {
          getLastWebPreferences: () => import('electron').WebPreferences;
        }
      ).getLastWebPreferences();
      return {
        sandbox: prefs.sandbox,
        contextIsolation: prefs.contextIsolation,
        nodeIntegration: prefs.nodeIntegration,
        webSecurity: prefs.webSecurity,
        insecure: prefs.allowRunningInsecureContent,
        preload: prefs.preload ?? '',
      };
    }),
  ).toEqual({
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
    webSecurity: true,
    insecure: false,
    preload: '',
  });
  expect(
    await page.evaluate(() => ({
      node: typeof (window as unknown as { require: unknown }).require,
      process: typeof (window as unknown as { process: unknown }).process,
    })),
  ).toEqual({ node: 'undefined', process: 'undefined' });
  await page.evaluate(() => {
    window.open('https://example.invalid');
  });
  expect(await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(
    1,
  );
  const blocked = desktop.evaluate(
    ({ BrowserWindow }) =>
      new Promise<boolean>((done) => {
        BrowserWindow.getAllWindows()[0]!.webContents.once('will-navigate', (event) =>
          done(event.defaultPrevented),
        );
      }),
  );
  await page.evaluate(() => {
    location.href = 'https://example.invalid';
  });
  expect(await blocked).toBe(true);
  expect(page.url()).toBe('http://127.0.0.1:3000/');
  expect(
    await page.evaluate(
      () =>
        new Promise<number>((done) => {
          navigator.geolocation.getCurrentPosition(
            () => done(0),
            (error) => done(error.code),
          );
        }),
    ),
  ).toBe(1);
});

test('a failed navigation after startup offers retry and returns to the workspace', async () => {
  // A disposable static HTTP fixture lets us stop and restart the actual listening socket.
  // It has no API/database and exercises only the compiled Electron lifecycle.
  const server = createServer((_request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.end('<h1>Offline recovery fixture</h1>');
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Fixture port unavailable');
  const port = address.port;
  try {
    await desktop.close();
    const bundle = join(directory, 'offline-main.cjs');
    await build({
      entryPoints: [fileURLToPath(new URL('../src/main.ts', import.meta.url))],
      outfile: bundle,
      bundle: true,
      platform: 'node',
      format: 'cjs',
      external: ['electron'],
      define: { __LIFE_OS_WEB_URL__: JSON.stringify(`http://127.0.0.1:${port}`) },
    });
    const entry = join(directory, 'offline-launch.cjs');
    await writeFile(
      entry,
      `require('electron').app.setPath('userData', ${JSON.stringify(directory)});\nrequire(${JSON.stringify(bundle)});`,
    );
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    );
    delete env.ELECTRON_RUN_AS_NODE;
    desktop = await _electron.launch({ executablePath: require('electron'), args: [entry], env });
    page = await desktop.firstWindow();
    await expect(page.getByRole('heading', { name: 'Offline recovery fixture' })).toBeVisible();
    await page.waitForLoadState('load');
    await desktop.evaluate(({ dialog }) => {
      Object.defineProperty(dialog, 'showMessageBox', {
        value: (_window: unknown, options: { message: string }) =>
          new Promise((resolve) => {
            Object.assign(globalThis, { qaOffline: { message: options.message, resolve } });
          }),
      });
    });
    server.closeAllConnections();
    await new Promise<void>((done, reject) =>
      server.close((error) => (error ? reject(error) : done())),
    );
    await page.reload().catch(() => {});
    await expect
      .poll(() =>
        desktop.evaluate(
          () => (globalThis as unknown as { qaOffline?: { message: string } }).qaOffline?.message,
        ),
      )
      .toBe('Your workspace could not be reached.');
    await new Promise<void>((done) => server.listen(port, '127.0.0.1', done));
    await desktop.evaluate(() => {
      (
        globalThis as unknown as {
          qaOffline: { resolve: (result: { response: number; checkboxChecked: boolean }) => void };
        }
      ).qaOffline.resolve({ response: 0, checkboxChecked: false });
    });
    await expect(page.getByRole('heading', { name: 'Offline recovery fixture' })).toBeVisible();
  } finally {
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
  }
});

test('real Electron daily workflow, resizing, keyboard dialog, persisted tasks and timer', async () => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('http://127.0.0.1:3000/login?next=/');
  await page.getByLabel('Email', { exact: true }).fill('alice@example.test');
  await page.getByLabel('Password', { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit priorities' })).toBeVisible();
  const form = page.getByRole('dialog');
  await page.getByLabel('Selected day').fill('2031-10-08');
  await expect(page.locator('.day-toolbar')).toContainText('2031-10-08');
  await page.getByRole('button', { name: 'Start Day', exact: true }).click();
  await form.getByLabel('The One Thing', { exact: true }).fill('Windows QA evidence');
  await form.getByLabel('Outcome 1', { exact: true }).fill('Verify the real desktop');
  await form.getByRole('button', { name: 'Start Day', exact: true }).click();
  await expect(form).not.toBeVisible();
  await expect(page.locator('.one-thing')).toHaveText('Windows QA evidence');
  await page.keyboard.press('Control+k');
  await expect(form).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(form).not.toBeVisible();
  for (const width of [1380, 800, 390]) {
    await desktop.evaluate(
      ({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0]!.setSize(width, 750),
      width,
    );
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
  }
  await desktop.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]!.setSize(1100, 850),
  );
  await page.goto('http://127.0.0.1:3000/tasks');
  await page.getByRole('button', { name: 'New Task', exact: true }).click();
  await form.getByLabel('Title', { exact: true }).fill('Native Windows task');
  await form.getByRole('button', { name: 'Save Task', exact: true }).click();
  await expect(form).not.toBeVisible();
  await page.reload();
  await expect(page.getByText('Native Windows task', { exact: true })).toBeVisible();
  await page.goto('http://127.0.0.1:3000/schedule');
  await page.getByLabel('Selected day').fill('2031-10-08');
  await expect(page.locator('.day-toolbar')).toContainText('2031-10-08');
  await page.getByRole('button', { name: 'Add block', exact: true }).click();
  await form.getByLabel('Block title').fill('Windows QA block');
  await form.getByLabel('Starts', { exact: true }).fill('2031-10-08T09:00');
  await form.getByLabel('Ends', { exact: true }).fill('2031-10-08T10:00');
  await form.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(form).not.toBeVisible();
  await expect(page.locator('.timeline')).toContainText('Windows QA block');
  await page.goto('http://127.0.0.1:3000/focus');
  await page.getByRole('button', { name: 'Start Focus', exact: true }).click();
  await form.getByLabel('Focus objective').fill('Native Windows focus');
  await form.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(form).not.toBeVisible();
  const first = await page.locator('.focus-clock').textContent();
  await expect.poll(() => page.locator('.focus-clock').textContent()).not.toBe(first);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Finish Focus', exact: true }).click();
  await form.getByLabel('What did you accomplish?').fill('Verified on Windows');
  await form.getByRole('button', { name: 'Finish Focus', exact: true }).click();
  await expect(form).not.toBeVisible();
  expect(errors).toEqual([]);
});
