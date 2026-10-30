import { randomUUID } from 'node:crypto';
import { HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { fileTypeFromBuffer } from 'file-type';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { bills, sponsorshipPools } from '@open-relief/db';
import { decryptAccountNumber } from '@open-relief/db/security/encryption';
import { BillCategorySchema, CountryCodeSchema, LEGAL_TERMS_VERSION, LegalAcceptanceSchema, canSubmitConnectedSandboxBill } from '@open-relief/shared';
import type { registerAuth } from '../auth.js';
import type { Services } from '../services.js';

const MAX_BYTES = 10 * 1024 * 1024;
const UploadRequestSchema = z.object({
  countryCode: CountryCodeSchema,
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
    if (!canSubmitConnectedSandboxBill(input.countryCode)) {
      return reply.code(422).send({ error: 'Connected bill intake is currently limited to the US sandbox. No public payment service is available.' });
    }
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
      countryCode: input.countryCode,
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

  app.put('/api/bills/:id/document', { onRequest: requireAuth({ roles: ['recipient'] }), bodyLimit: MAX_BYTES }, async (request, reply) => {
    const { id } = BillIdSchema.parse(request.params);
    const [bill] = await services.db.select({ recipientId: bills.recipientId, status: bills.status, documentKey: bills.documentKey, documentMimeType: bills.documentMimeType, documentSizeBytes: bills.documentSizeBytes, termsAcceptedAt: bills.termsAcceptedAt }).from(bills).where(eq(bills.id, id));
    if (!bill) return reply.code(404).send({ error: 'Bill not found' });
    if (bill.recipientId !== request.user!.id) return reply.code(403).send({ error: 'Bill belongs to another recipient' });
    if (bill.status !== 'pending_ocr' || !bill.termsAcceptedAt) return reply.code(409).send({ error: 'Bill is not awaiting a document' });
    const body = request.body;
    if (!Buffer.isBuffer(body) || body.length === 0 || body.length !== bill.documentSizeBytes) return reply.code(400).send({ error: 'Document size does not match the declared file' });
    const detected = await fileTypeFromBuffer(body);
    if (detected?.mime !== bill.documentMimeType) return reply.code(400).send({ error: 'Document type does not match the declared file' });
    await services.s3.send(new PutObjectCommand({ Bucket: services.config.S3_BUCKET, Key: bill.documentKey, Body: body, ContentType: bill.documentMimeType }));
    return { billId: id, uploaded: true };
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

  app.get('/api/bills/:id', { preHandler: requireAuth({ roles: ['recipient', 'admin'] }) }, async (request, reply) => {
    const { id } = BillIdSchema.parse(request.params);
    const [bill] = await services.db.select({ id: bills.id, recipientId: bills.recipientId, status: bills.status, remainingBalanceCents: bills.remainingBalanceCents, rejectionReason: bills.rejectionReason }).from(bills).where(eq(bills.id, id));
    if (!bill || (bill.recipientId !== request.user!.id && request.user!.role !== 'admin')) {
      return reply.code(404).send({ error: 'Bill not found' });
    }
    return { id: bill.id, status: bill.status, remainingBalanceCents: bill.remainingBalanceCents, rejectionReason: bill.rejectionReason };
  });

  app.get('/api/bills/mine', { preHandler: requireAuth({ roles: ['recipient'] }) }, async (request) => {
    const rows = await services.db.select({
      id: bills.id, billerName: bills.billerName, category: bills.category, status: bills.status,
      statementBalanceCents: bills.statementBalanceCents, remainingBalanceCents: bills.remainingBalanceCents,
      rejectionReason: bills.rejectionReason, createdAt: bills.createdAt,
    }).from(bills).where(eq(bills.recipientId, request.user!.id)).orderBy(desc(bills.createdAt)).limit(50);
    return { bills: rows.map((bill) => ({ ...bill, createdAt: bill.createdAt.toISOString() })) };
  });

  app.get('/api/bills/feed', async (request) => {
    const query = FeedQuerySchema.parse(request.query);
    const pools = await services.db.select().from(sponsorshipPools).where(eq(sponsorshipPools.active, true)).orderBy(asc(sponsorshipPools.createdAt));
    const rows = await services.db.select({
      id: bills.id, countryCode: bills.countryCode, billerName: bills.billerName, category: bills.category, zipCode: bills.zipCode, story: bills.story,
      statementBalanceCents: bills.statementBalanceCents, remainingBalanceCents: bills.remainingBalanceCents, status: bills.status,
      isShutoffNotice: bills.isShutoffNotice, daysUntilDisconnection: bills.daysUntilDisconnection,
      billerAccountEncrypted: bills.billerAccountEncrypted,
    }).from(bills).where(and(eq(bills.countryCode, 'US'), inArray(bills.status, ['verified', 'funded']), query.category ? eq(bills.category, query.category) : undefined)).orderBy(desc(bills.createdAt)).limit(50);
    return { bills: rows.map(({ billerAccountEncrypted, ...bill }) => ({
      ...bill,
      accountLast4: billerAccountEncrypted ? decryptAccountNumber(billerAccountEncrypted).slice(-4) : null,
      sponsor: (() => {
        const pool = pools.find((candidate) => (candidate.targetCategory === null || candidate.targetCategory === bill.category) && (candidate.remainingMatchBudgetCents > 0 || candidate.remainingFeeBufferCents > 0));
        return pool ? { id: pool.id, name: pool.sponsorName, matchRatio: Number(pool.matchRatio), remainingMatchBudgetCents: pool.remainingMatchBudgetCents, remainingFeeBufferCents: pool.remainingFeeBufferCents } : null;
      })(),
    })) };
  });
}
