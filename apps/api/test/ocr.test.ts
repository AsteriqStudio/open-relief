import assert from 'node:assert/strict';
import test from 'node:test';
import { AnalyzeDocumentCommand } from '@aws-sdk/client-textract';
import type { AnalyzeDocumentCommandOutput, TextractClient } from '@aws-sdk/client-textract';
import { AWSTextractExtractor, createOCRExtractor, MockOCRExtractor, parseTextractDocument } from '../dist/ocr.js';

const answer = (alias: string, text: string, confidence: number) => [
  { Id: `query-${alias}`, BlockType: 'QUERY' as const, Query: { Text: alias, Alias: alias }, Relationships: [{ Type: 'ANSWER' as const, Ids: [`result-${alias}`] }] },
  { Id: `result-${alias}`, BlockType: 'QUERY_RESULT' as const, Text: text, Confidence: confidence },
];

const response: AnalyzeDocumentCommandOutput = {
  $metadata: {},
  Blocks: [
    ...answer('ACCOUNT_NUMBER', 'ACCT-1001', 98),
    ...answer('TOTAL_AMOUNT_DUE', '$123.45', 94),
    ...answer('DUE_DATE', '11/30/2026', 90),
    ...answer('BILLER_NAME', 'Demo Electric', 88),
    ...answer('ACCOUNT_HOLDER_NAME', 'Demo Recipient', 91),
    { Id: 'line-notice', BlockType: 'LINE', Text: 'FINAL NOTICE: past due' },
  ],
};

test('Textract query answers normalize to parsed bill data', () => {
  assert.deepEqual(parseTextractDocument(response), {
    billerName: 'Demo Electric', accountNumber: 'ACCT-1001', dueDate: '2026-11-30',
    statementBalanceCents: 12_345, confidence: 88, merchantId: null, accountHolderName: 'Demo Recipient', noticeText: 'FINAL NOTICE: past due',
  });
  assert.throws(() => parseTextractDocument({ $metadata: {}, Blocks: response.Blocks?.slice(2) }), /ACCOUNT_NUMBER/);
});

test('adapter factory defaults to mock and Textract calls AnalyzeDocument with five queries', async () => {
  assert.ok(createOCRExtractor('mock', 'us-east-1') instanceof MockOCRExtractor);
  assert.ok(createOCRExtractor('textract', 'us-east-1') instanceof AWSTextractExtractor);
  let called = false;
  const client = { send: async (command: AnalyzeDocumentCommand) => {
    called = true;
    assert.ok(command instanceof AnalyzeDocumentCommand);
    assert.deepEqual(command.input.FeatureTypes, ['QUERIES', 'TABLES']);
    assert.deepEqual(command.input.QueriesConfig?.Queries?.map((query) => query.Text), [
      'What is the account number?', 'What is the total amount due?', 'What is the due date?', 'What is the utility or biller name?', 'What is the account holder name?',
    ]);
    return response;
  } } as unknown as TextractClient;
  const parsed = await new AWSTextractExtractor(client).extract(new Uint8Array([1, 2, 3]));
  assert.ok(called);
  assert.equal(parsed.statementBalanceCents, 12_345);
});
