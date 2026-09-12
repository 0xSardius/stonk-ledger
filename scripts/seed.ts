/**
 * Seed the `coins` table from StonkFun across every quote category.
 *
 *   pnpm seed                 # top 3 pages (300 coins) per category by 24h volume
 *   pnpm seed --pages=10      # more pages per category
 *   pnpm seed --decimals      # also fill quote_decimals (one call per unique quote mint)
 *
 * Idempotent: upserts on mint.
 */
import { sql } from "drizzle-orm";
import { db, schema } from "../lib/db";
import { env } from "../lib/env";
import { QUOTE_CATEGORIES, StonkFunClient } from "../lib/stonkfun/client";
import { toCoinRow } from "../lib/stonkfun/to-coin-row";

const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"];
  })
);
const PAGES = Number(args.get("pages") ?? 3);
const FILL_DECIMALS = args.get("decimals") === "true";

async function main() {
  const api = new StonkFunClient(env.STONKFUN_API_BASE);
  const d = db();
  let total = 0;

  for (const category of QUOTE_CATEGORIES) {
    let n = 0;
    for await (const page of api.allTokens(
      { mode: "reward", category, sort: "volume24h", pageSize: 100 },
      PAGES
    )) {
      const rows = page.map(toCoinRow);
      if (rows.length === 0) break;
      await d
        .insert(schema.coins)
        .values(rows)
        .onConflictDoUpdate({
          target: schema.coins.mint,
          set: {
            symbol: sql`excluded.symbol`,
            name: sql`excluded.name`,
            quoteMint: sql`excluded.quote_mint`,
            quoteSymbol: sql`excluded.quote_symbol`,
            quoteCategory: sql`excluded.quote_category`,
            feeBps: sql`excluded.fee_bps`,
            imageUrl: sql`excluded.image_url`,
            marketCapUsd: sql`excluded.market_cap_usd`,
            volume24hUsd: sql`excluded.volume_24h_usd`,
            active: sql`excluded.active`,
            updatedAt: sql`now()`,
          },
        });
      n += rows.length;
      console.log(`[seed] ${category}: +${rows.length} (${n})`);
    }
    total += n;
  }
  console.log(`[seed] upserted ${total} coins`);

  if (FILL_DECIMALS) {
    const missing = await d
      .select({
        quoteMint: schema.coins.quoteMint,
        mint: sql<string>`min(${schema.coins.mint})`,
      })
      .from(schema.coins)
      .where(sql`${schema.coins.quoteDecimals} is null`)
      .groupBy(schema.coins.quoteMint);
    console.log(`[seed] filling decimals for ${missing.length} quote mints`);
    for (const { quoteMint, mint } of missing) {
      try {
        const r = await api.rewards(mint);
        const dec = r.data.quote?.decimals;
        if (dec == null) continue;
        await d
          .update(schema.coins)
          .set({ quoteDecimals: dec })
          .where(sql`${schema.coins.quoteMint} = ${quoteMint}`);
        console.log(`[seed] ${r.data.quote?.symbol} decimals=${dec}`);
      } catch (err) {
        console.warn(`[seed] decimals failed for ${quoteMint}`, err);
      }
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
