import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { auditLogs, bills, users } from '@open-relief/db';
import { encryptAccountNumber } from '@open-relief/db/security/encryption';
import { buildApp } from '../dist/app.js';
import { hashPassword } from '../dist/auth.js';
import { ApiConfigSchema } from '../dist/config.js';
import { createServices } from '../dist/services.js';
import { renderPdfFirstPage } from '../dist/pdfPreview.js';

function samplePdf() {
  const content = 'BT /F1 18 Tf 30 100 Td (PAST DUE) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 150] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = objects.map((body, index) => {
    const offset = Buffer.byteLength(pdf);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
    return offset;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

test('admin triage is role guarded, paginated, audited and controls feed visibility', async () => {
  const config = ApiConfigSchema.parse(process.env);
  const services = await createServices(config);
  const app = buildApp(services);
  const adminId = randomUUID();
  const recipientId = randomUUID();
  const donorId = randomUUID();
  const approveId = randomUUID();
  const rejectId = randomUUID();
  const noTermsId = randomUUID();
  const overCapId = randomUUID();
  const pdfId = randomUUID();
  const image = await sharp({ create: { width: 4, height: 4, channels: 3, background: { r: 55, g: 100, b: 155 } } }).jpeg().toBuffer();
  const credentials = { email: `${adminId}@example.invalid`, password: 'local admin test password 2026' };
  const makeBill = async (id: string, status: 'pending_review' | 'verified', withTerms = true) => {
    const documentKey = `admin-test/${id}.jpg`;
    await services.s3.send(new PutObjectCommand({ Bucket: config.S3_BUCKET, Key: documentKey, Body: image, ContentType: 'image/jpeg' }));
    await services.db.insert(bills).values({
      id, recipientId, category: 'electric', documentKey, documentUrl: `s3://${config.S3_BUCKET}/${documentKey}`,
      documentMimeType: 'image/jpeg', documentSizeBytes: image.length, status, billerName: 'Demo Utility',
      accountHolderName: 'Different Person', billerMerchantId: 'mock-demo-utility', billerAccountEncrypted: encryptAccountNumber(`DEMO-${id}`),
      statementBalanceCents: 5000, remainingBalanceCents: 5000, rejectionReason: status === 'pending_review' ? 'Name mismatch' : null,
      ...(withTerms ? { termsAcceptedAt: new Date(), termsVersion: 'v1.0' } : {}),
    });
  };
  try {
    await app.ready();
    await services.db.insert(users).values([
      { id: adminId, role: 'admin', email: credentials.email, phone: '+15555550120', passwordHash: await hashPassword(credentials.password) },
      { id: recipientId, role: 'recipient', email: `${recipientId}@example.invalid`, legalName: 'Demo Recipient', phone: '+15555550121' },
      { id: donorId, role: 'donor', email: `${donorId}@example.invalid`, phone: '+15555550122' },
    ]);
    await makeBill(approveId, 'pending_review');
    await makeBill(rejectId, 'pending_review');
    await makeBill(noTermsId, 'pending_review', false);
    await makeBill(randomUUID(), 'verified');
    const pdf = samplePdf();
    assert.equal((await sharp(await renderPdfFirstPage(pdf)).metadata()).format, 'png');
    const pdfKey = `admin-test/${pdfId}.pdf`;
    await services.s3.send(new PutObjectCommand({ Bucket: config.S3_BUCKET, Key: pdfKey, Body: pdf, ContentType: 'application/pdf' }));
    await services.db.insert(bills).values({
      id: pdfId, recipientId, category: 'electric', documentKey: pdfKey, documentUrl: `s3://${config.S3_BUCKET}/${pdfKey}`,
      documentMimeType: 'application/pdf', documentSizeBytes: pdf.length, status: 'pending_review', billerName: 'Demo Utility',
      accountHolderName: 'Demo Recipient', billerMerchantId: 'mock-demo-utility', billerAccountEncrypted: encryptAccountNumber(`DEMO-${pdfId}`),
      statementBalanceCents: 5000, remainingBalanceCents: 5000, termsAcceptedAt: new Date(), termsVersion: 'v1.0',
    });
    const signIn = await app.inject({ method: 'POST', url: '/api/auth/signin', payload: credentials });
    assert.equal(signIn.statusCode, 200, signIn.body);
    const adminToken = signIn.json<{ token: string }>().token;
    const adminHeaders = { authorization: `Bearer ${adminToken}` };
    const donorSignIn = await app.inject({ method: 'POST', url: '/api/auth/signup', payload: { email: `${randomUUID()}@example.invalid`, password: 'local donor password 2026', phone: '+15555550123', role: 'donor' } });
    assert.equal(donorSignIn.statusCode, 201);
    const donorHeaders = { authorization: `Bearer ${donorSignIn.json<{ token: string }>().token}` };
    assert.equal((await app.inject({ method: 'GET', url: '/api/admin/reviews/pending', headers: donorHeaders })).statusCode, 403);
    assert.equal((await app.inject({ method: 'POST', url: `/api/admin/reviews/${approveId}/decision`, headers: donorHeaders, payload: { decision: 'approve', notes: 'looks valid' } })).statusCode, 403);
    assert.equal((await app.inject({ method: 'GET', url: `/api/admin/reviews/${approveId}/document`, headers: donorHeaders })).statusCode, 403);
    assert.equal((await app.inject({ method: 'GET', url: `/api/admin/reviews/${pdfId}/preview`, headers: donorHeaders })).statusCode, 403);
    type ReviewRow = { billId: string; nameMatchPercentage: number | null; recipientLegalName: string | null; accountHolderName: string | null };
    const listPending = async (): Promise<ReviewRow[]> => {
      const rows: ReviewRow[] = [];
      let page = 1;
      let total = 0;
      do {
        const response = await app.inject({ method: 'GET', url: `/api/admin/reviews/pending?page=${page}&limit=50`, headers: adminHeaders });
        assert.equal(response.statusCode, 200, response.body);
        const result = response.json<{ reviews: ReviewRow[]; total: number }>();
        rows.push(...result.reviews);
        total = result.total;
        if (result.reviews.length === 0) break;
        page += 1;
      } while (rows.length < total);
      return rows;
    };
    const pending = await listPending();
    assert.ok(pending.some((row) => row.billId === approveId && row.nameMatchPercentage !== null && row.nameMatchPercentage < 80 && row.recipientLegalName === 'Demo Recipient' && row.accountHolderName === 'Different Person'));
    assert.ok(pending.some((row) => row.billId === rejectId));
    const firstPage = (await app.inject({ method: 'GET', url: '/api/admin/reviews/pending?page=1&limit=1', headers: adminHeaders })).json<{ reviews: unknown[]; total: number; limit: number }>();
    assert.equal(firstPage.reviews.length, 1);
    assert.equal(firstPage.limit, 1);
    assert.ok(firstPage.total >= 3);
    const preview = await app.inject({ method: 'GET', url: `/api/admin/reviews/${approveId}/document`, headers: adminHeaders });
    assert.equal(preview.statusCode, 200);
    assert.match(preview.headers['content-type'] ?? '', /image\/jpeg/);
    assert.equal(preview.rawPayload.length, image.length);
    const imagePreview = await app.inject({ method: 'GET', url: `/api/admin/reviews/${approveId}/preview`, headers: adminHeaders });
    assert.equal(imagePreview.statusCode, 200, imagePreview.body);
    assert.match(imagePreview.headers['content-type'] ?? '', /image\/jpeg/);
    assert.deepEqual(imagePreview.rawPayload, image);
    const pdfPreview = await app.inject({ method: 'GET', url: `/api/admin/reviews/${pdfId}/preview`, headers: adminHeaders });
    assert.equal(pdfPreview.statusCode, 200, pdfPreview.body);
    assert.match(pdfPreview.headers['content-type'] ?? '', /image\/png/);
    assert.equal((await sharp(pdfPreview.rawPayload).metadata()).format, 'png');
    const missingTerms = await app.inject({ method: 'POST', url: `/api/admin/reviews/${noTermsId}/decision`, headers: adminHeaders, payload: { decision: 'approve', notes: 'attempted approval' } });
    assert.equal(missingTerms.statusCode, 409);
    const approved = await app.inject({ method: 'POST', url: `/api/admin/reviews/${approveId}/decision`, headers: adminHeaders, payload: { decision: 'approve', notes: 'Verified demo creditor and document' } });
    assert.equal(approved.statusCode, 200, approved.body);
    assert.equal(approved.json<{ notification: { to: string } }>().notification.to, `${recipientId}@example.invalid`);
    const replay = await app.inject({ method: 'POST', url: `/api/admin/reviews/${approveId}/decision`, headers: adminHeaders, payload: { decision: 'reject', notes: 'late decision' } });
    assert.equal(replay.statusCode, 409);
    assert.equal((await app.inject({ method: 'GET', url: `/api/admin/reviews/${approveId}/preview`, headers: adminHeaders })).statusCode, 404);
    const feed = (await app.inject({ method: 'GET', url: '/api/bills/feed' })).json<{ bills: Array<{ id: string }> }>().bills;
    assert.ok(feed.some((row) => row.id === approveId));
    const rejected = await app.inject({ method: 'POST', url: `/api/admin/reviews/${rejectId}/decision`, headers: adminHeaders, payload: { decision: 'reject', notes: 'Name Mismatch' } });
    assert.equal(rejected.statusCode, 200, rejected.body);
    const [rejectedBill] = await services.db.select().from(bills).where(eq(bills.id, rejectId));
    assert.equal(rejectedBill?.status, 'rejected');
    assert.equal(rejectedBill.rejectionReason, 'Name Mismatch');
    await makeBill(overCapId, 'pending_review');
    await makeBill(randomUUID(), 'verified');
    const [highBalance] = await services.db.select().from(bills).where(eq(bills.id, overCapId));
    assert.ok(highBalance);
    await services.db.update(bills).set({ statementBalanceCents: 55_000, remainingBalanceCents: 55_000 }).where(eq(bills.id, overCapId));
    const overCap = await app.inject({ method: 'POST', url: `/api/admin/reviews/${overCapId}/decision`, headers: adminHeaders, payload: { decision: 'approve', notes: 'Would exceed annual limit' } });
    assert.equal(overCap.statusCode, 409);
    const feedAfter = (await app.inject({ method: 'GET', url: '/api/bills/feed' })).json<{ bills: Array<{ id: string }> }>().bills;
    assert.ok(!feedAfter.some((row) => row.id === rejectId));
    const logs = await services.db.select().from(auditLogs).where(eq(auditLogs.billId, rejectId));
    assert.equal(logs.filter((row) => row.eventType === 'bill.admin_rejected').length, 1);
    assert.ok(!(await listPending()).some((row) => row.billId === approveId || row.billId === rejectId));
  } finally {
    await app.close();
    await services.close();
  }
});
