import { z } from 'zod';

export const ApiConfigSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  S3_ENDPOINT: z.string().url(),
  S3_BUCKET: z.string().min(1),
  S3_REGION: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  ENCRYPTION_KEY_HEX: z.string().regex(/^[0-9a-fA-F]{64}$/),
  AUTH_JWT_SECRET: z.string().regex(/^[0-9a-fA-F]{64}$/),
  MOCK_STRIPE_WEBHOOK_SECRET: z.string().min(16),
  STRIPE_SECRET_KEY: z.string().regex(/^sk_test_[A-Za-z0-9_]+$/).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().regex(/^whsec_[A-Za-z0-9_]+$/).optional(),
  METHOD_PROVIDER: z.enum(['mock', 'sandbox']).default('mock'),
  OCR_PROVIDER: z.enum(['mock', 'textract']).default('mock'),
  AWS_REGION: z.string().min(1).optional(),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
}).strip().superRefine((config, context) => {
  if (config.STRIPE_SECRET_KEY && !config.STRIPE_WEBHOOK_SECRET) {
    context.addIssue({ code: 'custom', path: ['STRIPE_WEBHOOK_SECRET'], message: 'Stripe test mode requires a test webhook signing secret' });
  }
});

export type ApiConfig = z.infer<typeof ApiConfigSchema>;
