/**
 * Run one job once, then exit. Useful for smoke tests and cron-style runs.
 *
 *   pnpm job snapshot-prices
 *   pnpm job snapshot-rewards [limit]
 *   pnpm job drip-once            # one keeper pass over every active delegation
 */
const [jobName, ...rest] = process.argv.slice(2);

async function main() {
  switch (jobName) {
    case "snapshot-prices": {
      const { snapshotQuotePrices } =
        await import("../lib/jobs/snapshot-prices");
      console.log("priced", await snapshotQuotePrices());
      return;
    }
    case "snapshot-rewards": {
      const { snapshotRewards } = await import("../lib/jobs/snapshot-rewards");
      console.log("snapshots", await snapshotRewards(Number(rest[0] ?? 20)));
      return;
    }
    case "drip-once": {
      const { isNull } = await import("drizzle-orm");
      const { db, schema } = await import("../lib/db");
      const { runDelegation } = await import("../lib/drip/run");
      const active = await db()
        .select()
        .from(schema.dripDelegations)
        .where(isNull(schema.dripDelegations.revokedSig));
      console.log(`${active.length} active delegations`);
      const { indexWallet } = await import("../lib/jobs/index-wallet");
      for (const del of active) {
        // the keeper refreshes its own wallets' payouts from chain before
        // deciding what is pending; it does not depend on platform ingestion
        try {
          await indexWallet(del.wallet, { maxPages: 2 });
        } catch (err) {
          console.error(`index ${del.wallet.slice(0, 8)} failed`, err);
        }
        // one delegation's failure must not stop the ones after it
        try {
          const r = await runDelegation(del);
          console.log(
            del.wallet.slice(0, 8),
            JSON.stringify(r, (_k, v) =>
              typeof v === "bigint" ? v.toString() : v
            )
          );
        } catch (err) {
          console.error(`run ${del.wallet.slice(0, 8)} failed`, err);
        }
      }
      return;
    }
    case "ingest-distributor": {
      const { ingestDistributor } =
        await import("../lib/jobs/ingest-distributor");
      const s = await ingestDistributor({
        maxPages: Number(rest[0] ?? 30),
        log: console.log,
      });
      console.log("ingested", s);
      return;
    }
    case "rollup-batches": {
      const { rollupBatches } = await import("../lib/jobs/rollup-batches");
      console.log("rolled up", await rollupBatches(Number(rest[0] ?? 14)));
      return;
    }
    default:
      throw new Error(`unknown job "${jobName}"`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
