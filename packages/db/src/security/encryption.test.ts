import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import { decryptAccountNumber, encryptAccountNumber } from './encryption.js';

test('account encryption round trips and detects tampering', () => {
  const previous = process.env.ENCRYPTION_KEY_HEX;
  process.env.ENCRYPTION_KEY_HEX = randomBytes(32).toString('hex');
  try {
    const ciphertext = encryptAccountNumber('1000-2000-3000');
    assert.notEqual(ciphertext, encryptAccountNumber('1000-2000-3000'));
    assert.equal(decryptAccountNumber(ciphertext), '1000-2000-3000');
    const parts = ciphertext.split(':');
    parts[2] = '0'.repeat(32);
    assert.throws(() => decryptAccountNumber(parts.join(':')));
  } finally {
    if (previous === undefined) delete process.env.ENCRYPTION_KEY_HEX;
    else process.env.ENCRYPTION_KEY_HEX = previous;
  }
});
