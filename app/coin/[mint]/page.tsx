import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCoinFeed } from "@/lib/feed";
import { fmtDate, fmtDateTime, truncateAddress } from "@/lib/format";
import { Num } from "@/components/formatted-number";
import { addressUrl, txUrl } from "@/app/lib/explorer";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ mint: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { mint } = await params;
  const f = await getCoinFeed(mint, 1);
  if (!f) return { title: "Coin · Stonk Ledger" };
  return {
    title: `${f.coin.symbol} pays ${f.coin.quoteSymbol} · proof feed · Stonk Ledger`,
    description: `Every ${f.coin.quoteSymbol} distribution to ${f.coin.symbol} holders, with a proof link per batch.`,
  };
}

export default async function CoinPage({ params }: Params) {
  const { mint } = await params;
  const f = await getCoinFeed(mint);
  if (!f) notFound();
  const { coin, totals, snapshot } = f;
  const sharePrice = f.quoteUsd;
  const isStock = ["xstock", "backpack", "prestock"].includes(
    coin.quoteCategory
  );

  return (
    <main className="mx-auto max-w-3xl px-6 pb-16 pt-10">
      <header className="border-b border-border pb-6">
        <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
          Proof feed
        </p>
        <h1 className="mt-2 font-serif text-4xl tracking-tight sm:text-5xl">
          {coin.symbol} <span className="text-muted-foreground">pays</span>{" "}
          {coin.quoteSymbol}
        </h1>
        <p className="mt-3 max-w-xl text-sm text-muted-foreground">
          {coin.name && coin.name !== coin.symbol ? `${coin.name}. ` : ""}
          {coin.feeBps != null
            ? `A ${coin.feeBps / 100}% transfer tax on every trade is paid to holders in ${coin.quoteSymbol}`
            : `Holders are paid in ${coin.quoteSymbol}`}
          {isStock ? ", a tokenized stock." : "."} Every distribution below is
          signed by the StonkFun distributor and links to its transaction.
        </p>
        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-4">
          <Stat label="Paid out, last 24h">
            <Num
              value={totals.amount24h * f.multiplier}
              type="token_amount"
              tokenPriceUsd={sharePrice}
            />{" "}
            {coin.quoteSymbol}
            {sharePrice != null && (
              <span className="text-muted-foreground">
                {" "}
                ·{" "}
                <Num
                  value={totals.amount24h * f.multiplier * sharePrice}
                  type="fiat_value"
                />
              </span>
            )}
          </Stat>
          <Stat label="Batches, last 24h">
            <span className="font-mono tabular-nums">
              {totals.batches24h.toLocaleString("en-US")}
            </span>
            <span className="text-muted-foreground">
              {" "}
              to{" "}
              <span className="font-mono tabular-nums">
                {totals.recipients24h.toLocaleString("en-US")}
              </span>{" "}
              wallets
            </span>
          </Stat>
          <Stat label="Lifetime, per StonkFun">
            {snapshot?.distributedTokens != null ? (
              <>
                <Num
                  value={snapshot.distributedTokens}
                  type="token_amount"
                  tokenPriceUsd={sharePrice}
                />{" "}
                {coin.quoteSymbol}
                {snapshot.holderCount != null && (
                  <span className="text-muted-foreground">
                    {" "}
                    ·{" "}
                    <span className="font-mono tabular-nums">
                      {snapshot.holderCount.toLocaleString("en-US")}
                    </span>{" "}
                    holders
                  </span>
                )}
              </>
            ) : (
              "--"
            )}
          </Stat>
          <Stat label="Market cap">
            <Num value={coin.marketCapUsd} type="fiat_value" />
            <span className="text-muted-foreground">
              {" "}
              · <Num value={coin.volume24hUsd} type="fiat_value" /> 24h vol
            </span>
          </Stat>
        </dl>
        <p className="mt-4 text-xs text-muted-foreground">
          Distributor{" "}
          {coin.distributorSigners.map((s) => (
            <a
              key={s}
              href={addressUrl(s)}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-primary underline underline-offset-2"
            >
              {truncateAddress(s, 6)}
            </a>
          ))}
          {" · "}coin{" "}
          <a
            href={addressUrl(coin.mint)}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-primary underline underline-offset-2"
          >
            {truncateAddress(coin.mint, 6)}
          </a>
          {" · "}
          <Link
            href="/drip"
            className="text-primary underline underline-offset-2"
          >
            turn {coin.quoteSymbol} payouts into the stock you want
          </Link>
        </p>
      </header>

      {f.batches.length === 0 ? (
        <section className="py-16 text-center">
          <p className="font-serif text-3xl">No distributions recorded yet</p>
          <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
            The feed fills as the distributor signs batches for this coin. Open
            any holder&apos;s statement to backfill its history.
          </p>
        </section>
      ) : (
        <section className="mt-6">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-2 font-normal">Distributed</th>
                  <th className="py-2 text-right font-normal">Wallets</th>
                  <th className="py-2 text-right font-normal">Amount</th>
                  <th className="py-2 text-right font-normal">
                    USD at receipt
                  </th>
                  <th className="py-2 text-right font-normal">Proof</th>
                </tr>
              </thead>
              <tbody>
                {f.batches.map((b) => (
                  <tr key={b.sig} className="border-b border-border">
                    <td className="py-1.5 pr-3 whitespace-nowrap text-muted-foreground">
                      {fmtDateTime(b.blockTime)}
                    </td>
                    <td className="py-1.5 pr-3 text-right font-mono tabular-nums">
                      {b.recipients}
                    </td>
                    <td className="py-1.5 pr-3 text-right whitespace-nowrap">
                      <Num
                        value={b.amount * f.multiplier}
                        type="token_amount"
                        context="detailed"
                        tokenPriceUsd={sharePrice}
                      />{" "}
                      <span className="text-muted-foreground">
                        {coin.quoteSymbol}
                      </span>
                    </td>
                    <td className="py-1.5 pr-3 text-right whitespace-nowrap text-muted-foreground">
                      <Num
                        value={b.usdAtReceipt}
                        type="fiat_value"
                        context="detailed"
                      />
                    </td>
                    <td className="py-1.5 text-right whitespace-nowrap">
                      <a
                        href={txUrl(b.sig)}
                        target="_blank"
                        rel="noreferrer"
                        title={b.sig}
                        className="text-primary underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
                      >
                        proof
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Latest {f.batches.length} of{" "}
            <span className="font-mono tabular-nums">
              {totals.batches.toLocaleString("en-US")}
            </span>{" "}
            recorded batches,{" "}
            <span className="font-mono tabular-nums">
              {totals.payouts.toLocaleString("en-US")}
            </span>{" "}
            payouts
            {totals.firstSeen && <> since {fmtDate(totals.firstSeen)}</>}.
            Recording began when this ledger went live; StonkFun&apos;s lifetime
            total is above.
          </p>
        </section>
      )}
    </main>
  );
}

function Stat({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 whitespace-nowrap">{children}</dd>
    </div>
  );
}
