import { AnalyzeDocumentCommand, TextractClient } from '@aws-sdk/client-textract';
import type { AnalyzeDocumentCommandOutput } from '@aws-sdk/client-textract';
import { createHash } from 'node:crypto';
import { z } from 'zod';

export const ParsedBillDataSchema = z.object({
  billerName: z.string().min(1),
  accountNumber: z.string().min(1),
  dueDate: z.string().date(),
  statementBalanceCents: z.number().int().positive().max(2_147_483_647),
  confidence: z.number().min(0).max(100),
  merchantId: z.string().min(1).nullable(),
}).strict();

export type ParsedBillData = z.infer<typeof ParsedBillDataSchema>;

export interface IOCRExtractor {
  extract(bytes: Uint8Array): Promise<ParsedBillData>;
}

export class MockOCRExtractor implements IOCRExtractor {
  async extract(bytes: Uint8Array): Promise<ParsedBillData> {
    const hash = createHash('sha256').update(bytes).digest('hex');
    const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    return ParsedBillDataSchema.parse({
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

const TEXTRACT_QUERIES = [
  { Text: 'What is the account number?', Alias: 'ACCOUNT_NUMBER' },
  { Text: 'What is the total amount due?', Alias: 'TOTAL_AMOUNT_DUE' },
  { Text: 'What is the due date?', Alias: 'DUE_DATE' },
  { Text: 'What is the utility or biller name?', Alias: 'BILLER_NAME' },
] as const;

export function parseTextractDocument(response: AnalyzeDocumentCommandOutput): ParsedBillData {
  const blocks = response.Blocks ?? [];
  const byId = new Map(blocks.filter((block) => block.Id).map((block) => [block.Id!, block]));
  const answers = new Map<string, { value: string; confidence: number }>();
  for (const block of blocks) {
    if (block.BlockType !== 'QUERY' || !block.Query?.Alias) continue;
    const ids = block.Relationships?.filter((relation) => relation.Type === 'ANSWER').flatMap((relation) => relation.Ids ?? []) ?? [];
    const result = ids.map((id) => byId.get(id)).find((answer) => answer?.BlockType === 'QUERY_RESULT' && answer.Text?.trim());
    if (result?.Text) answers.set(block.Query.Alias, { value: result.Text.trim(), confidence: Math.max(0, Math.min(100, result.Confidence ?? 0)) });
  }
  const get = (alias: string) => {
    const answer = answers.get(alias);
    if (!answer) throw new Error(`Textract did not answer ${alias}`);
    return answer;
  };
  const account = get('ACCOUNT_NUMBER');
  const total = get('TOTAL_AMOUNT_DUE');
  const due = get('DUE_DATE');
  const biller = get('BILLER_NAME');
  const rawAmount = total.value.replace(/[$,\s]/g, '');
  if (!/^\d+(?:\.\d{1,2})?$/.test(rawAmount)) throw new Error('Textract returned an invalid amount');
  const cents = Math.round(Number(rawAmount) * 100);
  return ParsedBillDataSchema.parse({
    accountNumber: account.value,
    statementBalanceCents: cents,
    dueDate: dateFromDocument(due.value),
    billerName: biller.value,
    confidence: Math.min(account.confidence, total.confidence, due.confidence, biller.confidence),
    merchantId: null,
  });
}

export class AWSTextractExtractor implements IOCRExtractor {
  constructor(private readonly client: TextractClient) {}

  async extract(bytes: Uint8Array): Promise<ParsedBillData> {
    const response = await this.client.send(new AnalyzeDocumentCommand({
      Document: { Bytes: bytes },
      FeatureTypes: ['QUERIES', 'TABLES'],
      QueriesConfig: { Queries: [...TEXTRACT_QUERIES] },
    }));
    return parseTextractDocument(response);
  }
}

export function createOCRExtractor(provider: 'mock' | 'textract', region: string): IOCRExtractor {
  return provider === 'textract' ? new AWSTextractExtractor(new TextractClient({ region })) : new MockOCRExtractor();
}
