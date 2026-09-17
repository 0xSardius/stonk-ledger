/**
 * Ingest one distributor batch (an enhanced transaction) into `payouts`,
 * for every recipient in it. Fed by the Helius webhook on the distributor
 * address, so fresh payouts land without polling.
 *
 * Attribution: a batch carries no coin id. If only one active coin pays this
 * quote mint, that coin. Otherwise vote with recipients whose earlier payouts
 * for this quote mint were already attributed. If nobody is known, coin_id
 * stays null and index-wallet fills it when the wallet is first viewed.
 */
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { hasDexProgram } from "../classify";
import type { ParsedTx } from "../helius/client";
import { attachUsdAtReceipt } from "./index-wallet";

type Coin = typeof schema.coins.$inferSelect;
export type PayoutInsert = typeof schema.payouts.$inferInsert;

export type ParsedBatch = {
  quoteMint: string;
  candidates: Coin[];
  rows: Omit<PayoutInsert, "coinId">[];
};

/**
 * Pure: split a distributor transaction into per-recipient payout rows,
 * one group per quote mint. Returns [] when the tx is not a payout batch.
 */
export function parseBatch(
  tx: ParsedTx,
  coinsByQuote: Map<string, Coin[]>,
  distributors: ReadonlySet<string>
): ParsedBatch[] {
  if (tx.transactionError) return [];
  if (hasDexProgram(tx)) return [];
  // The signal is tokens leaving a distributor wallet in a plain batch. The
  // fee payer used to be that wallet; since 2026-09-17 StonkFun pays fees from
  // separate wallets while the tokens still leave the platform wallet.
  const fromDistributor = (t: ParsedTx["tokenTransfers"][number]) =>
    !!t.fromUserAccount && distributors.has(t.fromUserAccount);
  if (
    !distributors.has(tx.feePayer) &&
    !tx.tokenTransfers.some(fromDistributor)
  )
    return [];
  const byMint = new Map<string, Map<string, number>>();
  for (const t of tx.tokenTransfers) {
    if (!coinsByQuote.has(t.mint)) continue;
    if (!fromDistributor(t)) continue;
    if (!t.toUserAccount || distributors.has(t.toUserAccount)) continue;
    const m = byMint.get(t.mint) ?? new Map<string, number>();
    m.set(t.toUserAccount, (m.get(t.toUserAccount) ?? 0) + t.tokenAmount);
    byMint.set(t.mint, m);
  }
  const out: ParsedBatch[] = [];
  for (const [quoteMint, recipients] of byMint) {
    const candidates = coinsByQuote.get(quoteMint)!;
    const decimals =
      candidates.find((c) => c.quoteDecimals != null)?.quoteDecimals ?? null;
    const rows = Array.from(recipients.entries()).map(([wallet, amountUi]) => ({
      sig: tx.signature,
      wallet,
      quoteMint,
      amountRaw:
        decimals != null ? BigInt(Math.round(amountUi * 10 ** decimals)) : 0n,
      amount: amountUi.toString(),
      blockTime: new Date(tx.timestamp * 1000),
      probable: false,
    }));
    out.push({ quoteMint, candidates, rows });
  }
  return out;
}

let cache: {
  at: number;
  coinsByQuote: Map<string, Coin[]>;
  distributors: Set<string>;
} | null = null;

/** Active coins grouped by quote mint plus the distributor set, cached 5 minutes. */
export async function coinIndex(force = false) {
  if (!force && cache && Date.now() - cache.at < 5 * 60_000) return cache;
  const coins = await db()
    .select()
    .from(schema.coins)
    .where(eq(schema.coins.active, true));
  const coinsByQuote = new Map<string, Coin[]>();
  const distributors = new Set<string>();
  for (const c of coins) {
    coinsByQuote.set(c.quoteMint, [
      ...(coinsByQuote.get(c.quoteMint) ?? []),
      c,
    ]);
    for (const s of c.distributorSigners) distributors.add(s);
  }
  cache = { at: Date.now(), coinsByQuote, distributors };
  return cache;
}

/** Vote with recipients whose earlier payouts for this quote were attributed. */
async function attribute(batch: ParsedBatch): Promise<number | null> {
  if (batch.candidates.length === 1) return batch.candidates[0].id;
  const wallets = batch.rows.map((r) => r.wallet);
  const votes = await db()
    .select({
      coinId: schema.payouts.coinId,
      n: sql<number>`count(distinct ${schema.payouts.wallet})::int`,
    })
    .from(schema.payouts)
    .where(
      and(
        inArray(schema.payouts.wallet, wallets),
        eq(schema.payouts.quoteMint, batch.quoteMint),
        isNotNull(schema.payouts.coinId)
      )
    )
    .groupBy(schema.payouts.coinId)
    .orderBy(sql`count(distinct ${schema.payouts.wallet}) desc`)
    .limit(1);
  return votes[0]?.coinId ?? null;
}

export type BatchInsert = typeof schema.payoutBatches.$inferInsert;

/** Pure: the one feed row for a parsed batch. */
export function toBatchRow(b: ParsedBatch, coinId: number | null): BatchInsert {
  return {
    sig: b.rows[0].sig,
    quoteMint: b.quoteMint,
    coinId,
    blockTime: b.rows[0].blockTime,
    recipients: b.rows.length,
    amount: b.rows.reduce((a, r) => a + Number(r.amount), 0).toString(),
    usdAtReceipt: null,
  };
}

/** Pure: keep only recipients whose full history we store. */
export function trackedRows<T extends { wallet: string }>(
  rows: T[],
  tracked: ReadonlySet<string>
): T[] {
  return rows.filter((r) => tracked.has(r.wallet));
}

let trackedCache: { at: number; set: Set<string> } | null = null;

/**
 * Wallets whose per-recipient rows we keep: every wallet someone viewed
 * (`wallets`) plus every wallet with a delegation. Cached one minute.
 */
export async function trackedWallets(force = false) {
  if (!force && trackedCache && Date.now() - trackedCache.at < 60_000)
    return trackedCache.set;
  const d = db();
  const [viewed, delegated] = await Promise.all([
    d.select({ w: schema.wallets.address }).from(schema.wallets),
    d.select({ w: schema.dripDelegations.wallet }).from(schema.dripDelegations),
  ]);
  trackedCache = {
    at: Date.now(),
    set: new Set([...viewed, ...delegated].map((r) => r.w)),
  };
  return trackedCache.set;
}

/**
 * Store one `payout_batches` row per batch (for the feed) and per-recipient
 * `payouts` rows only for tracked wallets. Storing every recipient filled the
 * database in three days.
 */
export async function ingestBatch(tx: ParsedTx) {
  const { coinsByQuote, distributors } = await coinIndex();
  const batches = parseBatch(tx, coinsByQuote, distributors);
  if (batches.length === 0) return { batches: 0, inserted: 0 };
  const tracked = await trackedWallets();
  let inserted = 0;
  for (const b of batches) {
    const coinId = await attribute(b);
    const batchRow = toBatchRow(b, coinId);
    await attachUsdAtReceipt([batchRow], b.quoteMint);
    await db()
      .insert(schema.payoutBatches)
      .values(batchRow)
      .onConflictDoNothing();
    const rows: PayoutInsert[] = trackedRows(b.rows, tracked).map((r) => ({
      ...r,
      coinId,
    }));
    if (rows.length === 0) continue;
    await attachUsdAtReceipt(rows, b.quoteMint);
    const res = await db()
      .insert(schema.payouts)
      .values(rows)
      .onConflictDoNothing()
      .returning({ sig: schema.payouts.sig });
    inserted += res.length;
  }
  return { batches: batches.length, inserted };
}
