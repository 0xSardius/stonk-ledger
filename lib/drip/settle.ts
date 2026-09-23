/**
 * Drive one drip_runs row from whatever state it is in to a terminal state
 * (done, refunded, void), or stop when chain has not yet answered. Used by a
 * fresh run right after its transfer is signed, and by every keeper pass for
 * rows an earlier pass left mid-way. The state machine is in plan.ts.
 *
 * Rules that keep funds safe:
 * - Every transaction's signature is written before the transaction is sent.
 * - A step moves on only when chain confirms its outcome. "Not found yet"
 *   waits; "not found and older than any blockhash" counts as never landed.
 * - Quote tokens are refunded only when no swap landed. Once a swap lands,
 *   the only way forward is returning its output to the holder.
 * - The output returned is read from the swap transaction on chain, not from
 *   Jupiter's response, so pooled fees on the keeper are never paid out.
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
  signature,
  type Address,
  type Instruction,
  type KeyPairSigner,
} from "@solana/kit";
import * as spl from "@solana-program/token";
import * as t22 from "@solana-program/token-2022";
import { eq } from "drizzle-orm";
import { db, schema } from "../db";
import { TOKEN_2022_PROGRAM } from "../helius/client";
import type { keeperConnection } from "./keeper";
import {
  TERMINAL,
  TX_EXPIRY_MS,
  balanceDelta,
  checkOrder,
  decimalToRaw,
  rawToDecimal,
  runStatus,
  splitFee,
  type RunStatus,
} from "./plan";
import { findTarget } from "./targets";
import type { UltraClient } from "./ultra";

export type Run = typeof schema.dripRuns.$inferSelect;

export type SettleCtx = {
  keeper: KeyPairSigner;
  conn: ReturnType<typeof keeperConnection>;
  ultra: UltraClient;
  now?: () => Date;
  /** How long to wait for chain to answer before leaving a row for the next pass. */
  waitMs?: number;
};

/** Where the run's tokens come from and go back to. */
export type RunAccounts = {
  holder: string;
  quoteMint: string;
  quoteProgram: string;
  quoteDecimals: number;
  /** Holder's quote token account: the refund destination. */
  quoteTokenAccount: string;
};

export type SettleResult = { run: Run; note?: string };

type Outcome = "landed" | "failed" | "expired" | "pending";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function programFor(programId: string) {
  return programId === TOKEN_2022_PROGRAM ? t22 : spl;
}

async function ata(owner: Address, mint: Address, tokenProgram: Address) {
  const [pda] = await spl.findAssociatedTokenPda({ owner, mint, tokenProgram });
  return pda;
}

export async function settleRun(
  start: Run,
  acct: RunAccounts,
  ctx: SettleCtx,
  opts: { allowSwap: boolean }
): Promise<SettleResult> {
  const d = db();
  const now = ctx.now ?? (() => new Date());
  const waitMs = ctx.waitMs ?? 60_000;
  const { keeper, conn } = ctx;
  let run = start;
  let swapTried = !opts.allowSwap;
  let note: string | undefined;

  const target = findTarget(run.outMint);
  if (!target) return { run, note: "unsupported target" };
  const quoteMint = address(acct.quoteMint);
  const quoteProgram = address(acct.quoteProgram);
  const targetMint = address(run.outMint);
  const targetProgram = address(TOKEN_2022_PROGRAM);
  const holder = address(acct.holder);
  const qp = programFor(acct.quoteProgram);
  const inRaw = decimalToRaw(run.inAmount, acct.quoteDecimals);

  async function set(values: Partial<Run> & { status: RunStatus }) {
    const [row] = await d
      .update(schema.dripRuns)
      .set({ ...values, statusAt: now() })
      .where(eq(schema.dripRuns.id, run.id))
      .returning();
    run = row;
  }

  async function outcome(sig: string): Promise<Outcome> {
    const { value } = await conn.rpc
      .getSignatureStatuses([signature(sig)], {
        searchTransactionHistory: true,
      })
      .send();
    const st = value[0];
    if (st) {
      if (st.err) return "failed";
      if (
        st.confirmationStatus === "confirmed" ||
        st.confirmationStatus === "finalized"
      )
        return "landed";
      return "pending";
    }
    const at = run.statusAt ?? run.ts;
    return now().getTime() - at.getTime() > TX_EXPIRY_MS
      ? "expired"
      : "pending";
  }

  /** Poll until chain answers or waitMs passes. */
  async function await_(sig: string): Promise<Outcome> {
    const until = Date.now() + waitMs;
    for (;;) {
      const o = await outcome(sig);
      if (o !== "pending" || Date.now() >= until) return o;
      await sleep(3_000);
    }
  }

  async function signOwn(ixs: Instruction[]) {
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
    return { signed, sig: getSignatureFromTransaction(signed) as string };
  }

  async function sendOwn(signed: Awaited<ReturnType<typeof signOwn>>) {
    try {
      await conn.sendAndConfirm(signed.signed, { commitment: "confirmed" });
      return "landed" as Outcome;
    } catch {
      return await_(signed.sig);
    }
  }

  /** Swap output credited to the keeper, read from the swap transaction. */
  async function swapOutput(sig: string): Promise<bigint> {
    const tx = await conn.rpc
      .getTransaction(signature(sig), {
        commitment: "confirmed",
        encoding: "json",
        maxSupportedTransactionVersion: 0,
      })
      .send();
    if (!tx?.meta) throw new Error("swap transaction not readable yet");
    return balanceDelta(
      tx.meta as unknown as Parameters<typeof balanceDelta>[0],
      keeper.address,
      run.outMint
    );
  }

  async function startRefund(reason: string) {
    note = reason;
    const keeperQuoteAta = await ata(keeper.address, quoteMint, quoteProgram);
    const s = await signOwn([
      qp.getTransferCheckedInstruction({
        source: keeperQuoteAta,
        mint: quoteMint,
        destination: address(acct.quoteTokenAccount),
        authority: keeper,
        amount: inRaw,
        decimals: acct.quoteDecimals,
      }),
    ]);
    await set({ status: "refunding", swapSig: null, returnSig: s.sig });
    const o = await sendOwn(s);
    if (o === "landed") await set({ status: "refunded" });
    else if (o === "failed" || o === "expired")
      await set({ status: "transferred", returnSig: null });
  }

  async function startSwap() {
    swapTried = true;
    let signedB64: string;
    let requestId: string;
    let sig: string;
    try {
      const order = await ctx.ultra.order({
        inputMint: acct.quoteMint,
        outputMint: run.outMint,
        amount: inRaw,
        taker: keeper.address,
      });
      const check = checkOrder(order, {
        inputMint: acct.quoteMint,
        outputMint: run.outMint,
        amountRaw: inRaw,
      });
      if (!check.ok) throw new Error(check.reason);
      if (!order.transaction) throw new Error("Ultra returned no transaction");
      const tx = getTransactionDecoder().decode(
        getBase64Encoder().encode(order.transaction)
      );
      const signed = await signTransaction([keeper.keyPair], tx);
      sig = getSignatureFromTransaction(signed) as string;
      signedB64 = getBase64EncodedWireTransaction(signed);
      requestId = order.requestId;
    } catch (err) {
      // nothing was sent, so the quote tokens are still on the keeper
      return startRefund(`swap not sent: ${(err as Error).message}`);
    }
    await set({ status: "swapping", swapSig: sig });
    try {
      await ctx.ultra.execute(signedB64, requestId);
    } catch (err) {
      // the swap may still have landed; the swapping step checks chain
      note = `execute: ${(err as Error).message}`;
    }
  }

  async function startReturn() {
    const outRaw = await swapOutput(run.swapSig!);
    if (outRaw <= 0n) throw new Error("swap shows no output for the keeper");
    const { toHolderRaw, feeRaw } = splitFee(outRaw);
    const keeperTargetAta = await ata(
      keeper.address,
      targetMint,
      targetProgram
    );
    const holderTargetAta = await ata(holder, targetMint, targetProgram);
    const s = await signOwn([
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
        decimals: target!.decimals,
      }),
    ]);
    await set({
      status: "returning",
      returnSig: s.sig,
      outAmount: rawToDecimal(toHolderRaw, target!.decimals),
      feeAmount: rawToDecimal(feeRaw, target!.decimals),
    });
    const o = await sendOwn(s);
    if (o === "landed") await set({ status: "done" });
    else if (o === "failed" || o === "expired")
      await set({ status: "swapped", returnSig: null });
  }

  // Each step either moves the row forward or returns; the bound is a guard.
  for (let step = 0; step < 12; step++) {
    const s = runStatus(run);
    if (TERMINAL.has(s)) return { run, note };
    switch (s) {
      case "transferring": {
        const o = await await_(run.transferSig!);
        if (o === "landed") await set({ status: "transferred" });
        else if (o === "failed" || o === "expired")
          await set({ status: "void" });
        else return { run, note: "transfer not confirmed yet" };
        break;
      }
      case "transferred":
        if (swapTried) await startRefund(note ?? "swap did not land");
        else await startSwap();
        if (runStatus(run) === "transferred" || runStatus(run) === "refunding")
          return { run, note: note ?? "refund not confirmed yet" };
        break;
      case "swapping": {
        const o = await await_(run.swapSig!);
        if (o === "landed") await set({ status: "swapped" });
        else if (o === "failed" || o === "expired") {
          // no swap landed: the quote tokens are still on the keeper
          swapTried = true;
          note = note ?? `swap ${o}`;
          await set({ status: "transferred", swapSig: null });
        } else return { run, note: "swap not confirmed yet" };
        break;
      }
      case "swapped":
        await startReturn();
        if (runStatus(run) !== "done")
          return { run, note: "return not confirmed yet" };
        break;
      case "returning": {
        const o = await await_(run.returnSig!);
        if (o === "landed") await set({ status: "done" });
        else if (o === "failed" || o === "expired")
          await set({ status: "swapped", returnSig: null });
        else return { run, note: "return not confirmed yet" };
        break;
      }
      case "refunding": {
        const o = await await_(run.returnSig!);
        if (o === "landed") await set({ status: "refunded" });
        else if (o === "failed" || o === "expired")
          await set({ status: "transferred", returnSig: null });
        else return { run, note: "refund not confirmed yet" };
        break;
      }
    }
  }
  return { run, note: note ?? "step limit reached" };
}

/** Sign the pull of `amountRaw` from the holder into the keeper (delegate authority). */
export async function signTransferIn(
  acct: RunAccounts,
  amountRaw: bigint,
  ctx: Pick<SettleCtx, "keeper" | "conn">
) {
  const { keeper, conn } = ctx;
  const quoteMint = address(acct.quoteMint);
  const quoteProgram = address(acct.quoteProgram);
  const qp = programFor(acct.quoteProgram);
  const keeperQuoteAta = await ata(keeper.address, quoteMint, quoteProgram);
  const { value: blockhash } = await conn.rpc
    .getLatestBlockhash({ commitment: "confirmed" })
    .send();
  const msg = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(keeper, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
    (m) =>
      appendTransactionMessageInstructions(
        [
          qp.getCreateAssociatedTokenIdempotentInstruction({
            payer: keeper,
            owner: keeper.address,
            mint: quoteMint,
            ata: keeperQuoteAta,
            tokenProgram: quoteProgram,
          }),
          qp.getTransferCheckedInstruction({
            source: address(acct.quoteTokenAccount),
            mint: quoteMint,
            destination: keeperQuoteAta,
            authority: keeper,
            amount: amountRaw,
            decimals: acct.quoteDecimals,
          }),
        ],
        m
      )
  );
  const signed = await signTransactionMessageWithSigners(msg);
  assertIsTransactionWithBlockhashLifetime(signed);
  return { signed, sig: getSignatureFromTransaction(signed) as string };
}
