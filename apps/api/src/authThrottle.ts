import { createHmac } from 'node:crypto';
import type { Redis } from 'ioredis';
import { z } from 'zod';

const WINDOW_SECONDS = 15 * 60;
const MAX_PAIR_ATTEMPTS = 12;
const MAX_IP_ATTEMPTS = 120;
const MAX_SIGNUP_IP_ATTEMPTS = 100;

const ATTEMPT_SCRIPT = `
local pair = redis.call('INCR', KEYS[1])
if pair == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
local ip = redis.call('INCR', KEYS[2])
if ip == 1 then redis.call('EXPIRE', KEYS[2], ARGV[1]) end
return {pair, ip, redis.call('TTL', KEYS[1]), redis.call('TTL', KEYS[2])}
`;
const SIGNUP_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return {count, redis.call('TTL', KEYS[1])}
`;

const AttemptResultSchema = z.tuple([z.coerce.number().int(), z.coerce.number().int(), z.coerce.number().int(), z.coerce.number().int()]);
const SignupResultSchema = z.tuple([z.coerce.number().int(), z.coerce.number().int()]);

export interface AuthAttemptLimiter {
  takeSignInAttempt(ip: string, email: string): Promise<{ allowed: boolean; retryAfterSeconds: number }>;
  takeSignupAttempt(ip: string): Promise<{ allowed: boolean; retryAfterSeconds: number }>;
}

/** Redis keeps the limit shared across API instances; key material never contains an email or IP. */
export class RedisAuthAttemptLimiter implements AuthAttemptLimiter {
  private readonly key: Buffer;

  constructor(private readonly redis: Redis, secretHex: string) {
    this.key = Buffer.from(z.string().regex(/^[0-9a-fA-F]{64}$/).parse(secretHex), 'hex');
  }

  private digest(value: string): string {
    return createHmac('sha256', this.key).update(value).digest('hex');
  }

  async takeSignInAttempt(ip: string, email: string): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
    const pairKey = `auth:signin:pair:${this.digest(`${ip}\0${email}`)}`;
    const ipKey = `auth:signin:ip:${this.digest(ip)}`;
    const [pairCount, ipCount, pairTtl, ipTtl] = AttemptResultSchema.parse(await this.redis.eval(ATTEMPT_SCRIPT, 2, pairKey, ipKey, WINDOW_SECONDS));
    const allowed = pairCount <= MAX_PAIR_ATTEMPTS && ipCount <= MAX_IP_ATTEMPTS;
    return {
      allowed,
      retryAfterSeconds: allowed ? 0 : Math.max(1, pairCount > MAX_PAIR_ATTEMPTS ? pairTtl : 0, ipCount > MAX_IP_ATTEMPTS ? ipTtl : 0),
    };
  }

  async takeSignupAttempt(ip: string): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
    const key = `auth:signup:ip:${this.digest(ip)}`;
    const [count, ttl] = SignupResultSchema.parse(await this.redis.eval(SIGNUP_SCRIPT, 1, key, WINDOW_SECONDS));
    const allowed = count <= MAX_SIGNUP_IP_ATTEMPTS;
    return { allowed, retryAfterSeconds: allowed ? 0 : Math.max(1, ttl) };
  }
}
