import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { keeperConnection, keeperSigner } from "@/lib/drip/keeper";
import { checkApproval, readTokenAccount } from "@/lib/drip/verify";
import { findTarget, DEFAULT_THRESHOLD_USD } from "@/lib/drip/targets";

export const dynamic = "force-dynamic";

const Body = z.object({
  wallet: z.string().min(32),
  coinId: z.number().int(),
  quoteMint: z.string().min(32),
  quoteProgram: z.string().min(32),
  quoteTokenAccount: z.string().min(32),
  targetMint: z.string().min(32),
  capRaw: z.string().regex(/^\d+$/),
  approvedSig: z.string().min(32),
  thresholdUsd: z.number().positive().optional(),
});

/**
 * POST /api/drip/approve
 * Called after the holder signs ApproveChecked(delegate = keeper, amount = cap).
 * Verifies the delegation on chain before recording it.
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const b = parsed.data;
  if (!findTarget(b.targetMint)) {
    return NextResponse.json({ error: "unsupported target" }, { status: 400 });
  }
  const [coin] = await db()
    .select()
    .from(schema.coins)
    .where(eq(schema.coins.id, b.coinId))
    .limit(1);
  if (!coin || coin.quoteMint !== b.quoteMint) {
    return NextResponse.json({ error: "coin/quote mismatch" }, { status: 400 });
  }

  const keeper = (await keeperSigner()).address;
  const { rpc } = keeperConnection();
  const state = await readTokenAccount(
    rpc,
    b.quoteTokenAccount,
    b.quoteProgram
  );
  const check = checkApproval(state, {
    owner: b.wallet,
    mint: b.quoteMint,
    delegate: keeper,
    minCapRaw: BigInt(b.capRaw),
  });
  if (!check.ok)
    return NextResponse.json({ error: check.reason }, { status: 409 });

  // a delegated wallet is tracked: the webhook stores its payout rows from now on
  await db()
    .insert(schema.wallets)
    .values({ address: b.wallet })
    .onConflictDoNothing();

  const row = {
    wallet: b.wallet,
    coinId: b.coinId,
    quoteMint: b.quoteMint,
    quoteProgram: b.quoteProgram,
    quoteTokenAccount: b.quoteTokenAccount,
    targetMint: b.targetMint,
    capRaw: BigInt(b.capRaw),
    approvedSig: b.approvedSig,
    revokedSig: null,
    thresholdUsd: String(b.thresholdUsd ?? DEFAULT_THRESHOLD_USD),
    createdAt: new Date(),
  };
  await db()
    .insert(schema.dripDelegations)
    .values(row)
    .onConflictDoUpdate({
      target: [schema.dripDelegations.wallet, schema.dripDelegations.quoteMint],
      // re-approval (cap top-up or new target) keeps the original start, so
      // payouts already pending are still swept
      set: {
        coinId: row.coinId,
        quoteProgram: row.quoteProgram,
        quoteTokenAccount: row.quoteTokenAccount,
        targetMint: row.targetMint,
        capRaw: row.capRaw,
        approvedSig: row.approvedSig,
        revokedSig: null,
        thresholdUsd: row.thresholdUsd,
      },
    });
  return NextResponse.json({
    ok: true,
    keeper,
    delegatedAmountRaw: check.delegatedAmountRaw.toString(),
  });
}
