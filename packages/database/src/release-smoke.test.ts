import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer as netServer } from 'node:net';
import { request as httpRequest } from 'node:http';
import { createServer, request as httpsRequest, type Server } from 'node:https';
import { Client } from 'pg';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { drizzle } from 'drizzle-orm/node-postgres';
import { createDatabase, createAuthRepository } from '@life-os/database';
import { emptyReflection } from '@life-os/shared';
import { createAuthService } from '../../api/src/auth';
import { migrationFolder, verifyRuntimePermissions } from './operations';

// Destructive fixtures only. This proves real production Next integration through
// verified local TLS with a restricted PostgreSQL login, not Vercel/Neon behavior.
const fixture = process.env.LIFE_OS_SMOKE_TEST_DATABASE_URL;
type FixturePayload = {
  token: string;
  ownerId: string;
  date: string;
  profile: { id: string };
  item: { id: string };
  plan: { closedAt: string | null; evening: { learned: string } } | null;
  schedule: unknown[];
  focusHistory: { activeSeconds: number }[];
};
describe.skipIf(!fixture)('production HTTPS daily-use rehearsal', () => {
  let admin: Client, roleLock: Client, server: Server, next: ChildProcess, directory: string;
  let origin: string, certificate: Buffer, alice: string, bob: string;
  const secret = randomBytes(48).toString('base64url');
  const password = 'Isolated HTTPS fixture password 123!';
  const rolePassword = randomBytes(32).toString('hex');
  const roleUrl = (role: string) => {
    const url = new URL(fixture!);
    url.username = role;
    url.password = rolePassword;
    return url.toString();
  };
  async function port() {
    const socket = netServer();
    await new Promise<void>((accept) => socket.listen(0, '127.0.0.1', accept));
    const p = (socket.address() as { port: number }).port;
    await new Promise<void>((accept, reject) => socket.close((e) => (e ? reject(e) : accept())));
    return p;
  }
  class Browser {
    cookies = new Map<string, string>();
    csrf = '';
    async request(path: string, body?: unknown, extra: Record<string, string> = {}) {
      const bytes = body === undefined ? undefined : JSON.stringify(body);
      return new Promise<{
        status: number;
        data: FixturePayload;
        headers: import('node:http').IncomingHttpHeaders;
      }>((accept, reject) => {
        const req = httpsRequest(
          new URL(path, origin),
          {
            ca: certificate,
            family: 4,
            method: bytes === undefined ? 'GET' : 'POST',
            headers: {
              Cookie: [...this.cookies].map(([k, v]) => k + '=' + v).join('; '),
              ...(bytes === undefined
                ? {}
                : {
                    'Content-Type': 'application/json',
                    Origin: origin,
                    'X-CSRF-Token': this.csrf,
                    'Content-Length': Buffer.byteLength(bytes),
                  }),
              ...extra,
            },
          },
          (res) => {
            const chunks: Buffer[] = [];
            res.on('data', (chunk: Buffer) => chunks.push(chunk));
            res.on('end', () => {
              for (const cookie of res.headers['set-cookie'] ?? []) {
                const pair = cookie.split(';')[0]!,
                  at = pair.indexOf('=');
                this.cookies.set(pair.slice(0, at), pair.slice(at + 1));
              }
              const content = Buffer.concat(chunks).toString();
              accept({
                status: res.statusCode!,
                data: res.headers['content-type']?.includes('application/json')
                  ? JSON.parse(content)
                  : {},
                headers: res.headers,
              });
            });
          },
        );
        req.setTimeout(10000, () => req.destroy(new Error('HTTPS fixture request timed out.')));
        req.on('error', reject);
        req.end(bytes);
      });
    }
    async login(email: string) {
      const csrf = await this.request('/api/auth/csrf');
      expect(csrf.status).toBe(200);
      this.csrf = csrf.data.token;
      const login = await this.request('/api/auth/login', { email, password });
      expect(login.status).toBe(200);
      const session = login.headers['set-cookie']?.find((v) =>
        v.startsWith('__Host-life_os_session='),
      );
      expect(
        Boolean(
          session?.includes('HttpOnly') &&
          session.includes('Secure') &&
          session.includes('Path=/') &&
          session.includes('SameSite=Lax') &&
          !session.includes('Domain='),
        ),
      ).toBe(true);
    }
  }
  beforeAll(async () => {
    const url = new URL(fixture!);
    if (!['localhost', '127.0.0.1'].includes(url.hostname) || !url.pathname.endsWith('_tests'))
      throw new Error(
        'An isolated local _tests database is required for the destructive HTTPS rehearsal.',
      );
    admin = new Client({ connectionString: fixture });
    // Operations fixtures share cluster roles: serialize password/grant setup.
    const lockUrl = new URL(fixture!);
    lockUrl.pathname = '/postgres';
    roleLock = new Client({ connectionString: lockUrl.toString() });
    await roleLock.connect();
    await roleLock.query('select pg_advisory_lock(710062601)');
    await admin.connect();
    await admin.query(
      'drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public',
    );
    await admin.query(
      await readFile(
        fileURLToPath(new URL('../../../ops/postgres/bootstrap.sql', import.meta.url)),
        'utf8',
      ),
    );
    for (const role of [
      'life_os_migrator',
      'life_os_runtime',
      'life_os_operator',
      'life_os_backup',
    ])
      await admin.query(`alter role ${role} login password '${rolePassword}'`);
    const migration = new Client({ connectionString: roleUrl('life_os_migrator') });
    await migration.connect();
    try {
      await migrate(drizzle(migration), { migrationsFolder: migrationFolder });
      await migration.query(
        await readFile(
          fileURLToPath(new URL('../../../ops/postgres/grants.sql', import.meta.url)),
          'utf8',
        ),
      );
    } finally {
      await migration.end();
    }
    const operator = createDatabase(roleUrl('life_os_operator'));
    try {
      const auth = createAuthService(createAuthRepository(operator.db), secret);
      alice = (
        await auth.createAccount({
          email: 'alice@https.test',
          password,
          displayName: 'Alice',
          timeZone: 'America/Los_Angeles',
        })
      ).id;
      bob = (
        await auth.createAccount({
          email: 'bob@https.test',
          password,
          displayName: 'Bob',
          timeZone: 'UTC',
        })
      ).id;
    } finally {
      await operator.close();
    }
    const runtime = new Client({ connectionString: roleUrl('life_os_runtime') });
    await runtime.connect();
    try {
      await verifyRuntimePermissions(runtime);
    } finally {
      await runtime.end();
    }
    directory = await mkdtemp(join(tmpdir(), 'life-os-https-'));
    const key = join(directory, 'key.pem'),
      cert = join(directory, 'cert.pem');
    await new Promise<void>((accept, reject) => {
      const openssl = spawn(
        'openssl',
        [
          'req',
          '-x509',
          '-newkey',
          'rsa:2048',
          '-nodes',
          '-keyout',
          key,
          '-out',
          cert,
          '-days',
          '1',
          '-subj',
          '/CN=localhost',
          '-addext',
          'subjectAltName=DNS:localhost,IP:127.0.0.1',
        ],
        { stdio: 'ignore' },
      );
      openssl.on('error', reject);
      openssl.on('close', (code) =>
        code === 0 ? accept() : reject(new Error('Cannot create isolated TLS certificate.')),
      );
    });
    certificate = await readFile(cert);
    const backendPort = await port();
    server = createServer({ key: await readFile(key), cert: certificate }, (req, res) => {
      const upstream = httpRequest(
        {
          hostname: '127.0.0.1',
          port: backendPort,
          path: req.url,
          method: req.method,
          headers: {
            ...req.headers,
            'x-forwarded-proto': 'https',
            'x-forwarded-host': new URL(origin).host,
          },
        },
        (response) => {
          res.writeHead(response.statusCode!, response.headers);
          response.pipe(res);
        },
      );
      upstream.on('error', () => {
        res.writeHead(503);
        res.end();
      });
      req.pipe(upstream);
    });
    await new Promise<void>((accept) => server.listen(0, '127.0.0.1', accept));
    origin = `https://localhost:${(server.address() as { port: number }).port}`;
    const web = fileURLToPath(new URL('../../../apps/web/', import.meta.url));
    const require = createRequire(join(web, 'package.json'));
    next = spawn(
      process.execPath,
      [
        require.resolve('next/dist/bin/next'),
        'start',
        '--hostname',
        '127.0.0.1',
        '--port',
        String(backendPort),
      ],
      {
        cwd: web,
        stdio: 'ignore',
        env: {
          PATH: process.env.PATH,
          NODE_ENV: 'production',
          DATABASE_URL: roleUrl('life_os_runtime'),
          AUTH_SECRET: secret,
          APP_ORIGIN: origin,
          NEXT_TELEMETRY_DISABLED: '1',
        },
      },
    );
    const visitor = new Browser();
    for (let i = 0; i < 120; i++) {
      if (next.exitCode !== null)
        throw new Error('Production Next server stopped. Build the web application first.');
      if ((await visitor.request('/api/auth/csrf')).status === 200) return;
      await new Promise((accept) => setTimeout(accept, 250));
    }
    throw new Error('Production Next HTTPS fixture did not become ready.');
  }, 60000);
  afterAll(async () => {
    if (next && next.exitCode === null) {
      next.kill();
      await new Promise<void>((accept) => next.once('close', () => accept()));
    }
    if (server) {
      server.closeAllConnections();
      await new Promise<void>((accept) => server.close(() => accept()));
    }
    await admin?.end();
    await roleLock?.end();
    if (directory) await rm(directory, { recursive: true, force: true });
  });
  it('persists a complete day, rejects CSRF and cross-account access, and revokes logout over verified HTTPS', async () => {
    const a = new Browser(),
      b = new Browser();
    await a.login('alice@https.test');
    await b.login('bob@https.test');
    const today = await a.request('/api/execution/today');
    expect(today.status).toBe(200);
    expect(today.data.ownerId).toBe(alice);
    expect(today.headers['cache-control']).toContain('no-store');
    expect(today.headers['x-content-type-options']).toBe('nosniff');
    expect(today.headers['strict-transport-security']).toContain('max-age=');
    expect(today.headers['content-security-policy']).not.toContain('unsafe-eval');
    const date = today.data.date as string,
      task = randomUUID(),
      focus = randomUUID();
    const taskCommand = (id: string, title: string) => ({
      id,
      version: 0,
      title,
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
    expect(
      (await a.request('/api/tasks', taskCommand(task, 'Finish a useful result'))).status,
    ).toBe(201);
    const outcomes = [{ outcome: 'A useful result', taskId: task, completed: false }];
    const plan = (version: number, workflow: string, completed = false) => ({
      action: 'plan',
      requestId: randomUUID(),
      date,
      version,
      oneThing: 'Ship one useful result',
      outcomes: outcomes.map((x) => ({ ...x, completed })),
      workflow,
      reflection: {
        ...emptyReflection,
        gratitude: 'Time to build',
        learned: workflow === 'close' ? 'Protect attention' : '',
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
          title: 'Protected work',
          kind: 'task',
          taskId: task,
          startsAt: `${date}T16:00:00Z`,
          endsAt: `${date}T16:25:00Z`,
          remove: false,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await a.request('/api/execution', {
          action: 'focus-start',
          requestId: randomUUID(),
          id: focus,
          objective: 'Write the result',
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
            outcome: 'Saved result',
            notes: 'Focused work',
          })
        ).status,
      ).toBe(200);
    const capture = { requestId: randomUUID(), body: 'A real private HTTPS capture' };
    expect((await a.request('/api/inbox', capture, { 'X-CSRF-Token': '' })).status).toBe(403);
    expect(
      (await a.request('/api/inbox', capture, { Origin: 'https://another.test' })).status,
    ).toBe(403);
    const captured = await a.request('/api/inbox', capture);
    expect(captured.status).toBe(201);
    expect((await a.request('/api/inbox', capture)).data.item.id).toBe(captured.data.item.id);
    expect(
      (
        await a.request(`/api/tasks/from-inbox/${captured.data.item.id}`, {
          ...taskCommand(randomUUID(), 'Follow up'),
          description: capture.body,
        })
      ).status,
    ).toBe(201);
    expect((await a.request('/api/execution', plan(1, 'save', true))).status).toBe(200);
    expect((await a.request('/api/execution', plan(2, 'close', true))).status).toBe(200);
    const saved = await a.request('/api/execution/today');
    expect(saved.data.plan!.closedAt).not.toBeNull();
    expect(saved.data.plan!.evening.learned).toBe('Protect attention');
    expect(saved.data.schedule).toHaveLength(1);
    expect(saved.data.focusHistory[0]!.activeSeconds).toBeGreaterThanOrEqual(1);
    expect((await b.request('/api/execution/today')).data.plan).toBeNull();
    expect((await b.request(`/api/tasks/${task}`)).status).toBe(404);
    expect((await b.request(`/api/tasks/from-inbox/${captured.data.item.id}`)).status).toBe(404);
    expect(
      (
        await b.request(
          '/api/inbox',
          { requestId: randomUUID(), body: 'Spoofed owner' },
          { 'X-Life-OS-Account': alice },
        )
      ).status,
    ).toBe(401);
    expect((await a.request('/api/auth/register', {})).status).toBe(404);
    expect((await a.request('/api/auth/refresh', {})).headers['set-cookie']).toBeUndefined();
    const session = a.cookies.get('__Host-life_os_session')!;
    expect((await a.request('/api/auth/logout', {})).status).toBe(200);
    a.cookies.set('__Host-life_os_session', session);
    expect((await a.request('/api/execution/today')).status).toBe(401);
    expect((await b.request('/api/auth/session')).data.profile.id).toBe(bob);
    const count = await admin.query('select count(*)::int as n from inbox_item where user_id=$1', [
      alice,
    ]);
    expect(count.rows[0].n).toBe(1);
  }, 30000);
});
