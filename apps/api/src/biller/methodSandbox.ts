import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { BillCategory } from '@open-relief/shared';
import type { IMethodBillerClient } from '../payments.js';

export const METHOD_SANDBOX_BASE_URL = 'https://dev.methodfi.com/v1';

const SandboxPaymentInputSchema = z.object({
  sourceAccount: z.literal('sandbox-test-source'),
  destinationBillerId: z.string().min(1),
  billerAccountNumber: z.string().min(1),
  amountCents: z.number().int().positive(),
  idempotencyKey: z.string().uuid(),
}).strict();

const demoMerchants = [
  { id: 'mock-electric-detroit', name: 'DTE Energy demo', routingNumber: '100000001', category: 'electric' },
  { id: 'mock-water-flint', name: 'Flint Water demo', routingNumber: '100000002', category: 'water' },
  { id: 'mock-gas-chicago', name: 'Chicago Gas demo', routingNumber: '100000003', category: 'gas' },
  { id: 'mock-electric-phoenix', name: 'Phoenix Electric demo', routingNumber: '100000004', category: 'electric' },
  { id: 'mock-water-austin', name: 'Austin Water demo', routingNumber: '100000005', category: 'water' },
  { id: 'mock-electric-coned', name: 'ConEd demo', routingNumber: '100000006', category: 'electric' },
  { id: 'mock-demo-utility', name: 'Demo Utility', routingNumber: '100000007', category: 'electric' },
  { id: 'mock-medical-hospital', name: 'Community Hospital demo', routingNumber: '100000008', category: 'medical' },
  { id: 'mock-telecom-provider', name: 'Community Telecom demo', routingNumber: '100000009', category: 'telecom' },
] as const;

export function isVerifiedDemoMerchantId(id: string): boolean {
  return demoMerchants.some((merchant) => merchant.id === id);
}

export function isVerifiedDemoMerchantForCategory(id: string, category: BillCategory): boolean {
  return demoMerchants.some((merchant) => merchant.id === id && merchant.category === category);
}

/** Deterministic local simulation of Method's sandbox bill-pay contract. No HTTP or funds move. */
export class MethodSandboxBillerClient implements IMethodBillerClient {
  readonly baseUrl = METHOD_SANDBOX_BASE_URL;

  async getMerchant(routingNumber: string) {
    z.string().regex(/^\d{9}$/).parse(routingNumber);
    const merchant = demoMerchants.find((candidate) => candidate.routingNumber === routingNumber);
    if (!merchant) throw new Error('Unknown sandbox merchant routing number');
    return merchant;
  }

  async createPayment(input: z.input<typeof SandboxPaymentInputSchema>) {
    const payment = SandboxPaymentInputSchema.parse(input);
    if (!isVerifiedDemoMerchantId(payment.destinationBillerId)) {
      throw new Error('Sandbox payment requires a verified demo creditor');
    }
    const digest = createHash('sha256').update(payment.idempotencyKey).digest('hex').slice(0, 24);
    return { id: `pmt_${digest}`, status: 'sent' as const, destinationBillerId: payment.destinationBillerId, amountCents: payment.amountCents };
  }

  async disburse(input: { merchantId: string; accountNumber: string; amountCents: number; idempotencyKey: string }): Promise<string> {
    const result = await this.createPayment({
      sourceAccount: 'sandbox-test-source',
      destinationBillerId: input.merchantId,
      billerAccountNumber: input.accountNumber,
      amountCents: input.amountCents,
      idempotencyKey: input.idempotencyKey,
    });
    if (result.status !== 'sent') throw new Error('Sandbox creditor payment was not sent');
    return result.id;
  }
}
