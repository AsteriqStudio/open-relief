import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { ApiConfigSchema } from './config.js';
import { processUploadedBill } from './ingestion.js';
import { createOCRExtractor } from './ocr.js';
import { reconcileExpiredReservations } from './payments.js';
import { createMethodBillerClient } from './webhooks/stripe.js';
import { BILL_QUEUE_NAME, createServices } from './services.js';

const config = ApiConfigSchema.parse(process.env);
const services = await createServices(config);
const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
const extractor = createOCRExtractor(config.OCR_PROVIDER, config.AWS_REGION ?? config.S3_REGION);
const worker = new Worker(BILL_QUEUE_NAME, async (job) => {
  const billId = job.data.billId;
  if (typeof billId !== 'string') throw new Error('Invalid OCR job');
  await processUploadedBill(billId, services, extractor);
}, { connection: redis, concurrency: 2 });

worker.on('failed', (job, error) => console.error(`OCR job ${job?.id ?? 'unknown'} failed: ${error.message}`));
console.log(`OCR worker running with ${config.OCR_PROVIDER} extractor`);
const expiryTimer = setInterval(() => { void reconcileExpiredReservations(services, services.testPayments, createMethodBillerClient(config)).catch((error: unknown) => console.error('Reservation expiry sweep failed:', error)); }, 60_000);
expiryTimer.unref();

async function shutdown() {
  clearInterval(expiryTimer);
  await worker.close();
  await services.close();
  await redis.quit();
}

process.once('SIGINT', () => { void shutdown(); });
process.once('SIGTERM', () => { void shutdown(); });
