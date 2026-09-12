import { runLoop } from "./_loop";

/**
 * Indexer: Helius enhanced transaction history -> payout classifier ->
 * `payouts` table. See docs/PRD.md sections 7 and 8.2. Filled in on Day 1.
 */
runLoop("indexer", 60_000, async () => {
  console.log("[indexer] tick: not implemented yet");
});
