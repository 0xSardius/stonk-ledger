import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ParsedTx } from "../lib/helius/client";
import { classifyTx, hasDexProgram } from "../lib/classify";

const load = (name: string) =>
  JSON.parse(
    readFileSync(path.join(__dirname, "fixtures", name), "utf8")
  ) as ParsedTx;

const DISTRIBUTOR = "5KXDF6QnqhBj72hDtJNkkpFaQVUfbFXNybMsp3DiK6tD";
const APPLX = "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp";
const STONK = "6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx";

const treePayout = load("helius-payout-tree.json");
const knotsPayout = load("helius-payout-knots.json");
const knotsSwap = load("helius-swap-knots.json");

describe("payout classifier (mainnet fixtures)", () => {
  test("TREE: Token-2022 APPLx batch from the distributor is a payout", () => {
    const holder = treePayout.tokenTransfers.find(
      (t) => t.mint === APPLX
    )!.toUserAccount;
    const r = classifyTx(
      treePayout,
      holder,
      { quoteMint: APPLX, distributorSigners: [DISTRIBUTOR] },
      8
    );
    expect(r.kind).toBe("payout");
    if (r.kind !== "payout") return;
    expect(r.payout.probable).toBe(false);
    expect(r.payout.signer).toBe(DISTRIBUTOR);
    expect(r.payout.destinations).toBeGreaterThanOrEqual(8);
    expect(r.payout.amountUi).toBeGreaterThan(0);
    expect(r.payout.amountRaw).not.toBeNull();
    expect(r.payout.blockTime.getFullYear()).toBe(2026);
  });

  test("KNOTS: SPL STONK batch from the distributor is a payout", () => {
    const holder = knotsPayout.tokenTransfers.find(
      (t) => t.mint === STONK
    )!.toUserAccount;
    const r = classifyTx(knotsPayout, holder, {
      quoteMint: STONK,
      distributorSigners: [DISTRIBUTOR],
    });
    expect(r.kind).toBe("payout");
    if (r.kind !== "payout") return;
    expect(r.payout.probable).toBe(false);
    expect(r.payout.amountRaw).toBeNull();
  });

  test("KNOTS: a Jupiter swap that delivers STONK is not a payout", () => {
    const holder = knotsSwap.tokenTransfers.find(
      (t) => t.mint === STONK
    )!.toUserAccount;
    expect(hasDexProgram(knotsSwap)).toBe(true);
    const r = classifyTx(knotsSwap, holder, {
      quoteMint: STONK,
      distributorSigners: [DISTRIBUTOR],
    });
    expect(r.kind).toBe("swap");
  });

  test("unknown distributor: big batch is a probable payout, small is other", () => {
    const holder = treePayout.tokenTransfers.find(
      (t) => t.mint === APPLX
    )!.toUserAccount;
    const r = classifyTx(treePayout, holder, {
      quoteMint: APPLX,
      distributorSigners: [],
    });
    expect(r.kind).toBe("payout");
    if (r.kind === "payout") expect(r.payout.probable).toBe(true);

    const small: ParsedTx = {
      ...treePayout,
      tokenTransfers: treePayout.tokenTransfers
        .filter((t) => t.toUserAccount === holder)
        .slice(0, 1),
    };
    expect(
      classifyTx(small, holder, { quoteMint: APPLX, distributorSigners: [] })
        .kind
    ).toBe("other");
  });

  test("wrong wallet or wrong mint is other", () => {
    expect(
      classifyTx(treePayout, "nobody", {
        quoteMint: APPLX,
        distributorSigners: [DISTRIBUTOR],
      }).kind
    ).toBe("other");
    const holder = treePayout.tokenTransfers[0].toUserAccount;
    expect(
      classifyTx(treePayout, holder, {
        quoteMint: STONK,
        distributorSigners: [DISTRIBUTOR],
      }).kind
    ).toBe("other");
  });
});
