/**
 * Remove synthetic webhook test rows (signatures starting with WEBHOOKTEST)
 * from payout_batches and payouts. Only ever touches rows created by a
 * hand-sent webhook test; real signatures are base58 and never match.
 *
 *   pnpm tsx scripts/maintenance/delete-synthetic.ts
 */
import { sql } from "drizzle-orm";
import { db } from "../../lib/db";

async function main() {
  const d = db();
  const b = await d.execute(
    sql`delete from payout_batches where sig like 'WEBHOOKTEST%'`
  );
  const p = await d.execute(
    sql`delete from payouts where sig like 'WEBHOOKTEST%'`
  );
  console.log("removed", { batches: b.rowCount, payouts: p.rowCount });
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  }
);
