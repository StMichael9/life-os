import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { migrate as migratePostgres } from 'drizzle-orm/node-postgres/migrator';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { eq, sql } from 'drizzle-orm';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';
import {
  createDatabase,
  createAuthRepository,
  createInboxRepository,
  schema,
  CaptureConflict,
} from '@life-os/database';
import {
  createAuthService,
  LoginFailed,
  RateLimited,
  AccountExists,
  SESSION_POLICY,
  digestToken,
} from './auth';
import { AuthenticationRequired, createInboxService } from './index';
import { createHttpSecurity } from './http-security';
import { createHttpHandlers } from './http';

const secret = 'isolated-test-secret-with-at-least-32-bytes';
const folder = fileURLToPath(new URL('../../database/migrations', import.meta.url));
let db: PgDatabase<PgQueryResultHKT, typeof schema>;
let close: () => Promise<void>;
let now: Date;
let auth: ReturnType<typeof createAuthService>;
let inbox: ReturnType<typeof createInboxService>;
let alice: string, bob: string;
const password = 'long unique test password 123!';
beforeAll(async () => {
  const url = process.env.LIFE_OS_TEST_DATABASE_URL;
  if (url) {
    if (!new URL(url).pathname.endsWith('_tests'))
      throw new Error('Use an isolated database ending in _tests. This suite truncates fixtures.');
    const connection = createDatabase(url);
    db = connection.db;
    close = connection.close;
    await migratePostgres(connection.db, { migrationsFolder: folder });
  } else {
    const pg = new PGlite();
    db = drizzle(pg, { schema });
    close = () => pg.close();
    await migratePglite(drizzle(pg), { migrationsFolder: folder });
  }
}, 30_000);
afterAll(async () => {
  await close();
});
beforeEach(async () => {
  await db.execute(sql`truncate app_user cascade`);
  await db.execute(sql`truncate auth_rate_limit`);
  now = new Date('2026-10-07T12:00:00Z');
  auth = createAuthService(createAuthRepository(db), secret, () => now);
  inbox = createInboxService(auth, createInboxRepository(db));
  alice = (
    await auth.createAccount({
      email: ' Alice@Example.test ',
      password,
      displayName: 'Alice',
      timeZone: 'America/Los_Angeles',
    })
  ).id;
  bob = (await auth.createAccount({ email: 'bob@example.test', password, displayName: 'Bob' })).id;
});
const loginAlice = () => auth.login({ email: 'alice@example.test', password });

describe('credential and session security', () => {
  it('normalizes controlled accounts, stores Argon2id only, and rejects duplicates', async () => {
    const [credential] = await db
      .select()
      .from(schema.credentials)
      .where(eq(schema.credentials.userId, alice));
    expect(credential!.passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(credential!.passwordHash).not.toContain(password);
    await expect(
      auth.createAccount({ email: 'ALICE@example.test', password, displayName: 'Duplicate' }),
    ).rejects.toThrow(AccountExists);
    await expect(
      auth.createAccount({ email: 'invalid', password: 'short', displayName: 'Bad' }),
    ).rejects.toThrow();
  });
  it('verifies passwords, returns generic errors, and hashes session tokens', async () => {
    await expect(auth.login({ email: 'alice@example.test', password: 'wrong' })).rejects.toThrow(
      LoginFailed,
    );
    await expect(auth.login({ email: 'unknown@example.test', password: 'wrong' })).rejects.toThrow(
      LoginFailed,
    );
    const session = await loginAlice();
    expect(session.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const [stored] = await db.select().from(schema.sessions);
    expect(stored!.tokenHash).toBe(digestToken(session.token));
    expect(JSON.stringify(stored)).not.toContain(session.token);
    expect((await auth.verify(session.token))!.userId).toBe(alice);
    expect(await auth.verify('malformed')).toBeNull();
  });
  it('expires idle sessions and enforces the absolute boundary even with activity', async () => {
    const idle = await loginAlice();
    now = new Date(now.getTime() + SESSION_POLICY.idleMs);
    expect(await auth.verify(idle.token)).toBeNull();
    now = new Date('2026-10-07T12:00:00Z');
    const active = await loginAlice();
    for (let day = 1; day < 30; day++) {
      now = new Date('2026-10-07T12:00:00Z');
      now.setUTCDate(now.getUTCDate() + day);
      expect(await auth.verify(active.token)).not.toBeNull();
    }
    now = active.expiresAt;
    expect(await auth.verify(active.token)).toBeNull();
    await expect(auth.refresh(active.token)).rejects.toThrow(AuthenticationRequired);
  });
  it('revokes on logout and never reactivates the session', async () => {
    const session = await loginAlice();
    await auth.logout(session.token);
    expect(await auth.verify(session.token)).toBeNull();
    await expect(auth.refresh(session.token)).rejects.toThrow(AuthenticationRequired);
    await expect(inbox.list(session.token)).rejects.toThrow(AuthenticationRequired);
    await auth.logout(session.token);
    await auth.logout(undefined);
  });
  it('rotates once under concurrent retries, recovers a lost response, and limits grace', async () => {
    const session = await loginAlice();
    expect((await auth.refresh(session.token)).rotated).toBe(false);
    now = new Date(now.getTime() + SESSION_POLICY.rotationMs);
    const [first, second] = await Promise.all([
      auth.refresh(session.token),
      auth.refresh(session.token),
    ]);
    expect(first.rotated).toBe(true);
    expect(first.token).toBe(second.token);
    expect(first.token).not.toBe(session.token);
    expect((await auth.refresh(session.token)).token).toBe(first.token);
    expect(await auth.verify(session.token)).not.toBeNull();
    now = new Date(now.getTime() + SESSION_POLICY.graceMs);
    expect(await auth.verify(session.token)).toBeNull();
    await expect(auth.refresh(session.token)).rejects.toThrow(AuthenticationRequired);
    expect(await auth.verify(first.token)).not.toBeNull();
    await auth.logout(first.token);
    expect(await auth.verify(first.token)).toBeNull();
  });
  it('allows logout with the previous token during its grace period', async () => {
    const session = await loginAlice();
    now = new Date(now.getTime() + SESSION_POLICY.rotationMs);
    const rotated = await auth.refresh(session.token);
    await auth.logout(session.token);
    expect(await auth.verify(rotated.token)).toBeNull();
  });
});

describe('persistent limits and owner-only captures', () => {
  it('persists account limits across service instances and resets after the window', async () => {
    for (let i = 0; i < 5; i++)
      await expect(auth.login({ email: 'unknown@example.test', password })).rejects.toThrow(
        LoginFailed,
      );
    const another = createAuthService(createAuthRepository(db), secret, () => now);
    await expect(another.login({ email: 'UNKNOWN@example.test', password })).rejects.toThrow(
      RateLimited,
    );
    const rows = await db.select().from(schema.authRateLimits);
    expect(JSON.stringify(rows)).not.toContain('unknown@example.test');
    now = new Date(now.getTime() + 15 * 60_000);
    await expect(another.login({ email: 'unknown@example.test', password })).rejects.toThrow(
      LoginFailed,
    );
  });
  it('uses atomic buckets under concurrent calls and enforces the global budget', async () => {
    const repo = createAuthRepository(db);
    const results = await Promise.all(
      Array.from({ length: 12 }, () => repo.consumeLimit('concurrent', 5, 60_000, now)),
    );
    expect(results.filter((result) => result.allowed)).toHaveLength(5);
    const old = new Date(now.getTime() - 1);
    await db.insert(schema.authRateLimits).values({ key: 'obsolete', attempts: 1, resetsAt: old });
    await repo.pruneLimits(now);
    expect(
      await db
        .select()
        .from(schema.authRateLimits)
        .where(eq(schema.authRateLimits.key, 'obsolete')),
    ).toHaveLength(0);
    await db
      .insert(schema.authRateLimits)
      .values({ key: 'login:global', attempts: 50, resetsAt: new Date(now.getTime() + 60_000) });
    await expect(loginAlice()).rejects.toThrow(RateLimited);
  });
  it('captures once on retry, rejects payload changes, and isolates users sharing a key', async () => {
    const a = await loginAlice();
    const b = await auth.login({ email: 'bob@example.test', password });
    const requestId = randomUUID();
    const [one, retry] = await Promise.all([
      inbox.capture(a.token, { body: ' Alice private thought ', requestId }),
      inbox.capture(a.token, { body: 'Alice private thought', requestId }),
    ]);
    expect(one.id).toBe(retry.id);
    await expect(inbox.capture(a.token, { body: 'Changed', requestId })).rejects.toThrow(
      CaptureConflict,
    );
    const other = await inbox.capture(b.token, { body: 'Bob private thought', requestId });
    expect(other.id).not.toBe(one.id);
    expect((await inbox.list(a.token)).items.map((item) => item.body)).toEqual([
      'Alice private thought',
    ]);
    expect((await inbox.list(b.token)).items.map((item) => item.body)).toEqual([
      'Bob private thought',
    ]);
    await expect(
      inbox.capture(a.token, { body: 'spoof', requestId: randomUUID(), userId: bob }),
    ).rejects.toThrow();
    await expect(inbox.list(undefined)).rejects.toThrow(AuthenticationRequired);
  });
  it('paginates stably without exposing another owner through cursor values', async () => {
    const a = await loginAlice();
    const b = await auth.login({ email: 'bob@example.test', password });
    await db
      .insert(schema.inboxItems)
      .values(Array.from({ length: 55 }, (_, i) => ({ userId: alice, body: `Capture ${i}` })));
    const other = await inbox.capture(b.token, { body: 'Bob secret', requestId: randomUUID() });
    const first = await inbox.list(a.token);
    expect(first.items).toHaveLength(50);
    expect(first.nextCursor).not.toBeNull();
    const second = await inbox.list(a.token, first.nextCursor);
    expect(second.items).toHaveLength(5);
    expect(new Set([...first.items, ...second.items].map((item) => item.id)).size).toBe(55);
    expect(
      (
        await inbox.list(a.token, { id: other.id, createdAt: other.createdAt.toISOString() })
      ).items.every((item) => item.body !== 'Bob secret'),
    ).toBe(true);
  });
});

describe('HTTP adapter with real database services', () => {
  function client() {
    const origin = 'https://life.example.test';
    const cookies = new Map<string, string>();
    const http = createHttpHandlers(
      auth,
      inbox,
      createHttpSecurity(origin, secret, false, () => now),
    );
    const headers = () => ({
      Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join(';'),
      Origin: origin,
      'Content-Type': 'application/json',
    });
    const remember = (response: Response) => {
      for (const value of response.headers.getSetCookie()) {
        const part = value.split(';')[0]!;
        const position = part.indexOf('=');
        cookies.set(part.slice(0, position), part.slice(position + 1));
      }
      return response;
    };
    return {
      cookies,
      headers,
      http,
      async csrf() {
        const response = remember(
          await http.auth(new Request(`${origin}/api/auth/csrf`, { headers: headers() }), 'csrf'),
        );
        return ((await response.json()) as { token: string }).token;
      },
      async post(action: string, body: unknown) {
        const csrf = await this.csrf();
        return remember(
          await http.auth(
            new Request(`${origin}/api/auth/${action}`, {
              method: 'POST',
              headers: { ...headers(), 'X-CSRF-Token': csrf },
              body: JSON.stringify(body),
            }),
            action,
          ),
        );
      },
    };
  }
  it('enforces login CSRF, secure cookies, no token JSON, logout and cache control', async () => {
    const c = client();
    const rejected = await c.http.auth(
      new Request('https://life.example.test/api/auth/login', {
        method: 'POST',
        headers: c.headers(),
        body: JSON.stringify({ email: 'alice@example.test', password }),
      }),
      'login',
    );
    expect(rejected.status).toBe(403);
    const login = await c.post('login', { email: 'alice@example.test', password });
    expect(login.status).toBe(200);
    expect(login.headers.get('Set-Cookie')).toContain('__Host-life_os_session=');
    expect(login.headers.get('Set-Cookie')).toContain('Secure');
    expect(login.headers.get('Set-Cookie')).toContain('HttpOnly');
    expect(login.headers.get('Set-Cookie')).not.toContain('Domain=');
    expect(await login.json()).toEqual({ ok: true });
    const session = await c.http.auth(
      new Request('https://life.example.test/api/auth/session', { headers: c.headers() }),
      'session',
    );
    expect(session.headers.get('Cache-Control')).toContain('no-store');
    expect(await session.json()).toEqual({
      profile: { id: alice, displayName: 'Alice', timeZone: 'America/Los_Angeles' },
    });
    const early = await c.post('refresh', {});
    expect(early.headers.get('Set-Cookie')).toBeNull();
    const logout = await c.post('logout', {});
    expect(logout.status).toBe(200);
    expect(logout.headers.get('Set-Cookie')).toContain('Max-Age=0');
    expect(
      (
        await c.http.inbox(
          new Request('https://life.example.test/api/inbox', { headers: c.headers() }),
        )
      ).status,
    ).toBe(401);
  });
  it('rejects cross-origin, missing/mismatched CSRF, oversized and non-JSON bodies', async () => {
    const c = client();
    const token = await c.csrf();
    for (const extra of [
      { Origin: 'https://evil.example.test', 'X-CSRF-Token': token },
      { Origin: 'null', 'X-CSRF-Token': token },
      { 'X-CSRF-Token': 'forged' },
      { 'X-CSRF-Token': token, 'Sec-Fetch-Site': 'cross-site' },
    ]) {
      const response = await c.http.auth(
        new Request('https://life.example.test/api/auth/login', {
          method: 'POST',
          headers: { ...c.headers(), ...extra },
          body: '{}',
        }),
        'login',
      );
      expect(response.status).toBe(403);
    }
    const send = (body: string, contentType = 'application/json') =>
      c.http.auth(
        new Request('https://life.example.test/api/auth/login', {
          method: 'POST',
          headers: { ...c.headers(), 'X-CSRF-Token': token, 'Content-Type': contentType },
          body,
        }),
        'login',
      );
    expect((await send('a'.repeat(16_385))).status).toBe(413);
    expect((await send('{}', 'text/plain')).status).toBe(415);
    expect((await send('{bad')).status).toBe(400);
  });
  it('serves owner-scoped capture/list, rejects owner parameters and unsupported writes', async () => {
    const c = client();
    await c.post('login', { email: 'alice@example.test', password });
    const csrf = await c.csrf();
    const requestId = randomUUID();
    const response = await c.http.inbox(
      new Request('https://life.example.test/api/inbox', {
        method: 'POST',
        headers: { ...c.headers(), 'X-CSRF-Token': csrf },
        body: JSON.stringify({ body: 'Only Alice', requestId }),
      }),
    );
    expect(response.status).toBe(201);
    const list = await c.http.inbox(
      new Request('https://life.example.test/api/inbox', { headers: c.headers() }),
    );
    expect(((await list.json()) as { items: { body: string }[] }).items[0]!.body).toBe(
      'Only Alice',
    );
    expect(
      (
        await c.http.inbox(
          new Request(`https://life.example.test/api/inbox?userId=${bob}`, {
            headers: c.headers(),
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await c.http.inbox(
          new Request('https://life.example.test/api/inbox', {
            method: 'DELETE',
            headers: c.headers(),
          }),
        )
      ).status,
    ).toBe(405);
    expect(
      (
        await c.http.auth(
          new Request('https://life.example.test/api/auth/register', {
            method: 'POST',
            headers: c.headers(),
            body: '{}',
          }),
          'register',
        )
      ).status,
    ).toBe(404);
  });
});
