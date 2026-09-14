"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";

const EXAMPLES = [
  {
    label: "a top TREE holder, paid in APPLx",
    address: "4di7dpumucn9xr3Wt2SpMxP1kjpX7iM8KhgtnhCLPoVa",
  },
  {
    label: "a top KNOTS holder, paid in STONK",
    address: "6FpuXT6kJUq5AAHrsENiX9DWZqyyGwvQxYUUstVx3DNY",
  },
];

export default function Home() {
  const router = useRouter();
  const [wallet, setWallet] = useState("");
  const [error, setError] = useState<string | null>(null);

  const go = (w: string) => {
    const v = w.trim();
    if (v.length < 32 || v.length > 44) {
      setError("That does not look like a Solana address.");
      return;
    }
    router.push(`/wallet/${v}`);
  };

  return (
    <main className="mx-auto max-w-3xl px-6 pb-16 pt-14">
      <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
        Stonk Ledger
      </p>
      <h1 className="mt-3 font-serif text-5xl leading-[1.05] tracking-tight sm:text-6xl">
        Your memecoin pays you in Apple.
      </h1>
      <p className="mt-4 max-w-xl text-base text-muted-foreground">
        Thousands of Solana meme coins pay holders in tokenized stocks. Paste a
        wallet to see every payout it received, with a proof link per
        transaction. Then turn the stream into the stock you want with one
        approval.
      </p>

      <form
        className="mt-8 flex max-w-xl flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          go(wallet);
        }}
      >
        <label htmlFor="wallet" className="sr-only">
          Wallet address
        </label>
        <Input
          id="wallet"
          name="wallet"
          value={wallet}
          onChange={(e) => {
            setWallet(e.target.value);
            setError(null);
          }}
          placeholder="Wallet address"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          aria-invalid={error != null}
          aria-describedby={error ? "wallet-error" : undefined}
          className="h-11 font-mono"
        />
        <button
          type="submit"
          className="h-11 border-2 border-foreground bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-[3px_3px_0_var(--foreground)] transition-transform hover:-translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-x-px active:translate-y-px active:shadow-none motion-reduce:transition-none"
        >
          Show my dividends
        </button>
      </form>
      {error && (
        <p id="wallet-error" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <p className="mt-6 text-sm text-muted-foreground">
        Or look at{" "}
        {EXAMPLES.map((e, i) => (
          <span key={e.address}>
            <Link
              href={`/wallet/${e.address}`}
              className="text-primary underline underline-offset-2"
            >
              {e.label}
            </Link>
            {i < EXAMPLES.length - 1 ? " or " : "."}
          </span>
        ))}
      </p>

      <section className="mt-16 grid gap-8 border-t border-border pt-8 sm:grid-cols-3">
        <div>
          <p className="font-serif text-2xl">The receipt</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Every stock payout a wallet received, valued at receipt and today,
            each one linked to its transaction.
          </p>
        </div>
        <div>
          <p className="font-serif text-2xl">The reinvestment</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Stock DRIP: one capped approval, and a keeper converts new payouts
            into SPYx, QQQx, or the stock you pick, every ten minutes. Revoke in
            one click.
          </p>
        </div>
        <div>
          <p className="font-serif text-2xl">The proof</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Every DRIP run logs three signatures. Nothing is held for you except
            the ten seconds between transfer and return, and that is disclosed
            before you approve.
          </p>
        </div>
      </section>
    </main>
  );
}
