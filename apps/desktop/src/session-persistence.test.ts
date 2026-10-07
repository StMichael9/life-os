import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { Session } from 'electron';
import { afterEach, expect, it, vi } from 'vitest';
import type { SessionCookie } from './credentials';

// Use authenticated encryption in the mock as well; native OS encryption is unverified.
vi.mock('electron', async () => {
  const { randomBytes, createCipheriv, createDecipheriv } = await import('node:crypto');
  const key = randomBytes(32);
  return {
    safeStorage: {
      isEncryptionAvailable: () => true,
      getSelectedStorageBackend: () => 'gnome_libsecret',
      encryptString(value: string) {
        const iv = randomBytes(12),
          cipher = createCipheriv('aes-256-gcm', key, iv);
        const payload = Buffer.concat([cipher.update(value), cipher.final()]);
        return Buffer.concat([iv, cipher.getAuthTag(), payload]);
      },
      decryptString(bytes: Buffer) {
        const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
        decipher.setAuthTag(bytes.subarray(12, 28));
        return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString();
      },
    },
  };
});
import { persistSession } from './session-persistence';
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});
it('persists current cookie events, restores on startup, and clears logout without renderer IPC', async () => {
  const origin = 'https://life.example.test';
  const directory = await mkdtemp(join(tmpdir(), 'life-os-session-'));
  directories.push(directory);
  const events = new EventEmitter();
  let current: SessionCookie[] = [];
  const set = vi.fn(async (details: { value: string }) => {
    current = [{ ...cookie, value: details.value }];
  });
  const cookie: SessionCookie = {
    name: '__Host-life_os_session',
    value: 'a'.repeat(43),
    domain: 'life.example.test',
    hostOnly: true,
    path: '/',
    secure: true,
    httpOnly: true,
    sameSite: 'lax',
    expirationDate: Date.now() / 1000 + 86_400,
  };
  const cookies = { get: async () => current, set, on: events.on.bind(events) };
  const session = { cookies } as unknown as Session;
  const persistence = await persistSession(session, origin, directory);
  current = [cookie];
  events.emit('changed', {}, cookie, 'explicit', false);
  await persistence.flush();
  const file = join(
    directory,
    'credentials',
    createHash('sha256').update(origin).digest('hex'),
    'session.bin',
  );
  expect((await readFile(file)).includes(cookie.value)).toBe(false);
  // A later replacement must win even if event arguments mention the old token.
  current = [{ ...cookie, value: 'b'.repeat(43) }];
  events.emit('changed', {}, cookie, 'overwrite', true);
  await persistence.flush();
  current = [];
  await persistSession(session, origin, directory);
  expect(set).toHaveBeenCalledWith(
    expect.objectContaining({ value: 'b'.repeat(43), secure: true, httpOnly: true }),
  );
  current = [];
  events.emit('changed', {}, cookie, 'explicit', true);
  await persistence.flush();
  await expect(readFile(file)).rejects.toThrow();
});
