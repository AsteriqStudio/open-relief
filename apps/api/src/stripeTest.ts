import Stripe from 'stripe';
import { z } from 'zod';
import type { ApiConfig } from './config.js';
import { MockStripePaymentsClient, type IStripePaymentsClient, type PaymentIntent } from './payments.js';

const TestKeySchema = z.string().regex(/^sk_test_[A-Za-z0-9_]+$/);

export class StripeTestPaymentsClient implements IStripePaymentsClient {
  private readonly stripe: Stripe;

  constructor(secretKey: string, stripe?: Stripe) {
    const key = TestKeySchema.parse(secretKey);
    this.stripe = stripe ?? new Stripe(key);
  }

  async createIntent(amountCents: number, metadata: Record<string, string>, idempotencyKey: string): Promise<PaymentIntent> {
    const intent = await this.stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'usd',
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
      metadata,
    }, { idempotencyKey });
    if (!intent.client_secret) throw new Error('Stripe test intent has no client secret');
    return { id: intent.id, clientSecret: intent.client_secret, amountCents: intent.amount, metadata: intent.metadata };
  }

  async getIntent(id: string): Promise<PaymentIntent> {
    const intent = await this.stripe.paymentIntents.retrieve(id);
    if (!intent.client_secret) throw new Error('Stripe test intent has no client secret');
    return { id: intent.id, clientSecret: intent.client_secret, amountCents: intent.amount, metadata: intent.metadata };
  }
}

export function createStripePaymentsClient(config: ApiConfig): { mode: 'mock' | 'test'; client: IStripePaymentsClient } {
  if (config.STRIPE_SECRET_KEY) return { mode: 'test', client: new StripeTestPaymentsClient(config.STRIPE_SECRET_KEY) };
  return { mode: 'mock', client: new MockStripePaymentsClient() };
}
