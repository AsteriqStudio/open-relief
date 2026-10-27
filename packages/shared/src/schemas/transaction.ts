import { z } from 'zod';

export const TransactionStatusSchema = z.enum(['pending', 'succeeded', 'failed']);

export const TransactionSchema = z.object({
  id: z.string().uuid(),
  billId: z.string().uuid(),
  donorId: z.string().uuid(),
  amountToBillCents: z.number().int().positive(),
  processingFeeCoveredCents: z.number().int().nonnegative(),
  platformTipCents: z.number().int().nonnegative(),
  stripePaymentIntentId: z.string().min(1).nullable(),
  methodDisbursementId: z.string().min(1).nullable(),
  status: TransactionStatusSchema,
}).strict();

export type Transaction = z.infer<typeof TransactionSchema>;
export type TransactionStatus = z.infer<typeof TransactionStatusSchema>;
