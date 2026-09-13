import { describe, expect, test } from "vitest";
import { decideSweep, splitFee } from "../lib/drip/plan";
import { keeperSecretBytes } from "../lib/drip/keeper";

const STONK = { quoteDecimals: 9, quoteUsd: 0.25, thresholdUsd: 5 };
const stonk = (n: number) => BigInt(Math.round(n * 1e9));

describe("decideSweep", () => {
  test("sweeps pending payouts once they are worth the threshold", () => {
    const d = decideSweep({
      ...STONK,
      payoutsSinceRaw: stonk(100), // $25
      sweptRaw: stonk(20),
      delegatedRaw: stonk(1_000),
      balanceRaw: stonk(500),
    });
    expect(d).toEqual({ sweep: true, amountRaw: stonk(80), usd: 20 });
  });

  test("never sweeps more than delegated or than the balance", () => {
    const d = decideSweep({
      ...STONK,
      payoutsSinceRaw: stonk(1_000),
      sweptRaw: 0n,
      delegatedRaw: stonk(60),
      balanceRaw: stonk(40),
    });
    expect(d.sweep).toBe(true);
    if (d.sweep) expect(d.amountRaw).toBe(stonk(40));
  });

  test("holds below threshold, on exhausted delegation, and on nothing pending", () => {
    expect(
      decideSweep({
        ...STONK,
        payoutsSinceRaw: stonk(10), // $2.50
        sweptRaw: 0n,
        delegatedRaw: stonk(1_000),
        balanceRaw: stonk(1_000),
      })
    ).toMatchObject({ sweep: false, reason: "below threshold" });
    expect(
      decideSweep({
        ...STONK,
        payoutsSinceRaw: stonk(100),
        sweptRaw: 0n,
        delegatedRaw: 0n,
        balanceRaw: stonk(1_000),
      })
    ).toMatchObject({
      sweep: false,
      reason: "delegation exhausted or revoked",
    });
    expect(
      decideSweep({
        ...STONK,
        payoutsSinceRaw: stonk(50),
        sweptRaw: stonk(50),
        delegatedRaw: stonk(1_000),
        balanceRaw: stonk(1_000),
      })
    ).toMatchObject({
      sweep: false,
      reason: "nothing pending",
      pendingRaw: 0n,
    });
  });

  test("a cap that cuts the sweep under the threshold holds", () => {
    expect(
      decideSweep({
        ...STONK,
        payoutsSinceRaw: stonk(100), // $25 pending
        sweptRaw: 0n,
        delegatedRaw: stonk(4), // $1 left
        balanceRaw: stonk(1_000),
      })
    ).toMatchObject({ sweep: false, reason: "capped amount below threshold" });
  });
});

describe("splitFee", () => {
  test("takes 1% of the output for the DRIP fee", () => {
    expect(splitFee(1_000_000n)).toEqual({
      toHolderRaw: 990_000n,
      feeRaw: 10_000n,
    });
    expect(splitFee(99n)).toEqual({ toHolderRaw: 99n, feeRaw: 0n });
  });
});

describe("keeperSecretBytes", () => {
  test("accepts a JSON byte array", () => {
    const bytes = keeperSecretBytes(
      JSON.stringify(Array.from({ length: 64 }, (_, i) => i))
    );
    expect(bytes).toHaveLength(64);
    expect(bytes[63]).toBe(63);
  });
  test("accepts base58", () => {
    // 64 zero bytes in base58 is 64 '1' characters
    expect(keeperSecretBytes("1".repeat(64))).toHaveLength(64);
  });
});
