/**
 * Stocklana sponsor-track coverage: how much of the ledger already touches
 * PreStocks-paid coins. Read-only. Written 2026-09-16 when the hackathon page
 * added five bounty tracks; the entry is main track plus PreStocks.
 *
 *   pnpm tsx scripts/research/sponsor-coverage.ts
 */
import { sql } from "drizzle-orm";
import { db } from "../../lib/db";

async function main() {
  const d = db();
  const byCat = await d.execute(sql`
    select c.quote_category, count(distinct c.id)::int as coins,
           count(p.sig)::int as payouts, count(distinct p.wallet)::int as wallets
    from coins c left join payouts p on p.coin_id = c.id
    group by c.quote_category order by payouts desc`);
  console.log("payouts by quote category", byCat.rows);

  const unattributed = await d.execute(sql`
    select c.quote_category, count(*)::int as payouts
    from payouts p join coins c on c.quote_mint = p.quote_mint
    where p.coin_id is null group by c.quote_category`);
  console.log("unattributed payouts by category", unattributed.rows);

  const topPre = await d.execute(sql`
    select c.symbol, c.quote_symbol, c.volume_24h_usd::float as vol,
           count(p.sig)::int as payouts, count(distinct p.wallet)::int as wallets
    from coins c left join payouts p on p.coin_id = c.id
    where c.quote_category = 'prestock'
    group by c.id order by payouts desc, vol desc nulls last limit 8`);
  console.log("top prestock-paid coins", topPre.rows);

  const preQuotes = await d.execute(sql`
    select quote_symbol, quote_mint, count(*)::int as coins
    from coins where quote_category = 'prestock'
    group by quote_symbol, quote_mint order by coins desc`);
  console.log("prestock quote mints", preQuotes.rows);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  }
);
