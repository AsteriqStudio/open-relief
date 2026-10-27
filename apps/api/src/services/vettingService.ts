import { VettingDecisionSchema } from '@open-relief/shared';
import { z } from 'zod';

export const VettingInputSchema = z.object({
  legalName: z.string().nullable(),
  accountHolderName: z.string().nullable(),
  noticeText: z.string(),
  statementBalanceCents: z.number().int().positive(),
  lifetimeAidCents: z.number().int().nonnegative(),
  currentYearAidCents: z.number().int().nonnegative(),
  activeBillCommitmentsCents: z.number().int().nonnegative(),
  lastAidAt: z.date().nullable(),
  now: z.date(),
}).strict();

const URGENCY_PATTERN = /\b(?:disconnection|shut[ -]?off|past[ -]?due|final notice|termination)\b/i;
const SHUTOFF_PATTERN = /\b(?:disconnection|shut[ -]?off|final notice|termination)\b/i;
const NON_URGENT_REASON = 'Currently prioritizing accounts with active shut-off or past-due notices.';
const AID_CAP_CENTS = 60_000;
const COOLDOWN_MS = 60 * 24 * 60 * 60 * 1000;

function normalizeName(name: string): string {
  return name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z ]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function nameSimilarity(left: string, right: string): number {
  const a = normalizeName(left);
  const b = normalizeName(right);
  if (!a || !b) return 0;
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current.push(Math.min(current[j - 1]! + 1, previous[j]! + 1, previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1)));
    }
    previous.splice(0, previous.length, ...current);
  }
  return Math.max(0, 1 - previous[b.length]! / Math.max(a.length, b.length));
}

export function assessBillEligibility(rawInput: z.input<typeof VettingInputSchema>) {
  const input = VettingInputSchema.parse(rawInput);
  const notice = input.noticeText;
  const isShutoffNotice = SHUTOFF_PATTERN.test(notice);
  const daysMatch = /\b(?:disconnection|shut[ -]?off|termination)\s+(?:in\s+)?(\d{1,3})\s+days?\b/i.exec(notice);
  const daysUntilDisconnection = daysMatch ? Number(daysMatch[1]) : null;
  const similarity = input.legalName && input.accountHolderName ? nameSimilarity(input.legalName, input.accountHolderName) : null;
  const decision = (outcome: 'verified' | 'pending_review' | 'rejected', reason: string | null) => VettingDecisionSchema.parse({
    outcome, reason, isShutoffNotice, daysUntilDisconnection, nameSimilarity: similarity,
  });
  if (!URGENCY_PATTERN.test(notice)) return decision('rejected', NON_URGENT_REASON);
  if (input.currentYearAidCents + input.activeBillCommitmentsCents + input.statementBalanceCents > AID_CAP_CENTS) return decision('rejected', 'This bill exceeds the $600 calendar-year assistance limit.');
  if (input.lastAidAt && input.now.getTime() - input.lastAidAt.getTime() < COOLDOWN_MS) return decision('pending_review', 'Recent assistance requires manual review before another bill can be listed.');
  if (similarity === null || similarity < 0.8) return decision('pending_review', 'The account holder name needs manual identity review.');
  return decision('verified', null);
}
