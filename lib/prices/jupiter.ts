/**
 * Jupiter Price API v3. Verified live 2026-09-13:
 *   GET https://lite-api.jup.ag/price/v3?ids=<mint>,<mint>
 *   -> { [mint]: { usdPrice, blockId, decimals, priceChange24h, liquidity,
 *                  stockData?: { id, price, mcap, updatedAt },
 *                  scaledUiConfig?: { multiplier, ... } } }
 * No key needed on lite-api. api.jup.ag also answered without a key today.
 * `stockData.price` is the underlying equity price for xStocks.
 * `scaledUiConfig.multiplier` is the Token-2022 scaled-UI-amount multiplier
 * that xStocks use; raw amounts must be multiplied by it for UI amounts.
 */

export type JupiterPrice = {
  usdPrice: number;
  blockId?: number;
  decimals: number;
  priceChange24h?: number;
  liquidity?: number;
  stockData?: { id: string; price: number; mcap?: number; updatedAt?: string };
  scaledUiConfig?: {
    multiplier: number;
    newMultiplier?: number;
    newMultiplierEffectiveAt?: string;
  };
};

export type JupiterPriceResponse = Record<string, JupiterPrice>;

const MAX_IDS_PER_CALL = 50;

export class JupiterPriceClient {
  constructor(
    private readonly base = "https://lite-api.jup.ag/price/v3",
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  async prices(mints: string[]): Promise<JupiterPriceResponse> {
    const out: JupiterPriceResponse = {};
    const unique = Array.from(new Set(mints));
    for (let i = 0; i < unique.length; i += MAX_IDS_PER_CALL) {
      const chunk = unique.slice(i, i + MAX_IDS_PER_CALL);
      const url = `${this.base}?ids=${chunk.join(",")}`;
      const res = await this.fetchImpl(url, {
        headers: { accept: "application/json" },
      });
      if (!res.ok) {
        throw new Error(`Jupiter price ${res.status} ${res.statusText}`);
      }
      Object.assign(out, (await res.json()) as JupiterPriceResponse);
    }
    return out;
  }
}

/** Current UI multiplier for a scaled-UI mint, honoring a scheduled change. */
export function currentMultiplier(p: JupiterPrice, now = new Date()): number {
  const c = p.scaledUiConfig;
  if (!c) return 1;
  if (
    c.newMultiplier != null &&
    c.newMultiplierEffectiveAt &&
    new Date(c.newMultiplierEffectiveAt) <= now
  ) {
    return c.newMultiplier;
  }
  return c.multiplier;
}
