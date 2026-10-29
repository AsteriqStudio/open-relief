import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import test from 'node:test';
import { accountLookupHash, billDuplicateFingerprint, decryptAccountNumber, encryptAccountNumber } from './encryption.js';

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

test('account lookup hashes use a secret key and bill-specific context', () => {
  const previous = process.env.ENCRYPTION_KEY_HEX;
  process.env.ENCRYPTION_KEY_HEX = randomBytes(32).toString('hex');
  try {
    const first = accountLookupHash('12345678');
    assert.equal(first, accountLookupHash(' 12345678 '));
    assert.notEqual(first, createHash('sha256').update('12345678').digest('hex'));
    const bill = billDuplicateFingerprint('Demo Utility', '12345678', '2026-12-15');
    assert.equal(bill, billDuplicateFingerprint(' demo utility ', '12345678', '2026-12-15'));
    assert.notEqual(bill, billDuplicateFingerprint('Demo Utility', '12345678', '2026-12-16'));
    process.env.ENCRYPTION_KEY_HEX = randomBytes(32).toString('hex');
    assert.notEqual(accountLookupHash('12345678'), first);
  } finally {
    if (previous === undefined) delete process.env.ENCRYPTION_KEY_HEX;
    else process.env.ENCRYPTION_KEY_HEX = previous;
  }
});
