import 'server-only';
import {
  createDatabase,
  createAuthRepository,
  createInboxRepository,
  createDirectionRepository,
  createTaskRepository,
  createExecutionRepository,
} from '@life-os/database';
import type { RepositoryDatabase } from '@life-os/database';
import { isAbsolute } from 'node:path';
import {
  createAuthService,
  createHttpSecurity,
  createInboxService,
  createHttpHandlers,
  createDirectionService,
  createDirectionHttp,
  createTaskService,
  createTaskHttp,
  createExecutionService,
  createExecutionHttp,
  validateHostedConfiguration,
} from '@life-os/api';

type Handlers = ReturnType<typeof createHttpHandlers> & {
  direction: ReturnType<typeof createDirectionHttp>;
  tasks: ReturnType<typeof createTaskHttp>;
  execution: ReturnType<typeof createExecutionHttp>;
};
let handlers: Promise<Handlers> | undefined;
export async function getHandlers(): Promise<Handlers> {
  if (!handlers) {
    const pending = initialize();
    handlers = pending;
    void pending.catch(() => {
      if (handlers === pending) handlers = undefined;
    });
  }
  return handlers;
}
async function initialize(): Promise<Handlers> {
  if (process.env.VERCEL) validateHostedConfiguration(process.env);
  const { DATABASE_URL, AUTH_SECRET, APP_ORIGIN } = process.env;
  const localDirectory = process.env.LIFE_OS_DESKTOP_DATA_DIR;
  const setupSecret = process.env.LIFE_OS_DESKTOP_SETUP_SECRET;
  if ((!DATABASE_URL && !localDirectory) || !AUTH_SECRET || !APP_ORIGIN)
    throw new Error('Authentication is not configured.');
  if (Buffer.byteLength(AUTH_SECRET) < 32) throw new Error('The runtime secret is not configured.');
  const security = createHttpSecurity(
    APP_ORIGIN,
    AUTH_SECRET,
    process.env.AUTH_ALLOW_HTTP_LOOPBACK === 'true',
  );
  let db: RepositoryDatabase;
  if (localDirectory) {
    const origin = new URL(APP_ORIGIN);
    const migrationsFolder = process.env.LIFE_OS_DESKTOP_MIGRATIONS_DIR;
    if (
      process.env.VERCEL ||
      DATABASE_URL ||
      origin.protocol !== 'https:' ||
      origin.hostname !== '127.0.0.1' ||
      origin.origin !== APP_ORIGIN ||
      process.env.AUTH_ALLOW_HTTP_LOOPBACK === 'true' ||
      !migrationsFolder ||
      !isAbsolute(migrationsFolder) ||
      !setupSecret ||
      Buffer.byteLength(setupSecret) < 32
    )
      throw new Error(
        'The private desktop runtime requires isolated loopback HTTPS configuration.',
      );
    const { createEmbeddedDatabase } = await import('@life-os/database/embedded');
    const local = await createEmbeddedDatabase(localDirectory, { migrationsFolder });
    db = local.db;
    // A private main/utility lifecycle hook. It is never an HTTP or renderer capability.
    (globalThis as unknown as Record<symbol, unknown>)[Symbol.for('life-os.desktop.shutdown')] =
      local.close;
  } else {
    db = createDatabase(DATABASE_URL!).db;
  }
  const auth = createAuthService(createAuthRepository(db), AUTH_SECRET);
  return {
    ...createHttpHandlers(
      auth,
      createInboxService(auth, createInboxRepository(db)),
      security,
      localDirectory ? { localSetupSecret: setupSecret! } : {},
    ),
    direction: createDirectionHttp(
      createDirectionService(auth, createDirectionRepository(db)),
      security,
    ),
    execution: createExecutionHttp(
      createExecutionService(auth, createExecutionRepository(db)),
      security,
    ),
    tasks: createTaskHttp(createTaskService(auth, createTaskRepository(db)), security),
  };
}
export function unavailable() {
  return Response.json(
    { error: 'Sign-in is not available yet. Please contact the workspace owner.' },
    { status: 503, headers: { 'Cache-Control': 'private, no-store' } },
  );
}
