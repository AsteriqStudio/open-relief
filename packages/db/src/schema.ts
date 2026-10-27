import { check, date, index, integer, jsonb, pgEnum, pgTable, real, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const userRole = pgEnum('user_role', ['recipient', 'donor', 'admin']);
export const billCategory = pgEnum('bill_category', ['electric', 'water', 'gas', 'medical']);
export const billStatus = pgEnum('bill_status', ['pending_ocr', 'verified', 'funded', 'settled', 'rejected']);
export const transactionStatus = pgEnum('transaction_status', ['pending', 'succeeded', 'failed']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  role: userRole('role').notNull(),
  email: text('email').notNull(),
  phone: text('phone').notNull(),
  passwordHash: text('password_hash'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex('users_email_unique').on(table.email)]);

export const authSessions = pgTable('auth_sessions', {
  tokenHash: text('token_hash').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
}, (table) => [index('auth_sessions_user_idx').on(table.userId)]);

export const bills = pgTable('bills', {
  id: uuid('id').primaryKey(),
  recipientId: uuid('recipient_id').notNull().references(() => users.id),
  billerName: text('biller_name'),
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
  processingFeeCoveredCents: integer('processing_fee_covered_cents').notNull(),
  platformTipCents: integer('platform_tip_cents').notNull(),
  totalChargeCents: integer('total_charge_cents').notNull(),
  stripeFeeCents: integer('stripe_fee_cents').notNull(),
  netPlatformTipCents: integer('net_platform_tip_cents').notNull(),
  stripePaymentIntentId: text('stripe_payment_intent_id'),
  idempotencyKey: text('idempotency_key').notNull(),
  methodDisbursementId: text('method_disbursement_id'),
  status: transactionStatus('status').default('pending').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('transactions_payment_intent_unique').on(table.stripePaymentIntentId),
  uniqueIndex('transactions_idempotency_key_unique').on(table.idempotencyKey),
  check('transactions_amount_check', sql`${table.amountToBillCents} > 0 AND ${table.processingFeeCoveredCents} >= 0 AND ${table.platformTipCents} >= 0 AND ${table.totalChargeCents} >= ${table.amountToBillCents}`),
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
