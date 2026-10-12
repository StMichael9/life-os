import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { sql } from 'drizzle-orm';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { createEmbeddedDatabase } from '@life-os/database/embedded';
import { createAuthRepository, createInboxRepository } from '@life-os/database';
import { createAuthService } from './auth';
import { createInboxService } from './index';
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
