/**
 * One DRIP keeper run for one delegation (PRD F2, section 7 keeper design):
 *   1. transfer the sweep amount from the holder's quote account to the
 *      keeper's quote ATA, signed by the keeper as delegate      -> transferSig
 *   2. Jupiter Ultra swap quote -> target, taker = keeper       -> swapSig
 *   3. send 99% of the output to the holder's target ATA,
 *      keep 1% as the DRIP fee                                   -> returnSig
 * The drip_runs row is written before step 1 is sent and moves through a
 * state machine (plan.ts, settle.ts), so an interrupted run is finished by
 * the next pass: quote tokens are refunded only if no swap landed, and a
 * landed swap is always returned.
 */
import type { KeyPairSigner } from "@solana/kit";
import { and, eq, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { keeperConnection, keeperSigner } from "./keeper";
import {
  TERMINAL,
  decideSweep,
  rawToDecimal,
  rawToUi,
  runStatus,
  type RunStatus,
} from "./plan";
import {
  settleRun,
  signTransferIn,
  type Run,
  type RunAccounts,
  type SettleCtx,
} from "./settle";
import { findTarget } from "./targets";
import { UltraClient } from "./ultra";
import { readTokenAccount } from "./verify";

type Delegation = typeof schema.dripDelegations.$inferSelect;

export type RunResult =
  | { status: "skipped"; reason: string; pendingUsd?: number }
  | {
      status: "swept";
      runId: number;
      transferSig: string;
      swapSig: string;
      returnSig: string;
      inUi: number;
      outUi: number;
    }
  | {
      status: "refunded";
      runId: number;
      transferSig: string;
      returnSig: string;
      error: string;
    }
  | {
      status: "unfinished";
      runId: number;
      runStatus: RunStatus;
      note: string;
    }
  | { status: "failed"; error: string; runId?: number };

/**
 * SQL filter for runs whose input counts as swept: everything except a
 * refund or a transfer that never landed. Matches countsAsSwept in plan.ts;
 * rows from before the state machine have a null status.
 */
export const sweptRunsFilter = sql`coalesce(${schema.dripRuns.status},
  case when ${schema.dripRuns.swapSig} is null and ${schema.dripRuns.returnSig} is not null
       then 'refunded' else 'done' end) not in ('refunded', 'void')`;

const LEASE = sql`now() + interval '15 minutes'`;

/** Claim a delegation for this pass; false when another pass holds it. */
async function claim(del: Delegation) {
  const rows = await db()
    .update(schema.dripDelegations)
    .set({ lockedUntil: LEASE })
    .where(
      and(
        eq(schema.dripDelegations.wallet, del.wallet),
        eq(schema.dripDelegations.quoteMint, del.quoteMint),
        or(
          isNull(schema.dripDelegations.lockedUntil),
          lt(schema.dripDelegations.lockedUntil, sql`now()`)
        )
      )
    )
    .returning({ wallet: schema.dripDelegations.wallet });
  return rows.length > 0;
}

async function release(del: Delegation) {
  await db()
    .update(schema.dripDelegations)
    .set({ lockedUntil: null })
    .where(
      and(
        eq(schema.dripDelegations.wallet, del.wallet),
        eq(schema.dripDelegations.quoteMint, del.quoteMint)
      )
    );
}

function toResult(run: Run, note?: string): RunResult {
  const s = runStatus(run);
  if (s === "done")
    return {
      status: "swept",
      runId: run.id,
      transferSig: run.transferSig!,
      swapSig: run.swapSig!,
      returnSig: run.returnSig!,
      inUi: Number(run.inAmount),
      outUi: Number(run.outAmount),
    };
  if (s === "refunded")
    return {
      status: "refunded",
      runId: run.id,
      transferSig: run.transferSig!,
      returnSig: run.returnSig!,
      error: note ?? "swap did not land",
    };
  if (s === "void")
    return { status: "failed", runId: run.id, error: "transfer did not land" };
  return {
    status: "unfinished",
    runId: run.id,
    runStatus: s,
    note: note ?? "waiting for chain",
  };
}

export async function runDelegation(
  del: Delegation,
  deps: {
    keeper?: KeyPairSigner;
    ultra?: UltraClient;
    conn?: ReturnType<typeof keeperConnection>;
    now?: Date;
  } = {}
): Promise<RunResult> {
  if (!(await claim(del)))
    return { status: "skipped", reason: "another keeper pass holds it" };
  try {
    return await runClaimed(del, deps);
  } finally {
    await release(del);
  }
}

async function runClaimed(
  del: Delegation,
  deps: {
    keeper?: KeyPairSigner;
    ultra?: UltraClient;
    conn?: ReturnType<typeof keeperConnection>;
    now?: Date;
  }
): Promise<RunResult> {
  const d = db();
  const ctx: SettleCtx = {
    keeper: deps.keeper ?? (await keeperSigner()),
    conn: deps.conn ?? keeperConnection(),
    ultra: deps.ultra ?? new UltraClient(),
  };
  const keeper = ctx.keeper;

  const [coin] = await d
    .select()
    .from(schema.coins)
    .where(eq(schema.coins.id, del.coinId))
    .limit(1);
  if (!coin) return { status: "skipped", reason: "coin missing" };
  const target = findTarget(del.targetMint);
  if (!target) return { status: "skipped", reason: "unsupported target" };
  if (del.targetMint === del.quoteMint)
    return { status: "skipped", reason: "target equals quote" };
  const decimals = coin.quoteDecimals;
  if (decimals == null)
    return { status: "skipped", reason: "quote decimals unknown" };
  const acct: RunAccounts = {
    holder: del.wallet,
    quoteMint: del.quoteMint,
    quoteProgram: del.quoteProgram,
    quoteDecimals: decimals,
    quoteTokenAccount: del.quoteTokenAccount,
  };

  // Finish any run an earlier pass left mid-way before starting a new one.
  const open = await d
    .select()
    .from(schema.dripRuns)
    .where(
      and(
        eq(schema.dripRuns.wallet, del.wallet),
        eq(schema.dripRuns.coinId, del.coinId),
        inArray(schema.dripRuns.status, [
          "transferring",
          "transferred",
          "swapping",
          "swapped",
          "returning",
          "refunding",
        ])
      )
    );
  for (const r of open) {
    const res = await settleRun(r, acct, ctx, { allowSwap: false });
    if (!TERMINAL.has(runStatus(res.run))) return toResult(res.run, res.note);
  }

  const markRevoked = () =>
    d
      .update(schema.dripDelegations)
      .set({ revokedSig: del.revokedSig ?? "revoked-on-chain" })
      .where(
        and(
          eq(schema.dripDelegations.wallet, del.wallet),
          eq(schema.dripDelegations.quoteMint, del.quoteMint)
        )
      );

  // on-chain state of the holder's quote account
  let state;
  try {
    state = await readTokenAccount(
      ctx.conn.rpc,
      del.quoteTokenAccount,
      del.quoteProgram
    );
  } catch (err) {
    const msg = (err as Error).message ?? "";
    if (/not found|could not find|does not exist/i.test(msg)) {
      await markRevoked();
      return { status: "skipped", reason: "quote account closed" };
    }
    throw err;
  }
  if (state.delegate !== keeper.address || state.delegatedAmountRaw <= 0n) {
    await markRevoked();
    return { status: "skipped", reason: "delegation not present on chain" };
  }

  // pending = payouts since delegation - already swept
  const [since] = await d
    .select({
      amount: sql<string>`coalesce(sum(${schema.payouts.amount}), 0)::text`,
    })
    .from(schema.payouts)
    .where(
      and(
        eq(schema.payouts.wallet, del.wallet),
        eq(schema.payouts.coinId, del.coinId),
        gte(schema.payouts.blockTime, del.createdAt)
      )
    );
  const [swept] = await d
    .select({
      amount: sql<string>`coalesce(sum(${schema.dripRuns.inAmount}), 0)::text`,
    })
    .from(schema.dripRuns)
    .where(
      and(
        eq(schema.dripRuns.wallet, del.wallet),
        eq(schema.dripRuns.coinId, del.coinId),
        sweptRunsFilter
      )
    );
  const [price] = await d
    .select({ usd: schema.priceSnapshots.usd })
    .from(schema.priceSnapshots)
    .where(eq(schema.priceSnapshots.mint, del.quoteMint))
    .orderBy(sql`${schema.priceSnapshots.ts} desc`)
    .limit(1);
  if (!price) return { status: "skipped", reason: "no quote price" };

  const toRaw = (ui: string) => BigInt(Math.round(Number(ui) * 10 ** decimals));
  const decision = decideSweep({
    payoutsSinceRaw: toRaw(since.amount),
    sweptRaw: toRaw(swept.amount),
    delegatedRaw: state.delegatedAmountRaw,
    balanceRaw: state.amountRaw,
    quoteUsd: Number(price.usd),
    quoteDecimals: decimals,
    thresholdUsd: Number(del.thresholdUsd),
  });
  if (!decision.sweep)
    return {
      status: "skipped",
      reason: decision.reason,
      pendingUsd: decision.usd,
    };

  // 1. sign the pull, record it, then send it
  const transfer = await signTransferIn(acct, decision.amountRaw, ctx);
  const [row] = await d
    .insert(schema.dripRuns)
    .values({
      wallet: del.wallet,
      coinId: del.coinId,
      inAmount: rawToDecimal(decision.amountRaw, decimals),
      outMint: del.targetMint,
      transferSig: transfer.sig,
      status: "transferring",
      statusAt: new Date(),
      ts: deps.now ?? new Date(),
    })
    .returning();
  try {
    await ctx.conn.sendAndConfirm(transfer.signed, { commitment: "confirmed" });
  } catch {
    // settleRun reads the outcome from chain
  }

  // 2 + 3
  const res = await settleRun(row, acct, ctx, { allowSwap: true });
  const out = toResult(res.run, res.note);
  if (out.status === "swept") out.inUi = rawToUi(decision.amountRaw, decimals);
  return out;
}
