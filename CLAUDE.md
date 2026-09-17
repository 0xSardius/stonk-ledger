# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Stonk Ledger: a Stocklana hackathon entry (Solana Foundation; submissions close 2026-09-25 4 pm ET, extended on 2026-09-16 from Sep 18; target submit 2026-09-23). Paste a wallet, see every tokenized-stock payout it earned from StonkFun reward coins with a proof link per transaction, and turn any payout stream into a stock position with one approval (Stock DRIP).

**Positioning (decided 2026-09-12):** Stock DRIP is the headline feature. The ledger is the plumbing DRIP needs and the proof that each run happened. Lead every pitch, README, and page with DRIP. Scoring is in `.superstack/entry-scoring.md`.

**Current state (2026-09-16):** live at https://stonk-ledger.vercel.app. Statement, share card, proof feed, DRIP (three mainnet runs, the third into a Tessera token), scheduled pull of distributor batches, all jobs on GitHub Actions. Brand applied per `brand.md`. Entered for the main track plus the PreStocks and Tessera bounties. Next: `docs/SUBMISSION.md`, videos, submit by 2026-09-23. Read `docs/CHECKPOINT.md` first in every session; it holds the day-by-day status and blockers. `docs/PRD.md` v0.5 is the spec. `.superstack/idea-context.md` and `.superstack/build-context.md` are the phase handoffs.

## Commands

```bash
pnpm dev                 # Next.js dev server, http://localhost:3000
pnpm build               # production build (must pass before every commit)
pnpm typecheck           # tsc --noEmit
pnpm lint                # eslint
pnpm test                # vitest run, node environment
pnpm test -- tests/stonkfun.test.ts   # single test file
pnpm test:watch
pnpm db:push             # push lib/db/schema.ts to DATABASE_URL (Neon)
pnpm db:generate         # write SQL migrations to ./drizzle
pnpm db:studio
pnpm seed                # upsert coins from StonkFun; --pages=N, --decimals
pnpm index-wallet <addr> [--pages=N]      # index one wallet now
pnpm job snapshot-prices | snapshot-rewards | drip-once   # one-shot jobs
pnpm worker:indexer | worker:rate-cacher | worker:drip-keeper
pnpm job ingest-distributor [maxPages] | rollup-batches [days]   # scheduled pull of distributor batches; fold old batches into payout_daily
pnpm tsx scripts/backfill-batches.ts --pages=400   # deeper pull after an outage
pnpm tsx scripts/research/find-distributor.ts <coinMint>       # PRD 8.1
pnpm tsx scripts/research/holder-distribution.ts <coinMint>    # payout percentiles
pnpm ci                  # build + typecheck + lint + format:check + test
```

`pnpm test` runs in a node environment. A component test must opt into jsdom with a `// @vitest-environment jsdom` comment at the top of the file.

## Stack

Next.js 16 App Router, React 19, TypeScript, Tailwind 4, shadcn/ui (base-nova style, components in `components/ui`), `@solana/kit` 7 with `@solana/react` and the kit wallet plugin (wallet-standard), Postgres on Neon via Drizzle (neon-http driver), Helius for RPC and enhanced transactions, Jupiter for swaps. Scheduled work runs as one-shot jobs (`pnpm job <name>`) from GitHub Actions; the `workers/` loops exist for a long-running host. Node 22+.

## Layout

- `app/` routes, route handlers under `app/api/`, client components under `app/components/`, client-side Solana helpers under `app/lib/`. The app is mainnet-only; there is no cluster switcher.
- `lib/` server-only code: `lib/env.ts` (zod-validated env, import only server-side), `lib/db/` (Drizzle schema and lazy client), `lib/stonkfun/` (API client and pure mappers), `lib/helius/` (paced RPC + enhanced history), `lib/classify.ts` (pure payout classifier), `lib/jobs/` (index-wallet, snapshots), `lib/drip/` (targets, Ultra, keeper signer, sweep arithmetic, verify, run), `lib/prices/`.
- The payout distributor is one platform wallet, `5KXDF6QnqhBj72hDtJNkkpFaQVUfbFXNybMsp3DiK6tD`, stored on every coin row. Evidence in `docs/RESEARCH.md`.
- Helius free tier rate-limits. `HeliusClient` paces at 4 calls/s and retries on 429. Never run two Helius-heavy scripts at once.
- **Ingestion is a scheduled pull, not a webhook (decided 2026-09-17).** `pnpm job ingest-distributor` runs every 10 minutes in `keeper.yml`: it reads the distributor's recent history from Helius and stops two minutes past the newest stored batch. The Helius webhook that preceded it fired once per distributor transaction (about 50k a day) and was on a path past Vercel's free invocation limit; the earlier rule "webhook, not polling" was wrong at this scale. The keeper re-indexes its own wallets before each pass, so DRIP never depends on platform ingestion. Statements read the viewed wallet's own history on first view.
- **Retention.** `payouts` keeps per-recipient rows only for tracked wallets (in `wallets`, or with a delegation), keyed by (sig, wallet) because one batch pays many wallets. `payout_batches` keeps one row per batch for a 14-day window; `daily.yml` folds older rows into `payout_daily` (one row per coin, quote mint, UTC day) so all-time totals survive and storage stays flat. Storing every recipient filled the 0.5 GB Neon tier in three days (908k rows, SQLSTATE 53100 on every insert). Never add an all-wallets write path again.
- A wallet can hold hundreds of mints. Intersect held mints with active coins in memory (`lib/jobs/held-coins.ts`), never with a giant SQL IN list.
- `workers/` long-running loops sharing `workers/_loop.ts`.
- `scripts/` one-shot CLIs run with `tsx`.
- `tests/` Vitest, with mainnet fixtures under `tests/fixtures/`.
- `components/ui/` shadcn components. Add more with `pnpm dlx shadcn@latest add <name>`.

## Architecture (PRD section 7)

Two halves that talk only through Postgres:

- **Next.js app.** Pages `/[coin]/[wallet]` (statement), `/wallet/[address]` (portfolio), proof feed per coin, OG share cards via `next/og`. Route handlers under `/api/` for statement, wallet, feed, og, `drip/approve`, `drip/revoke`, and `health`.
- **Workers (Railway).**
  - `indexer`: Helius enhanced tx history -> payout classifier -> `payouts` table.
  - `rate-cacher`: prices every 60 s (stocks via Jupiter Price, coins via StonkFun), hourly reward snapshots.
  - `drip-keeper`: every 10 min, for each eligible delegation: transfer delegated quote tokens -> Jupiter swap into the target xStock -> send stock back to the holder. Logs `transfer_sig`, `swap_sig`, `return_sig` to `drip_runs`.
  - `telegram-bot`: grammY (stretch).

**Payout classifier (PRD 8.2).** An inbound quote-token transfer is a payout when the tokens leave a wallet in the coin's `distributor_signers` (or that wallet pays the fee), no DEX or aggregator program appears in the outer instructions, and the mint equals the coin's `quote_mint`. Do not key on the fee payer alone: on 2026-09-17 StonkFun moved fee paying to separate wallets and the webhook parsed every real batch as "not a payout" (`docs/RESEARCH.md`, "Fee payer change"). Until a distributor is confirmed, fall back to "batch transfer, many destinations, no DEX program" and mark the row `probable`.

**Generic by design (F7).** Every coin is a row in `coins` seeded from the StonkFun API (`GET /tokens?mode=reward&category=...`). Never hardcode a coin in page or worker logic; adding a coin must be config plus distributor identification only.

**Keeper trust model.** The keeper never holds user keys. Delegations are capped per approval (SPL/Token-2022 `approve`). Any balance left on the keeper key is swept back or flagged. The revoke path is one holder-signed transaction. Disclose all of this on the approval screen.

Schema for all tables is in PRD 8.4. Keep it as the source of truth when writing Drizzle models.

## External APIs

- StonkFun public API, no key, 300 req/min, slow (10 to 20 s per call): `https://www.stonkfun.xyz/api/public/v1`. The OpenAPI spec at `/openapi.json` leaves item shapes undefined; `lib/stonkfun/client.ts` holds the verified shapes. Token list is `data.tokens[]` with nested `quote`, `transferFee.bps`, `market`; pagination in `data.pagination`. Quote decimals come only from `/tokens/{mint}/rewards`.
- Helius: required for RPC and enhanced parsing. Public RPCs rate-limit and will block the Day 1 distributor research.
- Jupiter: confirm current endpoint, field names, and Token-2022 integrator-fee support in the docs before writing any swap code. Do not write Jupiter or Helius calls from memory.

Key mints (from `.superstack/idea-context.md`): KNOTS `8RVBk8vxLiUHueLUW1f4izFVqN3nWippLhkohKg6EGkS`, STONK `6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx`, SPYx `XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W`. xStocks are Token-2022, 8 decimals, no transfer fee.

## Product rules that affect code

- UI wording: "payouts" and "dividends received", never "yield" or "APR". Footer states informational only, not tax or investment advice.
- Numbers: shares to four decimals, USD to two, tabular numerals. Use the `number-formatting` skill.
- Show "Other {quote} received" separately from classified payouts so nothing looks hidden.
- Prices older than the first snapshot use nearest daily close and are labelled "estimated" (`usd_estimated`).
- Non-goals: no compounding back into the meme coin (link to Slawth), no APR leaderboard, no charts or trading, no subscription.
- Cut from the submission: eligibility badge, calculator, Telegram bot. Do not build them before the Sep 23 submission. Portfolio view waits until after it.
- Brand direction: brokerage statement, not casino. Do not reuse StonkFun green.

## Skills to load

- **`solana-dev`** before any wallet, signing, transaction, token-program, or `@solana/kit` work. It carries the current kit patterns, the Token-2022 notes, and the Solana MCP server for live docs. Do not write kit or wallet-standard code from memory.
- **`integrating-jupiter`** before touching the Ultra order or execute calls.
- **`frontend-design-guidelines`** and **`number-formatting`** while building any page. **`brand-design`** once, before the statement page.
- **`railway-docs`** for the worker deploys. **`submit-to-hackathon`** on submission day (target 2026-09-23).

## Working rules for this repo

- Commit one working, tested unit at a time. Update `docs/CHECKPOINT.md` at the end of every session.
- Never print secrets. `.env` is gitignored; `.env.example` lists the required keys.
- Distributor research evidence goes in `docs/RESEARCH.md` (PRD 8.1 procedure).
- Submission requires: public MIT repo, README with five-minute setup, seed script, one integration test for the classifier and one for the keeper against a mainnet fixture.
- Skill order the PRD prescribes: `scaffold-project`, `solana-dev`, `brand-design`, `frontend-design-guidelines`, `build-with-claude`, `railway-docs`, `submit-to-hackathon`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
