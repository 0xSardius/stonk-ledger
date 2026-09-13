/**
 * Payout classifier (PRD 8.2). Pure: no I/O, unit-tested against mainnet
 * fixtures in tests/fixtures/helius-*.json.
 *
 * An inbound quote-token transfer is a payout when:
 *   1. the transaction fee payer (signer) is in the coin's distributor set,
 *   2. no DEX or aggregator program appears in the outer instructions,
 *   3. the mint equals the coin's quote mint.
 * Fallback while a coin's distributor is unconfirmed: a batch transfer with
 * many destinations and no DEX program is a payout labelled `probable`.
 */
import type { ParsedTx } from "./helius/client";

/** Outer-instruction programs that mean "this is a swap, not a payout". */
export const DEX_PROGRAMS = new Set<string>([
  "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4", // Jupiter v6
  "JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB", // Jupiter v4
  "jupoNjAxXgZ4rjzxzPMP4oxduvQsQtZzyknqvzYNrNu", // Jupiter limit/trigger
  "DCA265Vj8a9CEuX1eb1LWRnDT7uK6q1xMipnNyatn23M", // Jupiter DCA
  "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8", // Raydium AMM v4
  "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK", // Raydium CLMM
  "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C", // Raydium CPMM
  "LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj", // Raydium LaunchLab
  "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc", // Orca Whirlpool
  "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo", // Meteora DLMM
  "Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB", // Meteora pools
  "dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN", // Meteora DBC
  "DF1ow4tspfHX9JwWJsAb9epbkA8hmpSEAtxXy1V27QBH", // Byreal
  "6m2CDdhRgxpH4WjvdzxAYbGxwdGUz5MziiL5jek2kBma", // OKX DEX router
  "proVF4pMXVaYqmy4NjniPh4pqKNfMmsihgd4wdkCX3u", // DFlow
  "FLASHX8DrLbgeR8FcfNV1F5krxYcYMUdBkrP1EPBtxB9", // Flash
  "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA", // pump.fun AMM
  "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P", // pump.fun
]);

/** Helius `source` values that also mean swap. Belt and braces. */
export const DEX_SOURCES = new Set<string>([
  "JUPITER",
  "RAYDIUM",
  "ORCA",
  "METEORA",
  "BYREAL",
  "OKX_DEX_ROUTER",
  "DFLOW",
  "PUMP_FUN",
  "PUMP_AMM",
]);

export const PROBABLE_MIN_DESTINATIONS = 8;

export type CoinRule = {
  quoteMint: string;
  distributorSigners: readonly string[];
};

export type Classified = {
  sig: string;
  blockTime: Date;
  amountUi: number;
  amountRaw: bigint | null;
  signer: string;
  destinations: number;
  probable: boolean;
};

export type ClassifyResult =
  { kind: "payout"; payout: Classified } | { kind: "swap" } | { kind: "other" };

function outerPrograms(tx: ParsedTx) {
  return new Set(tx.instructions.map((i) => i.programId));
}

export function hasDexProgram(tx: ParsedTx) {
  if (DEX_SOURCES.has(tx.source)) return true;
  for (const p of outerPrograms(tx)) if (DEX_PROGRAMS.has(p)) return true;
  return false;
}

/**
 * Classify one transaction for one wallet and one coin rule.
 * `quoteDecimals` lets the caller store an exact raw amount; when unknown
 * the raw amount is null and the UI amount is stored as numeric.
 */
export function classifyTx(
  tx: ParsedTx,
  wallet: string,
  rule: CoinRule,
  quoteDecimals?: number | null
): ClassifyResult {
  if (tx.transactionError) return { kind: "other" };
  const inbound = tx.tokenTransfers.filter(
    (t) => t.mint === rule.quoteMint && t.toUserAccount === wallet
  );
  if (inbound.length === 0) return { kind: "other" };
  if (hasDexProgram(tx)) return { kind: "swap" };

  const destinations = new Set(
    tx.tokenTransfers
      .filter((t) => t.mint === rule.quoteMint)
      .map((t) => t.toUserAccount)
  ).size;
  const fromDistributor = rule.distributorSigners.includes(tx.feePayer);
  const probable =
    !fromDistributor && destinations >= PROBABLE_MIN_DESTINATIONS;
  if (!fromDistributor && !probable) return { kind: "other" };

  const amountUi = inbound.reduce((a, t) => a + t.tokenAmount, 0);
  const amountRaw =
    quoteDecimals != null
      ? BigInt(Math.round(amountUi * 10 ** quoteDecimals))
      : null;
  return {
    kind: "payout",
    payout: {
      sig: tx.signature,
      blockTime: new Date(tx.timestamp * 1000),
      amountUi,
      amountRaw,
      signer: tx.feePayer,
      destinations,
      probable,
    },
  };
}
