/**
 * Repair rows written while the ledger knew only one distributor wallet
 * (2026-09-20 to 2026-09-23, docs/RESEARCH.md "Second distributor"):
 *
 * 1. payout_batches rows that are really funding transfers between two
 *    distributor wallets: one recipient, and the parsed transaction shows
 *    every transfer of that mint going to a distributor. Deleted.
 * 2. payouts rows marked probable whose tokens came from a distributor
 *    wallet. Set probable = false.
 *
 * Each candidate is checked against its parsed transaction (Helius, 100
 * signatures per call). Dry run by default; pass --apply to write.
 *
 *   pnpm tsx scripts/maintenance/fix-distributor-rows.ts [--apply]
 */
import { and, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "../../lib/db";
import { PLATFORM_DISTRIBUTORS } from "../../lib/distributors";
import { HeliusClient, type ParsedTx } from "../../lib/helius/client";

const SINCE = new Date("2026-09-20T00:00:00Z");
const apply = process.argv.includes("--apply");
const distributors = new Set<string>(PLATFORM_DISTRIBUTORS);

/** Parse in chunks of 25 (100 hung and reset); retry each chunk up to 3 times. */
async function parseAll(helius: HeliusClient, sigs: string[]) {
  const out = new Map<string, ParsedTx>();
  const CHUNK = 25;
  for (let i = 0; i < sigs.length; i += CHUNK) {
    const part = sigs.slice(i, i + CHUNK);
    for (let attempt = 1; ; attempt++) {
      try {
        const txs = await helius.parseTransactions(part);
        for (const t of txs) out.set(t.signature, t);
        break;
      } catch (err) {
        if (attempt >= 3) throw err;
        console.log(
          `chunk ${i} failed (${(err as Error).message}); retry ${attempt}`
        );
        await new Promise((r) => setTimeout(r, 2_000 * attempt));
      }
    }
    if ((i / CHUNK) % 20 === 0)
      console.log(`parsed ${Math.min(i + CHUNK, sigs.length)}/${sigs.length}`);
  }
  return out;
}

async function main() {
  const d = db();
  const helius = new HeliusClient();

  // 1. one-recipient batches since the change
  const single = await d
    .select({
      sig: schema.payoutBatches.sig,
      quoteMint: schema.payoutBatches.quoteMint,
    })
    .from(schema.payoutBatches)
    .where(
      and(
        eq(schema.payoutBatches.recipients, 1),
        gte(schema.payoutBatches.blockTime, SINCE)
      )
    );
  console.log(
    `one-recipient batches since ${SINCE.toISOString()}: ${single.length}`
  );
  const parsedB = await parseAll(helius, [
    ...new Set(single.map((r) => r.sig)),
  ]);
  const funding = single.filter((r) => {
    const tx = parsedB.get(r.sig);
    if (!tx) return false;
    const legs = tx.tokenTransfers.filter((t) => t.mint === r.quoteMint);
    return (
      legs.length > 0 &&
      legs.every((t) => !!t.toUserAccount && distributors.has(t.toUserAccount))
    );
  });
  console.log(
    `  funding transfers (to delete): ${funding.length}; kept as real: ${single.length - funding.length}`
  );

  // 2. probable payouts that came from a distributor
  const probable = await d
    .select({ sig: schema.payouts.sig, wallet: schema.payouts.wallet })
    .from(schema.payouts)
    .where(
      and(
        eq(schema.payouts.probable, true),
        gte(schema.payouts.blockTime, SINCE)
      )
    );
  console.log(`probable payouts since the change: ${probable.length}`);
  const parsedP = await parseAll(helius, [
    ...new Set(probable.map((r) => r.sig)),
  ]);
  const confirmed = probable.filter((r) => {
    const tx = parsedP.get(r.sig);
    return !!tx?.tokenTransfers.some(
      (t) =>
        t.toUserAccount === r.wallet &&
        !!t.fromUserAccount &&
        distributors.has(t.fromUserAccount)
    );
  });
  console.log(
    `  from a distributor (to confirm): ${confirmed.length}; still probable: ${probable.length - confirmed.length}`
  );

  if (!apply) {
    console.log("dry run; pass --apply to write");
    return;
  }
  for (let i = 0; i < funding.length; i += 500) {
    const chunk = funding.slice(i, i + 500);
    await d.execute(
      sql`delete from payout_batches where (sig, quote_mint) in (${sql.join(
        chunk.map((r) => sql`(${r.sig}, ${r.quoteMint})`),
        sql`, `
      )})`
    );
  }
  for (let i = 0; i < confirmed.length; i += 500) {
    const chunk = confirmed.slice(i, i + 500);
    await d.execute(
      sql`update payouts set probable = false where (sig, wallet) in (${sql.join(
        chunk.map((r) => sql`(${r.sig}, ${r.wallet})`),
        sql`, `
      )})`
    );
  }
  console.log(
    `applied: deleted ${funding.length} batch rows, confirmed ${confirmed.length} payouts`
  );
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  }
);
