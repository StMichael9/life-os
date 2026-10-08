import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

/** Server-only factory: deliberately no connection on import or during builds. */
export function createDatabase(connectionString: string) {
  if (!connectionString) throw new Error('DATABASE_URL is required for private data');
  const pool = new Pool({
    connectionString,
    max: 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
  return { db: drizzle(pool, { schema }), close: () => pool.end() };
}
export type Database = ReturnType<typeof createDatabase>['db'];
export * as schema from './schema';
export { createInboxRepository } from './inbox';
export { createAuthRepository, type AuthRepository } from './auth';
export { CaptureConflict } from './inbox';
export {
  createDirectionRepository,
  DirectionNotFound,
  DirectionConflict,
  DirectionInvalid,
  type DirectionRepository,
} from './direction';
export { createTaskRepository, type TaskRepository } from './tasks';

export { createExecutionRepository, type ExecutionRepository } from './execution';
export { productionDatabaseUrl } from './production-config';
