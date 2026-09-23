/**
 * Pure guards added after the 2026-09-22 review: the Ultra order check, the
 * run status rules for rows written before the state machine, and exact
 * raw/decimal conversion for numeric columns.
 */
import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  balanceDelta,
  checkOrder,
  countsAsSwept,
  decimalToRaw,
  rawToDecimal,
  runStatus,
} from "../lib/drip/plan";
import type { UltraOrder } from "../lib/drip/ultra";

const order = JSON.parse(
  readFileSync(
    path.join(__dirname, "fixtures", "jupiter-ultra-order-stonk-spyx.json"),
    "utf8"
  )
) as UltraOrder;
const want = {
  inputMint: order.inputMint,
  outputMint: order.outputMint,
  amountRaw: 121_940_426n,
};

describe("checkOrder", () => {
  test("the live mainnet order passes", () => {
    const r = checkOrder(order, want);
    expect(r.ok).toBe(true);
  });
  test("a different amount or mint is refused", () => {
    expect(checkOrder(order, { ...want, amountRaw: 1n }).ok).toBe(false);
    expect(checkOrder(order, { ...want, outputMint: "x" }).ok).toBe(false);
  });
  test("a loss over 2% is refused, from USD values", () => {
    const r = checkOrder({ ...order, inUsdValue: 100, outUsdValue: 97 }, want);
    expect(r).toMatchObject({ ok: false });
  });
  test("without USD values, a negative priceImpactPct is the loss", () => {
    const base = { ...order, inUsdValue: undefined, outUsdValue: undefined };
    expect(checkOrder({ ...base, priceImpactPct: "-0.03" }, want).ok).toBe(
      false
    );
    expect(checkOrder({ ...base, priceImpactPct: "-0.001" }, want).ok).toBe(
      true
    );
  });
});

describe("run status", () => {
  test("rows before the state machine: refund if no swap, else done", () => {
    expect(runStatus({ status: null, swapSig: null, returnSig: "r" })).toBe(
      "refunded"
    );
    expect(runStatus({ status: null, swapSig: "s", returnSig: "r" })).toBe(
      "done"
    );
  });
  test("only refunds and void transfers give the input back", () => {
    const row = (status: string) => ({
      status,
      swapSig: null,
      returnSig: null,
    });
    expect(countsAsSwept(row("refunded"))).toBe(false);
    expect(countsAsSwept(row("void"))).toBe(false);
    for (const s of [
      "transferring",
      "transferred",
      "swapping",
      "swapped",
      "returning",
      "done",
      "refunding",
    ])
      expect(countsAsSwept(row(s))).toBe(true);
  });
});

describe("raw and decimal", () => {
  test("round trip is exact, including tiny amounts", () => {
    for (const [raw, dec] of [
      [190_898_000n, 9],
      [100n, 9],
      [1n, 8],
      [0n, 6],
      [123_456_789_012_345_678n, 9],
    ] as const) {
      const s = rawToDecimal(raw, dec);
      expect(s).not.toMatch(/e/);
      expect(decimalToRaw(s, dec)).toBe(raw);
    }
    expect(rawToDecimal(100n, 9)).toBe("0.0000001");
  });
});

describe("balanceDelta", () => {
  test("sums only the owner's balances of that mint", () => {
    const meta = {
      preTokenBalances: [
        { mint: "M", owner: "K", uiTokenAmount: { amount: "10" } },
        { mint: "M", owner: "X", uiTokenAmount: { amount: "999" } },
      ],
      postTokenBalances: [
        { mint: "M", owner: "K", uiTokenAmount: { amount: "25" } },
        { mint: "M", owner: "X", uiTokenAmount: { amount: "0" } },
      ],
    };
    expect(balanceDelta(meta, "K", "M")).toBe(15n);
  });
});
