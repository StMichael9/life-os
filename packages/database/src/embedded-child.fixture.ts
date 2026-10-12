import { createEmbeddedDatabase } from './embedded';
import { sql } from 'drizzle-orm';

// Disposable crash fixture only. No real user data or renderer capability.
process.on(
  'message',
  (configuration: { directory: string; migrationsFolder: string; userId: string }) => {
    void (async () => {
      const database = await createEmbeddedDatabase(configuration.directory, {
        migrationsFolder: configuration.migrationsFolder,
      });
      await database.db.execute(
        sql`update app_user set display_name='Committed before crash' where id=${configuration.userId}`,
      );
      process.send?.({ type: 'ready' });
    })().catch(() => process.exit(1));
  },
);
