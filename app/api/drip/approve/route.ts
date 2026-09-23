import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { signature } from "@solana/kit";
import { db, schema } from "@/lib/db";
import { keeperConnection, keeperSigner } from "@/lib/drip/keeper";
import {
  checkApproval,
  checkApprovalTx,
  readTokenAccount,
  type ApprovalTx,
} from "@/lib/drip/verify";
import { findTarget, DEFAULT_THRESHOLD_USD } from "@/lib/drip/targets";

export const dynamic = "force-dynamic";

const MIN_THRESHOLD_USD = 1;

const Body = z.object({
  wallet: z.string().min(32),
  coinId: z.number().int(),
  quoteMint: z.string().min(32),
  quoteProgram: z.string().min(32),
  quoteTokenAccount: z.string().min(32),
  targetMint: z.string().min(32),
  capRaw: z.string().regex(/^\d+$/),
  approvedSig: z.string().min(64).max(88),
  // below $1 the keeper's three transaction fees outweigh the sweep
  thresholdUsd: z.number().min(MIN_THRESHOLD_USD).max(10_000).optional(),
});

/**
 * POST /api/drip/approve
 * Called after the holder signs ApproveChecked(delegate = keeper, amount = cap).
 * Verifies that the holder signed that approval recently, and that the
 * delegation is live on chain, before recording it.
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

  // the holder must have signed this approval; the delegate alone is public
  let approvalTx: ApprovalTx | null = null;
  for (let i = 0; i < 5 && !approvalTx; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 1_500));
    approvalTx = (await rpc
      .getTransaction(signature(b.approvedSig), {
        commitment: "confirmed",
        encoding: "jsonParsed",
        maxSupportedTransactionVersion: 0,
      })
      .send()) as unknown as ApprovalTx | null;
  }
  const signedCheck = checkApprovalTx(approvalTx, {
    owner: b.wallet,
    tokenAccount: b.quoteTokenAccount,
    mint: b.quoteMint,
    delegate: keeper,
    nowSec: Math.floor(Date.now() / 1000),
  });
  if (!signedCheck.ok)
    return NextResponse.json({ error: signedCheck.reason }, { status: 403 });

  const [existing] = await db()
    .select()
    .from(schema.dripDelegations)
    .where(
      and(
        eq(schema.dripDelegations.wallet, b.wallet),
        eq(schema.dripDelegations.quoteMint, b.quoteMint)
      )
    )
    .limit(1);
  // one approval registers one setting; changing it needs a new signature
  if (
    existing?.approvedSig === b.approvedSig &&
    (existing.targetMint !== b.targetMint ||
      Number(existing.thresholdUsd) !==
        (b.thresholdUsd ?? DEFAULT_THRESHOLD_USD))
  )
    return NextResponse.json(
      { error: "approval already used; approve again to change settings" },
      { status: 409 }
    );

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
      // payouts already pending are still swept; after a revoke it starts
      // over, so payouts from the time DRIP was off are never swept
      set: {
        createdAt: sql`case when ${schema.dripDelegations.revokedSig} is not null
          then now() else ${schema.dripDelegations.createdAt} end`,
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
