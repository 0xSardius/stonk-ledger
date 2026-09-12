import { runLoop } from "./_loop";

/**
 * DRIP keeper: every 10 minutes, for each eligible delegation, transfer the
 * delegated quote tokens -> Jupiter swap into the target xStock -> send the
 * stock back to the holder. Logs transfer_sig, swap_sig, return_sig to
 * `drip_runs`. See docs/PRD.md section 7 "Keeper security design".
 * Filled in on Day 2.
 */
runLoop("drip-keeper", 600_000, async () => {
  console.log("[drip-keeper] tick: not implemented yet");
});
