import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { keeperConnection, keeperSigner } from "@/lib/drip/keeper";
import { readTokenAccount } from "@/lib/drip/verify";

export const dynamic = "force-dynamic";

const Body = z.object({
  wallet: z.string().min(32),
  quoteMint: z.string().min(32),
  revokedSig: z.string().min(32),
});

/**
 * POST /api/drip/revoke
 * Called after the holder signs Revoke on the quote token account. Confirms
 * on chain that the keeper is no longer the delegate, then closes the row.
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const b = parsed.data;
  const [del] = await db()
    .select()
    .from(schema.dripDelegations)
    .where(
      and(
        eq(schema.dripDelegations.wallet, b.wallet),
        eq(schema.dripDelegations.quoteMint, b.quoteMint)
      )
    )
    .limit(1);
  if (!del)
    return NextResponse.json({ error: "no delegation" }, { status: 404 });

  const keeper = (await keeperSigner()).address;
  const { rpc } = keeperConnection();
  const state = await readTokenAccount(
    rpc,
    del.quoteTokenAccount,
    del.quoteProgram
  );
  if (state.delegate === keeper && state.delegatedAmountRaw > 0n) {
    return NextResponse.json(
      { error: "keeper is still the delegate on chain" },
      { status: 409 }
    );
  }
  await db()
    .update(schema.dripDelegations)
    .set({ revokedSig: b.revokedSig })
    .where(
      and(
        eq(schema.dripDelegations.wallet, b.wallet),
        eq(schema.dripDelegations.quoteMint, b.quoteMint)
      )
    );
  return NextResponse.json({ ok: true });
}
