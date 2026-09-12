/** Proof links point at Solscan, mainnet only. */
export function getExplorerUrl(path: string): string {
  return new URL(path, "https://solscan.io").toString();
}

export function txUrl(signature: string): string {
  return getExplorerUrl(`/tx/${signature}`);
}

export function addressUrl(address: string): string {
  return getExplorerUrl(`/account/${address}`);
}

export function ellipsify(str: string, chars = 4): string {
  if (str.length <= chars * 2 + 3) return str;
  return `${str.slice(0, chars)}...${str.slice(-chars)}`;
}
