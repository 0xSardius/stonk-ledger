import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  JupiterPriceClient,
  currentMultiplier,
  type JupiterPriceResponse,
} from "../lib/prices/jupiter";

const fixture = JSON.parse(
  readFileSync(path.join(__dirname, "fixtures/jupiter-price-v3.json"), "utf8")
) as JupiterPriceResponse;

const APPLX = "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp";
const STONK = "6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx";

describe("Jupiter Price v3", () => {
  test("fixture has the fields we depend on", () => {
    expect(fixture[APPLX].usdPrice).toBeGreaterThan(0);
    expect(fixture[APPLX].decimals).toBe(8);
    expect(fixture[APPLX].stockData?.price).toBeGreaterThan(0);
    expect(fixture[APPLX].scaledUiConfig?.multiplier).toBeGreaterThan(1);
    expect(fixture[STONK].decimals).toBe(9);
    expect(fixture[STONK].scaledUiConfig).toBeUndefined();
  });

  test("chunks ids at 50 per call and merges", async () => {
    const calls: string[] = [];
    const fakeFetch: typeof fetch = async (input) => {
      const url = new URL(String(input));
      calls.push(url.searchParams.get("ids") ?? "");
      const ids = (url.searchParams.get("ids") ?? "").split(",");
      const body = Object.fromEntries(
        ids.map((id) => [id, { usdPrice: 1, decimals: 6 }])
      );
      return new Response(JSON.stringify(body));
    };
    const client = new JupiterPriceClient("https://x.test/price/v3", fakeFetch);
    const mints = Array.from({ length: 120 }, (_, i) => `mint${i}`);
    const out = await client.prices([...mints, "mint0"]);
    expect(calls).toHaveLength(3);
    expect(calls[0].split(",")).toHaveLength(50);
    expect(Object.keys(out)).toHaveLength(120);
  });

  test("currentMultiplier honors a scheduled multiplier change", () => {
    const p = {
      usdPrice: 1,
      decimals: 8,
      scaledUiConfig: {
        multiplier: 1.001,
        newMultiplier: 1.002,
        newMultiplierEffectiveAt: "2026-09-10T00:00:00Z",
      },
    };
    expect(currentMultiplier(p, new Date("2026-09-09T00:00:00Z"))).toBe(1.001);
    expect(currentMultiplier(p, new Date("2026-09-11T00:00:00Z"))).toBe(1.002);
    expect(currentMultiplier({ usdPrice: 1, decimals: 6 })).toBe(1);
  });
});
