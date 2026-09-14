import { NextResponse } from "next/server";
import { heliusRpcUrl } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * POST /api/rpc
 * JSON-RPC relay for the browser. The public mainnet RPC returns 403 on
 * sendTransaction, and the Helius key must not ship in the bundle, so the
 * wallet client talks to this route and the server adds the key.
 * Method allow-list keeps the relay from being a free general-purpose RPC.
 */
const ALLOWED = new Set([
  "getAccountInfo",
  "getMultipleAccounts",
  "getBalance",
  "getLatestBlockhash",
  "isBlockhashValid",
  "getFeeForMessage",
  "getMinimumBalanceForRentExemption",
  "getRecentPrioritizationFees",
  "getSignatureStatuses",
  "getTokenAccountsByOwner",
  "getTokenAccountBalance",
  "getEpochInfo",
  "getSlot",
  "getBlockHeight",
  "getHealth",
  "simulateTransaction",
  "sendTransaction",
]);

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const calls = Array.isArray(body) ? body : [body];
  for (const c of calls) {
    if (!c || typeof c.method !== "string" || !ALLOWED.has(c.method)) {
      return NextResponse.json(
        {
          jsonrpc: "2.0",
          id: c?.id ?? null,
          error: { code: -32601, message: "method not allowed" },
        },
        { status: 400 }
      );
    }
  }
  const upstream = await fetch(heliusRpcUrl(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: { "content-type": "application/json" },
  });
}
