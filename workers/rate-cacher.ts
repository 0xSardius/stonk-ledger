import { runLoop } from "./_loop";

/**
 * Rate cacher: stock prices via Jupiter Price and coin prices via StonkFun
 * every 60 s into `price_snapshots`; reward totals hourly into
 * `reward_snapshots`. See docs/PRD.md section 8.3. Filled in on Day 1.
 */
runLoop("rate-cacher", 60_000, async () => {
  console.log("[rate-cacher] tick: not implemented yet");
});
