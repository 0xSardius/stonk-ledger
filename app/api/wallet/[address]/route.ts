import { NextResponse } from "next/server";
import { getStatement, isValidAddress } from "@/lib/statement";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GET /api/wallet/[address]: the statement as JSON (share cards, bots, x402 later). */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ address: string }> }
) {
  const { address } = await ctx.params;
  if (!isValidAddress(address)) {
    return NextResponse.json(
      { error: "not a Solana address" },
      { status: 400 }
    );
  }
  try {
    const s = await getStatement(address);
    return NextResponse.json(s);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
