/**
 * Stock DRIP targets. Three issuers:
 *
 * - xStocks (Backed): Token-2022, 8 decimals. Deep pools first (PRD section 14
 *   risk: thin pools fill badly). Mints verified against the seeded StonkFun
 *   quote list 2026-09-13.
 * - PreStocks (pre-IPO, SPV-backed): Token-2022, 9 decimals. Mints from
 *   https://prestocks.com/api/prestocks on 2026-09-16; these are also quote
 *   mints of 300 seeded StonkFun coins.
 * - Tessera (pre-IPO T-Tokens): Token-2022, 9 decimals. Mints from
 *   https://rest-api.tessera.pe/v1/public/token-details on 2026-09-16.
 *
 * Every mint here was priced on Jupiter Price v3 with at least $85k of
 * liquidity on 2026-09-16, and Ultra dry-runs routed STONK into T-OpenAI and
 * ANTHROPIC. The keeper (lib/drip/run.ts) treats every target as Token-2022.
 */
export type DripIssuer = "xStocks" | "PreStocks" | "Tessera";

export type DripTarget = {
  symbol: string;
  name: string;
  mint: string;
  decimals: number;
  issuer: DripIssuer;
};

export const DRIP_ISSUERS: { id: DripIssuer; label: string; note: string }[] = [
  { id: "xStocks", label: "Public stocks", note: "xStocks by Backed" },
  { id: "PreStocks", label: "Pre-IPO", note: "PreStocks" },
  { id: "Tessera", label: "Pre-IPO", note: "Tessera T-Tokens" },
];

const XSTOCKS: DripTarget[] = [
  {
    symbol: "SPYx",
    name: "S&P 500 (SPY)",
    mint: "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W",
    decimals: 8,
    issuer: "xStocks",
  },
  {
    symbol: "QQQx",
    name: "Nasdaq-100 (QQQ)",
    mint: "Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ",
    decimals: 8,
    issuer: "xStocks",
  },
  {
    symbol: "NVDAx",
    name: "NVIDIA",
    mint: "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh",
    decimals: 8,
    issuer: "xStocks",
  },
  {
    symbol: "APPLx",
    name: "Apple",
    mint: "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp",
    decimals: 8,
    issuer: "xStocks",
  },
  {
    symbol: "TSLAx",
    name: "Tesla",
    mint: "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB",
    decimals: 8,
    issuer: "xStocks",
  },
  {
    symbol: "GLDx",
    name: "Gold (GLD)",
    mint: "Xsv9hRk1z5ystj9MhnA7Lq4vjSsLwzL2nxrwmwtD3re",
    decimals: 8,
    issuer: "xStocks",
  },
  {
    symbol: "MCDx",
    name: "McDonald's",
    mint: "XsqE9cRRpzxcGKDXj1BJ7Xmg4GRhZoyY1KpmGSxAWT2",
    decimals: 8,
    issuer: "xStocks",
  },
];

const PRESTOCKS: DripTarget[] = [
  {
    symbol: "OPENAI",
    name: "OpenAI (PreStocks)",
    mint: "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF",
    decimals: 9,
    issuer: "PreStocks",
  },
  {
    symbol: "ANTHROPIC",
    name: "Anthropic (PreStocks)",
    mint: "Pren1FvFX6J3E4kXhJuCiAD5aDmGEb7qJRncwA8Lkhw",
    decimals: 9,
    issuer: "PreStocks",
  },
  {
    symbol: "ANDURIL",
    name: "Anduril (PreStocks)",
    mint: "PresTj4Yc2bAR197Er7wz4UUKSfqt6FryBEdAriBoQB",
    decimals: 9,
    issuer: "PreStocks",
  },
  {
    symbol: "NEURALINK",
    name: "Neuralink (PreStocks)",
    mint: "PrekqLJvJ3qVdXmBGDiexvwUTF4rLFDa6HWS4HJbw9S",
    decimals: 9,
    issuer: "PreStocks",
  },
  {
    symbol: "POLYMARKET",
    name: "Polymarket (PreStocks)",
    mint: "Pre8AREmFPtoJFT8mQSXQLh56cwJmM7CFDRuoGBZiUP",
    decimals: 9,
    issuer: "PreStocks",
  },
  {
    symbol: "SPACEX",
    name: "SpaceX (PreStocks)",
    mint: "PreANxuXjsy2pvisWWMNB6YaJNzr7681wJJr2rHsfTh",
    decimals: 9,
    issuer: "PreStocks",
  },
  {
    symbol: "KALSHI",
    name: "Kalshi (PreStocks)",
    mint: "PreLWGkkeqG1s4HEfFZSy9moCrJ7btsHuUtfcCeoRua",
    decimals: 9,
    issuer: "PreStocks",
  },
  {
    symbol: "FIGUREAI",
    name: "Figure AI (PreStocks)",
    mint: "PreZad18qfPtbxNpMtMuAuX2zVpvkEU8DnJx56faCWd",
    decimals: 9,
    issuer: "PreStocks",
  },
];

const TESSERA: DripTarget[] = [
  {
    symbol: "T-OpenAI",
    name: "OpenAI (Tessera)",
    mint: "oPAiAikWTaFj9RYoRFD35ccfwhnMcB3ThgBZRHSkjTZ",
    decimals: 9,
    issuer: "Tessera",
  },
  {
    symbol: "T-Kalshi",
    name: "Kalshi (Tessera)",
    mint: "TKLSidmLVt3cqGaaodG8tyRzoANfQwoh67AccjmubeZ",
    decimals: 9,
    issuer: "Tessera",
  },
  {
    symbol: "T-SpaceX",
    name: "SpaceX (Tessera)",
    mint: "TSPXcLV76s6V2zDiZQ18kBfcbnjaE2ZzNT3ga2Pd99v",
    decimals: 9,
    issuer: "Tessera",
  },
];

export const DRIP_TARGETS: DripTarget[] = [...XSTOCKS, ...PRESTOCKS, ...TESSERA];

export const DEFAULT_TARGET = DRIP_TARGETS[0];

export function findTarget(mint: string) {
  return DRIP_TARGETS.find((t) => t.mint === mint) ?? null;
}

/** DRIP fee, taken from the swap output in the target stock. PRD F2. */
export const DRIP_FEE_BPS = 100;
/** Minimum pending value before the keeper sweeps. PRD F2. */
export const DEFAULT_THRESHOLD_USD = 5;
