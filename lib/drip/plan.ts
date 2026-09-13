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

/** Split a swap output into the holder's share and the DRIP fee. */
export function splitFee(outRaw: bigint, feeBps = DRIP_FEE_BPS) {
  const fee = (outRaw * BigInt(feeBps)) / 10_000n;
  return { toHolderRaw: outRaw - fee, feeRaw: fee };
}
