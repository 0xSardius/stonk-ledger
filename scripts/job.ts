/**
 * Run one job once, then exit. Useful for smoke tests and cron-style runs.
 *
 *   pnpm job snapshot-prices
 *   pnpm job snapshot-rewards [limit]
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
