# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Stonk Ledger: a Stocklana hackathon entry (Solana Foundation, deadline 2026-09-18). Paste a wallet, see every tokenized-stock payout it earned from StonkFun reward coins with a proof link per transaction, and turn any payout stream into a stock position with one approval (Stock DRIP).

**Positioning (decided 2026-09-12):** Stock DRIP is the headline feature. The ledger is the plumbing DRIP needs and the proof that each run happened. Lead every pitch, README, and page with DRIP. Scoring is in `.superstack/entry-scoring.md`.

**Current state:** docs only. No package.json, no source code yet. Read `docs/CHECKPOINT.md` first in every session; it holds the day-by-day status and blockers. `docs/PRD.md` v0.5 is the spec. `.superstack/idea-context.md` is the handoff from the idea phase (key mints, stack hints, competitors).

## Commands (planned, per README)

```bash
pnpm install
cp .env.example .env     # fill in HELIUS_API_KEY and DATABASE_URL
pnpm dev
```

Nothing else exists yet. When the scaffold lands, add the real build, lint, test, and single-test commands here.

## Stack

Next.js 15 App Router, TypeScript, Tailwind, shadcn/ui, `@solana/kit` with wallet-standard (ConnectorKit or `@solana/react-hooks`), Postgres on Neon via Drizzle, Helius enhanced transactions, Jupiter swaps, grammY bot (stretch). Workers deploy on Railway.

## Architecture (PRD section 7)

Two halves that talk only through Postgres:

- **Next.js app.** Pages `/[coin]/[wallet]` (statement), `/wallet/[address]` (portfolio), proof feed per coin, OG share cards via `next/og`. Route handlers under `/api/` for statement, wallet, feed, og, `drip/approve`, `drip/revoke`, and `health`.
- **Workers (Railway).**
  - `indexer`: Helius enhanced tx history -> payout classifier -> `payouts` table.
  - `rate-cacher`: prices every 60 s (stocks via Jupiter Price, coins via StonkFun), hourly reward snapshots.
  - `drip-keeper`: every 10 min, for each eligible delegation: transfer delegated quote tokens -> Jupiter swap into the target xStock -> send stock back to the holder. Logs `transfer_sig`, `swap_sig`, `return_sig` to `drip_runs`.
  - `telegram-bot`: grammY (stretch).

**Payout classifier (PRD 8.2).** An inbound quote-token transfer is a payout when the signer is in the coin's `distributor_signers`, no DEX or aggregator program appears in the outer instructions, and the mint equals the coin's `quote_mint`. Until a distributor is confirmed, fall back to "batch transfer, many destinations, no DEX program" and mark the row `probable`.

**Generic by design (F7).** Every coin is a row in `coins` seeded from the StonkFun API (`GET /tokens?mode=reward&category=...`). Never hardcode a coin in page or worker logic; adding a coin must be config plus distributor identification only.

**Keeper trust model.** The keeper never holds user keys. Delegations are capped per approval (SPL/Token-2022 `approve`). Any balance left on the keeper key is swept back or flagged. The revoke path is one holder-signed transaction. Disclose all of this on the approval screen.

Schema for all tables is in PRD 8.4. Keep it as the source of truth when writing Drizzle models.

## External APIs

- StonkFun public API, no key, 300 req/min: `https://www.stonkfun.xyz/api/public/v1` (OpenAPI at `/openapi.json`).
- Helius: required for RPC and enhanced parsing. Public RPCs rate-limit and will block the Day 1 distributor research.
- Jupiter: confirm current endpoint, field names, and Token-2022 integrator-fee support in the docs before writing any swap code. Do not write Jupiter or Helius calls from memory.

Key mints (from `.superstack/idea-context.md`): KNOTS `8RVBk8vxLiUHueLUW1f4izFVqN3nWippLhkohKg6EGkS`, STONK `6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx`, SPYx `XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W`. xStocks are Token-2022, 8 decimals, no transfer fee.

## Product rules that affect code

- UI wording: "payouts" and "dividends received", never "yield" or "APR". Footer states informational only, not tax or investment advice.
- Numbers: shares to four decimals, USD to two, tabular numerals. Use the `number-formatting` skill.
- Show "Other {quote} received" separately from classified payouts so nothing looks hidden.
- Prices older than the first snapshot use nearest daily close and are labelled "estimated" (`usd_estimated`).
- Non-goals: no compounding back into the meme coin (link to Slawth), no APR leaderboard, no charts or trading, no subscription.
- Cut from the submission: eligibility badge, calculator, Telegram bot. Do not build them before Sep 18. Portfolio view waits until Day 5.
- Brand direction: brokerage statement, not casino. Do not reuse StonkFun green.

## Working rules for this repo

- Commit one working, tested unit at a time. Update `docs/CHECKPOINT.md` at the end of every session.
- Never print secrets. `.env` is gitignored; `.env.example` lists the required keys.
- Distributor research evidence goes in `docs/RESEARCH.md` (PRD 8.1 procedure).
- Submission requires: public MIT repo, README with five-minute setup, seed script, one integration test for the classifier and one for the keeper against a mainnet fixture.
- Skill order the PRD prescribes: `scaffold-project`, `solana-dev`, `brand-design`, `frontend-design-guidelines`, `build-with-claude`, `railway-docs`, `submit-to-hackathon`.
