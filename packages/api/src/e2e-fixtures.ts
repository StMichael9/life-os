import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import { createDatabase, createAuthRepository, schema as s } from '@life-os/database';
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

/** Synthetic browser fixture only: an existing saved 45-minute paused session. */
export async function seedPausedFocusE2E(url: string, objective: string) {
  if (!new URL(url).pathname.endsWith('_e2e')) throw new Error('Isolated _e2e database required.');
  const connection = createDatabase(url);
  try {
    const owner = await connection.db.execute(
      sql`select id from app_user where email='alice@example.test'`,
    );
    const userId = owner.rows[0]?.id;
    if (typeof userId !== 'string') throw new Error('Synthetic Alice fixture required.');
    await connection.db.insert(s.focusSessions).values({
      userId,
      objective,
      plannedMinutes: 90,
      activeSeconds: 2700,
      startedAt: new Date(Date.now() - 2700000),
      notes: 'Return to binary search',
      resumedAt: null,
    });
  } finally {
    await connection.close();
  }
}
