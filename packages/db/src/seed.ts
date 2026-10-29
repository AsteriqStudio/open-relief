import { and, eq, isNull } from 'drizzle-orm';
import { PITCH_CARDS } from '@open-relief/shared';
import { createDatabase, bills, pitchDemoCards, sponsorshipPools, users } from './index.js';
import { accountLookupHash, billDuplicateFingerprint, encryptAccountNumber } from './security/encryption.js';

const recipientId = '00000000-0000-4000-8000-000000000101';
const donorId = '00000000-0000-4000-8000-000000000102';

const samples = [
  { id: '00000000-0000-4000-8000-000000000201', billerName: 'DTE Energy (demo)', merchantId: 'mock-electric-detroit', category: 'electric', zipCode: '48201', story: 'Shut-off scheduled in 48 hours. A Detroit household needs help keeping the lights on.', account: 'DEMO-E-101', balance: 14_250 },
  { id: '00000000-0000-4000-8000-000000000202', billerName: 'Flint Water Demo', merchantId: 'mock-water-flint', category: 'water', zipCode: '48502', story: 'Flint household needs help keeping water service', account: 'DEMO-W-102', balance: 8_400 },
  { id: '00000000-0000-4000-8000-000000000203', billerName: 'Chicago Gas Demo', merchantId: 'mock-gas-chicago', category: 'gas', zipCode: '60607', story: 'Chicago household with an overdue heating bill', account: 'DEMO-G-103', balance: 15_700 },
  { id: '00000000-0000-4000-8000-000000000204', billerName: 'Phoenix Electric Demo', merchantId: 'mock-electric-phoenix', category: 'electric', zipCode: '85004', story: 'Phoenix household needs help with electric service', account: 'DEMO-E-104', balance: 9_950 },
  { id: '00000000-0000-4000-8000-000000000205', billerName: 'Austin Water Demo', merchantId: 'mock-water-austin', category: 'water', zipCode: '78701', story: 'Austin household with an overdue water bill', account: 'DEMO-W-105', balance: 6_275 },
  { id: '00000000-0000-4000-8000-000000000206', billerName: 'Community Hospital Demo', merchantId: 'mock-medical-hospital', category: 'medical', zipCode: '30303', story: 'Atlanta household with an overdue medical bill', account: 'DEMO-M-106', balance: 3_500 },
  { id: '00000000-0000-4000-8000-000000000207', billerName: 'Spectrum Broadband (demo)', merchantId: 'mock-telecom-provider', category: 'telecom', zipCode: '98101', story: 'Broadband disconnection notice. A student household needs access for school.', account: 'DEMO-T-107', balance: 6_499 },
] as const;

const { db, pool } = createDatabase();
try {
  await db.insert(users).values([
    { id: recipientId, role: 'recipient', email: 'recipient@example.invalid', phone: '+15555550101', legalName: 'Demo Recipient' },
    { id: donorId, role: 'donor', email: 'donor@example.invalid', phone: '+15555550102' },
  ]).onConflictDoNothing();
  await db.update(users).set({ legalName: 'Demo Recipient' }).where(and(eq(users.id, recipientId), isNull(users.legalName)));

  for (const sample of samples) {
    const accountHash = accountLookupHash(sample.account);
    await db.insert(bills).values({
      id: sample.id,
      recipientId,
      billerName: sample.billerName,
      accountHolderName: 'Demo Recipient',
      isShutoffNotice: true,
      daysUntilDisconnection: 4,
      billerMerchantId: sample.merchantId,
      billerAccountEncrypted: encryptAccountNumber(sample.account),
      accountHash,
      duplicateFingerprint: billDuplicateFingerprint(sample.billerName, sample.account, '2026-12-15'),
      dueDate: '2026-12-15',
      statementBalanceCents: sample.balance,
      remainingBalanceCents: sample.balance,
      category: sample.category,
      documentUrl: `https://example.invalid/seed/${sample.id}.pdf`,
      documentKey: `seed/${sample.id}.pdf`,
      documentMimeType: 'application/pdf',
      documentSizeBytes: 1,
      status: 'verified',
      fraudScore: 0,
      ocrConfidence: 100,
      zipCode: sample.zipCode,
      story: sample.story,
    }).onConflictDoNothing();
    await db.update(bills).set({ accountHolderName: 'Demo Recipient', isShutoffNotice: true, daysUntilDisconnection: 4 })
      .where(and(eq(bills.id, sample.id), isNull(bills.accountHolderName)));
  }
  for (const [id, previousBalance, nextBalance, nextName, nextStory] of [
    ['00000000-0000-4000-8000-000000000201', 12_500, 14_250, 'DTE Energy (demo)', 'Shut-off scheduled in 48 hours. A Detroit household needs help keeping the lights on.'],
    ['00000000-0000-4000-8000-000000000207', 3_000, 6_499, 'Spectrum Broadband (demo)', 'Broadband disconnection notice. A student household needs access for school.'],
  ] as const) {
    await db.update(bills).set({ statementBalanceCents: nextBalance, remainingBalanceCents: nextBalance, billerName: nextName, story: nextStory, daysUntilDisconnection: 2 })
      .where(and(eq(bills.id, id), eq(bills.status, 'verified'), eq(bills.statementBalanceCents, previousBalance), eq(bills.remainingBalanceCents, previousBalance)));
  }
  await db.insert(sponsorshipPools).values({
    id: '00000000-0000-4000-8000-000000000301',
    sponsorName: 'Community Partner Demo',
    matchRatio: '1.00',
    totalMatchBudgetCents: 50_000,
    remainingMatchBudgetCents: 50_000,
    totalFeeBufferCents: 2_000,
    remainingFeeBufferCents: 2_000,
    targetCategory: 'telecom',
  }).onConflictDoNothing();
  await db.insert(sponsorshipPools).values({
    id: '00000000-0000-4000-8000-000000000302', sponsorName: 'Detroit Community Match (fictional)', matchRatio: '1.00',
    totalMatchBudgetCents: 50_000, remainingMatchBudgetCents: 50_000, totalFeeBufferCents: 2_000,
    remainingFeeBufferCents: 2_000, targetCategory: 'electric', active: false,
  }).onConflictDoNothing();
  await db.update(sponsorshipPools).set({ active: false }).where(eq(sponsorshipPools.id, '00000000-0000-4000-8000-000000000302'));
  for (const card of PITCH_CARDS) {
    await db.insert(pitchDemoCards).values({ id: card.id, currency: card.currency, region: card.region, payload: card })
      .onConflictDoUpdate({ target: pitchDemoCards.id, set: { currency: card.currency, region: card.region, payload: card, seededAt: new Date() } });
  }
  console.log(`Seeded seven US sandbox bills, two fictional sponsor pools, and ${PITCH_CARDS.length} isolated pitch cards (including ${PITCH_CARDS.filter((card) => card.currency === 'EUR').length} EUR interface concepts).`);
} finally {
  await pool.end();
}
