import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { and, eq, gt, sql, sum } from 'drizzle-orm';
import { z } from 'zod';
import { auditLogs, bills, transactions, users } from '@open-relief/db';
import { decryptAccountNumber } from '@open-relief/db/security/encryption';
import { calculateDonationSplit, DonationSplitInputSchema, LEGAL_TERMS_VERSION, LegalAcceptanceSchema } from '@open-relief/shared';
import type { Services } from './services.js';
import { isVerifiedDemoMerchantForCategory } from './biller/methodSandbox.js';

export const CreateIntentSchema = DonationSplitInputSchema.extend({
  billId: z.string().uuid(),
  donorId: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
  billAmountCents: z.number().int().positive().max(100_000_000),
  donorAcceptance: LegalAcceptanceSchema,
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

export async function createDonationIntent(input: z.infer<typeof CreateIntentSchema>, services: Services, stripe: IStripePaymentsClient = new MockStripePaymentsClient()) {
  const request = CreateIntentSchema.parse(input);
  const split = calculateDonationSplit({
    billAmountCents: request.billAmountCents,
    coverProcessingFee: request.coverProcessingFee,
    tipPercentage: request.tipPercentage,
  });
  return services.db.transaction(async (tx) => {
    const [existing] = await tx.select().from(transactions).where(eq(transactions.idempotencyKey, request.idempotencyKey));
    if (existing) {
      if (existing.billId !== request.billId || existing.donorId !== request.donorId || existing.amountToBillCents !== request.billAmountCents || existing.totalChargeCents !== split.totalChargeCents || existing.processingFeeCoveredCents !== split.processingFeeCoveredCents || existing.platformTipCents !== split.platformTipCents) {
        throw new Error('Idempotency key already belongs to a different donation');
      }
      if (!existing.stripePaymentIntentId) throw new Error('Stored intent is missing');
      const intent = await stripe.getIntent(existing.stripePaymentIntentId);
      return { transactionId: existing.id, paymentIntentId: intent.id, clientSecret: intent.clientSecret, split, feeBreakdown: split, expiresAt: existing.expiresAt.toISOString() };
    }
    const [donor] = await tx.select({ id: users.id }).from(users).where(and(eq(users.id, request.donorId), eq(users.role, 'donor')));
    if (!donor) throw new Error('Donor not found');
    const [bill] = await tx.select().from(bills).where(eq(bills.id, request.billId)).for('update');
    if (!bill || !['verified', 'funded'].includes(bill.status) || !bill.billerMerchantId || !isVerifiedDemoMerchantForCategory(bill.billerMerchantId, bill.category) || !bill.billerAccountEncrypted || bill.remainingBalanceCents === null) {
      throw new Error('Bill is not available for donation');
    }
    const [reservation] = await tx.select({ amount: sum(transactions.amountToBillCents) }).from(transactions).where(and(
      eq(transactions.billId, bill.id), eq(transactions.status, 'pending'), gt(transactions.expiresAt, new Date()),
    ));
    if (request.billAmountCents > bill.remainingBalanceCents - Number(reservation?.amount ?? 0)) {
      throw new Error('Donation exceeds the unreserved bill balance');
    }
    const transactionId = randomUUID();
    const metadata = {
      billId: bill.id,
      donorId: donor.id,
      transactionId,
      billAmountCents: String(request.billAmountCents),
      processingFeeCoveredCents: String(split.processingFeeCoveredCents),
      platformTipCents: String(split.platformTipCents),
      donorTermsVersion: LEGAL_TERMS_VERSION,
    };
    const intent = await stripe.createIntent(split.totalChargeCents, metadata, request.idempotencyKey);
    const persistedTransactionId = z.string().uuid().parse(intent.metadata.transactionId);
    if (intent.amountCents !== split.totalChargeCents || intent.metadata.billId !== bill.id || intent.metadata.donorId !== donor.id || intent.metadata.billAmountCents !== String(request.billAmountCents) || intent.metadata.processingFeeCoveredCents !== String(split.processingFeeCoveredCents) || intent.metadata.platformTipCents !== String(split.platformTipCents)) {
      throw new Error('Payment intent does not match the donation');
    }
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await tx.insert(transactions).values({
      id: persistedTransactionId,
      billId: bill.id,
      donorId: donor.id,
      idempotencyKey: request.idempotencyKey,
      amountToBillCents: request.billAmountCents,
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
    return { transactionId: persistedTransactionId, paymentIntentId: intent.id, clientSecret: intent.clientSecret, split, feeBreakdown: split, expiresAt: expiresAt.toISOString(), metadata: intent.metadata };
  });
}

const MockStripeEventSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['payment_intent.succeeded', 'payment_intent.payment_failed']),
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
    const [bill] = await tx.select().from(bills).where(eq(bills.id, transaction.billId)).for('update');
    if (!bill?.billerMerchantId || !isVerifiedDemoMerchantForCategory(bill.billerMerchantId, bill.category) || !bill.billerAccountEncrypted || bill.remainingBalanceCents === null || bill.remainingBalanceCents < transaction.amountToBillCents) {
      throw new Error('Bill cannot be settled');
    }
    const methodDisbursementId = await method.disburse({
      merchantId: bill.billerMerchantId,
      accountNumber: decryptAccountNumber(bill.billerAccountEncrypted),
      amountCents: transaction.amountToBillCents,
      idempotencyKey: transaction.id,
    });
    const remainingBalanceCents = bill.remainingBalanceCents - transaction.amountToBillCents;
    const [donor] = await tx.select({ email: users.email }).from(users).where(eq(users.id, transaction.donorId));
    if (!donor) throw new Error('Donor not found');
    const taxNotice = 'This direct bill payment is not represented as a tax-deductible charitable contribution. No 501(c)(3) status is claimed.';
    const receiptEmailPayload = {
      to: donor.email,
      subject: 'Open Relief payment confirmation',
      body: `Payment confirmation for ${bill.billerName ?? 'a demo creditor'} on ${new Date().toISOString()}. Amount directed to bill: $${(transaction.amountToBillCents / 100).toFixed(2)}. Total test charge: $${(transaction.totalChargeCents / 100).toFixed(2)}. Creditor payment reference: ${methodDisbursementId}. ${taxNotice}`,
      taxNotice,
    };
    await tx.update(bills).set({
      remainingBalanceCents,
      status: remainingBalanceCents === 0 ? 'settled' : 'funded',
      settledAt: remainingBalanceCents === 0 ? new Date() : null,
      updatedAt: new Date(),
    }).where(eq(bills.id, bill.id));
    await tx.update(users).set({ lifetimeAidCents: sql`${users.lifetimeAidCents} + ${transaction.amountToBillCents}`, lastAidAt: new Date() }).where(eq(users.id, bill.recipientId));
    await tx.update(transactions).set({ methodDisbursementId, stripeChargeId: verified?.chargeId ?? null, receiptEmailPayload, status: 'succeeded', updatedAt: new Date() }).where(eq(transactions.id, transaction.id));
    await tx.insert(auditLogs).values({
      id: randomUUID(), eventType: verified ? 'bill.sandbox_settled' : 'bill.mock_settled', actorId: transaction.donorId, billId: bill.id, transactionId: transaction.id,
      metadata: { amountToBillCents: transaction.amountToBillCents, methodDisbursementId, stripeChargeId: verified?.chargeId ?? null },
    });
    return { transactionId: transaction.id, alreadyProcessed: false, remainingBalanceCents, receiptEmailPayload };
  });
}

export async function settleMockPayment(intentId: string, services: Services, method: IMethodBillerClient = new MockMethodBillerClient()) {
  return settlePayment(intentId, services, method);
}

export async function failMockPayment(intentId: string, services: Services) {
  await services.db.update(transactions).set({ status: 'failed', updatedAt: new Date() }).where(and(eq(transactions.stripePaymentIntentId, intentId), eq(transactions.status, 'pending')));
}
