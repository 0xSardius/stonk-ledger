/**
 * Index one wallet: find which reward coins it holds, walk the history of its
 * quote-token accounts, classify inbound transfers, store payouts.
 *
 * Attribution: a payout is attributed to the coin whose quote mint matches.
 * When a wallet holds two coins with the same quote mint (two STONK-paid
 * coins), the distributor batch carries no coin id. Payouts are pro rata to
 * holdings, so the payout goes to the coin where the wallet's position is
 * worth the most (balance x market cap, supply is 1B for LaunchLab coins).
 * It is marked `probable` only when the runner-up position is worth at least
 * AMBIGUITY_RATIO of the top one. Documented in docs/RESEARCH.md.
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { heldActiveCoins } from "./held-coins";
import { db, schema } from "../db";
import { classifyTx } from "../classify";
import { HeliusClient } from "../helius/client";

export type IndexSummary = {
  wallet: string;
  holdings: number;
  coins: {
    symbol: string;
    quoteSymbol: string;
    newPayouts: number;
    newAmount: number;
    pagesWalked: number;
  }[];
  newPayouts: number;
};

type Coin = typeof schema.coins.$inferSelect;

/** LaunchLab reward coins mint 1B tokens; market cap / 1B = price. */
const LAUNCHLAB_SUPPLY = 1_000_000_000;
/** Runner-up position worth this share of the top one => attribution is ambiguous. */
const AMBIGUITY_RATIO = 0.2;

export async function indexWallet(
  wallet: string,
  opts: { helius?: HeliusClient; maxPages?: number } = {}
): Promise<IndexSummary> {
  const helius = opts.helius ?? new HeliusClient();
  const maxPages = opts.maxPages ?? 5;
  const d = db();

  await d
    .insert(schema.wallets)
    .values({ address: wallet })
    .onConflictDoNothing();

  // 1. holdings -> which reward coins this wallet holds
  const holdings = await helius.tokenAccounts(wallet);
  const coins: Coin[] = await heldActiveCoins(holdings.map((h) => h.mint));

  const summary: IndexSummary = {
    wallet,
    holdings: holdings.length,
    coins: [],
    newPayouts: 0,
  };
  if (coins.length === 0) return summary;

  const holdingByMint = new Map(holdings.map((h) => [h.mint, h]));
  const uiBalance = (c: Coin) => {
    const h = holdingByMint.get(c.mint);
    return h ? Number(h.amountRaw) / 10 ** h.decimals : 0;
  };
  /** Approximate USD value of the wallet's position in a coin. */
  const positionUsd = (c: Coin) =>
    (uiBalance(c) * Number(c.marketCapUsd ?? 0)) / LAUNCHLAB_SUPPLY;

  // 2. group coins by quote mint; one history walk per quote token account
  const groups = new Map<string, Coin[]>();
  for (const c of coins) {
    groups.set(c.quoteMint, [...(groups.get(c.quoteMint) ?? []), c]);
  }

  let newestSig: string | null = null;

  for (const [quoteMint, group] of groups) {
    const quoteAccounts = holdings.filter((h) => h.mint === quoteMint);
    if (quoteAccounts.length === 0) continue; // never received this quote, or closed the account

    const ranked = [...group].sort((a, b) => positionUsd(b) - positionUsd(a));
    const target = ranked[0];
    const ambiguous =
      ranked.length > 1 &&
      positionUsd(ranked[1]) >= AMBIGUITY_RATIO * positionUsd(target);
    const groupIds = group.map((c) => c.id);
    const rule = {
      quoteMint,
      distributorSigners: Array.from(
        new Set(group.flatMap((c) => c.distributorSigners))
      ),
    };
    const decimals =
      group.find((c) => c.quoteDecimals != null)?.quoteDecimals ?? null;

    // stop where we left off: newest payout already stored for this wallet+group
    const [last] = await d
      .select({ sig: schema.payouts.sig })
      .from(schema.payouts)
      .where(
        and(
          eq(schema.payouts.wallet, wallet),
          inArray(schema.payouts.coinId, groupIds)
        )
      )
      .orderBy(desc(schema.payouts.blockTime))
      .limit(1);

    const entry = {
      symbol: target.symbol,
      quoteSymbol: target.quoteSymbol,
      newPayouts: 0,
      newAmount: 0,
      pagesWalked: 0,
    };

    for (const qa of quoteAccounts) {
      const rows: (typeof schema.payouts.$inferInsert)[] = [];
      for await (const page of helius.historyPages(qa.tokenAccount, {
        stopAtSig: last?.sig ?? null,
        maxPages,
      })) {
        entry.pagesWalked += 1;
        for (const tx of page) {
          if (!newestSig) newestSig = tx.signature;
          const r = classifyTx(tx, wallet, rule, decimals);
          if (r.kind !== "payout") continue;
          rows.push({
            sig: r.payout.sig,
            coinId: target.id,
            quoteMint,
            wallet,
            amountRaw: r.payout.amountRaw ?? 0n,
            amount: r.payout.amountUi.toString(),
            blockTime: r.payout.blockTime,
            probable: r.payout.probable || ambiguous,
          });
        }
      }
      if (rows.length === 0) continue;
      await attachUsdAtReceipt(rows, quoteMint);
      const inserted = await d
        .insert(schema.payouts)
        .values(rows)
        .onConflictDoNothing()
        .returning({ sig: schema.payouts.sig });
      entry.newPayouts += inserted.length;
      entry.newAmount += rows
        .filter((r) => inserted.some((i) => i.sig === r.sig))
        .reduce((a, r) => a + Number(r.amount), 0);
    }
    // batches ingested by the webhook before this wallet was known
    await d
      .update(schema.payouts)
      .set({ coinId: target.id, probable: ambiguous })
      .where(
        and(
          eq(schema.payouts.wallet, wallet),
          eq(schema.payouts.quoteMint, quoteMint),
          sql`${schema.payouts.coinId} is null`
        )
      );
    // a clear attribution for this wallet also resolves the feed rows of the
    // batches it was paid in
    if (!ambiguous) {
      await d
        .update(schema.payoutBatches)
        .set({ coinId: target.id })
        .where(
          and(
            eq(schema.payoutBatches.quoteMint, quoteMint),
            sql`${schema.payoutBatches.coinId} is null`,
            sql`${schema.payoutBatches.sig} in (select sig from payouts where wallet = ${wallet} and coin_id = ${target.id})`
          )
        );
    }
    summary.coins.push(entry);
    summary.newPayouts += entry.newPayouts;
  }

  await d
    .update(schema.wallets)
    .set({
      lastIndexedAt: new Date(),
      ...(newestSig ? { lastIndexedSig: newestSig } : {}),
    })
    .where(eq(schema.wallets.address, wallet));

  return summary;
}

/**
 * Fill usd_at_receipt from the nearest price snapshot within two hours.
 * Older payouts stay null until a daily-close backfill exists (PRD 8.3),
 * and are then labelled "estimated".
 */
export async function attachUsdAtReceipt<
  T extends {
    amount: string;
    blockTime: Date;
    usdAtReceipt?: string | null;
    usdEstimated?: boolean;
  },
>(rows: T[], quoteMint: string) {
  const times = rows.map((r) => r.blockTime.getTime());
  const lo = new Date(Math.min(...times) - 2 * 3600_000);
  const hi = new Date(Math.max(...times) + 2 * 3600_000);
  const snaps = await db()
    .select({ ts: schema.priceSnapshots.ts, usd: schema.priceSnapshots.usd })
    .from(schema.priceSnapshots)
    .where(
      and(
        eq(schema.priceSnapshots.mint, quoteMint),
        sql`${schema.priceSnapshots.ts} between ${lo} and ${hi}`
      )
    );
  if (snaps.length === 0) return;
  for (const r of rows) {
    let best: { dt: number; usd: string } | null = null;
    for (const s of snaps) {
      const dt = Math.abs(s.ts.getTime() - r.blockTime.getTime());
      if (dt <= 2 * 3600_000 && (!best || dt < best.dt))
        best = { dt, usd: s.usd };
    }
    if (best) {
      r.usdAtReceipt = (Number(best.usd) * Number(r.amount)).toString();
      r.usdEstimated = false;
    }
  }
}
