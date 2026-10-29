import { Readable } from 'node:stream';

export class DocumentTooLargeError extends Error {
  constructor() { super('Document exceeds the 10 MB size limit'); }
}

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

function isByteStream(value: unknown): value is AsyncIterable<Uint8Array> {
  return typeof value === 'object' && value !== null && Symbol.asyncIterator in value && typeof value[Symbol.asyncIterator] === 'function';
}

function closeNodeStream(body: unknown): void {
  if (body instanceof Readable) {
    body.on('error', () => {});
    body.destroy();
  }
}

/** Read an object stream with a hard cap even when its Content-Length is missing or incorrect. */
export async function readDocumentBytes(body: unknown, declaredSize?: number): Promise<Buffer> {
  if (declaredSize !== undefined && declaredSize > MAX_DOCUMENT_BYTES) {
    closeNodeStream(body);
    throw new DocumentTooLargeError();
  }
  if (body instanceof Blob) {
    if (body.size > MAX_DOCUMENT_BYTES) throw new DocumentTooLargeError();
    return Buffer.from(await body.arrayBuffer());
  }
  if (!isByteStream(body)) throw new TypeError('Document body is not a readable byte stream');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of body) {
    size += chunk.byteLength;
    if (size > MAX_DOCUMENT_BYTES) {
      closeNodeStream(body);
      throw new DocumentTooLargeError();
    }
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks, size);
}
