/**
 * Add the DRIP run state machine columns (2026-09-23). Additive and
 * idempotent: nullable columns, no rewrite of existing rows. Rows written
 * before this carry a null status and read as complete (lib/drip/plan.ts).
 *
 *   pnpm tsx scripts/maintenance/add-run-status.ts
 */
import { sql } from "drizzle-orm";
import { db } from "../../lib/db";

async function main() {
  const d = db();
  await d.execute(
    sql`alter table drip_runs add column if not exists status text`
  );
  await d.execute(
    sql`alter table drip_runs add column if not exists status_at timestamptz`
  );
  await d.execute(
    sql`alter table drip_delegations add column if not exists locked_until timestamptz`
  );
  const cols = await d.execute(
    sql`select table_name, column_name from information_schema.columns
        where (table_name = 'drip_runs' and column_name in ('status', 'status_at'))
           or (table_name = 'drip_delegations' and column_name = 'locked_until')
        order by 1, 2`
  );
  console.log("columns present", cols.rows);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  }
);
