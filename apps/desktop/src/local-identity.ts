import { randomBytes, X509Certificate, createPrivateKey } from 'node:crypto';
import { join } from 'node:path';
import { lstat } from 'node:fs/promises';
import { generate } from 'selfsigned';
import { safeStorage } from 'electron';
import { encryptedRecord } from './encrypted-record';
import { protectDirectory } from './private-directory';

export interface LocalIdentity {
  version: 1;
  port: number;
  authSecret: string;
  certificate: string;
  privateKey: string;
}
function validIdentity(value: unknown): value is LocalIdentity {
  if (!value || typeof value !== 'object') return false;
  const data = value as Partial<LocalIdentity>;
  if (
    data.version !== 1 ||
    !Number.isInteger(data.port) ||
    (data.port !== 0 && (data.port! < 1024 || data.port! > 65535)) ||
    typeof data.authSecret !== 'string' ||
    !/^[A-Za-z0-9_-]{64}$/.test(data.authSecret) ||
    typeof data.certificate !== 'string' ||
    typeof data.privateKey !== 'string'
  )
    return false;
  try {
    const cert = new X509Certificate(data.certificate);
    return (
      cert.checkIP('127.0.0.1') === '127.0.0.1' &&
      cert.checkPrivateKey(createPrivateKey(data.privateKey))
    );
  } catch {
    return false;
  }
}
export async function makeCertificate() {
  const now = Date.now();
  const authority = await generate([{ name: 'commonName', value: 'Life OS instance authority' }], {
    keySize: 2048,
    algorithm: 'sha256',
    notBeforeDate: new Date(now - 60000),
    notAfterDate: new Date(now + 365 * 86400000),
    extensions: [
      { name: 'basicConstraints', cA: true, critical: true },
      { name: 'keyUsage', keyCertSign: true, cRLSign: true, critical: true },
    ],
  });
  const pems = await generate([{ name: 'commonName', value: 'Life OS private loopback' }], {
    keySize: 2048,
    algorithm: 'sha256',
    notBeforeDate: new Date(now - 60000),
    notAfterDate: new Date(now + 365 * 86400000),
    extensions: [
      { name: 'basicConstraints', cA: false },
      { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
      { name: 'extKeyUsage', serverAuth: true },
      { name: 'subjectAltName', altNames: [{ type: 7, ip: '127.0.0.1' }] },
    ],
    ca: { key: authority.private, cert: authority.cert },
  });
  // The authority is unique to this installation and is never installed in Windows trust.
  // Only its exact leaf identity is accepted by the Electron session.
  return { certificate: pems.cert + '\n' + authority.cert, privateKey: pems.private };
}
export async function loadLocalIdentity(userData: string) {
  const directory = join(userData, 'offline');
  await protectDirectory(directory);
  const database = join(directory, 'database');
  const store = encryptedRecord(join(directory, 'runtime.bin'), safeStorage, validIdentity);
  let identity = await store.load();
  if (!identity) {
    // Existing data must retain its identity; never silently reset origin/session secrets.
    const exists = await lstat(database).then(
      () => true,
      (error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return false;
        throw error;
      },
    );
    if (exists)
      throw new Error('The local identity is missing. Saved database files were preserved.');
    identity = {
      version: 1,
      port: 0,
      authSecret: randomBytes(48).toString('base64url'),
      ...(await makeCertificate()),
    };
    await store.save(identity);
  } else if (
    Date.parse(new X509Certificate(identity.certificate).validTo) <
    Date.now() + 7 * 86400000
  ) {
    identity = { ...identity, ...(await makeCertificate()) };
    await store.save(identity);
  }
  await protectDirectory(database);
  return { directory, database, identity, save: store.save };
}
