/**
 * Replay the distributor's latest enhanced transactions through the webhook
 * parser and say why each one is or is not a payout batch. Read-only.
 *
 *   pnpm tsx scripts/research/parse-recent-distributor.ts [limit]
 */
import { HeliusClient } from "../../lib/helius/client";
import { hasDexProgram } from "../../lib/classify";
import { coinIndex, parseBatch } from "../../lib/jobs/ingest-batch";

const DISTRIBUTOR = "5KXDF6QnqhBj72hDtJNkkpFaQVUfbFXNybMsp3DiK6tD";
const limit = Number(process.argv[2] ?? 40);

async function main() {
  const helius = new HeliusClient();
  const { coinsByQuote, distributors } = await coinIndex(true);
  console.log("coin index", {
    quoteMints: coinsByQuote.size,
    distributors: [...distributors],
  });
  const txs = await helius.history(DISTRIBUTOR, { limit });
  console.log("fetched", txs.length, "txs");
  const reasons = new Map<string, number>();
  for (const tx of txs) {
    const batches = parseBatch(tx, coinsByQuote, distributors);
    let reason = "payout batch";
    if (batches.length === 0) {
      if (tx.transactionError) reason = "tx error";
      else if (!distributors.has(tx.feePayer))
        reason = `fee payer ${tx.feePayer.slice(0, 6)} not distributor`;
      else if (hasDexProgram(tx)) reason = "dex program";
      else {
        const mints = new Set(tx.tokenTransfers.map((t) => t.mint));
        const known = [...mints].filter((m) => coinsByQuote.has(m));
        const outbound = tx.tokenTransfers.filter(
          (t) => t.fromUserAccount === tx.feePayer && coinsByQuote.has(t.mint)
        );
        reason =
          mints.size === 0
            ? "no token transfers"
            : known.length === 0
              ? `mints not quote mints (${[...mints].map((m) => m.slice(0, 6)).join(",")})`
              : outbound.length === 0
                ? "quote mint moved but not from the distributor"
                : "unknown";
      }
    }
    reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
    console.log(
      new Date(tx.timestamp * 1000).toISOString(),
      tx.type,
      tx.signature.slice(0, 10),
      "transfers",
      tx.tokenTransfers.length,
      "->",
      batches.length
        ? `${batches.length} batch, ${batches[0].rows.length} recipients`
        : reason
    );
  }
  console.log("summary", Object.fromEntries(reasons));
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  }
);
