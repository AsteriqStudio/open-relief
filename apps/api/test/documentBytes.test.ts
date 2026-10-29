import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import test from 'node:test';
import { DocumentTooLargeError, MAX_DOCUMENT_BYTES, readDocumentBytes } from '../dist/documentBytes.js';

test('document reader enforces the actual streamed size even when the declared size is small', async () => {
  await assert.rejects(readDocumentBytes(Readable.from([Buffer.alloc(MAX_DOCUMENT_BYTES), Buffer.from([1])]), 1), DocumentTooLargeError);
  await assert.rejects(readDocumentBytes(new Blob([Buffer.alloc(MAX_DOCUMENT_BYTES + 1)])), DocumentTooLargeError);
  assert.deepEqual(await readDocumentBytes(new Blob([Buffer.from('demo')])), Buffer.from('demo'));
});
