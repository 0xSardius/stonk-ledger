"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function Home() {
  const router = useRouter();
  const [wallet, setWallet] = useState("");

  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <h1 className="text-4xl font-black tracking-tight">
        Your memecoin pays you in Apple.
      </h1>
      <p className="mt-3 max-w-xl text-base text-muted-foreground">
        Paste a wallet. See every tokenized-stock payout it earned, with a proof
        link per transaction. Turn any payout stream into a stock position with
        one approval.
      </p>
      <form
        className="mt-8 flex max-w-xl gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const w = wallet.trim();
          if (w) router.push(`/wallet/${w}`);
        }}
      >
        <Input
          value={wallet}
          onChange={(e) => setWallet(e.target.value)}
          placeholder="Wallet address"
          className="font-mono"
          aria-label="Wallet address"
        />
        <Button type="submit">Show my dividends</Button>
      </form>
    </main>
  );
}
