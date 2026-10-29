import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { eq, inArray } from 'drizzle-orm';
import Stripe from 'stripe';
import { bills, sponsorshipAllocations, sponsorshipPools, transactions, users } from '@open-relief/db';
import { encryptAccountNumber } from '@open-relief/db/security/encryption';
import { LEGAL_TERMS_VERSION } from '@open-relief/shared';
import { buildApp } from '../dist/app.js';
import { ApiConfigSchema } from '../dist/config.js';
import { createDonationIntent, reconcileExpiredReservations, releaseExpiredMockReservations } from '../dist/payments.js';
import { createServices } from '../dist/services.js';

test('concurrent reservations cannot overdraw a sponsor pool and matched settlement pays the full creditor amount', async () => {
  const config = ApiConfigSchema.parse({ ...process.env, STRIPE_SECRET_KEY: 'sk_test_sponsorfixture', STRIPE_WEBHOOK_SECRET: 'whsec_sponsorfixture', METHOD_PROVIDER: 'sandbox' });
  const services = await createServices(config);
  const app = buildApp(services);
  const stripe = new Stripe(config.STRIPE_SECRET_KEY!);
  const intents = new Map<string, { id: string; clientSecret: string; amountCents: number; metadata: Record<string, string> }>();
  services.testPayments = {
    async retrieve(id) { assert.ok(intents.has(id)); return { status: 'requires_payment_method', amountReceivedCents: 0, chargeId: null, metadata: intents.get(id)!.metadata }; },
    async cancel(id) { assert.ok(intents.has(id)); return true; },
  };
  const fakeStripeClient = {
    async createIntent(amountCents: number, metadata: Record<string, string>, idempotencyKey: string) {
      const intent = { id: `pi_test_${idempotencyKey.replaceAll('-', '')}`, clientSecret: `pi_test_${idempotencyKey}_secret_fixture`, amountCents, metadata };
      intents.set(intent.id, intent);
      return intent;
    },
    async getIntent(id: string) {
      const intent = intents.get(id);
      if (!intent) throw new Error('Unknown test intent');
      return intent;
    },
  };
  const recipientId = randomUUID();
  const donorId = randomUUID();
  const poolId = randomUUID();
  const secondPoolId = randomUUID();
  const billIds = [randomUUID(), randomUUID()];
  const acceptance = { accepted: true as const, termsVersion: LEGAL_TERMS_VERSION };
  try {
    await app.ready();
    await services.db.insert(users).values([
      { id: recipientId, role: 'recipient', email: `${recipientId}@example.invalid`, phone: '+15555550131' },
      { id: donorId, role: 'donor', email: `${donorId}@example.invalid`, phone: '+15555550132' },
    ]);
    for (const billId of billIds) await services.db.insert(bills).values({
      id: billId, recipientId, category: 'medical', billerName: 'Community Hospital demo', billerMerchantId: 'mock-medical-hospital',
      billerAccountEncrypted: encryptAccountNumber(`DEMO-M-${billId}`), documentUrl: `https://example.invalid/${billId}.pdf`, documentKey: `test/${billId}.pdf`, documentMimeType: 'application/pdf', documentSizeBytes: 1,
      statementBalanceCents: 10_000, remainingBalanceCents: 10_000, status: 'verified',
    });
    await services.db.insert(sponsorshipPools).values({ id: poolId, sponsorName: 'Test Hospital Partner', matchRatio: '1.00', totalMatchBudgetCents: 5_000, remainingMatchBudgetCents: 5_000, totalFeeBufferCents: 500, remainingFeeBufferCents: 500, targetCategory: 'medical' });
    const results = await Promise.all(billIds.map((billId) => createDonationIntent({ billId, donorId, billAmountCents: 5_000, coverProcessingFee: true, tipPercentage: 0, sponsorPoolId: poolId, idempotencyKey: randomUUID(), donorAcceptance: acceptance }, services, fakeStripeClient)));
    assert.deepEqual(results.map((result) => result.split.sponsorMatchCents).sort((a, b) => a - b), [0, 5_000]);
    assert.equal((await services.db.select().from(sponsorshipPools).where(eq(sponsorshipPools.id, poolId)))[0]?.remainingMatchBudgetCents, 0);
    const matched = results.find((result) => result.split.sponsorMatchCents === 5_000)!;
    const matchedTransaction = (await services.db.select().from(transactions).where(eq(transactions.id, matched.transactionId)))[0]!;
    const allocation = (await services.db.select().from(sponsorshipAllocations).where(eq(sponsorshipAllocations.transactionId, matched.transactionId)))[0]!;
    assert.equal(allocation.status, 'reserved');
    assert.equal(matchedTransaction.amountToBillCents, 5_000);
    assert.equal(matchedTransaction.sponsorMatchCents, 5_000);
    const payload = JSON.stringify({ id: `evt_test_${randomUUID()}`, type: 'payment_intent.succeeded', data: { object: { id: matched.paymentIntentId, amount_received: matched.split.totalChargeCents, currency: 'usd', latest_charge: `ch_test_${randomUUID().replaceAll('-', '')}`, metadata: matched.metadata } } });
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: config.STRIPE_WEBHOOK_SECRET! });
    const settled = await app.inject({ method: 'POST', url: '/api/webhooks/stripe', headers: { 'content-type': 'application/json', 'stripe-signature': signature }, payload });
    assert.equal(settled.statusCode, 200, settled.body);
    assert.equal((await services.db.select().from(bills).where(eq(bills.id, matchedTransaction.billId)))[0]?.remainingBalanceCents, 0);
    assert.equal((await services.db.select().from(sponsorshipAllocations).where(eq(sponsorshipAllocations.id, allocation.id)))[0]?.status, 'settled');
    assert.match((await services.db.select().from(transactions).where(eq(transactions.id, matched.transactionId)))[0]?.methodDisbursementId ?? '', /^pmt_/);
    const receipt = (await services.db.select().from(transactions).where(eq(transactions.id, matched.transactionId)))[0]?.receiptEmailPayload?.body ?? '';
    assert.match(receipt, /Donor principal: \$50\.00/);
    assert.match(receipt, /verified creditor Community Hospital demo, account ••••/);
    assert.match(receipt, /Sponsor match from Test Hospital Partner: \$50\.00/);
    assert.match(receipt, /Total directed to creditor: \$100\.00/);
    const replay = await app.inject({ method: 'POST', url: '/api/webhooks/stripe', headers: { 'content-type': 'application/json', 'stripe-signature': signature }, payload });
    assert.equal(replay.json<{ settlement: { alreadyProcessed: boolean } }>().settlement.alreadyProcessed, true);
    const unmatched = results.find((result) => result.split.sponsorMatchCents === 0)!;
    const unmatchedBillId = (await services.db.select().from(transactions).where(eq(transactions.id, unmatched.transactionId)))[0]!.billId;
    await assert.rejects(createDonationIntent({ billId: unmatchedBillId, donorId, billAmountCents: 1_000, coverProcessingFee: true, tipPercentage: 0, sponsorPoolId: poolId, expectedSponsorMatchCents: 1_000, idempotencyKey: randomUUID(), donorAcceptance: acceptance }, services, fakeStripeClient), /match changed/);

    const thirdBillId = randomUUID();
    await services.db.insert(sponsorshipPools).values({ id: secondPoolId, sponsorName: 'Cancellation Partner', matchRatio: '1.00', totalMatchBudgetCents: 5_000, remainingMatchBudgetCents: 5_000, targetCategory: 'medical' });
    await services.db.insert(bills).values({ id: thirdBillId, recipientId, category: 'medical', billerName: 'Community Hospital demo', billerMerchantId: 'mock-medical-hospital', billerAccountEncrypted: encryptAccountNumber(`DEMO-M-${thirdBillId}`), documentUrl: `https://example.invalid/${thirdBillId}.pdf`, documentKey: `test/${thirdBillId}.pdf`, documentMimeType: 'application/pdf', documentSizeBytes: 1, statementBalanceCents: 10_000, remainingBalanceCents: 10_000, status: 'verified' });
    const canceled = await createDonationIntent({ billId: thirdBillId, donorId, billAmountCents: 5_000, coverProcessingFee: true, tipPercentage: 0, sponsorPoolId: secondPoolId, idempotencyKey: randomUUID(), donorAcceptance: acceptance }, services, fakeStripeClient);
    assert.equal(canceled.split.sponsorMatchCents, 5_000);
    const cancelPayload = JSON.stringify({ id: `evt_test_${randomUUID()}`, type: 'payment_intent.payment_failed', data: { object: { id: canceled.paymentIntentId } } });
    const cancelSignature = stripe.webhooks.generateTestHeaderString({ payload: cancelPayload, secret: config.STRIPE_WEBHOOK_SECRET! });
    assert.equal((await app.inject({ method: 'POST', url: '/api/webhooks/stripe', headers: { 'content-type': 'application/json', 'stripe-signature': cancelSignature }, payload: cancelPayload })).statusCode, 200);
    assert.equal((await services.db.select().from(sponsorshipPools).where(eq(sponsorshipPools.id, secondPoolId)))[0]?.remainingMatchBudgetCents, 5_000);
    assert.equal((await services.db.select().from(sponsorshipAllocations).where(eq(sponsorshipAllocations.transactionId, canceled.transactionId)))[0]?.status, 'released');
    const canceledAgain = await createDonationIntent({ billId: thirdBillId, donorId, billAmountCents: 5_000, coverProcessingFee: true, tipPercentage: 0, sponsorPoolId: secondPoolId, idempotencyKey: randomUUID(), donorAcceptance: acceptance }, services, fakeStripeClient);
    const canceledPayload = JSON.stringify({ id: `evt_test_${randomUUID()}`, type: 'payment_intent.canceled', data: { object: { id: canceledAgain.paymentIntentId } } });
    const canceledSignature = stripe.webhooks.generateTestHeaderString({ payload: canceledPayload, secret: config.STRIPE_WEBHOOK_SECRET! });
    assert.equal((await app.inject({ method: 'POST', url: '/api/webhooks/stripe', headers: { 'content-type': 'application/json', 'stripe-signature': canceledSignature }, payload: canceledPayload })).statusCode, 200);
    assert.equal((await services.db.select().from(sponsorshipPools).where(eq(sponsorshipPools.id, secondPoolId)))[0]?.remainingMatchBudgetCents, 5_000);
  } finally {
    await services.db.update(sponsorshipPools).set({ active: false }).where(inArray(sponsorshipPools.id, [poolId, secondPoolId]));
    await app.close();
    await services.close();
  }
});

test('uncovered processing needs a reserved sponsor buffer and expired mock intents release it', async () => {
  const services = await createServices(ApiConfigSchema.parse(process.env));
  const app = buildApp(services);
  const recipientId = randomUUID();
  const billId = randomUUID();
  const poolId = randomUUID();
  try {
    await app.ready();
    await services.db.insert(users).values({ id: recipientId, role: 'recipient', email: `${recipientId}@example.invalid`, phone: '+15555550141' });
    await services.db.insert(bills).values({ id: billId, recipientId, category: 'water', billerName: 'Flint Water demo', billerMerchantId: 'mock-water-flint', billerAccountEncrypted: encryptAccountNumber(`DEMO-W-${billId}`), documentUrl: `https://example.invalid/${billId}.pdf`, documentKey: `test/${billId}.pdf`, documentMimeType: 'application/pdf', documentSizeBytes: 1, statementBalanceCents: 30_000, remainingBalanceCents: 30_000, status: 'verified' });
    await services.db.insert(sponsorshipPools).values({ id: poolId, sponsorName: 'Fee Buffer Partner', matchRatio: '1.00', totalMatchBudgetCents: 0, remainingMatchBudgetCents: 0, totalFeeBufferCents: 320, remainingFeeBufferCents: 320, targetCategory: 'water' });
    const signup = await app.inject({ method: 'POST', url: '/api/auth/signup', payload: { email: `${randomUUID()}@example.invalid`, password: 'local test password 2026', phone: '+15555550142', role: 'donor' } });
    assert.equal(signup.statusCode, 201, signup.body);
    const session = signup.json<{ token: string; user: { id: string } }>();
    const token = session.token;
    const headers = { authorization: `Bearer ${token}` };
    const payload = (idempotencyKey: string) => ({ billId, amountCents: 10_000, coverProcessingFee: false, tipPercentage: 0, sponsorPoolId: poolId, idempotencyKey, donorAcceptance: { accepted: true, termsVersion: LEGAL_TERMS_VERSION } });
    const first = await app.inject({ method: 'POST', url: '/api/donations/create-intent', headers, payload: payload(randomUUID()) });
    assert.equal(first.statusCode, 201, first.body);
    const firstIntent = first.json<{ transactionId: string; feeBreakdown: { feeCoverageSource: string; feeBufferAppliedCents: number } }>();
    assert.equal(firstIntent.feeBreakdown.feeCoverageSource, 'sponsor_buffer');
    assert.equal(firstIntent.feeBreakdown.feeBufferAppliedCents, 320);
    assert.equal((await services.db.select().from(sponsorshipPools).where(eq(sponsorshipPools.id, poolId)))[0]?.remainingFeeBufferCents, 0);
    const rejected = await app.inject({ method: 'POST', url: '/api/donations/create-intent', headers, payload: payload(randomUUID()) });
    assert.equal(rejected.statusCode, 422, rejected.body);
    assert.equal(rejected.json<{ requiresDonorFeeCoverage: boolean }>().requiresDonorFeeCoverage, true);
    await services.db.update(transactions).set({ expiresAt: new Date(Date.now() - 1_000) }).where(eq(transactions.id, firstIntent.transactionId));
    assert.equal(await releaseExpiredMockReservations(services), 1);
    assert.equal((await services.db.select().from(sponsorshipPools).where(eq(sponsorshipPools.id, poolId)))[0]?.remainingFeeBufferCents, 320);
    assert.equal((await services.db.select().from(sponsorshipAllocations).where(eq(sponsorshipAllocations.transactionId, firstIntent.transactionId)))[0]?.status, 'released');
    assert.equal(await releaseExpiredMockReservations(services), 0);
    const fakeStripeClient = {
      async createIntent(amountCents: number, metadata: Record<string, string>, idempotencyKey: string) { const id = `pi_test_${idempotencyKey.replaceAll('-', '')}`; return { id, clientSecret: `${id}_secret_fixture`, amountCents, metadata }; },
      async getIntent() { throw new Error('Not used by this test'); },
    };
    const testIntent = await createDonationIntent({ billId, donorId: session.user.id, billAmountCents: 10_000, coverProcessingFee: false, tipPercentage: 0, sponsorPoolId: poolId, idempotencyKey: randomUUID(), donorAcceptance: { accepted: true, termsVersion: LEGAL_TERMS_VERSION } }, services, fakeStripeClient);
    await services.db.update(transactions).set({ expiresAt: new Date(Date.now() - 1_000) }).where(eq(transactions.id, testIntent.transactionId));
    let canceled = false;
    await reconcileExpiredReservations(services, {
      async retrieve(id) { return { status: id === testIntent.paymentIntentId ? 'requires_payment_method' : 'processing', amountReceivedCents: 0, chargeId: null, metadata: {} }; },
      async cancel(id) { assert.equal(id, testIntent.paymentIntentId); canceled = true; return true; },
    });
    assert.equal(canceled, true);
    assert.equal((await services.db.select().from(sponsorshipPools).where(eq(sponsorshipPools.id, poolId)))[0]?.remainingFeeBufferCents, 320);
  } finally {
    await services.db.update(sponsorshipPools).set({ active: false }).where(eq(sponsorshipPools.id, poolId));
    await app.close();
    await services.close();
  }
});
