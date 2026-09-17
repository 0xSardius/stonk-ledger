/**
 * One-off retention migration, 2026-09-16. The webhook had stored one row per
 * recipient for every distributor batch (908,870 rows, 78,570 wallets, 489 MB)
 * and hit Neon's project size limit (SQLSTATE 53100), so every insert failed.
 *
 * Sequence, each step idempotent:
 *   1. drop the three secondary indexes on payouts (46 MB) to make room
 *   2. create payout_batches and fill it from the rows we have
 *   3. delete payouts for wallets nobody viewed or delegated, in chunks
 *   4. VACUUM FULL payouts (falls back to plain VACUUM)
 *   5. recreate the secondary indexes
 *
 *   pnpm tsx scripts/maintenance/retention-migrate.ts --dry-run
 *   pnpm tsx scripts/maintenance/retention-migrate.ts
 */
import { sql } from "drizzle-orm";
import { db } from "../../lib/db";

const dryRun = process.argv.includes("--dry-run");
const CHUNK = 50_000;

const TRACKED = sql`(select address from wallets union select wallet from drip_delegations)`;

async function size(label: string) {
  const d = db();
  const r = await d.execute(sql`
    select pg_size_pretty(pg_database_size(current_database())) as db,
           pg_size_pretty(pg_total_relation_size('payouts')) as payouts`);
  console.log(label, r.rows[0]);
}

async function main() {
  const d = db();
  await size("before");
  const counts = await d.execute(sql`
    select count(*)::bigint as total,
           count(*) filter (where wallet in ${TRACKED})::bigint as tracked
    from payouts`);
  console.log("payout rows", counts.rows[0]);
  if (dryRun) return;

  console.log("1. dropping secondary indexes");
  await d.execute(sql`drop index if exists payouts_wallet_coin_idx`);
  await d.execute(sql`drop index if exists payouts_quote_time_idx`);
  await d.execute(sql`drop index if exists payouts_coin_time_idx`);
  await size("after index drop");

  console.log("2. creating payout_batches");
  await d.execute(sql`
    create table if not exists payout_batches (
      sig text not null,
      quote_mint text not null,
      coin_id integer references coins(id),
      block_time timestamptz not null,
      recipients integer not null,
      amount numeric not null,
      usd_at_receipt numeric,
      primary key (sig, quote_mint)
    )`);
  await d.execute(sql`
    create index if not exists payout_batches_coin_time_idx on payout_batches (coin_id, block_time)`);
  await d.execute(sql`
    create index if not exists payout_batches_quote_time_idx on payout_batches (quote_mint, block_time)`);
  const filled = await d.execute(sql`
    insert into payout_batches (sig, quote_mint, coin_id, block_time, recipients, amount, usd_at_receipt)
    select sig, quote_mint, max(coin_id), min(block_time), count(*)::int, sum(amount),
           case when count(usd_at_receipt) = count(*) then sum(usd_at_receipt) else null end
    from payouts group by sig, quote_mint
    on conflict do nothing`);
  console.log("batches inserted", filled.rowCount);
  await size("after batches");

  console.log("3. deleting untracked payout rows");
  for (;;) {
    const r = await d.execute(sql`
      delete from payouts where ctid in (
        select ctid from payouts where wallet not in ${TRACKED} limit ${CHUNK})`);
    console.log("  deleted", r.rowCount);
    if (!r.rowCount) break;
  }

  console.log("4. vacuum");
  try {
    await d.execute(sql`vacuum full payouts`);
    console.log("  vacuum full ok");
  } catch (e) {
    console.log("  vacuum full failed, plain vacuum:", (e as Error).message);
    await d.execute(sql`vacuum payouts`);
  }
  await size("after vacuum");

  console.log("5. recreating indexes");
  await d.execute(sql`
    create index if not exists payouts_wallet_coin_idx on payouts (wallet, coin_id)`);
  await d.execute(sql`
    create index if not exists payouts_coin_time_idx on payouts (coin_id, block_time)`);
  await d.execute(sql`
    create index if not exists payouts_quote_time_idx on payouts (quote_mint, block_time)`);
  await size("after");
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  }
);
