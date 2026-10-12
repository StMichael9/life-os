import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { sql } from 'drizzle-orm';
import { fileURLToPath } from 'node:url';
import { createAuthRepository, createInboxRepository, schema } from '@life-os/database';
import { createAuthService } from './auth';
import { createInboxService } from './index';
import { createHttpHandlers } from './http';
import { createHttpSecurity } from './http-security';

describe('controlled local first-account setup', () => {
  const engine = new PGlite();
  const db = drizzle(engine, { schema });
  const origin = 'https://127.0.0.1:43127';
  const secret = 'isolated-local-fixture-secret-at-least-32-bytes';
  const capability = 'main-only-setup-fixture-secret-at-least-32-bytes';
  const input = {
    email: 'local@setup.test',
    displayName: 'Local',
    timeZone: 'UTC',
    password: 'Local setup fixture password 123!',
  };
  const auth = createAuthService(createAuthRepository(db), secret);
  const security = createHttpSecurity(origin, secret);
  const handlers = createHttpHandlers(
    auth,
    createInboxService(auth, createInboxRepository(db)),
    security,
    { localSetupSecret: capability },
  );
  beforeAll(async () => {
    await migrate(db, {
      migrationsFolder: fileURLToPath(new URL('../../database/migrations', import.meta.url)),
    });
  });
  beforeEach(async () => {
    await db.execute(sql`truncate app_user cascade`);
    await db.execute(sql`truncate auth_rate_limit`);
  });
  afterAll(async () => {
    await engine.close();
  });
  function post(extra: Record<string, string> = {}, body: unknown = input) {
    const issued = security.issueCsrf(new Request(origin + '/api/auth/csrf'));
    return new Request(origin + '/api/auth/setup', {
      method: 'POST',
      headers: {
        Origin: origin,
        'Content-Type': 'application/json',
        'X-CSRF-Token': issued.token,
        Cookie: issued.cookie!.split(';')[0]!,
        'X-Life-OS-Setup': capability,
        ...extra,
      },
      body: JSON.stringify(body),
    });
  }
  it('requires the main-only capability, CSRF and exact origin before account creation', async () => {
    for (const extra of [
      { 'X-Life-OS-Setup': '' },
      { 'X-CSRF-Token': '' },
      { Origin: 'https://foreign.test' },
    ])
      expect((await handlers.auth(post(extra), 'setup')).status).toBe(403);
    expect(await auth.needsInitialAccount()).toBe(true);
    expect(
      (await handlers.auth(post({}, { ...input, userId: 'forged-owner' }), 'setup')).status,
    ).toBe(400);
    const response = await handlers.auth(post(), 'setup');
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ created: true });
    expect(await auth.needsInitialAccount()).toBe(false);
    expect(
      (await handlers.auth(post({}, { ...input, email: 'another@setup.test' }), 'setup')).status,
    ).toBe(409);
    expect((await db.select().from(schema.users)).length).toBe(1);
    expect((await auth.login({ email: input.email, password: input.password })).token).toBeTruthy();
  });
  it('does not expose setup on hosted handlers', async () => {
    const hosted = createHttpHandlers(
      auth,
      createInboxService(auth, createInboxRepository(db)),
      security,
    );
    expect((await hosted.auth(new Request(origin + '/api/auth/setup'), 'setup')).status).toBe(404);
    expect((await hosted.auth(post(), 'setup')).status).toBe(404);
    expect(await auth.needsInitialAccount()).toBe(true);
  });
  it('atomically permits only one account when valid initial requests race', async () => {
    const results = await Promise.allSettled([
      auth.createInitialAccount(input),
      auth.createInitialAccount({ ...input, email: 'racing@setup.test' }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect((await db.select().from(schema.users)).length).toBe(1);
  });
});
