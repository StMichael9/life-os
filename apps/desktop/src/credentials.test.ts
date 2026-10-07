import { mkdtemp, readFile, writeFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import {
  createCredentialStore,
  encryptionAvailable,
  validSessionCookie,
  type Encryption,
  type SessionCookie,
} from './credentials';

const directories: string[] = [];
const clock = () => new Date('2026-10-07T12:00:00Z').getTime();
const origin = 'https://life.example.test';
const cookie: SessionCookie = {
  name: '__Host-life_os_session',
  value: 'a'.repeat(43),
  domain: 'life.example.test',
  hostOnly: true,
  path: '/',
  secure: true,
  httpOnly: true,
  sameSite: 'lax',
  expirationDate: clock() / 1000 + 86400,
};
const key = randomBytes(32);
// Test adapter, not evidence of an OS safeStorage implementation.
const encryption: Encryption = {
  isEncryptionAvailable: () => true,
  encryptString(value) {
    const iv = randomBytes(12),
      cipher = createCipheriv('aes-256-gcm', key, iv);
    const bytes = Buffer.concat([cipher.update(value), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), bytes]);
  },
  decryptString(bytes) {
    const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
    decipher.setAuthTag(bytes.subarray(12, 28));
    return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString();
  },
};
async function create(adapter: Encryption = encryption, platform: NodeJS.Platform = 'win32') {
  const directory = await mkdtemp(join(tmpdir(), 'life-os-credentials-'));
  directories.push(directory);
  return { directory, store: createCredentialStore(directory, origin, adapter, platform, clock) };
}
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});
it('persists ciphertext only, restores valid cookies, rotates and deletes on logout', async () => {
  const { directory, store } = await create();
  await store.save(cookie);
  expect((await readFile(join(directory, 'session.bin'))).includes(cookie.value)).toBe(false);
  expect((await stat(join(directory, 'session.bin'))).mode & 0o777).toBe(0o600);
  expect(await store.load()).toEqual(cookie);
  await store.save({ ...cookie, value: 'b'.repeat(43) });
  expect((await store.load())!.value).toBe('b'.repeat(43));
  await store.save(undefined);
  expect(await store.load()).toBeNull();
});
it('has no plaintext fallback when encryption is unavailable or Linux uses basic_text', async () => {
  const unavailable = { ...encryption, isEncryptionAvailable: () => false };
  const { store, directory } = await create(unavailable);
  await store.save(cookie);
  await expect(readFile(join(directory, 'session.bin'))).rejects.toThrow();
  expect(
    encryptionAvailable({ ...encryption, getSelectedStorageBackend: () => 'basic_text' }, 'linux'),
  ).toBe(false);
  const basic = await create(
    { ...encryption, getSelectedStorageBackend: () => 'basic_text' },
    'linux',
  );
  await basic.store.save(cookie);
  expect(await basic.store.load()).toBeNull();
});
it('rejects foreign, domain-scoped, insecure, non-HttpOnly and expired cookies', () => {
  for (const invalid of [
    { ...cookie, domain: '.life.example.test' },
    { ...cookie, domain: 'evil.test' },
    { ...cookie, httpOnly: false },
    { ...cookie, secure: false },
    { ...cookie, hostOnly: false },
    { ...cookie, expirationDate: 0 },
    { ...cookie, name: 'other' },
    { ...cookie, path: '/inbox' },
    { ...cookie, value: 'malformed' },
    { ...cookie, sameSite: 'none' },
  ])
    expect(validSessionCookie(invalid, origin, clock())).toBe(false);
  expect(validSessionCookie(cookie, 'http://localhost', clock())).toBe(false);
});
it('deletes corrupt ciphertext and rejects credentials from another origin', async () => {
  const { directory, store } = await create();
  await writeFile(join(directory, 'session.bin'), 'not encrypted');
  expect(await store.load()).toBeNull();
  await writeFile(
    join(directory, 'session.bin'),
    encryption.encryptString(JSON.stringify({ version: 1, origin: 'https://evil.test', cookie })),
  );
  expect(await store.load()).toBeNull();
});
