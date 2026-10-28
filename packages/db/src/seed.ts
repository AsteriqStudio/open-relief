import { createHash } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { createDatabase, bills, users } from './index.js';
import { encryptAccountNumber } from './security/encryption.js';

const recipientId = '00000000-0000-4000-8000-000000000101';
const donorId = '00000000-0000-4000-8000-000000000102';

const samples = [
  { id: '00000000-0000-4000-8000-000000000201', billerName: 'Detroit Edison Demo', merchantId: 'mock-electric-detroit', category: 'electric', zipCode: '48201', story: 'Detroit household facing an overdue electric bill', account: 'DEMO-E-101', balance: 12_500 },
  { id: '00000000-0000-4000-8000-000000000202', billerName: 'Flint Water Demo', merchantId: 'mock-water-flint', category: 'water', zipCode: '48502', story: 'Flint household needs help keeping water service', account: 'DEMO-W-102', balance: 8_400 },
  { id: '00000000-0000-4000-8000-000000000203', billerName: 'Chicago Gas Demo', merchantId: 'mock-gas-chicago', category: 'gas', zipCode: '60607', story: 'Chicago household with an overdue heating bill', account: 'DEMO-G-103', balance: 15_700 },
  { id: '00000000-0000-4000-8000-000000000204', billerName: 'Phoenix Electric Demo', merchantId: 'mock-electric-phoenix', category: 'electric', zipCode: '85004', story: 'Phoenix household needs help with electric service', account: 'DEMO-E-104', balance: 9_950 },
  { id: '00000000-0000-4000-8000-000000000205', billerName: 'Austin Water Demo', merchantId: 'mock-water-austin', category: 'water', zipCode: '78701', story: 'Austin household with an overdue water bill', account: 'DEMO-W-105', balance: 6_275 },
  { id: '00000000-0000-4000-8000-000000000206', billerName: 'Community Hospital Demo', merchantId: 'mock-medical-hospital', category: 'medical', zipCode: '30303', story: 'Atlanta household with an overdue medical bill', account: 'DEMO-M-106', balance: 3_500 },
  { id: '00000000-0000-4000-8000-000000000207', billerName: 'Community Telecom Demo', merchantId: 'mock-telecom-provider', category: 'telecom', zipCode: '98101', story: 'Seattle household with an overdue phone bill', account: 'DEMO-T-107', balance: 3_000 },
] as const;

const { db, pool } = createDatabase();
try {
  await db.insert(users).values([
    { id: recipientId, role: 'recipient', email: 'recipient@example.invalid', phone: '+15555550101', legalName: 'Demo Recipient' },
    { id: donorId, role: 'donor', email: 'donor@example.invalid', phone: '+15555550102' },
  ]).onConflictDoNothing();
  await db.update(users).set({ legalName: 'Demo Recipient' }).where(and(eq(users.id, recipientId), isNull(users.legalName)));

  for (const sample of samples) {
    const accountHash = createHash('sha256').update(sample.account).digest('hex');
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
      duplicateFingerprint: createHash('sha256').update(`${sample.billerName.toLowerCase()}|${accountHash}|2026-12-15`).digest('hex'),
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
  console.log('Seeded seven demo bills and two demo users');
} finally {
  await pool.end();
}
