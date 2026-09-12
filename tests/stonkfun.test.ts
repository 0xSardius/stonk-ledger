import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  StonkFunClient,
  type StonkFunTokensResponse,
} from "../lib/stonkfun/client";
import { toCoinRow } from "../lib/stonkfun/to-coin-row";

const fixture = JSON.parse(
  readFileSync(
    path.join(__dirname, "fixtures/stonkfun-tokens-xstock.json"),
    "utf8"
  )
) as StonkFunTokensResponse;

describe("StonkFun token mapping", () => {
  test("maps a live xstock reward token to a coins row", () => {
    const row = toCoinRow(fixture.data.tokens[0]);
    expect(row.symbol).toBe("DIVI");
    expect(row.mint).toBe("FjTfaSH861nVcbAxdFAHTvhoSL4kyR6wgTWynuJkapht");
    expect(row.quoteMint).toBe("Xs78JED6PFZxWc2wCEPspZW9kL3Se5J7L5TChKgsidH");
    expect(row.quoteSymbol).toBe("STRCX");
    expect(row.quoteCategory).toBe("xstock");
    expect(row.feeBps).toBe(300);
    expect(row.active).toBe(true);
    expect(typeof row.marketCapUsd).toBe("string");
  });

  test("allTokens stops at totalPages", async () => {
    const calls: string[] = [];
    const fakeFetch: typeof fetch = async (input) => {
      calls.push(String(input));
      const body: StonkFunTokensResponse = {
        ...fixture,
        data: {
          ...fixture.data,
          pagination: {
            page: calls.length,
            pageSize: 2,
            total: 4,
            totalPages: 2,
          },
        },
      };
      return new Response(JSON.stringify(body), {
        headers: { "content-type": "application/json" },
      });
    };
    const api = new StonkFunClient("https://example.test/v1", fakeFetch);
    const pages = [];
    for await (const p of api.allTokens({
      mode: "reward",
      category: "xstock",
    })) {
      pages.push(p);
    }
    expect(pages).toHaveLength(2);
    expect(calls[0]).toContain("mode=reward");
    expect(calls[0]).toContain("category=xstock");
    expect(calls[0]).toContain("page=1");
    expect(calls[1]).toContain("page=2");
  });
});
