import { NextResponse } from "next/server";
import { env, heliusRpcUrl } from "@/lib/env";

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

/** The wallet flow never batches more than a few calls. */
const MAX_BATCH = 5;
const MAX_BODY_BYTES = 64 * 1024;
const MAX_KEYS = 10;

const deny = (message: string, status = 400) =>
  NextResponse.json(
    { jsonrpc: "2.0", id: null, error: { code: -32600, message } },
    { status }
  );

/**
 * Browsers always send Origin on a POST, so this stops other sites from
 * using the relay from their pages. A script can forge the header; the batch
 * and key limits below bound what one forged request can cost.
 */
function originAllowed(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  if (origin === new URL(env.NEXT_PUBLIC_APP_URL).origin) return true;
  return (
    process.env.NODE_ENV !== "production" &&
    origin.startsWith("http://localhost:")
  );
}

export async function POST(req: Request) {
  if (!originAllowed(req)) return deny("origin not allowed", 403);
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return deny("request too large", 413);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return deny("invalid JSON");
  }
  const calls = (Array.isArray(body) ? body : [body]) as {
    id?: unknown;
    method?: unknown;
    params?: unknown[];
  }[];
  if (calls.length > MAX_BATCH) return deny("batch too large");
  for (const c of calls) {
    if (
      c?.method === "getMultipleAccounts" &&
      Array.isArray(c.params?.[0]) &&
      (c.params[0] as unknown[]).length > MAX_KEYS
    )
      return deny("too many accounts");
  }
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
    body: raw,
  });
  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: { "content-type": "application/json" },
  });
}
