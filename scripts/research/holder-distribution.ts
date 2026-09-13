/**
 * Research gate: how much does a typical holder actually get paid?
 *
 *   pnpm tsx scripts/research/holder-distribution.ts <coinMint> [sample=60] [days=7]
 *
 * 1. List every token account of the coin mint (Helius DAS getTokenAccounts).
 * 2. Take a uniform random sample of holder owners.
 * 3. Index each (1 page of quote-account history) and sum payouts in the window.
 * 4. Print percentiles in quote units and USD (latest price snapshot).
 * Also persists the sampled wallets, so the indexer keeps them fresh.
 */
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db, schema } from "../../lib/db";
import { HeliusClient } from "../../lib/helius/client";
import { indexWallet } from "../../lib/jobs/index-wallet";

const [coinMint, sampleArg = "60", daysArg = "7"] = process.argv.slice(2);
if (!coinMint) {
  console.error("usage: holder-distribution.ts <coinMint> [sample] [days]");
  process.exit(1);
}
const SAMPLE = Number(sampleArg);
const DAYS = Number(daysArg);

type DasResp = {
  total: number;
  limit: number;
  cursor?: string;
  token_accounts: {
    address: string;
    mint: string;
    owner: string;
    amount: number;
  }[];
};

function pct(sorted: number[], p: number) {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[i];
}

async function main() {
  const helius = new HeliusClient();
  const d = db();
  const [coin] = await d
    .select()
    .from(schema.coins)
    .where(eq(schema.coins.mint, coinMint))
    .limit(1);
  if (!coin) throw new Error("coin not seeded");

  // 1. all holders via DAS
  const owners = new Map<string, number>();
  let cursor: string | undefined;
  for (let page = 0; page < 30; page++) {
    const r = await helius.rpc<DasResp>("getTokenAccounts", {
      mint: coinMint,
      limit: 1000,
      ...(cursor ? { cursor } : {}),
    });
    for (const t of r.token_accounts) {
      if (t.amount > 0)
        owners.set(t.owner, (owners.get(t.owner) ?? 0) + t.amount);
    }
    if (!r.cursor || r.token_accounts.length < 1000) break;
    cursor = r.cursor;
  }
  console.error(
    `[dist] ${coin.symbol}: ${owners.size} holders with balance > 0`
  );

  // 2. uniform random sample
  const all = Array.from(owners.keys());
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  const sample = all.slice(0, SAMPLE);

  // 3. index each sampled wallet, one page of quote history
  let ok = 0;
  for (const w of sample) {
    try {
      await indexWallet(w, { helius, maxPages: 1 });
      ok += 1;
      if (ok % 10 === 0) console.error(`[dist] indexed ${ok}/${sample.length}`);
    } catch (err) {
      console.error(
        `[dist] ${w.slice(0, 8)} failed: ${(err as Error).message}`
      );
    }
  }

  // 4. per-holder sum in the window (holders with zero payouts count as 0)
  const since = new Date(Date.now() - DAYS * 86400_000);
  const sums = await d
    .select({
      wallet: schema.payouts.wallet,
      amount: sql<number>`sum(${schema.payouts.amount})::float8`,
      n: sql<number>`count(*)::int`,
    })
    .from(schema.payouts)
    .where(
      and(
        eq(schema.payouts.coinId, coin.id),
        inArray(schema.payouts.wallet, sample),
        gte(schema.payouts.blockTime, since)
      )
    )
    .groupBy(schema.payouts.wallet);
  const byWallet = new Map(sums.map((s) => [s.wallet, s]));
  const amounts = sample
    .map((w) => byWallet.get(w)?.amount ?? 0)
    .sort((a, b) => a - b);

  const [price] = await d
    .select({ usd: schema.priceSnapshots.usd })
    .from(schema.priceSnapshots)
    .where(eq(schema.priceSnapshots.mint, coin.quoteMint))
    .orderBy(sql`${schema.priceSnapshots.ts} desc`)
    .limit(1);
  const usd = price ? Number(price.usd) : 0;

  const withPayout = amounts.filter((a) => a > 0).length;
  const line = (label: string, v: number) =>
    `${label.padEnd(12)} ${v.toFixed(6).padStart(16)} ${coin.quoteSymbol}   $${(v * usd).toFixed(2)}`;
  console.log(
    `\n${coin.symbol} pays ${coin.quoteSymbol} at $${usd.toFixed(4)}; ${DAYS}-day payout per holder, n=${sample.length} random holders of ${owners.size}`
  );
  console.log(
    `holders with >=1 payout in window: ${withPayout} (${((100 * withPayout) / sample.length).toFixed(0)}%)`
  );
  console.log(line("p10", pct(amounts, 10)));
  console.log(line("p25", pct(amounts, 25)));
  console.log(line("median", pct(amounts, 50)));
  console.log(line("p75", pct(amounts, 75)));
  console.log(line("p90", pct(amounts, 90)));
  console.log(line("p99", pct(amounts, 99)));
  console.log(
    line("mean", amounts.reduce((a, b) => a + b, 0) / amounts.length)
  );
  console.log(
    `share of sampled total earned by top 10%: ${(
      (100 *
        amounts
          .slice(-Math.ceil(amounts.length / 10))
          .reduce((a, b) => a + b, 0)) /
      Math.max(
        1e-9,
        amounts.reduce((a, b) => a + b, 0)
      )
    ).toFixed(0)}%`
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
