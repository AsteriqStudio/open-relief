import { z } from 'zod';

function parseOrigins(value: string, context: z.RefinementCtx): string[] {
  const origins = value.split(',').map((origin) => origin.trim()).filter(Boolean);
  if (origins.length === 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'At least one browser origin is required' });
    return z.NEVER;
  }
  const normalized: string[] = [];
  for (const origin of origins) {
    try {
      const parsed = new URL(origin);
      if (parsed.origin !== origin || !['http:', 'https:'].includes(parsed.protocol)) throw new Error('invalid origin');
      normalized.push(origin);
    } catch {
      context.addIssue({ code: z.ZodIssueCode.custom, message: `Invalid browser origin: ${origin}` });
    }
  }
  return [...new Set(normalized)];
}

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
  API_BIND_HOST: z.enum(['127.0.0.1', '0.0.0.0', '::1']).default('127.0.0.1'),
  RUNTIME_MODE: z.enum(['local', 'private_sandbox']).default('local'),
  CORS_ALLOWED_ORIGINS: z.string().default('http://127.0.0.1:8081').transform(parseOrigins),
}).strip().superRefine((config, context) => {
  if (config.STRIPE_SECRET_KEY && !config.STRIPE_WEBHOOK_SECRET) {
    context.addIssue({ code: 'custom', path: ['STRIPE_WEBHOOK_SECRET'], message: 'Stripe test mode requires a test webhook signing secret' });
  }
  if (config.RUNTIME_MODE === 'local' && config.API_BIND_HOST !== '127.0.0.1') {
    context.addIssue({ code: 'custom', path: ['API_BIND_HOST'], message: 'Only private_sandbox mode may bind outside loopback' });
  }
  if (config.RUNTIME_MODE === 'private_sandbox') {
    if (config.API_BIND_HOST === '127.0.0.1') context.addIssue({ code: 'custom', path: ['API_BIND_HOST'], message: 'Private sandbox mode requires a proxy-reachable bind host' });
    if (config.CORS_ALLOWED_ORIGINS.some((origin) => !origin.startsWith('https://'))) {
      context.addIssue({ code: 'custom', path: ['CORS_ALLOWED_ORIGINS'], message: 'Private sandbox browser origins must use HTTPS' });
    }
  }
});

export type ApiConfig = z.infer<typeof ApiConfigSchema>;
