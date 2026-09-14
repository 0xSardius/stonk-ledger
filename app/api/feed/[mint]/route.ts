import { NextResponse } from "next/server";
import { getCoinFeed } from "@/lib/feed";

export const dynamic = "force-dynamic";

/** GET /api/feed/[mint]: proof feed for a coin as JSON. */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ mint: string }> }
) {
  const { mint } = await ctx.params;
  const limit = Math.min(
    200,
    Number(new URL(req.url).searchParams.get("limit") ?? 50) || 50
  );
  const f = await getCoinFeed(mint, limit);
  if (!f) return NextResponse.json({ error: "unknown coin" }, { status: 404 });
  return NextResponse.json(f);
}
