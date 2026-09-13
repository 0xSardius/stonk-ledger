import { desc, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { StonkFunClient } from "../stonkfun/client";

/**
 * Hourly: reward totals for the top `limit` active coins by 24h volume into
 * `reward_snapshots`. StonkFun answers slowly (10 to 20 s per call), so keep
 * `limit` small. Also backfills `quote_decimals` when missing.
 */
export async function snapshotRewards(
  limit = 20,
  api = new StonkFunClient(),
  now = new Date()
) {
  const d = db();
  const coins = await d
    .select({
      id: schema.coins.id,
      mint: schema.coins.mint,
      symbol: schema.coins.symbol,
      quoteDecimals: schema.coins.quoteDecimals,
    })
    .from(schema.coins)
    .where(sql`${schema.coins.active} = true`)
    .orderBy(desc(sql`${schema.coins.volume24hUsd}::numeric`))
    .limit(limit);

  let n = 0;
  for (const c of coins) {
    try {
      const r = await api.rewards(c.mint);
      const rw = r.data.rewards;
      if (!rw) continue;
      await d
        .insert(schema.rewardSnapshots)
        .values({
          coinId: c.id,
          ts: now,
          distributedTokens: rw.distributedTokens.toString(),
          payoutCount: rw.payoutCount,
          holderCount: rw.holderCount,
        })
        .onConflictDoNothing();
      if (c.quoteDecimals == null && r.data.quote?.decimals != null) {
        await d
          .update(schema.coins)
          .set({ quoteDecimals: r.data.quote.decimals })
          .where(sql`${schema.coins.id} = ${c.id}`);
      }
      n += 1;
    } catch (err) {
      console.warn(`[rewards] ${c.symbol} failed`, err);
    }
  }
  return n;
}
