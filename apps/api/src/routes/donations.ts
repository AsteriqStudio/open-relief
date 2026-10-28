import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { bills, sponsorshipAllocations, sponsorshipPools, transactions } from '@open-relief/db';
import { decryptAccountNumber } from '@open-relief/db/security/encryption';
import { LegalAcceptanceSchema } from '@open-relief/shared';
import type { registerAuth } from '../auth.js';
import { createDonationIntent, FeeCoverageRequiredError, SponsorMatchChangedError, settleMockPayment } from '../payments.js';
import type { Services } from '../services.js';
import { createStripePaymentsClient } from '../stripeTest.js';

const DonationIntentRequestSchema = z.object({
  billId: z.string().uuid(),
  amountCents: z.number().int().positive().max(100_000_000),
  coverProcessingFee: z.boolean(),
  tipPercentage: z.number().finite().min(0).max(100),
  idempotencyKey: z.string().uuid().default(() => randomUUID()),
  donorAcceptance: LegalAcceptanceSchema,
  sponsorPoolId: z.string().uuid().optional(),
  expectedSponsorMatchCents: z.number().int().nonnegative().safe().optional(),
}).strict();
const TransactionIdSchema = z.object({ id: z.string().uuid() });

export function registerDonationRoutes(app: FastifyInstance, services: Services, requireAuth: ReturnType<typeof registerAuth>) {
  app.post('/api/donations/create-intent', { preHandler: requireAuth({ roles: ['donor'] }) }, async (request, reply) => {
    const input = DonationIntentRequestSchema.parse(request.body);
    const provider = createStripePaymentsClient(services.config);
    let result;
    try { result = await createDonationIntent({
      billId: input.billId,
      donorId: request.user!.id,
      billAmountCents: input.amountCents,
      coverProcessingFee: input.coverProcessingFee,
      tipPercentage: input.tipPercentage,
      idempotencyKey: input.idempotencyKey,
      donorAcceptance: input.donorAcceptance,
      sponsorPoolId: input.sponsorPoolId,
      expectedSponsorMatchCents: input.expectedSponsorMatchCents,
    }, services, provider.client); }
    catch (error) { if (error instanceof FeeCoverageRequiredError) return reply.code(422).send({ error: error.message, requiresDonorFeeCoverage: true }); if (error instanceof SponsorMatchChangedError) return reply.code(409).send({ error: error.message }); throw error; }
    return reply.code(201).send({ ...result, mode: provider.mode });
  });

  app.post('/api/demo/donations/:id/complete', { preHandler: requireAuth({ roles: ['donor'] }) }, async (request, reply) => {
    const { id } = TransactionIdSchema.parse(request.params);
    const [transaction] = await services.db.select({ paymentIntentId: transactions.stripePaymentIntentId, donorId: transactions.donorId }).from(transactions).where(eq(transactions.id, id));
    if (!transaction?.paymentIntentId || !transaction.paymentIntentId.startsWith('pi_mock_')) return reply.code(404).send({ error: 'Mock donation not found' });
    if (transaction.donorId !== request.user!.id) return reply.code(403).send({ error: 'Donation belongs to another donor' });
    return { mode: 'mock', settlement: await settleMockPayment(transaction.paymentIntentId, services) };
  });

  app.get('/api/donations/:id/receipt', { preHandler: requireAuth({ roles: ['donor', 'admin'] }) }, async (request, reply) => {
    const { id } = TransactionIdSchema.parse(request.params);
    const [row] = await services.db.select({
      id: transactions.id,
      donorId: transactions.donorId,
      status: transactions.status,
      amountToBillCents: transactions.amountToBillCents,
      sponsorMatchCents: transactions.sponsorMatchCents,
      totalChargeCents: transactions.totalChargeCents,
      processingFeeCoveredCents: transactions.processingFeeCoveredCents,
      platformTipCents: transactions.platformTipCents,
      stripeChargeId: transactions.stripeChargeId,
      methodDisbursementId: transactions.methodDisbursementId,
      receiptEmailPayload: transactions.receiptEmailPayload,
      stripePaymentIntentId: transactions.stripePaymentIntentId,
      billerName: bills.billerName,
      billerAccountEncrypted: bills.billerAccountEncrypted,
      createdAt: transactions.createdAt,
    }).from(transactions).innerJoin(bills, eq(transactions.billId, bills.id)).where(eq(transactions.id, id));
    if (!row || row.status !== 'succeeded') return reply.code(404).send({ error: 'Settled donation not found' });
    if (row.donorId !== request.user!.id && request.user!.role !== 'admin') return reply.code(403).send({ error: 'Receipt belongs to another donor' });
    const [allocation] = await services.db.select({ sponsorName: sponsorshipPools.sponsorName, feeBufferAppliedCents: sponsorshipAllocations.feeBufferAppliedCents }).from(sponsorshipAllocations).innerJoin(sponsorshipPools, eq(sponsorshipAllocations.poolId, sponsorshipPools.id)).where(eq(sponsorshipAllocations.transactionId, row.id));
    const { billerAccountEncrypted, ...receipt } = row;
    return {
      ...receipt,
      donorPrincipalCents: row.amountToBillCents,
      amountToBillCents: row.amountToBillCents + row.sponsorMatchCents,
      sponsorName: allocation?.sponsorName ?? null,
      feeBufferAppliedCents: allocation?.feeBufferAppliedCents ?? 0,
      accountLast4: billerAccountEncrypted ? decryptAccountNumber(billerAccountEncrypted).slice(-4) : null,
      mode: row.stripePaymentIntentId?.startsWith('pi_mock_') ? 'mock' : 'test',
      taxNotice: row.receiptEmailPayload?.taxNotice ?? 'This demo receipt does not establish a tax-deductible charitable contribution.',
    };
  });
}
