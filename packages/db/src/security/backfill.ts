import { and, asc, eq, gt, isNotNull } from 'drizzle-orm';
import { createDatabase, bills } from '../index.js';
import { accountLookupHash, billDuplicateFingerprint, decryptAccountNumber } from './encryption.js';

type Database = ReturnType<typeof createDatabase>['db'];

/** Rewrite legacy unkeyed account hashes without changing bill status or encrypted account data. */
export async function backfillAccountLookupHashes(db: Database): Promise<number> {
  let lastId: string | null = null;
  let updated = 0;
  for (;;) {
    const rows = await db.select({
      id: bills.id,
      encrypted: bills.billerAccountEncrypted,
      billerName: bills.billerName,
      dueDate: bills.dueDate,
      accountHash: bills.accountHash,
      duplicateFingerprint: bills.duplicateFingerprint,
    }).from(bills).where(and(isNotNull(bills.billerAccountEncrypted), lastId ? gt(bills.id, lastId) : undefined)).orderBy(asc(bills.id)).limit(100);
    if (rows.length === 0) return updated;
    for (const row of rows) {
      if (!row.encrypted) continue;
      const account = decryptAccountNumber(row.encrypted);
      const accountHash = accountLookupHash(account);
      const duplicateFingerprint = row.billerName && row.dueDate ? billDuplicateFingerprint(row.billerName, account, row.dueDate) : null;
      if (row.accountHash === accountHash && row.duplicateFingerprint === duplicateFingerprint) continue;
      const changed = await db.update(bills).set({ accountHash, duplicateFingerprint }).where(and(eq(bills.id, row.id), eq(bills.billerAccountEncrypted, row.encrypted))).returning({ id: bills.id });
      if (changed.length > 0) updated += 1;
    }
    lastId = rows[rows.length - 1]!.id;
  }
}
