import { _electron, test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { mkdtemp, writeFile, readFile, access, rm } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ChildProcess } from 'node:child_process';

test.skip(process.platform !== 'win32', 'Native Windows offline application required');
const require = createRequire(import.meta.url);
let desktop: ElectronApplication | undefined, page: Page, directory: string, entry: string;
let runningProcess: ChildProcess | undefined;
async function closeDesktop() {
  if (!desktop) return;
  const running = runningProcess;
  if (!running || running.exitCode !== null) {
    desktop = undefined;
    return;
  }
  const exited =
    running.exitCode !== null
      ? Promise.resolve()
      : new Promise<void>((done) => running.once('exit', () => done()));
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      (async () => {
        await desktop!.close();
        await exited;
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Native graceful shutdown exceeded 50 seconds.')),
          50000,
        );
      }),
    ]);
  } catch (error) {
    // Bound cleanup of this disposable fixture only; a forced close is a test failure.
    running.kill();
    await exited;
    throw error;
  } finally {
    clearTimeout(timer);
    desktop = undefined;
  }
}
async function launch() {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (pair): pair is [string, string] => typeof pair[1] === 'string',
    ),
  );
  for (const key of [
    'ELECTRON_RUN_AS_NODE',
    'DATABASE_URL',
    'AUTH_SECRET',
    'APP_ORIGIN',
    'LIFE_OS_WEB_URL',
  ])
    delete env[key];
  desktop = await _electron.launch({
    executablePath: require('electron'),
    args: [entry],
    env,
    timeout: 120000,
  });
  runningProcess = desktop.process();
  runningProcess.stdout?.on('data', (data) => {
    const lines = String(data)
      .split('\n')
      .filter((line) => line.startsWith('QA backend') || line.startsWith('QA native'));
    for (const line of lines) console.log(line.trim());
  });
  page = await desktop.firstWindow({ timeout: 120000 });
  page.on('dialog', (dialog) => {
    void dialog.accept().catch(() => {});
  });
  await page.waitForLoadState('load');
  await page.waitForLoadState('networkidle');
}
test.beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'life-os-offline-windows-'));
  entry = join(directory, 'launch.cjs');
  const main = fileURLToPath(new URL('../dist/main.cjs', import.meta.url));
  await writeFile(
    entry,
    `const {app,dialog,utilityProcess}=require('electron');app.setPath('userData',${JSON.stringify(directory)});const fork=utilityProcess.fork;utilityProcess.fork=(...args)=>{const child=fork(...args);child.on('message',v=>{if(v?.type==='stopped'||v?.type==='error')console.log('QA backend '+JSON.stringify({type:v.type,stage:v.stage,category:v.category}));});child.on('exit',code=>console.log('QA backend exit '+code));return child;};dialog.showErrorBox=()=>app.exit(1);dialog.showMessageBox=async (...args)=>{const options=args.at(-1);console.log('QA native '+options.title);if(options.title==='Life OS local backend')return {response:0};if(options.title==='Life OS unsaved changes')return {response:1};return {response:1};};require(${JSON.stringify(main)});`,
  );
  await launch();
});
test.afterEach(async () => {
  await closeDesktop();
  if (directory && resolve(directory).startsWith(resolve(tmpdir()) + sep))
    await rm(directory, { recursive: true, force: true });
});

test('bundled backend supports setup, daily workflows, encrypted session and database restart without a manual server', async () => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const origin = new URL(page.url()).origin;
  expect(origin).toMatch(/^https:\/\/127\.0\.0\.1:\d+$/);
  expect(
    await desktop!.evaluate(
      ({ app }) =>
        app.getAppMetrics().filter((metric) => metric.name === 'Life OS private backend').length,
    ),
  ).toBe(1);
  expect(
    await page.evaluate(() => typeof (window as unknown as { require: unknown }).require),
  ).toBe('undefined');
  expect(
    await desktop!.evaluate(({ BrowserWindow }) => {
      const contents = BrowserWindow.getAllWindows()[0]!.webContents as unknown as {
        getLastWebPreferences(): {
          sandbox: boolean;
          contextIsolation: boolean;
          nodeIntegration: boolean;
          webSecurity: boolean;
          allowRunningInsecureContent: boolean;
          preload?: string;
        };
      };
      const preferences = contents.getLastWebPreferences();
      return {
        sandbox: preferences.sandbox,
        contextIsolation: preferences.contextIsolation,
        nodeIntegration: preferences.nodeIntegration,
        webSecurity: preferences.webSecurity,
        insecureContent: preferences.allowRunningInsecureContent,
        preload: preferences.preload,
      };
    }),
  ).toEqual({
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
    webSecurity: true,
    insecureContent: false,
    preload: undefined,
  });
  expect(
    await page.evaluate(() =>
      fetch('https://example.com').then(
        () => false,
        () => true,
      ),
    ),
  ).toBe(true);
  await page.goto(origin + '/login?next=/');
  await expect(page.getByRole('heading', { name: 'Make this workspace yours.' })).toBeVisible();
  const password = randomBytes(24).toString('base64url') + 'A1!';
  await page.getByLabel('Your name').fill('Offline Windows QA');
  await page.getByLabel('Time zone').fill('America/Los_Angeles');
  await page.getByLabel('Email', { exact: true }).fill('windows-offline@example.test');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password').fill(password);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit priorities' })).toBeVisible();
  const cookie = await desktop!.evaluate(async ({ session }, origin) => {
    const cookies = await session
      .fromPartition('life-os-offline')
      .cookies.get({ url: origin, name: '__Host-life_os_session' });
    const value = cookies[0]!;
    return {
      value: value.value,
      secure: value.secure,
      httpOnly: value.httpOnly,
      sameSite: value.sameSite,
      hostOnly: value.hostOnly,
    };
  }, origin);
  expect({
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
    sameSite: cookie.sameSite,
    hostOnly: cookie.hostOnly,
  }).toEqual({ secure: true, httpOnly: true, sameSite: 'lax', hostOnly: true });
  let form = page.getByRole('dialog');
  const day = await page.getByLabel('Selected day').inputValue();
  await page.getByRole('button', { name: 'Start Day', exact: true }).click();
  await form.getByLabel('The One Thing', { exact: true }).fill('Verify offline desktop');
  await form.getByLabel('Outcome 1', { exact: true }).fill('A saved local result');
  await form.getByRole('button', { name: 'Start Day', exact: true }).click();
  await expect(form).not.toBeVisible();
  await page.goto(origin + '/tasks');
  await page.getByRole('button', { name: 'New Task', exact: true }).click();
  await form.getByLabel('Title', { exact: true }).fill('Offline task');
  await form.getByRole('button', { name: 'Save Task', exact: true }).click();
  await expect(form).not.toBeVisible();
  await page.goto(origin + '/schedule');
  await page.getByRole('button', { name: 'Add block', exact: true }).click();
  await form.getByLabel('Block title').fill('Offline time block');
  await form.getByLabel('Starts', { exact: true }).fill(day + 'T09:00');
  await form.getByLabel('Ends', { exact: true }).fill(day + 'T10:00');
  await form.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(form).not.toBeVisible();
  await page.goto(origin + '/focus');
  await page.getByRole('button', { name: 'Start Focus', exact: true }).click();
  await form.getByLabel('Focus objective').fill('Offline focused result');
  await form.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(form).not.toBeVisible();
  const clock = await page.locator('.focus-clock').textContent();
  await expect.poll(() => page.locator('.focus-clock').textContent()).not.toBe(clock);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeEnabled();
  await closeDesktop();
  await expect(access(join(directory, 'offline/database.life-os.lock'))).rejects.toThrow();
  const file = join(
    directory,
    'offline/credentials',
    createHash('sha256').update(origin).digest('hex'),
    'session.bin',
  );
  expect((await readFile(file)).includes(cookie.value)).toBe(false);
  await launch();
  form = page.getByRole('dialog');
  expect(new URL(page.url()).origin).toBe(origin);
  await expect(page.getByRole('button', { name: 'Edit priorities' })).toBeVisible();
  await expect(page.locator('.one-thing')).toHaveText('Verify offline desktop');
  await page.goto(origin + '/tasks');
  await expect(page.getByText('Offline task', { exact: true })).toBeVisible();
  await page.goto(origin + '/focus');
  await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Finish Focus', exact: true }).click();
  await form.getByLabel('What did you accomplish?').fill('Persisted an offline result');
  await form.getByRole('button', { name: 'Finish Focus', exact: true }).click();
  await expect(form).not.toBeVisible();
  await page.goto(origin + '/inbox');
  await page.getByLabel('What’s on your mind?').fill('Offline capture');
  await page.getByRole('button', { name: 'Capture', exact: true }).click();
  await expect(page.getByLabel('What’s on your mind?')).toHaveValue('');
  await page.getByRole('link', { name: 'Turn into Task', exact: true }).click();
  await expect(form).toBeVisible();
  await form.getByRole('button', { name: 'Create Task', exact: true }).click();
  await expect(form).not.toBeVisible();
  await expect(page.getByRole('heading', { name: 'Offline capture', exact: true })).toBeVisible();
  await page.goto(origin + '/inbox');
  await expect(page.locator('.capture-list li').filter({ hasText: 'Offline capture' })).toHaveCount(
    0,
  );
  await page.goto(origin + '/');
  await page.getByRole('button', { name: 'Close Day', exact: true }).click();
  await form.getByLabel('What did I learn?').fill('The local backend restarts safely');
  await form.getByRole('button', { name: 'Close Day', exact: true }).click();
  await expect(form).not.toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit priorities' })).not.toBeVisible();
  await closeDesktop();
  await expect(access(file)).rejects.toThrow();
  await launch();
  await page.goto(origin + '/login');
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('recovers after its actual utility backend exits and denies external windows and navigation', async () => {
  const origin = new URL(page.url()).origin;
  await page.evaluate(() => {
    window.open('https://example.com');
  });
  expect(desktop!.windows()).toHaveLength(1);
  await page.evaluate(() => {
    window.location.href = 'https://example.com';
  });
  await expect.poll(() => new URL(page.url()).origin).toBe(origin);
  const oldPid = await desktop!.evaluate(({ app }) => {
    const pid = app
      .getAppMetrics()
      .find((metric) => metric.name === 'Life OS private backend')!.pid;
    process.kill(pid);
    return pid;
  });
  await expect
    .poll(
      () =>
        desktop!.evaluate(({ app }, oldPid) => {
          const processes = app
            .getAppMetrics()
            .filter((metric) => metric.name === 'Life OS private backend');
          return processes.length === 1 && processes[0]!.pid !== oldPid;
        }, oldPid),
      { timeout: 60000 },
    )
    .toBe(true);
  await expect(page.getByRole('heading', { name: 'Make this workspace yours.' })).toBeVisible();
  expect(new URL(page.url()).origin).toBe(origin);
});
