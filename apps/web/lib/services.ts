import 'server-only';
import {
  createDatabase,
  createAuthRepository,
  createInboxRepository,
  createDirectionRepository,
  createTaskRepository,
} from '@life-os/database';
import {
  createAuthService,
  createHttpSecurity,
  createInboxService,
  createHttpHandlers,
  createDirectionService,
  createDirectionHttp,
  createTaskService,
  createTaskHttp,
} from '@life-os/api';

let handlers:
  | (ReturnType<typeof createHttpHandlers> & {
      direction: ReturnType<typeof createDirectionHttp>;
      tasks: ReturnType<typeof createTaskHttp>;
    })
  | undefined;
export function getHandlers() {
  if (handlers) return handlers;
  const { DATABASE_URL, AUTH_SECRET, APP_ORIGIN } = process.env;
  if (!DATABASE_URL || !AUTH_SECRET || !APP_ORIGIN)
    throw new Error('Authentication is not configured.');
  const security = createHttpSecurity(
    APP_ORIGIN,
    AUTH_SECRET,
    process.env.AUTH_ALLOW_HTTP_LOOPBACK === 'true',
  );
  const { db } = createDatabase(DATABASE_URL);
  const auth = createAuthService(createAuthRepository(db), AUTH_SECRET);
  handlers = {
    ...createHttpHandlers(auth, createInboxService(auth, createInboxRepository(db)), security),
    direction: createDirectionHttp(
      createDirectionService(auth, createDirectionRepository(db)),
      security,
    ),
    tasks: createTaskHttp(createTaskService(auth, createTaskRepository(db)), security),
  };
  return handlers;
}
export function unavailable() {
  return Response.json(
    { error: 'Sign-in is not available yet. Please contact the workspace owner.' },
    { status: 503, headers: { 'Cache-Control': 'private, no-store' } },
  );
}
