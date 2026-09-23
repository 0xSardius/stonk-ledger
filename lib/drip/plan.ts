/**
 * Pure DRIP arithmetic. No I/O, unit-tested.
 *
 * A keeper run sweeps only payouts that arrived after the delegation was
 * created and have not been swept yet, never the holder's other balance.
 * The sweep is further capped by the on-chain delegated amount and the
 * account balance, and only happens when it is worth at least the threshold.
 */
import { DRIP_FEE_BPS } from "./targets";

export type SweepInput = {
  /** Sum of payout amounts (raw units) received since the delegation. */
  payoutsSinceRaw: bigint;
  /** Sum of in_amount (raw units) of previous successful runs. */
  sweptRaw: bigint;
  /** Remaining delegated amount on chain (raw units). */
  delegatedRaw: bigint;
  /** Current balance of the quote token account (raw units). */
  balanceRaw: bigint;
  /** USD price of one whole quote token. */
  quoteUsd: number;
  quoteDecimals: number;
  thresholdUsd: number;
};

export type SweepDecision =
  | { sweep: true; amountRaw: bigint; usd: number }
  | { sweep: false; reason: string; pendingRaw: bigint; usd: number };

const min = (...xs: bigint[]) => xs.reduce((a, b) => (a < b ? a : b));

export function rawToUi(raw: bigint, decimals: number) {
  return Number(raw) / 10 ** decimals;
}

/** Exact decimal string for a raw amount, for numeric columns (no floats, no exponents). */
export function rawToDecimal(raw: bigint, decimals: number): string {
  const neg = raw < 0n;
  const s = (neg ? -raw : raw).toString().padStart(decimals + 1, "0");
  const whole = s.slice(0, s.length - decimals);
  const frac = s.slice(s.length - decimals).replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole}${frac ? `.${frac}` : ""}`;
}

/** Raw amount from a stored decimal string; exact for plain decimals. */
export function decimalToRaw(value: string, decimals: number): bigint {
  const m = /^(-?)(\d*)(?:\.(\d*))?$/.exec(value.trim());
  if (!m) return BigInt(Math.round(Number(value) * 10 ** decimals));
  const frac = (m[3] ?? "").padEnd(decimals, "0").slice(0, decimals);
  const raw = BigInt((m[2] || "0") + frac);
  return m[1] ? -raw : raw;
}

export function decideSweep(i: SweepInput): SweepDecision {
  const pending = i.payoutsSinceRaw - i.sweptRaw;
  const pendingRaw = pending > 0n ? pending : 0n;
  const usd = rawToUi(pendingRaw, i.quoteDecimals) * i.quoteUsd;
  if (pendingRaw === 0n) {
    return { sweep: false, reason: "nothing pending", pendingRaw, usd };
  }
  if (usd < i.thresholdUsd) {
    return { sweep: false, reason: "below threshold", pendingRaw, usd };
  }
  if (i.delegatedRaw <= 0n) {
    return {
      sweep: false,
      reason: "delegation exhausted or revoked",
      pendingRaw,
      usd,
    };
  }
  if (i.balanceRaw <= 0n) {
    return { sweep: false, reason: "empty balance", pendingRaw, usd };
  }
  const amountRaw = min(pendingRaw, i.delegatedRaw, i.balanceRaw);
  const amountUsd = rawToUi(amountRaw, i.quoteDecimals) * i.quoteUsd;
  if (amountUsd < i.thresholdUsd) {
    return {
      sweep: false,
      reason: "capped amount below threshold",
      pendingRaw,
      usd,
    };
  }
  return { sweep: true, amountRaw, usd: amountUsd };
}

/** Refuse a swap that loses more than this fraction of value (2%). */
export const MAX_SWAP_LOSS = 0.02;

type OrderFields = {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  priceImpactPct: number | string;
  inUsdValue?: number;
  outUsdValue?: number;
};

/**
 * Check an Ultra order before the keeper signs it: same mints and amount as
 * requested, and a value loss no worse than MAX_SWAP_LOSS. Jupiter's
 * `priceImpactPct` is a fraction where negative means worse (developers.jup.ag
 * /docs/ultra/response); the USD values are preferred when both are present.
 */
export function checkOrder(
  order: OrderFields,
  want: { inputMint: string; outputMint: string; amountRaw: bigint },
  maxLoss = MAX_SWAP_LOSS
): { ok: true; loss: number } | { ok: false; reason: string } {
  if (
    order.inputMint !== want.inputMint ||
    order.outputMint !== want.outputMint
  )
    return { ok: false, reason: "order mints differ from the request" };
  if (BigInt(order.inAmount) !== want.amountRaw)
    return { ok: false, reason: "order amount differs from the request" };
  const loss =
    order.inUsdValue && order.outUsdValue
      ? 1 - order.outUsdValue / order.inUsdValue
      : -Number(order.priceImpactPct);
  if (!Number.isFinite(loss))
    return { ok: false, reason: "order has no usable price impact" };
  if (loss > maxLoss)
    return {
      ok: false,
      reason: `swap would lose ${(loss * 100).toFixed(2)}% (limit ${(maxLoss * 100).toFixed(0)}%)`,
    };
  return { ok: true, loss };
}

/**
 * A drip_runs row is a small state machine. Each transaction's signature is
 * stored before it is sent, with an "-ing" status; the next status is set
 * only once chain confirms the outcome. So a crash, a timeout, or an RPC
 * error at any point leaves a row that says exactly which transaction to
 * check, and the next keeper pass finishes the run (lib/drip/settle.ts).
 *
 *   transferring -> transferred -> swapping -> swapped -> returning -> done
 *                     |  (no swap landed)
 *                     +-> refunding -> refunded
 *   transferring -> void            (the transfer never landed)
 */
export type RunStatus =
  | "transferring"
  | "transferred"
  | "swapping"
  | "swapped"
  | "returning"
  | "done"
  | "refunding"
  | "refunded"
  | "void";

export const TERMINAL: ReadonlySet<RunStatus> = new Set([
  "done",
  "refunded",
  "void",
]);

type RunSigs = {
  status: string | null;
  swapSig: string | null;
  returnSig: string | null;
};

/** Status of a row; rows written before the state machine carry null. */
export function runStatus(r: RunSigs): RunStatus {
  if (r.status) return r.status as RunStatus;
  return !r.swapSig && r.returnSig ? "refunded" : "done";
}

/**
 * Whether a run's input counts against pending payouts. Only a refund (or a
 * transfer that never landed) gives the tokens back; every other state,
 * including one stuck mid-run, counts, so the same payouts are never pulled
 * twice.
 */
export const countsAsSwept = (r: RunSigs) => {
  const s = runStatus(r);
  return s !== "refunded" && s !== "void";
};

/**
 * A transaction the keeper sent is safe to call "never landed" once it is
 * older than any blockhash it could carry (about 150 slots, roughly one
 * minute; Ultra payloads live about two). Three minutes leaves margin.
 */
export const TX_EXPIRY_MS = 3 * 60_000;

/** Output of a swap from the keeper's target-token balance before and after. */
export function balanceDelta(
  meta: {
    preTokenBalances?: readonly TokenBalance[] | null;
    postTokenBalances?: readonly TokenBalance[] | null;
  },
  owner: string,
  mint: string
): bigint {
  const pick = (list?: readonly TokenBalance[] | null) =>
    (list ?? [])
      .filter((b) => b.owner === owner && b.mint === mint)
      .reduce((a, b) => a + BigInt(b.uiTokenAmount.amount), 0n);
  return pick(meta.postTokenBalances) - pick(meta.preTokenBalances);
}

type TokenBalance = {
  mint: string;
  owner?: string;
  uiTokenAmount: { amount: string };
};

/** Split a swap output into the holder's share and the DRIP fee. */
export function splitFee(outRaw: bigint, feeBps = DRIP_FEE_BPS) {
  const fee = (outRaw * BigInt(feeBps)) / 10_000n;
  return { toHolderRaw: outRaw - fee, feeRaw: fee };
}
