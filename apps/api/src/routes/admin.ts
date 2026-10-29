import { randomUUID } from 'node:crypto';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { and, asc, count, eq, gte, inArray, lt, sql, sum } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { auditLogs, bills, transactions, users } from '@open-relief/db';
import { LEGAL_TERMS_VERSION } from '@open-relief/shared';
import { decryptAccountNumber } from '@open-relief/db/security/encryption';
import type { registerAuth } from '../auth.js';
import { isVerifiedDemoMerchantForCategory } from '../biller/methodSandbox.js';
import { nameSimilarity } from '../services/vettingService.js';
import type { Services } from '../services.js';
import { renderPdfFirstPage } from '../pdfPreview.js';
import { DocumentTooLargeError, readDocumentBytes } from '../documentBytes.js';

const PageSchema = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(50).default(20) }).strict();
const IdSchema = z.object({ id: z.string().uuid() });
const DecisionSchema = z.object({ decision: z.enum(['approve', 'reject']), notes: z.string().trim().min(5).max(1000) }).strict();

export function registerAdminRoutes(app: FastifyInstance, services: Services, requireAuth: ReturnType<typeof registerAuth>) {
  const adminOnly = requireAuth({ roles: ['admin'] });

  app.get('/api/admin/reviews/pending', { preHandler: adminOnly }, async (request) => {
    const { page, limit } = PageSchema.parse(request.query);
    const [total] = await services.db.select({ value: count() }).from(bills).where(eq(bills.status, 'pending_review'));
    const rows = await services.db.select({
      billId: bills.id,
      recipientEmail: users.email,
      recipientLegalName: users.legalName,
      billerName: bills.billerName,
      accountHolderName: bills.accountHolderName,
      statementBalanceCents: bills.statementBalanceCents,
      daysUntilDisconnection: bills.daysUntilDisconnection,
      rejectionReason: bills.rejectionReason,
      ocrConfidence: bills.ocrConfidence,
      documentMimeType: bills.documentMimeType,
      createdAt: bills.createdAt,
    }).from(bills).innerJoin(users, eq(bills.recipientId, users.id))
      .where(eq(bills.status, 'pending_review')).orderBy(asc(bills.createdAt), asc(bills.id)).limit(limit).offset((page - 1) * limit);
    return { page, limit, total: total?.value ?? 0, reviews: rows.map((row) => ({
      ...row,
      nameMatchPercentage: row.recipientLegalName && row.accountHolderName ? Math.round(nameSimilarity(row.recipientLegalName, row.accountHolderName) * 100) : null,
    })) };
  });

  app.get('/api/admin/reviews/:id/document', { preHandler: adminOnly }, async (request, reply) => {
    const { id } = IdSchema.parse(request.params);
    const [bill] = await services.db.select({ documentKey: bills.documentKey, mimeType: bills.documentMimeType, status: bills.status }).from(bills).where(eq(bills.id, id));
    if (!bill || bill.status !== 'pending_review') return reply.code(404).send({ error: 'Review document not found' });
    const object = await services.s3.send(new GetObjectCommand({ Bucket: services.config.S3_BUCKET, Key: bill.documentKey }));
    if (!object.Body) return reply.code(404).send({ error: 'Review document not found' });
    let bytes: Buffer;
    try { bytes = await readDocumentBytes(object.Body, object.ContentLength); }
    catch (error) { if (error instanceof DocumentTooLargeError) return reply.code(413).send({ error: error.message }); throw error; }
    return reply.header('cache-control', 'no-store').type(bill.mimeType).send(bytes);
  });

  app.get('/api/admin/reviews/:id/preview', { preHandler: adminOnly }, async (request, reply) => {
    const { id } = IdSchema.parse(request.params);
    const [bill] = await services.db.select({ documentKey: bills.documentKey, mimeType: bills.documentMimeType, status: bills.status }).from(bills).where(eq(bills.id, id));
    if (!bill || bill.status !== 'pending_review') return reply.code(404).send({ error: 'Review preview not found' });
    const object = await services.s3.send(new GetObjectCommand({ Bucket: services.config.S3_BUCKET, Key: bill.documentKey }));
    if (!object.Body) return reply.code(404).send({ error: 'Review preview not found' });
    let bytes: Buffer;
    try { bytes = await readDocumentBytes(object.Body, object.ContentLength); }
    catch (error) { if (error instanceof DocumentTooLargeError) return reply.code(413).send({ error: error.message }); throw error; }
    if (bill.mimeType === 'application/pdf') {
      let preview: Buffer;
      try { preview = await renderPdfFirstPage(bytes); }
      catch { return reply.code(422).send({ error: 'PDF preview could not be rendered' }); }
      return reply.header('cache-control', 'no-store').type('image/png').send(preview);
    }
    if (bill.mimeType !== 'image/jpeg' && bill.mimeType !== 'image/png') return reply.code(415).send({ error: 'Unsupported review document type' });
    return reply.header('cache-control', 'no-store').type(bill.mimeType).send(Buffer.from(bytes));
  });

  app.post('/api/admin/reviews/:id/decision', { preHandler: adminOnly }, async (request, reply) => {
    const { id } = IdSchema.parse(request.params);
    const input = DecisionSchema.parse(request.body);
    return services.db.transaction(async (tx) => {
      const [bill] = await tx.select().from(bills).where(eq(bills.id, id)).for('update');
      if (!bill) return reply.code(404).send({ error: 'Review not found' });
      if (bill.status !== 'pending_review') return reply.code(409).send({ error: 'Review has already been decided' });
      if (input.decision === 'approve') {
        if (bill.countryCode !== 'US') return reply.code(409).send({ error: 'Only US sandbox bills can be approved' });
        if (!bill.termsAcceptedAt || bill.termsVersion !== LEGAL_TERMS_VERSION) return reply.code(409).send({ error: 'Current recipient attestation is required for approval' });
        if (!bill.billerMerchantId || !isVerifiedDemoMerchantForCategory(bill.billerMerchantId, bill.category) || !bill.billerAccountEncrypted || !bill.statementBalanceCents || bill.remainingBalanceCents !== bill.statementBalanceCents) {
          return reply.code(409).send({ error: 'A verified demo creditor and intact bill balance are required for approval' });
        }
        decryptAccountNumber(bill.billerAccountEncrypted);
        const [recipient] = await tx.select({ id: users.id }).from(users).where(eq(users.id, bill.recipientId)).for('update');
        if (!recipient) throw new Error('Review recipient not found');
        const now = new Date();
        const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
        const nextYearStart = new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1));
        const [aid] = await tx.select({ total: sum(sql`${transactions.amountToBillCents} + ${transactions.sponsorMatchCents}`) }).from(transactions)
          .innerJoin(bills, eq(transactions.billId, bills.id))
          .where(and(eq(bills.recipientId, recipient.id), eq(transactions.status, 'succeeded'), gte(transactions.updatedAt, yearStart), lt(transactions.updatedAt, nextYearStart)));
        const [active] = await tx.select({ total: sum(bills.remainingBalanceCents) }).from(bills)
          .where(and(eq(bills.recipientId, recipient.id), inArray(bills.status, ['verified', 'funded'])));
        if (Number(aid?.total ?? 0) + Number(active?.total ?? 0) + bill.statementBalanceCents > 60_000) {
          return reply.code(409).send({ error: 'Approval would exceed the calendar-year assistance limit' });
        }
      }
      const status = input.decision === 'approve' ? 'verified' : 'rejected';
      const reason = input.decision === 'reject' ? input.notes : null;
      await tx.update(bills).set({ status, rejectionReason: reason, updatedAt: new Date() }).where(eq(bills.id, id));
      const [recipient] = await tx.select({ email: users.email }).from(users).where(eq(users.id, bill.recipientId));
      if (!recipient) throw new Error('Review recipient not found');
      const notification = { to: recipient.email, billId: id, status, reason, subject: status === 'verified' ? 'Your bill was approved for the demo feed' : 'Your bill was not approved' };
      await tx.insert(auditLogs).values({
        id: randomUUID(), eventType: status === 'verified' ? 'bill.admin_approved' : 'bill.admin_rejected', actorId: request.user!.id, billId: id,
        metadata: { decision: input.decision, notes: input.notes, previousFlag: bill.rejectionReason },
      });
      return { billId: id, status, notification };
    });
  });
}
