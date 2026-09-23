import { isNull } from "drizzle-orm";
import { runLoop } from "./_loop";
import { db, schema } from "../lib/db";
import { keeperConnection, keeperSigner } from "../lib/drip/keeper";
import { runDelegation } from "../lib/drip/run";

/**
 * DRIP keeper (PRD F2): every 10 minutes, run every active delegation.
 * Each run is transfer -> swap -> return with all three signatures logged.
 */
const INTERVAL_MS = Number(process.env.DRIP_KEEPER_INTERVAL_MS ?? 600_000);

runLoop("drip-keeper", INTERVAL_MS, async () => {
  const keeper = await keeperSigner();
  const conn = keeperConnection();
  const active = await db()
    .select()
    .from(schema.dripDelegations)
    .where(isNull(schema.dripDelegations.revokedSig));
  console.log(
    `[drip-keeper] ${active.length} active delegations, keeper ${keeper.address}`
  );
  for (const del of active) {
    try {
      const r = await runDelegation(del, { keeper, conn });
      const w = del.wallet.slice(0, 8);
      if (r.status === "swept") {
        console.log(
          `[drip-keeper] ${w}… swept ${r.inUi} -> ${r.outUi} | ${r.transferSig.slice(0, 8)} ${r.swapSig.slice(0, 8)} ${r.returnSig.slice(0, 8)}`
        );
      } else if (r.status === "skipped") {
        console.log(
          `[drip-keeper] ${w}… skip: ${r.reason}${r.pendingUsd != null ? ` ($${r.pendingUsd.toFixed(2)} pending)` : ""}`
        );
      } else if (r.status === "unfinished") {
        console.log(`[drip-keeper] ${w}… ${r.runStatus}: ${r.note}`);
      } else {
        console.error(`[drip-keeper] ${w}… ${r.status}: ${r.error}`);
      }
    } catch (err) {
      console.error(`[drip-keeper] ${del.wallet.slice(0, 8)}… threw`, err);
    }
  }
});
