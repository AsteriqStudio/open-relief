import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { createHash, randomUUID } from 'node:crypto';
import { and, eq, gt, gte, inArray, lt, ne, sql, sum } from 'drizzle-orm';
import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';
import { auditLogs, bills, transactions, users } from '@open-relief/db';
import { encryptAccountNumber } from '@open-relief/db/security/encryption';
import type { IOCRExtractor } from './ocr.js';
import type { Services } from './services.js';
import { assessBillEligibility } from './services/vettingService.js';
import { isVerifiedDemoMerchantForCategory } from './biller/methodSandbox.js';

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
    const [recipient] = await tx.select().from(users).where(eq(users.id, bill.recipientId)).for('update');
    if (!recipient) throw new Error('Bill recipient no longer exists');
    const now = new Date();
    const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    const nextYearStart = new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1));
    const [aid] = await tx.select({ total: sum(sql`${transactions.amountToBillCents} + ${transactions.sponsorMatchCents}`) }).from(transactions)
      .innerJoin(bills, eq(transactions.billId, bills.id))
      .where(and(eq(bills.recipientId, recipient.id), eq(transactions.status, 'succeeded'), gte(transactions.updatedAt, yearStart), lt(transactions.updatedAt, nextYearStart)));
    const [activeBills] = await tx.select({ total: sum(bills.remainingBalanceCents) }).from(bills)
      .where(and(eq(bills.recipientId, recipient.id), inArray(bills.status, ['verified', 'funded'])));
    const [duplicate] = await tx.select({ id: bills.id }).from(bills).where(and(
      eq(bills.duplicateFingerprint, fingerprint),
      ne(bills.id, billId),
      gt(bills.createdAt, new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)),
      ne(bills.status, 'rejected'),
    )).limit(1);
    const vetting = assessBillEligibility({
      legalName: recipient.legalName,
      accountHolderName: result.accountHolderName,
      noticeText: result.noticeText,
      statementBalanceCents: result.statementBalanceCents,
      lifetimeAidCents: recipient.lifetimeAidCents,
      currentYearAidCents: Number(aid?.total ?? 0),
      activeBillCommitmentsCents: Number(activeBills?.total ?? 0),
      lastAidAt: recipient.lastAidAt,
      now,
    });
    const merchantId = result.merchantId && isVerifiedDemoMerchantForCategory(result.merchantId, bill.category)
      && bill.billerName?.trim().toLowerCase() === result.billerName.trim().toLowerCase() ? result.merchantId : null;
    const needsOcrReview = result.confidence < 85 || !merchantId;
    const nextStatus = duplicate ? 'rejected' : vetting.outcome === 'rejected' ? 'rejected' : needsOcrReview || vetting.outcome === 'pending_review' ? 'pending_review' : 'verified';
    const rejectionReason = duplicate ? 'This bill appears to duplicate a recent submission.' : vetting.reason ?? (needsOcrReview ? 'The creditor or document needs manual review.' : null);
    await tx.update(bills).set({
      billerName: result.billerName,
      accountHolderName: result.accountHolderName,
      isShutoffNotice: vetting.isShutoffNotice,
      daysUntilDisconnection: vetting.daysUntilDisconnection,
      rejectionReason,
      billerMerchantId: merchantId,
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
      id: randomUUID(), eventType: duplicate ? 'bill.duplicate_rejected' : nextStatus === 'rejected' ? 'bill.eligibility_rejected' : nextStatus === 'pending_review' ? 'bill.manual_review' : 'bill.verified',
      billId,
      metadata: { confidence: result.confidence, vettingOutcome: vetting.outcome, nameSimilarity: vetting.nameSimilarity },
    });
  });
}
