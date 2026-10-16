import { createRequire } from 'node:module';
import { setTimeout, clearTimeout } from 'node:timers';
import { mkdtemp, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url),
  { _electron, expect } = require('@playwright/test');
const profile = await mkdtemp(join(tmpdir(), 'life-os-release-smoke-'));
const env = { ...process.env, PATH: 'C:/Windows/System32;C:/Windows' };
for (const key of [
  'ELECTRON_RUN_AS_NODE',
  'NODE_OPTIONS',
  'DATABASE_URL',
  'AUTH_SECRET',
  'APP_ORIGIN',
  'GH_TOKEN',
  'GITHUB_TOKEN',
  'LIFE_OS_UPDATE_PRIVATE_KEY',
])
  delete env[key];
const desktop = await _electron.launch({
  executablePath: resolve('apps/desktop/release/win-unpacked/Life OS.exe'),
  args: ['--user-data-dir=' + profile],
  env,
  timeout: 90000,
});
try {
  const page = await desktop.firstWindow({ timeout: 90000 });
  await page.waitForLoadState('networkidle');
  const facts = await desktop.evaluate(({ app, BrowserWindow }) => ({
    profile: app.getPath('userData'),
    packaged: app.isPackaged,
    preferences: BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences(),
  }));
  assert(resolve(facts.profile) === resolve(profile) && facts.packaged);
  assert(
    facts.preferences.sandbox &&
      facts.preferences.contextIsolation &&
      !facts.preferences.nodeIntegration &&
      facts.preferences.webSecurity,
  );
  assert(/^https:\/\/127\.0\.0\.1:\d+/.test(page.url()));
  assert(
    await page.evaluate(
      () =>
        typeof globalThis.window.require === 'undefined' &&
        typeof globalThis.window.process === 'undefined',
    ),
  );
  await expect(
    page.getByRole('heading', { name: /Life OS|local account|workspace/i }).first(),
  ).toBeVisible();
  await page.evaluate(() => globalThis.window.open('https://example.com'));
  assert((await desktop.windows()).length === 1);
  assert(
    await page.evaluate(async () => {
      try {
        await globalThis.fetch('https://example.com');
        return false;
      } catch {
        return true;
      }
    }),
  );
} finally {
  const exited = new Promise((done) => desktop.process().once('exit', done));
  let timer;
  try {
    void desktop
      .evaluate(({ BrowserWindow }) => {
        for (const w of BrowserWindow.getAllWindows()) w.close();
      })
      .catch(() => {});
    assert(
      (await Promise.race([
        exited,
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(Error('Native clean shutdown timed out; fixture retained')),
            45000,
          );
        }),
      ])) === 0,
    );
  } finally {
    clearTimeout(timer);
  }
  await assert.rejects(access(join(profile, 'offline/database.life-os.lock')));
}
console.log('PASS packaged private backend, renderer security, isolated profile and clean exit');
