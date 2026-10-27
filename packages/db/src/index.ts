import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { z } from 'zod';
import * as schema from './schema.js';

const DatabaseUrlSchema = z.string().url().refine((value) => value.startsWith('postgresql://') || value.startsWith('postgres://'), 'Expected a PostgreSQL URL');

export function createDatabase(databaseUrl: string = process.env.DATABASE_URL ?? '') {
  const pool = new Pool({ connectionString: DatabaseUrlSchema.parse(databaseUrl) });
  return { db: drizzle(pool, { schema }), pool };
}

export * from './schema.js';
