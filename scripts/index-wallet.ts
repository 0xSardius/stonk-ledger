/**
 * Index one or more wallets now.
 *
 *   pnpm index-wallet <address> [<address> ...] [--pages=5]
 */
import { indexWallet } from "../lib/jobs/index-wallet";

const args = process.argv.slice(2);
const pagesArg = args.find((a) => a.startsWith("--pages="));
const maxPages = pagesArg ? Number(pagesArg.split("=")[1]) : 5;
const wallets = args.filter((a) => !a.startsWith("--"));

if (wallets.length === 0) {
  console.error("usage: index-wallet <address> [...] [--pages=N]");
  process.exit(1);
}

async function main() {
  for (const w of wallets) {
    const started = Date.now();
    const s = await indexWallet(w, { maxPages });
    console.log(
      `[index] ${w.slice(0, 8)}… holdings=${s.holdings} coins=${s.coins.length} newPayouts=${s.newPayouts} (${((Date.now() - started) / 1000).toFixed(1)}s)`
    );
    for (const c of s.coins) {
      console.log(
        `         ${c.symbol.padEnd(8)} +${c.newPayouts} payouts, +${c.newAmount.toFixed(6)} ${c.quoteSymbol}, ${c.pagesWalked} pages`
      );
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
