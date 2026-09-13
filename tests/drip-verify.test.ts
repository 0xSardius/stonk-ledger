import { describe, expect, test } from "vitest";
import { checkApproval, type TokenAccountState } from "../lib/drip/verify";

const KEEPER = "Hsmuc8GQADgdg6FrSUx9dFmR9HBEVRSDd3YNyTjyt5t3";
const HOLDER = "6FpuXT6kJUq5AAHrsENiX9DWZqyyGwvQxYUUstVx3DNY";
const STONK = "6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx";

/** Shape of readTokenAccount() for the KNOTS whale's STONK account after ApproveChecked. */
const approved: TokenAccountState = {
  owner: HOLDER,
  mint: STONK,
  amountRaw: 212_745_693_969_095n,
  delegate: KEEPER,
  delegatedAmountRaw: 1_000_000_000_000n,
};

describe("checkApproval (keeper-side delegation check)", () => {
  test("accepts a delegation to the keeper at or above the cap", () => {
    const r = checkApproval(approved, {
      owner: HOLDER,
      mint: STONK,
      delegate: KEEPER,
      minCapRaw: 1_000_000_000_000n,
    });
    expect(r).toEqual({
      ok: true,
      delegatedAmountRaw: 1_000_000_000_000n,
      amountRaw: 212_745_693_969_095n,
    });
  });

  test("rejects a delegate that is not the keeper", () => {
    const r = checkApproval(
      { ...approved, delegate: "someone-else" },
      { owner: HOLDER, mint: STONK, delegate: KEEPER, minCapRaw: 1n }
    );
    expect(r).toMatchObject({
      ok: false,
      reason: "delegate is not the keeper",
    });
  });

  test("rejects a revoked account (no delegate)", () => {
    const r = checkApproval(
      { ...approved, delegate: null, delegatedAmountRaw: 0n },
      { owner: HOLDER, mint: STONK, delegate: KEEPER, minCapRaw: 1n }
    );
    expect(r.ok).toBe(false);
  });

  test("rejects a cap larger than what was delegated, wrong owner, wrong mint", () => {
    expect(
      checkApproval(approved, {
        owner: HOLDER,
        mint: STONK,
        delegate: KEEPER,
        minCapRaw: 2_000_000_000_000n,
      })
    ).toMatchObject({
      ok: false,
      reason: "delegated amount below the requested cap",
    });
    expect(
      checkApproval(approved, {
        owner: "x",
        mint: STONK,
        delegate: KEEPER,
        minCapRaw: 1n,
      })
    ).toMatchObject({ ok: false, reason: "account owner mismatch" });
    expect(
      checkApproval(approved, {
        owner: HOLDER,
        mint: "y",
        delegate: KEEPER,
        minCapRaw: 1n,
      })
    ).toMatchObject({ ok: false, reason: "account mint mismatch" });
  });
});
