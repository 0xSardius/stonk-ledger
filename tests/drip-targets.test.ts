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

  test("findTarget resolves a PreStocks mint and rejects an unknown one", () => {
    expect(
      findTarget("PreZad18qfPtbxNpMtMuAuX2zVpvkEU8DnJx56faCWd")?.issuer
    ).toBe("PreStocks");
    expect(findTarget("11111111111111111111111111111111")).toBeNull();
  });

  test("PreStocks is the only pre-IPO issuer (PreStocks bounty rule)", () => {
    expect(new Set(DRIP_TARGETS.map((t) => t.issuer))).toEqual(
      new Set(["xStocks", "PreStocks"])
    );
    // Tessera T-Tokens, removed 2026-09-23
    for (const mint of [
      "oPAiAikWTaFj9RYoRFD35ccfwhnMcB3ThgBZRHSkjTZ",
      "TKLSidmLVt3cqGaaodG8tyRzoANfQwoh67AccjmubeZ",
      "TSPXcLV76s6V2zDiZQ18kBfcbnjaE2ZzNT3ga2Pd99v",
    ])
      expect(findTarget(mint)).toBeNull();
  });
});
