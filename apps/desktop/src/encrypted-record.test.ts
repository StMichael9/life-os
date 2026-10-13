import { expect, it } from 'vitest';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { encryptedRecord } from './encrypted-record';

it('keeps runtime secrets encrypted and preserves unreadable records instead of regenerating identity', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'life-os-identity-'));
  const file = join(directory, 'runtime.bin');
  const key = randomBytes(32);
  const encryption = {
    isEncryptionAvailable: () => true,
    encryptString(value: string) {
      const iv = randomBytes(12),
        cipher = createCipheriv('aes-256-gcm', key, iv);
      return Buffer.concat([iv, cipher.update(value), cipher.final(), cipher.getAuthTag()]);
    },
    decryptString(value: Buffer) {
      if (value.length < 28) throw new Error('Invalid fixture ciphertext');
      const cipher = createDecipheriv('aes-256-gcm', key, value.subarray(0, 12), {
        authTagLength: 16,
      });
      cipher.setAuthTag(value.subarray(-16));
      return Buffer.concat([cipher.update(value.subarray(12, -16)), cipher.final()]).toString();
    },
  };
  const valid = (value: unknown): value is { secret: string } =>
    !!value && typeof value === 'object' && 'secret' in value && typeof value.secret === 'string';
  try {
    const store = encryptedRecord(file, encryption, valid);
    expect(await store.load()).toBeNull();
    await store.save({ secret: 'synthetic identity secret' });
    expect((await readFile(file)).includes('synthetic identity secret')).toBe(false);
    expect(await store.load()).toEqual({ secret: 'synthetic identity secret' });
    await writeFile(file, 'corrupt record');
    await expect(store.load()).rejects.toThrow('Saved data was preserved');
    expect((await readFile(file)).toString()).toBe('corrupt record');
    const unavailable = encryptedRecord(
      file,
      { ...encryption, isEncryptionAvailable: () => false },
      valid,
    );
    await expect(unavailable.save({ secret: 'never plaintext' })).rejects.toThrow(
      'encryption is unavailable',
    );
    expect((await readFile(file)).toString()).toBe('corrupt record');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
