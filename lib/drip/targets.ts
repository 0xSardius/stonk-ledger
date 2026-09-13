/**
 * Default Stock DRIP targets. Deep xStock pools first (PRD section 14 risk:
 * thin pools fill badly). All are Token-2022 mints with 8 decimals, issued by
 * Backed. Mints verified against the seeded StonkFun quote list 2026-09-13.
 */
export type DripTarget = {
  symbol: string;
  name: string;
  mint: string;
  decimals: number;
};

export const DRIP_TARGETS: DripTarget[] = [
  {
    symbol: "SPYx",
    name: "S&P 500 (SPY)",
    mint: "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W",
    decimals: 8,
  },
  {
    symbol: "QQQx",
    name: "Nasdaq-100 (QQQ)",
    mint: "Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ",
    decimals: 8,
  },
  {
    symbol: "NVDAx",
    name: "NVIDIA",
    mint: "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh",
    decimals: 8,
  },
  {
    symbol: "APPLx",
    name: "Apple",
    mint: "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp",
    decimals: 8,
  },
  {
    symbol: "TSLAx",
    name: "Tesla",
    mint: "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB",
    decimals: 8,
  },
  {
    symbol: "GLDx",
    name: "Gold (GLD)",
    mint: "Xsv9hRk1z5ystj9MhnA7Lq4vjSsLwzL2nxrwmwtD3re",
    decimals: 8,
  },
  {
    symbol: "MCDx",
    name: "McDonald's",
    mint: "XsqE9cRRpzxcGKDXj1BJ7Xmg4GRhZoyY1KpmGSxAWT2",
    decimals: 8,
  },
];

export const DEFAULT_TARGET = DRIP_TARGETS[0];

export function findTarget(mint: string) {
  return DRIP_TARGETS.find((t) => t.mint === mint) ?? null;
}

/** DRIP fee, taken from the swap output in the target stock. PRD F2. */
export const DRIP_FEE_BPS = 100;
/** Minimum pending value before the keeper sweeps. PRD F2. */
export const DEFAULT_THRESHOLD_USD = 5;
