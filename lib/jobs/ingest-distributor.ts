/**
 * Scheduled pull of the distributor's recent transactions (replaces the
 * Helius webhook, 2026-09-17). Reads the platform wallet's enhanced history
 * newest first, runs each transaction through the same parser the webhook
 * used, and stops once a page reaches two minutes past the newest batch we
 * already hold. Inserts are on-conflict-do-nothing, so overlap is free.
 *
 * Cost per run: about one Helius call per 100 distributor transactions, so
 * typically 3 to 10 calls every ten minutes. Nothing runs between passes.
 */
import { desc } from "drizzle-orm";
import { db, schema } from "../db";
import { HeliusClient } from "../helius/client";
import { ingestBatch } from "./ingest-batch";

export const DISTRIBUTOR = "5KXDF6QnqhBj72hDtJNkkpFaQVUfbFXNybMsp3DiK6tD";
/** Re-read this much history past the newest stored batch, for same-second ordering. */
const OVERLAP_MS = 2 * 60_000;

export type IngestSummary = {
  pages: number;
  txs: number;
  batches: number;
  trackedRows: number;
  oldest: string | null;
  stoppedAtStored: boolean;
};

export async function ingestDistributor(
  opts: {
    maxPages?: number;
    helius?: HeliusClient;
    log?: (line: string) => void;
  } = {}
): Promise<IngestSummary> {
  const helius = opts.helius ?? new HeliusClient();
  const maxPages = opts.maxPages ?? 30;
  const d = db();
  const [newest] = await d
    .select({ t: schema.payoutBatches.blockTime })
    .from(schema.payoutBatches)
    .orderBy(desc(schema.payoutBatches.blockTime))
    .limit(1);
  const floor = newest ? newest.t.getTime() - OVERLAP_MS : null;

  const s: IngestSummary = {
    pages: 0,
    txs: 0,
    batches: 0,
    trackedRows: 0,
    oldest: null,
    stoppedAtStored: false,
  };
  let before: string | undefined;
  while (s.pages < maxPages) {
    const list = await helius.history(DISTRIBUTOR, { before, limit: 100 });
    if (list.length === 0) break;
    s.pages += 1;
    for (const tx of list) {
      s.txs += 1;
      const r = await ingestBatch(tx);
      s.batches += r.batches;
      s.trackedRows += r.inserted;
    }
    const last = list[list.length - 1];
    s.oldest = new Date(last.timestamp * 1000).toISOString();
    before = last.signature;
    opts.log?.(
      `page ${s.pages}: ${s.txs} txs, ${s.batches} batches, ${s.trackedRows} tracked rows, back to ${s.oldest}`
    );
    if (floor != null && last.timestamp * 1000 < floor) {
      s.stoppedAtStored = true;
      break;
    }
  }
  return s;
}
