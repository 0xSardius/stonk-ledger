/**
 * Manual, deeper version of the scheduled pull: walk more pages of the
 * distributor's history to refill payout_batches after an outage.
 * Idempotent. The scheduled job (`pnpm job ingest-distributor`) does the
 * same with a 30-page cap every ten minutes.
 *
 *   pnpm tsx scripts/backfill-batches.ts --pages=400
 */
import { ingestDistributor } from "../lib/jobs/ingest-distributor";

const pages = Number(
  process.argv.find((a) => a.startsWith("--pages="))?.split("=")[1] ?? 50
);

ingestDistributor({ maxPages: pages, log: console.log }).then(
  (s) => {
    console.log("done", s);
    process.exit(0);
  },
  (e) => {
    console.error(e);
    process.exit(1);
  }
);
