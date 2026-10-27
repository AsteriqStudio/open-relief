import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { createHash, randomUUID } from 'node:crypto';
import { and, eq, gt, ne, sql } from 'drizzle-orm';
import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';
import { auditLogs, bills } from '@open-relief/db';
import { encryptAccountNumber } from '@open-relief/db/security/encryption';
import type { IOCRExtractor } from './ocr.js';
import type { Services } from './services.js';

const MAX_BYTES = 10 * 1024 * 1024;
const MIME_TYPES = new Set(['image/jpeg', 'image/png', 'application/pdf']);

export async function processUploadedBill(billId: string, services: Services, extractor: IOCRExtractor): Promise<void> {
  const [bill] = await services.db.select().from(bills).where(eq(bills.id, billId));
  if (!bill || bill.status !== 'pending_ocr') return;
  const object = await services.s3.send(new GetObjectCommand({ Bucket: services.config.S3_BUCKET, Key: bill.documentKey }));
  if (!object.Body) throw new Error('Uploaded document is empty');
  const raw = await object.Body.transformToByteArray();
  const detected = await fileTypeFromBuffer(raw);
  if (!detected || !MIME_TYPES.has(detected.mime) || raw.length === 0 || raw.length > MAX_BYTES || detected.mime !== bill.documentMimeType) {
    await services.db.update(bills).set({ status: 'rejected', updatedAt: new Date() }).where(eq(bills.id, billId));
    throw new Error('Uploaded document failed type or size validation');
  }

  let cleaned: Buffer<ArrayBufferLike> = Buffer.from(raw);
  if (detected.mime === 'image/jpeg') cleaned = await sharp(raw).rotate().jpeg().toBuffer();
  if (detected.mime === 'image/png') cleaned = await sharp(raw).rotate().png().toBuffer();
  const sanitizedKey = `bills/${billId}/sanitized.${detected.ext}`;
  await services.s3.send(new PutObjectCommand({ Bucket: services.config.S3_BUCKET, Key: sanitizedKey, Body: cleaned, ContentType: detected.mime }));

  const result = await extractor.extract(cleaned);
  const accountHash = createHash('sha256').update(result.accountNumber.trim()).digest('hex');
  const fingerprint = createHash('sha256').update(`${result.billerName.trim().toLowerCase()}|${accountHash}|${result.dueDate}`).digest('hex');
  await services.db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${fingerprint}))`);
    const [duplicate] = await tx.select({ id: bills.id }).from(bills).where(and(
      eq(bills.duplicateFingerprint, fingerprint),
      ne(bills.id, billId),
      gt(bills.createdAt, new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)),
      ne(bills.status, 'rejected'),
    )).limit(1);
    const needsReview = result.confidence < 85 || !result.merchantId;
    const nextStatus = duplicate ? 'rejected' : needsReview ? 'pending_ocr' : 'verified';
    await tx.update(bills).set({
      billerName: result.billerName,
      billerMerchantId: result.merchantId,
      billerAccountEncrypted: encryptAccountNumber(result.accountNumber),
      accountHash,
      duplicateFingerprint: fingerprint,
      dueDate: result.dueDate,
      statementBalanceCents: result.statementBalanceCents,
      remainingBalanceCents: result.statementBalanceCents,
      documentKey: sanitizedKey,
      documentUrl: `s3://${services.config.S3_BUCKET}/${sanitizedKey}`,
      documentSizeBytes: cleaned.length,
      ocrConfidence: result.confidence,
      fraudScore: 100 - result.confidence,
      status: nextStatus,
      updatedAt: new Date(),
    }).where(eq(bills.id, billId));
    await tx.insert(auditLogs).values({
      id: randomUUID(), eventType: duplicate ? 'bill.duplicate_rejected' : needsReview ? 'bill.manual_review' : 'bill.verified',
      billId,
      metadata: { confidence: result.confidence },
    });
  });
}
