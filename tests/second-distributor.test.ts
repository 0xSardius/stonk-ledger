/**
 * Regression for the 2026-09-20 distributor change: StonkFun pays most
 * batches from a second wallet (HuBMe…), funded by the first (5KXDF…).
 * Payouts from the new wallet must classify as confirmed, not probable, and
 * the funding transfer between the two must not be stored as a batch.
 * Mainnet fixtures captured 2026-09-23.
 */
import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ParsedTx } from "../lib/helius/client";
import { classifyTx } from "../lib/classify";
import { PLATFORM_DISTRIBUTORS, distributorSet } from "../lib/distributors";
import { parseBatch } from "../lib/jobs/ingest-batch";
import type { schema } from "../lib/db";

type Coin = typeof schema.coins.$inferSelect;

const [OLD, NEW] = PLATFORM_DISTRIBUTORS;
const STONK = "6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx";
const HOLDER = "88tvtBFWdb814MGm2PoGXXDqpEvntpxEwC8ayhbbJoN";

const load = (name: string) =>
  JSON.parse(
    readFileSync(path.join(__dirname, "fixtures", `${name}.json`), "utf8")
  ) as ParsedTx;
const payout = load("helius-payout-second-distributor");
const funding = load("helius-distributor-funding");

const coin = (quoteMint: string) =>
  ({
    id: 1,
    symbol: "X",
    name: "X",
    mint: "mint-x",
    quoteMint,
    quoteSymbol: "Q",
    quoteDecimals: 9,
    quoteCategory: "custom",
    feeBps: 300,
    distributorSigners: [],
    minRule: null,
    minSource: null,
    imageUrl: null,
    marketCapUsd: null,
    volume24hUsd: null,
    active: true,
    updatedAt: new Date(),
  }) as Coin;

describe("second distributor wallet", () => {
  test("fixtures really have the new shapes", () => {
    expect(payout.tokenTransfers.every((t) => t.fromUserAccount === NEW)).toBe(
      true
    );
    expect(payout.feePayer).not.toBe(NEW);
    expect(funding.feePayer).toBe(OLD);
    expect(
      funding.tokenTransfers.some(
        (t) => t.fromUserAccount === OLD && t.toUserAccount === NEW
      )
    ).toBe(true);
  });

  test("a payout from the new wallet is confirmed, not probable", () => {
    const r = classifyTx(payout, HOLDER, {
      quoteMint: STONK,
      distributorSigners: [...distributorSet()],
    });
    expect(r.kind).toBe("payout");
    if (r.kind === "payout") expect(r.payout.probable).toBe(false);
  });

  test("without the new wallet the same payout was only probable", () => {
    const r = classifyTx(payout, HOLDER, {
      quoteMint: STONK,
      distributorSigners: [OLD],
    });
    expect(r.kind === "payout" && r.payout.probable).toBe(true);
  });

  test("the batch parser stores the new wallet's batch", () => {
    const out = parseBatch(
      payout,
      new Map([[STONK, [coin(STONK)]]]),
      distributorSet()
    );
    expect(out).toHaveLength(1);
    expect(out[0].rows.length).toBe(payout.tokenTransfers.length);
    expect(out[0].rows.some((r) => r.wallet === HOLDER)).toBe(true);
  });

  test("the funding transfer between distributors is not a batch", () => {
    const quote = funding.tokenTransfers[0].mint;
    const coins = new Map([[quote, [coin(quote)]]]);
    expect(parseBatch(funding, coins, distributorSet())).toEqual([]);
    // the old single-wallet set stored it as a one-recipient batch
    expect(parseBatch(funding, coins, new Set([OLD]))).toHaveLength(1);
  });
});
