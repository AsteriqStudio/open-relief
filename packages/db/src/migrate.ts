import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDatabase } from './index.js';

const { db, pool } = createDatabase();
try {
  await migrate(db, { migrationsFolder: './drizzle' });
} finally {
  await pool.end();
}
