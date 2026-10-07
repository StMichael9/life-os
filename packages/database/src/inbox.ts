import { and, desc, eq, isNull, lt, or } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema';
const { inboxItems } = schema;
export class CaptureConflict extends Error {
  constructor() {
    super('This request ID was already used for another capture.');
  }
}

/** Only call from trusted server services with a verified principal's userId. */
export function createInboxRepository<T extends PgQueryResultHKT>(
  db: PgDatabase<T, typeof schema>,
) {
  const fields = { id: inboxItems.id, body: inboxItems.body, createdAt: inboxItems.createdAt };
  return {
    async capture(userId: string, body: string, requestId: string) {
      const [created] = await db
        .insert(inboxItems)
        .values({ userId, body, requestId })
        .onConflictDoNothing({ target: [inboxItems.userId, inboxItems.requestId] })
        .returning(fields);
      if (created) return created;
      const [existing] = await db
        .select(fields)
        .from(inboxItems)
        .where(and(eq(inboxItems.userId, userId), eq(inboxItems.requestId, requestId)));
      if (!existing || existing.body !== body) throw new CaptureConflict();
      return existing;
    },
    async list(userId: string, cursor?: { createdAt: string; id: string }) {
      const rows = await db
        .select(fields)
        .from(inboxItems)
        .where(
          and(
            eq(inboxItems.userId, userId),
            isNull(inboxItems.processedAt),
            cursor
              ? or(
                  lt(inboxItems.createdAt, new Date(cursor.createdAt)),
                  and(
                    eq(inboxItems.createdAt, new Date(cursor.createdAt)),
                    lt(inboxItems.id, cursor.id),
                  ),
                )
              : undefined,
          ),
        )
        .orderBy(desc(inboxItems.createdAt), desc(inboxItems.id))
        .limit(51);
      const items = rows.slice(0, 50);
      const last = items.at(-1);
      return {
        items,
        nextCursor:
          rows.length > 50 && last
            ? { createdAt: last.createdAt.toISOString(), id: last.id }
            : null,
      };
    },
  };
}
