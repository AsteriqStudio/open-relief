import { randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const path = resolve(import.meta.dirname, '../.env.local');
const randomHex = (bytes: number): string => randomBytes(bytes).toString('hex');
if (existsSync(path)) {
  const existing = readFileSync(path, 'utf8');
  if (!/^AUTH_JWT_SECRET=/m.test(existing)) {
    appendFileSync(path, `${existing.endsWith('\n') ? '' : '\n'}AUTH_JWT_SECRET=${randomHex(32)}\n`);
    console.log('Added a local session signing key to .env.local');
  } else {
    console.log('Keeping existing .env.local');
  }
  process.exit(0);
}

const password = randomHex(24);
const accessKey = `dev${randomHex(8)}`;
const secretKey = randomHex(24);
const lines: string[] = [
  `POSTGRES_PASSWORD=${password}`,
  `DATABASE_URL=postgresql://open_relief:${password}@127.0.0.1:5432/open_relief`,
  `ENCRYPTION_KEY_HEX=${randomHex(32)}`,
  `AUTH_JWT_SECRET=${randomHex(32)}`,
  'REDIS_URL=redis://127.0.0.1:6379',
  'S3_ENDPOINT=http://127.0.0.1:9000',
  'S3_BUCKET=open-relief',
  'S3_REGION=us-east-1',
  `S3_ACCESS_KEY=${accessKey}`,
  `S3_SECRET_KEY=${secretKey}`,
  `MOCK_STRIPE_WEBHOOK_SECRET=${randomHex(32)}`,
];
writeFileSync(path, `${lines.join('\n')}\n`, { flag: 'wx', mode: 0o600 });
console.log('Created local demo configuration in .env.local');
