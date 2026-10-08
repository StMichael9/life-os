import { Client } from 'pg';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { fileURLToPath } from 'node:url';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { lstat, readFile, mkdir, open, link, unlink, mkdtemp, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { productionDatabaseUrl } from './production-config';

export class OperationsError extends Error {}
export const operationsTables = [
  'app_user',
  'auth_credential',
  'auth_session',
  'auth_rate_limit',
  'category',
  'vision',
  'season',
  'season_allocation',
  'goal',
  'milestone',
  'project',
  'task',
  'inbox_item',
  'daily_plan',
  'daily_big_three',
  'schedule_block',
  'focus_session',
  'focus_interval',
  'routine',
  'routine_completion',
  'vault_item',
  'execution_receipt',
] as const;
export const migrationFolder = fileURLToPath(new URL('../migrations', import.meta.url));
export async function withOperationsClient<T>(
  raw: string,
  allowLocal: boolean,
  run: (client: Client) => Promise<T>,
) {
  productionDatabaseUrl(raw, allowLocal);
  const client = new Client({ connectionString: raw, connectionTimeoutMillis: 10000 });
  try {
    await client.connect();
    return await run(client);
  } finally {
    await client.end();
  }
}
export async function verifyMigrationCheckpoint(client: Client) {
  const expected = readMigrationFiles({ migrationsFolder: migrationFolder });
  if (expected.length !== 7)
    throw new OperationsError('Review operations tooling for the new migration checkpoint.');
  const rows = (
    await client.query<{ hash: string; created_at: string }>(
      'select hash,created_at from drizzle.__drizzle_migrations order by created_at,id',
    )
  ).rows;
  if (
    rows.length !== expected.length ||
    rows.some(
      (r, i) => r.hash !== expected[i]!.hash || Number(r.created_at) !== expected[i]!.folderMillis,
    )
  )
    throw new OperationsError('Migration ledger differs from committed migrations 0000–0006.');
  const tables = (
    await client.query<{ tablename: string }>(
      "select tablename from pg_tables where schemaname='public' order by tablename",
    )
  ).rows.map((r) => r.tablename);
  if (JSON.stringify(tables) !== JSON.stringify([...operationsTables].sort()))
    throw new OperationsError('Application tables differ from the Phase 1 checkpoint.');
  return { migrations: rows.length, tables: tables.length };
}
async function denyAdministration(client: Client) {
  const result = await client.query<{ unsafe: boolean }>(`
    select session_user <> current_user or r.rolsuper or r.rolcreatedb or r.rolcreaterole or r.rolreplication or r.rolbypassrls
      or has_database_privilege(current_user,current_database(),'CREATE')
      or has_database_privilege(current_user,current_database(),'TEMP')
      or exists(select 1 from pg_namespace n where n.nspname !~ '^pg_' and n.nspname <> 'information_schema'
        and has_schema_privilege(current_user,n.oid,'CREATE'))
      or exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname in ('public','drizzle') and c.relowner=r.oid)
      or exists(select 1 from pg_roles other where other.oid<>r.oid and pg_has_role(current_user,other.oid,'MEMBER')
        and (other.rolsuper or other.rolcreatedb or other.rolcreaterole or other.rolbypassrls
          or has_schema_privilege(other.oid,'public','CREATE')))
      or exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname !~ '^pg_' and n.nspname <> 'information_schema' and p.prosecdef
          and has_schema_privilege(current_user,n.oid,'USAGE') and has_function_privilege(current_user,p.oid,'EXECUTE'))
    as unsafe from pg_roles r where r.rolname=current_user`);
  if (result.rows[0]?.unsafe !== false)
    throw new OperationsError(
      'The connection has privileged ownership, memberships, DDL or administrator capabilities.',
    );
}
const insertUpdate = new Set([
  'auth_session',
  'auth_rate_limit',
  'season',
  'goal',
  'milestone',
  'project',
  'task',
  'daily_plan',
  'daily_big_three',
  'schedule_block',
  'focus_session',
  'focus_interval',
  'routine',
  'routine_completion',
  'vault_item',
]);
const insertOnly = new Set([
  'category',
  'vision',
  'inbox_item',
  'season_allocation',
  'execution_receipt',
]);
const deleteAllowed = new Set([
  'auth_rate_limit',
  'season_allocation',
  'daily_big_three',
  'schedule_block',
  'routine_completion',
]);
export async function verifyRuntimePermissions(client: Client) {
  await denyAdministration(client);
  for (const table of operationsTables) {
    for (const privilege of [
      'SELECT',
      'INSERT',
      'UPDATE',
      'DELETE',
      'TRUNCATE',
      'REFERENCES',
      'TRIGGER',
    ]) {
      const expected =
        privilege === 'SELECT' ||
        (privilege === 'INSERT' && (insertUpdate.has(table) || insertOnly.has(table))) ||
        (privilege === 'UPDATE' && insertUpdate.has(table)) ||
        (privilege === 'DELETE' && deleteAllowed.has(table));
      const { rows } = await client.query<{ allowed: boolean }>(
        'select has_table_privilege(current_user,$1,$2) as allowed',
        ['public.' + table, privilege],
      );
      if (rows[0]?.allowed !== expected)
        throw new OperationsError('Runtime grant mismatch: ' + table + ' ' + privilege + '.');
    }
  }
  for (const table of ['app_user', 'inbox_item', 'auth_credential']) {
    const { rows } = await client.query<{ column_name: string; allowed: boolean }>(
      `
      select column_name,has_column_privilege(current_user,table_schema||'.'||table_name,column_name,'UPDATE') as allowed
      from information_schema.columns where table_schema='public' and table_name=$1`,
      [table],
    );
    for (const r of rows)
      if (
        r.allowed !==
        ((table === 'app_user' && r.column_name === 'id') ||
          (table === 'inbox_item' && r.column_name === 'processed_at'))
      )
        throw new OperationsError('Runtime column grant mismatch.');
  }
  const access = (
    await client.query<{ allowed: boolean }>(
      "select has_schema_privilege(current_user,'drizzle','USAGE') as allowed",
    )
  ).rows[0];
  if (access?.allowed) throw new OperationsError('Runtime must not access migration metadata.');
  return { runtimePermissions: 'verified' as const };
}
export async function verifyBackupPermissions(client: Client) {
  await denyAdministration(client);
  for (const table of operationsTables) {
    const { rows } = await client.query<{ readable: boolean; writable: boolean }>(
      `
      select has_table_privilege(current_user,$1,'SELECT') as readable,
        has_table_privilege(current_user,$1,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        or has_any_column_privilege(current_user,$1,'INSERT,UPDATE,REFERENCES') as writable`,
      ['public.' + table],
    );
    if (!rows[0]?.readable || rows[0].writable)
      throw new OperationsError('Backup role must be read-only for every Phase 1 table.');
  }
}
async function privatePath(path: string, directory: boolean) {
  const info = await lstat(path);
  if (
    typeof process.getuid !== 'function' ||
    info.uid !== process.getuid() ||
    info.isSymbolicLink() ||
    (directory ? !info.isDirectory() : !info.isFile()) ||
    info.mode & 0o077
  )
    throw new OperationsError(
      'Operations files require a private owner-only directory/file on a POSIX filesystem.',
    );
  return info;
}
async function backupKey(path: string) {
  const info = await privatePath(path, false);
  if (info.size !== 32)
    throw new OperationsError('The backup key must be exactly 32 random binary bytes.');
  return readFile(path);
}
function pgEnvironment(url: URL, allowLocal: boolean) {
  return {
    NODE_ENV: 'production' as const,
    PATH: process.env.PATH ?? '',
    ...(process.env.HOME ? { HOME: process.env.HOME } : {}),
    PGHOST: url.hostname,
    PGPORT: url.port || '5432',
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
    PGSSLMODE:
      allowLocal && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
        ? 'disable'
        : 'verify-full',
    ...(!allowLocal || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      ? { PGSSLROOTCERT: 'system' }
      : {}),
    PGCONNECT_TIMEOUT: '10',
    PGAPPNAME: 'life-os-operations',
  };
}
function pgChild(binary: string, args: string[], env: NodeJS.ProcessEnv, input = false) {
  const child = spawn(binary, args, { env, stdio: ['pipe', 'pipe', 'pipe'] });
  if (!input) child.stdin.end();
  // Never print pg stderr: a driver/tool error can contain connection or private SQL context.
  child.stderr.resume();
  const done = new Promise<void>((accept, reject) => {
    child.once('error', () =>
      reject(
        new OperationsError('PostgreSQL client could not start. Install matching client tools.'),
      ),
    );
    child.once('close', (code) =>
      code === 0
        ? accept()
        : reject(new OperationsError('PostgreSQL client failed; diagnostic output was withheld.')),
    );
  });
  void done.catch(() => {});
  return { child, done };
}
async function pgVersion(binary: string, major: number, env: NodeJS.ProcessEnv) {
  const { child, done } = pgChild(binary, ['--version'], env);
  let version = '';
  for await (const chunk of child.stdout) version += String(chunk);
  await done;
  if (Number(version.match(/PostgreSQL\)\s+(\d+)/)?.[1]) !== major)
    throw new OperationsError('Use PostgreSQL client tools matching the server major version.');
}
const magic = Buffer.from('LIFEOSB1');
export async function createEncryptedBackup(options: {
  url: string;
  keyFile: string;
  file: string;
  allowLocal?: boolean;
  pgDump?: string;
}) {
  const allowLocal = options.allowLocal ?? false;
  const url = productionDatabaseUrl(options.url, allowLocal);
  const key = await backupKey(options.keyFile);
  const file = resolve(options.file),
    directory = dirname(file);
  if (!file.endsWith('.lifeos.enc'))
    throw new OperationsError('Use a .lifeos.enc backup filename.');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await privatePath(directory, true);
  const major = await withOperationsClient(options.url, allowLocal, async (c) => {
    await verifyBackupPermissions(c);
    await verifyMigrationCheckpoint(c);
    return Math.floor(
      Number(
        (
          await c.query<{ version: string }>(
            "select current_setting('server_version_num') as version",
          )
        ).rows[0]!.version,
      ) / 10000,
    );
  });
  const env = pgEnvironment(url, allowLocal),
    binary = options.pgDump ?? 'pg_dump';
  await pgVersion(binary, major, env);
  const header = Buffer.alloc(24);
  magic.copy(header);
  header.writeUInt32BE(major, 8);
  randomBytes(12).copy(header, 12);
  const cipher = createCipheriv('aes-256-gcm', key, header.subarray(12));
  cipher.setAAD(header);
  const temporary = join(directory, '.backup-' + randomBytes(16).toString('hex'));
  const handle = await open(temporary, 'wx', 0o600);
  const { child, done } = pgChild(
    binary,
    [
      '--format=custom',
      '--no-owner',
      '--no-privileges',
      '--schema=public',
      '--schema=drizzle',
      '--exclude-table-data=public.auth_session',
      '--exclude-table-data=public.auth_rate_limit',
    ],
    env,
  );
  try {
    await handle.write(header);
    await Promise.all([
      pipeline(
        child.stdout,
        cipher,
        createWriteStream('', { fd: handle.fd, autoClose: false, start: 24 }),
      ),
      done,
    ]);
    const info = await handle.stat();
    await handle.write(cipher.getAuthTag(), 0, 16, info.size);
    await handle.sync();
    await handle.close();
    // Hard-link publication refuses to replace any existing archive, even under a race.
    await link(temporary, file);
    return { encrypted: true, serverMajor: major, sessionsIncluded: false };
  } finally {
    key.fill(0);
    child.kill();
    await handle.close().catch(() => {});
    await unlink(temporary).catch(() => {});
  }
}
export async function restoreEncryptedBackup(options: {
  url: string;
  keyFile: string;
  file: string;
  confirm: string;
  allowLocal?: boolean;
  pgRestore?: string;
}) {
  const allowLocal = options.allowLocal ?? false;
  const url = productionDatabaseUrl(options.url, allowLocal),
    name = decodeURIComponent(url.pathname.slice(1));
  if (!name.endsWith('_restore') || options.confirm !== name)
    throw new OperationsError(
      'Restore requires an explicit empty database ending in _restore and matching confirmation.',
    );
  const key = await backupKey(options.keyFile),
    file = resolve(options.file);
  const info = await privatePath(file, false);
  await privatePath(dirname(file), true);
  if (info.size < 41) throw new OperationsError('Encrypted archive is incomplete.');
  const input = await open(file, 'r'),
    header = Buffer.alloc(24),
    tag = Buffer.alloc(16);
  await input.read(header, 0, 24, 0);
  await input.read(tag, 0, 16, info.size - 16);
  await input.close();
  if (!header.subarray(0, 8).equals(magic)) throw new OperationsError('Unknown backup format.');
  const major = header.readUInt32BE(8),
    env = pgEnvironment(url, allowLocal),
    binary = options.pgRestore ?? 'pg_restore';
  await pgVersion(binary, major, env);
  const temporary = await mkdtemp(join(dirname(file), '.restore-'));
  const dump = join(temporary, 'authenticated.dump');
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, header.subarray(12));
    decipher.setAAD(header);
    decipher.setAuthTag(tag);
    // Authenticate the entire archive before executing any of its SQL.
    await pipeline(
      createReadStream(file, { start: 24, end: info.size - 17 }),
      decipher,
      createWriteStream(dump, { flags: 'wx', mode: 0o600 }),
    );
    return await withOperationsClient(options.url, allowLocal, async (client) => {
      const actual = Math.floor(
        Number(
          (
            await client.query<{ version: string }>(
              "select current_setting('server_version_num') as version",
            )
          ).rows[0]!.version,
        ) / 10000,
      );
      if (major !== actual)
        throw new OperationsError('Restore rehearsal requires the same PostgreSQL major version.');
      const { rows } = await client.query<{
        n: number;
      }>(`select (
        (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
          where n.nspname !~ '^pg_' and n.nspname<>'information_schema') +
        (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
          where n.nspname !~ '^pg_' and n.nspname<>'information_schema') +
        (select count(*) from pg_type t join pg_namespace n on n.oid=t.typnamespace
          where n.nspname !~ '^pg_' and n.nspname<>'information_schema') +
        (select count(*) from pg_namespace where nspname !~ '^pg_' and nspname not in ('public','information_schema'))
        )::int as n`);
      if (rows[0]?.n !== 0)
        throw new OperationsError('Restore target is not empty. No records were replaced.');
      const { child, done } = pgChild(
        binary,
        [
          '--no-owner',
          '--no-privileges',
          '--clean',
          '--if-exists',
          '--single-transaction',
          '--exit-on-error',
          '--dbname=' + name,
        ],
        env,
        true,
      );
      try {
        await Promise.all([pipeline(createReadStream(dump), child.stdin), done]);
      } finally {
        child.kill();
      }
      const checkpoint = await verifyMigrationCheckpoint(client);
      const counts = (
        await client.query<{ sessions: number; limits: number }>(`select
        (select count(*)::int from auth_session) as sessions,(select count(*)::int from auth_rate_limit) as limits`)
      ).rows[0]!;
      if (counts.sessions || counts.limits)
        throw new OperationsError('Restored authentication state must require fresh login.');
      return { ...checkpoint, sessionsRestored: 0, rateLimitsRestored: 0 };
    });
  } finally {
    key.fill(0);
    await rm(temporary, { recursive: true, force: true });
  }
}
