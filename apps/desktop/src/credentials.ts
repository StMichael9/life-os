import { constants } from 'node:fs';
import { mkdir, open, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

export interface SessionCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  hostOnly: boolean;
  expirationDate?: number;
  sameSite?: string;
}
export interface Encryption {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
  getSelectedStorageBackend?(): string;
}
export function encryptionAvailable(encryption: Encryption, platform: NodeJS.Platform) {
  return (
    encryption.isEncryptionAvailable() &&
    !(platform === 'linux' && encryption.getSelectedStorageBackend?.() === 'basic_text')
  );
}
export function validSessionCookie(
  value: unknown,
  origin: string,
  now = Date.now(),
): value is SessionCookie {
  if (!value || typeof value !== 'object') return false;
  const cookie = value as Partial<SessionCookie>;
  const url = new URL(origin);
  return (
    url.protocol === 'https:' &&
    cookie.name === '__Host-life_os_session' &&
    typeof cookie.value === 'string' &&
    /^[A-Za-z0-9_-]{43}$/.test(cookie.value) &&
    cookie.domain === url.hostname &&
    cookie.hostOnly === true &&
    cookie.path === '/' &&
    cookie.secure === true &&
    cookie.httpOnly === true &&
    cookie.sameSite === 'lax' &&
    typeof cookie.expirationDate === 'number' &&
    Number.isFinite(cookie.expirationDate) &&
    cookie.expirationDate * 1000 > now &&
    cookie.expirationDate * 1000 <= now + 31 * 86_400_000
  );
}
/** Main-process-only storage. Never write a plaintext credential, including fallback. */
export function createCredentialStore(
  directory: string,
  origin: string,
  encryption: Encryption,
  platform: NodeJS.Platform,
  clock: () => number = Date.now,
) {
  const file = join(directory, 'session.bin');
  const temporary = () => join(directory, `session-${randomBytes(8).toString('hex')}.tmp`);
  async function clear() {
    await unlink(file).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
  return {
    async load(): Promise<SessionCookie | null> {
      if (!encryptionAvailable(encryption, platform) || new URL(origin).protocol !== 'https:') {
        await clear();
        return null;
      }
      try {
        const handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
        let bytes: Buffer;
        try {
          const info = await handle.stat();
          if (!info.isFile() || info.size > 16_384) throw new Error('Invalid credential file');
          bytes = await handle.readFile();
        } finally {
          await handle.close();
        }
        const saved: unknown = JSON.parse(encryption.decryptString(bytes));
        if (
          !saved ||
          typeof saved !== 'object' ||
          !('origin' in saved) ||
          saved.origin !== origin ||
          !('version' in saved) ||
          saved.version !== 1 ||
          !('cookie' in saved) ||
          !validSessionCookie(saved.cookie, origin, clock())
        )
          throw new Error('Invalid credential');
        return saved.cookie;
      } catch {
        await clear();
        return null;
      }
    },
    async save(cookie: SessionCookie | undefined) {
      if (
        !cookie ||
        !validSessionCookie(cookie, origin, clock()) ||
        !encryptionAvailable(encryption, platform)
      ) {
        await clear();
        return;
      }
      const ciphertext = encryption.encryptString(JSON.stringify({ version: 1, origin, cookie }));
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const temp = temporary();
      try {
        const handle = await open(
          temp,
          constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
          0o600,
        );
        try {
          await handle.writeFile(ciphertext);
          await handle.sync();
        } finally {
          await handle.close();
        }
        await rename(temp, file);
      } finally {
        await unlink(temp).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== 'ENOENT') throw error;
        });
      }
    },
    clear,
  };
}
