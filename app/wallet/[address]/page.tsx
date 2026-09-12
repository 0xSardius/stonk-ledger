export default async function WalletPage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = await params;
  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <p className="text-xs text-muted-foreground">Wallet</p>
      <h1 className="break-all font-mono text-lg">{address}</h1>
      <p className="mt-6 text-sm text-muted-foreground">
        Statement lands on Day 3. The indexer and Stock DRIP come first.
      </p>
    </main>
  );
}
