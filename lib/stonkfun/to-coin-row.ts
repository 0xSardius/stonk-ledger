import type { StonkFunToken } from "./client";
import type { coins } from "../db/schema";

export type CoinInsert = typeof coins.$inferInsert;

/** Map a StonkFun token to a `coins` row. Pure, so it is unit-testable. */
export function toCoinRow(t: StonkFunToken): CoinInsert {
  return {
    symbol: t.symbol,
    name: t.name,
    mint: t.mint,
    quoteMint: t.quote.mint,
    quoteSymbol: t.quote.symbol,
    quoteCategory: t.quote.category,
    feeBps: t.transferFee?.bps ?? null,
    imageUrl: t.imageUrl ?? null,
    marketCapUsd: t.market?.marketCapUsd?.toString() ?? null,
    volume24hUsd: t.market?.volume24hUsd?.toString() ?? null,
    active: t.mode === "reward",
  };
}
