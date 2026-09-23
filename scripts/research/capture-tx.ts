/**
 * Save a mainnet enhanced transaction as a test fixture. Read-only.
 *
 *   pnpm tsx scripts/research/capture-tx.ts <sig> <fixture-name>
 *   pnpm tsx scripts/research/capture-tx.ts --from=<wallet> --to=<wallet> <fixture-name>
 *
 * The second form reads the sender's latest 100 transactions and saves the
 * first one with a token transfer from `--from` to `--to`.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { HeliusClient } from "../../lib/helius/client";

async function main() {
  const flags = new Map(
    process.argv
      .slice(2)
      .filter((a) => a.startsWith("--"))
      .map((a) => a.slice(2).split("=") as [string, string])
  );
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const helius = new HeliusClient();

  let tx;
  let name: string;
  if (flags.has("from") && flags.has("to")) {
    const from = flags.get("from")!;
    const to = flags.get("to")!;
    name = args[0];
    const list = await helius.history(from, { limit: 100 });
    tx = list.find((t) =>
      t.tokenTransfers.some(
        (x) => x.fromUserAccount === from && x.toUserAccount === to
      )
    );
    if (!tx) throw new Error(`no transfer ${from} -> ${to} in 100 txs`);
  } else {
    const [sig, n] = args;
    name = n;
    [tx] = await helius.parseTransactions([sig]);
  }
  if (!name || !tx) throw new Error("usage: see header");
  const out = path.join(
    __dirname,
    "..",
    "..",
    "tests",
    "fixtures",
    `${name}.json`
  );
  writeFileSync(out, JSON.stringify(tx, null, 2) + "\n");
  console.log(
    "saved",
    tx.signature,
    new Date(tx.timestamp * 1000).toISOString(),
    "->",
    out
  );
}
main();
