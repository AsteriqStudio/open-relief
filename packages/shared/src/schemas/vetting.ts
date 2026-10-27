import { z } from 'zod';

export const AssistanceProgramSchema = z.enum(['SNAP', 'MEDICAID', 'LIHEAP', 'NONE']);
export const VettingDecisionSchema = z.object({
  outcome: z.enum(['verified', 'pending_review', 'rejected']),
  reason: z.string().nullable(),
  isShutoffNotice: z.boolean(),
  daysUntilDisconnection: z.number().int().nonnegative().nullable(),
  nameSimilarity: z.number().min(0).max(1).nullable(),
}).strict();

export type VettingDecision = z.infer<typeof VettingDecisionSchema>;
