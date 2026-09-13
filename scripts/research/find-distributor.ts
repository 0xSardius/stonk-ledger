/**
 * Day 1 research (PRD 8.1): identify the on-chain distributor that signs
 * quote-token payouts to holders of a reward coin.
 *
 *   pnpm tsx scripts/research/find-distributor.ts <coinMint> [holders=5] [txPerAccount=20]
 *
 * Steps:
 *  1. getTokenLargestAccounts for the coin mint; skip the pool vault.
 *  2. For N holder owners, find their quote-token account.
 *  3. Pull the last M transactions per account with Helius enhanced parsing.
 *  4. Count fee payers and program ids across inbound quote transfers.
 *     The signer common to most payout transactions with many destinations
 *     is the distributor.
 * Prints a JSON summary; paste the evidence into docs/RESEARCH.md.
 */
import { sql } from "drizzle-orm";
import { db, schema } from "../../lib/db";
import { heliusRpcUrl, requireEnv } from "../../lib/env";

const [coinMint, holdersArg = "5", txArg = "20"] = process.argv.slice(2);
if (!coinMint) {
  console.error(
    "usage: find-distributor.ts <coinMint> [holders] [txPerAccount]"
  );
  process.exit(1);
}
const HOLDERS = Number(holdersArg);
const TX_PER_ACCOUNT = Number(txArg);

const RPC = heliusRpcUrl();
const HELIUS_API = `https://api.helius.xyz/v0`;
const KEY = requireEnv("HELIUS_API_KEY");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const PACE_MS = 250;

/** fetch with 429/5xx retry and exponential backoff; never throws on non-JSON body */
async function fetchJson<T>(
  input: string,
  init?: RequestInit,
  attempt = 0
): Promise<T> {
  await sleep(PACE_MS);
  const res = await fetch(input, init);
  if ((res.status === 429 || res.status >= 500) && attempt < 6) {
    const wait = 500 * 2 ** attempt;
    console.error(`[research] ${res.status}, retrying in ${wait}ms`);
    await sleep(wait);
    return fetchJson<T>(input, init, attempt + 1);
  }
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 120)}`);
  return JSON.parse(text) as T;
}

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const json = await fetchJson<{ result?: T; error?: { message: string } }>(
    RPC,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    }
  );
  if (json.error) throw new Error(`${method}: ${json.error.message}`);
  return json.result as T;
}

type ParsedTx = {
  signature: string;
  timestamp: number;
  feePayer: string;
  type: string;
  source: string;
  instructions: {
    programId: string;
    innerInstructions?: { programId: string }[];
  }[];
  tokenTransfers: {
    fromUserAccount: string;
    toUserAccount: string;
    fromTokenAccount: string;
    toTokenAccount: string;
    tokenAmount: number;
    mint: string;
  }[];
};

async function enhancedHistory(address: string, limit: number) {
  const url = `${HELIUS_API}/addresses/${address}/transactions?api-key=${KEY}&limit=${limit}`;
  return fetchJson<ParsedTx[]>(url);
}

async function main() {
  const [coin] = await db()
    .select()
    .from(schema.coins)
    .where(sql`${schema.coins.mint} = ${coinMint}`)
    .limit(1);
  if (!coin)
    throw new Error(`coin ${coinMint} not in coins table; run pnpm seed`);
  console.error(
    `[research] ${coin.symbol} pays ${coin.quoteSymbol} (${coin.quoteMint})`
  );

  // 1. largest holders of the coin
  const largest = await rpc<{ value: { address: string; uiAmount: number }[] }>(
    "getTokenLargestAccounts",
    [coinMint]
  );
  // resolve owners; the pool vault is owned by a program (not a wallet)
  const owners: {
    tokenAccount: string;
    owner: string;
    ownerIsProgram: boolean;
    uiAmount: number;
  }[] = [];
  for (const a of largest.value) {
    const info = await rpc<{
      value: { data: { parsed: { info: { owner: string } } } } | null;
    }>("getAccountInfo", [a.address, { encoding: "jsonParsed" }]);
    const owner = info.value?.data.parsed.info.owner;
    if (!owner) continue;
    const ownerInfo = await rpc<{
      value: { executable: boolean; owner: string } | null;
    }>("getAccountInfo", [owner, { encoding: "jsonParsed" }]);
    // a wallet is owned by the System Program and not executable; a PDA vault is owned by a DEX program
    const ownerIsProgram =
      ownerInfo.value != null &&
      ownerInfo.value.owner !== "11111111111111111111111111111111";
    owners.push({
      tokenAccount: a.address,
      owner,
      ownerIsProgram,
      uiAmount: a.uiAmount,
    });
  }
  const holders = owners.filter((o) => !o.ownerIsProgram).slice(0, HOLDERS);
  const vaults = owners.filter((o) => o.ownerIsProgram);
  console.error(
    `[research] ${vaults.length} program-owned accounts skipped, ${holders.length} holders sampled`
  );

  // 2+3. for each holder, quote-token account and recent inbound quote transfers
  const feePayerCount = new Map<string, number>();
  const programCount = new Map<string, number>();
  const sourceCount = new Map<string, number>();
  const samples: {
    sig: string;
    holder: string;
    feePayer: string;
    amount: number;
    toCount: number;
    programs: string[];
  }[] = [];

  for (const h of holders) {
    const accts = await rpc<{ value: { pubkey: string }[] }>(
      "getTokenAccountsByOwner",
      [h.owner, { mint: coin.quoteMint }, { encoding: "jsonParsed" }]
    );
    const quoteAcct = accts.value[0]?.pubkey;
    if (!quoteAcct) {
      console.error(
        `[research] holder ${h.owner} has no ${coin.quoteSymbol} account`
      );
      continue;
    }
    const txs = await enhancedHistory(quoteAcct, TX_PER_ACCOUNT);
    for (const tx of txs) {
      const inbound = tx.tokenTransfers.filter(
        (t) => t.mint === coin.quoteMint && t.toUserAccount === h.owner
      );
      if (inbound.length === 0) continue;
      const programs = Array.from(
        new Set(tx.instructions.map((i) => i.programId))
      );
      const toCount = new Set(
        tx.tokenTransfers
          .filter((t) => t.mint === coin.quoteMint)
          .map((t) => t.toUserAccount)
      ).size;
      feePayerCount.set(tx.feePayer, (feePayerCount.get(tx.feePayer) ?? 0) + 1);
      sourceCount.set(tx.source, (sourceCount.get(tx.source) ?? 0) + 1);
      for (const p of programs)
        programCount.set(p, (programCount.get(p) ?? 0) + 1);
      samples.push({
        sig: tx.signature,
        holder: h.owner,
        feePayer: tx.feePayer,
        amount: inbound.reduce((a, t) => a + t.tokenAmount, 0),
        toCount,
        programs,
      });
    }
  }

  const sortDesc = (m: Map<string, number>) =>
    Array.from(m.entries()).sort((a, b) => b[1] - a[1]);

  // per fee payer: how many txs, avg destinations, which sources/programs
  const byPayer = new Map<
    string,
    {
      n: number;
      toSum: number;
      sources: Set<string>;
      programs: Set<string>;
      amounts: number[];
    }
  >();
  for (const smp of samples) {
    const e = byPayer.get(smp.feePayer) ?? {
      n: 0,
      toSum: 0,
      sources: new Set(),
      programs: new Set(),
      amounts: [],
    };
    e.n += 1;
    e.toSum += smp.toCount;
    e.amounts.push(smp.amount);
    for (const pr of smp.programs) e.programs.add(pr);
    byPayer.set(smp.feePayer, e);
  }
  const payerBreakdown = Array.from(byPayer.entries())
    .sort((a, b) => b[1].n - a[1].n)
    .map(([payer, e]) => ({
      payer,
      txs: e.n,
      avgDestinations: +(e.toSum / e.n).toFixed(1),
      programs: Array.from(e.programs),
      medianAmount: e.amounts.sort((x, y) => x - y)[
        Math.floor(e.amounts.length / 2)
      ],
    }));

  const summary = {
    payerBreakdown,
    coin: {
      symbol: coin.symbol,
      mint: coinMint,
      quote: coin.quoteSymbol,
      quoteMint: coin.quoteMint,
    },
    holdersSampled: holders.map((h) => ({
      owner: h.owner,
      coinBalance: h.uiAmount,
    })),
    vaultsSkipped: vaults.map((v) => ({
      tokenAccount: v.tokenAccount,
      owner: v.owner,
    })),
    inboundQuoteTxs: samples.length,
    feePayers: sortDesc(feePayerCount),
    sources: sortDesc(sourceCount),
    programs: sortDesc(programCount),
    sampleTxs: samples.slice(0, 8),
  };
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
