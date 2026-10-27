import { HeadObjectCommand } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray } from 'drizzle-orm';
import Fastify from 'fastify';
import { z, ZodError } from 'zod';
import { bills, transactions, users } from '@open-relief/db';
import { CreateIntentSchema, createDonationIntent, failMockPayment, settleMockPayment, verifyMockStripeEvent } from './payments.js';
import type { Services } from './services.js';

declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: Buffer;
  }
}

const MAX_BYTES = 10 * 1024 * 1024;
const UploadRequestSchema = z.object({
  recipientId: z.string().uuid(),
  category: z.enum(['electric', 'water', 'gas', 'medical']),
  mimeType: z.enum(['image/jpeg', 'image/png', 'application/pdf']),
  sizeBytes: z.number().int().positive().max(MAX_BYTES),
  zipCode: z.string().regex(/^\d{5}$/),
  story: z.string().min(1).max(240),
}).strict();
const BillIdSchema = z.object({ id: z.string().uuid() });

export function buildApp(services: Services) {
  const app = Fastify({ logger: false, bodyLimit: 1024 * 1024 });
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (request, body, done) => {
    try {
      const raw = Buffer.isBuffer(body) ? body : Buffer.from(body);
      if (request.url === '/api/webhooks/stripe') request.rawBody = raw;
      done(null, JSON.parse(raw.toString('utf8')));
    } catch {
      done(Object.assign(new Error('Invalid JSON'), { statusCode: 400 }), undefined);
    }
  });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      reply.code(400).send({ error: 'Invalid request', details: error.flatten() });
      return;
    }
    if (typeof error === 'object' && error !== null && 'statusCode' in error && typeof error.statusCode === 'number' && error.statusCode < 500) {
      reply.code(error.statusCode).send({ error: 'message' in error && typeof error.message === 'string' ? error.message : 'Invalid request' });
      return;
    }
    reply.code(500).send({ error: 'Internal server error' });
  });

  app.get('/health', async () => ({ status: 'ok' }));

  app.post('/api/bills/upload-url', async (request, reply) => {
    const input = UploadRequestSchema.parse(request.body);
    const [recipient] = await services.db.select({ id: users.id }).from(users).where(and(eq(users.id, input.recipientId), eq(users.role, 'recipient')));
    if (!recipient) return reply.code(404).send({ error: 'Recipient not found' });
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
      recipientId: input.recipientId,
      category: input.category,
      documentUrl: `s3://${services.config.S3_BUCKET}/${key}`,
      documentKey: key,
      documentMimeType: input.mimeType,
      documentSizeBytes: input.sizeBytes,
      zipCode: input.zipCode,
      story: input.story,
    });
    return reply.code(201).send({ billId, url: post.url, fields: post.fields, expiresInSeconds: 300 });
  });

  app.post('/api/bills/:id/complete', async (request, reply) => {
    const { id } = BillIdSchema.parse(request.params);
    const [bill] = await services.db.select().from(bills).where(eq(bills.id, id));
    if (!bill) return reply.code(404).send({ error: 'Bill not found' });
    if (bill.status !== 'pending_ocr') return reply.code(409).send({ error: 'Bill is not awaiting OCR' });
    const metadata = await services.s3.send(new HeadObjectCommand({ Bucket: services.config.S3_BUCKET, Key: `bills/${id}/original` }));
    if (!metadata.ContentLength || metadata.ContentLength > MAX_BYTES || metadata.ContentType !== bill.documentMimeType) {
      return reply.code(400).send({ error: 'Uploaded document does not match the declared file' });
    }
    await services.queue.add('process', { billId: id }, { jobId: id, attempts: 3, backoff: { type: 'exponential', delay: 1000 } });
    return reply.code(202).send({ billId: id, status: 'scanning' });
  });

  app.get('/api/bills/:id', async (request, reply) => {
    const { id } = BillIdSchema.parse(request.params);
    const [bill] = await services.db.select({ id: bills.id, status: bills.status, remainingBalanceCents: bills.remainingBalanceCents }).from(bills).where(eq(bills.id, id));
    return bill ?? reply.code(404).send({ error: 'Bill not found' });
  });

  app.get('/api/bills/feed', async () => {
    const rows = await services.db.select({
      id: bills.id,
      billerName: bills.billerName,
      category: bills.category,
      zipCode: bills.zipCode,
      story: bills.story,
      statementBalanceCents: bills.statementBalanceCents,
      remainingBalanceCents: bills.remainingBalanceCents,
      status: bills.status,
    }).from(bills).where(inArray(bills.status, ['verified', 'funded'])).orderBy(desc(bills.createdAt)).limit(50);
    return { bills: rows };
  });

  app.post('/api/donations/create-intent', async (request, reply) => {
    const input = CreateIntentSchema.parse(request.body);
    const result = await createDonationIntent(input, services);
    return reply.code(201).send({ ...result, mode: 'mock' });
  });

  app.post('/api/webhooks/stripe', async (request, reply) => {
    const signature = request.headers['stripe-signature'];
    if (typeof signature !== 'string' || !request.rawBody) return reply.code(400).send({ error: 'Missing webhook signature' });
    let event;
    try {
      event = verifyMockStripeEvent(request.rawBody, signature, services.config.MOCK_STRIPE_WEBHOOK_SECRET);
    } catch {
      return reply.code(400).send({ error: 'Invalid webhook signature or event' });
    }
    if (event.type === 'payment_intent.payment_failed') {
      await failMockPayment(event.data.object.id, services);
      return { received: true };
    }
    return { received: true, settlement: await settleMockPayment(event.data.object.id, services) };
  });

  app.post('/api/demo/donations/:id/complete', async (request, reply) => {
    const { id } = BillIdSchema.parse(request.params);
    const [transaction] = await services.db.select({ paymentIntentId: transactions.stripePaymentIntentId }).from(transactions).where(eq(transactions.id, id));
    if (!transaction?.paymentIntentId) return reply.code(404).send({ error: 'Mock donation not found' });
    return { mode: 'mock', settlement: await settleMockPayment(transaction.paymentIntentId, services) };
  });

  app.get('/api/donations/:id/receipt', async (request, reply) => {
    const { id } = BillIdSchema.parse(request.params);
    const [row] = await services.db.select({
      id: transactions.id,
      status: transactions.status,
      amountToBillCents: transactions.amountToBillCents,
      totalChargeCents: transactions.totalChargeCents,
      processingFeeCoveredCents: transactions.processingFeeCoveredCents,
      platformTipCents: transactions.platformTipCents,
      methodDisbursementId: transactions.methodDisbursementId,
      billerName: bills.billerName,
      createdAt: transactions.createdAt,
    }).from(transactions).innerJoin(bills, eq(transactions.billId, bills.id)).where(eq(transactions.id, id));
    if (!row || row.status !== 'succeeded') return reply.code(404).send({ error: 'Settled donation not found' });
    return {
      ...row,
      mode: 'mock',
      taxNotice: 'This demo receipt does not establish a tax-deductible charitable contribution.',
    };
  });

  return app;
}
