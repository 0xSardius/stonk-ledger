/**
 * The approve route records a delegation only for an approval the holder
 * signed (2026-09-22 review: the on-chain delegate alone is public, so an
 * unauthenticated POST could rewrite another holder's target). Fixture: the
 * owner's first mainnet approval, 6aHSyKNi…, as RPC getTransaction jsonParsed.
 */
import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  APPROVAL_MAX_AGE_SEC,
  checkApprovalTx,
  type ApprovalTx,
} from "../lib/drip/verify";

const tx = JSON.parse(
  readFileSync(
    path.join(__dirname, "fixtures", "rpc-drip-approve.json"),
    "utf8"
  )
) as ApprovalTx;

const HOLDER = "88tvtBFWdb814MGm2PoGXXDqpEvntpxEwC8ayhbbJoN";
const KEEPER = "Hsmuc8GQADgdg6FrSUx9dFmR9HBEVRSDd3YNyTjyt5t3";
const STONK = "6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx";
const HOLDER_STONK = "HPp2EuPyckvgSnEeLdoe3vGCgnSWm8JYJxffGWS9kNXN";
const signedAt = Number(tx.blockTime);

const expectFor = (
  over: Partial<Parameters<typeof checkApprovalTx>[1]> = {}
) => ({
  owner: HOLDER,
  tokenAccount: HOLDER_STONK,
  mint: STONK,
  delegate: KEEPER,
  nowSec: signedAt + 60,
  ...over,
});

describe("approval must be signed by the holder", () => {
  test("the real approval passes a minute after it landed", () => {
    expect(checkApprovalTx(tx, expectFor())).toEqual({ ok: true });
  });

  test("someone else's wallet cannot use it", () => {
    const r = checkApprovalTx(
      tx,
      expectFor({ owner: KEEPER }) // any wallet that did not sign
    );
    expect(r).toMatchObject({ ok: false, reason: /not signed/ });
  });

  test("it does not cover a different token account or delegate", () => {
    expect(checkApprovalTx(tx, expectFor({ tokenAccount: KEEPER })).ok).toBe(
      false
    );
    expect(checkApprovalTx(tx, expectFor({ delegate: HOLDER })).ok).toBe(false);
  });

  test("an old approval cannot be replayed", () => {
    const r = checkApprovalTx(
      tx,
      expectFor({ nowSec: signedAt + APPROVAL_MAX_AGE_SEC + 1 })
    );
    expect(r).toMatchObject({ ok: false, reason: /too old/ });
  });

  test("a failed or missing transaction is refused", () => {
    expect(checkApprovalTx(null, expectFor()).ok).toBe(false);
    expect(
      checkApprovalTx(
        { ...tx, meta: { ...tx.meta!, err: { InstructionError: [2, 1] } } },
        expectFor()
      ).ok
    ).toBe(false);
  });
});
