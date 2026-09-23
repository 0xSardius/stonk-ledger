# Stonk Ledger

The receipt and the reinvestment for meme coins that pay dividends in tokenized stocks.

Paste a wallet, see every APPLx, STRCx, or SPYx payout it earned with a proof link per transaction. Turn any payout stream into a stock position with one approval: **Stock DRIP**.

Built for the [Stocklana hackathon](https://hackathons.solana.com/hackathons/stocklana) by [0xsardius](https://github.com/0xSardius). Submissions close 2026-09-25.

## Live

**https://stonk-ledger.vercel.app**

| Route                                       | What it is                                                  |
| ------------------------------------------- | ----------------------------------------------------------- |
| `/`                                         | paste a wallet                                              |
| `/wallet/<address>`                         | the dividend statement, with Stock DRIP runs inline         |
| `/drip`                                     | approve, raise, or revoke Stock DRIP for a connected wallet |
| `/coins`                                    | reward coins and who pays in what                           |
| `/coin/<mint>`                              | proof feed of every distribution for a coin                 |
| `/api/og/<address>`                         | share card                                                  |
| `/api/wallet/<address>`, `/api/feed/<mint>` | JSON                                                        |

## What it does

**The receipt.** StonkFun reward coins pay a 3% transfer tax to holders in the coin's quote asset. Thousands are quoted in tokenized stocks. Stonk Ledger classifies every inbound quote transfer sent by the platform's distributor wallets as a payout, values it at receipt and today, and links each one to Solscan. A wallet's own history is indexed from chain when its statement is viewed, so a statement is complete. The proof feed per coin is a recent sample: a scheduled job reads the distributors' latest batches several times a day. The platform sends over 100k distributor transactions a day, more than the Helius free tier can read.

**The reinvestment.** A holder approves the keeper as a capped delegate on their quote token account. Several times a day the keeper sweeps payouts that arrived after the approval, swaps them on Jupiter Ultra into the stock the holder chose (SPYx by default), and sends the stock back, keeping 1% as the fee. Three signatures per run, all on the statement. Revoke is one transaction.

**Generic.** Every coin is a row in `coins`, seeded from the StonkFun API across all quote categories. Adding a coin is a config row.

## Run it

Requires Node 22+ and pnpm. You need a Neon Postgres URL and a Helius API key (free tiers work).

```bash
pnpm install
cp .env.example .env      # fill in DATABASE_URL and HELIUS_API_KEY
pnpm db:push              # create tables
pnpm seed --decimals      # 1,200 coins from StonkFun, about 5 minutes (the API is slow)
pnpm dev                  # http://localhost:3000, health at /api/health
```

Open `/wallet/<any holder address>`. The first view indexes the wallet's payout history from chain (a few seconds), later views are instant.

To run Stock DRIP locally you also need a keeper keypair in `DRIP_KEEPER_SECRET_KEY` (base58 or a JSON byte array) with a little SOL for fees. Then:

```bash
pnpm job snapshot-prices  # quote prices, needed for thresholds
pnpm job drip-once        # one keeper pass over active delegations
```

Checks:

```bash
pnpm ci                              # build + typecheck + lint + format + tests
pnpm test -- tests/classify.test.ts  # payout classifier against mainnet fixtures
pnpm test -- tests/drip-run.test.ts  # keeper decision path against mainnet fixtures
```

## Deploy

- **App:** Vercel, repo connected. Production env: `DATABASE_URL`, `HELIUS_API_KEY`, `DRIP_KEEPER_SECRET_KEY`, `NEXT_PUBLIC_APP_URL`.
- **Scheduled jobs:** GitHub Actions, one cron per file under `.github/workflows/`: `prices.yml` (cron every 5 minutes); `keeper.yml` (cron every 10 minutes) pulls the distributors' new batches (`pnpm job ingest-distributor`, 10 pages per wallet) then runs the DRIP keeper; `rewards.yml` hourly. GitHub runs these crons late on free runners, observed every 1.5 to 7 hours, so treat them as "several times a day"; `daily.yml` refreshes the coin catalog (`pnpm seed --pages=10`) and rolls batches older than 14 days into daily totals. Repo secrets `DATABASE_URL`, `HELIUS_API_KEY`, `DRIP_KEEPER_SECRET_KEY`. Nothing runs between passes, so cost scales with our users, not with StonkFun's traffic. The `workers/` loops exist for a long-running host if you prefer one.

## Stack

Next.js 16, React 19, TypeScript, Tailwind 4, shadcn/ui, `@solana/kit` 7 with `@solana/react` and the kit wallet plugin, Postgres on Neon via Drizzle, Helius (RPC, enhanced transactions), Jupiter (Price v3, Ultra), Vitest.

## Docs

- `docs/PRD.md`: the spec.
- `docs/RESEARCH.md`: how the distributor was identified, holder payout distribution, Jupiter verification.
- `docs/SECURITY.md`: what the keeper can and cannot do, and how that is enforced.
- `brand.md`: design direction and tokens.

## Security

The keeper never holds a private key for user funds. Delegations are capped per approval. Every run logs the transfer, swap, and return signatures. See `docs/SECURITY.md`.

## License

MIT
