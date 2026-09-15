"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { address } from "@solana/kit";
import { useConnectedWallet } from "@solana/kit-plugin-wallet/react";
import * as spl from "@solana-program/token";
import * as t22 from "@solana-program/token-2022";
import { toast } from "sonner";
import { useAppClient } from "../lib/client-provider";
import { useSend } from "../lib/hooks/use-send";
import { sendViaWallet } from "../lib/send-via-wallet";
import { txUrl, ellipsify } from "../lib/explorer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { brutalButton, brutalPanel } from "@/lib/ui";

const TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

type Target = { symbol: string; name: string; mint: string; decimals: number };
type Candidate = {
  coinId: number;
  symbol: string;
  name: string | null;
  coinBalance: number;
  quoteMint: string;
  quoteSymbol: string;
  quoteDecimals: number;
  quoteProgram: string;
  quoteTokenAccount: string;
  quoteBalanceRaw: string;
  payouts7d: string;
  payouts7dCount: number;
  delegation: {
    targetMint: string;
    capRaw: string;
    delegatedRemainingRaw: string | null;
    pendingUi: number | null;
    pendingUsd: number | null;
    thresholdUsd: string;
    approvedSig: string | null;
    createdAt: string;
  } | null;
};
type Status = {
  wallet: string;
  keeper: string;
  targets: Target[];
  defaultThresholdUsd: number;
  candidates: Candidate[];
};
type Quote = {
  outAmount: string;
  toHolderAmount: string;
  feeAmount: string;
  priceImpactPct: number;
  inUsdValue: number | null;
  outUsdValue: number | null;
  error?: string;
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const fmt = (raw: string | bigint, decimals: number, digits = 4) =>
  (Number(raw) / 10 ** decimals).toLocaleString("en-US", {
    maximumFractionDigits: digits,
  });

function toRaw(ui: string, decimals: number): bigint {
  const n = Number(ui);
  if (!Number.isFinite(n) || n <= 0) return 0n;
  return BigInt(Math.round(n * 10 ** decimals));
}

/** Default cap: four weeks of payouts at the trailing 7-day rate, else the balance. */
function defaultCap(c: Candidate) {
  const p7 = Number(c.payouts7d);
  const bal = Number(c.quoteBalanceRaw) / 10 ** c.quoteDecimals;
  const cap = p7 > 0 ? p7 * 4 : bal > 0 ? bal : 1;
  return cap.toFixed(Math.min(6, c.quoteDecimals));
}

export default function DripPage() {
  const client = useAppClient();
  const connected = useConnectedWallet(client);
  const wallet = connected?.account.address;
  const { run, isSending } = useSend();

  const {
    data: status,
    isLoading,
    mutate,
  } = useSWR<Status>(
    wallet ? `/api/drip/status?wallet=${wallet}` : null,
    fetcher
  );

  const [selected, setSelected] = useState<Candidate | null>(null);
  const [targetChoice, setTargetChoice] = useState<string | null>(null);
  const [capUi, setCapUi] = useState("");

  const targetMint = targetChoice ?? status?.targets[0]?.mint ?? null;
  const target = status?.targets.find((t) => t.mint === targetMint) ?? null;
  const capRaw = selected ? toRaw(capUi, selected.quoteDecimals) : 0n;
  const sameAsQuote =
    !!selected && !!target && target.mint === selected.quoteMint;

  const quoteKey =
    selected && target && capRaw > 0n && !sameAsQuote
      ? `/api/drip/quote?inputMint=${selected.quoteMint}&outputMint=${target.mint}&amount=${capRaw}`
      : null;
  const { data: quote } = useSWR<Quote>(quoteKey, fetcher, {
    keepPreviousData: true,
  });

  const choose = (c: Candidate) => {
    setSelected(c);
    setCapUi(defaultCap(c));
  };

  const approve = async () => {
    if (!connected?.signer || !status || !selected || !target || capRaw <= 0n)
      return;
    const signer = connected.signer;
    const p = selected.quoteProgram === TOKEN_2022 ? t22 : spl;
    const ix = p.getApproveCheckedInstruction({
      source: address(selected.quoteTokenAccount),
      mint: address(selected.quoteMint),
      delegate: address(status.keeper),
      owner: signer,
      amount: capRaw,
      decimals: selected.quoteDecimals,
    });
    const sig = await run(
      () => sendViaWallet(client, signer, [ix]),
      "Stock DRIP approved"
    );
    if (!sig) return;
    const r = await fetch("/api/drip/approve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        wallet: status.wallet,
        coinId: selected.coinId,
        quoteMint: selected.quoteMint,
        quoteProgram: selected.quoteProgram,
        quoteTokenAccount: selected.quoteTokenAccount,
        targetMint: target.mint,
        capRaw: capRaw.toString(),
        approvedSig: sig,
        thresholdUsd: status.defaultThresholdUsd,
      }),
    });
    const body = await r.json();
    if (!r.ok) {
      toast.error(
        `Approved on chain but not saved: ${JSON.stringify(body.error)}`
      );
    } else {
      toast.success("DRIP is on. The keeper checks every ten minutes.");
      setSelected(null);
    }
    await mutate();
  };

  const revoke = async (c: Candidate) => {
    if (!connected?.signer || !status) return;
    const signer = connected.signer;
    const p = c.quoteProgram === TOKEN_2022 ? t22 : spl;
    const ix = p.getRevokeInstruction({
      source: address(c.quoteTokenAccount),
      owner: signer,
    });
    const sig = await run(
      () => sendViaWallet(client, signer, [ix]),
      "Delegation revoked"
    );
    if (!sig) return;
    await fetch("/api/drip/revoke", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        wallet: status.wallet,
        quoteMint: c.quoteMint,
        revokedSig: sig,
      }),
    });
    await mutate();
  };

  if (!wallet) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-16">
        <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
          Stock DRIP
        </p>
        <h1 className="mt-2 font-serif text-4xl tracking-tight sm:text-5xl">
          Choose what your payouts become
        </h1>
        <p className="mt-3 max-w-xl text-sm text-muted-foreground">
          Connect the wallet that holds a reward coin, top right. Then pick the
          stock its payouts should turn into: SPYx, QQQx, NVDAx, APPLx, or any
          xStock on the list.
        </p>
        <ul className="mt-6 max-w-xl space-y-2 border-t border-border pt-4 text-sm text-muted-foreground">
          <li>
            One capped approval on your payout token account. No other token, no
            SOL.
          </li>
          <li>
            Every ten minutes the keeper sweeps new payouts, swaps on Jupiter,
            and sends the stock back.
          </li>
          <li>
            Three signatures per run on your statement. Fee is 1% of the output.
            Revoke in one click.
          </li>
        </ul>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-6 py-12">
      <div className="border-b border-border pb-6">
        <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
          Stock DRIP
        </p>
        <h1 className="mt-2 font-serif text-4xl tracking-tight sm:text-5xl">
          Choose what your payouts become
        </h1>
        <p className="mt-3 max-w-xl text-sm text-muted-foreground">
          One approval. Every ten minutes the keeper converts new payouts into
          the stock you pick and sends it back to this wallet. Revoke any time.
        </p>
        <p className="mt-3 text-sm">
          <Link
            href={`/wallet/${wallet}`}
            className="text-primary underline underline-offset-2"
          >
            Your statement →
          </Link>
          <span className="ml-2 text-xs text-muted-foreground">
            every run shows up there with its three signatures
          </span>
        </p>
      </div>

      {isLoading && !status && (
        <p className="text-sm text-muted-foreground">Reading your holdings…</p>
      )}

      {status && status.candidates.length === 0 && (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            This wallet holds no reward coin with a quote token account yet.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {status?.candidates.map((c) => (
          <Card
            key={c.coinId}
            className={selected?.coinId === c.coinId ? "border-primary" : ""}
          >
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-base">
                <span>
                  {c.symbol}{" "}
                  <span className="font-normal text-muted-foreground">
                    pays {c.quoteSymbol}
                  </span>
                </span>
                {c.delegation ? (
                  <Badge>DRIP on</Badge>
                ) : (
                  <Badge variant="outline">off</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="tabular-nums">
                Last 7 days:{" "}
                {Number(c.payouts7d).toLocaleString("en-US", {
                  maximumFractionDigits: 4,
                })}{" "}
                {c.quoteSymbol} over {c.payouts7dCount} payouts
              </p>
              <p className="tabular-nums text-muted-foreground">
                {c.quoteSymbol} balance:{" "}
                {fmt(c.quoteBalanceRaw, c.quoteDecimals)}
              </p>
              {c.delegation ? (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Target{" "}
                    {status.targets.find(
                      (t) => t.mint === c.delegation!.targetMint
                    )?.symbol ?? "?"}
                    , cap {fmt(c.delegation.capRaw, c.quoteDecimals)}{" "}
                    {c.quoteSymbol}, threshold ${c.delegation.thresholdUsd}
                    {c.delegation.approvedSig && (
                      <>
                        {" "}
                        <a
                          className="underline"
                          href={txUrl(c.delegation.approvedSig)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          approval tx
                        </a>
                      </>
                    )}
                  </p>
                  {c.delegation.pendingUi != null && (
                    <p className="text-xs tabular-nums">
                      Pending since approval:{" "}
                      {c.delegation.pendingUi.toLocaleString("en-US", {
                        maximumFractionDigits: 6,
                      })}{" "}
                      {c.quoteSymbol}
                      {c.delegation.pendingUsd != null && (
                        <> (${c.delegation.pendingUsd.toFixed(2)})</>
                      )}
                      {" · "}
                      {c.delegation.pendingUsd != null &&
                      c.delegation.pendingUsd >=
                        Number(c.delegation.thresholdUsd)
                        ? "sweeps on the next keeper pass"
                        : `sweeps at $${c.delegation.thresholdUsd}`}
                    </p>
                  )}
                  {c.delegation.delegatedRemainingRaw != null && (
                    <p className="text-xs tabular-nums">
                      Cap remaining:{" "}
                      {fmt(c.delegation.delegatedRemainingRaw, c.quoteDecimals)}{" "}
                      {c.quoteSymbol}
                      {Number(c.delegation.delegatedRemainingRaw) === 0 && (
                        <span className="ml-2 text-destructive">
                          spent, raise it to keep sweeping
                        </span>
                      )}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        setTargetChoice(c.delegation!.targetMint);
                        choose(c);
                      }}
                    >
                      Raise cap
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isSending}
                      onClick={() => revoke(c)}
                    >
                      Revoke
                    </Button>
                  </div>
                </div>
              ) : (
                <Button size="sm" onClick={() => choose(c)}>
                  Set up DRIP
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {selected && status && (
        <Card className={brutalPanel}>
          <CardHeader>
            <CardTitle className="font-serif text-2xl font-normal tracking-tight">
              Turn {selected.symbol} payouts ({selected.quoteSymbol}) into
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex flex-wrap gap-2">
              {status.targets.map((t) => (
                <Button
                  key={t.mint}
                  size="sm"
                  variant={t.mint === targetMint ? "default" : "outline"}
                  onClick={() => setTargetChoice(t.mint)}
                  disabled={t.mint === selected.quoteMint}
                  title={
                    t.mint === selected.quoteMint
                      ? "You are already paid in this stock"
                      : t.name
                  }
                >
                  {t.symbol}
                </Button>
              ))}
            </div>

            <label className="block">
              <span className="text-xs font-medium">
                Cap, in {selected.quoteSymbol}
              </span>
              <Input
                value={capUi}
                onChange={(e) => setCapUi(e.target.value)}
                inputMode="decimal"
                className="mt-1 max-w-xs font-mono"
              />
              <span className="mt-1 block text-xs text-muted-foreground">
                The most the keeper can ever move. Default is four weeks of
                payouts at the current rate. Re-approve when it runs out.
              </span>
            </label>

            <div className="border-t border-border pt-4">
              <p className="font-medium">What you are approving</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                <li>
                  Delegate{" "}
                  <span className="font-mono">
                    {ellipsify(status.keeper, 6)}
                  </span>{" "}
                  may move up to{" "}
                  <span className="tabular-nums">{capUi || "0"}</span>{" "}
                  {selected.quoteSymbol} from your {selected.quoteSymbol}{" "}
                  account. Nothing else. No other token, no SOL.
                </li>
                <li>
                  Only payouts that arrive after this approval are swept, and
                  only when they are worth at least $
                  {status.defaultThresholdUsd}.
                </li>
                <li>
                  Each sweep is swapped on Jupiter and the{" "}
                  {target?.symbol ?? "stock"} is sent back to this wallet in the
                  same run.
                </li>
                <li>
                  Fee: 1% of each sweep, taken in{" "}
                  {target?.symbol ?? "the stock"}. Disclosed here, never
                  elsewhere.
                </li>
                <li>
                  Revoke is one transaction from this wallet. It ends the
                  delegation immediately.
                </li>
                {quote && !quote.error && target && (
                  <li className="tabular-nums">
                    At today&apos;s prices the full cap would buy about{" "}
                    {fmt(quote.toHolderAmount, target.decimals)} {target.symbol}{" "}
                    (price impact {(quote.priceImpactPct * 100).toFixed(2)}%)
                    {quote.outUsdValue != null && (
                      <>, about ${quote.outUsdValue.toFixed(2)}</>
                    )}
                    .
                  </li>
                )}
              </ul>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                className={brutalButton}
                onClick={approve}
                disabled={isSending || capRaw <= 0n || !target || sameAsQuote}
              >
                {isSending ? "Waiting for wallet…" : "Approve Stock DRIP"}
              </button>
              <Button variant="ghost" onClick={() => setSelected(null)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
