/**
 * Retention rules for webhook ingestion (2026-09-16): one feed row per batch,
 * per-recipient rows only for tracked wallets. Pure functions, mainnet fixture.
 */
import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ParsedTx } from "../lib/helius/client";
import { parseBatch, toBatchRow, trackedRows } from "../lib/jobs/ingest-batch";
import type { schema } from "../lib/db";

type Coin = typeof schema.coins.$inferSelect;

const DISTRIBUTOR = "5KXDF6QnqhBj72hDtJNkkpFaQVUfbFXNybMsp3DiK6tD";
const APPLX = "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp";

const tree = {
  id: 1,
  symbol: "TREE",
  name: "Tree",
  mint: "8xH8ikqGXNTSYmmUVakCE2tVwU7aYJwz2JZkqAjW88sG",
  quoteMint: APPLX,
  quoteSymbol: "APPLX",
  quoteDecimals: 8,
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
} as Coin;

const tx = JSON.parse(
  readFileSync(
    path.join(__dirname, "fixtures", "helius-payout-tree.json"),
    "utf8"
  )
) as ParsedTx;

const [batch] = parseBatch(
  tx,
  new Map([[APPLX, [tree]]]),
  new Set([DISTRIBUTOR])
);

describe("payout batch retention", () => {
  test("toBatchRow sums the whole batch, attributed or not", () => {
    const row = toBatchRow(batch, null);
    expect(row.sig).toBe(tx.signature);
    expect(row.quoteMint).toBe(APPLX);
    expect(row.coinId).toBeNull();
    expect(row.recipients).toBe(batch.rows.length);
    expect(row.blockTime.getTime()).toBe(tx.timestamp * 1000);
    const sum = batch.rows.reduce((a, r) => a + Number(r.amount), 0);
    expect(Number(row.amount)).toBeCloseTo(sum, 9);
    expect(toBatchRow(batch, tree.id).coinId).toBe(tree.id);
  });

  test("trackedRows keeps only viewed or delegated wallets", () => {
    expect(trackedRows(batch.rows, new Set())).toHaveLength(0);
    const one = batch.rows[0].wallet;
    const kept = trackedRows(batch.rows, new Set([one, "not-a-recipient"]));
    expect(kept.map((r) => r.wallet)).toEqual([one]);
    expect(batch.rows.length).toBeGreaterThan(1);
  });
});
