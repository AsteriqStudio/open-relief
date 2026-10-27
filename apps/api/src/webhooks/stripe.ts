import Stripe from 'stripe';
import { z } from 'zod';
import { MethodSandboxBillerClient } from '../biller/methodSandbox.js';
import type { ApiConfig } from '../config.js';
import { failMockPayment, MockMethodBillerClient, settlePayment, verifyMockStripeEvent } from '../payments.js';
import type { Services } from '../services.js';

const SucceededIntentSchema = z.object({
  id: z.string().startsWith('pi_'),
  amount_received: z.number().int().positive(),
  currency: z.literal('usd'),
  latest_charge: z.union([z.string().startsWith('ch_'), z.object({ id: z.string().startsWith('ch_') })]),
  metadata: z.record(z.string()),
});

export function createMethodBillerClient(config: ApiConfig) {
  return config.METHOD_PROVIDER === 'sandbox' || config.STRIPE_SECRET_KEY
    ? new MethodSandboxBillerClient()
    : new MockMethodBillerClient();
}

export function verifyStripeWebhook(payload: Buffer, signature: string, config: ApiConfig) {
  if (!config.STRIPE_SECRET_KEY) return verifyMockStripeEvent(payload, signature, config.MOCK_STRIPE_WEBHOOK_SECRET);
  if (!config.STRIPE_WEBHOOK_SECRET) throw new Error('Stripe test webhook secret is required');
  const stripe = new Stripe(config.STRIPE_SECRET_KEY);
  const event = stripe.webhooks.constructEvent(payload, signature, config.STRIPE_WEBHOOK_SECRET);
  if (event.type !== 'payment_intent.succeeded' && event.type !== 'payment_intent.payment_failed') {
    return { id: event.id, type: 'ignored' as const, data: { object: { id: '' } } };
  }
  if (event.type === 'payment_intent.payment_failed') {
    return { id: event.id, type: event.type, data: { object: { id: event.data.object.id } } };
  }
  const intent = SucceededIntentSchema.parse(event.data.object);
  return {
    id: event.id,
    type: event.type,
    data: { object: {
      id: intent.id,
      amountReceivedCents: intent.amount_received,
      chargeId: typeof intent.latest_charge === 'string' ? intent.latest_charge : intent.latest_charge.id,
      metadata: intent.metadata,
    } },
  };
}

export async function handleVerifiedStripeEvent(event: ReturnType<typeof verifyStripeWebhook>, services: Services) {
  if (event.type === 'ignored') return { received: true };
  if (event.type === 'payment_intent.payment_failed') {
    await failMockPayment(event.data.object.id, services);
    return { received: true };
  }
  const payment = event.data.object;
  const verified = 'amountReceivedCents' in payment
    ? { amountReceivedCents: payment.amountReceivedCents, chargeId: payment.chargeId, metadata: payment.metadata }
    : undefined;
  return { received: true, settlement: await settlePayment(payment.id, services, createMethodBillerClient(services.config), verified) };
}
