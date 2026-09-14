import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  getStatement,
  isValidAddress,
  type CoinStatement,
} from "@/lib/statement";
import { fmtDate, fmtDateTime, truncateAddress } from "@/lib/format";
import { Num } from "@/components/formatted-number";
import { addressUrl, txUrl } from "@/app/lib/explorer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Params = { params: Promise<{ address: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { address } = await params;
  const title = `Statement ${truncateAddress(address)} · Stonk Ledger`;
  const description =
    "Every tokenized-stock payout this wallet received, with a proof link per transaction.";
  const image = `/api/og/${address}`;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [{ url: image, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

export default async function WalletPage({ params }: Params) {
  const { address } = await params;
  if (!isValidAddress(address)) notFound();
  const s = await getStatement(address);

  return (
    <main className="mx-auto max-w-3xl px-6 pb-16 pt-10">
      <header className="border-b border-border pb-6">
        <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
          Dividend statement
        </p>
        <h1 className="mt-1 break-all font-mono text-base">
          {s.wallet}
          <a
            href={addressUrl(s.wallet)}
            target="_blank"
            rel="noreferrer"
            className="ml-2 text-xs text-primary underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
          >
            Solscan
          </a>
        </h1>
        <p className="mt-2 text-xs text-muted-foreground">
          {s.indexedAt
            ? `Indexed ${fmtDateTime(s.indexedAt)}`
            : "Not indexed yet"}
          {s.totalUsdToday != null && s.coins.length > 1 && (
            <>
              {" · "}Stock received across {s.coins.length} coins:{" "}
              <Num
                value={s.totalUsdToday}
                type="fiat_value"
                context="detailed"
                className="text-foreground"
              />
            </>
          )}
        </p>
        {s.indexError && (
          <div className="mt-4 border border-destructive/40 p-3 text-xs">
            <p className="font-medium text-destructive">
              Could not refresh this wallet from chain.
            </p>
            <p className="mt-1 text-muted-foreground">
              Showing what is already recorded. This is usually a rate limit.
              Reload in a minute.
            </p>
          </div>
        )}
      </header>

      {s.coins.length === 0 ? (
        <EmptyState heldRewardCoins={s.heldRewardCoins} />
      ) : (
        s.coins.map((c) => <CoinSection key={c.coinId} c={c} />)
      )}

      {s.runs.length > 0 && (
        <section className="mt-12">
          <h2 className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
            Stock DRIP runs
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Each run is three transactions: payouts pulled by the keeper,
            swapped on Jupiter, stock returned to this wallet. The fee is 1% of
            the output.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-2 font-normal">When</th>
                  <th className="py-2 text-right font-normal">In</th>
                  <th className="py-2 text-right font-normal">Out</th>
                  <th className="py-2 text-right font-normal">Fee</th>
                  <th className="py-2 text-right font-normal">Proof</th>
                </tr>
              </thead>
              <tbody>
                {s.runs.map((r) => (
                  <tr key={r.id} className="border-b border-border align-top">
                    <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">
                      {fmtDateTime(r.ts)}
                    </td>
                    <td className="py-2 pr-3 text-right whitespace-nowrap">
                      <Num
                        value={r.inAmount}
                        type="token_amount"
                        context="detailed"
                      />{" "}
                      {r.quoteSymbol}
                    </td>
                    <td className="py-2 pr-3 text-right whitespace-nowrap">
                      {r.swapSig ? (
                        <>
                          <Num
                            value={r.outAmount}
                            type="token_amount"
                            context="detailed"
                          />{" "}
                          {r.targetSymbol}
                        </>
                      ) : (
                        <span className="text-muted-foreground">refunded</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right whitespace-nowrap text-muted-foreground">
                      {r.feeAmount != null ? (
                        <>
                          <Num
                            value={r.feeAmount}
                            type="token_amount"
                            context="detailed"
                          />{" "}
                          {r.targetSymbol}
                        </>
                      ) : (
                        "--"
                      )}
                    </td>
                    <td className="py-2 text-right whitespace-nowrap">
                      <ProofLink sig={r.transferSig} label="transfer" />
                      {" · "}
                      <ProofLink sig={r.swapSig} label="swap" />
                      {" · "}
                      <ProofLink
                        sig={r.returnSig}
                        label={r.swapSig ? "return" : "refund"}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <p className="mt-12 text-xs text-muted-foreground">
        Payouts are transfers signed by the StonkFun distributor. Amounts
        labelled probable were classified by batch shape rather than by signer.
        USD at receipt uses the nearest recorded price; rows without one show no
        value rather than a guess. Payouts depend on trading volume and are not
        guaranteed.
      </p>
    </main>
  );
}

function CoinSection({ c }: { c: CoinStatement }) {
  const t = c.totals;
  const sharePrice = c.quoteUsd != null ? c.quoteUsd : null;
  const label = c.isStock ? "Stock received from" : "Paid out by";
  return (
    <section className="border-b border-border py-10">
      <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
        {label} {c.symbol}
        {c.name && c.name !== c.symbol ? (
          <span className="normal-case tracking-normal"> · {c.name}</span>
        ) : null}
      </p>
      <h2 className="mt-2 font-serif text-5xl tracking-tight sm:text-6xl">
        <Num
          value={t.shares}
          type="token_amount"
          context="detailed"
          tokenPriceUsd={sharePrice}
          className="font-serif"
        />{" "}
        <span className="text-2xl text-muted-foreground sm:text-3xl">
          {c.quoteSymbol}
        </span>
      </h2>
      <p className="mt-3 text-sm text-muted-foreground">
        {t.usdAtReceipt != null && (
          <>
            <Num
              value={t.usdAtReceipt}
              type="fiat_value"
              context="detailed"
              className="text-foreground"
            />{" "}
            at receipt
            {t.usdAtReceiptCoverage < 0.999 && (
              <span
                title={`${Math.round(t.usdAtReceiptCoverage * 100)}% of payouts have a recorded price`}
              >
                {" "}
                (partial)
              </span>
            )}
            {" · "}
          </>
        )}
        <Num
          value={t.usdToday}
          type="fiat_value"
          context="detailed"
          className="text-foreground"
        />{" "}
        today
        {" · "}
        <span className="font-mono tabular-nums">
          {t.count.toLocaleString("en-US")}
        </span>{" "}
        payouts since {fmtDate(t.first)}
      </p>

      <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-border pt-4 text-sm sm:grid-cols-4">
        <Stat label="Last 24 hours">
          <Num
            value={t.amount24h * c.multiplier}
            type="token_amount"
            tokenPriceUsd={sharePrice}
          />{" "}
          {c.quoteSymbol}
        </Stat>
        <Stat label="Last 7 days">
          <Num
            value={t.amount7d * c.multiplier}
            type="token_amount"
            tokenPriceUsd={sharePrice}
          />{" "}
          {c.quoteSymbol}
          <span className="text-muted-foreground">
            {" "}
            · <span className="font-mono tabular-nums">{t.count7d}</span>{" "}
            payouts
          </span>
        </Stat>
        <Stat label={`${c.symbol} position`}>
          {c.position ? (
            <>
              <Num
                value={c.position.balance}
                type="token_amount"
                tokenPriceUsd={
                  c.position.usd && c.position.balance
                    ? c.position.usd / c.position.balance
                    : null
                }
              />{" "}
              {c.symbol}
              {c.position.usd != null && (
                <span className="text-muted-foreground">
                  {" "}
                  · <Num value={c.position.usd} type="fiat_value" />
                </span>
              )}
            </>
          ) : (
            "--"
          )}
        </Stat>
        <Stat label="Payouts as % of position">
          {c.position?.usd && t.usdToday != null ? (
            <Num value={(100 * t.usdToday) / c.position.usd} type="percent" />
          ) : (
            "--"
          )}
        </Stat>
      </dl>

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        {c.drip ? (
          <>
            <span className="border border-foreground px-2 py-0.5 text-xs font-medium">
              DRIP on
            </span>
            <span className="text-muted-foreground">
              {c.quoteSymbol} → {c.drip.targetSymbol}, sweeps at{" "}
              <Num value={c.drip.thresholdUsd} type="fiat_value" />
              {c.drip.approvedSig && (
                <>
                  {" · "}
                  <ProofLink sig={c.drip.approvedSig} label="approval" />
                </>
              )}
            </span>
            <Link
              href="/drip"
              className="text-primary underline underline-offset-2"
            >
              Manage
            </Link>
          </>
        ) : (
          <Link
            href="/drip"
            className="text-primary underline underline-offset-2"
          >
            Turn these {c.quoteSymbol} payouts into the stock you want →
          </Link>
        )}
        {c.stockUsd != null && (
          <span className="text-xs text-muted-foreground">
            {c.quoteSymbol} tracks a share at{" "}
            <Num value={c.stockUsd} type="token_price" />
          </span>
        )}
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="py-2 font-normal">Received</th>
              <th className="py-2 text-right font-normal">Amount</th>
              <th className="py-2 text-right font-normal">USD at receipt</th>
              <th className="py-2 text-right font-normal">Proof</th>
            </tr>
          </thead>
          <tbody>
            {c.payouts.map((p) => (
              <tr key={p.sig} className="border-b border-border">
                <td className="py-1.5 pr-3 whitespace-nowrap text-muted-foreground">
                  {fmtDateTime(p.blockTime)}
                  {p.probable && <span className="ml-2 text-xs">probable</span>}
                </td>
                <td className="py-1.5 pr-3 text-right whitespace-nowrap">
                  <Num
                    value={p.amount * c.multiplier}
                    type="token_amount"
                    context="detailed"
                    tokenPriceUsd={sharePrice}
                  />{" "}
                  <span className="text-muted-foreground">{c.quoteSymbol}</span>
                </td>
                <td className="py-1.5 pr-3 text-right whitespace-nowrap text-muted-foreground">
                  <Num
                    value={p.usdAtReceipt}
                    type="fiat_value"
                    context="detailed"
                  />
                  {p.usdEstimated && <span className="ml-1 text-xs">est.</span>}
                </td>
                <td className="py-1.5 text-right whitespace-nowrap">
                  <ProofLink sig={p.sig} label="proof" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {t.count > c.payouts.length && (
          <p className="mt-2 text-xs text-muted-foreground">
            Showing the latest {c.payouts.length} of{" "}
            {t.count.toLocaleString("en-US")} payouts.
          </p>
        )}
      </div>
    </section>
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

function ProofLink({ sig, label }: { sig: string | null; label: string }) {
  if (!sig) return <span className="text-muted-foreground">{label}</span>;
  return (
    <a
      href={txUrl(sig)}
      target="_blank"
      rel="noreferrer"
      className="text-primary underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
      title={sig}
    >
      {label}
    </a>
  );
}

function EmptyState({ heldRewardCoins }: { heldRewardCoins: number }) {
  return (
    <section className="py-16 text-center">
      <p className="font-serif text-3xl">No stock payouts yet</p>
      <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
        {heldRewardCoins > 0
          ? `This wallet holds ${heldRewardCoins} reward coin${heldRewardCoins === 1 ? "" : "s"} but no payout from the distributor has landed on it yet. Payouts arrive every few minutes for holders above the coin's minimum.`
          : "This wallet does not hold a StonkFun reward coin. Buy one that pays in a tokenized stock and the payouts will show up here with a proof link each."}
      </p>
      <Link
        href="/"
        className="mt-6 inline-block text-sm text-primary underline underline-offset-2"
      >
        Check another wallet
      </Link>
    </section>
  );
}
