import { readFile } from 'node:fs/promises';
import { createServer, request as httpRequest } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../apps/mobile/dist/', import.meta.url)));
const mimeTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1:8081');
  if (url.pathname.startsWith('/api/')) {
    const upstream = httpRequest({
      hostname: '127.0.0.1', port: 3000, path: `${url.pathname}${url.search}`, method: request.method,
      headers: { ...request.headers, host: '127.0.0.1:3000' },
    }, (result) => {
      response.writeHead(result.statusCode ?? 502, result.headers);
      result.pipe(response);
    });
    upstream.on('error', () => {
      if (!response.headersSent) response.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Local API is unavailable');
    });
    request.pipe(upstream);
    return;
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405).end();
    return;
  }
  let path: string;
  try { path = decodeURIComponent(url.pathname); }
  catch { response.writeHead(400).end(); return; }
  const file = resolve(root, `.${path === '/' ? '/index.html' : path}`);
  if (!file.startsWith(`${root}${sep}`)) {
    response.writeHead(403).end();
    return;
  }
  try {
    const bytes = await readFile(file);
    response.writeHead(200, { 'content-type': mimeTypes[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    response.end(request.method === 'HEAD' ? undefined : bytes);
  } catch {
    response.writeHead(404).end();
  }
});

server.listen(8081, '127.0.0.1', () => {
  process.stdout.write('Web preview listening on 127.0.0.1:8081; API proxy targets 127.0.0.1:3000\n');
});
