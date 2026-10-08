import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, writeFile, readdir, rm, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { drizzle } from 'drizzle-orm/node-postgres';
import { createDatabase, createAuthRepository } from './index';
import { createAuthService } from '../../api/src/auth';
import {
  migrationFolder,
  withOperationsClient,
  verifyMigrationCheckpoint,
  verifyRuntimePermissions,
  createEncryptedBackup,
  restoreEncryptedBackup,
} from './operations';

const raw = process.env.LIFE_OS_RELEASE_TEST_DATABASE_URL,
  restoreRaw = process.env.LIFE_OS_RESTORE_TEST_DATABASE_URL;
describe.skipIf(!raw || !restoreRaw)(
  'isolated release roles and encrypted restore rehearsal',
  () => {
    let admin: Client,
      restoreAdmin: Client,
      roleLock: Client,
      directory: string,
      keyFile: string,
      file: string;
    const password = randomBytes(32).toString('hex');
    const accountPassword = 'Isolated restoration password 123!';
    const secret = randomBytes(48).toString('base64url');
    let accountId: string, originalToken: string;
    const connection = (role: string, base = raw!) => {
      const u = new URL(base);
      u.username = role;
      u.password = password;
      return u.toString();
    };
    async function emptyRestore() {
      await restoreAdmin.query(
        'drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public',
      );
      await restoreAdmin.query(
        await readFile(
          fileURLToPath(new URL('../../../ops/postgres/bootstrap.sql', import.meta.url)),
          'utf8',
        ),
      );
    }
    beforeAll(async () => {
      const source = new URL(raw!),
        target = new URL(restoreRaw!);
      if (
        !source.pathname.endsWith('_tests') ||
        !target.pathname.endsWith('_restore') ||
        !['localhost', '127.0.0.1'].includes(source.hostname) ||
        source.hostname !== target.hostname ||
        source.pathname === target.pathname
      )
        throw new Error(
          'This destructive rehearsal requires two isolated local fixture databases.',
        );
      admin = new Client({ connectionString: raw });
      restoreAdmin = new Client({ connectionString: restoreRaw });
      const lockUrl = new URL(raw!);
      lockUrl.pathname = '/postgres';
      roleLock = new Client({ connectionString: lockUrl.toString() });
      await roleLock.connect();
      await roleLock.query('select pg_advisory_lock(710062601)');
      await admin.connect();
      await restoreAdmin.connect();
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
        await admin.query(`alter role ${role} login password '${password}'`);
      await withOperationsClient(connection('life_os_migrator'), true, async (c) => {
        await migrate(drizzle(c), { migrationsFolder: migrationFolder });
        await c.query(
          await readFile(
            fileURLToPath(new URL('../../../ops/postgres/grants.sql', import.meta.url)),
            'utf8',
          ),
        );
      });
      await emptyRestore();
      directory = await mkdtemp(join(tmpdir(), 'life-os-release-'));
      keyFile = join(directory, 'key');
      file = join(directory, 'daily.lifeos.enc');
      await writeFile(keyFile, randomBytes(32), { mode: 0o600 });
      const operator = createDatabase(connection('life_os_operator'));
      try {
        accountId = (
          await createAuthService(createAuthRepository(operator.db), secret).createAccount({
            email: 'restore@fixture.test',
            password: accountPassword,
            displayName: 'Restore fixture',
            timeZone: 'America/Los_Angeles',
          })
        ).id;
      } finally {
        await operator.close();
      }
      await withOperationsClient(connection('life_os_operator'), true, async (c) => {
        await expect(
          c.query('create table public.forbidden_operator(id int)'),
        ).rejects.toMatchObject({ code: '42501' });
      });
      await withOperationsClient(connection('life_os_runtime'), true, async (c) => {
        await c.query('insert into inbox_item(user_id,body,request_id) values($1,$2,$3)', [
          accountId,
          'A private persisted capture for restoration',
          randomUUID(),
        ]);
        await c.query(
          "insert into auth_rate_limit(key,attempts,resets_at) values($1,1,now()+interval '1 hour')",
          ['fixture-only'],
        );
      });
      const runtime = createDatabase(connection('life_os_runtime'));
      try {
        originalToken = (
          await createAuthService(createAuthRepository(runtime.db), secret).login({
            email: 'restore@fixture.test',
            password: accountPassword,
          })
        ).token;
      } finally {
        await runtime.close();
      }
    }, 30000);
    afterAll(async () => {
      await admin?.end();
      await restoreAdmin?.end();
      await roleLock?.end();
      if (directory) await rm(directory, { recursive: true, force: true });
    });
    it('verifies the committed ledger and actual standalone runtime login permissions', async () => {
      expect(
        await withOperationsClient(connection('life_os_migrator'), true, verifyMigrationCheckpoint),
      ).toEqual({ migrations: 7, tables: 22 });
      expect(
        await withOperationsClient(connection('life_os_runtime'), true, verifyRuntimePermissions),
      ).toEqual({ runtimePermissions: 'verified' });
      await withOperationsClient(connection('life_os_runtime'), true, async (c) => {
        for (const query of [
          'create table public.forbidden_runtime(id int)',
          'delete from app_user',
          "insert into app_user(email,display_name,time_zone) values ('bad@fixture.test','Bad','UTC')",
          "update auth_credential set password_hash='changed'",
          "update inbox_item set body='changed'",
          'truncate inbox_item',
          'set role life_os_migrator',
        ])
          await expect(c.query(query)).rejects.toMatchObject({ code: '42501' });
      });
      await expect(withOperationsClient(raw!, true, verifyRuntimePermissions)).rejects.toThrow(
        /privileged/,
      );
    });
    it('encrypts a real custom dump, restores private records and strips live authentication state', async () => {
      const pgDump = process.env.PG_DUMP_BIN,
        pgRestore = process.env.PG_RESTORE_BIN;
      expect(
        await createEncryptedBackup({
          url: connection('life_os_backup'),
          keyFile,
          file,
          allowLocal: true,
          ...(pgDump ? { pgDump } : {}),
        }),
      ).toMatchObject({ encrypted: true, serverMajor: 17, sessionsIncluded: false });
      const encrypted = await readFile(file);
      expect(encrypted.includes(Buffer.from('A private persisted capture'))).toBe(false);
      expect(encrypted.subarray(0, 8).toString()).toBe('LIFEOSB1');
      const result = await restoreEncryptedBackup({
        url: connection('life_os_migrator', restoreRaw),
        keyFile,
        file,
        confirm: new URL(restoreRaw!).pathname.slice(1),
        allowLocal: true,
        ...(pgRestore ? { pgRestore } : {}),
      });
      expect(result).toEqual({
        migrations: 7,
        tables: 22,
        sessionsRestored: 0,
        rateLimitsRestored: 0,
      });
      const rows = await restoreAdmin.query<{ body: string }>('select body from inbox_item');
      expect(rows.rows[0]?.body).toBe('A private persisted capture for restoration');
      await restoreAdmin.query(
        await readFile(
          fileURLToPath(new URL('../../../ops/postgres/grants.sql', import.meta.url)),
          'utf8',
        ),
      );
      await withOperationsClient(
        connection('life_os_runtime', restoreRaw),
        true,
        verifyRuntimePermissions,
      );
      const restored = createDatabase(connection('life_os_runtime', restoreRaw));
      try {
        const auth = createAuthService(createAuthRepository(restored.db), secret);
        expect(await auth.verify(originalToken)).toBeNull();
        const login = await auth.login({
          email: 'restore@fixture.test',
          password: accountPassword,
        });
        expect((await auth.verify(login.token))?.userId).toBe(accountId);
      } finally {
        await restored.close();
      }
      await expect(
        createEncryptedBackup({
          url: connection('life_os_backup'),
          keyFile,
          file,
          allowLocal: true,
          ...(pgDump ? { pgDump } : {}),
        }),
      ).rejects.toMatchObject({ code: 'EEXIST' });
    }, 30000);
    it('refuses nonempty or mistaken targets, tampering, wrong keys and permissive key files', async () => {
      const pgRestore = process.env.PG_RESTORE_BIN;
      const options = {
        url: connection('life_os_migrator', restoreRaw),
        keyFile,
        file,
        confirm: new URL(restoreRaw!).pathname.slice(1),
        allowLocal: true,
        ...(pgRestore ? { pgRestore } : {}),
      };
      await expect(restoreEncryptedBackup(options)).rejects.toThrow(/not empty/);
      await expect(restoreEncryptedBackup({ ...options, confirm: 'wrong' })).rejects.toThrow(
        /confirmation/,
      );
      await expect(
        restoreEncryptedBackup({ ...options, url: connection('life_os_migrator') }),
      ).rejects.toThrow(/_restore/);
      await emptyRestore();
      await restoreAdmin.query(
        "create function public.keep_me() returns int language sql as 'select 1'",
      );
      await expect(restoreEncryptedBackup(options)).rejects.toThrow(/not empty/);
      await restoreAdmin.query('drop function public.keep_me()');
      const tampered = join(directory, 'tampered.lifeos.enc'),
        bytes = await readFile(file);
      bytes[30] = bytes[30]! ^ 1;
      await writeFile(tampered, bytes, { mode: 0o600 });
      await expect(restoreEncryptedBackup({ ...options, file: tampered })).rejects.toThrow();
      const wrong = join(directory, 'wrong-key');
      await writeFile(wrong, randomBytes(32), { mode: 0o600 });
      await expect(restoreEncryptedBackup({ ...options, keyFile: wrong })).rejects.toThrow();
      expect(
        (
          await restoreAdmin.query(
            "select count(*)::int as n from pg_tables where schemaname in ('public','drizzle')",
          )
        ).rows[0].n,
      ).toBe(0);
      await chmod(keyFile, 0o644);
      await expect(restoreEncryptedBackup(options)).rejects.toThrow(/owner-only/);
      await chmod(keyFile, 0o600);
      expect(
        (await readdir(directory)).some(
          (n) => n.startsWith('.restore-') || n.startsWith('.backup-'),
        ),
      ).toBe(false);
    }, 30000);
  },
);
