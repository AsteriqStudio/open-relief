import { z } from 'zod';

export const DonationSplitInputSchema = z.object({
  billAmountCents: z.number().int().positive().safe(),
  coverProcessingFee: z.boolean(),
  tipPercentage: z.number().finite().min(0).max(100),
}).strict();

export type DonationSplitInput = z.infer<typeof DonationSplitInputSchema>;

export const DonationSplitSchema = z.object({
  totalChargeCents: z.number().int().nonnegative().safe(),
  netPaymentToBillerCents: z.number().int().nonnegative().safe(),
  stripeFeeCents: z.number().int().nonnegative().safe(),
  processingFeeCoveredCents: z.number().int().nonnegative().safe(),
  platformTipCents: z.number().int().nonnegative().safe(),
  netPlatformTipCents: z.number().int().safe(),
}).strict();

export type DonationSplit = z.infer<typeof DonationSplitSchema>;

function checkedCents(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError('Donation amount exceeds the supported cent range');
  }
  return value;
}

function stripeFeeCents(totalChargeCents: number): number {
  return checkedCents(Math.round(totalChargeCents * 0.029 + 30));
}

/** A pure estimate for the approved sandbox card-fee allocation. */
export function calculateDonationSplit(input: DonationSplitInput): DonationSplit {
  const { billAmountCents, coverProcessingFee, tipPercentage } = DonationSplitInputSchema.parse(input);
  const platformTipCents = checkedCents(Math.round(billAmountCents * tipPercentage / 100));
  const subtotalCents = checkedCents(billAmountCents + platformTipCents);

  let processingFeeCoveredCents = 0;
  if (coverProcessingFee) {
    processingFeeCoveredCents = stripeFeeCents(subtotalCents);
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const next = stripeFeeCents(checkedCents(subtotalCents + processingFeeCoveredCents));
      if (next === processingFeeCoveredCents) break;
      processingFeeCoveredCents = next;
      if (attempt === 99) throw new RangeError('Processing fee did not converge');
    }
  }

  const totalChargeCents = checkedCents(subtotalCents + processingFeeCoveredCents);
  const stripeFee = stripeFeeCents(totalChargeCents);
  const netPlatformTipCents = checkedCents(platformTipCents + processingFeeCoveredCents) - stripeFee;

  return DonationSplitSchema.parse({
    totalChargeCents,
    netPaymentToBillerCents: billAmountCents,
    stripeFeeCents: stripeFee,
    processingFeeCoveredCents,
    platformTipCents,
    netPlatformTipCents,
  });
}
