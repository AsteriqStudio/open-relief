import { z } from 'zod';
import { randomUUID } from 'expo-crypto';

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://127.0.0.1:3000';
const BillSchema = z.object({
  id: z.string().uuid(),
  billerName: z.string().nullable(),
  category: z.enum(['electric', 'water', 'gas', 'medical']),
  zipCode: z.string().nullable(),
  story: z.string().nullable(),
  statementBalanceCents: z.number().int().nullable(),
  remainingBalanceCents: z.number().int().nullable(),
  status: z.enum(['verified', 'funded']),
});

export type FeedBill = z.infer<typeof BillSchema>;

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(`${API_BASE}${path}`, init);
  const body: unknown = await response.json();
  if (!response.ok) {
    const message = z.object({ error: z.string() }).safeParse(body);
    throw new Error(message.success ? message.data.error : `Request failed (${response.status})`);
  }
  return body;
}

export async function getFeed(): Promise<FeedBill[]> {
  return z.object({ bills: z.array(BillSchema) }).parse(await request('/api/bills/feed')).bills;
}

export async function uploadBill(input: {
  recipientId: string;
  category: FeedBill['category'];
  zipCode: string;
  story: string;
  uri: string;
  mimeType: 'image/jpeg' | 'image/png' | 'application/pdf';
  name: string;
}): Promise<string> {
  const file = await (await fetch(input.uri)).blob();
  const details = z.object({
    billId: z.string().uuid(),
    url: z.string().url(),
    fields: z.record(z.string()),
  }).parse(await request('/api/bills/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipientId: input.recipientId, category: input.category, zipCode: input.zipCode, story: input.story, mimeType: input.mimeType, sizeBytes: file.size }),
  }));
  const form = new FormData();
  for (const [key, value] of Object.entries(details.fields)) form.append(key, value);
  form.append('file', file, input.name);
  const upload = await fetch(details.url, { method: 'POST', body: form });
  if (!upload.ok) throw new Error(`Document upload failed (${upload.status})`);
  await request(`/api/bills/${details.billId}/complete`, { method: 'POST' });
  return details.billId;
}

export async function getBillStatus(id: string): Promise<'pending_ocr' | 'verified' | 'funded' | 'settled' | 'rejected'> {
  return z.object({ status: z.enum(['pending_ocr', 'verified', 'funded', 'settled', 'rejected']) }).parse(await request(`/api/bills/${id}`)).status;
}

export async function simulateDonation(input: {
  billId: string;
  donorId: string;
  billAmountCents: number;
  coverProcessingFee: boolean;
  tipPercentage: number;
}): Promise<string> {
  const result = z.object({ transactionId: z.string().uuid(), mode: z.literal('mock') }).parse(await request('/api/donations/create-intent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...input, idempotencyKey: randomUUID() }),
  }));
  await request(`/api/demo/donations/${result.transactionId}/complete`, { method: 'POST' });
  return result.transactionId;
}
