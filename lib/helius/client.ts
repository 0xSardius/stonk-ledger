/**
 * Helius client: JSON-RPC plus the Enhanced Transactions API.
 * Verified live 2026-09-13:
 *   POST https://mainnet.helius-rpc.com/?api-key=KEY            (JSON-RPC)
 *   GET  https://api.helius.xyz/v0/addresses/{addr}/transactions?api-key=KEY&limit=100&before=SIG
 *   POST https://api.helius.xyz/v0/transactions?api-key=KEY  { transactions: [sig] }
 * The free tier rate-limits at a few requests per second, so every call is
 * paced and retried on 429/5xx.
 */
import { heliusRpcUrl, requireEnv } from "../env";

export type TokenTransfer = {
  fromUserAccount: string;
  toUserAccount: string;
  fromTokenAccount: string;
  toTokenAccount: string;
  tokenAmount: number;
  mint: string;
  tokenStandard?: string;
};

export type ParsedInstruction = {
  programId: string;
  accounts?: string[];
  data?: string;
  innerInstructions?: {
    programId: string;
    accounts?: string[];
    data?: string;
  }[];
};

export type ParsedTx = {
  signature: string;
  slot: number;
  timestamp: number;
  feePayer: string;
  fee: number;
  type: string;
  source: string;
  description?: string;
  transactionError?: unknown;
  instructions: ParsedInstruction[];
  tokenTransfers: TokenTransfer[];
  nativeTransfers?: {
    fromUserAccount: string;
    toUserAccount: string;
    amount: number;
  }[];
};

export const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
export const SYSTEM_PROGRAM = "11111111111111111111111111111111";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type HeliusOptions = {
  apiKey?: string;
  paceMs?: number;
  fetchImpl?: typeof fetch;
};

export class HeliusClient {
  private readonly key: string;
  private readonly rpcUrl: string;
  private readonly paceMs: number;
  private readonly fetchImpl: typeof fetch;
  private last = 0;

  constructor(opts: HeliusOptions = {}) {
    this.key = opts.apiKey ?? requireEnv("HELIUS_API_KEY");
    this.rpcUrl = opts.apiKey
      ? `https://mainnet.helius-rpc.com/?api-key=${opts.apiKey}`
      : heliusRpcUrl();
    this.paceMs = opts.paceMs ?? 250;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private async json<T>(
    url: string,
    init?: RequestInit,
    attempt = 0
  ): Promise<T> {
    const wait = this.last + this.paceMs - Date.now();
    if (wait > 0) await sleep(wait);
    this.last = Date.now();
    const res = await this.fetchImpl(url, init);
    if ((res.status === 429 || res.status >= 500) && attempt < 6) {
      await sleep(500 * 2 ** attempt);
      return this.json<T>(url, init, attempt + 1);
    }
    const text = await res.text();
    if (!res.ok) {
      // never echo the URL: it carries the api key
      throw new Error(`Helius HTTP ${res.status}: ${text.slice(0, 160)}`);
    }
    return JSON.parse(text) as T;
  }

  async rpc<T>(method: string, params: unknown[]): Promise<T> {
    const out = await this.json<{ result?: T; error?: { message: string } }>(
      this.rpcUrl,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      }
    );
    if (out.error) throw new Error(`${method}: ${out.error.message}`);
    return out.result as T;
  }

  /** Enhanced transaction history for an address, newest first. */
  async history(
    address: string,
    opts: { before?: string; until?: string; limit?: number } = {}
  ): Promise<ParsedTx[]> {
    const p = new URLSearchParams({ "api-key": this.key });
    p.set("limit", String(opts.limit ?? 100));
    if (opts.before) p.set("before", opts.before);
    if (opts.until) p.set("until", opts.until);
    return this.json<ParsedTx[]>(
      `https://api.helius.xyz/v0/addresses/${address}/transactions?${p}`
    );
  }

  /** Walk history newest -> oldest until `stopAtSig` is seen or `maxPages`. */
  async *historyPages(
    address: string,
    opts: {
      stopAtSig?: string | null;
      maxPages?: number;
      pageSize?: number;
    } = {}
  ) {
    let before: string | undefined;
    const maxPages = opts.maxPages ?? 20;
    for (let page = 0; page < maxPages; page++) {
      const txs = await this.history(address, {
        before,
        limit: opts.pageSize ?? 100,
      });
      if (txs.length === 0) return;
      const stop = opts.stopAtSig
        ? txs.findIndex((t) => t.signature === opts.stopAtSig)
        : -1;
      yield stop >= 0 ? txs.slice(0, stop) : txs;
      if (stop >= 0 || txs.length < (opts.pageSize ?? 100)) return;
      before = txs[txs.length - 1].signature;
    }
  }

  async parseTransactions(signatures: string[]): Promise<ParsedTx[]> {
    return this.json<ParsedTx[]>(
      `https://api.helius.xyz/v0/transactions?api-key=${this.key}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ transactions: signatures }),
      }
    );
  }

  /** All token accounts of an owner across SPL Token and Token-2022. */
  async tokenAccounts(owner: string) {
    type Resp = {
      value: {
        pubkey: string;
        account: {
          data: {
            parsed: {
              info: {
                mint: string;
                owner: string;
                tokenAmount: {
                  amount: string;
                  decimals: number;
                  uiAmount: number | null;
                };
              };
            };
          };
        };
      }[];
    };
    const out: {
      tokenAccount: string;
      mint: string;
      amountRaw: bigint;
      decimals: number;
      program: string;
    }[] = [];
    for (const programId of [TOKEN_PROGRAM, TOKEN_2022_PROGRAM]) {
      const r = await this.rpc<Resp>("getTokenAccountsByOwner", [
        owner,
        { programId },
        { encoding: "jsonParsed" },
      ]);
      for (const v of r.value) {
        const info = v.account.data.parsed.info;
        out.push({
          tokenAccount: v.pubkey,
          mint: info.mint,
          amountRaw: BigInt(info.tokenAmount.amount),
          decimals: info.tokenAmount.decimals,
          program: programId,
        });
      }
    }
    return out;
  }
}
