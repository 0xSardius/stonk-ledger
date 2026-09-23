import { NextResponse } from "next/server";
import { desc, eq, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { runStatus } from "@/lib/drip/plan";
import { DRIP_TARGETS, DEFAULT_THRESHOLD_USD } from "@/lib/drip/targets";
import { displaySymbol, truncateAddress } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * GET /api/drip/public
 * What anyone can see about Stock DRIP without connecting a wallet: the
 * targets, the latest keeper runs with their proof signatures, and counts.
 * Everything here is already public on chain.
 */
export async function GET() {
  const d = db();
  const [rows, [counts]] = await Promise.all([
    d
      .select({
        run: schema.dripRuns,
        quoteSymbol: schema.coins.quoteSymbol,
        quoteCategory: schema.coins.quoteCategory,
        coinSymbol: schema.coins.symbol,
      })
      .from(schema.dripRuns)
      .leftJoin(schema.coins, eq(schema.coins.id, schema.dripRuns.coinId))
      .orderBy(desc(schema.dripRuns.ts))
      .limit(20),
    d
      .select({
        active: sql<number>`(select count(*)::int from ${schema.dripDelegations}
          where ${isNull(schema.dripDelegations.revokedSig)})`,
        holders: sql<number>`(select count(distinct wallet)::int from ${schema.dripRuns})`,
        // same status rule as runStatus() in lib/drip/plan.ts
        done: sql<number>`(select count(*)::int from ${schema.dripRuns}
          where coalesce(status, case when swap_sig is null and return_sig is not null
            then 'refunded' else 'done' end) = 'done')`,
      })
      .from(sql`(select 1) as one`),
  ]);

  const runs = rows
    .map((r) => ({ ...r, status: runStatus(r.run) }))
    .filter((r) => r.status !== "void")
    .slice(0, 10)
    .map(({ run, status, quoteSymbol, quoteCategory, coinSymbol }) => {
      const target = DRIP_TARGETS.find((t) => t.mint === run.outMint);
      return {
        id: run.id,
        ts: run.ts,
        wallet: run.wallet,
        walletShort: truncateAddress(run.wallet),
        coinSymbol: coinSymbol ?? "?",
        quoteSymbol: quoteSymbol
          ? displaySymbol(quoteSymbol, quoteCategory)
          : "?",
        inAmount: Number(run.inAmount),
        targetSymbol: target?.symbol ?? truncateAddress(run.outMint),
        outAmount: run.outAmount != null ? Number(run.outAmount) : null,
        status,
        transferSig: run.transferSig,
        swapSig: run.swapSig,
        returnSig: run.returnSig,
      };
    });

  return NextResponse.json({
    targets: DRIP_TARGETS,
    defaultThresholdUsd: DEFAULT_THRESHOLD_USD,
    counts: {
      activeDelegations: counts?.active ?? 0,
      completedRuns: counts?.done ?? 0,
      holders: counts?.holders ?? 0,
    },
    runs,
  });
}
