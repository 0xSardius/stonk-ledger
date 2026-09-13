import { runLoop } from "./_loop";
import { snapshotQuotePrices } from "../lib/jobs/snapshot-prices";
import { snapshotRewards } from "../lib/jobs/snapshot-rewards";

/**
 * Rate cacher (PRD 8.3):
 *  - every 60 s: USD price of every quote mint via Jupiter Price v3
 *  - every 60 min: reward totals for the top 20 coins via StonkFun
 */
const HOUR = 60 * 60 * 1000;
let lastRewards = 0;

runLoop("rate-cacher", 60_000, async () => {
  const priced = await snapshotQuotePrices();
  console.log(`[rate-cacher] priced ${priced} quote mints`);
  if (Date.now() - lastRewards > HOUR) {
    lastRewards = Date.now();
    const n = await snapshotRewards(20);
    console.log(`[rate-cacher] reward snapshots for ${n} coins`);
  }
});
