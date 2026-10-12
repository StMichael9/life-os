import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { isAbsolute, dirname, resolve } from 'node:path';
import { mkdir, lstat, open, unlink, chmod, readdir, type FileHandle } from 'node:fs/promises';
import * as schema from './schema';
import { recoverInterruptedLease } from './embedded-lease';

/** Private backend only. No PostgreSQL listener, renderer storage or remote connection. */
export async function createEmbeddedDatabase(
  directory: string,
  options: {
    migrationsFolder: string;
    recoverInterruptedShutdown?: boolean;
    initialSnapshot?: Blob;
  },
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
  if (options.initialSnapshot && (await readdir(path)).length !== 0)
    throw new Error('Snapshot restore requires an empty database directory.');
  const lockPath = path + '.life-os.lock';
  try {
    await lstat(lockPath + '.recovery');
    throw new Error('A guarded database recovery is already running or needs operator attention.');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  let lock: FileHandle;
  try {
    lock = await open(lockPath, 'wx', 0o600);
  } catch (error) {
    if (!options.recoverInterruptedShutdown || (error as NodeJS.ErrnoException).code !== 'EEXIST')
      throw new Error(
        'The local database is open or needs guarded recovery after an interrupted shutdown.',
        { cause: error },
      );
    await recoverInterruptedLease(lockPath);
    // Another guarded startup may win. Exclusive acquisition still protects all writers.
    lock = await open(lockPath, 'wx', 0o600);
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
    engine = new PGlite(
      path,
      options.initialSnapshot ? { loadDataDir: options.initialSnapshot } : {},
    );
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
      async snapshot() {
        if (closing) throw new Error('The local database is closing.');
        return engine!.runExclusive(async () => {
          // Never copy a partially committed transaction. All new queries wait on this barrier.
          if (engine!.isInTransaction()) throw new Error('Finish active writes before backup.');
          await engine!.syncToFs();
          return engine!.dumpDataDir('none');
        });
      },
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
