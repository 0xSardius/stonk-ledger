import { NextResponse, after } from "next/server";
import { env } from "@/lib/env";
import type { ParsedTx } from "@/lib/helius/client";
import { ingestBatch } from "@/lib/jobs/ingest-batch";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/webhooks/helius
 * Helius enhanced webhook on the distributor address. Body is an array of
 * enhanced transactions. The `authHeader` set at registration is echoed in
 * the Authorization header. Helius wants a 200 within one second and retries
 * three times otherwise, so the response goes out first and ingestion runs in
 * `after()`. Inserts are idempotent on (sig, wallet), so retries are safe.
 */
export async function POST(req: Request) {
  const secret = env.HELIUS_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "webhook not configured" },
      { status: 503 }
    );
  }
  if (req.headers.get("authorization") !== secret) {
    // 403 is the one status Helius does not retry
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const body = (await req.json().catch(() => null)) as
    ParsedTx[] | ParsedTx | null;
  const txs = Array.isArray(body) ? body : body ? [body] : [];

  after(async () => {
    let batches = 0;
    let inserted = 0;
    for (const tx of txs) {
      try {
        const r = await ingestBatch(tx);
        batches += r.batches;
        inserted += r.inserted;
      } catch (err) {
        console.error(`[webhook] ${tx.signature?.slice(0, 8)} failed`, err);
      }
    }
    if (txs.length)
      console.log(
        `[webhook] ${txs.length} txs, ${batches} batches, ${inserted} payouts`
      );
  });

  return NextResponse.json({ ok: true, received: txs.length });
}
