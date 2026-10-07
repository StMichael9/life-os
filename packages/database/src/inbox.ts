import { and, desc, eq, isNull } from 'drizzle-orm';
import type { Database } from './index';
import { inboxItems } from './schema';

/** Only call from trusted server services with a verified principal's userId. */
export function createInboxRepository(db: Database) {
  return {
    async capture(userId: string, body: string) {
      const [item] = await db
        .insert(inboxItems)
        .values({ userId, body })
        .returning({ id: inboxItems.id, body: inboxItems.body });
      if (!item) throw new Error('Capture did not return a record');
      return item;
    },
    async list(userId: string) {
      return db
        .select({ id: inboxItems.id, body: inboxItems.body })
        .from(inboxItems)
        .where(and(eq(inboxItems.userId, userId), isNull(inboxItems.processedAt)))
        .orderBy(desc(inboxItems.createdAt), desc(inboxItems.id))
        .limit(50);
    },
  };
}
