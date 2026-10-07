import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDatabase } from './index';

const url = process.env.DATABASE_URL;
if (!url)
  throw new Error('Set DATABASE_URL explicitly; migrations never assume a production database.');
const { db, close } = createDatabase(url);
try {
  await migrate(db, { migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url)) });
} finally {
  await close();
}
