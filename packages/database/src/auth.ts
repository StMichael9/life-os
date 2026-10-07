import { and, eq, gt, isNull, or, sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema';
const { users, credentials, sessions, authRateLimits } = schema;

export function createAuthRepository<T extends PgQueryResultHKT>(db: PgDatabase<T, typeof schema>) {
  const tokenMatch = (hash: string, now: Date) =>
    or(
      eq(sessions.tokenHash, hash),
      and(eq(sessions.previousTokenHash, hash), gt(sessions.previousValidUntil, now)),
    );
  const active = (now: Date) =>
    and(isNull(sessions.revokedAt), gt(sessions.expiresAt, now), gt(sessions.idleExpiresAt, now));
  return {
    async createAccount(input: {
      email: string;
      displayName: string;
      timeZone: string;
      passwordHash: string;
    }) {
      return db.transaction(async (tx) => {
        const [user] = await tx
          .insert(users)
          .values({ email: input.email, displayName: input.displayName, timeZone: input.timeZone })
          .onConflictDoNothing({ target: users.email })
          .returning({ id: users.id });
        if (!user) return null;
        await tx.insert(credentials).values({ userId: user.id, passwordHash: input.passwordHash });
        return user;
      });
    },
    async findCredential(email: string) {
      const [row] = await db
        .select({ userId: users.id, passwordHash: credentials.passwordHash })
        .from(users)
        .innerJoin(credentials, eq(users.id, credentials.userId))
        .where(eq(users.email, email));
      return row ?? null;
    },
    async createSession(input: typeof sessions.$inferInsert) {
      const [row] = await db.insert(sessions).values(input).returning();
      if (!row) throw new Error('Session creation failed');
      return row;
    },
    async findSession(hash: string, now: Date) {
      const [row] = await db
        .select({
          session: sessions,
          profile: { id: users.id, displayName: users.displayName, timeZone: users.timeZone },
        })
        .from(sessions)
        .innerJoin(users, eq(users.id, sessions.userId))
        .where(and(tokenMatch(hash, now), active(now)));
      return row ?? null;
    },
    async touchSession(id: string, now: Date, idleExpiresAt: Date) {
      const rows = await db
        .update(sessions)
        .set({ idleExpiresAt })
        .where(and(eq(sessions.id, id), active(now)))
        .returning({ id: sessions.id });
      return rows.length > 0;
    },
    async rotate(hash: string, nextHash: string, now: Date, rotationMs: number, graceMs: number) {
      return db.transaction(async (tx) => {
        const [row] = await tx
          .select()
          .from(sessions)
          .where(and(tokenMatch(hash, now), active(now)))
          .for('update');
        if (!row) return null;
        if (row.previousTokenHash === hash) {
          // Concurrent retry or lost response: only the immediate successor is recoverable.
          return row.tokenHash === nextHash ? { session: row, rotated: true } : null;
        }
        if (now.getTime() - row.rotatedAt.getTime() < rotationMs)
          return { session: row, rotated: false };
        const [updated] = await tx
          .update(sessions)
          .set({
            tokenHash: nextHash,
            previousTokenHash: hash,
            previousValidUntil: new Date(now.getTime() + graceMs),
            rotatedAt: now,
          })
          .where(eq(sessions.id, row.id))
          .returning();
        return updated ? { session: updated, rotated: true } : null;
      });
    },
    async revoke(hash: string, now: Date) {
      await db
        .update(sessions)
        .set({ revokedAt: now })
        .where(and(tokenMatch(hash, now), isNull(sessions.revokedAt)));
    },
    async consumeLimit(key: string, limit: number, windowMs: number, now: Date) {
      const reset = new Date(now.getTime() + windowMs);
      const [row] = await db
        .insert(authRateLimits)
        .values({ key, attempts: 1, resetsAt: reset })
        .onConflictDoUpdate({
          target: authRateLimits.key,
          set: {
            attempts: sql`case when ${authRateLimits.resetsAt} <= ${now} then 1 else least(${authRateLimits.attempts} + 1, ${limit + 1}) end`,
            resetsAt: sql`case when ${authRateLimits.resetsAt} <= ${now} then ${reset} else ${authRateLimits.resetsAt} end`,
          },
        })
        .returning();
      if (!row) throw new Error('Rate limit storage failed');
      return {
        allowed: row.attempts <= limit,
        retryAfter: Math.max(1, Math.ceil((row.resetsAt.getTime() - now.getTime()) / 1000)),
      };
    },
    async pruneLimits(now: Date) {
      await db
        .delete(authRateLimits)
        .where(
          sql`${authRateLimits.key} in (select key from auth_rate_limit where resets_at < ${now} order by resets_at limit 100)`,
        );
    },
  };
}
export type AuthRepository = ReturnType<typeof createAuthRepository>;
