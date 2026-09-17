import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ParsedTx } from "../lib/helius/client";
import { parseBatch } from "../lib/jobs/ingest-batch";
import type { schema } from "../lib/db";

type Coin = typeof schema.coins.$inferSelect;

const load = (name: string) =>
  JSON.parse(
    readFileSync(path.join(__dirname, "fixtures", name), "utf8")
  ) as ParsedTx;

const DISTRIBUTOR = "5KXDF6QnqhBj72hDtJNkkpFaQVUfbFXNybMsp3DiK6tD";
const APPLX = "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp";
const STONK = "6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx";

const coin = (
  id: number,
  symbol: string,
  quoteMint: string,
  quoteDecimals: number
): Coin =>
  ({
    id,
    symbol,
    name: symbol,
    mint: `mint-${symbol}`,
    quoteMint,
    quoteSymbol: "Q",
    quoteDecimals,
    quoteCategory: "xstock",
    feeBps: 300,
    distributorSigners: [DISTRIBUTOR],
    minRule: null,
    minSource: null,
    imageUrl: null,
    marketCapUsd: null,
    volume24hUsd: null,
    active: true,
    updatedAt: new Date(),
  }) as Coin;

const index = new Map<string, Coin[]>([
  [APPLX, [coin(1, "TREE", APPLX, 8)]],
  [STONK, [coin(2, "KNOTS", STONK, 9), coin(3, "DEX", STONK, 9)]],
]);
const distributors = new Set([DISTRIBUTOR]);

describe("parseBatch", () => {
  test("TREE batch: one row per recipient, raw amounts from decimals", () => {
    const tx = load("helius-payout-tree.json");
    const out = parseBatch(tx, index, distributors);
    expect(out).toHaveLength(1);
    const b = out[0];
    expect(b.quoteMint).toBe(APPLX);
    expect(b.candidates.map((c) => c.symbol)).toEqual(["TREE"]);
    const recipients = new Set(
      tx.tokenTransfers
        .filter((t) => t.mint === APPLX)
        .map((t) => t.toUserAccount)
    );
    expect(b.rows).toHaveLength(recipients.size);
    for (const r of b.rows) {
      expect(r.sig).toBe(tx.signature);
      expect(r.amountRaw).toBeGreaterThan(0n);
      expect(Number(r.amount)).toBeGreaterThan(0);
      expect(r.blockTime.getTime()).toBe(tx.timestamp * 1000);
    }
  });

  test("KNOTS batch: two candidate coins share the quote mint", () => {
    const out = parseBatch(
      load("helius-payout-knots.json"),
      index,
      distributors
    );
    expect(out).toHaveLength(1);
    expect(out[0].candidates.map((c) => c.symbol).sort()).toEqual([
      "DEX",
      "KNOTS",
    ]);
    expect(out[0].rows.length).toBeGreaterThanOrEqual(8);
  });

  test("a swap and a non-distributor transfer are ignored", () => {
    expect(
      parseBatch(load("helius-swap-knots.json"), index, distributors)
    ).toEqual([]);
    // a plain batch where neither the fee payer nor the token source is a
    // distributor wallet (a fee payer change alone is still a payout since
    // 2026-09-17, see tests/new-feepayer.test.ts)
    const base = load("helius-payout-tree.json");
    const tx = {
      ...base,
      feePayer: "someone-else",
      tokenTransfers: base.tokenTransfers.map((t) => ({
        ...t,
        fromUserAccount: "someone-else",
      })),
    };
    expect(parseBatch(tx, index, distributors)).toEqual([]);
  });
});
