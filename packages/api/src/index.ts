import { inboxCaptureSchema } from '@life-os/validation';

export class AuthenticationRequired extends Error {
  constructor() {
    super('Authentication required');
  }
}
export interface Principal {
  readonly userId: string;
}
/** Implement with hashed session lookup + expiry/revocation checks in Phase 1. */
export interface SessionVerifier {
  verify(sessionToken: string): Promise<Principal | null>;
}
export interface InboxRepository {
  capture(userId: string, body: string): Promise<{ id: string; body: string }>;
  list(userId: string): Promise<readonly { id: string; body: string }[]>;
}

/** Server service boundary. HTTP handlers must also enforce CSRF and body limits. */
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
      const { body } = inboxCaptureSchema.parse(input);
      return inbox.capture(principal.userId, body);
    },
    async list(token: string | undefined) {
      const principal = await requirePrincipal(token);
      return inbox.list(principal.userId);
    },
  };
}
