/**
 * Keeper integration test against mainnet fixtures (PRD section 13).
 * Replays the decision path of one keeper run for the owner's test wallet:
 * on-chain token-account state after ApproveChecked, the payouts that landed,
 * and the real Jupiter Ultra order for that amount. No network, no signing.
 */
import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { checkApproval, type TokenAccountState } from "../lib/drip/verify";
import { decideSweep, rawToUi, splitFee } from "../lib/drip/plan";
import { parseBatch } from "../lib/jobs/ingest-batch";
import type { ParsedTx } from "../lib/helius/client";
import type { UltraOrder } from "../lib/drip/ultra";
import type { schema } from "../lib/db";

const KEEPER = "Hsmuc8GQADgdg6FrSUx9dFmR9HBEVRSDd3YNyTjyt5t3";
const HOLDER = "88tvtBFWdb814MGm2PoGXXDqpEvntpxEwC8ayhbbJoN";
const STONK = "6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx";
const SPYX = "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W";
const DISTRIBUTOR = "5KXDF6QnqhBj72hDtJNkkpFaQVUfbFXNybMsp3DiK6tD";
const STONK_DECIMALS = 9;
const STONK_USD = 0.2454; // price snapshot at the time of the live run

const load = <T>(name: string) =>
  JSON.parse(readFileSync(path.join(__dirname, "fixtures", name), "utf8")) as T;

/** Holder's STONK account after the approval tx 6aHSyKNi… (cap 0.610353 STONK). */
const stateAfterApproval: TokenAccountState = {
  owner: HOLDER,
  mint: STONK,
  amountRaw: 732_293_175n, // 0.732293175 STONK balance
  delegate: KEEPER,
  delegatedAmountRaw: 610_353_000n,
};

describe("keeper run on mainnet fixtures", () => {
  test("approval check passes for the recorded delegation", () => {
    expect(
      checkApproval(stateAfterApproval, {
        owner: HOLDER,
        mint: STONK,
        delegate: KEEPER,
        minCapRaw: 610_353_000n,
      }).ok
    ).toBe(true);
  });

  test("a KNOTS distributor batch classifies as payouts for every recipient", () => {
    const tx = load<ParsedTx>("helius-payout-knots.json");
    const knots = {
      id: 1,
      quoteMint: STONK,
      quoteDecimals: STONK_DECIMALS,
    } as typeof schema.coins.$inferSelect;
    const [batch] = parseBatch(
      tx,
      new Map([[STONK, [knots]]]),
      new Set([DISTRIBUTOR])
    );
    expect(batch.rows.length).toBeGreaterThanOrEqual(8);
    expect(batch.rows.every((r) => r.amountRaw > 0n)).toBe(true);
  });

  test("sweep decision for the live run: 0.121940426 STONK pending at a 2 cent threshold", () => {
    const pendingRaw = 121_940_426n; // the one payout that had landed
    const d = decideSweep({
      payoutsSinceRaw: pendingRaw,
      sweptRaw: 0n,
      delegatedRaw: stateAfterApproval.delegatedAmountRaw,
      balanceRaw: stateAfterApproval.amountRaw,
      quoteUsd: STONK_USD,
      quoteDecimals: STONK_DECIMALS,
      thresholdUsd: 0.02,
    });
    expect(d).toMatchObject({ sweep: true, amountRaw: pendingRaw });
    if (d.sweep) expect(d.usd).toBeCloseTo(0.0299, 3);
    // and holds at the production default
    expect(
      decideSweep({
        payoutsSinceRaw: pendingRaw,
        sweptRaw: 0n,
        delegatedRaw: stateAfterApproval.delegatedAmountRaw,
        balanceRaw: stateAfterApproval.amountRaw,
        quoteUsd: STONK_USD,
        quoteDecimals: STONK_DECIMALS,
        thresholdUsd: 5,
      })
    ).toMatchObject({ sweep: false, reason: "below threshold" });
  });

  test("the real Ultra order for that amount splits into holder share and fee", () => {
    const order = load<UltraOrder>("jupiter-ultra-order-stonk-spyx.json");
    expect(order.inputMint).toBe(STONK);
    expect(order.outputMint).toBe(SPYX);
    expect(BigInt(order.inAmount)).toBe(121_940_426n);
    const out = BigInt(order.outAmount);
    expect(out).toBeGreaterThan(0n);
    const { toHolderRaw, feeRaw } = splitFee(out);
    expect(toHolderRaw + feeRaw).toBe(out);
    expect(Number(feeRaw)).toBeLessThanOrEqual(Number(out) / 100);
    // SPYx has 8 decimals; the live run returned 0.00003401 SPYx to the holder
    expect(rawToUi(toHolderRaw, 8)).toBeGreaterThan(0.00002);
    expect(rawToUi(toHolderRaw, 8)).toBeLessThan(0.0001);
    expect(Number(order.priceImpactPct)).toBeLessThan(0.05);
  });

  test("after the sweep, the remaining cap matches chain: 0.610353 - 0.121940426", () => {
    const remaining = stateAfterApproval.delegatedAmountRaw - 121_940_426n;
    expect(remaining).toBe(488_412_574n); // /api/drip/status reported 488412574
    const next = decideSweep({
      payoutsSinceRaw: 121_940_426n + 50_000_000n, // one more small payout
      sweptRaw: 121_940_426n,
      delegatedRaw: remaining,
      balanceRaw: 732_293_175n - 121_940_426n + 50_000_000n,
      quoteUsd: STONK_USD,
      quoteDecimals: STONK_DECIMALS,
      thresholdUsd: 0.05,
    });
    expect(next).toMatchObject({ sweep: false, reason: "below threshold" });
  });
});
