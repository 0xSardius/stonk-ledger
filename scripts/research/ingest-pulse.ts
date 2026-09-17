/**
 * Is the webhook landing rows? Prints the newest batch and payout rows with
 * their insert lag. Read-only.
 *
 *   pnpm tsx scripts/research/ingest-pulse.ts
 */
import { sql } from "drizzle-orm";
import { db } from "../../lib/db";

async function main() {
  const d = db();
  const batches = await d.execute(sql`
    select count(*)::int as rows, max(block_time) as newest,
           count(*) filter (where block_time > now() - interval '15 minutes')::int as last_15m,
           count(*) filter (where coin_id is null)::int as unattributed
    from payout_batches`);
  console.log("payout_batches", batches.rows[0]);
  const payouts = await d.execute(sql`
    select count(*)::int as rows, count(distinct wallet)::int as wallets, max(block_time) as newest,
           count(*) filter (where block_time > now() - interval '15 minutes')::int as last_15m
    from payouts`);
  console.log("payouts", payouts.rows[0]);
  const size = await d.execute(sql`
    select pg_size_pretty(pg_database_size(current_database())) as db`);
  console.log("size", size.rows[0]);

  const recent = await d.execute(sql`
    select sig, quote_mint, coin_id, recipients, amount, block_time
    from payout_batches where block_time > now() - interval '30 minutes'
    order by block_time desc limit 10`);
  console.log("batches in the last 30 minutes", recent.rows);

  const prefix = process.argv
    .find((a) => a.startsWith("--sig-prefix="))
    ?.split("=")[1];
  if (prefix) {
    const like = `${prefix}%`;
    const b = await d.execute(sql`
      select sig, coin_id, recipients, amount, usd_at_receipt from payout_batches where sig like ${like}`);
    const p = await d.execute(sql`
      select count(*)::int as rows from payouts where sig like ${like}`);
    console.log("synthetic batches", b.rows, "synthetic payouts", p.rows[0]);
  }
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  }
);
