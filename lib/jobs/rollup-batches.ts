/**
 * Keep storage flat: batches older than the retention window are folded into
 * one `payout_daily` row per coin, quote mint, and day, then deleted. One SQL
 * statement (delete ... returning into insert), so it is atomic on the
 * neon-http driver, which has no interactive transactions. Feed totals read
 * raw batches plus rollups; the latest-batches list only needs the window.
 */
import { sql } from "drizzle-orm";
import { db } from "../db";

export const BATCH_RETENTION_DAYS = 14;

export async function rollupBatches(retentionDays = BATCH_RETENTION_DAYS) {
  const cutoff = new Date(Date.now() - retentionDays * 86400_000);
  cutoff.setUTCHours(0, 0, 0, 0);
  const d = db();
  const r = await d.execute(sql`
    with moved as (
      delete from payout_batches where block_time < ${cutoff} returning *
    )
    insert into payout_daily (coin_id, quote_mint, day, batches, recipients, amount, usd_at_receipt)
    select coalesce(coin_id, 0), quote_mint, (block_time at time zone 'UTC')::date,
           count(*)::int, sum(recipients)::int, sum(amount), sum(usd_at_receipt)
    from moved
    group by coalesce(coin_id, 0), quote_mint, (block_time at time zone 'UTC')::date
    on conflict (coin_id, quote_mint, day) do update set
      batches = payout_daily.batches + excluded.batches,
      recipients = payout_daily.recipients + excluded.recipients,
      amount = payout_daily.amount + excluded.amount,
      usd_at_receipt = coalesce(payout_daily.usd_at_receipt, 0) + coalesce(excluded.usd_at_receipt, 0)`);
  return { cutoff: cutoff.toISOString(), dailyRowsWritten: r.rowCount ?? 0 };
}
