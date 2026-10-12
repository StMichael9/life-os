import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { sql } from 'drizzle-orm';
import { createEmbeddedDatabase } from './embedded';

const magic = Buffer.from('LIFEOS-OFFLINE-BACKUP\x01');
const maximumSnapshot = 256 * 1024 * 1024;
const maximumMetadata = 16 * 1024;

function checkKey(key: Uint8Array) {
  if (key.byteLength !== 32) throw new Error('A separate 32-byte backup recovery key is required.');
}
function migrationIdentity(migrationsFolder: string) {
  return readMigrationFiles({ migrationsFolder }).map(({ hash, folderMillis }) => ({
    hash,
    timestamp: folderMillis,
  }));
}

/** Private backend only. Caller persists ciphertext/key separately through native storage. */
export async function createEncryptedEmbeddedBackup(
  database: Pick<Awaited<ReturnType<typeof createEmbeddedDatabase>>, 'snapshot' | 'db'>,
  key: Uint8Array,
  migrationsFolder: string,
) {
  checkKey(key);
  const migrations = migrationIdentity(migrationsFolder);
  const ledger = await database.db.execute(
    sql`select hash,created_at from drizzle.__drizzle_migrations order by created_at,id`,
  );
  if (
    ledger.rows.length !== migrations.length ||
    ledger.rows.some(
      (row, index) =>
        row.hash !== migrations[index]!.hash ||
        Number(row.created_at) !== migrations[index]!.timestamp,
    )
  )
    throw new Error('The backup migrations do not match the open database.');
  const metadata = Buffer.from(
    JSON.stringify({
      format: 'life-os-pglite-v1',
      createdAt: new Date().toISOString(),
      migrations,
    }),
  );
  if (metadata.length > maximumMetadata)
    throw new Error('The backup migration metadata exceeds its limit.');
  const snapshot = await database.snapshot();
  if (snapshot.size > maximumSnapshot)
    throw new Error('The local backup exceeds the 256 MiB limit.');
  const plaintext = Buffer.alloc(4 + metadata.length + snapshot.size);
  plaintext.writeUInt32BE(metadata.length);
  metadata.copy(plaintext, 4);
  Buffer.from(await snapshot.arrayBuffer()).copy(plaintext, 4 + metadata.length);
  try {
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, nonce);
    cipher.setAAD(magic);
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return Buffer.concat([magic, nonce, cipher.getAuthTag(), encrypted]);
  } finally {
    plaintext.fill(0);
  }
}

/** Restores into a separate EMPTY candidate. Never replaces the active database. */
export async function restoreEncryptedEmbeddedBackup(
  encrypted: Uint8Array,
  key: Uint8Array,
  directory: string,
  migrationsFolder: string,
) {
  checkKey(key);
  const archive = Buffer.from(encrypted.buffer, encrypted.byteOffset, encrypted.byteLength);
  const offset = magic.length + 12 + 16;
  if (
    archive.length <= offset + 4 ||
    archive.length > offset + 4 + maximumMetadata + maximumSnapshot ||
    !archive.subarray(0, magic.length).equals(magic)
  )
    throw new Error('Unsupported or oversized local backup.');
  let plaintext: Buffer;
  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      key,
      archive.subarray(magic.length, magic.length + 12),
    );
    decipher.setAAD(magic);
    decipher.setAuthTag(archive.subarray(magic.length + 12, offset));
    plaintext = Buffer.concat([decipher.update(archive.subarray(offset)), decipher.final()]);
  } catch {
    throw new Error('The backup recovery key or authentication tag is invalid.');
  }
  try {
    const length = plaintext.readUInt32BE();
    if (
      length < 1 ||
      length > maximumMetadata ||
      length + 4 >= plaintext.length ||
      plaintext.length - 4 - length > maximumSnapshot
    )
      throw new Error('Invalid backup metadata.');
    const metadata = JSON.parse(plaintext.subarray(4, 4 + length).toString('utf8')) as {
      format?: unknown;
      migrations?: unknown;
    };
    if (
      metadata.format !== 'life-os-pglite-v1' ||
      JSON.stringify(metadata.migrations) !== JSON.stringify(migrationIdentity(migrationsFolder))
    )
      throw new Error('The backup migrations do not match this application.');
    const snapshot = new Blob([new Uint8Array(plaintext.subarray(4 + length))]);
    const candidate = await createEmbeddedDatabase(directory, {
      migrationsFolder,
      initialSnapshot: snapshot,
    });
    try {
      // Snapshot may contain hashed old sessions. Never restore their ability to log in.
      await candidate.db.transaction(async (transaction) => {
        await transaction.execute(sql`delete from auth_session`);
        await transaction.execute(sql`delete from auth_rate_limit`);
      });
    } finally {
      await candidate.close();
    }
  } finally {
    plaintext.fill(0);
  }
}
