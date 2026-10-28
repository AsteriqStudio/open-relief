import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { and, asc, eq, gte, isNull, like, lt, or, sql, sum } from 'drizzle-orm';
import { z } from 'zod';
import { auditLogs, bills, sponsorshipAllocations, sponsorshipPools, transactions, users } from '@open-relief/db';
import { decryptAccountNumber } from '@open-relief/db/security/encryption';
import { calculateDonationSplit, calculateSponsoredDonationSplit, calculateSponsorMatchCents, DonationSplitInputSchema, LEGAL_TERMS_VERSION, LegalAcceptanceSchema } from '@open-relief/shared';
import type { Services } from './services.js';
import { isVerifiedDemoMerchantForCategory } from './biller/methodSandbox.js';

export const CreateIntentSchema = DonationSplitInputSchema.extend({
  billId: z.string().uuid(),
  donorId: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
  billAmountCents: z.number().int().positive().max(100_000_000),
  donorAcceptance: LegalAcceptanceSchema,
  sponsorPoolId: z.string().uuid().optional(),
  expectedSponsorMatchCents: z.number().int().nonnegative().safe().optional(),
});

export interface PaymentIntent {
  id: string;
  clientSecret: string;
  amountCents: number;
  metadata: Record<string, string>;
}

export interface IStripePaymentsClient {
  createIntent(amountCents: number, metadata: Record<string, string>, idempotencyKey: string): Promise<PaymentIntent>;
  getIntent(id: string): Promise<PaymentIntent>;
}

export class MockStripePaymentsClient implements IStripePaymentsClient {
  async createIntent(amountCents: number, metadata: Record<string, string>, idempotencyKey: string): Promise<PaymentIntent> {
    const id = `pi_mock_${idempotencyKey.replaceAll('-', '')}`;
    return { id, clientSecret: `${id}_secret_sandbox_only`, amountCents, metadata };
  }
  async getIntent(id: string): Promise<PaymentIntent> {
    if (!id.startsWith('pi_mock_')) throw new Error('Unknown mock payment intent');
    return { id, clientSecret: `${id}_secret_sandbox_only`, amountCents: 0, metadata: {} };
  }
}

export interface IMethodBillerClient {
  disburse(input: { merchantId: string; accountNumber: string; amountCents: number; idempotencyKey: string }): Promise<string>;
}

export class MockMethodBillerClient implements IMethodBillerClient {
  async disburse(input: { merchantId: string; accountNumber: string; amountCents: number; idempotencyKey: string }): Promise<string> {
    if (!input.merchantId.startsWith('mock-') || input.accountNumber.length === 0 || input.amountCents <= 0) {
      throw new Error('Mock disbursement requires a verified demo creditor');
    }
    return `disb_mock_${input.idempotencyKey.replaceAll('-', '')}`;
  }
}

export class FeeCoverageRequiredError extends Error {
  constructor() { super('Sponsor fee buffer depleted. Please cover card processing to proceed.'); }
}

export class SponsorMatchChangedError extends Error {
  constructor() { super('The sponsor match changed. Close checkout to refresh the bill before paying.'); }
}

export async function createDonationIntent(input: z.infer<typeof CreateIntentSchema>, services: Services, stripe: IStripePaymentsClient = new MockStripePaymentsClient()) {
  const request = CreateIntentSchema.parse(input);
  const baseSplit = calculateDonationSplit({
    billAmountCents: request.billAmountCents,
    coverProcessingFee: request.coverProcessingFee,
    tipPercentage: request.tipPercentage,
  });
  const splitInput = { billAmountCents: request.billAmountCents, coverProcessingFee: request.coverProcessingFee, tipPercentage: request.tipPercentage };
  return services.db.transaction(async (tx) => {
    const [existing] = await tx.select().from(transactions).where(eq(transactions.idempotencyKey, request.idempotencyKey));
    if (existing) {
      if (existing.billId !== request.billId || existing.donorId !== request.donorId || existing.amountToBillCents !== request.billAmountCents || existing.totalChargeCents !== baseSplit.totalChargeCents || existing.processingFeeCoveredCents !== baseSplit.processingFeeCoveredCents || existing.platformTipCents !== baseSplit.platformTipCents) {
        throw new Error('Idempotency key already belongs to a different donation');
      }
      if (!existing.stripePaymentIntentId) throw new Error('Stored intent is missing');
      if (existing.status !== 'pending' || existing.expiresAt < new Date()) throw new Error('Donation intent is no longer active');
      const [allocation] = await tx.select({ id: sponsorshipAllocations.id, poolId: sponsorshipAllocations.poolId, feeBufferAppliedCents: sponsorshipAllocations.feeBufferAppliedCents, sponsorName: sponsorshipPools.sponsorName }).from(sponsorshipAllocations).innerJoin(sponsorshipPools, eq(sponsorshipAllocations.poolId, sponsorshipPools.id)).where(eq(sponsorshipAllocations.transactionId, existing.id));
      if (request.sponsorPoolId && allocation && allocation.poolId !== request.sponsorPoolId) throw new Error('Idempotency key belongs to a different sponsor selection');
      const split = calculateSponsoredDonationSplit({ billAmountCents: request.billAmountCents, coverProcessingFee: request.coverProcessingFee, tipPercentage: request.tipPercentage, sponsorMatchCents: existing.sponsorMatchCents, feeBufferAvailableCents: allocation?.feeBufferAppliedCents ?? 0 });
      const intent = await stripe.getIntent(existing.stripePaymentIntentId);
      return { transactionId: existing.id, paymentIntentId: intent.id, clientSecret: intent.clientSecret, split, feeBreakdown: split, expiresAt: existing.expiresAt.toISOString(), sponsorName: allocation?.sponsorName ?? null, allocationId: allocation?.id ?? null };
    }
    const [donor] = await tx.select({ id: users.id }).from(users).where(and(eq(users.id, request.donorId), eq(users.role, 'donor')));
    if (!donor) throw new Error('Donor not found');
    const [bill] = await tx.select().from(bills).where(eq(bills.id, request.billId)).for('update');
    if (!bill || !['verified', 'funded'].includes(bill.status) || !bill.billerMerchantId || !isVerifiedDemoMerchantForCategory(bill.billerMerchantId, bill.category) || !bill.billerAccountEncrypted || bill.remainingBalanceCents === null) {
      throw new Error('Bill is not available for donation');
    }
    const [reservation] = await tx.select({ amount: sum(transactions.amountToBillCents) }).from(transactions).where(and(eq(transactions.billId, bill.id), eq(transactions.status, 'pending')));
    const [sponsorReservation] = await tx.select({ amount: sum(transactions.sponsorMatchCents) }).from(transactions).where(and(eq(transactions.billId, bill.id), eq(transactions.status, 'pending')));
    const headroom = bill.remainingBalanceCents - Number(reservation?.amount ?? 0) - Number(sponsorReservation?.amount ?? 0);
    if (request.billAmountCents > headroom) {
      throw new Error('Donation exceeds the unreserved bill balance');
    }
    const transactionId = randomUUID();
    const candidates = await tx.select().from(sponsorshipPools).where(and(eq(sponsorshipPools.active, true), or(isNull(sponsorshipPools.targetCategory), eq(sponsorshipPools.targetCategory, bill.category)), request.sponsorPoolId ? eq(sponsorshipPools.id, request.sponsorPoolId) : undefined)).orderBy(asc(sponsorshipPools.createdAt));
    let split = calculateSponsoredDonationSplit({ ...splitInput, sponsorMatchCents: 0, feeBufferAvailableCents: 0 });
    let allocation: { id: string; poolId: string; sponsorName: string } | null = null;
    for (const pool of candidates) {
      const desiredMatch = calculateSponsorMatchCents(request.billAmountCents, Number(pool.matchRatio), headroom - request.billAmountCents);
      const matchCents = pool.remainingMatchBudgetCents >= desiredMatch ? desiredMatch : 0;
      const candidateSplit = calculateSponsoredDonationSplit({ ...splitInput, sponsorMatchCents: matchCents, feeBufferAvailableCents: pool.remainingFeeBufferCents });
      if (candidateSplit.requiresDonorFeeCoverage || (matchCents === 0 && candidateSplit.feeBufferAppliedCents === 0)) continue;
      const [reserved] = await tx.update(sponsorshipPools).set({
        remainingMatchBudgetCents: sql`${sponsorshipPools.remainingMatchBudgetCents} - ${matchCents}`,
        remainingFeeBufferCents: sql`${sponsorshipPools.remainingFeeBufferCents} - ${candidateSplit.feeBufferAppliedCents}`,
        updatedAt: new Date(),
      }).where(and(eq(sponsorshipPools.id, pool.id), eq(sponsorshipPools.active, true), eq(sponsorshipPools.matchRatio, pool.matchRatio), or(isNull(sponsorshipPools.targetCategory), eq(sponsorshipPools.targetCategory, bill.category)), gte(sponsorshipPools.remainingMatchBudgetCents, matchCents), gte(sponsorshipPools.remainingFeeBufferCents, candidateSplit.feeBufferAppliedCents))).returning({ id: sponsorshipPools.id });
      if (!reserved) continue;
      split = candidateSplit;
      allocation = { id: randomUUID(), poolId: pool.id, sponsorName: pool.sponsorName };
      break;
    }
    if (split.requiresDonorFeeCoverage) throw new FeeCoverageRequiredError();
    if (request.expectedSponsorMatchCents !== undefined && request.expectedSponsorMatchCents !== split.sponsorMatchCents) throw new SponsorMatchChangedError();
    const metadata = {
      billId: bill.id,
      donorId: donor.id,
      transactionId,
      billAmountCents: String(request.billAmountCents),
      sponsorMatchCents: String(split.sponsorMatchCents),
      allocationId: allocation?.id ?? '',
      processingFeeCoveredCents: String(split.processingFeeCoveredCents),
      platformTipCents: String(split.platformTipCents),
      donorTermsVersion: LEGAL_TERMS_VERSION,
    };
    const intent = await stripe.createIntent(split.totalChargeCents, metadata, request.idempotencyKey);
    const persistedTransactionId = z.string().uuid().parse(intent.metadata.transactionId);
    if (intent.amountCents !== split.totalChargeCents || intent.metadata.billId !== bill.id || intent.metadata.donorId !== donor.id || intent.metadata.billAmountCents !== String(request.billAmountCents) || intent.metadata.sponsorMatchCents !== String(split.sponsorMatchCents) || intent.metadata.allocationId !== (allocation?.id ?? '') || intent.metadata.processingFeeCoveredCents !== String(split.processingFeeCoveredCents) || intent.metadata.platformTipCents !== String(split.platformTipCents)) {
      throw new Error('Payment intent does not match the donation');
    }
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await tx.insert(transactions).values({
      id: persistedTransactionId,
      billId: bill.id,
      donorId: donor.id,
      idempotencyKey: request.idempotencyKey,
      amountToBillCents: request.billAmountCents,
      sponsorMatchCents: split.sponsorMatchCents,
      processingFeeCoveredCents: split.processingFeeCoveredCents,
      platformTipCents: split.platformTipCents,
      totalChargeCents: split.totalChargeCents,
      stripeFeeCents: split.stripeFeeCents,
      netPlatformTipCents: split.netPlatformTipCents,
      stripePaymentIntentId: intent.id,
      donorTermsAcceptedAt: new Date(),
      donorTermsVersion: LEGAL_TERMS_VERSION,
      expiresAt,
    });
    if (allocation) await tx.insert(sponsorshipAllocations).values({ id: allocation.id, transactionId: persistedTransactionId, poolId: allocation.poolId, matchedAmountCents: split.sponsorMatchCents, feeBufferAppliedCents: split.feeBufferAppliedCents, status: 'reserved' });
    return { transactionId: persistedTransactionId, paymentIntentId: intent.id, clientSecret: intent.clientSecret, split, feeBreakdown: split, expiresAt: expiresAt.toISOString(), metadata: intent.metadata, sponsorName: allocation?.sponsorName ?? null, allocationId: allocation?.id ?? null };
  });
}

const MockStripeEventSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['payment_intent.succeeded', 'payment_intent.payment_failed', 'payment_intent.canceled']),
  data: z.object({ object: z.object({ id: z.string().min(1) }) }),
});

export function signMockStripeEvent(payload: string, secret: string, timestamp = Math.floor(Date.now() / 1000)): string {
  const digest = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  return `t=${timestamp},v1=${digest}`;
}

export function verifyMockStripeEvent(payload: Buffer, signature: string, secret: string) {
  const parts = Object.fromEntries(signature.split(',').map((part) => part.split('=', 2)));
  const timestamp = Number(parts.t);
  if (!Number.isSafeInteger(timestamp) || Math.abs(Math.floor(Date.now() / 1000) - timestamp) > 300 || !/^[0-9a-f]{64}$/.test(parts.v1 ?? '')) {
    throw new Error('Invalid webhook signature');
  }
  const expected = Buffer.from(createHmac('sha256', secret).update(`${timestamp}.${payload.toString('utf8')}`).digest('hex'), 'hex');
  if (!timingSafeEqual(expected, Buffer.from(parts.v1!, 'hex'))) throw new Error('Invalid webhook signature');
  return MockStripeEventSchema.parse(JSON.parse(payload.toString('utf8')));
}

export interface VerifiedPaymentDetails {
  amountReceivedCents: number;
  chargeId: string;
  metadata: Record<string, string>;
}

export async function settlePayment(intentId: string, services: Services, method: IMethodBillerClient = new MockMethodBillerClient(), verified?: VerifiedPaymentDetails) {
  return services.db.transaction(async (tx) => {
    const [transaction] = await tx.select().from(transactions).where(eq(transactions.stripePaymentIntentId, intentId)).for('update');
    if (!transaction) throw new Error('Unknown payment intent');
    if (verified) {
      const metadata = verified.metadata;
      if (transaction.totalChargeCents !== verified.amountReceivedCents || metadata.billId !== transaction.billId || metadata.donorId !== transaction.donorId || metadata.transactionId !== transaction.id || metadata.billAmountCents !== String(transaction.amountToBillCents) || metadata.processingFeeCoveredCents !== String(transaction.processingFeeCoveredCents) || metadata.platformTipCents !== String(transaction.platformTipCents)) {
        throw new Error('Stripe payment does not match the reserved donation');
      }
    } else if (!intentId.startsWith('pi_mock_')) {
      throw new Error('A verified Stripe payment event is required');
    }
    if (transaction.status === 'succeeded') return { transactionId: transaction.id, alreadyProcessed: true };
    if (transaction.status !== 'pending' || (!verified && transaction.expiresAt < new Date())) throw new Error('Payment intent is not active');
    const [allocation] = await tx.select().from(sponsorshipAllocations).where(eq(sponsorshipAllocations.transactionId, transaction.id)).for('update');
    if (allocation && (allocation.status !== 'reserved' || allocation.matchedAmountCents !== transaction.sponsorMatchCents)) throw new Error('Sponsor allocation is not reserved');
    if (transaction.sponsorMatchCents > 0 && !allocation) throw new Error('Sponsor allocation is missing');
    if (verified && (verified.metadata.sponsorMatchCents !== undefined || transaction.sponsorMatchCents > 0) && (verified.metadata.sponsorMatchCents !== String(transaction.sponsorMatchCents) || verified.metadata.allocationId !== (allocation?.id ?? ''))) throw new Error('Stripe sponsor metadata does not match the reservation');
    const creditorAmountCents = transaction.amountToBillCents + transaction.sponsorMatchCents;
    const [bill] = await tx.select().from(bills).where(eq(bills.id, transaction.billId)).for('update');
    if (!bill?.billerMerchantId || !isVerifiedDemoMerchantForCategory(bill.billerMerchantId, bill.category) || !bill.billerAccountEncrypted || bill.remainingBalanceCents === null || bill.remainingBalanceCents < creditorAmountCents) {
      throw new Error('Bill cannot be settled');
    }
    const creditorAccountNumber = decryptAccountNumber(bill.billerAccountEncrypted);
    const methodDisbursementId = await method.disburse({
      merchantId: bill.billerMerchantId,
      accountNumber: creditorAccountNumber,
      amountCents: creditorAmountCents,
      idempotencyKey: transaction.id,
    });
    const remainingBalanceCents = bill.remainingBalanceCents - creditorAmountCents;
    const [donor] = await tx.select({ email: users.email }).from(users).where(eq(users.id, transaction.donorId));
    if (!donor) throw new Error('Donor not found');
    const [sponsor] = allocation ? await tx.select({ name: sponsorshipPools.sponsorName }).from(sponsorshipPools).where(eq(sponsorshipPools.id, allocation.poolId)) : [];
    const taxNotice = 'This direct bill payment is not represented as a tax-deductible charitable contribution. No 501(c)(3) status is claimed.';
    const receiptEmailPayload = {
      to: donor.email,
      subject: 'Open Relief payment confirmation',
      body: `Payment confirmation for verified creditor ${bill.billerName ?? 'a demo creditor'}, account ••••${creditorAccountNumber.slice(-4)}, on ${new Date().toISOString()}. Donor principal: $${(transaction.amountToBillCents / 100).toFixed(2)}. Sponsor match from ${sponsor?.name ?? 'none'}: $${(transaction.sponsorMatchCents / 100).toFixed(2)}. Total directed to creditor: $${(creditorAmountCents / 100).toFixed(2)}. Total test charge: $${(transaction.totalChargeCents / 100).toFixed(2)}. Creditor payment reference: ${methodDisbursementId}. ${taxNotice}`,
      taxNotice,
    };
    await tx.update(bills).set({
      remainingBalanceCents,
      status: remainingBalanceCents === 0 ? 'settled' : 'funded',
      settledAt: remainingBalanceCents === 0 ? new Date() : null,
      updatedAt: new Date(),
    }).where(eq(bills.id, bill.id));
    await tx.update(users).set({ lifetimeAidCents: sql`${users.lifetimeAidCents} + ${creditorAmountCents}`, lastAidAt: new Date() }).where(eq(users.id, bill.recipientId));
    if (allocation) await tx.update(sponsorshipAllocations).set({ status: 'settled' }).where(eq(sponsorshipAllocations.id, allocation.id));
    await tx.update(transactions).set({ methodDisbursementId, stripeChargeId: verified?.chargeId ?? null, receiptEmailPayload, status: 'succeeded', updatedAt: new Date() }).where(eq(transactions.id, transaction.id));
    await tx.insert(auditLogs).values({
      id: randomUUID(), eventType: verified ? 'bill.sandbox_settled' : 'bill.mock_settled', actorId: transaction.donorId, billId: bill.id, transactionId: transaction.id,
      metadata: { donorPrincipalCents: transaction.amountToBillCents, sponsorMatchCents: transaction.sponsorMatchCents, totalToCreditorCents: creditorAmountCents, methodDisbursementId, stripeChargeId: verified?.chargeId ?? null },
    });
    return { transactionId: transaction.id, alreadyProcessed: false, remainingBalanceCents, receiptEmailPayload };
  });
}

export async function settleMockPayment(intentId: string, services: Services, method: IMethodBillerClient = new MockMethodBillerClient()) {
  return settlePayment(intentId, services, method);
}

export async function failMockPayment(intentId: string, services: Services) {
  await services.db.transaction(async (tx) => {
    const [transaction] = await tx.select().from(transactions).where(eq(transactions.stripePaymentIntentId, intentId)).for('update');
    if (!transaction || transaction.status !== 'pending') return;
    const [allocation] = await tx.select().from(sponsorshipAllocations).where(eq(sponsorshipAllocations.transactionId, transaction.id)).for('update');
    if (allocation?.status === 'reserved') {
      await tx.update(sponsorshipPools).set({
        remainingMatchBudgetCents: sql`${sponsorshipPools.remainingMatchBudgetCents} + ${allocation.matchedAmountCents}`,
        remainingFeeBufferCents: sql`${sponsorshipPools.remainingFeeBufferCents} + ${allocation.feeBufferAppliedCents}`,
        updatedAt: new Date(),
      }).where(eq(sponsorshipPools.id, allocation.poolId));
      await tx.update(sponsorshipAllocations).set({ status: 'released' }).where(eq(sponsorshipAllocations.id, allocation.id));
    }
    await tx.update(transactions).set({ status: 'failed', updatedAt: new Date() }).where(eq(transactions.id, transaction.id));
  });
}

export async function releaseExpiredMockReservations(services: Services): Promise<number> {
  const expired = await services.db.select({ intentId: transactions.stripePaymentIntentId }).from(transactions).where(and(eq(transactions.status, 'pending'), lt(transactions.expiresAt, new Date()), like(transactions.stripePaymentIntentId, 'pi_mock_%'))).limit(100);
  for (const row of expired) if (row.intentId) await failMockPayment(row.intentId, services);
  return expired.length;
}

export interface ITestPaymentReconciler {
  retrieve(id: string): Promise<{ status: string; amountReceivedCents: number; chargeId: string | null; metadata: Record<string, string> }>;
  cancel(id: string): Promise<boolean>;
}

export async function reconcileExpiredReservations(services: Services, testPayments?: ITestPaymentReconciler, method: IMethodBillerClient = new MockMethodBillerClient()): Promise<number> {
  let resolved = await releaseExpiredMockReservations(services);
  if (!testPayments) return resolved;
  const expired = await services.db.select({ intentId: transactions.stripePaymentIntentId }).from(transactions).where(and(eq(transactions.status, 'pending'), lt(transactions.expiresAt, new Date()), like(transactions.stripePaymentIntentId, 'pi_test_%'))).limit(100);
  for (const row of expired) {
    if (!row.intentId) continue;
    try {
      const intent = await testPayments.retrieve(row.intentId);
      if (intent.status === 'succeeded') {
        if (!intent.chargeId || intent.amountReceivedCents <= 0) continue;
        await settlePayment(row.intentId, services, method, { amountReceivedCents: intent.amountReceivedCents, chargeId: intent.chargeId, metadata: intent.metadata });
        resolved += 1;
      } else if (intent.status === 'canceled' || (['requires_payment_method', 'requires_confirmation', 'requires_action'].includes(intent.status) && await testPayments.cancel(row.intentId))) {
        await failMockPayment(row.intentId, services);
        resolved += 1;
      }
    } catch (error) {
      console.error(`Could not reconcile test intent ${row.intentId}:`, error);
    }
  }
  return resolved;
}
