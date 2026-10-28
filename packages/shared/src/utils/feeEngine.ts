import { z } from 'zod';

export const DemoCurrencySchema = z.enum(['USD', 'EUR']);
export type DemoCurrency = z.infer<typeof DemoCurrencySchema>;

export function formatCurrency(cents: number, currency: DemoCurrency = 'USD'): string {
  z.number().int().safe().parse(cents);
  const selected = DemoCurrencySchema.parse(currency);
  return new Intl.NumberFormat(selected === 'EUR' ? 'de-DE' : 'en-US', { style: 'currency', currency: selected }).format(cents / 100);
}

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

export const SponsoredDonationSplitInputSchema = DonationSplitInputSchema.extend({
  sponsorMatchCents: z.number().int().nonnegative().safe(),
  feeBufferAvailableCents: z.number().int().nonnegative().safe(),
});

export const SponsoredDonationSplitSchema = DonationSplitSchema.extend({
  donorChargeCents: z.number().int().positive().safe(),
  sponsorMatchCents: z.number().int().nonnegative().safe(),
  totalDisbursementToCreditorCents: z.number().int().positive().safe(),
  stripeProcessingFeeCents: z.number().int().nonnegative().safe(),
  feeCoverageSource: z.enum(['donor', 'sponsor_buffer', 'none']),
  feeBufferAppliedCents: z.number().int().nonnegative().safe(),
  requiresDonorFeeCoverage: z.boolean(),
}).strict();

export type SponsoredDonationSplit = z.infer<typeof SponsoredDonationSplitSchema>;

export const SPONSOR_RETAINER_PERCENT = 15 as const;
export const SponsorRetainerInputSchema = z.object({ matchBudgetCents: z.number().int().nonnegative().safe() }).strict();

export function calculateSponsorRetainerCents(matchBudgetCents: number): number {
  const input = SponsorRetainerInputSchema.parse({ matchBudgetCents });
  return checkedCents(Math.round(input.matchBudgetCents * SPONSOR_RETAINER_PERCENT / 100));
}

export function calculateSponsorMatchCents(donorPrincipalCents: number, matchRatio: number, billHeadroomCents: number): number {
  const input = z.object({
    donorPrincipalCents: z.number().int().positive().safe(),
    matchRatio: z.number().finite().positive().max(9.99),
    billHeadroomCents: z.number().int().nonnegative().safe(),
  }).strict().parse({ donorPrincipalCents, matchRatio, billHeadroomCents });
  return checkedCents(Math.min(Math.round(input.donorPrincipalCents * input.matchRatio), input.billHeadroomCents));
}

export function calculateSponsoredDonationSplit(input: z.input<typeof SponsoredDonationSplitInputSchema>): SponsoredDonationSplit {
  const parsed = SponsoredDonationSplitInputSchema.parse(input);
  const base = calculateDonationSplit({ billAmountCents: parsed.billAmountCents, coverProcessingFee: parsed.coverProcessingFee, tipPercentage: parsed.tipPercentage });
  const feeBufferAppliedCents = !parsed.coverProcessingFee && parsed.feeBufferAvailableCents >= base.stripeFeeCents ? base.stripeFeeCents : 0;
  const requiresDonorFeeCoverage = !parsed.coverProcessingFee && feeBufferAppliedCents === 0;
  const totalDisbursementToCreditorCents = checkedCents(parsed.billAmountCents + parsed.sponsorMatchCents);
  return SponsoredDonationSplitSchema.parse({
    ...base,
    netPaymentToBillerCents: totalDisbursementToCreditorCents,
    netPlatformTipCents: base.netPlatformTipCents + feeBufferAppliedCents,
    donorChargeCents: base.totalChargeCents,
    sponsorMatchCents: parsed.sponsorMatchCents,
    totalDisbursementToCreditorCents,
    stripeProcessingFeeCents: base.stripeFeeCents,
    feeCoverageSource: parsed.coverProcessingFee ? 'donor' : feeBufferAppliedCents > 0 ? 'sponsor_buffer' : 'none',
    feeBufferAppliedCents,
    requiresDonorFeeCoverage,
  });
}

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
