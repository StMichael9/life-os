import { safeStorage, type Session } from 'electron';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { createCredentialStore, validSessionCookie } from './credentials';

/** Cookie access stays in main; no preload or renderer IPC is introduced. */
export async function persistSession(session: Session, origin: string, userData: string) {
  const directory = join(
    userData,
    'credentials',
    createHash('sha256').update(origin).digest('hex'),
  );
  const store = createCredentialStore(directory, origin, safeStorage, process.platform);
  try {
    const saved = await store.load();
    if (saved)
      await session.cookies.set({
        url: origin,
        name: saved.name,
        value: saved.value,
        path: '/',
        secure: true,
        httpOnly: true,
        expirationDate: saved.expirationDate!,
        sameSite: 'lax',
      });
  } catch {
    await store.clear().catch(() => {});
  } // nonpersistent login is always safer than plaintext fallback
  let queue: Promise<void> = Promise.resolve();
  let failed = false;
  session.cookies.on('changed', (_event, cookie) => {
    if (cookie.name !== '__Host-life_os_session' || cookie.domain !== new URL(origin).hostname)
      return;
    queue = queue
      .then(async () => {
        // Re-read the current cookie rather than persisting an obsolete rotation event.
        const current = await session.cookies.get({ url: origin, name: '__Host-life_os_session' });
        if (failed) {
          await store.clear();
          return;
        }
        await store.save(
          current.length === 1 && validSessionCookie(current[0], origin) ? current[0] : undefined,
        );
      })
      .catch(async () => {
        failed = true;
        await store.clear().catch(() => {});
      });
  });
  return { flush: () => queue };
}
