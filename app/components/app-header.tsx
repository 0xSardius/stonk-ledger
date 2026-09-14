"use client";

import Link from "next/link";
import { WalletButton } from "./wallet-button";

export function AppHeader() {
  return (
    <header className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-6 py-4">
      <Link
        href="/"
        className="font-serif text-lg tracking-tight focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        Stonk Ledger
      </Link>
      <nav className="flex items-center gap-4 text-sm">
        <Link
          href="/drip"
          className="underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Stock DRIP
        </Link>
        <WalletButton />
      </nav>
    </header>
  );
}
