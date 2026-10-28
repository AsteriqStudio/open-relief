import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';

const PdfInputSchema = z.instanceof(Uint8Array).refine((bytes) => bytes.length > 5 && bytes.length <= 10 * 1024 * 1024 && Buffer.from(bytes.subarray(0, 5)).toString('ascii') === '%PDF-', 'Invalid PDF document');
const MAX_PREVIEW_BYTES = 5 * 1024 * 1024;

/** Render only page one at a bounded size. The PDF is passed on stdin, never as a shell argument. */
export function renderPdfFirstPage(input: Uint8Array): Promise<Buffer> {
  const bytes = PdfInputSchema.parse(input);
  return new Promise((resolve, reject) => {
    const renderDir = mkdtempSync(join(tmpdir(), 'open-relief-pdf-'));
    const child = spawn('pdftoppm', ['-f', '1', '-l', '1', '-singlefile', '-png', '-scale-to', '1000', '-'], {
      stdio: ['pipe', 'pipe', 'ignore'], timeout: 10_000, killSignal: 'SIGKILL', cwd: renderDir,
      env: { ...process.env, XDG_CACHE_HOME: renderDir },
    });
    const chunks: Buffer[] = [];
    let size = 0;
    let done = false;
    const fail = (error: Error) => {
      if (done) return;
      done = true;
      child.kill('SIGKILL');
      reject(error);
    };
    child.stdout.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_PREVIEW_BYTES) fail(new Error('PDF preview exceeds the size limit'));
      else chunks.push(chunk);
    });
    child.stdin.on('error', fail);
    child.on('error', fail);
    child.on('close', (code) => {
      rmSync(renderDir, { recursive: true, force: true });
      if (done) return;
      done = true;
      const output = Buffer.concat(chunks);
      if (code !== 0 || output.length < 8 || !output.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
        reject(new Error('PDF preview could not be rendered'));
      } else resolve(output);
    });
    child.stdin.end(bytes);
  });
}
