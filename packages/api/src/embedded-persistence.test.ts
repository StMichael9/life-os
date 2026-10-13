import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { sql } from 'drizzle-orm';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { createEmbeddedDatabase } from '@life-os/database/embedded';
import {
  createAuthRepository,
  createInboxRepository,
  createExecutionRepository,
  schema as s,
} from '@life-os/database';
import { createAuthService } from './auth';
import { createInboxService } from './index';
import { createExecutionService } from './execution';
import { randomUUID } from 'node:crypto';

describe('offline filesystem persistence', () => {
  it('keeps migrated accounts, owner-only capture and revoked sessions across real engine restarts', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'life-os-embedded-'));
    const path = join(folder, 'database');
    const migrationsFolder = fileURLToPath(new URL('../../database/migrations', import.meta.url));
    const open = () => createEmbeddedDatabase(path, { migrationsFolder });
    const secret = 'isolated-embedded-fixture-secret-at-least-32-bytes';
    const password = 'Isolated offline fixture password 123!';
    let connection: Awaited<ReturnType<typeof createEmbeddedDatabase>> | undefined;
    try {
      connection = await open();
      const auth = createAuthService(createAuthRepository(connection.db), secret);
      const a = await auth.createAccount({
        email: 'a@offline.test',
        displayName: 'A',
        timeZone: 'UTC',
        password,
      });
      const b = await auth.createAccount({
        email: 'b@offline.test',
        displayName: 'B',
        timeZone: 'UTC',
        password,
      });
      const login = await auth.login({ email: 'a@offline.test', password });
      const inbox = createInboxService(auth, createInboxRepository(connection.db));
      await inbox.capture(login.token, {
        requestId: randomUUID(),
        body: 'A private persisted capture',
      });
      await Promise.all([connection.close(), connection.close()]);

      connection = await open();
      const reopenedAuth = createAuthService(createAuthRepository(connection.db), secret);
      const reopenedInbox = createInboxService(reopenedAuth, createInboxRepository(connection.db));
      expect((await reopenedAuth.verify(login.token))?.userId).toBe(a.id);
      expect((await reopenedInbox.list(login.token)).items.map((item) => item.body)).toEqual([
        'A private persisted capture',
      ]);
      const bob = await reopenedAuth.login({ email: 'b@offline.test', password });
      expect((await reopenedAuth.verify(bob.token))?.userId).toBe(b.id);
      expect((await reopenedInbox.list(bob.token)).items).toEqual([]);
      await expect(open()).rejects.toThrow(/open or needs guarded recovery/);
      const expected = readMigrationFiles({
        migrationsFolder: fileURLToPath(new URL('../../database/migrations', import.meta.url)),
      });
      const ledger = await connection.db.execute(
        sql`select hash,created_at from drizzle.__drizzle_migrations order by created_at,id`,
      );
      expect(ledger.rows.map((row) => row.hash)).toEqual(expected.map((row) => row.hash));
      await reopenedAuth.logout(login.token);
      await connection.close();

      connection = await open();
      const finalAuth = createAuthService(createAuthRepository(connection.db), secret);
      expect(await finalAuth.verify(login.token)).toBeNull();
      expect((await finalAuth.login({ email: 'a@offline.test', password })).token).toBeTruthy();
    } finally {
      await connection?.close();
      await rm(folder, { recursive: true, force: true });
    }
  }, 30000);
});

it('keeps multiple unfinished Focus timers, notes and atomic switches across physical engine restarts', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'life-os-focus-persist-'));
  const migrationsFolder = fileURLToPath(new URL('../../database/migrations', import.meta.url));
  const path = join(folder, 'database'),
    secret = 'focus-persistence-fixture-secret-over-32-bytes';
  let connection: Awaited<ReturnType<typeof createEmbeddedDatabase>> | undefined;
  try {
    connection = await createEmbeddedDatabase(path, { migrationsFolder });
    const auth = createAuthService(createAuthRepository(connection.db), secret);
    const user = await auth.createAccount({
      email: 'focus@offline.test',
      displayName: 'Offline Focus',
      timeZone: 'UTC',
      password: 'Offline focus fixture password 123!',
    });
    const login = await auth.login({
      email: 'focus@offline.test',
      password: 'Offline focus fixture password 123!',
    });
    const algorithms = randomUUID(),
      book = randomUUID();
    // Synthetic saved 45-minute paused session; no fabricated active interval.
    await connection.db.insert(s.focusSessions).values({
      id: algorithms,
      userId: user.id,
      objective: 'Algorithms',
      startedAt: new Date(),
      plannedMinutes: 90,
      activeSeconds: 2700,
      notes: 'Return to this algorithm',
    });
    const execution = createExecutionService(auth, createExecutionRepository(connection.db));
    await execution.mutate(login.token, {
      action: 'focus-start',
      requestId: randomUUID(),
      id: book,
      objective: 'Bookvane',
      plannedMinutes: 60,
      taskId: null,
      projectId: null,
      categoryId: null,
      notes: 'Independent book notes',
    });
    await connection.close();
    connection = await createEmbeddedDatabase(path, { migrationsFolder });
    const reopenedAuth = createAuthService(createAuthRepository(connection.db), secret),
      reopened = createExecutionService(reopenedAuth, createExecutionRepository(connection.db));
    expect((await reopenedAuth.verify(login.token))?.userId).toBe(user.id);
    let snapshot = await reopened.today(login.token, {});
    expect(snapshot.focus?.id).toBe(book);
    expect(snapshot.focusSessions.find((f) => f.id === algorithms)).toMatchObject({
      activeSeconds: 2700,
      resumedAt: null,
      notes: 'Return to this algorithm',
      plannedMinutes: 90,
    });
    await reopened.mutate(login.token, {
      action: 'focus-control',
      requestId: randomUUID(),
      id: algorithms,
      version: 1,
      operation: 'resume',
      completeTask: false,
      outcome: '',
      notes: '',
    });
    snapshot = await reopened.today(login.token, {});
    expect(snapshot.focus?.id).toBe(algorithms);
    expect(snapshot.focusSessions.find((f) => f.id === book)).toMatchObject({
      resumedAt: null,
      endedAt: null,
      notes: 'Independent book notes',
    });
    await reopened.mutate(login.token, {
      action: 'focus-control',
      requestId: randomUUID(),
      id: algorithms,
      version: 2,
      operation: 'pause',
      completeTask: false,
      outcome: '',
      notes: '',
    });
    const paused = await reopened.today(login.token, {});
    const seconds = new Map(paused.focusSessions.map((f) => [f.id, f.activeSeconds]));
    await connection.close();
    connection = await createEmbeddedDatabase(path, { migrationsFolder });
    const final = createExecutionService(
      createAuthService(createAuthRepository(connection.db), secret),
      createExecutionRepository(connection.db),
    );
    snapshot = await final.today(login.token, {});
    expect(snapshot.focusSessions).toHaveLength(2);
    expect(
      snapshot.focusSessions.every(
        (f) => f.resumedAt === null && f.activeSeconds === seconds.get(f.id),
      ),
    ).toBe(true);
    expect(snapshot.focusSessions.find((f) => f.id === algorithms)?.notes).toBe(
      'Return to this algorithm',
    );
  } finally {
    await connection?.close();
    await rm(folder, { recursive: true, force: true });
  }
}, 30000);
