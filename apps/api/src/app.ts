import Fastify from 'fastify';
import { HeadBucketCommand } from '@aws-sdk/client-s3';
import { sql } from 'drizzle-orm';
import { ZodError } from 'zod';
import { registerAuth } from './auth.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerBillRoutes } from './routes/bills.js';
import { registerDonationRoutes } from './routes/donations.js';
import type { Services } from './services.js';
import { handleVerifiedStripeEvent, verifyStripeWebhook } from './webhooks/stripe.js';

declare module 'fastify' {
  interface FastifyRequest { rawBody?: Buffer }
}

export function buildApp(services: Services) {
  const app = Fastify({ logger: false, bodyLimit: 1024 * 1024 });
  const requireAuth = registerAuth(app, services.db, services.config.AUTH_JWT_SECRET, services.authAttempts);
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (request, body, done) => {
    try {
      const raw = Buffer.isBuffer(body) ? body : Buffer.from(body);
      if (request.url === '/api/webhooks/stripe') request.rawBody = raw;
      done(null, JSON.parse(raw.toString('utf8')));
    } catch {
      done(Object.assign(new Error('Invalid JSON'), { statusCode: 400 }), undefined);
    }
  });
  app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer' }, (_request, body, done) => {
    done(null, body);
  });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      reply.code(400).send({ error: 'Invalid request', details: error.flatten() });
      return;
    }
    if (typeof error === 'object' && error !== null && 'statusCode' in error && typeof error.statusCode === 'number' && error.statusCode < 500) {
      reply.code(error.statusCode).send({ error: 'message' in error && typeof error.message === 'string' ? error.message : 'Invalid request' });
      return;
    }
    reply.code(500).send({ error: 'Internal server error' });
  });

  app.get('/health', async () => ({ status: 'ok' }));
  app.get('/ready', async (_request, reply) => {
    try {
      await Promise.all([
        services.db.execute(sql`SELECT 1`),
        (async () => (await services.queue.client).get('open-relief:readiness'))(),
        services.s3.send(new HeadBucketCommand({ Bucket: services.config.S3_BUCKET })),
      ]);
      if ((await services.queue.getWorkers()).length === 0) throw new Error('OCR worker unavailable');
      return { status: 'ready' };
    } catch {
      return reply.code(503).send({ status: 'unavailable' });
    }
  });
  app.get('/api/capabilities', async () => ({
    service: 'open-relief',
    mode: 'sandbox',
    billCountry: 'US',
    documentUpload: 'api_proxy',
    payments: services.config.STRIPE_SECRET_KEY ? 'stripe_test' : 'mock',
    creditorRail: services.config.METHOD_PROVIDER,
  }));
  registerBillRoutes(app, services, requireAuth);
  registerDonationRoutes(app, services, requireAuth);
  registerAdminRoutes(app, services, requireAuth);

  app.post('/api/webhooks/stripe', async (request, reply) => {
    const signature = request.headers['stripe-signature'];
    if (typeof signature !== 'string' || !request.rawBody) return reply.code(400).send({ error: 'Missing webhook signature' });
    let event;
    try { event = verifyStripeWebhook(request.rawBody, signature, services.config); }
    catch { return reply.code(400).send({ error: 'Invalid webhook signature or event' }); }
    return handleVerifiedStripeEvent(event, services);
  });

  return app;
}
