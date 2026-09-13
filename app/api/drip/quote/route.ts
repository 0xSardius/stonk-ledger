import { NextResponse } from "next/server";
import { UltraClient } from "@/lib/drip/ultra";
import { splitFee } from "@/lib/drip/plan";

export const dynamic = "force-dynamic";

/**
 * GET /api/drip/quote?inputMint&outputMint&amount
 * Price-only Ultra order (no taker) so the approval screen can show the
 * expected fill, price impact, and the 1% fee before the wallet prompt.
 */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const inputMint = p.get("inputMint");
  const outputMint = p.get("outputMint");
  const amount = p.get("amount");
  if (!inputMint || !outputMint || !amount) {
    return NextResponse.json(
      { error: "inputMint, outputMint, amount required" },
      { status: 400 }
    );
  }
  try {
    const o = await new UltraClient().order({
      inputMint,
      outputMint,
      amount: BigInt(amount),
    });
    const { toHolderRaw, feeRaw } = splitFee(BigInt(o.outAmount));
    return NextResponse.json({
      inAmount: o.inAmount,
      outAmount: o.outAmount,
      toHolderAmount: toHolderRaw.toString(),
      feeAmount: feeRaw.toString(),
      priceImpactPct: o.priceImpactPct,
      slippageBps: o.slippageBps,
      inUsdValue: o.inUsdValue ?? null,
      outUsdValue: o.outUsdValue ?? null,
      router: o.router ?? null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: String((err as Error).message) },
      { status: 502 }
    );
  }
}
