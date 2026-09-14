"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function StatementError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <p className="font-serif text-3xl">Could not build this statement</p>
      <p className="mt-3 max-w-md text-sm text-muted-foreground">
        {error.message || "The chain or the database did not answer in time."}{" "}
        This is usually a rate limit on the RPC. Try again in a moment.
      </p>
      <div className="mt-6 flex gap-3">
        <Button onClick={reset}>Try again</Button>
        <Link
          href="/"
          className="inline-flex items-center border border-border px-4 text-sm underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
        >
          Back
        </Link>
      </div>
    </main>
  );
}
