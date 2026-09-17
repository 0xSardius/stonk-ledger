/**
 * Regression for the 2026-09-17 fee-payer change: StonkFun now pays batch fees
 * from separate wallets while the tokens still leave the platform wallet.
 * Both the webhook parser and the history classifier must accept the batch
 * on the token source, not the fee payer. Mainnet fixture captured 19:20 UTC.
 */
import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ParsedTx } from "../lib/helius/client";
import { classifyTx } from "../lib/classify";
import { parseBatch } from "../lib/jobs/ingest-batch";
import type { schema } from "../lib/db";

type Coin = typeof schema.coins.$inferSelect;

const DISTRIBUTOR = "5KXDF6QnqhBj72hDtJNkkpFaQVUfbFXNybMsp3DiK6tD";
const NEW_FEE_PAYER = "nPbqzU7rkGzpP9LaxwrtPiCjuQawEqg7oxqJJ4u1SL6";
const QUOTE = "XsaBXg8dU5cPM6ehmVctMkVqoiRG2ZjMo1cyBJ3AykQ";

const tx = JSON.parse(
  readFileSync(
    path.join(__dirname, "fixtures", "helius-payout-new-feepayer.json"),
    "utf8"
  )
) as ParsedTx;

const coin = {
  id: 9,
  symbol: "X",
  name: "X",
  mint: "mint-x",
  quoteMint: QUOTE,
  quoteSymbol: "Q",
  quoteDecimals: 8,
  quoteCategory: "xstock",
  feeBps: 100,
  distributorSigners: [DISTRIBUTOR],
  minRule: null,
  minSource: null,
  imageUrl: null,
  marketCapUsd: null,
  volume24hUsd: null,
  active: true,
  updatedAt: new Date(),
} as Coin;

describe("batch with a separate fee payer", () => {
  test("fixture really has the new shape", () => {
    expect(tx.feePayer).toBe(NEW_FEE_PAYER);
    expect(tx.feePayer).not.toBe(DISTRIBUTOR);
    expect(
      tx.tokenTransfers.every((t) => t.fromUserAccount === DISTRIBUTOR)
    ).toBe(true);
  });

  test("webhook parser accepts it on the token source", () => {
    const out = parseBatch(
      tx,
      new Map([[QUOTE, [coin]]]),
      new Set([DISTRIBUTOR])
    );
    expect(out).toHaveLength(1);
    const recipients = new Set(tx.tokenTransfers.map((t) => t.toUserAccount));
    expect(out[0].rows).toHaveLength(recipients.size);
    expect(out[0].rows.every((r) => r.wallet !== DISTRIBUTOR)).toBe(true);
  });

  test("history classifier marks it a payout, not probable", () => {
    const wallet = tx.tokenTransfers[0].toUserAccount!;
    const r = classifyTx(
      tx,
      wallet,
      { quoteMint: QUOTE, distributorSigners: [DISTRIBUTOR] },
      8
    );
    expect(r.kind).toBe("payout");
    if (r.kind === "payout") {
      expect(r.payout.probable).toBe(false);
      expect(r.payout.amountUi).toBeCloseTo(
        tx.tokenTransfers[0].tokenAmount,
        8
      );
    }
  });

  test("a stranger paying fees for a plain transfer is still not a payout", () => {
    const stranger = {
      ...tx,
      tokenTransfers: tx.tokenTransfers.map((t) => ({
        ...t,
        fromUserAccount: tx.feePayer,
      })),
    };
    expect(
      parseBatch(stranger, new Map([[QUOTE, [coin]]]), new Set([DISTRIBUTOR]))
    ).toHaveLength(0);
  });
});
