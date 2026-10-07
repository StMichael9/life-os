import { createHash, createHmac, randomBytes } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import type { AuthRepository } from '@life-os/database';
import { accountCreationSchema, loginSchema } from '@life-os/validation';
import { AuthenticationRequired } from './index';

export const SESSION_POLICY = {
  absoluteMs: 30 * 86_400_000,
  idleMs: 7 * 86_400_000,
  rotationMs: 15 * 60_000,
  graceMs: 30_000,
} as const;
export const PASSWORD_OPTIONS = {
  algorithm: 2 /* Argon2id */,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
};
const dummyHash = hash(randomBytes(32), PASSWORD_OPTIONS);
export const digestToken = (token: string) => createHash('sha256').update(token).digest('hex');
export class LoginFailed extends Error {
  constructor() {
    super('Email or password is incorrect.');
  }
}
export class AccountExists extends Error {
  constructor() {
    super('Account already exists.');
  }
}
export class RateLimited extends Error {
  constructor(public readonly retryAfter: number) {
    super('Too many attempts. Please wait and try again.');
  }
}
const validToken = (value: string) => /^[A-Za-z0-9_-]{43}$/.test(value);

export function createAuthService(
  repo: AuthRepository,
  secret: string,
  clock: () => Date = () => new Date(),
) {
  if (Buffer.byteLength(secret) < 32)
    throw new Error('AUTH_SECRET must contain at least 32 bytes of random secret material.');
  const successor = (token: string) =>
    createHmac('sha256', secret).update(`session-rotation-v1:${token}`).digest('base64url');
  return {
    /** Administrative use only: this method is not reachable through HTTP. */
    async createAccount(input: unknown) {
      const data = accountCreationSchema.parse(input);
      const passwordHash = await hash(data.password, PASSWORD_OPTIONS);
      const account = await repo.createAccount({
        email: data.email,
        displayName: data.displayName,
        timeZone: data.timeZone,
        passwordHash,
      });
      if (!account) throw new AccountExists();
      return account;
    },
    async login(input: unknown) {
      const data = loginSchema.parse(input);
      const now = clock();
      const global = await repo.consumeLimit('login:global', 50, 15 * 60_000, now);
      if (!global.allowed) throw new RateLimited(global.retryAfter);
      const emailKey = createHmac('sha256', secret)
        .update(`login-email:${data.email}`)
        .digest('hex');
      const accountLimit = await repo.consumeLimit(`login:email:${emailKey}`, 5, 15 * 60_000, now);
      if (!accountLimit.allowed) throw new RateLimited(accountLimit.retryAfter);
      await repo.pruneLimits(now);
      const credential = await repo.findCredential(data.email);
      // Always perform Argon2id verification, including for an unknown email.
      const valid = await verify(credential?.passwordHash ?? (await dummyHash), data.password);
      if (!credential || !valid) throw new LoginFailed();
      const token = randomBytes(32).toString('base64url');
      const session = await repo.createSession({
        userId: credential.userId,
        tokenHash: digestToken(token),
        client: 'web',
        expiresAt: new Date(now.getTime() + SESSION_POLICY.absoluteMs),
        idleExpiresAt: new Date(now.getTime() + SESSION_POLICY.idleMs),
        rotatedAt: now,
      });
      return { token, expiresAt: session.expiresAt };
    },
    async verify(token: string) {
      if (!validToken(token)) return null;
      const now = clock();
      const result = await repo.findSession(digestToken(token), now);
      if (!result) return null;
      const idleExpiresAt = new Date(
        Math.min(result.session.expiresAt.getTime(), now.getTime() + SESSION_POLICY.idleMs),
      );
      if (!(await repo.touchSession(result.session.id, now, idleExpiresAt))) return null;
      return { userId: result.profile.id, profile: result.profile };
    },
    async refresh(token: string | undefined) {
      if (!token || !validToken(token)) throw new AuthenticationRequired();
      const now = clock();
      const next = successor(token);
      const result = await repo.rotate(
        digestToken(token),
        digestToken(next),
        now,
        SESSION_POLICY.rotationMs,
        SESSION_POLICY.graceMs,
      );
      if (!result) throw new AuthenticationRequired();
      return {
        token: result.rotated ? next : token,
        expiresAt: result.session.expiresAt,
        rotated: result.rotated,
      };
    },
    async logout(token: string | undefined) {
      if (token && validToken(token)) await repo.revoke(digestToken(token), clock());
    },
  };
}
