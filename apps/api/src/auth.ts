import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { jwtVerify, SignJWT } from 'jose';
import { z } from 'zod';
import { authSessions, users } from '@open-relief/db';
import { AssistanceProgramSchema } from '@open-relief/shared';
import type { Database } from './services.js';
import type { AuthAttemptLimiter } from './authThrottle.js';

const SESSION_DAYS = 7;
const PasswordSchema = z.string().min(12).max(128);
const EmailSchema = z.string().email().transform((email) => email.trim().toLowerCase());
const SignUpSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
  phone: z.string().min(7).max(30),
  role: z.enum(['recipient', 'donor']),
  legalName: z.string().trim().min(2).max(120).optional(),
  assistanceProgram: AssistanceProgramSchema.default('NONE'),
}).strict().superRefine((input, context) => {
  if (input.role === 'recipient' && !input.legalName) context.addIssue({ code: 'custom', path: ['legalName'], message: 'Recipient legal name is required to match the bill' });
});
const SignInSchema = z.object({ email: EmailSchema, password: z.string().min(1) }).strict();
const TOKEN_PATTERN = /^Bearer ([A-Za-z0-9._-]{64,4096})$/;

export type AuthUser = { id: string; role: 'recipient' | 'donor' | 'admin'; email: string };
export type AuthRole = AuthUser['role'];

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
    sessionHash?: string;
  }
}

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function derivePassword(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, derived) => {
      if (error) reject(error);
      else resolve(derived);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await derivePassword(password, salt);
  return `scrypt:32768:${salt.toString('hex')}:${derived.toString('hex')}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, cost, salt, hash] = stored.split(':');
  if (algorithm !== 'scrypt' || cost !== '32768' || !salt || !hash || !/^[0-9a-f]{32}$/.test(salt) || !/^[0-9a-f]{128}$/.test(hash)) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = await derivePassword(password, Buffer.from(salt, 'hex'));
  return timingSafeEqual(actual, expected);
}

async function issueSession(db: Database, user: AuthUser, signingKey: Uint8Array) {
  const jti = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const token = await new SignJWT({ role: user.role, email: user.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer('open-relief')
    .setAudience('open-relief-mobile')
    .setSubject(user.id)
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(signingKey);
  await db.insert(authSessions).values({ tokenHash: tokenHash(jti), userId: user.id, expiresAt });
  return { token, expiresAt: expiresAt.toISOString(), user };
}

export function registerAuth(app: FastifyInstance, db: Database, secretHex: string, authAttempts: AuthAttemptLimiter) {
  const signingKey = Buffer.from(secretHex, 'hex');
  const requireAuth = (options: { roles?: AuthRole[] } = {}) => async (request: FastifyRequest, reply: FastifyReply) => {
    const match = TOKEN_PATTERN.exec(request.headers.authorization ?? '');
    if (!match) return reply.code(401).send({ error: 'Authentication required' });
    let jti: string;
    let subject: string;
    try {
      const verified = await jwtVerify(match[1]!, signingKey, { algorithms: ['HS256'], issuer: 'open-relief', audience: 'open-relief-mobile' });
      if (!verified.payload.jti || !verified.payload.sub) throw new Error('Missing session claims');
      jti = verified.payload.jti;
      subject = verified.payload.sub;
    } catch {
      return reply.code(401).send({ error: 'Invalid or expired session' });
    }
    const [record] = await db.select({ id: users.id, role: users.role, email: users.email }).from(authSessions)
      .innerJoin(users, eq(authSessions.userId, users.id))
      .where(and(eq(authSessions.tokenHash, tokenHash(jti)), gt(authSessions.expiresAt, new Date()), isNull(authSessions.revokedAt)));
    if (!record || record.id !== subject) return reply.code(401).send({ error: 'Session expired or revoked' });
    if (options.roles && !options.roles.includes(record.role)) return reply.code(403).send({ error: 'Role not permitted' });
    request.user = record;
    request.sessionHash = tokenHash(jti);
  };

  app.post('/api/auth/signup', async (request, reply) => {
    const input = SignUpSchema.parse(request.body);
    const attempt = await authAttempts.takeSignupAttempt(request.ip);
    if (!attempt.allowed) return reply.header('Retry-After', String(attempt.retryAfterSeconds)).code(429).send({ error: 'Too many sign-up attempts. Please try again later.' });
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email));
    if (existing) return reply.code(409).send({ error: 'Email already registered' });
    const user: AuthUser = { id: randomUUID(), role: input.role, email: input.email };
    try {
      await db.insert(users).values({ ...user, phone: input.phone, legalName: input.legalName ?? null, assistanceProgram: input.assistanceProgram, passwordHash: await hashPassword(input.password) });
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') return reply.code(409).send({ error: 'Email already registered' });
      throw error;
    }
    return reply.code(201).send(await issueSession(db, user, signingKey));
  });

  app.post('/api/auth/signin', async (request, reply) => {
    const input = SignInSchema.parse(request.body);
    const attempt = await authAttempts.takeSignInAttempt(request.ip, input.email);
    if (!attempt.allowed) return reply.header('Retry-After', String(attempt.retryAfterSeconds)).code(429).send({ error: 'Too many sign-in attempts. Please try again later.' });
    const [user] = await db.select().from(users).where(eq(users.email, input.email));
    if (!user?.passwordHash || !await verifyPassword(input.password, user.passwordHash)) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }
    return issueSession(db, { id: user.id, role: user.role, email: user.email }, signingKey);
  });

  app.get('/api/auth/me', { preHandler: requireAuth() }, async (request) => ({ user: request.user }));
  app.post('/api/auth/logout', { preHandler: requireAuth() }, async (request) => {
    await db.update(authSessions).set({ revokedAt: new Date() }).where(eq(authSessions.tokenHash, request.sessionHash!));
    return { signedOut: true };
  });

  return requireAuth;
}
