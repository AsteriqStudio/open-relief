import { CreateBucketCommand, HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { createDatabase } from '@open-relief/db';
import type { ApiConfig } from './config.js';
import type { ITestPaymentReconciler } from './payments.js';
import { createStripeTestReconciler } from './stripeTest.js';

export const BILL_QUEUE_NAME = 'bill-ocr';
export type Database = ReturnType<typeof createDatabase>['db'];

export interface Services {
  db: Database;
  s3: S3Client;
  queue: Queue;
  config: ApiConfig;
  testPayments?: ITestPaymentReconciler;
  close(): Promise<void>;
}

export async function createServices(config: ApiConfig): Promise<Services> {
  const { db, pool } = createDatabase(config.DATABASE_URL);
  const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
  const s3 = new S3Client({
    region: config.S3_REGION,
    endpoint: config.S3_ENDPOINT,
    forcePathStyle: true,
    credentials: { accessKeyId: config.S3_ACCESS_KEY, secretAccessKey: config.S3_SECRET_KEY },
  });
  const queue = new Queue(BILL_QUEUE_NAME, { connection: redis });
  try {
    await Promise.all([pool.query('SELECT 1'), redis.ping()]);
    try {
      await s3.send(new HeadBucketCommand({ Bucket: config.S3_BUCKET }));
    } catch (error) {
      if (typeof error !== 'object' || error === null || !('$metadata' in error) || (error.$metadata as { httpStatusCode?: number }).httpStatusCode !== 404) throw error;
      await s3.send(new CreateBucketCommand({ Bucket: config.S3_BUCKET }));
    }
    return {
      db, s3, queue, config,
      ...(config.STRIPE_SECRET_KEY ? { testPayments: createStripeTestReconciler(config.STRIPE_SECRET_KEY) } : {}),
      async close() {
        await Promise.all([queue.close(), redis.quit(), pool.end()]);
        s3.destroy();
      },
    };
  } catch (error) {
    await Promise.allSettled([queue.close(), redis.quit(), pool.end()]);
    s3.destroy();
    throw error;
  }
}
