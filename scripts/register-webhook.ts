/**
 * Register (or replace) the Helius enhanced webhook on the payout distributor.
 *
 *   pnpm tsx scripts/register-webhook.ts <public app url>
 *   pnpm tsx scripts/register-webhook.ts --list
 *   pnpm tsx scripts/register-webhook.ts --delete <webhookID>
 *
 * Requires HELIUS_API_KEY and HELIUS_WEBHOOK_SECRET in .env. The secret is
 * sent back by Helius in the Authorization header on every push.
 * Endpoint verified 2026-09-13: GET/POST https://api.helius.xyz/v0/webhooks?api-key=KEY
 */
import { sql } from "drizzle-orm";
import { db, schema } from "../lib/db";
import { requireEnv } from "../lib/env";

const KEY = requireEnv("HELIUS_API_KEY");
const BASE = `https://api.helius.xyz/v0/webhooks`;
const [arg, arg2] = process.argv.slice(2);

async function api(path: string, init?: RequestInit) {
  const res = await fetch(
    `${BASE}${path}${path.includes("?") ? "&" : "?"}api-key=${KEY}`,
    init
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`Helius ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function main() {
  if (arg === "--list") {
    console.log(JSON.stringify(await api(""), null, 2));
    return;
  }
  if (arg === "--delete") {
    await api(`/${arg2}`, { method: "DELETE" });
    console.log("deleted", arg2);
    return;
  }
  if (!arg || !arg.startsWith("http")) {
    throw new Error(
      "usage: register-webhook.ts <https://your-app> | --list | --delete <id>"
    );
  }
  const secret = requireEnv("HELIUS_WEBHOOK_SECRET");
  const rows = await db()
    .select({ signers: schema.coins.distributorSigners })
    .from(schema.coins)
    .where(sql`${schema.coins.active} = true`);
  const addresses = Array.from(new Set(rows.flatMap((r) => r.signers)));
  if (addresses.length === 0)
    throw new Error("no distributor signers in coins");

  const body = {
    webhookURL: `${arg.replace(/\/$/, "")}/api/webhooks/helius`,
    transactionTypes: ["TRANSFER"],
    accountAddresses: addresses,
    webhookType: "enhanced",
    authHeader: secret,
  };
  // replace any existing webhook that points at the same URL
  const existing = (await api("")) as {
    webhookID: string;
    webhookURL: string;
  }[];
  for (const w of existing) {
    if (w.webhookURL === body.webhookURL) {
      await api(`/${w.webhookID}`, { method: "DELETE" });
      console.log("replaced", w.webhookID);
    }
  }
  const created = await api("", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  console.log(
    "created",
    JSON.stringify({ ...created, authHeader: "<redacted>" }, null, 2)
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
