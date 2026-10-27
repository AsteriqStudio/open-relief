import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import test from 'node:test';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import sharp from 'sharp';
import { users } from '@open-relief/db';
import { buildApp } from '../dist/app.js';
import { ApiConfigSchema } from '../dist/config.js';
import { processUploadedBill } from '../dist/ingestion.js';
import { MockOCRExtractor } from '../dist/ocr.js';
import { signMockStripeEvent } from '../dist/payments.js';
import { BILL_QUEUE_NAME, createServices } from '../dist/services.js';

const recipientId = '00000000-0000-4000-8000-000000000101';
const donorId = '00000000-0000-4000-8000-000000000102';

test('upload through mock OCR to direct demo creditor settlement', async () => {
  const config = ApiConfigSchema.parse(process.env);
  const services = await createServices(config);
  const app = buildApp(services);
  const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
  const worker = new Worker(BILL_QUEUE_NAME, async (job) => {
    if (typeof job.data.billId !== 'string') throw new Error('Missing bill ID');
    await processUploadedBill(job.data.billId, services, new MockOCRExtractor());
  }, { connection: redis });
  try {
    await app.ready();
    await worker.waitUntilReady();
    await services.db.insert(users).values([
      { id: recipientId, role: 'recipient', email: 'recipient@example.invalid', phone: '+15555550101' },
      { id: donorId, role: 'donor', email: 'donor@example.invalid', phone: '+15555550102' },
    ]).onConflictDoNothing();
    const color = randomBytes(3);
    const image = await sharp({ create: { width: 3, height: 3, channels: 3, background: { r: color[0]!, g: color[1]!, b: color[2]! } } }).jpeg().withExif({ IFD0: { Copyright: 'metadata to strip' } }).toBuffer();
    const submit = async () => {
      const response = await app.inject({ method: 'POST', url: '/api/bills/upload-url', payload: {
        recipientId, category: 'electric', mimeType: 'image/jpeg', sizeBytes: image.length, zipCode: '48201', story: 'Demo family facing an overdue power bill',
      } });
      assert.equal(response.statusCode, 201, response.body);
      const details = response.json<{ billId: string; url: string; fields: Record<string, string> }>();
      const form = new FormData();
      for (const [key, value] of Object.entries(details.fields)) form.set(key, value);
      form.set('file', new Blob([image], { type: 'image/jpeg' }), 'bill.jpg');
      const upload = await fetch(details.url, { method: 'POST', body: form });
      assert.ok(upload.ok, `S3 upload failed: ${upload.status} ${await upload.text()}`);
      const complete = await app.inject({ method: 'POST', url: `/api/bills/${details.billId}/complete` });
      assert.equal(complete.statusCode, 202, complete.body);
      return details.billId;
    };
    const billId = await submit();
    let billStatus = 'pending_ocr';
    for (let attempt = 0; attempt < 50; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      const status = await app.inject({ method: 'GET', url: `/api/bills/${billId}` });
      billStatus = status.json<{ status: string }>().status;
      if (billStatus !== 'pending_ocr') break;
    }
    assert.equal(billStatus, 'verified');
    const sanitized = await services.s3.send(new GetObjectCommand({ Bucket: config.S3_BUCKET, Key: `bills/${billId}/sanitized.jpg` }));
    assert.ok(sanitized.Body);
    const metadata = await sharp(await sanitized.Body.transformToByteArray()).metadata();
    assert.equal(metadata.exif, undefined);
    const feed = (await app.inject({ method: 'GET', url: '/api/bills/feed' })).json<{ bills: Array<{ id: string }> }>();
    assert.ok(feed.bills.some((bill) => bill.id === billId));

    const intentResponse = await app.inject({ method: 'POST', url: '/api/donations/create-intent', payload: {
      billId, donorId, billAmountCents: 12_000, coverProcessingFee: true, tipPercentage: 0, idempotencyKey: randomUUID(),
    } });
    assert.equal(intentResponse.statusCode, 201, intentResponse.body);
    const intent = intentResponse.json<{ transactionId: string; paymentIntentId: string; mode: string }>();
    assert.equal(intent.mode, 'mock');
    const payload = JSON.stringify({ id: `evt_mock_${randomUUID()}`, type: 'payment_intent.succeeded', data: { object: { id: intent.paymentIntentId } } });
    const rejected = await app.inject({ method: 'POST', url: '/api/webhooks/stripe', headers: { 'content-type': 'application/json', 'stripe-signature': 't=0,v1=0' }, payload });
    assert.equal(rejected.statusCode, 400);
    const signature = signMockStripeEvent(payload, config.MOCK_STRIPE_WEBHOOK_SECRET);
    const webhook = await app.inject({ method: 'POST', url: '/api/webhooks/stripe', headers: { 'content-type': 'application/json', 'stripe-signature': signature }, payload });
    assert.equal(webhook.statusCode, 200, webhook.body);
    assert.equal(webhook.json<{ settlement: { alreadyProcessed: boolean } }>().settlement.alreadyProcessed, false);
    const replay = await app.inject({ method: 'POST', url: '/api/webhooks/stripe', headers: { 'content-type': 'application/json', 'stripe-signature': signature }, payload });
    assert.equal(replay.json<{ settlement: { alreadyProcessed: boolean } }>().settlement.alreadyProcessed, true);
    const settled = (await app.inject({ method: 'GET', url: `/api/bills/${billId}` })).json<{ status: string; remainingBalanceCents: number }>();
    assert.equal(settled.status, 'settled');
    assert.equal(settled.remainingBalanceCents, 0);
    const receipt = await app.inject({ method: 'GET', url: `/api/donations/${intent.transactionId}/receipt` });
    assert.equal(receipt.statusCode, 200);
    assert.match(receipt.json<{ taxNotice: string }>().taxNotice, /does not establish/);

    const duplicateId = await submit();
    let duplicateStatus = 'pending_ocr';
    for (let attempt = 0; attempt < 50; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      duplicateStatus = (await app.inject({ method: 'GET', url: `/api/bills/${duplicateId}` })).json<{ status: string }>().status;
      if (duplicateStatus !== 'pending_ocr') break;
    }
    assert.equal(duplicateStatus, 'rejected');
  } finally {
    await worker.close();
    await app.close();
    await services.close();
    await redis.quit();
  }
});
