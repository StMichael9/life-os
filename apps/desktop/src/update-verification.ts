import { createHash, createPublicKey, verify } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';

export interface SignedRelease {
  version: string;
  filename: string;
  size: number;
  sha512: string;
  commit: string;
  appId: string;
  platform: string;
  arch: string;
}
export function newerVersion(candidate: string, current: string) {
  if (![candidate, current].every((v) => /^\d{1,8}\.\d{1,8}\.\d{1,8}$/.test(v))) return false;
  const a = candidate.split('.').map(Number),
    b = current.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i]! > b[i]!;
  return false;
}
export function verifyRelease(envelope: unknown, key: string, current: string): SignedRelease {
  if (!envelope || typeof envelope !== 'object') throw new Error('Unsigned update');
  const e = envelope as { payload?: unknown; signature?: unknown };
  if (typeof e.payload !== 'string' || typeof e.signature !== 'string' || e.payload.length > 8192)
    throw new Error('Invalid update signature');
  const payload = Buffer.from(e.payload, 'base64');
  if (
    !verify(
      null,
      payload,
      createPublicKey({ key: Buffer.from(key, 'base64'), format: 'der', type: 'spki' }),
      Buffer.from(e.signature, 'base64'),
    )
  )
    throw new Error('Update publisher could not be verified');
  const release = JSON.parse(payload.toString('utf8')) as SignedRelease;
  if (
    release.appId !== 'com.lifeos.desktop' ||
    release.platform !== 'win32' ||
    release.arch !== 'x64' ||
    !newerVersion(release.version, current) ||
    release.filename !== `Life-OS-Setup-${release.version}.exe` ||
    !Number.isSafeInteger(release.size) ||
    release.size < 1 ||
    release.size > 512 * 1024 * 1024 ||
    !/^[A-Za-z0-9+/]{86}==$/.test(release.sha512) ||
    !/^[a-f0-9]{40}$/.test(release.commit)
  )
    throw new Error('Invalid or outdated update');
  return release;
}
export async function verifyInstaller(file: string, release: SignedRelease) {
  const info = await stat(file);
  if (!info.isFile() || info.size !== release.size) throw new Error('Update size mismatch');
  const hash = createHash('sha512');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  if (hash.digest('base64') !== release.sha512) throw new Error('Update checksum mismatch');
}
