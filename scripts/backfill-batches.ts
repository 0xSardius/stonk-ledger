/**
 * Backfill payout_batches (and tracked wallets' payouts) from the
 * distributor's own history, newest first, stopping at the newest batch we
 * already hold or after --pages pages. Used to close the gap left when the
 * database was full (2026-09-16 02:39 UTC to 2026-09-17) and after the
 * fee-payer change. Idempotent: inserts are on-conflict-do-nothing.
 *
 *   pnpm tsx scripts/backfill-batches.ts --pages=200
 */
import { desc } from "drizzle-orm";
import { db, schema } from "../lib/db";
import { HeliusClient } from "../lib/helius/client";
import { ingestBatch } from "../lib/jobs/ingest-batch";

const DISTRIBUTOR = "5KXDF6QnqhBj72hDtJNkkpFaQVUfbFXNybMsp3DiK6tD";
const pages = Number(
  process.argv.find((a) => a.startsWith("--pages="))?.split("=")[1] ?? 50
);

async function main() {
  const d = db();
  const [newest] = await d
    .select({
      sig: schema.payoutBatches.sig,
      t: schema.payoutBatches.blockTime,
    })
    .from(schema.payoutBatches)
    .orderBy(desc(schema.payoutBatches.blockTime))
    .limit(1);
  console.log(
    "newest stored batch",
    newest?.t?.toISOString(),
    newest?.sig.slice(0, 10)
  );

  const helius = new HeliusClient();
  let txs = 0;
  let batches = 0;
  let inserted = 0;
  let page = 0;
  let oldest: Date | null = null;
  for await (const list of helius.historyPages(DISTRIBUTOR, {
    stopAtSig: newest?.sig ?? null,
    maxPages: pages,
  })) {
    page += 1;
    for (const tx of list) {
      txs += 1;
      const r = await ingestBatch(tx);
      batches += r.batches;
      inserted += r.inserted;
      oldest = new Date(tx.timestamp * 1000);
    }
    if (page % 10 === 0)
      console.log(
        `page ${page}: ${txs} txs, ${batches} batches, ${inserted} tracked rows, back to ${oldest?.toISOString()}`
      );
  }
  console.log("done", {
    pages: page,
    txs,
    batches,
    inserted,
    oldest: oldest?.toISOString(),
  });
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  }
);
