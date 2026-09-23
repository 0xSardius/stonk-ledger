import Link from "next/link";
import type { Metadata } from "next";
import { listCoins, STOCK_CATEGORIES, type CoinListRow } from "@/lib/feed";
import { fmtDateTime } from "@/lib/format";
import { Num } from "@/components/formatted-number";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Reward coins · Stonk Ledger",
  description:
    "StonkFun reward coins that pay holders in tokenized stocks and other assets, with a proof feed each.",
};

const CATEGORY: Record<string, string> = {
  xstock: "xStock",
  backpack: "Backpack",
  prestock: "PreStock",
  custom: "other",
};

export default async function CoinsPage() {
  const [stocks, others] = await Promise.all([
    listCoins(25, STOCK_CATEGORIES),
    listCoins(15, ["custom"]),
  ]);
  return (
    <main className="mx-auto max-w-3xl px-6 pb-16 pt-10">
      <header className="border-b border-border pb-6">
        <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
          Reward coins
        </p>
        <h1 className="mt-2 font-serif text-4xl tracking-tight sm:text-5xl">
          Who pays in what
        </h1>
        <p className="mt-3 max-w-xl text-sm text-muted-foreground">
          The most traded StonkFun reward coins by 24-hour volume. Each has a
          public proof feed of its distributions. Adding a coin is a config row;
          nothing here is hand-picked. Recorded counts are a sample of the
          distributors&apos; newest batches, read several times a day.
        </p>
      </header>
      <h2 className="mt-8 text-xs uppercase tracking-[0.08em] text-muted-foreground">
        Paid in tokenized stocks
      </h2>
      <CoinTable coins={stocks} />
      <h2 className="mt-12 text-xs uppercase tracking-[0.08em] text-muted-foreground">
        Paid in other assets
      </h2>
      <CoinTable coins={others} />
    </main>
  );
}

function CoinTable({ coins }: { coins: CoinListRow[] }) {
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className="py-2 font-normal">Coin</th>
            <th className="py-2 font-normal">Pays</th>
            <th className="py-2 text-right font-normal">24h volume</th>
            <th className="py-2 text-right font-normal">Market cap</th>
            <th className="py-2 text-right font-normal">Recorded (sample)</th>
            <th className="py-2 text-right font-normal">Last recorded</th>
          </tr>
        </thead>
        <tbody>
          {coins.map((c) => (
            <tr key={c.mint} className="border-b border-border">
              <td className="py-2 pr-3 whitespace-nowrap">
                <Link
                  href={`/coin/${c.mint}`}
                  className="text-primary underline underline-offset-2"
                >
                  {c.symbol}
                </Link>
                {c.name && c.name !== c.symbol && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    {c.name}
                  </span>
                )}
              </td>
              <td className="py-2 pr-3 whitespace-nowrap">
                {c.quoteSymbol}{" "}
                <span className="text-xs text-muted-foreground">
                  {CATEGORY[c.quoteCategory] ?? c.quoteCategory}
                </span>
              </td>
              <td className="py-2 pr-3 text-right whitespace-nowrap">
                <Num value={c.volume24hUsd} type="fiat_value" />
              </td>
              <td className="py-2 pr-3 text-right whitespace-nowrap">
                <Num value={c.marketCapUsd} type="fiat_value" />
              </td>
              <td className="py-2 pr-3 text-right font-mono tabular-nums">
                {c.payoutsStored.toLocaleString("en-US")}
              </td>
              <td className="py-2 text-right whitespace-nowrap text-xs text-muted-foreground">
                {c.lastPayout ? fmtDateTime(c.lastPayout) : "--"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
