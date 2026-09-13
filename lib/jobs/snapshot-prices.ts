import { sql } from "drizzle-orm";
import { db, schema } from "../db";
import { JupiterPriceClient } from "../prices/jupiter";

/**
 * Snapshot the USD price of every distinct quote mint of an active coin into
 * `price_snapshots`. Runs every 60 s in the rate-cacher (PRD 8.3).
 * Returns the number of mints priced.
 */
export async function snapshotQuotePrices(
  jupiter = new JupiterPriceClient(),
  now = new Date()
) {
  const d = db();
  const rows = await d
    .selectDistinct({ mint: schema.coins.quoteMint })
    .from(schema.coins)
    .where(sql`${schema.coins.active} = true`);
  const mints = rows.map((r) => r.mint);
  if (mints.length === 0) return 0;

  const prices = await jupiter.prices(mints);
  const values = Object.entries(prices)
    .filter(([, p]) => p && Number.isFinite(p.usdPrice))
    .map(([mint, p]) => ({ mint, ts: now, usd: p.usdPrice.toString() }));
  if (values.length === 0) return 0;

  await d.insert(schema.priceSnapshots).values(values).onConflictDoNothing();
  return values.length;
}
