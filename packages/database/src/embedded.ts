import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { isAbsolute, dirname, resolve } from 'node:path';
import { mkdir, lstat, open, unlink, chmod, type FileHandle } from 'node:fs/promises';
import * as schema from './schema';

/** Private backend only. No PostgreSQL listener, renderer storage or remote connection. */
export async function createEmbeddedDatabase(
  directory: string,
  options: { migrationsFolder: string },
) {
  if (!isAbsolute(options.migrationsFolder))
    throw new Error('Bundled migrations require an absolute directory.');
  if (!isAbsolute(directory))
    throw new Error('An absolute private database directory is required.');
  const path = resolve(directory),
    parent = dirname(path);
  await mkdir(parent, { recursive: true, mode: 0o700 });
  await mkdir(path, { recursive: true, mode: 0o700 });
  for (const folder of [parent, path]) {
    const info = await lstat(folder);
    if (!info.isDirectory() || info.isSymbolicLink())
      throw new Error('The database requires a private directory, not a symbolic link.');
    // Native Windows ACL verification is the main-process bootstrap's responsibility.
    if (
      process.platform !== 'win32' &&
      ((info.mode & 0o077) !== 0 || info.uid !== process.getuid?.())
    )
      throw new Error('The database directory must belong to the current user and be private.');
  }
  const lockPath = path + '.life-os.lock';
  let lock: FileHandle;
  try {
    lock = await open(lockPath, 'wx', 0o600);
  } catch {
    throw new Error(
      'The local database is open or needs guarded recovery after an interrupted shutdown.',
    );
  }
  const identity = await lock.stat();
  await lock.writeFile(JSON.stringify({ pid: process.pid }));
  await lock.sync();
  let engine: PGlite | undefined;
  async function release() {
    await lock.close();
    const current = await lstat(lockPath);
    if (current.ino === identity.ino && current.dev === identity.dev) await unlink(lockPath);
  }
  try {
    engine = new PGlite(path);
    await engine.waitReady;
    // PGlite initializes this directory's mode; keep OS protection after initialization.
    if (process.platform !== 'win32') await chmod(path, 0o700);
    const db = drizzle(engine, { schema });
    const migrationsFolder = options.migrationsFolder;
    await migrate(db, { migrationsFolder });
    const expected = readMigrationFiles({ migrationsFolder });
    const actual = (
      await engine.query<{ hash: string; created_at: string }>(
        'select hash,created_at from drizzle.__drizzle_migrations order by created_at,id',
      )
    ).rows;
    if (
      actual.length !== expected.length ||
      actual.some(
        (row, index) =>
          row.hash !== expected[index]!.hash ||
          Number(row.created_at) !== expected[index]!.folderMillis,
      )
    )
      throw new Error('The local migration ledger differs from the bundled application.');
    let closing: Promise<void> | undefined;
    return {
      db,
      close() {
        closing ??= (async () => {
          // Retain the lease if engine closure fails. Never start another writer on uncertainty.
          await engine!.close();
          if (process.platform !== 'win32') await chmod(path, 0o700);
          await release();
        })();
        return closing;
      },
    };
  } catch (error) {
    await engine?.close();
    if (process.platform !== 'win32') await chmod(path, 0o700);
    await release();
    throw error;
  }
}
