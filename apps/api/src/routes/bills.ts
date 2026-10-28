import { randomUUID } from 'node:crypto';
import { HeadObjectCommand } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { bills } from '@open-relief/db';
import { decryptAccountNumber } from '@open-relief/db/security/encryption';
import { BillCategorySchema, LEGAL_TERMS_VERSION, LegalAcceptanceSchema } from '@open-relief/shared';
import type { registerAuth } from '../auth.js';
import type { Services } from '../services.js';

const MAX_BYTES = 10 * 1024 * 1024;
const UploadRequestSchema = z.object({
  category: z.enum(['electric', 'water', 'gas', 'medical', 'telecom']),
  mimeType: z.enum(['image/jpeg', 'image/png', 'application/pdf']),
  sizeBytes: z.number().int().positive().max(MAX_BYTES),
  zipCode: z.string().regex(/^\d{5}$/),
  story: z.string().min(1).max(240),
  declaredBillerName: z.string().trim().min(2).max(120),
  attestation: LegalAcceptanceSchema,
}).strict();
const BillIdSchema = z.object({ id: z.string().uuid() });
const FeedQuerySchema = z.object({ category: BillCategorySchema.optional() }).strict();

export function registerBillRoutes(app: FastifyInstance, services: Services, requireAuth: ReturnType<typeof registerAuth>) {
  app.post('/api/bills/upload-url', { preHandler: requireAuth({ roles: ['recipient'] }) }, async (request, reply) => {
    const input = UploadRequestSchema.parse(request.body);
    const billId = randomUUID();
    const key = `bills/${billId}/original`;
    const post = await createPresignedPost(services.s3, {
      Bucket: services.config.S3_BUCKET,
      Key: key,
      Expires: 300,
      Fields: { 'Content-Type': input.mimeType },
      Conditions: [['content-length-range', 1, MAX_BYTES], ['eq', '$Content-Type', input.mimeType]],
    });
    await services.db.insert(bills).values({
      id: billId,
      recipientId: request.user!.id,
      category: input.category,
      billerName: input.declaredBillerName,
      documentUrl: `s3://${services.config.S3_BUCKET}/${key}`,
      documentKey: key,
      documentMimeType: input.mimeType,
      documentSizeBytes: input.sizeBytes,
      zipCode: input.zipCode,
      story: input.story,
      termsAcceptedAt: new Date(),
      termsVersion: LEGAL_TERMS_VERSION,
    });
    return reply.code(201).send({ billId, url: post.url, fields: post.fields, expiresInSeconds: 300 });
  });

  app.post('/api/bills/:id/complete', { preHandler: requireAuth({ roles: ['recipient'] }) }, async (request, reply) => {
    const { id } = BillIdSchema.parse(request.params);
    const [bill] = await services.db.select().from(bills).where(eq(bills.id, id));
    if (!bill) return reply.code(404).send({ error: 'Bill not found' });
    if (bill.recipientId !== request.user!.id) return reply.code(403).send({ error: 'Bill belongs to another recipient' });
    if (bill.status !== 'pending_ocr') return reply.code(409).send({ error: 'Bill is not awaiting OCR' });
    if (!bill.termsAcceptedAt || bill.termsVersion !== LEGAL_TERMS_VERSION) return reply.code(409).send({ error: 'Current recipient attestation is required' });
    const metadata = await services.s3.send(new HeadObjectCommand({ Bucket: services.config.S3_BUCKET, Key: `bills/${id}/original` }));
    if (!metadata.ContentLength || metadata.ContentLength > MAX_BYTES || metadata.ContentType !== bill.documentMimeType) {
      return reply.code(400).send({ error: 'Uploaded document does not match the declared file' });
    }
    await services.queue.add('process', { billId: id }, { jobId: id, attempts: 3, backoff: { type: 'exponential', delay: 1000 } });
    return reply.code(202).send({ billId: id, status: 'scanning' });
  });

  app.get('/api/bills/:id', { preHandler: requireAuth() }, async (request, reply) => {
    const { id } = BillIdSchema.parse(request.params);
    const [bill] = await services.db.select({ id: bills.id, recipientId: bills.recipientId, status: bills.status, remainingBalanceCents: bills.remainingBalanceCents, rejectionReason: bills.rejectionReason }).from(bills).where(eq(bills.id, id));
    if (!bill || ((bill.status === 'pending_ocr' || bill.status === 'pending_review' || bill.status === 'rejected') && bill.recipientId !== request.user!.id && request.user!.role !== 'admin')) {
      return reply.code(404).send({ error: 'Bill not found' });
    }
    return { id: bill.id, status: bill.status, remainingBalanceCents: bill.remainingBalanceCents, rejectionReason: bill.recipientId === request.user!.id || request.user!.role === 'admin' ? bill.rejectionReason : null };
  });

  app.get('/api/bills/feed', async (request) => {
    const query = FeedQuerySchema.parse(request.query);
    const rows = await services.db.select({
      id: bills.id, billerName: bills.billerName, category: bills.category, zipCode: bills.zipCode, story: bills.story,
      statementBalanceCents: bills.statementBalanceCents, remainingBalanceCents: bills.remainingBalanceCents, status: bills.status,
      isShutoffNotice: bills.isShutoffNotice, daysUntilDisconnection: bills.daysUntilDisconnection,
      billerAccountEncrypted: bills.billerAccountEncrypted,
    }).from(bills).where(and(inArray(bills.status, ['verified', 'funded']), query.category ? eq(bills.category, query.category) : undefined)).orderBy(desc(bills.createdAt)).limit(50);
    return { bills: rows.map(({ billerAccountEncrypted, ...bill }) => ({
      ...bill,
      accountLast4: billerAccountEncrypted ? decryptAccountNumber(billerAccountEncrypted).slice(-4) : null,
    })) };
  });
}
