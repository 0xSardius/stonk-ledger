/**
 * Database size report. Read-only. Written 2026-09-16 when Neon returned
 * 53100 (project size limit) on payout inserts.
 *
 *   pnpm tsx scripts/research/db-size.ts
 */
import { sql } from "drizzle-orm";
import { db } from "../../lib/db";

async function main() {
  const d = db();
  const total = await d.execute(sql`
    select pg_size_pretty(pg_database_size(current_database())) as db_size`);
  console.log("database", total.rows);

  const tables = await d.execute(sql`
    select c.relname as table,
           pg_size_pretty(pg_total_relation_size(c.oid)) as total,
           pg_size_pretty(pg_relation_size(c.oid)) as heap,
           pg_size_pretty(pg_indexes_size(c.oid)) as indexes,
           n_live_tup::bigint as live_rows, n_dead_tup::bigint as dead_rows
    from pg_class c join pg_stat_user_tables s on s.relid = c.oid
    where c.relkind = 'r' order by pg_total_relation_size(c.oid) desc`);
  console.log("tables", tables.rows);

  const indexes = await d.execute(sql`
    select indexrelname as index, pg_size_pretty(pg_relation_size(indexrelid)) as size
    from pg_stat_user_indexes order by pg_relation_size(indexrelid) desc limit 12`);
  console.log("indexes", indexes.rows);

  const payouts = await d.execute(sql`
    select count(*)::bigint as rows,
           count(*) filter (where coin_id is null)::bigint as unattributed,
           count(distinct wallet)::bigint as wallets,
           min(block_time) as oldest, max(block_time) as newest
    from payouts`);
  console.log("payouts", payouts.rows);

  const viewed = await d.execute(sql`
    select count(*)::bigint as rows_for_viewed_wallets
    from payouts p where exists (select 1 from wallets w where w.address = p.wallet)`);
  console.log("rows for wallets someone viewed", viewed.rows);

  const byDay = await d.execute(sql`
    select date_trunc('day', block_time)::date as day, count(*)::bigint as rows
    from payouts group by 1 order by 1 desc limit 14`);
  console.log("rows by day", byDay.rows);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  }
);
