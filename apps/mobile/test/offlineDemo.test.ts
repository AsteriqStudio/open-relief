import assert from 'node:assert/strict';
import test from 'node:test';
import { PITCH_CARDS } from '@open-relief/shared';
import { approvedDemoCards, DemoGiftSchema, INITIAL_DEMO_SUBMISSIONS, remainingDemoBalance, reviewDemoSubmission } from '../src/OfflineDemoFlow.ts';

test('offline deck covers all five categories without changing the connected feed', () => {
  assert.deepEqual(new Set(PITCH_CARDS.map((card) => card.category)), new Set(['electric', 'water', 'gas', 'medical', 'telecom']));
  assert.equal(PITCH_CARDS.filter((card) => card.currency === 'EUR').length, 2);
  assert.equal(approvedDemoCards(INITIAL_DEMO_SUBMISSIONS).length, 0);
});

test('sample review affects only fictional local cards and cannot be replayed', () => {
  const sample = INITIAL_DEMO_SUBMISSIONS[0]!;
  assert.throws(() => reviewDemoSubmission(INITIAL_DEMO_SUBMISSIONS, sample.id, 'approve', 'bad'));
  const approved = reviewDemoSubmission(INITIAL_DEMO_SUBMISSIONS, sample.id, 'approve', 'Reviewed fictional fields');
  assert.equal(approved[0]?.status, 'approved');
  assert.equal(approved[1]?.status, 'pending_review');
  const cards = approvedDemoCards(approved);
  assert.equal(cards.length, 1);
  assert.equal(cards[0]?.id, sample.id);
  assert.equal(remainingDemoBalance({}, cards[0]!), sample.balanceCents);
  assert.equal(remainingDemoBalance({ [sample.id]: 0 }, cards[0]!), 0);
  assert.match(cards[0]!.railLabel, /Fictional local submission/);
  assert.throws(() => reviewDemoSubmission(approved, sample.id, 'reject', 'Second decision'));
  const rejected = reviewDemoSubmission(INITIAL_DEMO_SUBMISSIONS, sample.id, 'reject', 'Sample is incomplete');
  assert.equal(approvedDemoCards(rejected).length, 0);
});

test('demo gift records cannot report a negative balance or an invalid currency', () => {
  const fixture = { billId: PITCH_CARDS[0]!.id, creditorName: PITCH_CARDS[0]!.billerName, currency: 'USD', donorCents: 5000, matchCents: 5000, creditorCents: 10000, donorTotalCents: 5180, remainingCents: 4250, createdAt: new Date().toISOString() };
  assert.equal(DemoGiftSchema.parse(fixture).creditorCents, 10000);
  assert.equal(DemoGiftSchema.safeParse({ ...fixture, remainingCents: -1 }).success, false);
  assert.equal(DemoGiftSchema.safeParse({ ...fixture, currency: 'GBP' }).success, false);
});
