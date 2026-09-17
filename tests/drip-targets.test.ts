/**
 * DRIP target list against the issuers' own public APIs (fixtures captured
 * 2026-09-16). Guards against a typo in a mint or a decimals mismatch, which
 * would make the keeper send stock to the wrong account or misprice a sweep.
 */
import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { DRIP_TARGETS, findTarget, DEFAULT_TARGET } from "../lib/drip/targets";

const load = <T>(name: string) =>
  JSON.parse(readFileSync(path.join(__dirname, "fixtures", name), "utf8")) as T;

type TesseraToken = { symbol: string; mint: string };
type PreStock = { symbol: string; contract_address: string };

describe("DRIP targets", () => {
  test("mints and symbols are unique", () => {
    const mints = new Set(DRIP_TARGETS.map((t) => t.mint));
    const symbols = new Set(DRIP_TARGETS.map((t) => t.symbol));
    expect(mints.size).toBe(DRIP_TARGETS.length);
    expect(symbols.size).toBe(DRIP_TARGETS.length);
  });

  test("decimals follow the issuer", () => {
    for (const t of DRIP_TARGETS) {
      expect(t.decimals, t.symbol).toBe(t.issuer === "xStocks" ? 8 : 9);
    }
  });

  test("default target is a deep xStock pool", () => {
    expect(DEFAULT_TARGET.symbol).toBe("SPYx");
    expect(DEFAULT_TARGET.issuer).toBe("xStocks");
  });

  test("Tessera mints match the Tessera token-details API", () => {
    const api = load<TesseraToken[]>("tessera-token-details.json");
    const ours = DRIP_TARGETS.filter((t) => t.issuer === "Tessera");
    expect(ours.length).toBe(api.length);
    for (const t of ours) {
      const match = api.find((a) => a.mint === t.mint);
      expect(match, `${t.symbol} not in Tessera API`).toBeDefined();
      expect(match!.symbol).toBe(t.symbol);
    }
  });

  test("PreStocks mints match the PreStocks API", () => {
    const api = load<PreStock[]>("prestocks-list.json");
    const ours = DRIP_TARGETS.filter((t) => t.issuer === "PreStocks");
    expect(ours.length).toBe(api.length);
    for (const t of ours) {
      const match = api.find((a) => a.contract_address === t.mint);
      expect(match, `${t.symbol} not in PreStocks API`).toBeDefined();
      expect(match!.symbol).toBe(t.symbol);
    }
  });

  test("findTarget resolves a Tessera mint and rejects an unknown one", () => {
    expect(
      findTarget("oPAiAikWTaFj9RYoRFD35ccfwhnMcB3ThgBZRHSkjTZ")?.symbol
    ).toBe("T-OpenAI");
    expect(findTarget("11111111111111111111111111111111")).toBeNull();
  });
});
