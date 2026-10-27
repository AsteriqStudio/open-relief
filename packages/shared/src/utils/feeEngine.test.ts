import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateDonationSplit } from './feeEngine.js';

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
