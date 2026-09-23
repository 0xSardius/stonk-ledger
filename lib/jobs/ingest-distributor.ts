/**
 * Scheduled pull of the distributors' recent transactions (replaces the
 * Helius webhook, 2026-09-17). Reads each platform wallet's enhanced history
 * newest first, runs each transaction through the batch parser, and stops
 * once a page reaches two minutes past the newest batch we already hold, or
 * at the page cap. Inserts are on-conflict-do-nothing, so overlap is free.
 *
 * Coverage is a sample, not a full record: the platform sends well over
 * 100k transactions a day, more than the Helius free tier can read. The feed
 * says so. Cost per run: one Helius call per 100 transactions, capped at
 * maxPages per distributor.
 */
import { desc } from "drizzle-orm";
import { db, schema } from "../db";
import { HeliusClient } from "../helius/client";
import { PLATFORM_DISTRIBUTORS } from "../distributors";
import { ingestBatch } from "./ingest-batch";
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
  // Each distributor gets its own page budget; the floor is shared because
  // both walks are newest-first by block time.
  let allStopped = true;
  for (const wallet of PLATFORM_DISTRIBUTORS) {
    let before: string | undefined;
    let pages = 0;
    let stopped = false;
    while (pages < maxPages) {
      const list = await helius.history(wallet, { before, limit: 100 });
      if (list.length === 0) {
        stopped = true;
        break;
      }
      pages += 1;
      s.pages += 1;
      for (const tx of list) {
        s.txs += 1;
        const r = await ingestBatch(tx);
        s.batches += r.batches;
        s.trackedRows += r.inserted;
      }
      const last = list[list.length - 1];
      const oldest = new Date(last.timestamp * 1000).toISOString();
      if (!s.oldest || oldest > s.oldest) s.oldest = oldest;
      before = last.signature;
      opts.log?.(
        `${wallet.slice(0, 5)} page ${pages}: ${s.txs} txs, ${s.batches} batches, ${s.trackedRows} tracked rows, back to ${oldest}`
      );
      if (floor != null && last.timestamp * 1000 < floor) {
        stopped = true;
        break;
      }
    }
    allStopped &&= stopped;
  }
  s.stoppedAtStored = allStopped;
  return s;
}
