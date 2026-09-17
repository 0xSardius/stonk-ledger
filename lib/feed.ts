/**
 * Proof feed per coin (PRD F3): the latest distributor batches for a coin,
 * each with a Solscan link, plus the coin's totals. Reads the database only;
 * batches arrive through the Helius webhook.
 */
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db, schema } from "./db";
import { displaySymbol } from "./format";
import { JupiterPriceClient, currentMultiplier } from "./prices/jupiter";

export type Batch = {
  sig: string;
  blockTime: Date;
  recipients: number;
  amount: number;
  usdAtReceipt: number | null;
};

export type CoinFeed = {
  coin: {
    id: number;
    symbol: string;
    name: string | null;
    mint: string;
    imageUrl: string | null;
    quoteSymbol: string;
    quoteMint: string;
    quoteCategory: string;
    feeBps: number | null;
    marketCapUsd: number | null;
    volume24hUsd: number | null;
    distributorSigners: string[];
  };
  quoteUsd: number | null;
  multiplier: number;
  totals: {
    batches: number;
    payouts: number;
    amount: number;
    firstSeen: Date | null;
    lastSeen: Date | null;
    batches24h: number;
    amount24h: number;
    recipients24h: number;
  };
  snapshot: {
    distributedTokens: number | null;
    payoutCount: number | null;
    holderCount: number | null;
    ts: Date;
  } | null;
  batches: Batch[];
};

export async function getCoinFeed(
  mint: string,
  limit = 50
): Promise<CoinFeed | null> {
  const d = db();
  const [c] = await d
    .select()
    .from(schema.coins)
    .where(eq(schema.coins.mint, mint))
    .limit(1);
  if (!c) return null;

  const since24h = new Date(Date.now() - 86400_000);
  const pb = schema.payoutBatches;
  const [agg] = await d
    .select({
      batches: sql<number>`count(*)::int`,
      payouts: sql<number>`coalesce(sum(${pb.recipients}),0)::int`,
      amount: sql<string>`coalesce(sum(${pb.amount}),0)::text`,
      first: sql<Date | null>`min(${pb.blockTime})`,
      last: sql<Date | null>`max(${pb.blockTime})`,
    })
    .from(pb)
    .where(eq(pb.coinId, c.id));
  // batches older than the retention window live in payout_daily
  const pd = schema.payoutDaily;
  const [rolled] = await d
    .select({
      batches: sql<number>`coalesce(sum(${pd.batches}),0)::int`,
      payouts: sql<number>`coalesce(sum(${pd.recipients}),0)::int`,
      amount: sql<string>`coalesce(sum(${pd.amount}),0)::text`,
      first: sql<string | null>`min(${pd.day})::text`,
    })
    .from(pd)
    .where(eq(pd.coinId, c.id));
  const [agg24] = await d
    .select({
      batches: sql<number>`count(*)::int`,
      amount: sql<string>`coalesce(sum(${pb.amount}),0)::text`,
      recipients: sql<number>`coalesce(sum(${pb.recipients}),0)::int`,
    })
    .from(pb)
    .where(and(eq(pb.coinId, c.id), gte(pb.blockTime, since24h)));

  const batches = await d
    .select({
      sig: pb.sig,
      blockTime: pb.blockTime,
      recipients: pb.recipients,
      amount: sql<string>`${pb.amount}::text`,
      usd: sql<string | null>`${pb.usdAtReceipt}::text`,
    })
    .from(pb)
    .where(eq(pb.coinId, c.id))
    .orderBy(desc(pb.blockTime))
    .limit(limit);

  const [snap] = await d
    .select()
    .from(schema.rewardSnapshots)
    .where(eq(schema.rewardSnapshots.coinId, c.id))
    .orderBy(desc(schema.rewardSnapshots.ts))
    .limit(1);

  let quoteUsd: number | null = null;
  let multiplier = 1;
  try {
    const p = (await new JupiterPriceClient().prices([c.quoteMint]))[
      c.quoteMint
    ];
    if (p) {
      quoteUsd = p.usdPrice;
      multiplier = currentMultiplier(p);
    }
  } catch {
    /* price stays null */
  }

  return {
    coin: {
      id: c.id,
      symbol: c.symbol,
      name: c.name,
      mint: c.mint,
      imageUrl: c.imageUrl,
      quoteSymbol: displaySymbol(c.quoteSymbol, c.quoteCategory),
      quoteMint: c.quoteMint,
      quoteCategory: c.quoteCategory,
      feeBps: c.feeBps,
      marketCapUsd: c.marketCapUsd != null ? Number(c.marketCapUsd) : null,
      volume24hUsd: c.volume24hUsd != null ? Number(c.volume24hUsd) : null,
      distributorSigners: c.distributorSigners,
    },
    quoteUsd,
    multiplier,
    totals: {
      batches: agg.batches + rolled.batches,
      payouts: agg.payouts + rolled.payouts,
      amount: Number(agg.amount) + Number(rolled.amount),
      firstSeen: rolled.first
        ? new Date(rolled.first)
        : agg.first
          ? new Date(agg.first)
          : null,
      lastSeen: agg.last ? new Date(agg.last) : null,
      batches24h: agg24.batches,
      amount24h: Number(agg24.amount),
      recipients24h: agg24.recipients,
    },
    snapshot: snap
      ? {
          distributedTokens:
            snap.distributedTokens != null
              ? Number(snap.distributedTokens)
              : null,
          payoutCount: snap.payoutCount,
          holderCount: snap.holderCount,
          ts: snap.ts,
        }
      : null,
    batches: batches.map((b) => ({
      sig: b.sig,
      blockTime: new Date(b.blockTime),
      recipients: b.recipients,
      amount: Number(b.amount),
      usdAtReceipt: b.usd != null ? Number(b.usd) : null,
    })),
  };
}

export type CoinListRow = {
  mint: string;
  symbol: string;
  name: string | null;
  quoteSymbol: string;
  quoteCategory: string;
  marketCapUsd: number | null;
  volume24hUsd: number | null;
  payoutsStored: number;
  lastPayout: Date | null;
};

export const STOCK_CATEGORIES = ["xstock", "backpack", "prestock"] as const;

/** Active coins by 24h volume with how many payouts we hold for each. */
export async function listCoins(
  limit = 40,
  categories?: readonly string[]
): Promise<CoinListRow[]> {
  const d = db();
  const rows = await d
    .select({
      mint: schema.coins.mint,
      symbol: schema.coins.symbol,
      name: schema.coins.name,
      quoteSymbol: schema.coins.quoteSymbol,
      quoteCategory: schema.coins.quoteCategory,
      marketCapUsd: schema.coins.marketCapUsd,
      volume24hUsd: schema.coins.volume24hUsd,
      payoutsStored: sql<number>`(select coalesce(sum(recipients),0)::int from payout_batches b where b.coin_id = ${schema.coins.id}) + (select coalesce(sum(recipients),0)::int from payout_daily r where r.coin_id = ${schema.coins.id})`,
      lastPayout: sql<Date | null>`(select max(block_time) from payout_batches b where b.coin_id = ${schema.coins.id})`,
    })
    .from(schema.coins)
    .where(
      categories
        ? and(
            eq(schema.coins.active, true),
            inArray(schema.coins.quoteCategory, [...categories])
          )
        : eq(schema.coins.active, true)
    )
    .orderBy(desc(sql`${schema.coins.volume24hUsd}::numeric`))
    .limit(limit);
  return rows.map((r) => ({
    ...r,
    symbol: r.symbol.trim() || `${r.mint.slice(0, 4)}…${r.mint.slice(-4)}`,
    quoteSymbol: displaySymbol(r.quoteSymbol, r.quoteCategory),
    marketCapUsd: r.marketCapUsd != null ? Number(r.marketCapUsd) : null,
    volume24hUsd: r.volume24hUsd != null ? Number(r.volume24hUsd) : null,
    lastPayout: r.lastPayout ? new Date(r.lastPayout) : null,
  }));
}
