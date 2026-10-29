import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import test from 'node:test';
import { buildApp } from '../dist/app.js';
import { ApiConfigSchema } from '../dist/config.js';
import { createServices } from '../dist/services.js';

test('sign-in throttles repeated password guesses before a valid password is checked', async () => {
  const config = ApiConfigSchema.parse({ ...process.env, AUTH_JWT_SECRET: randomBytes(32).toString('hex') });
  const services = await createServices(config);
  const app = buildApp(services);
  try {
    await app.ready();
    const email = `${randomUUID()}@example.invalid`;
    const signup = await app.inject({ method: 'POST', url: '/api/auth/signup', payload: { email, password: 'valid local password 2026', phone: '+15555550193', role: 'donor' } });
    assert.equal(signup.statusCode, 201, signup.body);
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const wrong = await app.inject({ method: 'POST', url: '/api/auth/signin', payload: { email, password: 'incorrect password' } });
      assert.equal(wrong.statusCode, 401, wrong.body);
    }
    const blocked = await app.inject({ method: 'POST', url: '/api/auth/signin', payload: { email, password: 'incorrect password' } });
    assert.equal(blocked.statusCode, 429, blocked.body);
    assert.ok(Number(blocked.headers['retry-after']) > 0);
    const correctAfterLimit = await app.inject({ method: 'POST', url: '/api/auth/signin', payload: { email, password: 'valid local password 2026' } });
    assert.equal(correctAfterLimit.statusCode, 429, correctAfterLimit.body);
  } finally {
    await app.close();
    await services.close();
  }
});

test('sign-in throttles one source rotating through unknown emails', async () => {
  const config = ApiConfigSchema.parse({ ...process.env, AUTH_JWT_SECRET: randomBytes(32).toString('hex') });
  const services = await createServices(config);
  const app = buildApp(services);
  try {
    await app.ready();
    const prefix = randomUUID();
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const unknown = await app.inject({ method: 'POST', url: '/api/auth/signin', payload: { email: `${prefix}-${attempt}@example.invalid`, password: 'incorrect password' } });
      assert.equal(unknown.statusCode, 401, unknown.body);
    }
    const blocked = await app.inject({ method: 'POST', url: '/api/auth/signin', payload: { email: `${prefix}-blocked@example.invalid`, password: 'incorrect password' } });
    assert.equal(blocked.statusCode, 429, blocked.body);
    assert.ok(Number(blocked.headers['retry-after']) > 0);
  } finally {
    await app.close();
    await services.close();
  }
});

test('sign-up throttles repeated account creation attempts from one source', async () => {
  const config = ApiConfigSchema.parse({ ...process.env, AUTH_JWT_SECRET: randomBytes(32).toString('hex') });
  const services = await createServices(config);
  const app = buildApp(services);
  try {
    await app.ready();
    const payload = { email: `${randomUUID()}@example.invalid`, password: 'valid local password 2026', phone: '+15555550194', role: 'donor' };
    const first = await app.inject({ method: 'POST', url: '/api/auth/signup', payload });
    assert.equal(first.statusCode, 201, first.body);
    for (let attempt = 1; attempt < 100; attempt += 1) {
      const duplicate = await app.inject({ method: 'POST', url: '/api/auth/signup', payload });
      assert.equal(duplicate.statusCode, 409, duplicate.body);
    }
    const blocked = await app.inject({ method: 'POST', url: '/api/auth/signup', payload });
    assert.equal(blocked.statusCode, 429, blocked.body);
    assert.ok(Number(blocked.headers['retry-after']) > 0);
  } finally {
    await app.close();
    await services.close();
  }
});
