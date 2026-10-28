import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { bills, users } from '@open-relief/db';
import { encryptAccountNumber } from '@open-relief/db/security/encryption';
import { buildApp } from '../dist/app.js';
import { ApiConfigSchema } from '../dist/config.js';
import { processUploadedBill } from '../dist/ingestion.js';
import { createServices } from '../dist/services.js';
import { assessBillEligibility, nameSimilarity } from '../dist/services/vettingService.js';

const now = new Date('2026-10-28T12:00:00Z');
const base = {
  legalName: 'Demo Recipient', accountHolderName: 'Demo Recipient', noticeText: 'FINAL NOTICE: Past due. Disconnection in 4 days.',
  statementBalanceCents: 12_000, lifetimeAidCents: 0, currentYearAidCents: 0, activeBillCommitmentsCents: 0, lastAidAt: null, now,
};

test('urgency, annual cap, cooldown, and name match gate verification', () => {
  assert.equal(assessBillEligibility({ ...base, noticeText: 'Your ordinary monthly statement' }).outcome, 'rejected');
  assert.equal(assessBillEligibility({ ...base, noticeText: 'Your ordinary monthly statement' }).reason, 'Currently prioritizing accounts with active shut-off or past-due notices.');
  assert.equal(assessBillEligibility({ ...base, currentYearAidCents: 50_000 }).outcome, 'rejected');
  assert.equal(assessBillEligibility({ ...base, activeBillCommitmentsCents: 50_000 }).outcome, 'rejected');
  assert.equal(assessBillEligibility({ ...base, lifetimeAidCents: 70_000 }).outcome, 'verified');
  assert.equal(assessBillEligibility({ ...base, lastAidAt: new Date(now.getTime() - 59 * 24 * 60 * 60 * 1000) }).outcome, 'pending_review');
  assert.equal(assessBillEligibility({ ...base, lastAidAt: new Date(now.getTime() - 61 * 24 * 60 * 60 * 1000) }).outcome, 'verified');
  assert.equal(assessBillEligibility({ ...base, accountHolderName: 'Unrelated Person' }).outcome, 'pending_review');
  assert.equal(assessBillEligibility({ ...base, accountHolderName: null }).outcome, 'pending_review');
  assert.equal(assessBillEligibility(base).daysUntilDisconnection, 4);
  assert.equal(assessBillEligibility(base).isShutoffNotice, true);
  assert.equal(assessBillEligibility({ ...base, noticeText: 'PAST DUE' }).isShutoffNotice, false);
  assert.ok(nameSimilarity('Demo Recipient', 'Demo Recipient') >= 0.8);
  assert.ok(nameSimilarity('Demo Recipient', 'Unrelated Person') < 0.8);
});

test('OCR ingestion rejects ineligible bills and keeps name mismatch in review', async () => {
  const config = ApiConfigSchema.parse(process.env);
  const services = await createServices(config);
  const app = buildApp(services);
  const image = await sharp({ create: { width: 4, height: 4, channels: 3, background: { r: 13, g: 113, b: 181 } } }).jpeg().toBuffer();
  const createBill = async (recipientId: string, status: 'pending_ocr' | 'verified' = 'pending_ocr', balance = 12_000, category: 'electric' | 'telecom' = 'electric') => {
    const id = randomUUID();
    const documentKey = `vetting/${id}.jpg`;
    await services.db.insert(bills).values({
      id, recipientId, category, billerName: 'Demo Utility', documentUrl: `s3://${config.S3_BUCKET}/${documentKey}`, documentKey,
      documentMimeType: 'image/jpeg', documentSizeBytes: image.length, status,
      ...(status === 'verified' ? { statementBalanceCents: balance, remainingBalanceCents: balance, billerName: 'Demo Utility', billerMerchantId: 'mock-demo-utility', billerAccountEncrypted: encryptAccountNumber(`DEMO-${id}`) } : {}),
    });
    if (status === 'pending_ocr') await services.s3.send(new PutObjectCommand({ Bucket: config.S3_BUCKET, Key: documentKey, Body: image, ContentType: 'image/jpeg' }));
    return id;
  };
  const createUser = async () => {
    const id = randomUUID();
    await services.db.insert(users).values({ id, role: 'recipient', email: `${id}@example.invalid`, phone: '+15555550122', legalName: 'Demo Recipient' });
    return id;
  };
  const run = async (noticeText: string, accountHolderName: string, activeBalance = 0, lastAidAt: Date | null = null, category: 'electric' | 'telecom' = 'electric') => {
    const recipientId = await createUser();
    if (lastAidAt) await services.db.update(users).set({ lastAidAt }).where(eq(users.id, recipientId));
    if (activeBalance) await createBill(recipientId, 'verified', activeBalance);
    const billId = await createBill(recipientId, 'pending_ocr', 12_000, category);
    await processUploadedBill(billId, services, { async extract() {
      return { billerName: 'Demo Utility', accountNumber: `DEMO-${billId}`, dueDate: '2026-12-15', statementBalanceCents: 12_000,
        confidence: 98, merchantId: 'mock-demo-utility', accountHolderName, noticeText };
    } });
    const [bill] = await services.db.select().from(bills).where(eq(bills.id, billId));
    assert.ok(bill);
    const feed = (await app.inject({ method: 'GET', url: '/api/bills/feed' })).json<{ bills: Array<{ id: string }> }>();
    assert.equal(feed.bills.some((item) => item.id === billId), bill.status === 'verified');
    return bill;
  };
  try {
    await app.ready();
    const nonUrgent = await run('Monthly statement', 'Demo Recipient');
    assert.equal(nonUrgent.status, 'rejected');
    assert.match(nonUrgent.rejectionReason ?? '', /prioritizing accounts/);
    const overCap = await run('PAST DUE', 'Demo Recipient', 50_000);
    assert.equal(overCap.status, 'rejected');
    assert.match(overCap.rejectionReason ?? '', /calendar-year assistance limit/);
    const mismatch = await run('FINAL NOTICE', 'Different Person');
    assert.equal(mismatch.status, 'pending_review');
    const cooldown = await run('FINAL NOTICE', 'Demo Recipient', 0, new Date());
    assert.equal(cooldown.status, 'pending_review');
    const eligible = await run('FINAL NOTICE: Disconnection in 4 days', 'Demo Recipient');
    assert.equal(eligible.status, 'verified');
    assert.equal(eligible.daysUntilDisconnection, 4);
    const wrongCategory = await run('FINAL NOTICE: Disconnection in 4 days', 'Demo Recipient', 0, null, 'telecom');
    assert.equal(wrongCategory.status, 'pending_review');
    assert.equal(wrongCategory.billerMerchantId, null);
  } finally {
    await app.close();
    await services.close();
  }
});
