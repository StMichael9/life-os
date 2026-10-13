import { constants } from 'node:fs';
import { open, rename, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { encryptionAvailable, type Encryption } from './credentials';

/** Unlike a session cookie, an unreadable database identity must never be silently regenerated. */
export function encryptedRecord<T>(
  file: string,
  encryption: Encryption,
  validate: (value: unknown) => value is T,
) {
  const available = () => {
    if (!encryptionAvailable(encryption, process.platform))
      throw new Error('Windows encryption is unavailable.');
  };
  return {
    async load(): Promise<T | null> {
      available();
      let handle;
      try {
        handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw new Error('Local identity cannot be opened.', { cause: error });
      }
      try {
        const info = await handle.stat();
        if (!info.isFile() || info.size > 65536) throw new Error('Invalid local identity');
        const value: unknown = JSON.parse(encryption.decryptString(await handle.readFile()));
        if (!validate(value)) throw new Error('Invalid local identity');
        return value;
      } catch {
        throw new Error(
          'Local identity cannot be decrypted or validated. Saved data was preserved.',
        );
      } finally {
        await handle.close();
      }
    },
    async save(value: T) {
      available();
      if (!validate(value)) throw new Error('Invalid local identity');
      const ciphertext = encryption.encryptString(JSON.stringify(value));
      const temporary = join(dirname(file), `identity-${randomBytes(16).toString('hex')}.tmp`);
      try {
        const handle = await open(
          temporary,
          constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
          0o600,
        );
        try {
          await handle.writeFile(ciphertext);
          await handle.sync();
        } finally {
          await handle.close();
        }
        await rename(temporary, file);
      } finally {
        await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== 'ENOENT') throw error;
        });
      }
    },
  };
}
