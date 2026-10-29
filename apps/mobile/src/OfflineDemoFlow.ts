import { z } from 'zod';
import { PitchCardSchema } from '@open-relief/shared';
import type { PitchCard } from '@open-relief/shared';

export const DemoSubmissionSchema = z.object({
  id: z.string().uuid(),
  creditorName: z.string().trim().min(2).max(120),
  category: z.enum(['electric', 'water', 'gas', 'medical', 'telecom']),
  location: z.string().trim().min(2).max(80),
  story: z.string().trim().min(10).max(240),
  accountLast4: z.string().regex(/^\d{4}$/),
  balanceCents: z.number().int().positive().max(100_000_000),
  status: z.enum(['pending_review', 'approved', 'rejected']),
  reviewNote: z.string().nullable(),
  createdAt: z.string().datetime(),
}).strict();
export type DemoSubmission = z.infer<typeof DemoSubmissionSchema>;

export const DemoGiftSchema = z.object({
  billId: z.string().uuid(),
  creditorName: z.string().min(2),
  currency: z.enum(['USD', 'EUR']),
  donorCents: z.number().int().positive(),
  matchCents: z.number().int().nonnegative(),
  creditorCents: z.number().int().positive(),
  donorTotalCents: z.number().int().positive(),
  remainingCents: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
}).strict().refine((gift) => gift.creditorCents === gift.donorCents + gift.matchCents && gift.donorTotalCents >= gift.donorCents, 'Illustrative gift totals must reconcile');
export type DemoGift = z.infer<typeof DemoGiftSchema>;

export function remainingDemoBalance(balances: Record<string, number>, card: PitchCard): number {
  return balances[card.id] ?? card.balanceCents;
}

export function reviewDemoSubmission(submissions: DemoSubmission[], id: string, decision: 'approve' | 'reject', note: string): DemoSubmission[] {
  const trimmed = note.trim();
  if (trimmed.length < 5) throw new Error('Enter a review note of at least five characters.');
  let found = false;
  const next = submissions.map((submission) => {
    if (submission.id !== id) return submission;
    if (submission.status !== 'pending_review') throw new Error('This sample has already been reviewed.');
    found = true;
    return DemoSubmissionSchema.parse({ ...submission, status: decision === 'approve' ? 'approved' : 'rejected', reviewNote: trimmed });
  });
  if (!found) throw new Error('Sample submission was not found.');
  return next;
}

export function approvedDemoCards(submissions: DemoSubmission[]): PitchCard[] {
  return submissions.filter((submission) => submission.status === 'approved').map((submission) => PitchCardSchema.parse({
    id: submission.id,
    billerName: `${submission.creditorName} (demo)`,
    region: 'US',
    currency: 'USD',
    category: submission.category,
    location: submission.location,
    urgency: 'Fictional overdue balance',
    story: submission.story,
    accountLast4: submission.accountLast4,
    balanceCents: submission.balanceCents,
    sponsorName: null,
    matchRatio: 0,
    railLabel: 'Fictional local submission; no creditor verification or transfer',
  }));
}

export const INITIAL_DEMO_SUBMISSIONS: DemoSubmission[] = [
  DemoSubmissionSchema.parse({ id: '00000000-0000-4000-8000-000000000301', creditorName: 'Harbor Water', category: 'water', location: 'Cleveland, OH', story: 'A fictional household has an overdue water bill.', accountLast4: '0301', balanceCents: 9_860, status: 'pending_review', reviewNote: null, createdAt: '2026-01-01T00:00:00.000Z' }),
  DemoSubmissionSchema.parse({ id: '00000000-0000-4000-8000-000000000302', creditorName: 'Northside Clinic', category: 'medical', location: 'Detroit, MI', story: 'A fictional patient needs help with an essential-care bill.', accountLast4: '0302', balanceCents: 18_400, status: 'pending_review', reviewNote: null, createdAt: '2026-01-01T00:00:00.000Z' }),
];
