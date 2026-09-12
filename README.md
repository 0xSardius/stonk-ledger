# Stonk Ledger

The receipt and the reinvestment for meme coins that pay dividends in tokenized stocks.

Paste a wallet, see every APPLx, STRCx, or SPYx payout it earned with a proof link per transaction. Turn any payout stream into a stock position with one approval (Stock DRIP).

Built for the [Stocklana hackathon](https://hackathons.solana.com/hackathons/stocklana). Submissions close 2026-09-18.

## Status

Scaffolded 2026-09-12. Stock DRIP is the headline feature; the ledger is the proof layer. See `docs/PRD.md` (v0.5) for the spec and `docs/CHECKPOINT.md` for where the build is.

## Quick start

Requires Node 22+ and pnpm.

```bash
pnpm install
cp .env.example .env   # fill in DATABASE_URL (Neon) and HELIUS_API_KEY
pnpm db:push           # create tables
pnpm seed              # fill `coins` from the StonkFun API (add --decimals to fill quote decimals)
pnpm dev               # http://localhost:3000, health at /api/health
```

Workers run separately (one Railway service each):

```bash
pnpm worker:indexer
pnpm worker:rate-cacher
pnpm worker:drip-keeper
```

Checks:

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
pnpm test -- tests/stonkfun.test.ts   # one file
```

## What it does

- **Dividend statement.** Every stock payout a wallet received from a reward coin, valued at receipt and today, with a Solscan link per transaction.
- **Stock DRIP.** One capped delegation on the payout token account. A keeper converts payouts into the holder's chosen xStock every ten minutes and sends it back. Revoke in one click.
- **Proof feed and share cards.** Public, verifiable, per coin and per wallet.
- **Any reward coin.** Adding a coin is a config row.

## Stack

Next.js 16, TypeScript, Tailwind 4, shadcn/ui, `@solana/kit` 7 with `@solana/react`, Postgres (Neon) via Drizzle, Helius, Jupiter. Workers are plain TypeScript run with `tsx`.

## Security

The DRIP keeper never holds a private key for user funds. Delegations are capped per approval. Every run logs the transfer, swap, and return signatures. See PRD section 7.

## License

MIT
