/**
 * Operator tool: inspect or retarget one DRIP delegation row.
 * The on-chain approval is for the quote token and does not change; only the
 * app-side target (and optionally the sweep threshold) does. Used for the
 * owner's test wallet when demonstrating a new target issuer.
 *
 *   pnpm tsx scripts/set-delegation-target.ts <wallet> <quoteMint>
 *   pnpm tsx scripts/set-delegation-target.ts <wallet> <quoteMint> --target=<mint> [--threshold=0.02]
 */
import { and, desc, eq, isNull } from "drizzle-orm";
import { db, schema } from "../lib/db";
import { findTarget } from "../lib/drip/targets";

const [wallet, quoteMint, ...flags] = process.argv.slice(2);
const flag = (name: string) =>
  flags.find((f) => f.startsWith(`--${name}=`))?.split("=")[1];

async function main() {
  if (!wallet || !quoteMint) {
    console.error(
      "usage: <wallet> <quoteMint> [--target=<mint>] [--threshold=<usd>]"
    );
    process.exit(2);
  }
  const d = db();
  const [row] = await d
    .select()
    .from(schema.dripDelegations)
    .where(
      and(
        eq(schema.dripDelegations.wallet, wallet),
        eq(schema.dripDelegations.quoteMint, quoteMint),
        isNull(schema.dripDelegations.revokedSig)
      )
    );
  if (!row) {
    console.error("no active delegation for that wallet and quote mint");
    process.exit(1);
  }
  console.log("delegation", {
    target: findTarget(row.targetMint)?.symbol ?? row.targetMint,
    capRaw: row.capRaw.toString(),
    thresholdUsd: row.thresholdUsd,
    createdAt: row.createdAt,
  });

  const runs = await d
    .select({
      ts: schema.dripRuns.ts,
      inAmount: schema.dripRuns.inAmount,
      outMint: schema.dripRuns.outMint,
      outAmount: schema.dripRuns.outAmount,
      swapSig: schema.dripRuns.swapSig,
      returnSig: schema.dripRuns.returnSig,
    })
    .from(schema.dripRuns)
    .where(eq(schema.dripRuns.wallet, wallet))
    .orderBy(desc(schema.dripRuns.ts))
    .limit(5);
  console.log("recent runs", runs);

  const target = flag("target");
  const threshold = flag("threshold");
  if (!target && !threshold) return;

  if (target && !findTarget(target)) {
    console.error("unknown target mint");
    process.exit(1);
  }
  await d
    .update(schema.dripDelegations)
    .set({
      ...(target ? { targetMint: target } : {}),
      ...(threshold ? { thresholdUsd: threshold } : {}),
    })
    .where(
      and(
        eq(schema.dripDelegations.wallet, wallet),
        eq(schema.dripDelegations.quoteMint, quoteMint)
      )
    );
  console.log("updated", {
    target: target ? findTarget(target)?.symbol : "(unchanged)",
    threshold: threshold ?? "(unchanged)",
  });
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  }
);
