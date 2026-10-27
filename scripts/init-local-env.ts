import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const path = resolve(import.meta.dirname, '../.env.local');
if (existsSync(path)) {
  console.log('Keeping existing .env.local');
  process.exit(0);
}

const randomHex = (bytes: number): string => randomBytes(bytes).toString('hex');
const password = randomHex(24);
const accessKey = `dev${randomHex(8)}`;
const secretKey = randomHex(24);
const lines: string[] = [
  `POSTGRES_PASSWORD=${password}`,
  `DATABASE_URL=postgresql://open_relief:${password}@127.0.0.1:5432/open_relief`,
  `ENCRYPTION_KEY_HEX=${randomHex(32)}`,
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
