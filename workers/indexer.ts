import { asc, sql } from "drizzle-orm";
import { runLoop } from "./_loop";
import { db, schema } from "../lib/db";
import { indexWallet } from "../lib/jobs/index-wallet";
import { HeliusClient } from "../lib/helius/client";

/**
 * Indexer (PRD 7): re-index known wallets, oldest first. New wallets enter
 * the `wallets` table when someone opens their statement, and get indexed on
 * that request; this loop keeps them fresh afterwards.
 */
const BATCH = 5;
const helius = new HeliusClient();

runLoop("indexer", 60_000, async () => {
  const stale = await db()
    .select({ address: schema.wallets.address })
    .from(schema.wallets)
    .orderBy(
      sql`${schema.wallets.lastIndexedAt} asc nulls first`,
      asc(schema.wallets.firstSeen)
    )
    .limit(BATCH);
  for (const w of stale) {
    try {
      const s = await indexWallet(w.address, { helius, maxPages: 3 });
      console.log(
        `[indexer] ${w.address.slice(0, 8)}… +${s.newPayouts} payouts across ${s.coins.length} coins`
      );
    } catch (err) {
      console.error(`[indexer] ${w.address.slice(0, 8)}… failed`, err);
    }
  }
});
