"use client";

import Link from "next/link";
import useSWR from "swr";
import { Num } from "@/components/formatted-number";
import { fmtDateTime } from "@/lib/format";
import { txUrl } from "../lib/explorer";

type PublicRun = {
  id: number;
  ts: string;
  wallet: string;
  walletShort: string;
  coinSymbol: string;
  quoteSymbol: string;
  inAmount: number;
  targetSymbol: string;
  outAmount: number | null;
  status: string;
  transferSig: string | null;
  swapSig: string | null;
  returnSig: string | null;
};

type PublicDrip = {
  targets: {
    symbol: string;
    name: string;
    mint: string;
    issuer: "xStocks" | "PreStocks";
  }[];
  defaultThresholdUsd: number;
  counts: { activeDelegations: number; completedRuns: number; holders: number };
  runs: PublicRun[];
};

const ISSUERS = [
  { issuer: "xStocks", label: "Public stocks, xStocks" },
  { issuer: "PreStocks", label: "Pre-IPO, PreStocks" },
] as const;

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function Proof({ sig, label }: { sig: string | null; label: string }) {
  if (!sig) return <span className="text-muted-foreground">{label}</span>;
  return (
    <a
      href={txUrl(sig)}
      target="_blank"
      rel="noreferrer"
      title={sig}
      className="text-primary underline underline-offset-2"
    >
      {label}
    </a>
  );
}

/** What DRIP is and what it has done, for a visitor with no wallet connected. */
export function PublicDrip() {
  const { data } = useSWR<PublicDrip>("/api/drip/public", fetcher);
  if (!data) return null;
  const { counts, runs, targets } = data;

  return (
    <div className="mt-10 max-w-3xl space-y-10">
      <dl className="grid grid-cols-3 gap-6 border-t border-border pt-6 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Mainnet runs</dt>
          <dd className="mt-0.5 font-mono tabular-nums">
            {counts.completedRuns}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Wallets served</dt>
          <dd className="mt-0.5 font-mono tabular-nums">{counts.holders}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Active now</dt>
          <dd className="mt-0.5 font-mono tabular-nums">
            {counts.activeDelegations}
          </dd>
        </div>
      </dl>

      {runs.length > 0 && (
        <section>
          <h2 className="font-serif text-2xl">Recent runs</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Each run is three transactions: payouts pulled by the keeper,
            swapped on Jupiter, stock returned to the holder.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-2 font-normal">When</th>
                  <th className="py-2 font-normal">Wallet</th>
                  <th className="py-2 text-right font-normal">In</th>
                  <th className="py-2 text-right font-normal">Out</th>
                  <th className="py-2 text-right font-normal">Proof</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="border-b border-border align-top">
                    <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">
                      {fmtDateTime(new Date(r.ts))}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      <Link
                        href={`/wallet/${r.wallet}`}
                        className="font-mono text-primary underline underline-offset-2"
                      >
                        {r.walletShort}
                      </Link>
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
                      {r.status === "done" ? (
                        <>
                          <Num
                            value={r.outAmount}
                            type="token_amount"
                            context="detailed"
                          />{" "}
                          {r.targetSymbol}
                        </>
                      ) : (
                        <span className="text-muted-foreground">
                          {r.status === "refunded" ? "refunded" : "in progress"}
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-right whitespace-nowrap">
                      <Proof sig={r.transferSig} label="transfer" />
                      {" · "}
                      <Proof sig={r.swapSig} label="swap" />
                      {" · "}
                      <Proof
                        sig={r.returnSig}
                        label={
                          r.status === "refunded" || r.status === "refunding"
                            ? "refund"
                            : "return"
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section>
        <h2 className="font-serif text-2xl">What your payouts can become</h2>
        <div className="mt-3 space-y-4">
          {ISSUERS.map((g) => (
            <div key={g.issuer}>
              <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
                {g.label}
              </p>
              <p className="mt-1 text-sm">
                {targets
                  .filter((t) => t.issuer === g.issuer)
                  .map((t) => t.symbol)
                  .join(" · ")}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          Any payout token Jupiter can route works as the input: STONK, BONK,
          PEPE, an xStock you did not choose. Auto-compounders put payouts back
          into the meme coin; DRIP turns them into the stock you pick.
        </p>
      </section>
    </div>
  );
}
