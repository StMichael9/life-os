import { it, expect } from 'vitest';
import { chromium, expect as browserExpect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { fork, spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, readFile, mkdir, rm } from 'node:fs/promises';
import { join, resolve, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID } from 'node:crypto';
import { createEmbeddedDatabase } from '@life-os/database/embedded';
import { createAuthRepository, createExecutionRepository } from '@life-os/database';
import { localDate, emptyReflection } from '@life-os/shared';
import type { ExecutionSnapshot } from '@life-os/shared';
import { createAuthService } from './auth';

// Real shared renderer -> HTTPS handlers -> disposable PGlite. No real profile or hosted resources.
it.skipIf(process.env.LIFE_OS_HOMEPAGE_BROWSER_TEST !== 'true')(
  'Bento homepage connects capture, habits, both timer modes and responsive navigation to persisted records',
  async () => {
    const root = fileURLToPath(new URL('../../../', import.meta.url));
    const runtime =
      process.env.LIFE_OS_HOMEPAGE_PACKAGED === 'true'
        ? join(root, 'apps/desktop/release/win-unpacked/resources/backend')
        : join(root, 'apps/web/.next/standalone');
    const fixture = await mkdtemp(join(tmpdir(), 'life-os-homepage-'));
    if (
      dirname(resolve(fixture)) !== resolve(tmpdir()) ||
      !basename(fixture).startsWith('life-os-homepage-')
    )
      throw new Error('Invalid fixture cleanup path');
    const dataDirectory = join(fixture, 'database');
    const migrationsDirectory = join(root, 'packages/database/migrations');
    const output = join(root, 'test-results/homepage');
    const authSecret = randomBytes(48).toString('base64url');
    const password = 'Synthetic homepage password 123!';
    const sessionA = randomUUID(),
      sessionB = randomUUID();
    let child: ChildProcess | undefined;
    let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
    let opened: Awaited<ReturnType<typeof createEmbeddedDatabase>> | undefined;
    try {
      await mkdir(output, { recursive: true });
      const openssl =
        process.platform === 'win32' ? 'C:/Program Files/Git/usr/bin/openssl.exe' : 'openssl';
      await new Promise<void>((accept, reject) => {
        const cert = spawn(
          openssl,
          [
            'req',
            '-x509',
            '-newkey',
            'rsa:2048',
            '-nodes',
            '-keyout',
            join(fixture, 'key.pem'),
            '-out',
            join(fixture, 'cert.pem'),
            '-days',
            '1',
            '-subj',
            '/CN=127.0.0.1',
            '-addext',
            'subjectAltName=IP:127.0.0.1',
          ],
          { stdio: 'ignore' },
        );
        cert.once('error', reject);
        cert.once('exit', (code) =>
          code === 0 ? accept() : reject(new Error('Synthetic TLS setup failed.')),
        );
      });
      opened = await createEmbeddedDatabase(dataDirectory, {
        migrationsFolder: migrationsDirectory,
      });
      const auth = createAuthService(createAuthRepository(opened.db), authSecret);
      const user = await auth.createAccount({
        email: 'homepage@example.test',
        displayName: 'Homepage preview',
        password,
        timeZone: 'America/Los_Angeles',
      });
      const repo = createExecutionRepository(opened.db);
      const date = localDate(new Date(), 'America/Los_Angeles');
      await repo.mutate(user.id, {
        action: 'plan',
        requestId: randomUUID(),
        date,
        version: 0,
        oneThing: 'Ship meaningful work',
        outcomes: [
          { outcome: 'Finish a deliberate practice session', taskId: null, completed: false },
        ],
        workflow: 'start',
        reflection: emptyReflection,
      });
      await repo.mutate(user.id, {
        action: 'routine',
        requestId: randomUUID(),
        id: randomUUID(),
        version: 0,
        title: 'Synthetic daily walk',
        notes: '',
        days: [0, 1, 2, 3, 4, 5, 6],
        spiritual: false,
        archived: false,
      });
      for (const [id, objective, timerMode] of [
        [sessionA, 'Synthetic Algorithms', 'stopwatch'],
        [sessionB, 'Synthetic Reading', 'countdown'],
      ] as const) {
        await repo.mutate(user.id, {
          action: 'focus-start',
          requestId: randomUUID(),
          id,
          objective,
          taskId: null,
          projectId: null,
          categoryId: null,
          plannedMinutes: 25,
          timerMode,
          notes: 'Independent session notes',
        });
      }
      await opened.close();
      opened = undefined;
      const certificate = await readFile(join(fixture, 'cert.pem'), 'utf8');
      const privateKey = await readFile(join(fixture, 'key.pem'), 'utf8');
      child = fork(join(runtime, 'apps/web/desktop-server.mjs'), [], {
        stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
        serialization: 'advanced',
        env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined },
      });
      let diagnostics = '';
      child.stderr?.on('data', (chunk) => {
        diagnostics += String(chunk).slice(0, 2000);
      });
      const runningChild = child;
      const ready = new Promise<string>((accept, reject) => {
        const timeout = setTimeout(
          () =>
            reject(
              new Error('Private test backend readiness timed out: ' + diagnostics.slice(-2000)),
            ),
          60000,
        );
        runningChild.on(
          'message',
          (message: {
            type?: string;
            origin?: string;
            phase?: string;
            code?: string;
            httpStatus?: number;
          }) => {
            if (message.type === 'ready' && message.origin) {
              clearTimeout(timeout);
              accept(message.origin);
            }
            if (message.type === 'error') {
              clearTimeout(timeout);
              reject(
                new Error(
                  'Private test backend failed: ' +
                    JSON.stringify({
                      phase: message.phase,
                      code: message.code,
                      httpStatus: message.httpStatus,
                    }),
                ),
              );
            }
          },
        );
        runningChild.once('exit', (code) => {
          clearTimeout(timeout);
          reject(
            new Error('Private test backend exited ' + code + ': ' + diagnostics.slice(-2000)),
          );
        });
      });
      child.send({
        type: 'configure',
        version: 1,
        webRoot: join(runtime, 'apps/web'),
        dataDirectory,
        migrationsDirectory,
        authSecret,
        setupSecret: randomBytes(32).toString('base64url'),
        certificate,
        privateKey,
        port: 0,
      });
      const origin = await ready;
      browser = await chromium.launch(
        process.platform === 'win32' ? { channel: 'msedge', headless: true } : { headless: true },
      );
      const context = await browser.newContext({
        ignoreHTTPSErrors: true,
        viewport: { width: 1440, height: 1000 },
      });
      const page = await context.newPage();
      const faults: string[] = [];
      page.on('pageerror', (e) => faults.push(e.message));
      page.on('dialog', (d) => d.accept());
      await page.goto(origin + '/login?next=/');
      await page.getByLabel('Email', { exact: true }).fill('homepage@example.test');
      await page.getByLabel('Password', { exact: true }).fill(password);
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await browserExpect(
        page.getByRole('heading', { name: 'Daily Agenda', exact: true }),
      ).toBeVisible();
      await browserExpect(
        page.getByRole('heading', { name: 'Core Focus', exact: true }),
      ).toBeVisible();
      await browserExpect(
        page.getByRole('heading', { name: 'Micro-Habits', exact: true }),
      ).toBeVisible();
      await browserExpect(page.getByRole('timer')).toHaveCount(1);
      const snapshot = async () =>
        (await (
          await page.request.get(origin + '/api/execution/today')
        ).json()) as ExecutionSnapshot;
      const focus = page.locator('#focus');
      await focus.getByRole('button', { name: 'Pause', exact: true }).click();
      await browserExpect(focus.getByRole('button', { name: 'Resume', exact: true })).toBeEnabled();
      const frozen = await focus.getByRole('timer').textContent();
      await page.waitForTimeout(1100);
      await browserExpect(focus.getByRole('timer')).toHaveText(frozen!);
      await focus.getByRole('button', { name: 'Resume Synthetic Algorithms', exact: true }).click();
      await browserExpect(focus.getByRole('timer', { name: 'Actual work elapsed' })).toBeVisible();
      const switched = await snapshot();
      expect(switched.focusSessions.filter((s) => s.resumedAt)).toHaveLength(1);
      expect(switched.focusSessions.find((s) => s.id === sessionB)?.resumedAt).toBeNull();
      await page.getByLabel('Synthetic daily walk', { exact: true }).check();
      await browserExpect
        .poll(
          async () =>
            (await snapshot()).routines.find((r) => r.title === 'Synthetic daily walk')?.completed,
        )
        .toBe(true);
      await page.getByLabel('Finish a deliberate practice session', { exact: true }).check();
      await browserExpect
        .poll(async () => !!(await snapshot()).plan?.outcomes[0]?.completedAt)
        .toBe(true);
      await page.getByRole('button', { name: 'Capture', exact: true }).first().click();
      const dialog = page.getByRole('dialog');
      await dialog
        .getByLabel('Quick Inbox capture', { exact: true })
        .fill('Synthetic capture kept across closing');
      await dialog.getByRole('button', { name: 'Keep & close', exact: true }).click();
      await page.getByRole('button', { name: 'Capture', exact: true }).first().click();
      await browserExpect(dialog.getByLabel('Quick Inbox capture')).toHaveValue(
        'Synthetic capture kept across closing',
      );
      await dialog.getByRole('button', { name: 'Capture to Inbox', exact: true }).click();
      await browserExpect(dialog.getByLabel('Quick Inbox capture')).toHaveValue('');
      const captures = await (await page.request.get(origin + '/api/inbox')).json();
      expect(
        captures.items.filter(
          (i: { body: string }) => i.body === 'Synthetic capture kept across closing',
        ),
      ).toHaveLength(1);
      await dialog.getByRole('button', { name: 'Keep & close', exact: true }).click();
      await page.screenshot({ path: join(output, 'desktop.png'), fullPage: true });
      for (const width of [1440, 1024, 768, 390, 320]) {
        await page.setViewportSize({ width, height: 1000 });
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          'overflow at ' + width,
        ).toBe(true);
        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
          .analyze();
        expect(
          results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
          'accessibility at ' + width,
        ).toEqual([]);
        if (width === 390)
          await page.screenshot({ path: join(output, 'mobile.png'), fullPage: true });
      }
      await page.getByRole('button', { name: 'Library', exact: true }).click();
      await browserExpect(page.getByRole('menuitem', { name: 'Inbox', exact: true })).toBeVisible();
      await page.keyboard.press('Escape');
      expect(faults).toEqual([]);
      await context.close();
    } finally {
      await browser?.close();
      await opened?.close();
      if (child?.connected) {
        const stopped = new Promise<void>((accept, reject) => {
          const timeout = setTimeout(
            () =>
              reject(
                new Error('Synthetic backend did not stop cleanly. Fixture retained at ' + fixture),
              ),
            30000,
          );
          child!.once('exit', () => {
            clearTimeout(timeout);
            accept();
          });
        });
        child.send({ type: 'stop', version: 1 });
        await stopped;
      }
      if (!child || child.exitCode !== null)
        await rm(resolve(fixture), { recursive: true, force: true });
    }
  },
  180000,
);
