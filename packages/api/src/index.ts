import { captureRequestSchema, inboxCursorSchema, type InboxCursor } from '@life-os/validation';
export class AuthenticationRequired extends Error {
  constructor() {
    super('Authentication required');
  }
}
export interface Principal {
  readonly userId: string;
}
export interface SessionVerifier {
  verify(sessionToken: string): Promise<Principal | null>;
}
export interface InboxItem {
  id: string;
  body: string;
  createdAt: Date;
}
export interface InboxRepository {
  capture(userId: string, body: string, requestId: string): Promise<InboxItem>;
  list(
    userId: string,
    cursor?: InboxCursor,
  ): Promise<{ items: InboxItem[]; nextCursor: InboxCursor | null }>;
}
export function createInboxService(sessions: SessionVerifier, inbox: InboxRepository) {
  async function requirePrincipal(token: string | undefined) {
    if (!token) throw new AuthenticationRequired();
    const principal = await sessions.verify(token);
    if (!principal) throw new AuthenticationRequired();
    return principal;
  }
  return {
    async capture(token: string | undefined, input: unknown) {
      const principal = await requirePrincipal(token);
      const { body, requestId } = captureRequestSchema.parse(input);
      return inbox.capture(principal.userId, body, requestId);
    },
    async list(token: string | undefined, cursor?: unknown) {
      const principal = await requirePrincipal(token);
      return inbox.list(
        principal.userId,
        cursor === undefined ? undefined : inboxCursorSchema.parse(cursor),
      );
    },
  };
}
export { createAuthService, LoginFailed, RateLimited, AccountExists } from './auth';
export { createHttpSecurity, CsrfRejected, InvalidRequest } from './http-security';
export { createHttpHandlers } from './http';

export { createDirectionService } from './direction';
export { createDirectionHttp } from './direction-http';
export { createTaskService } from './tasks';
export { createTaskHttp } from './tasks-http';
