/**
 * Jupiter Ultra: order -> sign -> execute. Verified live 2026-09-13 on the
 * free host with a STONK -> SPYx (Token-2022) order:
 *   GET  https://lite-api.jup.ag/ultra/v1/order?inputMint&outputMint&amount&taker
 *   POST https://lite-api.jup.ag/ultra/v1/execute { signedTransaction, requestId }
 * Response fields used: requestId, transaction (base64, unsigned), inAmount,
 * outAmount, otherAmountThreshold, priceImpactPct, slippageBps, feeBps,
 * inUsdValue, outUsdValue, router, errorMessage/errorCode on failure.
 * Signed payloads expire in about 2 minutes. Execute is idempotent on
 * (signedTransaction, requestId) for that window.
 */

export type UltraOrder = {
  requestId: string;
  transaction: string | null;
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  /** Jupiter returns this as a string on some routers. */
  priceImpactPct: number | string;
  slippageBps: number;
  feeBps: number;
  inUsdValue?: number;
  outUsdValue?: number;
  router?: string;
  swapType?: string;
  errorMessage?: string;
  errorCode?: number;
};

export type UltraExecute = {
  status: "Success" | "Failed";
  signature?: string;
  inputAmountResult?: string;
  outputAmountResult?: string;
  code?: number;
  error?: string;
};

export class UltraClient {
  constructor(
    private readonly base = "https://lite-api.jup.ag/ultra/v1",
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  /** Quote or build a swap. Omit `taker` for a price-only dry run. */
  async order(input: {
    inputMint: string;
    outputMint: string;
    amount: bigint;
    taker?: string;
  }): Promise<UltraOrder> {
    const p = new URLSearchParams({
      inputMint: input.inputMint,
      outputMint: input.outputMint,
      amount: input.amount.toString(),
    });
    if (input.taker) p.set("taker", input.taker);
    const res = await this.fetchImpl(`${this.base}/order?${p}`, {
      headers: { accept: "application/json" },
    });
    const body = (await res.json()) as UltraOrder;
    if (!res.ok || body.errorMessage) {
      throw new Error(
        `Ultra order failed: ${res.status} ${body.errorMessage ?? ""}`.trim()
      );
    }
    return body;
  }

  async execute(signedTransaction: string, requestId: string) {
    const res = await this.fetchImpl(`${this.base}/execute`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({ signedTransaction, requestId }),
    });
    const body = (await res.json()) as UltraExecute;
    if (!res.ok || body.status !== "Success") {
      throw new Error(
        `Ultra execute failed: ${body.error ?? body.code ?? res.status}`
      );
    }
    return body;
  }
}
