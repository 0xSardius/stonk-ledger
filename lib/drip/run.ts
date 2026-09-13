/**
 * One DRIP keeper run for one delegation (PRD F2, section 7 keeper design):
 *   1. transfer the sweep amount from the holder's quote account to the
 *      keeper's quote ATA, signed by the keeper as delegate      -> transferSig
 *   2. Jupiter Ultra swap quote -> target, taker = keeper       -> swapSig
 *   3. send 99% of the output to the holder's target ATA,
 *      keep 1% as the DRIP fee                                   -> returnSig
 * Every run writes a drip_runs row. If step 2 or 3 fails after step 1, the
 * keeper returns the quote tokens to the holder and records the refund in
 * return_sig with swap_sig null, so nothing stays on the keeper.
 */
import {
  address,
  appendTransactionMessageInstructions,
  assertIsTransactionWithBlockhashLifetime,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  getBase64Encoder,
  getSignatureFromTransaction,
  getTransactionDecoder,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransaction,
  signTransactionMessageWithSigners,
  type Address,
  type Instruction,
  type KeyPairSigner,
} from "@solana/kit";
import * as spl from "@solana-program/token";
import * as t22 from "@solana-program/token-2022";
import { and, eq, gte, isNotNull, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { TOKEN_2022_PROGRAM } from "../helius/client";
import { keeperConnection, keeperSigner } from "./keeper";
import { decideSweep, rawToUi, splitFee } from "./plan";
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
  | { status: "failed"; error: string; transferSig?: string };

function programFor(programId: string) {
  return programId === TOKEN_2022_PROGRAM ? t22 : spl;
}

async function ata(owner: Address, mint: Address, tokenProgram: Address) {
  const [pda] = await spl.findAssociatedTokenPda({ owner, mint, tokenProgram });
  return pda;
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
  const d = db();
  const keeper = deps.keeper ?? (await keeperSigner());
  const conn = deps.conn ?? keeperConnection();
  const ultra = deps.ultra ?? new UltraClient();

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

  // on-chain state of the holder's quote account
  const state = await readTokenAccount(
    conn.rpc,
    del.quoteTokenAccount,
    del.quoteProgram
  );
  if (state.delegate !== keeper.address || state.delegatedAmountRaw <= 0n) {
    await d
      .update(schema.dripDelegations)
      .set({ revokedSig: del.revokedSig ?? "revoked-on-chain" })
      .where(
        and(
          eq(schema.dripDelegations.wallet, del.wallet),
          eq(schema.dripDelegations.quoteMint, del.quoteMint)
        )
      );
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
        isNotNull(schema.dripRuns.swapSig)
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

  const amountRaw = decision.amountRaw;
  const quoteMint = address(del.quoteMint);
  const quoteProgram = address(del.quoteProgram);
  const targetMint = address(del.targetMint);
  const targetProgram = address(TOKEN_2022_PROGRAM);
  const holder = address(del.wallet);
  const qp = programFor(del.quoteProgram);

  const keeperQuoteAta = await ata(keeper.address, quoteMint, quoteProgram);
  const keeperTargetAta = await ata(keeper.address, targetMint, targetProgram);
  const holderTargetAta = await ata(holder, targetMint, targetProgram);

  async function sendIxs(ixs: Instruction[]) {
    const { value: blockhash } = await conn.rpc
      .getLatestBlockhash({ commitment: "confirmed" })
      .send();
    const msg = pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayerSigner(keeper, m),
      (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
      (m) => appendTransactionMessageInstructions(ixs, m)
    );
    const signed = await signTransactionMessageWithSigners(msg);
    assertIsTransactionWithBlockhashLifetime(signed);
    await conn.sendAndConfirm(signed, { commitment: "confirmed" });
    return getSignatureFromTransaction(signed);
  }

  // 1. pull the sweep amount into the keeper's quote ATA (delegate authority)
  let transferSig: string;
  try {
    transferSig = await sendIxs([
      qp.getCreateAssociatedTokenIdempotentInstruction({
        payer: keeper,
        owner: keeper.address,
        mint: quoteMint,
        ata: keeperQuoteAta,
        tokenProgram: quoteProgram,
      }),
      qp.getTransferCheckedInstruction({
        source: address(del.quoteTokenAccount),
        mint: quoteMint,
        destination: keeperQuoteAta,
        authority: keeper,
        amount: amountRaw,
        decimals,
      }),
    ]);
  } catch (err) {
    return { status: "failed", error: `transfer: ${(err as Error).message}` };
  }

  // 2 + 3, with refund on failure
  try {
    const order = await ultra.order({
      inputMint: del.quoteMint,
      outputMint: del.targetMint,
      amount: amountRaw,
      taker: keeper.address,
    });
    if (!order.transaction) throw new Error("Ultra returned no transaction");
    const tx = getTransactionDecoder().decode(
      getBase64Encoder().encode(order.transaction)
    );
    const signedTx = await signTransaction([keeper.keyPair], tx);
    const exec = await ultra.execute(
      getBase64EncodedWireTransaction(signedTx),
      order.requestId
    );
    const swapSig = exec.signature!;
    const outRaw = BigInt(exec.outputAmountResult ?? order.outAmount);
    const { toHolderRaw, feeRaw } = splitFee(outRaw);

    const returnSig = await sendIxs([
      t22.getCreateAssociatedTokenIdempotentInstruction({
        payer: keeper,
        owner: holder,
        mint: targetMint,
        ata: holderTargetAta,
        tokenProgram: targetProgram,
      }),
      t22.getTransferCheckedInstruction({
        source: keeperTargetAta,
        mint: targetMint,
        destination: holderTargetAta,
        authority: keeper,
        amount: toHolderRaw,
        decimals: target.decimals,
      }),
    ]);

    const [row] = await d
      .insert(schema.dripRuns)
      .values({
        wallet: del.wallet,
        coinId: del.coinId,
        inAmount: rawToUi(amountRaw, decimals).toString(),
        outMint: del.targetMint,
        outAmount: rawToUi(toHolderRaw, target.decimals).toString(),
        feeAmount: rawToUi(feeRaw, target.decimals).toString(),
        transferSig,
        swapSig,
        returnSig,
        ts: deps.now ?? new Date(),
      })
      .returning({ id: schema.dripRuns.id });
    return {
      status: "swept",
      runId: row.id,
      transferSig,
      swapSig,
      returnSig,
      inUi: rawToUi(amountRaw, decimals),
      outUi: rawToUi(toHolderRaw, target.decimals),
    };
  } catch (err) {
    // refund: send the quote tokens straight back to the holder's account
    const error = (err as Error).message;
    try {
      const refundSig = await sendIxs([
        qp.getTransferCheckedInstruction({
          source: keeperQuoteAta,
          mint: quoteMint,
          destination: address(del.quoteTokenAccount),
          authority: keeper,
          amount: amountRaw,
          decimals,
        }),
      ]);
      const [row] = await d
        .insert(schema.dripRuns)
        .values({
          wallet: del.wallet,
          coinId: del.coinId,
          inAmount: rawToUi(amountRaw, decimals).toString(),
          outMint: del.targetMint,
          outAmount: null,
          feeAmount: null,
          transferSig,
          swapSig: null,
          returnSig: refundSig,
          ts: deps.now ?? new Date(),
        })
        .returning({ id: schema.dripRuns.id });
      return {
        status: "refunded",
        runId: row.id,
        transferSig,
        returnSig: refundSig,
        error,
      };
    } catch (refundErr) {
      return {
        status: "failed",
        transferSig,
        error: `${error}; refund also failed: ${(refundErr as Error).message}`,
      };
    }
  }
}
