import { app, safeStorage, session } from 'electron';
import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { persistSession } from '../src/session-persistence';
import { createCredentialStore, type SessionCookie } from '../src/credentials';

// Test-only entry point. Never included in the application bundle or installer.
const directory = process.env.LIFE_OS_NATIVE_QA_DIRECTORY;
const phase = process.env.LIFE_OS_NATIVE_QA_PHASE;
assert(directory && phase, 'Run this through verify-native.mjs');
app.setPath('userData', directory);
const origin = 'https://life-os-qa.invalid'; // Synthetic cookie host; no requests are made.
const credentials = join(
  directory,
  'credentials',
  createHash('sha256').update(origin).digest('hex'),
);
const file = join(credentials, 'session.bin');
const cookie: SessionCookie = {
  name: '__Host-life_os_session',
  value: 'a'.repeat(43),
  domain: 'life-os-qa.invalid',
  path: '/',
  secure: true,
  httpOnly: true,
  hostOnly: true,
  sameSite: 'lax',
  expirationDate: Date.now() / 1000 + 86400,
};

void app
  .whenReady()
  .then(async () => {
    assert.equal(process.platform, 'win32', 'Native Windows verification required');
    assert(safeStorage.isEncryptionAvailable(), 'Windows encryption is unavailable');
    const cookies = session.fromPartition('life-os-native-qa').cookies;
    assert.deepEqual(await cookies.get({}), [], 'Partition must start empty in each process');
    const persistence = await persistSession(
      session.fromPartition('life-os-native-qa'),
      origin,
      directory,
    );
    const current = await cookies.get({ url: origin, name: cookie.name });
    const set = async (value: string) => {
      await cookies.set({
        url: origin,
        name: cookie.name,
        value,
        path: '/',
        secure: true,
        httpOnly: true,
        sameSite: 'lax',
        expirationDate: cookie.expirationDate!,
      });
      await persistence.flush();
      const bytes = await readFile(file);
      assert(!bytes.includes(value), 'Token must not appear in ciphertext');
      assert(!bytes.includes(origin), 'Metadata must also be encrypted');
    };
    if (phase === 'save') {
      assert.equal(current.length, 0);
      await set(cookie.value);
    } else if (phase === 'rotate') {
      assert.equal(current.length, 1);
      assert.equal(
        current[0]?.value,
        cookie.value,
        'Restore original cookie across process restart',
      );
      assert.equal(current[0]?.hostOnly, true);
      assert.equal(current[0]?.secure, true);
      assert.equal(current[0]?.httpOnly, true);
      assert.equal(current[0]?.sameSite, 'lax');
      await set('b'.repeat(43));
    } else if (phase === 'logout') {
      assert.equal(current[0]?.value, 'b'.repeat(43), 'Restore latest replacement across restart');
      await cookies.remove(origin, cookie.name);
      await persistence.flush();
      await assert.rejects(access(file));
    } else if (phase === 'empty') {
      assert.equal(current.length, 0, 'Logout must survive process restart');
      await assert.rejects(access(file));
    } else if (phase === 'corrupt') {
      assert.equal(current.length, 0);
      await mkdir(credentials, { recursive: true });
      await writeFile(file, 'invalid ciphertext');
    } else if (phase === 'expired' || phase === 'foreign') {
      assert.equal(current.length, 0, 'Invalid record must never restore');
      await assert.rejects(access(file), 'Previous invalid record must be removed');
      await writeFile(
        file,
        safeStorage.encryptString(
          JSON.stringify({
            version: 1,
            origin: phase === 'foreign' ? 'https://other.invalid' : origin,
            cookie: phase === 'expired' ? { ...cookie, expirationDate: 1 } : cookie,
          }),
        ),
      );
    } else if (phase === 'unavailable') {
      assert.equal(current.length, 0);
      await assert.rejects(access(file));
      const store = createCredentialStore(
        credentials,
        origin,
        {
          isEncryptionAvailable: () => false,
          encryptString: () => {
            throw new Error('Must not encrypt');
          },
          decryptString: () => {
            throw new Error('Must not decrypt');
          },
        },
        'win32',
      );
      await store.save(cookie);
      await assert.rejects(access(file), 'Simulated encryption outage must not write plaintext');
    } else if (phase === 'http') {
      const http = session.fromPartition('life-os-http-qa');
      const dev = await persistSession(http, 'http://127.0.0.1:3000', directory);
      await http.cookies.set({
        url: 'http://127.0.0.1:3000',
        name: 'life_os_session',
        value: cookie.value,
        httpOnly: true,
      });
      await dev.flush();
      await assert.rejects(access(file));
    } else throw new Error('Unknown native QA phase');
    await persistence.flush();
    console.log(`PASS native ${phase}`);
    app.quit();
  })
  .catch((error: unknown) => {
    console.error(error);
    app.exit(1);
  });
