import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { createDatabase, users } from '@open-relief/db';
import { hashPassword } from './auth.js';

const AdminInputSchema = z.object({
  DATABASE_URL: z.string().url(),
  ADMIN_EMAIL: z.string().email(),
  ADMIN_PASSWORD: z.string().min(12),
  ADMIN_PHONE: z.string().min(7).max(30),
}).passthrough();

if (process.env.NODE_ENV === 'production') throw new Error('Local admin bootstrap is disabled in production');
const input = AdminInputSchema.parse(process.env);
const { db, pool } = createDatabase(input.DATABASE_URL);
try {
  const email = input.ADMIN_EMAIL.trim().toLowerCase();
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (existing) throw new Error('Admin bootstrap requires a new email address');
  await db.insert(users).values({ id: randomUUID(), role: 'admin', email, phone: input.ADMIN_PHONE, passwordHash: await hashPassword(input.ADMIN_PASSWORD) });
  console.log('Created local admin account');
} finally {
  await pool.end();
}
