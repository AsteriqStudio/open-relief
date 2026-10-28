import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateDonationSplit, calculateSponsoredDonationSplit, calculateSponsorMatchCents, calculateSponsorRetainerCents, formatCurrency } from './feeEngine.js';
import { PITCH_CARDS } from '../pitchDeck.js';

test('offline pitch cards use explicit currencies and fictional rails', () => {
  assert.equal(formatCurrency(14_250), '$142.50');
  assert.equal(formatCurrency(11_800, 'EUR'), '118,00 €');
  assert.equal(PITCH_CARDS.length, 4);
  assert.equal(PITCH_CARDS.filter((card) => card.currency === 'EUR').length, 2);
  assert.ok(PITCH_CARDS.every((card) => card.railLabel.includes('sandbox') || card.railLabel.includes('concept')));
  assert.throws(() => formatCurrency(Number.POSITIVE_INFINITY));
});

test('covered processing preserves principal and net tip', () => {
  assert.deepEqual(calculateDonationSplit({ billAmountCents: 10_000, tipPercentage: 10, coverProcessingFee: true }), {
    totalChargeCents: 11_359,
    netPaymentToBillerCents: 10_000,
    stripeFeeCents: 359,
    processingFeeCoveredCents: 359,
    platformTipCents: 1_000,
    netPlatformTipCents: 1_000,
  });
});

test('uncovered processing reduces the platform share without touching principal', () => {
  const result = calculateDonationSplit({ billAmountCents: 10_000, tipPercentage: 10, coverProcessingFee: false });
  assert.equal(result.totalChargeCents, 11_000);
  assert.equal(result.netPaymentToBillerCents, 10_000);
  assert.equal(result.stripeFeeCents, 349);
  assert.equal(result.netPlatformTipCents, 651);
  assert.equal(calculateDonationSplit({ billAmountCents: 10_000, tipPercentage: 0, coverProcessingFee: false }).netPlatformTipCents, -320);
});

test('rejects invalid and unsafe amounts', () => {
  assert.throws(() => calculateDonationSplit({ billAmountCents: 0, tipPercentage: 0, coverProcessingFee: true }));
  assert.throws(() => calculateDonationSplit({ billAmountCents: 100, tipPercentage: -1, coverProcessingFee: true }));
  assert.throws(() => calculateDonationSplit({ billAmountCents: Number.MAX_SAFE_INTEGER, tipPercentage: 100, coverProcessingFee: true }));
});

test('sponsor match increases creditor principal without changing donor card fee math', () => {
  assert.equal(calculateSponsorMatchCents(5_000, 1, 5_000), 5_000);
  assert.equal(calculateSponsorMatchCents(5_000, 1, 2_000), 2_000);
  const covered = calculateSponsoredDonationSplit({ billAmountCents: 5_000, sponsorMatchCents: 5_000, coverProcessingFee: true, tipPercentage: 0, feeBufferAvailableCents: 0 });
  assert.equal(covered.donorChargeCents, 5_180);
  assert.equal(covered.totalDisbursementToCreditorCents, 10_000);
  assert.equal(covered.feeCoverageSource, 'donor');
  const sponsorCovered = calculateSponsoredDonationSplit({ billAmountCents: 5_000, sponsorMatchCents: 5_000, coverProcessingFee: false, tipPercentage: 0, feeBufferAvailableCents: 175 });
  assert.equal(sponsorCovered.donorChargeCents, 5_000);
  assert.equal(sponsorCovered.stripeProcessingFeeCents, 175);
  assert.equal(sponsorCovered.feeBufferAppliedCents, 175);
  assert.equal(sponsorCovered.netPlatformTipCents, 0);
  assert.equal(sponsorCovered.requiresDonorFeeCoverage, false);
  assert.equal(calculateSponsoredDonationSplit({ billAmountCents: 5_000, sponsorMatchCents: 5_000, coverProcessingFee: false, tipPercentage: 0, feeBufferAvailableCents: 174 }).requiresDonorFeeCoverage, true);
  assert.equal(calculateSponsorRetainerCents(5_000_000), 750_000);
});
