import { AnalyzeExpenseCommand, TextractClient } from '@aws-sdk/client-textract';
import { createHash } from 'node:crypto';
import { z } from 'zod';

export const OcrResultSchema = z.object({
  billerName: z.string().min(1),
  accountNumber: z.string().min(1),
  dueDate: z.string().date(),
  statementBalanceCents: z.number().int().positive(),
  confidence: z.number().min(0).max(100),
  merchantId: z.string().min(1).nullable(),
}).strict();

export type OcrResult = z.infer<typeof OcrResultSchema>;

export interface IOCRExtractor {
  extract(bytes: Uint8Array): Promise<OcrResult>;
}

export class MockOCRExtractor implements IOCRExtractor {
  async extract(bytes: Uint8Array): Promise<OcrResult> {
    const hash = createHash('sha256').update(bytes).digest('hex');
    const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    return OcrResultSchema.parse({
      billerName: 'Demo Utility',
      accountNumber: `DEMO-${hash.slice(0, 16)}`,
      dueDate,
      statementBalanceCents: 12_000,
      confidence: 96,
      merchantId: 'mock-demo-utility',
    });
  }
}

function dateFromDocument(value: string): string {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (iso) return value.trim();
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim());
  if (!us) throw new Error('OCR did not return a supported due date');
  const date = `${us[3]}-${us[1]!.padStart(2, '0')}-${us[2]!.padStart(2, '0')}`;
  if (!z.string().date().safeParse(date).success) throw new Error('OCR returned an invalid due date');
  return date;
}

export class AWSTextractExtractor implements IOCRExtractor {
  constructor(private readonly client: TextractClient) {}

  async extract(bytes: Uint8Array): Promise<OcrResult> {
    const response = await this.client.send(new AnalyzeExpenseCommand({ Document: { Bytes: bytes } }));
    const fields = response.ExpenseDocuments?.flatMap((document) => document.SummaryFields ?? []) ?? [];
    const getField = (...names: string[]) => {
      const field = fields.find((entry) => names.includes(entry.Type?.Text ?? ''));
      if (!field?.ValueDetection?.Text) throw new Error(`OCR missing ${names[0]}`);
      return { value: field.ValueDetection.Text, confidence: field.ValueDetection.Confidence ?? 0 };
    };
    const vendor = getField('VENDOR_NAME');
    const account = getField('ACCOUNT_NUMBER', 'INVOICE_RECEIPT_ID');
    const due = getField('DUE_DATE');
    const total = getField('TOTAL', 'AMOUNT_DUE');
    const decimal = Number(total.value.replace(/[^\d.]/g, ''));
    if (!Number.isFinite(decimal) || !/^\d+(?:\.\d{1,2})?$/.test(total.value.replace(/[$,\s]/g, ''))) throw new Error('OCR returned an invalid amount');
    return OcrResultSchema.parse({
      billerName: vendor.value.trim(),
      accountNumber: account.value.trim(),
      dueDate: dateFromDocument(due.value),
      statementBalanceCents: Math.round(decimal * 100),
      confidence: Math.min(vendor.confidence, account.confidence, due.confidence, total.confidence),
      merchantId: null,
    });
  }
}
