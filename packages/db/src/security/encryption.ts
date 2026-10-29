import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { z } from 'zod';

const KeySchema = z.string().regex(/^[0-9a-fA-F]{64}$/, 'ENCRYPTION_KEY_HEX must contain 32 bytes encoded as 64 hexadecimal characters');

function encryptionKey(): Buffer {
  return Buffer.from(KeySchema.parse(process.env.ENCRYPTION_KEY_HEX), 'hex');
}

function lookupHmac(value: string): string {
  const lookupKey = createHmac('sha256', encryptionKey()).update('open-relief-lookup-key-v2').digest();
  return createHmac('sha256', lookupKey).update(value).digest('hex');
}

export function accountLookupHash(accountNumber: string): string {
  const normalized = accountNumber.trim();
  if (!normalized) throw new RangeError('Account number cannot be empty');
  return lookupHmac(`account:v2\0${normalized}`);
}

export function billDuplicateFingerprint(billerName: string, accountNumber: string, dueDate: string): string {
  const normalizedName = billerName.trim().toLowerCase();
  if (!normalizedName || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) throw new RangeError('Biller name and due date are required');
  return lookupHmac(`bill:v2\0${normalizedName}\0${accountLookupHash(accountNumber)}\0${dueDate}`);
}

export function encryptAccountNumber(accountNumber: string): string {
  if (accountNumber.length === 0) throw new RangeError('Account number cannot be empty');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(accountNumber, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('hex'), cipher.getAuthTag().toString('hex'), ciphertext.toString('hex')].join(':');
}

export function decryptAccountNumber(encoded: string): string {
  const parts = encoded.split(':');
  if (parts.length !== 4 || parts[0] !== 'v1' || !/^[0-9a-f]{24}$/.test(parts[1] ?? '') || !/^[0-9a-f]{32}$/.test(parts[2] ?? '') || !/^(?:[0-9a-f]{2})+$/.test(parts[3] ?? '')) {
    throw new Error('Invalid encrypted account number format');
  }
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(parts[1]!, 'hex'));
  decipher.setAuthTag(Buffer.from(parts[2]!, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(parts[3]!, 'hex')), decipher.final()]).toString('utf8');
}
