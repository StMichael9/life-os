import { describe, it, expect } from 'vitest';
import { fork, spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID } from 'node:crypto';
import { request as httpsRequest } from 'node:https';
import type { IncomingHttpHeaders } from 'node:http';
import { createEmbeddedDatabase } from '@life-os/database/embedded';
import { createAuthRepository, createInboxRepository } from '@life-os/database';
import { createAuthService } from './auth';
import { createInboxService } from './index';
import { emptyReflection } from '@life-os/shared';

// Actual packaged Next/PGlite backend + verified loopback TLS, not Electron/Windows proof.
describe.skipIf(process.env.LIFE_OS_DESKTOP_RUNTIME_TEST !== 'true')(
  'private offline backend',
  () => {
    it('starts through private IPC, persists API writes across graceful restart and rejects foreign Host/owners', async () => {
      const folder = await mkdtemp(join(tmpdir(), 'life-os-offline-runtime-'));
      const root = fileURLToPath(new URL('../../../', import.meta.url));
      const directory = join(folder, 'database');
      const migrationsFolder = join(root, 'apps/web/.next/standalone/packages/database/migrations');
      const secret = randomBytes(48).toString('base64url');
      const password = 'Isolated desktop runtime password 123!';
      let child: ChildProcess | undefined;
      try {
        await new Promise<void>((accept, reject) => {
          const process = spawn(
            'openssl',
            [
              'req',
              '-x509',
              '-newkey',
              'rsa:2048',
              '-nodes',
              '-keyout',
              join(folder, 'key.pem'),
              '-out',
              join(folder, 'cert.pem'),
              '-days',
              '1',
              '-subj',
              '/CN=127.0.0.1',
              '-addext',
              'subjectAltName=IP:127.0.0.1',
            ],
            { stdio: 'ignore' },
          );
          process.on('error', reject);
          process.on('exit', (code) =>
            code === 0 ? accept() : reject(new Error('Fixture TLS setup failed.')),
          );
        });
        const certificate = await readFile(join(folder, 'cert.pem'), 'utf8');
        const connection = await createEmbeddedDatabase(directory, { migrationsFolder });
        try {
          const auth = createAuthService(createAuthRepository(connection.db), secret);
          for (const name of ['a', 'b'])
            await auth.createAccount({
              email: name + '@offline-runtime.test',
              displayName: name,
              timeZone: 'UTC',
              password,
            });
        } finally {
          await connection.close();
        }
        let origin = '';
        // Keep TLS private keys only in the parent/child's fixture memory, never argv/logs.
        const privateKey = await readFile(join(folder, 'key.pem'), 'utf8');
        let setupCapability = '';
        async function launch(
          stopBeforeReady = false,
          localDirectory = directory,
          missingResources = false,
        ) {
          let observedSafeFailure = false;
          setupCapability = randomBytes(32).toString('base64url');
          child = fork(join(root, 'apps/web/.next/standalone/apps/web/desktop-server.mjs'), [], {
            stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
            serialization: 'advanced',
          });
          const running = child;
          await new Promise<void>((accept, reject) => {
            const timer = setTimeout(
              () => reject(new Error('Offline runtime readiness timed out.')),
              30000,
            );
            running.on(
              'message',
              (message: {
                type?: string;
                origin?: string;
                version?: number;
                phase?: string;
                code?: string;
                stage?: string;
              }) => {
                if (message.type === 'ready' && message.version === 1 && message.origin) {
                  if (stopBeforeReady) {
                    reject(new Error('Canceled startup must not load a window.'));
                    return;
                  }
                  origin = message.origin;
                  clearTimeout(timer);
                  accept();
                } else if (message.type === 'error') {
                  if (missingResources) {
                    const encoded = JSON.stringify(message);
                    const diagnosticFields = new Set([
                      'type',
                      'version',
                      'stage',
                      'phase',
                      'code',
                      'category',
                    ]);
                    if (
                      message.stage !== 'startup' ||
                      message.phase !== 'dependencies' ||
                      message.code !== 'ENOENT' ||
                      !Object.keys(message).every((field) => diagnosticFields.has(field)) ||
                      encoded.includes(secret) ||
                      encoded.includes('PRIVATE KEY') ||
                      encoded.includes(JSON.stringify(privateKey).slice(1, -1)) ||
                      encoded.includes(JSON.stringify(directory).slice(1, -1))
                    ) {
                      reject(
                        new Error(
                          'Startup diagnostics must be bounded and contain no private configuration.',
                        ),
                      );
                      return;
                    }
                    observedSafeFailure = true;
                    return;
                  }
                  clearTimeout(timer);
                  reject(new Error('Offline runtime startup failed.'));
                }
              },
            );
            running.once('exit', (code) => {
              clearTimeout(timer);
              if (
                (stopBeforeReady && code === 0) ||
                (missingResources && observedSafeFailure && code === 1)
              ) {
                child = undefined;
                accept();
                return;
              }
              reject(new Error('Offline runtime exited before readiness.'));
            });
            running.send({
              type: 'configure',
              version: 1,
              webRoot: missingResources
                ? join(folder, 'missing-resources')
                : join(root, 'apps/web/.next/standalone/apps/web'),
              dataDirectory: localDirectory,
              migrationsDirectory: migrationsFolder,
              authSecret: secret,
              setupSecret: setupCapability,
              certificate,
              privateKey,
              port: 0,
            });
            if (stopBeforeReady) running.send({ type: 'stop', version: 1 });
          });
        }
        async function stop() {
          const running = child!;
          let failure = '';
          running.on('message', (message: { type?: string; stage?: string; category?: string }) => {
            if (message.type === 'error')
              failure = (message.stage ?? '') + ':' + (message.category ?? '');
          });
          await new Promise<void>((accept, reject) => {
            const timer = setTimeout(
              () => reject(new Error('Offline runtime shutdown timed out.')),
              20000,
            );
            running.once('exit', (code) => {
              clearTimeout(timer);
              if (code === 0) accept();
              else reject(new Error('Offline runtime stopped abnormally: ' + failure));
            });
            running.send({ type: 'stop', version: 1 });
          });
          child = undefined;
        }
        async function maintenanceMessage(message: Record<string, unknown>) {
          const requestId = randomUUID();
          const running = child!;
          return new Promise<{ type: string; archive?: Uint8Array }>((resolve, reject) => {
            const timer = setTimeout(() => {
              running.off('message', reply);
              reject(new Error('Backup fixture timed out.'));
            }, 30000);
            const reply = (response: {
              type: string;
              requestId?: string;
              archive?: Uint8Array;
            }) => {
              if (response.requestId !== requestId) return;
              clearTimeout(timer);
              running.off('message', reply);
              resolve(response);
            };
            running.on('message', reply);
            running.send({ ...message, requestId, version: 1 });
          });
        }
        class Browser {
          cookies = new Map<string, string>();
          csrf = '';
          async request(path: string, body?: unknown, extra: Record<string, string> = {}) {
            return new Promise<{
              status: number;
              data: Record<string, unknown>;
              headers: IncomingHttpHeaders;
              content: string;
            }>((accept, reject) => {
              const content = body === undefined ? undefined : JSON.stringify(body);
              const req = httpsRequest(
                new URL(path, origin),
                {
                  ca: certificate,
                  servername: '', // Connect/verify the loopback IP even when testing a forged HTTP Host.
                  method: content === undefined ? 'GET' : 'POST',
                  headers: {
                    Cookie: [...this.cookies].map(([key, value]) => key + '=' + value).join('; '),
                    ...(content === undefined
                      ? {}
                      : {
                          Origin: origin,
                          'Content-Type': 'application/json',
                          'X-CSRF-Token': this.csrf,
                        }),
                    ...extra,
                  },
                },
                (response) => {
                  const chunks: Buffer[] = [];
                  response.on('data', (chunk: Buffer) => chunks.push(chunk));
                  response.on('end', () => {
                    for (const cookie of response.headers['set-cookie'] ?? []) {
                      const pair = cookie.split(';')[0]!;
                      const at = pair.indexOf('=');
                      this.cookies.set(pair.slice(0, at), pair.slice(at + 1));
                    }
                    const text = Buffer.concat(chunks).toString();
                    accept({
                      status: response.statusCode!,
                      data: response.headers['content-type']?.includes('json')
                        ? JSON.parse(text)
                        : {},
                      headers: response.headers,
                      content: text,
                    });
                  });
                },
              );
              req.setTimeout(10000, () =>
                req.destroy(new Error('Offline fixture request timed out.')),
              );
              req.on('error', reject);
              req.end(content);
            });
          }
          async login(name: string) {
            const csrf = await this.request('/api/auth/csrf');
            expect(csrf.status).toBe(200);
            this.csrf = csrf.data.token as string;
            const signedIn = await this.request('/api/auth/login', {
              email: name + '@offline-runtime.test',
              password,
            });
            expect(signedIn.status).toBe(200);
            const cookie = signedIn.headers['set-cookie']?.find((value) =>
              value.startsWith('__Host-life_os_session='),
            );
            expect(cookie).toContain('Secure');
            expect(cookie).toContain('HttpOnly');
            expect(cookie).not.toContain('Domain=');
          }
        }
        await launch();
        expect((await new Browser().request('/login')).content).toContain('Welcome back.');
        const a = new Browser(),
          b = new Browser();
        await a.login('a');
        await b.login('b');
        const authenticatedPage = await a.request('/');
        expect(authenticatedPage.status).toBe(200);
        expect(authenticatedPage.content).toContain('Opening your workspace');
        expect(authenticatedPage.content).not.toContain('NEXT_REDIRECT');
        expect(authenticatedPage.content).not.toContain('http-equiv="refresh"');
        const requestId = randomUUID();
        const command = { requestId, body: 'Offline capture persists through restart' };
        const captured = await a.request('/api/inbox', command);
        expect(captured.status).toBe(201);
        expect((await a.request('/api/inbox', command)).data.item).toEqual(captured.data.item);
        expect((await b.request('/api/inbox')).data.items).toEqual([]);
        expect(
          (
            await a.request(
              '/api/inbox',
              { requestId: randomUUID(), body: 'Rejected' },
              { 'X-CSRF-Token': '' },
            )
          ).status,
        ).toBe(403);
        expect(
          (await a.request('/api/auth/session', undefined, { Host: 'foreign.example' })).status,
        ).toBe(403);
        const today = await a.request('/api/execution/today');
        expect(today.status).toBe(200);
        const date = today.data.date as string;
        const task = randomUUID();
        const taskCommand = (id: string) => ({
          id,
          version: 0,
          title: 'Offline useful result',
          description: null,
          notes: null,
          projectId: null,
          goalId: null,
          categoryId: null,
          priority: 1,
          status: 'planned',
          dueAt: null,
          estimateMinutes: 25,
          actualMinutes: null,
          impact: 4,
          urgency: 3,
          opportunity: 2,
          goalAlignment: 4,
          energy: 'medium',
        });
        expect((await a.request('/api/tasks', taskCommand(task))).status).toBe(201);
        const plan = (version: number, workflow: string) => ({
          action: 'plan',
          requestId: randomUUID(),
          date,
          version,
          oneThing: 'Finish the local result',
          outcomes: [{ outcome: 'Useful result', taskId: task, completed: workflow === 'close' }],
          workflow,
          reflection: {
            ...emptyReflection,
            learned: workflow === 'close' ? 'Local work persists' : '',
          },
        });
        expect((await a.request('/api/execution', plan(0, 'start'))).status).toBe(200);
        expect(
          (
            await a.request('/api/execution', {
              action: 'schedule',
              requestId: randomUUID(),
              id: randomUUID(),
              version: 0,
              title: 'Local time block',
              kind: 'task',
              taskId: task,
              startsAt: date + 'T09:00:00Z',
              endsAt: date + 'T09:25:00Z',
              remove: false,
            })
          ).status,
        ).toBe(200);
        const focus = randomUUID();
        expect(
          (
            await a.request('/api/execution', {
              action: 'focus-start',
              requestId: randomUUID(),
              id: focus,
              objective: 'Offline attention',
              taskId: task,
              projectId: null,
              categoryId: null,
              plannedMinutes: 25,
            })
          ).status,
        ).toBe(200);
        await new Promise((accept) => setTimeout(accept, 1100));
        for (const [version, operation] of [
          [1, 'pause'],
          [2, 'resume'],
          [3, 'finish'],
        ] as const)
          expect(
            (
              await a.request('/api/execution', {
                action: 'focus-control',
                requestId: randomUUID(),
                id: focus,
                version,
                operation,
                outcome: 'Local focused result',
                notes: '',
              })
            ).status,
          ).toBe(200);
        const processed = await a.request('/api/inbox', {
          requestId: randomUUID(),
          body: 'Process this local capture',
        });
        const source = (processed.data.item as { id: string }).id;
        expect(
          (await a.request('/api/tasks/from-inbox/' + source, taskCommand(randomUUID()))).status,
        ).toBe(201);
        expect((await b.request('/api/tasks/' + task)).status).toBe(404);
        expect((await b.request('/api/tasks/from-inbox/' + source)).status).toBe(404);
        expect((await a.request('/api/execution', plan(1, 'close'))).status).toBe(200);
        const backupKey = randomBytes(32);
        const backup = await maintenanceMessage({ type: 'backup', backupKey });
        expect(backup.type).toBe('backup-ready');
        expect(backup.archive).toBeInstanceOf(Uint8Array);
        const candidateDirectory = join(folder, 'recovery-candidate');
        expect(
          (
            await maintenanceMessage({
              type: 'restore',
              backupKey: randomBytes(32),
              archive: backup.archive,
              candidateDirectory,
            })
          ).type,
        ).toBe('operation-error');
        expect(
          (
            await maintenanceMessage({
              type: 'restore',
              backupKey,
              archive: backup.archive,
              candidateDirectory,
            })
          ).type,
        ).toBe('restore-ready');
        backupKey.fill(0);
        const candidate = await createEmbeddedDatabase(candidateDirectory, { migrationsFolder });
        try {
          const recoveredAuth = createAuthService(createAuthRepository(candidate.db), secret);
          expect(await recoveredAuth.verify(a.cookies.get('__Host-life_os_session')!)).toBeNull();
          const recoveredLogin = await recoveredAuth.login({
            email: 'a@offline-runtime.test',
            password,
          });
          const recoveredInbox = createInboxService(
            recoveredAuth,
            createInboxRepository(candidate.db),
          );
          expect(
            (await recoveredInbox.list(recoveredLogin.token)).items.some(
              (item) => item.body === command.body,
            ),
          ).toBe(true);
        } finally {
          await candidate.close();
        }
        expect((await a.request('/api/auth/session')).status).toBe(200);
        await stop();
        await launch();
        expect((await a.request('/api/auth/session')).status).toBe(200);
        expect((await a.request('/api/inbox')).data.items).toEqual([captured.data.item]);
        const restored = await a.request('/api/execution/today');
        expect((restored.data.plan as { closedAt: string }).closedAt).toBeTruthy();
        expect((restored.data.plan as { evening: { learned: string } }).evening.learned).toBe(
          'Local work persists',
        );
        expect(restored.data.schedule).toHaveLength(1);
        expect(
          (restored.data.focusHistory as { activeSeconds: number }[])[0]!.activeSeconds,
        ).toBeGreaterThanOrEqual(1);
        expect((await b.request('/api/execution/today')).data.plan).toBeNull();
        const replay = new Map(a.cookies);
        expect((await a.request('/api/auth/logout', {})).status).toBe(200);
        a.cookies = replay;
        expect((await a.request('/api/auth/session')).status).toBe(401);
        await stop();
        await launch(true);
        const afterCanceledStartup = await createEmbeddedDatabase(directory, { migrationsFolder });
        await afterCanceledStartup.close();
        await launch(false, directory, true);
        await launch(false, join(folder, 'first-workspace'));
        const first = new Browser();
        const firstPage = await first.request('/login');
        expect(firstPage.content).toContain('Make this workspace yours.');
        expect((await first.request('/api/auth/setup')).data.setup).toBe(true);
        first.csrf = (await first.request('/api/auth/csrf')).data.token as string;
        const initialAccount = {
          email: 'first@offline-runtime.test',
          password,
          displayName: 'First',
          timeZone: 'UTC',
        };
        expect((await first.request('/api/auth/setup', initialAccount)).status).toBe(403);
        expect(
          (
            await first.request('/api/auth/setup', initialAccount, {
              'X-Life-OS-Setup': setupCapability,
            })
          ).status,
        ).toBe(201);
        expect((await first.request('/api/auth/setup')).data.setup).toBe(false);
        expect((await first.request('/login')).content).toContain('Welcome back.');
        await first.login('first');
        const firstToday = await first.request('/');
        expect(firstToday.content).toContain('Opening your workspace');
        expect(firstToday.content).not.toContain('NEXT_REDIRECT');
        expect((await first.request('/api/inbox')).data.items).toEqual([]);
        await stop();
      } finally {
        if (child && child.exitCode === null) {
          const remaining = child;
          await new Promise<void>((resolve) => {
            const timer = setTimeout(() => {
              remaining.kill('SIGKILL');
              resolve();
            }, 5000);
            remaining.once('exit', () => {
              clearTimeout(timer);
              resolve();
            });
            remaining.kill();
          });
        }
        await rm(folder, { recursive: true, force: true });
      }
    }, 90000);
  },
);
