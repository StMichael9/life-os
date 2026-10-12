import { lstat, open, unlink } from 'node:fs/promises';

/** Trusted backend startup only. Never resets data or guesses that a live PID is stale. */
export async function recoverInterruptedLease(lockPath: string) {
  const guardPath = lockPath + '.recovery';
  const guard = await open(guardPath, 'wx', 0o600);
  const guardIdentity = await guard.stat();
  try {
    const identity = await lstat(lockPath);
    if (
      !identity.isFile() ||
      identity.isSymbolicLink() ||
      identity.size > 256 ||
      (process.platform !== 'win32' &&
        (identity.uid !== process.getuid?.() || (identity.mode & 0o077) !== 0))
    )
      throw new Error('The interrupted lease requires operator attention.');
    const file = await open(lockPath, 'r');
    let pid: unknown;
    try {
      const opened = await file.stat();
      if (opened.ino !== identity.ino || opened.dev !== identity.dev)
        throw new Error('The database lease changed during recovery.');
      pid = (JSON.parse(await file.readFile('utf8')) as { pid?: unknown }).pid;
    } finally {
      await file.close();
    }
    if (typeof pid !== 'number' || !Number.isSafeInteger(pid) || pid < 1)
      throw new Error('The interrupted lease has no verifiable process identity.');
    try {
      process.kill(pid, 0);
      throw new Error('The local database process is still running.');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
    }
    const current = await lstat(lockPath);
    if (current.ino !== identity.ino || current.dev !== identity.dev)
      throw new Error('The database lease changed during recovery.');
    // The recovery guard serializes recoverers. Normal exclusive open cannot succeed
    // until this old lease is gone, so no replacement writer's lease is deleted.
    await unlink(lockPath);
  } finally {
    await guard.close();
    const current = await lstat(guardPath);
    if (current.ino === guardIdentity.ino && current.dev === guardIdentity.dev)
      await unlink(guardPath);
  }
}
