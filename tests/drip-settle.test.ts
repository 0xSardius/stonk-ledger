/**
 * The DRIP run state machine (lib/drip/settle.ts) against a fake database,
 * a fake chain, and a fake Jupiter, with real transaction signing. Covers the
 * failure modes the 2026-09-22 review found: a landed swap must never be
 * refunded, and an interrupted run must be finished by the next pass.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  compileTransaction,
  createTransactionMessage,
  generateKeyPairSigner,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  type Blockhash,
  type KeyPairSigner,
} from "@solana/kit";
import type { Run, RunAccounts, SettleCtx } from "../lib/drip/settle";
import type { UltraClient } from "../lib/drip/ultra";

// ---- fake database: one drip_runs row, updated in place --------------------
const store: { row: Run | null; statuses: string[] } = {
  row: null,
  statuses: [],
};
vi.mock("../lib/db", async () => {
  const actual = await vi.importActual<typeof import("../lib/db")>("../lib/db");
  return {
    schema: actual.schema,
    db: () => ({
      update: () => ({
        set: (values: Partial<Run>) => ({
          where: () => ({
            returning: async () => {
              store.row = { ...store.row!, ...values };
              if (values.status) store.statuses.push(values.status);
              return [store.row];
            },
          }),
        }),
      }),
    }),
  };
});

const { settleRun } = await import("../lib/drip/settle");

const STONK = "6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx";
const SPYX = "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W";
const HOLDER = "88tvtBFWdb814MGm2PoGXXDqpEvntpxEwC8ayhbbJoN";
const HOLDER_STONK_ACCOUNT = "Hsmuc8GQADgdg6FrSUx9dFmR9HBEVRSDd3YNyTjyt5t3";
// a real mainnet transfer signature, used only as an opaque id
const TRANSFER_SIG =
  "2LCk6GmQsRgrzgm23e5BVk3G1mjEoTix53Ks9DNcQBMtBFLM8b1d1Xr4kFFsH3TgDWgb8NZY9EpeE7HZSbpmetqL";
const BLOCKHASH = "11111111111111111111111111111111" as Blockhash;

const acct: RunAccounts = {
  holder: HOLDER,
  quoteMint: STONK,
  quoteProgram: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  quoteDecimals: 9,
  quoteTokenAccount: HOLDER_STONK_ACCOUNT,
};

// ---- fake chain ------------------------------------------------------------
type ChainState = "landed" | "failed";
let keeper: KeyPairSigner;
let chain: Map<string, ChainState>;
/** What happens to each of our own transactions, in send order. */
let sends: ("land" | "fail")[];
let sent: string[];
let swapOutRaw: bigint;
let clock: number;

function makeConn(): SettleCtx["conn"] {
  const rpc = {
    getSignatureStatuses: ([sig]: string[]) => ({
      send: async () => {
        const s = chain.get(sig);
        return {
          value: [
            s == null
              ? null
              : s === "landed"
                ? { err: null, confirmationStatus: "confirmed" }
                : { err: { InstructionError: [0, "Custom"] } },
          ],
        };
      },
    }),
    getLatestBlockhash: () => ({
      send: async () => ({
        value: { blockhash: BLOCKHASH, lastValidBlockHeight: 100n },
      }),
    }),
    getTransaction: () => ({
      send: async () => ({
        meta: {
          preTokenBalances: [
            {
              mint: SPYX,
              owner: keeper.address,
              uiTokenAmount: { amount: "500" },
            },
          ],
          postTokenBalances: [
            {
              mint: SPYX,
              owner: keeper.address,
              uiTokenAmount: { amount: (500n + swapOutRaw).toString() },
            },
          ],
        },
      }),
    }),
  };
  return {
    rpc,
    rpcSubscriptions: null,
    sendAndConfirm: async (
      tx: Parameters<typeof getSignatureFromTransaction>[0]
    ) => {
      const sig = getSignatureFromTransaction(tx);
      sent.push(sig);
      const what = sends.shift() ?? "land";
      chain.set(sig, what === "land" ? "landed" : "failed");
      if (what === "fail") throw new Error("transaction failed");
    },
  } as unknown as SettleCtx["conn"];
}

// ---- fake Jupiter ----------------------------------------------------------
type ExecMode = "ok" | "throw-but-landed" | "throw-missing";
let execMode: ExecMode;
let lossUsd: number;
let executed: number;

async function makeUltra(inRaw: bigint): Promise<UltraClient> {
  const msg = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayer(keeper.address, m),
    (m) =>
      setTransactionMessageLifetimeUsingBlockhash(
        { blockhash: BLOCKHASH, lastValidBlockHeight: 100n },
        m
      )
  );
  const unsigned = getBase64EncodedWireTransaction(compileTransaction(msg));
  return {
    order: async () => ({
      requestId: "req-1",
      transaction: unsigned,
      inputMint: STONK,
      outputMint: SPYX,
      inAmount: inRaw.toString(),
      outAmount: swapOutRaw.toString(),
      otherAmountThreshold: swapOutRaw.toString(),
      priceImpactPct: "0",
      slippageBps: 0,
      feeBps: 10,
      inUsdValue: 10,
      outUsdValue: 10 * (1 - lossUsd),
    }),
    execute: async (signedB64: string) => {
      executed += 1;
      const { getBase64Encoder, getTransactionDecoder } =
        await import("@solana/kit");
      const tx = getTransactionDecoder().decode(
        getBase64Encoder().encode(signedB64)
      );
      const sig = getSignatureFromTransaction(tx);
      if (execMode !== "throw-missing") chain.set(sig, "landed");
      if (execMode === "ok")
        return {
          status: "Success",
          signature: sig,
          outputAmountResult: "999999", // ignored: output is read from chain
        };
      throw new Error("Ultra execute failed: -1005");
    },
  } as unknown as UltraClient;
}

const IN_RAW = 190_898_000n; // 0.190898 STONK

function freshRun(): Run {
  const row: Run = {
    id: 1,
    wallet: HOLDER,
    coinId: 7,
    inAmount: "0.190898",
    outMint: SPYX,
    outAmount: null,
    feeAmount: null,
    transferSig: TRANSFER_SIG,
    swapSig: null,
    returnSig: null,
    ts: new Date(clock),
    status: "transferring",
    statusAt: new Date(clock),
  };
  store.row = row;
  return row;
}

async function ctx(): Promise<SettleCtx> {
  return {
    keeper,
    conn: makeConn(),
    ultra: await makeUltra(IN_RAW),
    now: () => new Date(clock),
    waitMs: 0,
  };
}

beforeEach(async () => {
  keeper = await generateKeyPairSigner();
  chain = new Map([[TRANSFER_SIG, "landed"]]);
  sends = [];
  sent = [];
  swapOutRaw = 1_000n;
  clock = Date.parse("2026-09-23T12:00:00Z");
  execMode = "ok";
  lossUsd = 0.001;
  executed = 0;
  store.statuses = [];
});

describe("DRIP run state machine", () => {
  test("happy path: transfer, swap, return; output read from chain", async () => {
    const r = await settleRun(freshRun(), acct, await ctx(), {
      allowSwap: true,
    });
    expect(r.run.status).toBe("done");
    expect(store.statuses).toEqual([
      "transferred",
      "swapping",
      "swapped",
      "returning",
      "done",
    ]);
    // 1% fee from the on-chain delta of 1,000 raw, not Jupiter's 999,999
    expect(r.run.outAmount).toBe("0.0000099");
    expect(r.run.feeAmount).toBe("0.0000001");
    expect(sent).toHaveLength(1); // the return; the swap goes through Ultra
  });

  test("return fails after the swap landed: no refund, next pass returns", async () => {
    sends = ["fail"];
    const first = await settleRun(freshRun(), acct, await ctx(), {
      allowSwap: true,
    });
    expect(first.run.status).toBe("swapped");
    expect(store.statuses).not.toContain("refunding");

    const second = await settleRun(first.run, acct, await ctx(), {
      allowSwap: false,
    });
    expect(second.run.status).toBe("done");
    expect(store.statuses).not.toContain("refunding");
  });

  test("execute throws but the swap landed: return, never refund", async () => {
    execMode = "throw-but-landed";
    const r = await settleRun(freshRun(), acct, await ctx(), {
      allowSwap: true,
    });
    expect(r.run.status).toBe("done");
    expect(store.statuses).not.toContain("refunding");
  });

  test("swap never lands: wait, then refund once it has expired", async () => {
    execMode = "throw-missing";
    const first = await settleRun(freshRun(), acct, await ctx(), {
      allowSwap: true,
    });
    expect(first.run.status).toBe("swapping");
    expect(first.note).toMatch(/not confirmed/);

    clock += 5 * 60_000; // past any blockhash lifetime
    const second = await settleRun(first.run, acct, await ctx(), {
      allowSwap: false,
    });
    expect(second.run.status).toBe("refunded");
    expect(second.run.swapSig).toBeNull();
    expect(executed).toBe(1); // the next pass does not swap again
  });

  test("a bad quote is refused and refunded without executing", async () => {
    lossUsd = 0.05; // 5% loss, over the 2% limit
    const r = await settleRun(freshRun(), acct, await ctx(), {
      allowSwap: true,
    });
    expect(r.run.status).toBe("refunded");
    expect(executed).toBe(0);
    expect(r.note).toMatch(/lose 5\.00%/);
  });

  test("a transfer that never landed becomes void and moves nothing", async () => {
    chain.delete(TRANSFER_SIG);
    clock += 0;
    const row = freshRun();
    clock += 5 * 60_000;
    const r = await settleRun(row, acct, await ctx(), { allowSwap: true });
    expect(r.run.status).toBe("void");
    expect(sent).toHaveLength(0);
  });

  test("a stuck transferred row is refunded, not swapped, by a later pass", async () => {
    const row = { ...freshRun(), status: "transferred" };
    store.row = row;
    const r = await settleRun(row, acct, await ctx(), { allowSwap: false });
    expect(r.run.status).toBe("refunded");
    expect(executed).toBe(0);
  });
});
