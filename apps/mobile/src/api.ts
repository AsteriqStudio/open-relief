import { z } from 'zod';
import { randomUUID } from 'expo-crypto';
import { Platform } from 'react-native';
import { LEGAL_TERMS_VERSION } from '@open-relief/shared';

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? (Platform.OS === 'web' ? window.location.origin : 'http://127.0.0.1:3000');
const BillSchema = z.object({
  id: z.string().uuid(),
  countryCode: z.string().regex(/^[A-Z]{2}$/),
  billerName: z.string().nullable(),
  category: z.enum(['electric', 'water', 'gas', 'medical', 'telecom']),
  zipCode: z.string().nullable(),
  story: z.string().nullable(),
  statementBalanceCents: z.number().int().nullable(),
  remainingBalanceCents: z.number().int().nullable(),
  status: z.enum(['verified', 'funded']),
  isShutoffNotice: z.boolean(),
  daysUntilDisconnection: z.number().int().nullable(),
  accountLast4: z.string().nullable(),
  sponsor: z.object({ id: z.string().uuid(), name: z.string(), matchRatio: z.number().positive(), remainingMatchBudgetCents: z.number().int().nonnegative(), remainingFeeBufferCents: z.number().int().nonnegative() }).nullable(),
  currency: z.enum(['USD', 'EUR']).optional(),
  locationLabel: z.string().optional(),
  urgencyLabel: z.string().optional(),
  railLabel: z.string().optional(),
});

export type FeedBill = z.infer<typeof BillSchema>;
const AuthUserSchema = z.object({ id: z.string().uuid(), role: z.enum(['recipient', 'donor', 'admin']), email: z.string().email() });
const FeeBreakdownSchema = z.object({
  totalChargeCents: z.number().int(), netPaymentToBillerCents: z.number().int(), stripeFeeCents: z.number().int(),
  processingFeeCoveredCents: z.number().int(), platformTipCents: z.number().int(), netPlatformTipCents: z.number().int(),
  donorChargeCents: z.number().int(), sponsorMatchCents: z.number().int(), totalDisbursementToCreditorCents: z.number().int(),
  feeCoverageSource: z.enum(['donor', 'sponsor_buffer', 'none']), feeBufferAppliedCents: z.number().int(), requiresDonorFeeCoverage: z.boolean(),
});
const DonationIntentSchema = z.object({
  transactionId: z.string().uuid(), paymentIntentId: z.string().min(1), clientSecret: z.string().min(1),
  feeBreakdown: FeeBreakdownSchema, mode: z.enum(['mock', 'test']), sponsorName: z.string().nullable(), allocationId: z.string().uuid().nullable(),
});
export type DonationIntent = z.infer<typeof DonationIntentSchema>;
const SessionSchema = z.object({ token: z.string().min(1), expiresAt: z.string().datetime(), user: AuthUserSchema });
export type AuthUser = z.infer<typeof AuthUserSchema>;
export type AuthSession = z.infer<typeof SessionSchema>;

async function request(path: string, init?: RequestInit, token?: string): Promise<unknown> {
  const headers = new Headers(init?.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  const body: unknown = await response.json();
  if (!response.ok) {
    const message = z.object({ error: z.string() }).safeParse(body);
    throw new Error(message.success ? message.data.error : `Request failed (${response.status})`);
  }
  return body;
}

export async function signUp(input: { email: string; password: string; phone: string; role: 'recipient' | 'donor'; legalName?: string; assistanceProgram?: 'SNAP' | 'MEDICAID' | 'LIHEAP' | 'NONE' }): Promise<AuthSession> {
  return SessionSchema.parse(await request('/api/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }));
}

export async function signIn(input: { email: string; password: string }): Promise<AuthSession> {
  return SessionSchema.parse(await request('/api/auth/signin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }));
}

export async function currentUser(token: string): Promise<AuthUser> {
  return z.object({ user: AuthUserSchema }).parse(await request('/api/auth/me', undefined, token)).user;
}

export async function signOut(token: string): Promise<void> {
  await request('/api/auth/logout', { method: 'POST' }, token);
}

export async function getFeed(category?: FeedBill['category']): Promise<FeedBill[]> {
  return z.object({ bills: z.array(BillSchema) }).parse(await request(`/api/bills/feed${category ? `?category=${category}` : ''}`)).bills;
}

const DonorImpactSchema = z.object({ creditorAidCents: z.number().int().nonnegative(), settledBills: z.number().int().nonnegative(), sponsorMatches: z.number().int().nonnegative() });
export type DonorImpact = z.infer<typeof DonorImpactSchema>;
export async function getDonorImpact(token: string): Promise<DonorImpact> {
  return DonorImpactSchema.parse(await request('/api/donations/impact', undefined, token));
}

export async function uploadBill(input: {
  category: FeedBill['category'];
  zipCode: string;
  story: string;
  uri: string;
  mimeType: 'image/jpeg' | 'image/png' | 'application/pdf';
  name: string;
  declaredBillerName: string;
  attestationAccepted: true;
}, token: string): Promise<string> {
  const file = await (await fetch(input.uri)).blob();
  const details = z.object({
    billId: z.string().uuid(),
    url: z.string().url(),
    fields: z.record(z.string()),
  }).parse(await request('/api/bills/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ countryCode: 'US', category: input.category, zipCode: input.zipCode, story: input.story, mimeType: input.mimeType, sizeBytes: file.size, declaredBillerName: input.declaredBillerName, attestation: { accepted: input.attestationAccepted, termsVersion: LEGAL_TERMS_VERSION } }),
  }, token));
  const form = new FormData();
  for (const [key, value] of Object.entries(details.fields)) form.append(key, value);
  form.append('file', file, input.name);
  const upload = await fetch(details.url, { method: 'POST', body: form });
  if (!upload.ok) throw new Error(`Document upload failed (${upload.status})`);
  await request(`/api/bills/${details.billId}/complete`, { method: 'POST' }, token);
  return details.billId;
}

const BillDetailsSchema = z.object({ status: z.enum(['pending_ocr', 'pending_review', 'verified', 'funded', 'settled', 'rejected']), rejectionReason: z.string().nullable() });
export async function getBillDetails(id: string, token: string): Promise<z.infer<typeof BillDetailsSchema>> {
  return BillDetailsSchema.parse(await request(`/api/bills/${id}`, undefined, token));
}

export async function getBillStatus(id: string, token: string): Promise<z.infer<typeof BillDetailsSchema>['status']> {
  return (await getBillDetails(id, token)).status;
}

export async function createDonationIntent(input: {
  billId: string;
  amountCents: number;
  coverProcessingFee: boolean;
  tipPercentage: number;
  sponsorPoolId?: string;
  expectedSponsorMatchCents?: number;
  donorTermsAccepted: true;
}, token: string): Promise<DonationIntent> {
  return DonationIntentSchema.parse(await request('/api/donations/create-intent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...input, donorTermsAccepted: undefined, donorAcceptance: { accepted: input.donorTermsAccepted, termsVersion: LEGAL_TERMS_VERSION }, idempotencyKey: randomUUID() }),
  }, token));
}

export async function completeMockDonation(transactionId: string, token: string): Promise<void> {
  await request(`/api/demo/donations/${transactionId}/complete`, { method: 'POST' }, token);
}

const DonationReceiptSchema = z.object({
  id: z.string().uuid(),
  billerName: z.string().nullable(),
  remainingBalanceCents: z.number().int().nonnegative().nullable(),
  accountLast4: z.string().nullable(),
  amountToBillCents: z.number().int(),
  donorPrincipalCents: z.number().int(),
  sponsorMatchCents: z.number().int(),
  sponsorName: z.string().nullable(),
  feeBufferAppliedCents: z.number().int(),
  totalChargeCents: z.number().int(),
  methodDisbursementId: z.string().nullable(),
  taxNotice: z.string(),
  createdAt: z.string().datetime(),
});
export type DonationReceipt = z.infer<typeof DonationReceiptSchema>;

export async function getDonationReceipt(transactionId: string, token: string): Promise<DonationReceipt> {
  return DonationReceiptSchema.parse(await request(`/api/donations/${transactionId}/receipt`, undefined, token));
}

const AdminReviewSchema = z.object({
  billId: z.string().uuid(), recipientEmail: z.string().email(), recipientLegalName: z.string().nullable(),
  billerName: z.string().nullable(), accountHolderName: z.string().nullable(), statementBalanceCents: z.number().int().nullable(),
  daysUntilDisconnection: z.number().int().nullable(), rejectionReason: z.string().nullable(), ocrConfidence: z.number().nullable(),
  documentMimeType: z.string(), createdAt: z.string().datetime(), nameMatchPercentage: z.number().int().nullable(),
});
export type AdminReview = z.infer<typeof AdminReviewSchema>;

export async function getPendingReviews(page: number, token: string): Promise<{ reviews: AdminReview[]; total: number; page: number; limit: number }> {
  return z.object({ reviews: z.array(AdminReviewSchema), total: z.number().int(), page: z.number().int(), limit: z.number().int() })
    .parse(await request(`/api/admin/reviews/pending?page=${page}&limit=20`, undefined, token));
}

export async function decideReview(billId: string, decision: 'approve' | 'reject', notes: string, token: string): Promise<void> {
  await request(`/api/admin/reviews/${billId}/decision`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision, notes }) }, token);
}

export function adminDocumentSource(billId: string, token: string): { uri: string; headers: Record<string, string> } {
  return { uri: `${API_BASE}/api/admin/reviews/${billId}/document`, headers: { Authorization: `Bearer ${token}` } };
}

export function adminPreviewSource(billId: string, token: string): { uri: string; headers: Record<string, string> } {
  return { uri: `${API_BASE}/api/admin/reviews/${billId}/preview`, headers: { Authorization: `Bearer ${token}` } };
}
