/**
 * Read a token account on chain and check a delegation. Used by the approve
 * and revoke routes so the database only ever reflects on-chain state.
 */
import {
  address,
  type Address,
  type Rpc,
  type GetAccountInfoApi,
} from "@solana/kit";
import { fetchToken as fetchSplToken } from "@solana-program/token";
import { fetchToken as fetch2022Token } from "@solana-program/token-2022";
import { TOKEN_2022_PROGRAM, TOKEN_PROGRAM } from "../helius/client";

export type TokenAccountState = {
  owner: string;
  mint: string;
  amountRaw: bigint;
  delegate: string | null;
  delegatedAmountRaw: bigint;
};

type OptionLike<T> =
  { __option: "Some"; value: T } | { __option: "None" } | T | null;

function unwrap<T>(o: OptionLike<T>): T | null {
  if (o == null) return null;
  if (typeof o === "object" && "__option" in (o as object)) {
    const opt = o as { __option: "Some"; value: T } | { __option: "None" };
    return opt.__option === "Some" ? opt.value : null;
  }
  return o as T;
}

export async function readTokenAccount(
  rpc: Rpc<GetAccountInfoApi>,
  tokenAccount: string,
  program: string
): Promise<TokenAccountState> {
  const fetchToken =
    program === TOKEN_2022_PROGRAM ? fetch2022Token : fetchSplToken;
  const acct = await fetchToken(rpc, address(tokenAccount));
  const d = acct.data as unknown as {
    owner: Address;
    mint: Address;
    amount: bigint;
    delegate: OptionLike<Address>;
    delegatedAmount: bigint;
  };
  return {
    owner: d.owner,
    mint: d.mint,
    amountRaw: d.amount,
    delegate: unwrap(d.delegate),
    delegatedAmountRaw: d.delegatedAmount,
  };
}

export type ApprovalCheck =
  | { ok: true; delegatedAmountRaw: bigint; amountRaw: bigint }
  | { ok: false; reason: string };

export function checkApproval(
  state: TokenAccountState,
  expect: { owner: string; mint: string; delegate: string; minCapRaw: bigint }
): ApprovalCheck {
  if (state.owner !== expect.owner)
    return { ok: false, reason: "account owner mismatch" };
  if (state.mint !== expect.mint)
    return { ok: false, reason: "account mint mismatch" };
  if (state.delegate !== expect.delegate)
    return { ok: false, reason: "delegate is not the keeper" };
  if (state.delegatedAmountRaw < expect.minCapRaw) {
    return { ok: false, reason: "delegated amount below the requested cap" };
  }
  return {
    ok: true,
    delegatedAmountRaw: state.delegatedAmountRaw,
    amountRaw: state.amountRaw,
  };
}

type ParsedIx = {
  programId: string;
  parsed?: { type?: string; info?: Record<string, unknown> };
};

/** The parts of an RPC getTransaction (jsonParsed) the approval check reads. */
export type ApprovalTx = {
  blockTime: number | bigint | null;
  meta: {
    err: unknown;
    innerInstructions?: { instructions: ParsedIx[] }[] | null;
  } | null;
  transaction: {
    message: {
      accountKeys: { pubkey: string; signer: boolean }[];
      instructions: ParsedIx[];
    };
  };
};

/** An approval older than this cannot be used to register a delegation. */
export const APPROVAL_MAX_AGE_SEC = 30 * 60;

/**
 * Prove that the holder signed the approval the request names: a successful,
 * recent transaction, signed by the owner, that approves the keeper on this
 * token account. Without this, anyone could rewrite another holder's target
 * or threshold, because the on-chain delegate alone is public.
 */
export function checkApprovalTx(
  tx: ApprovalTx | null,
  expect: {
    owner: string;
    tokenAccount: string;
    mint: string;
    delegate: string;
    nowSec: number;
  }
): { ok: true } | { ok: false; reason: string } {
  if (!tx || !tx.meta) return { ok: false, reason: "approval not found" };
  if (tx.meta.err) return { ok: false, reason: "approval failed on chain" };
  const signed = tx.transaction.message.accountKeys.some(
    (k) => k.pubkey === expect.owner && k.signer
  );
  if (!signed)
    return { ok: false, reason: "approval not signed by the wallet" };
  if (tx.blockTime == null)
    return { ok: false, reason: "approval has no block time" };
  if (expect.nowSec - Number(tx.blockTime) > APPROVAL_MAX_AGE_SEC)
    return { ok: false, reason: "approval is too old; approve again" };
  const all = [
    ...tx.transaction.message.instructions,
    ...(tx.meta.innerInstructions ?? []).flatMap((g) => g.instructions),
  ];
  const approves = all.some((ix) => {
    if (ix.programId !== TOKEN_PROGRAM && ix.programId !== TOKEN_2022_PROGRAM)
      return false;
    const type = ix.parsed?.type;
    const info = ix.parsed?.info ?? {};
    return (
      (type === "approve" || type === "approveChecked") &&
      info.source === expect.tokenAccount &&
      info.delegate === expect.delegate &&
      info.owner === expect.owner &&
      (info.mint === undefined || info.mint === expect.mint)
    );
  });
  if (!approves)
    return {
      ok: false,
      reason: "transaction does not approve the keeper on this account",
    };
  return { ok: true };
}
