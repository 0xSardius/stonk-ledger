# Checkpoint — Stonk Ledger

**Last updated:** 2026-09-14
**Phase:** Build, Day 3 complete, Day 4 starting with the proof feed (Stocklana hackathon, deadline 2026-09-18)
**Spec:** `docs/PRD.md` v0.5 (DRIP-first). Entry decision: `.superstack/entry-scoring.md`. Handoff: `.superstack/idea-context.md`.
**Research repo:** `../stonkfun-product-ideas` (private; idea reports, red-team, protocol facts)

## Where things are

- 2026-09-12: decided the entry. Stock DRIP is the headline, the ledger is the proof layer. F4, F5, F6 cut. DRIP on Day 2, statement Day 3, portfolio Day 5. PRD bumped to v0.5. `CLAUDE.md` added.
- Git initialized, remote `origin` set (github.com/0xSardius/stonk-ledger).
- 2026-09-12 scaffold: `create-solana-dapp` kit/nextjs template (Next 16, @solana/kit 7), demo removed, mainnet-only. shadcn, Drizzle schema (PRD 8.4), Neon driver, `pnpm seed` (StonkFun, all categories), `/api/health`, worker stubs, Vitest with a live fixture. `pnpm ci` green. Handoff in `.superstack/build-context.md`.
- 2026-09-13: Neon and Helius keys in `.env` (verified ignored, never committed). `pnpm db:push` applied. `pnpm seed --decimals` upserted 1,200 coins (300 per category) and filled decimals for 136 quote mints. `/api/health` returns ok with 1,200 coins. Day 0 done-when met.
- Keys not yet gathered: Helius, Neon `DATABASE_URL`, Telegram bot token, Jupiter referral account.

## Day 0 checklist (PRD section 12)

1. Register on hackathons.solana.com.
2. ~~`git init`, first commit with `.gitignore` in place~~ done; confirm `.env` stays ignored.
3. ~~Get a Helius API key and a Neon database~~ done 2026-09-13.
4. ~~`scaffold-project`~~ done 2026-09-12.
5. ~~`pnpm db:push`, `pnpm seed --decimals`~~ done 2026-09-13.
6. ~~`/api/health` lists 300+ reward coins~~ 1,200 coins, done 2026-09-13.

## Day 1 blocker

Identify the on-chain distributor signer for TREE, DIVI, and KNOTS (PRD section 8.1). Public RPCs rate-limit anonymous calls; use Helius. Record evidence in `docs/RESEARCH.md`.

## Sequencing (revised 2026-09-13)

No StonkFlow day. Every build day through Sep 17 goes to Stonk Ledger. The owner also has Turbin3 assignments, so owner-side tasks (fund the keeper, approve DRIP from a holder wallet, record videos) are batched and kept short. Build order: distributor webhook and keeper test (Day 2 tail), statement page and share card (Day 3), proof feed and ten coins (Day 4), portfolio, brand, README, deploy (Day 5), videos and submit (Day 6).

## Rules that apply throughout

- Verify Jupiter and Helius parameter names from their docs before writing integration code.
- Never print secrets. `.env` stays gitignored.
- One working, tested unit per commit. Update this file at the end of every session.
