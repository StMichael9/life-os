import { it, expect } from 'vitest';
import { fork, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEmbeddedDatabase } from '@life-os/database/embedded';
import { createAuthRepository } from '@life-os/database';
import { createAuthService } from './auth';

it('refuses live/invalid leases and preserves committed data after a real killed backend', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'life-os-crash-'));
  const directory = join(folder, 'database');
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const migrationsFolder = join(root, 'packages/database/migrations');
  const open = (recoverInterruptedShutdown = false) =>
    createEmbeddedDatabase(directory, { migrationsFolder, recoverInterruptedShutdown });
  const secret = 'isolated-crash-fixture-secret-at-least-32-bytes';
  let database: Awaited<ReturnType<typeof open>> | undefined;
  let child: ChildProcess | undefined;
  try {
    database = await open();
    const auth = createAuthService(createAuthRepository(database.db), secret);
    const user = await auth.createAccount({
      email: 'crash@offline.test',
      displayName: 'Before crash',
      timeZone: 'UTC',
      password: 'Isolated crash password 123!',
    });
    await expect(open(true)).rejects.toThrow('still running');
    await database.close();
    database = undefined;
    child = fork(join(root, 'packages/database/src/embedded-child.fixture.ts'), [], {
      execArgv: [
        '--import',
        createRequire(join(root, 'packages/database/package.json')).resolve('tsx'),
      ],
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });
    await new Promise<void>((resolve, reject) => {
      child!.once('error', reject);
      child!.once('exit', () => reject(new Error('Crash fixture exited before committing.')));
      child!.once('message', (message: { type?: string }) =>
        message.type === 'ready' ? resolve() : reject(new Error('Unexpected fixture message.')),
      );
      child!.send({ directory, migrationsFolder, userId: user.id });
    });
    await expect(open(true)).rejects.toThrow('still running');
    await new Promise<void>((resolve) => {
      child!.once('exit', () => resolve());
      child!.kill('SIGKILL');
    });
    child = undefined;
    await expect(open()).rejects.toThrow('guarded recovery');
    // Two recovery attempts cannot open competing engines or delete the winner's lease.
    const attempts = await Promise.allSettled([open(true), open(true)]);
    expect(attempts.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    for (const result of attempts) if (result.status === 'fulfilled') database = result.value;
    const resumed = createAuthService(createAuthRepository(database!.db), secret);
    const login = await resumed.login({
      email: 'crash@offline.test',
      password: 'Isolated crash password 123!',
    });
    expect((await resumed.verify(login.token))?.profile.displayName).toBe('Committed before crash');
    await database!.close();
    database = undefined;
    await writeFile(directory + '.life-os.lock', '{"pid":"unverifiable"}', { mode: 0o600 });
    await expect(open(true)).rejects.toThrow('verifiable process');
    await rm(directory + '.life-os.lock');
    await writeFile(directory + '.life-os.lock.recovery', '', { mode: 0o600 });
    await expect(open(true)).rejects.toThrow('operator attention');
  } finally {
    if (child && child.exitCode === null)
      await new Promise<void>((resolve) => {
        child!.once('exit', () => resolve());
        child!.kill('SIGKILL');
      });
    await database?.close();
    await rm(folder, { recursive: true, force: true });
  }
}, 30000);
