import { boolean, check, date, index, integer, jsonb, numeric, pgEnum, pgTable, real, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { PitchCard } from '@open-relief/shared';

export const userRole = pgEnum('user_role', ['recipient', 'donor', 'admin']);
export const billCategory = pgEnum('bill_category', ['electric', 'water', 'gas', 'medical', 'telecom']);
export const billStatus = pgEnum('bill_status', ['pending_ocr', 'pending_review', 'verified', 'funded', 'settled', 'rejected']);
export const assistanceProgram = pgEnum('assistance_program', ['SNAP', 'MEDICAID', 'LIHEAP', 'NONE']);
export const transactionStatus = pgEnum('transaction_status', ['pending', 'succeeded', 'failed']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  role: userRole('role').notNull(),
  email: text('email').notNull(),
  phone: text('phone').notNull(),
  passwordHash: text('password_hash'),
  legalName: text('legal_name'),
  lifetimeAidCents: integer('lifetime_aid_cents').default(0).notNull(),
  lastAidAt: timestamp('last_aid_at', { withTimezone: true }),
  assistanceProgram: assistanceProgram('assistance_program').default('NONE').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex('users_email_unique').on(table.email), check('users_lifetime_aid_check', sql`${table.lifetimeAidCents} >= 0`) ]);

export const authSessions = pgTable('auth_sessions', {
  tokenHash: text('token_hash').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
}, (table) => [index('auth_sessions_user_idx').on(table.userId)]);

/** Presentation fixtures are never read by donation or settlement routes. */
export const pitchDemoCards = pgTable('pitch_demo_cards', {
  id: uuid('id').primaryKey(),
  currency: text('currency').$type<'USD' | 'EUR'>().notNull(),
  region: text('region').$type<'US' | 'DE'>().notNull(),
  payload: jsonb('payload').$type<PitchCard>().notNull(),
  seededAt: timestamp('seeded_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  check('pitch_demo_cards_currency_check', sql`${table.currency} IN ('USD', 'EUR')`),
  check('pitch_demo_cards_region_check', sql`${table.region} IN ('US', 'DE')`),
]);

export const bills = pgTable('bills', {
  id: uuid('id').primaryKey(),
  recipientId: uuid('recipient_id').notNull().references(() => users.id),
  billerName: text('biller_name'),
  accountHolderName: text('account_holder_name'),
  isShutoffNotice: boolean('is_shutoff_notice').default(false).notNull(),
  daysUntilDisconnection: integer('days_until_disconnection'),
  rejectionReason: text('rejection_reason'),
  termsAcceptedAt: timestamp('terms_accepted_at', { withTimezone: true }),
  termsVersion: text('terms_version'),
  billerMerchantId: text('biller_merchant_id'),
  billerAccountEncrypted: text('biller_account_encrypted'),
  accountHash: text('account_hash'),
  duplicateFingerprint: text('duplicate_fingerprint'),
  dueDate: date('due_date'),
  statementBalanceCents: integer('statement_balance_cents'),
  remainingBalanceCents: integer('remaining_balance_cents'),
  category: billCategory('category').notNull(),
  documentUrl: text('document_url').notNull(),
  documentKey: text('document_key').notNull(),
  documentMimeType: text('document_mime_type').notNull(),
  documentSizeBytes: integer('document_size_bytes').notNull(),
  status: billStatus('status').default('pending_ocr').notNull(),
  fraudScore: real('fraud_score'),
  ocrConfidence: real('ocr_confidence'),
  zipCode: text('zip_code'),
  story: text('story'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  settledAt: timestamp('settled_at', { withTimezone: true }),
}, (table) => [
  index('bills_feed_idx').on(table.status, table.createdAt),
  index('bills_duplicate_idx').on(table.duplicateFingerprint, table.createdAt),
  check('bills_document_size_check', sql`${table.documentSizeBytes} > 0 AND ${table.documentSizeBytes} <= 10485760`),
  check('bills_balance_check', sql`(${table.statementBalanceCents} IS NULL AND ${table.remainingBalanceCents} IS NULL) OR (${table.statementBalanceCents} > 0 AND ${table.remainingBalanceCents} >= 0 AND ${table.remainingBalanceCents} <= ${table.statementBalanceCents})`),
]);

export const transactions = pgTable('transactions', {
  id: uuid('id').primaryKey(),
  billId: uuid('bill_id').notNull().references(() => bills.id),
  donorId: uuid('donor_id').notNull().references(() => users.id),
  amountToBillCents: integer('amount_to_bill_cents').notNull(),
  sponsorMatchCents: integer('sponsor_match_cents').default(0).notNull(),
  processingFeeCoveredCents: integer('processing_fee_covered_cents').notNull(),
  platformTipCents: integer('platform_tip_cents').notNull(),
  totalChargeCents: integer('total_charge_cents').notNull(),
  stripeFeeCents: integer('stripe_fee_cents').notNull(),
  netPlatformTipCents: integer('net_platform_tip_cents').notNull(),
  stripePaymentIntentId: text('stripe_payment_intent_id'),
  stripeChargeId: text('stripe_charge_id'),
  idempotencyKey: text('idempotency_key').notNull(),
  methodDisbursementId: text('method_disbursement_id'),
  receiptEmailPayload: jsonb('receipt_email_payload').$type<{ to: string; subject: string; body: string; taxNotice: string }>(),
  donorTermsAcceptedAt: timestamp('donor_terms_accepted_at', { withTimezone: true }),
  donorTermsVersion: text('donor_terms_version'),
  status: transactionStatus('status').default('pending').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('transactions_payment_intent_unique').on(table.stripePaymentIntentId),
  uniqueIndex('transactions_idempotency_key_unique').on(table.idempotencyKey),
  check('transactions_amount_check', sql`${table.amountToBillCents} > 0 AND ${table.processingFeeCoveredCents} >= 0 AND ${table.platformTipCents} >= 0 AND ${table.totalChargeCents} >= ${table.amountToBillCents}`),
]);

export const sponsorshipPools = pgTable('sponsorship_pools', {
  id: uuid('id').primaryKey(),
  sponsorName: text('sponsor_name').notNull(),
  sponsorLogoUrl: text('sponsor_logo_url'),
  matchRatio: numeric('match_ratio', { precision: 3, scale: 2 }).default('1.00').notNull(),
  totalMatchBudgetCents: integer('total_match_budget_cents').notNull(),
  remainingMatchBudgetCents: integer('remaining_match_budget_cents').notNull(),
  totalFeeBufferCents: integer('total_fee_buffer_cents').default(0).notNull(),
  remainingFeeBufferCents: integer('remaining_fee_buffer_cents').default(0).notNull(),
  targetCategory: billCategory('target_category'),
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('sponsorship_pools_target_idx').on(table.active, table.targetCategory),
  check('sponsorship_pools_balances_check', sql`${table.totalMatchBudgetCents} >= 0 AND ${table.remainingMatchBudgetCents} >= 0 AND ${table.remainingMatchBudgetCents} <= ${table.totalMatchBudgetCents} AND ${table.totalFeeBufferCents} >= 0 AND ${table.remainingFeeBufferCents} >= 0 AND ${table.remainingFeeBufferCents} <= ${table.totalFeeBufferCents} AND ${table.matchRatio} > 0`),
]);

export const sponsorshipAllocations = pgTable('sponsorship_allocations', {
  id: uuid('id').primaryKey(),
  transactionId: uuid('transaction_id').notNull().references(() => transactions.id),
  poolId: uuid('pool_id').notNull().references(() => sponsorshipPools.id),
  matchedAmountCents: integer('matched_amount_cents').notNull(),
  feeBufferAppliedCents: integer('fee_buffer_applied_cents').default(0).notNull(),
  status: text('status').$type<'reserved' | 'settled' | 'released'>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('sponsorship_allocations_transaction_unique').on(table.transactionId),
  index('sponsorship_allocations_pool_idx').on(table.poolId),
  check('sponsorship_allocations_amounts_check', sql`${table.matchedAmountCents} >= 0 AND ${table.feeBufferAppliedCents} >= 0 AND (${table.matchedAmountCents} > 0 OR ${table.feeBufferAppliedCents} > 0)`),
  check('sponsorship_allocations_status_check', sql`${table.status} IN ('reserved', 'settled', 'released')`),
]);

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey(),
  eventType: text('event_type').notNull(),
  actorId: uuid('actor_id').references(() => users.id),
  billId: uuid('bill_id').references(() => bills.id),
  transactionId: uuid('transaction_id').references(() => transactions.id),
  metadata: jsonb('metadata').$type<Record<string, string | number | boolean | null>>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index('audit_logs_bill_idx').on(table.billId, table.createdAt)]);
