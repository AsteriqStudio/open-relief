import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { eq } from 'drizzle-orm';
import Stripe from 'stripe';
import { auditLogs, bills, transactions, users } from '@open-relief/db';
import { encryptAccountNumber } from '@open-relief/db/security/encryption';
import { calculateDonationSplit } from '@open-relief/shared';
import { buildApp } from '../dist/app.js';
import { MethodSandboxBillerClient, METHOD_SANDBOX_BASE_URL } from '../dist/biller/methodSandbox.js';
import { ApiConfigSchema } from '../dist/config.js';
import { createDonationIntent } from '../dist/payments.js';
import { createServices } from '../dist/services.js';
import { createStripePaymentsClient, StripeTestPaymentsClient } from '../dist/stripeTest.js';
import { createMethodBillerClient } from '../dist/webhooks/stripe.js';

const baseConfig = ApiConfigSchema.parse({ ...process.env, STRIPE_SECRET_KEY: undefined, STRIPE_WEBHOOK_SECRET: undefined, METHOD_PROVIDER: 'mock' });
const testConfig = ApiConfigSchema.parse({ ...process.env, STRIPE_SECRET_KEY: 'sk_test_adapterfixture', STRIPE_WEBHOOK_SECRET: 'whsec_adapterfixture', METHOD_PROVIDER: 'sandbox' });

test('provider selection rejects live keys and falls back to local adapters', () => {
  assert.equal(createStripePaymentsClient(baseConfig).mode, 'mock');
  assert.equal(createStripePaymentsClient(testConfig).mode, 'test');
  assert.equal(createMethodBillerClient(testConfig).constructor.name, 'MethodSandboxBillerClient');
  assert.equal(createMethodBillerClient(baseConfig).constructor.name, 'MockMethodBillerClient');
  assert.equal(ApiConfigSchema.safeParse({ ...baseConfig, STRIPE_SECRET_KEY: 'sk_live_forbidden' }).success, false);
  assert.equal(ApiConfigSchema.safeParse({ ...baseConfig, STRIPE_SECRET_KEY: 'sk_test_fixture' }).success, false);
});

test('Stripe test client creates USD PaymentIntents with exact split metadata and idempotency', async () => {
  const calls: Array<{ amount: number; currency: string; metadata: Record<string, string>; idempotencyKey: string | undefined }> = [];
  const fakeSdk = { paymentIntents: {
    async create(params: { amount: number; currency: string; metadata: Record<string, string>; automatic_payment_methods?: { enabled: boolean } }, options: { idempotencyKey?: string }) {
      assert.equal(params.automatic_payment_methods?.enabled, true);
      calls.push({ amount: params.amount, currency: params.currency, metadata: params.metadata, idempotencyKey: options.idempotencyKey });
      return { id: 'pi_test_fixture', client_secret: 'pi_test_fixture_secret_123', amount: params.amount, metadata: params.metadata };
    },
    async retrieve() { return { id: 'pi_test_fixture', client_secret: 'pi_test_fixture_secret_123', amount: 1059, metadata: { billId: 'bill' } }; },
  } } as unknown as Stripe;
  const client = new StripeTestPaymentsClient('sk_test_fixture', fakeSdk);
  const metadata = { billId: 'bill', donorId: 'donor', billAmountCents: '1000', processingFeeCoveredCents: '59', platformTipCents: '0' };
  const intent = await client.createIntent(1059, metadata, 'idem-key');
  assert.equal(intent.clientSecret, 'pi_test_fixture_secret_123');
  assert.deepEqual(calls, [{ amount: 1059, currency: 'usd', metadata, idempotencyKey: 'idem-key' }]);
  assert.equal((await client.getIntent(intent.id)).id, intent.id);
  assert.throws(() => new StripeTestPaymentsClient('sk_live_forbidden', fakeSdk));
});

test('approved fee split handles partial, full, covered, uncovered and different tips', () => {
  for (const amount of [5_000, 12_500]) {
    for (const coverProcessingFee of [true, false]) {
      for (const tipPercentage of [0, 10, 20]) {
        const split = calculateDonationSplit({ billAmountCents: amount, coverProcessingFee, tipPercentage });
        assert.equal(split.netPaymentToBillerCents, amount);
        assert.equal(split.platformTipCents, Math.round(amount * tipPercentage / 100));
        assert.equal(split.totalChargeCents, amount + split.platformTipCents + split.processingFeeCoveredCents);
        assert.equal(split.stripeFeeCents, Math.round(split.totalChargeCents * 0.029 + 30));
        assert.equal(split.netPlatformTipCents, split.platformTipCents + split.processingFeeCoveredCents - split.stripeFeeCents);
        if (coverProcessingFee) assert.equal(split.processingFeeCoveredCents, split.stripeFeeCents);
        else assert.equal(split.processingFeeCoveredCents, 0);
      }
    }
  }
});

test('Method sandbox only sends deterministic payments to demo creditors', async () => {
  const method = new MethodSandboxBillerClient();
  assert.equal(method.baseUrl, METHOD_SANDBOX_BASE_URL);
  assert.equal((await method.getMerchant('100000001')).name, 'DTE Energy demo');
  assert.equal((await method.getMerchant('100000006')).name, 'ConEd demo');
  const input = { sourceAccount: 'sandbox-test-source' as const, destinationBillerId: 'mock-electric-detroit', billerAccountNumber: 'DEMO-E-101', amountCents: 5000, idempotencyKey: randomUUID() };
  const payment = await method.createPayment(input);
  assert.match(payment.id, /^pmt_[a-f0-9]{24}$/);
  assert.equal(payment.status, 'sent');
  assert.equal((await method.createPayment(input)).id, payment.id);
  await assert.rejects(method.createPayment({ ...input, destinationBillerId: 'recipient-account' }));
});

test('signed Stripe test events settle partial and full bills once through Method sandbox', async () => {
  const services = await createServices(testConfig);
  const app = buildApp(services);
  const stripe = new Stripe(testConfig.STRIPE_SECRET_KEY!);
  const recipientId = randomUUID();
  const donorId = randomUUID();
  const billId = randomUUID();
  const intents = new Map<string, { id: string; clientSecret: string; amountCents: number; metadata: Record<string, string> }>();
  const fakeStripeClient = {
    async createIntent(amountCents: number, metadata: Record<string, string>, idempotencyKey: string) {
      const intent = { id: `pi_test_${idempotencyKey.replaceAll('-', '')}`, clientSecret: `pi_test_${idempotencyKey}_secret_fixture`, amountCents, metadata };
      intents.set(intent.id, intent);
      return intent;
    },
    async getIntent(id: string) {
      const intent = intents.get(id);
      if (!intent) throw new Error('Unknown fixture intent');
      return intent;
    },
  };
  try {
    await app.ready();
    await services.db.insert(users).values([
      { id: recipientId, role: 'recipient', email: `${recipientId}@example.invalid`, phone: '+15555550111' },
      { id: donorId, role: 'donor', email: `${donorId}@example.invalid`, phone: '+15555550112' },
    ]);
    await services.db.insert(bills).values({
      id: billId, recipientId, billerName: 'DTE Energy demo', billerMerchantId: 'mock-electric-detroit',
      billerAccountEncrypted: encryptAccountNumber('DEMO-E-101'), category: 'electric',
      documentUrl: 'https://example.invalid/test.pdf', documentKey: `test/${billId}.pdf`, documentMimeType: 'application/pdf', documentSizeBytes: 1,
      statementBalanceCents: 12_500, remainingBalanceCents: 12_500, status: 'verified',
    });
    const sendSucceeded = async (intent: Awaited<ReturnType<typeof createDonationIntent>>, metadata: Record<string, string>) => {
      const payload = JSON.stringify({
        id: `evt_test_${randomUUID()}`, type: 'payment_intent.succeeded', data: { object: {
          id: intent.paymentIntentId, amount_received: intent.split.totalChargeCents, currency: 'usd', latest_charge: `ch_test_${randomUUID().replaceAll('-', '')}`, metadata,
        } },
      });
      const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: testConfig.STRIPE_WEBHOOK_SECRET! });
      return app.inject({ method: 'POST', url: '/api/webhooks/stripe', headers: { 'content-type': 'application/json', 'stripe-signature': signature }, payload });
    };
    const partialKey = randomUUID();
    const donorAcceptance = { accepted: true as const, termsVersion: 'v1.0' as const };
    const partial = await createDonationIntent({ billId, donorId, billAmountCents: 5_000, coverProcessingFee: true, tipPercentage: 10, idempotencyKey: partialKey, donorAcceptance }, services, fakeStripeClient);
    const duplicateIntent = await createDonationIntent({ billId, donorId, billAmountCents: 5_000, coverProcessingFee: true, tipPercentage: 10, idempotencyKey: partialKey, donorAcceptance }, services, fakeStripeClient);
    assert.equal(duplicateIntent.clientSecret, partial.clientSecret);
    const partialMetadata = partial.metadata!;
    const mismatched = await sendSucceeded(partial, { ...partialMetadata, billAmountCents: '1' });
    assert.equal(mismatched.statusCode, 500);
    const badSignature = await app.inject({ method: 'POST', url: '/api/webhooks/stripe', headers: { 'content-type': 'application/json', 'stripe-signature': 'bad' }, payload: '{}' });
    assert.equal(badSignature.statusCode, 400);
    const first = await sendSucceeded(partial, partialMetadata);
    assert.equal(first.statusCode, 200, first.body);
    assert.equal(first.json<{ settlement: { alreadyProcessed: boolean; remainingBalanceCents: number } }>().settlement.alreadyProcessed, false);
    assert.equal((await services.db.select().from(bills).where(eq(bills.id, billId)))[0]?.remainingBalanceCents, 7_500);
    const replay = await sendSucceeded(partial, partialMetadata);
    assert.equal(replay.statusCode, 200, replay.body);
    assert.equal(replay.json<{ settlement: { alreadyProcessed: boolean } }>().settlement.alreadyProcessed, true);
    const full = await createDonationIntent({ billId, donorId, billAmountCents: 7_500, coverProcessingFee: false, tipPercentage: 20, idempotencyKey: randomUUID(), donorAcceptance }, services, fakeStripeClient);
    const second = await sendSucceeded(full, full.metadata!);
    assert.equal(second.statusCode, 200, second.body);
    const [bill] = await services.db.select().from(bills).where(eq(bills.id, billId));
    assert.equal(bill?.status, 'settled');
    assert.equal(bill.remainingBalanceCents, 0);
    assert.ok(bill.settledAt);
    const rows = await services.db.select().from(transactions).where(eq(transactions.billId, billId));
    assert.equal(rows.length, 2);
    assert.ok(rows.every((row) => row.status === 'succeeded' && row.methodDisbursementId?.startsWith('pmt_') && row.stripeChargeId?.startsWith('ch_')));
    assert.match(rows[0]!.receiptEmailPayload?.taxNotice ?? '', /not represented as a tax-deductible/);
    assert.equal((await services.db.select().from(auditLogs).where(eq(auditLogs.billId, billId))).length, 2);
    const [recipient] = await services.db.select().from(users).where(eq(users.id, recipientId));
    assert.equal(recipient?.lifetimeAidCents, 12_500);
    assert.ok(recipient.lastAidAt);
  } finally {
    await app.close();
    await services.close();
  }
});
