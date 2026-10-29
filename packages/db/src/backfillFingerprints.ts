import { createDatabase } from './index.js';
import { backfillAccountLookupHashes } from './security/backfill.js';

const { db, pool } = createDatabase();
try {
  const updated = await backfillAccountLookupHashes(db);
  console.log(`Backfilled keyed account lookup hashes on ${updated} bills.`);
} finally {
  await pool.end();
}
