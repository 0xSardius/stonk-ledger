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
import { TOKEN_2022_PROGRAM } from "../helius/client";

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
