/** Skeleton that matches the statement's shape, shown while the wallet is indexed. */
export default function Loading() {
  return (
    <main
      className="mx-auto max-w-3xl px-6 pb-16 pt-10"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="border-b border-border pb-6">
        <div className="h-3 w-32 bg-muted" />
        <div className="mt-2 h-5 w-full max-w-lg bg-muted" />
        <p className="mt-3 text-xs text-muted-foreground">
          Reading this wallet&apos;s payout history from chain…
        </p>
      </div>
      {[0, 1].map((i) => (
        <div key={i} className="border-b border-border py-10">
          <div className="h-3 w-40 bg-muted" />
          <div className="mt-3 h-14 w-72 bg-muted" />
          <div className="mt-3 h-4 w-96 max-w-full bg-muted" />
          <div className="mt-6 grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-4">
            {[0, 1, 2, 3].map((j) => (
              <div key={j}>
                <div className="h-3 w-20 bg-muted" />
                <div className="mt-1 h-4 w-24 bg-muted" />
              </div>
            ))}
          </div>
          <div className="mt-6 space-y-2">
            {[0, 1, 2, 3, 4].map((j) => (
              <div key={j} className="h-6 w-full bg-muted" />
            ))}
          </div>
        </div>
      ))}
    </main>
  );
}
