import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import { createDatabase, createAuthRepository } from '@life-os/database';
import { createAuthService } from './auth';

export const E2E_SECRET = 'isolated-browser-fixture-secret-at-least-32-bytes';
export const E2E_PASSWORD = 'Browser fixture password 123!';
export async function seedE2E(url: string) {
  if (!new URL(url).pathname.endsWith('_e2e'))
    throw new Error('Browser fixtures require an isolated database ending in _e2e.');
  const connection = createDatabase(url);
  try {
    await migrate(connection.db, {
      migrationsFolder: fileURLToPath(new URL('../../database/migrations', import.meta.url)),
    });
    await connection.db.execute(sql`truncate app_user cascade`);
    await connection.db.execute(sql`truncate auth_rate_limit`);
    const auth = createAuthService(createAuthRepository(connection.db), E2E_SECRET);
    for (const [email, displayName] of [
      ['alice@example.test', 'Alice'],
      ['bob@example.test', 'Bob'],
    ])
      await auth.createAccount({
        email,
        password: E2E_PASSWORD,
        displayName,
        timeZone: 'America/Los_Angeles',
      });
  } finally {
    await connection.close();
  }
}
export async function clearE2ELimits(url: string) {
  if (!new URL(url).pathname.endsWith('_e2e')) throw new Error('Isolated _e2e database required.');
  const connection = createDatabase(url);
  try {
    await connection.db.execute(sql`truncate auth_rate_limit`);
  } finally {
    await connection.close();
  }
}
