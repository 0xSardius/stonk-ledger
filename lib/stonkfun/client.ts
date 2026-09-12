/**
 * StonkFun public API client. No key, 300 req/min.
 * Base: https://www.stonkfun.xyz/api/public/v1 (OpenAPI at /openapi.json).
 *
 * Field names below were verified against live responses on 2026-09-12.
 * The OpenAPI spec leaves item shapes as generic objects, so this file is
 * the source of truth for the shapes we depend on.
 */

export const QUOTE_CATEGORIES = [
  "xstock",
  "backpack",
  "prestock",
  "custom",
] as const;
export type QuoteCategory = (typeof QUOTE_CATEGORIES)[number];

export type StonkFunToken = {
  mint: string;
  pool: string;
  name: string;
  symbol: string;
  quote: {
    mint: string;
    symbol: string;
    name: string;
    logoUrl?: string;
    category: string;
    categoryLabel?: string;
  };
  launchpad: string;
  mode: "reward" | "standard" | string;
  quoteOnlyFees?: boolean;
  transferFee?: { bps: number };
  flywheel?: { active: boolean };
  imageUrl?: string;
  links?: Record<string, string>;
  market?: {
    priceUsd?: number;
    marketCapUsd?: number;
    fdvUsd?: number;
    volume24hUsd?: number;
    liquidityUsd?: number;
    priceChange24h?: number;
    peakMarketCapUsd?: number;
  };
  status: "graduated" | "bonding" | string;
  graduationProgress?: number;
  graduatedAt?: string | null;
  createdAt: string;
};

export type StonkFunTokensResponse = {
  data: {
    tokens: StonkFunToken[];
    pagination: {
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
    };
    network: string;
  };
  meta: { generatedAt: string };
};

export type StonkFunRewardsResponse = {
  data: {
    mint: string;
    mode: "reward" | "standard" | string;
    quote: { mint: string; symbol: string; decimals: number } | null;
    rewards: {
      distributedRaw: string;
      distributedTokens: number;
      undistributedRaw: string;
      undistributedTokens: number;
      payoutCount: number;
      holderCount: number;
      lastPayoutAt: string | null;
    } | null;
  };
  meta: { generatedAt: string };
};

export type TokensQuery = {
  mode?: "reward" | "standard";
  category?: QuoteCategory;
  status?: string;
  quoteMint?: string;
  q?: string;
  sort?: "marketCap" | "volume24h" | string;
  page?: number;
  pageSize?: number;
};

export class StonkFunClient {
  constructor(
    private readonly base = "https://www.stonkfun.xyz/api/public/v1",
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  private async get<T>(path: string, params?: Record<string, unknown>) {
    const url = new URL(`${this.base}${path}`);
    for (const [k, v] of Object.entries(params ?? {})) {
      if (v != null) url.searchParams.set(k, String(v));
    }
    const res = await this.fetchImpl(url, {
      headers: { accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`StonkFun ${res.status} ${res.statusText} for ${url}`);
    }
    return (await res.json()) as T;
  }

  tokens(query: TokensQuery = {}) {
    return this.get<StonkFunTokensResponse>("/tokens", query);
  }

  rewards(mint: string) {
    return this.get<StonkFunRewardsResponse>(`/tokens/${mint}/rewards`);
  }

  /** Page through `/tokens` until `maxPages` or the last page. */
  async *allTokens(query: Omit<TokensQuery, "page">, maxPages = Infinity) {
    let page = 1;
    while (page <= maxPages) {
      const res = await this.tokens({ ...query, page });
      yield res.data.tokens;
      if (page >= res.data.pagination.totalPages) return;
      page += 1;
    }
  }
}
