/**
 * Statement data for one wallet (PRD F1). Server-only.
 * Indexes the wallet on first view (or when stale), then aggregates payouts
 * per coin, prices them live, and attaches DRIP delegations and runs.
 */
import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { address as parseAddress } from "@solana/kit";
import { db, schema } from "./db";
import { HeliusClient } from "./helius/client";
import { indexWallet } from "./jobs/index-wallet";
import { JupiterPriceClient, currentMultiplier } from "./prices/jupiter";
import { findTarget } from "./drip/targets";
import { heldActiveCoins } from "./jobs/held-coins";
import { displaySymbol } from "./format";

const STALE_MS = 10 * 60_000;
const ROWS_PER_COIN = 60;

export type PayoutRow = {
  sig: string;
  blockTime: Date;
  amount: number;
  usdAtReceipt: number | null;
  usdEstimated: boolean;
  probable: boolean;
};

export type CoinStatement = {
  coinId: number;
  symbol: string;
  name: string | null;
  imageUrl: string | null;
  mint: string;
  quoteSymbol: string;
  quoteMint: string;
  quoteCategory: string;
  isStock: boolean;
  /** Token-2022 scaled-UI multiplier (1 for plain mints). Shares shown = amount * multiplier. */
  multiplier: number;
  quoteUsd: number | null;
  /** Underlying equity price when the quote is an xStock. */
  stockUsd: number | null;
  totals: {
    amount: number;
    shares: number;
    usdToday: number | null;
    usdAtReceipt: number | null;
    usdAtReceiptCoverage: number;
    count: number;
    first: Date;
    last: Date;
    amount24h: number;
    amount7d: number;
    count7d: number;
    probableCount: number;
  };
  position: { balance: number; usd: number | null } | null;
  drip: {
    targetSymbol: string;
    capRaw: string;
    thresholdUsd: number;
    approvedSig: string | null;
    createdAt: Date;
  } | null;
  payouts: PayoutRow[];
};

export type DripRunRow = {
  id: number;
  coinSymbol: string;
  quoteSymbol: string;
  targetSymbol: string;
  inAmount: number;
  outAmount: number | null;
  feeAmount: number | null;
  transferSig: string | null;
  swapSig: string | null;
  returnSig: string | null;
  ts: Date;
};

export type Statement = {
  wallet: string;
  indexedAt: Date | null;
  indexError: string | null;
  heldRewardCoins: number;
  coins: CoinStatement[];
  runs: DripRunRow[];
  totalUsdToday: number | null;
};

export function isValidAddress(s: string) {
  try {
    parseAddress(s);
    return true;
  } catch {
    return false;
  }
}

export async function getStatement(
  wallet: string,
  opts: { refresh?: boolean } = {}
): Promise<Statement> {
  const d = db();
  const helius = new HeliusClient();

  // 1. index on first view or when stale; never let indexing errors kill the page
  let indexError: string | null = null;
  const [w] = await d
    .select()
    .from(schema.wallets)
    .where(eq(schema.wallets.address, wallet))
    .limit(1);
  const stale =
    !w?.lastIndexedAt || Date.now() - w.lastIndexedAt.getTime() > STALE_MS;
  if (stale && opts.refresh !== false) {
    try {
      await indexWallet(wallet, { helius, maxPages: w ? 1 : 3 });
    } catch (err) {
      indexError = (err as Error).message;
    }
  }

  // 2. holdings (for positions and the empty-state message)
  let holdings: Awaited<ReturnType<HeliusClient["tokenAccounts"]>> = [];
  try {
    holdings = await helius.tokenAccounts(wallet);
  } catch {
    /* positions become unknown */
  }
  const held = await heldActiveCoins(holdings.map((h) => h.mint));

  // 3. coins with payouts for this wallet
  const coinIds = (
    await d
      .selectDistinct({ coinId: schema.payouts.coinId })
      .from(schema.payouts)
      .where(
        and(
          eq(schema.payouts.wallet, wallet),
          sql`${schema.payouts.coinId} is not null`
        )
      )
  ).map((r) => r.coinId!) as number[];
  const coins = coinIds.length
    ? await d
        .select()
        .from(schema.coins)
        .where(inArray(schema.coins.id, coinIds))
    : [];

  // 4. live prices for every quote mint on the page
  const quoteMints = Array.from(new Set(coins.map((c) => c.quoteMint)));
  let prices: Awaited<ReturnType<JupiterPriceClient["prices"]>> = {};
  if (quoteMints.length) {
    try {
      prices = await new JupiterPriceClient().prices(quoteMints);
    } catch {
      /* usdToday becomes null */
    }
  }

  const now = new Date();
  const since24h = new Date(now.getTime() - 86400_000);
  const since7d = new Date(now.getTime() - 7 * 86400_000);

  const delegations = await d
    .select()
    .from(schema.dripDelegations)
    .where(
      and(
        eq(schema.dripDelegations.wallet, wallet),
        isNull(schema.dripDelegations.revokedSig)
      )
    );

  const out: CoinStatement[] = [];
  for (const c of coins) {
    const [agg] = await d
      .select({
        amount: sql<string>`coalesce(sum(${schema.payouts.amount}),0)::text`,
        count: sql<number>`count(*)::int`,
        first: sql<Date>`min(${schema.payouts.blockTime})`,
        last: sql<Date>`max(${schema.payouts.blockTime})`,
        usd: sql<string>`coalesce(sum(${schema.payouts.usdAtReceipt}),0)::text`,
        usdCount: sql<number>`count(${schema.payouts.usdAtReceipt})::int`,
        amountWithUsd: sql<string>`coalesce(sum(case when ${schema.payouts.usdAtReceipt} is not null then ${schema.payouts.amount} else 0 end),0)::text`,
        probable: sql<number>`sum(case when ${schema.payouts.probable} then 1 else 0 end)::int`,
        a24: sql<string>`coalesce(sum(case when ${schema.payouts.blockTime} >= ${since24h} then ${schema.payouts.amount} else 0 end),0)::text`,
        a7: sql<string>`coalesce(sum(case when ${schema.payouts.blockTime} >= ${since7d} then ${schema.payouts.amount} else 0 end),0)::text`,
        c7: sql<number>`sum(case when ${schema.payouts.blockTime} >= ${since7d} then 1 else 0 end)::int`,
      })
      .from(schema.payouts)
      .where(
        and(eq(schema.payouts.wallet, wallet), eq(schema.payouts.coinId, c.id))
      );
    const rows = await d
      .select()
      .from(schema.payouts)
      .where(
        and(eq(schema.payouts.wallet, wallet), eq(schema.payouts.coinId, c.id))
      )
      .orderBy(desc(schema.payouts.blockTime))
      .limit(ROWS_PER_COIN);

    const p = prices[c.quoteMint];
    const multiplier = p ? currentMultiplier(p, now) : 1;
    const quoteUsd = p?.usdPrice ?? null;
    const amount = Number(agg.amount);
    const coinHolding = holdings.find((h) => h.mint === c.mint);
    const coinPrice = c.marketCapUsd ? Number(c.marketCapUsd) / 1e9 : null;
    const balance = coinHolding
      ? Number(coinHolding.amountRaw) / 10 ** coinHolding.decimals
      : 0;
    const del = delegations.find((x) => x.coinId === c.id) ?? null;

    out.push({
      coinId: c.id,
      symbol: c.symbol,
      name: c.name,
      imageUrl: c.imageUrl,
      mint: c.mint,
      quoteSymbol: displaySymbol(c.quoteSymbol, c.quoteCategory),
      quoteMint: c.quoteMint,
      quoteCategory: c.quoteCategory,
      isStock:
        c.quoteCategory === "xstock" ||
        c.quoteCategory === "backpack" ||
        c.quoteCategory === "prestock",
      multiplier,
      quoteUsd,
      stockUsd: p?.stockData?.price ?? null,
      totals: {
        amount,
        shares: amount * multiplier,
        usdToday: quoteUsd != null ? amount * multiplier * quoteUsd : null,
        // recorded value where a price was captured within two hours of the
        // payout, plus today's price for the rest (PRD 8.3: labelled estimated)
        usdAtReceipt: (() => {
          const recorded = Number(agg.usd);
          const missing = amount - Number(agg.amountWithUsd);
          if (quoteUsd != null)
            return recorded + missing * multiplier * quoteUsd;
          return agg.usdCount > 0 ? recorded : null;
        })(),
        usdAtReceiptCoverage: agg.count ? agg.usdCount / agg.count : 0,
        count: agg.count,
        first: new Date(agg.first),
        last: new Date(agg.last),
        amount24h: Number(agg.a24),
        amount7d: Number(agg.a7),
        count7d: agg.c7,
        probableCount: agg.probable,
      },
      position: coinHolding
        ? { balance, usd: coinPrice != null ? balance * coinPrice : null }
        : null,
      drip: del
        ? {
            targetSymbol: findTarget(del.targetMint)?.symbol ?? "?",
            capRaw: del.capRaw.toString(),
            thresholdUsd: Number(del.thresholdUsd),
            approvedSig: del.approvedSig,
            createdAt: del.createdAt,
          }
        : null,
      payouts: rows.map((r) => {
        const recorded = r.usdAtReceipt != null ? Number(r.usdAtReceipt) : null;
        const estimated =
          recorded == null && quoteUsd != null
            ? Number(r.amount) * multiplier * quoteUsd
            : null;
        return {
          sig: r.sig,
          blockTime: r.blockTime,
          amount: Number(r.amount),
          usdAtReceipt: recorded ?? estimated,
          usdEstimated: r.usdEstimated || recorded == null,
          probable: r.probable,
        };
      }),
    });
  }
  out.sort((a, b) => (b.totals.usdToday ?? 0) - (a.totals.usdToday ?? 0));

  const runRows = await d
    .select()
    .from(schema.dripRuns)
    .where(eq(schema.dripRuns.wallet, wallet))
    .orderBy(desc(schema.dripRuns.ts))
    .limit(20);
  const coinById = new Map(coins.map((c) => [c.id, c]));
  const runs: DripRunRow[] = runRows.map((r) => ({
    id: r.id,
    coinSymbol: coinById.get(r.coinId)?.symbol ?? "?",
    quoteSymbol: displaySymbol(
      coinById.get(r.coinId)?.quoteSymbol ?? "?",
      coinById.get(r.coinId)?.quoteCategory
    ),
    targetSymbol: findTarget(r.outMint)?.symbol ?? "?",
    inAmount: Number(r.inAmount),
    outAmount: r.outAmount != null ? Number(r.outAmount) : null,
    feeAmount: r.feeAmount != null ? Number(r.feeAmount) : null,
    transferSig: r.transferSig,
    swapSig: r.swapSig,
    returnSig: r.returnSig,
    ts: r.ts,
  }));

  const usdVals = out
    .map((c) => c.totals.usdToday)
    .filter((v): v is number => v != null);
  const [w2] = await d
    .select({ at: schema.wallets.lastIndexedAt })
    .from(schema.wallets)
    .where(eq(schema.wallets.address, wallet))
    .limit(1);
  return {
    wallet,
    indexedAt: w2?.at ?? null,
    indexError,
    heldRewardCoins: held.length,
    coins: out,
    runs,
    totalUsdToday: usdVals.length ? usdVals.reduce((a, b) => a + b, 0) : null,
  };
}

// keep gte imported for future range queries
void gte;
