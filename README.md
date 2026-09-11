# Stonk Ledger

The receipt and the reinvestment for meme coins that pay dividends in tokenized stocks.

Paste a wallet, see every APPLx, STRCx, or SPYx payout it earned with a proof link per transaction. Turn any payout stream into a stock position with one approval (Stock DRIP).

Built for the [Stocklana hackathon](https://hackathons.solana.com/hackathons/stocklana). Submissions close 2026-09-18.

## Status

Day 0. Nothing runs yet. See `docs/PRD.md` for the full spec and `docs/CHECKPOINT.md` for where the build is.

## Quick start

```bash
pnpm install
cp .env.example .env   # fill in HELIUS_API_KEY and DATABASE_URL
pnpm dev
```

## What it does

- **Dividend statement.** Every stock payout a wallet received from a reward coin, valued at receipt and today, with a Solscan link per transaction.
- **Stock DRIP.** One capped delegation on the payout token account. A keeper converts payouts into the holder's chosen xStock every ten minutes and sends it back. Revoke in one click.
- **Proof feed and share cards.** Public, verifiable, per coin and per wallet.
- **Any reward coin.** Adding a coin is a config row.

## Stack

Next.js 15, TypeScript, Tailwind, shadcn/ui, `@solana/kit`, Postgres (Neon) via Drizzle, Helius, Jupiter, grammY.

## Security

The DRIP keeper never holds a private key for user funds. Delegations are capped per approval. Every run logs the transfer, swap, and return signatures. See PRD section 7.

## License

MIT
