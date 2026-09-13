import { NextResponse } from "next/server";
import { and, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { HeliusClient } from "@/lib/helius/client";
import { heldActiveCoins } from "@/lib/jobs/held-coins";
import { keeperSigner } from "@/lib/drip/keeper";
import { DRIP_TARGETS, DEFAULT_THRESHOLD_USD } from "@/lib/drip/targets";

export const dynamic = "force-dynamic";

/**
 * GET /api/drip/status?wallet=<address>
 * What a wallet can DRIP: every reward coin it holds whose quote token account
 * exists, with balance, 7-day payouts, and any active delegation.
 */
export async function GET(req: Request) {
  const wallet = new URL(req.url).searchParams.get("wallet")?.trim();
  if (!wallet)
    return NextResponse.json({ error: "wallet required" }, { status: 400 });

  const d = db();
  const helius = new HeliusClient();
  const keeper = (await keeperSigner()).address;

  const holdings = await helius.tokenAccounts(wallet);
  const coins = await heldActiveCoins(holdings.map((h) => h.mint));

  const since = new Date(Date.now() - 7 * 86400_000);
  const payouts7d =
    coins.length === 0
      ? []
      : await d
          .select({
            coinId: schema.payouts.coinId,
            amount: sql<string>`sum(${schema.payouts.amount})::text`,
            n: sql<number>`count(*)::int`,
          })
          .from(schema.payouts)
          .where(
            and(
              eq(schema.payouts.wallet, wallet),
              inArray(
                schema.payouts.coinId,
                coins.map((c) => c.id)
              ),
              gte(schema.payouts.blockTime, since)
            )
          )
          .groupBy(schema.payouts.coinId);
  const p7 = new Map(payouts7d.map((p) => [p.coinId, p]));

  const delegations = await d
    .select()
    .from(schema.dripDelegations)
    .where(
      and(
        eq(schema.dripDelegations.wallet, wallet),
        isNull(schema.dripDelegations.revokedSig)
      )
    );

  const candidates = coins.flatMap((c) => {
    const qa = holdings.find((h) => h.mint === c.quoteMint);
    if (!qa) return [];
    const coinHolding = holdings.find((h) => h.mint === c.mint);
    const del = delegations.find((x) => x.quoteMint === c.quoteMint) ?? null;
    return [
      {
        coinId: c.id,
        symbol: c.symbol,
        name: c.name,
        imageUrl: c.imageUrl,
        coinBalance: coinHolding
          ? Number(coinHolding.amountRaw) / 10 ** coinHolding.decimals
          : 0,
        quoteMint: c.quoteMint,
        quoteSymbol: c.quoteSymbol,
        quoteDecimals: qa.decimals,
        quoteProgram: qa.program,
        quoteTokenAccount: qa.tokenAccount,
        quoteBalanceRaw: qa.amountRaw.toString(),
        payouts7d: p7.get(c.id)?.amount ?? "0",
        payouts7dCount: p7.get(c.id)?.n ?? 0,
        delegation: del
          ? {
              targetMint: del.targetMint,
              capRaw: del.capRaw.toString(),
              thresholdUsd: del.thresholdUsd,
              approvedSig: del.approvedSig,
              createdAt: del.createdAt,
            }
          : null,
      },
    ];
  });

  return NextResponse.json({
    wallet,
    keeper,
    targets: DRIP_TARGETS,
    defaultThresholdUsd: DEFAULT_THRESHOLD_USD,
    candidates,
  });
}
