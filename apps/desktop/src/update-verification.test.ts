import { it, expect } from 'vitest';
import { generateKeyPairSync, sign, createHash } from 'node:crypto';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newerVersion, verifyRelease, verifyInstaller } from './update-verification';
const keys = generateKeyPairSync('ed25519');
const publicKey = keys.publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
const bytes = Buffer.from('synthetic installer bytes');
const valid = {
  appId: 'com.lifeos.desktop',
  version: '0.2.1',
  filename: 'Life-OS-Setup-0.2.1.exe',
  size: bytes.length,
  sha512: createHash('sha512').update(bytes).digest('base64'),
  platform: 'win32',
  arch: 'x64',
  commit: 'a'.repeat(40),
};
function envelope(data: unknown) {
  const payload = Buffer.from(JSON.stringify(data));
  return {
    payload: payload.toString('base64'),
    signature: sign(null, payload, keys.privateKey).toString('base64'),
  };
}
it('authenticates the release identity and rejects unsigned, forged and replayed updates', () => {
  expect(verifyRelease(envelope(valid), publicKey, '0.2.0')).toEqual(valid);
  expect(() => verifyRelease(valid, publicKey, '0.2.0')).toThrow();
  const forged = envelope(valid);
  forged.payload = Buffer.from(
    JSON.stringify({ ...valid, sha512: 'x'.repeat(86) + '==' }),
  ).toString('base64');
  expect(() => verifyRelease(forged, publicKey, '0.2.0')).toThrow();
  expect(() => verifyRelease(envelope(valid), publicKey, '0.2.1')).toThrow();
  expect(() => verifyRelease(envelope(valid), publicKey, '0.3.0')).toThrow();
});
it('rejects signed but wrong-application/platform/path/size release manifests', () => {
  for (const change of [
    { appId: 'other' },
    { arch: 'arm64' },
    { platform: 'linux' },
    { filename: '../installer.exe' },
    { size: 1024 ** 3 },
  ])
    expect(() => verifyRelease(envelope({ ...valid, ...change }), publicKey, '0.2.0')).toThrow();
  expect(newerVersion('0.2.10', '0.2.9')).toBe(true);
  expect(newerVersion('0.2.1-beta', '0.2.0')).toBe(false);
});
it('verifies actual downloaded bytes and rejects same-size tampering and truncation', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'life-os-signature-test-')),
    file = join(folder, 'installer.exe');
  await writeFile(file, bytes);
  await expect(verifyInstaller(file, valid)).resolves.toBeUndefined();
  await writeFile(file, Buffer.alloc(bytes.length, 1));
  await expect(verifyInstaller(file, valid)).rejects.toThrow('checksum');
  await writeFile(file, 'short');
  await expect(verifyInstaller(file, valid)).rejects.toThrow('size');
});
