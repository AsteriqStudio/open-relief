import { z } from 'zod';

export const BillCategorySchema = z.enum(['electric', 'water', 'gas', 'medical']);
export const BillStatusSchema = z.enum(['pending_ocr', 'pending_review', 'verified', 'funded', 'settled', 'rejected']);

export const BillSchema = z.object({
  id: z.string().uuid(),
  recipientId: z.string().uuid(),
  billerName: z.string().min(1),
  accountHolderName: z.string().nullable(),
  isShutoffNotice: z.boolean(),
  daysUntilDisconnection: z.number().int().nonnegative().nullable(),
  rejectionReason: z.string().nullable(),
  billerAccountEncrypted: z.string().min(1),
  dueDate: z.string().date(),
  statementBalanceCents: z.number().int().positive(),
  remainingBalanceCents: z.number().int().nonnegative(),
  category: BillCategorySchema,
  documentUrl: z.string().url(),
  status: BillStatusSchema,
  fraudScore: z.number().min(0).max(100),
}).strict().superRefine((bill, context) => {
  if (bill.remainingBalanceCents > bill.statementBalanceCents) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['remainingBalanceCents'],
      message: 'Remaining balance cannot exceed statement balance',
    });
  }
});

export type Bill = z.infer<typeof BillSchema>;
export type BillCategory = z.infer<typeof BillCategorySchema>;
export type BillStatus = z.infer<typeof BillStatusSchema>;
