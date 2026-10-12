import { it, expect } from 'vitest';
import { mkdtemp, rm, cp, appendFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { createEmbeddedDatabase } from '@life-os/database/embedded';
import {
  createEncryptedEmbeddedBackup,
  restoreEncryptedEmbeddedBackup,
} from '@life-os/database/embedded-backup';
import { createAuthRepository, createInboxRepository } from '@life-os/database';
import { createAuthService } from './auth';
import { createInboxService } from './index';

it('authenticates encrypted snapshots, restores real owner-only data and invalidates old sessions', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'life-os-offline-backup-'));
  const migrationsFolder = fileURLToPath(new URL('../../database/migrations', import.meta.url));
  const key = randomBytes(32);
  const sourcePath = join(folder, 'source');
  const targetPath = join(folder, 'restored');
  const secret = 'isolated-backup-fixture-secret-at-least-32-bytes';
  const password = 'Isolated backup password 123!';
  const source = await createEmbeddedDatabase(sourcePath, { migrationsFolder });
  let restored: Awaited<ReturnType<typeof createEmbeddedDatabase>> | undefined;
  try {
    const auth = createAuthService(createAuthRepository(source.db), secret);
    for (const name of ['a', 'b'])
      await auth.createAccount({
        email: name + '@backup.test',
        displayName: name,
        timeZone: 'UTC',
        password,
      });
    const login = await auth.login({ email: 'a@backup.test', password });
    const inbox = createInboxService(auth, createInboxRepository(source.db));
    await inbox.capture(login.token, {
      requestId: randomUUID(),
      body: 'Private offline recovery record',
    });
    await source.db.execute(sql`update auth_rate_limit set attempts=100`);
    const encrypted = await createEncryptedEmbeddedBackup(source, key, migrationsFolder);
    expect(encrypted.includes(Buffer.from('Private offline recovery record'))).toBe(false);
    expect(encrypted.includes(Buffer.from('a@backup.test'))).toBe(false);
    await expect(
      restoreEncryptedEmbeddedBackup(encrypted, randomBytes(32), targetPath, migrationsFolder),
    ).rejects.toThrow('authentication tag');
    const tampered = Buffer.from(encrypted);
    tampered[tampered.length - 1] = tampered[tampered.length - 1]! ^ 1;
    await expect(
      restoreEncryptedEmbeddedBackup(tampered, key, targetPath, migrationsFolder),
    ).rejects.toThrow('authentication tag');
    expect(await readdir(folder)).toEqual(expect.not.arrayContaining(['restored']));
    await expect(
      restoreEncryptedEmbeddedBackup(encrypted, key, sourcePath, migrationsFolder),
    ).rejects.toThrow('empty database');
    expect(await auth.verify(login.token)).not.toBeNull();

    const incompatible = join(folder, 'incompatible-migrations');
    await cp(migrationsFolder, incompatible, { recursive: true });
    await appendFile(
      join(incompatible, '0000_foundation.sql'),
      '\n-- isolated different schema fingerprint\n',
    );
    await expect(
      restoreEncryptedEmbeddedBackup(encrypted, key, targetPath, incompatible),
    ).rejects.toThrow('migrations do not match');
    await restoreEncryptedEmbeddedBackup(encrypted, key, targetPath, migrationsFolder);
    restored = await createEmbeddedDatabase(targetPath, { migrationsFolder });
    const recoveredAuth = createAuthService(createAuthRepository(restored.db), secret);
    expect(await recoveredAuth.verify(login.token)).toBeNull();
    const a = await recoveredAuth.login({ email: 'a@backup.test', password });
    const b = await recoveredAuth.login({ email: 'b@backup.test', password });
    const recoveredInbox = createInboxService(recoveredAuth, createInboxRepository(restored.db));
    expect((await recoveredInbox.list(a.token)).items.map((item) => item.body)).toEqual([
      'Private offline recovery record',
    ]);
    expect((await recoveredInbox.list(b.token)).items).toEqual([]);
    // Live source is retained and remains usable throughout the recovery rehearsal.
    expect((await inbox.list(login.token)).items).toHaveLength(1);
  } finally {
    key.fill(0);
    await source.close();
    await restored?.close();
    await rm(folder, { recursive: true, force: true });
  }
}, 30000);
