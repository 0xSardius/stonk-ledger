# Checkpoint — Stonk Ledger

**Last updated:** 2026-09-12
**Phase:** Build, Day 0 scaffold done on Day 1 (Stocklana hackathon, deadline 2026-09-18)
**Spec:** `docs/PRD.md` v0.5 (DRIP-first). Entry decision: `.superstack/entry-scoring.md`. Handoff: `.superstack/idea-context.md`.
**Research repo:** `../stonkfun-product-ideas` (private; idea reports, red-team, protocol facts)

## Where things are

- 2026-09-12: decided the entry. Stock DRIP is the headline, the ledger is the proof layer. F4, F5, F6 cut. DRIP on Day 2, statement Day 3, portfolio Day 5. PRD bumped to v0.5. `CLAUDE.md` added.
- Git initialized, remote `origin` set (github.com/0xSardius/stonk-ledger).
- 2026-09-12 scaffold: `create-solana-dapp` kit/nextjs template (Next 16, @solana/kit 7), demo removed, mainnet-only. shadcn, Drizzle schema (PRD 8.4), Neon driver, `pnpm seed` (StonkFun, all categories), `/api/health`, worker stubs, Vitest with a live fixture. `pnpm ci` green. Handoff in `.superstack/build-context.md`.
- Not yet run against a database: `pnpm db:push`, `pnpm seed`, `/api/health`. They need `DATABASE_URL`.
- Keys not yet gathered: Helius, Neon `DATABASE_URL`, Telegram bot token, Jupiter referral account.

## Day 0 checklist (PRD section 12)

1. Register on hackathons.solana.com.
2. ~~`git init`, first commit with `.gitignore` in place~~ done; confirm `.env` stays ignored.
3. Get a Helius API key and a Neon database. Put both in `.env`.
4. ~~`scaffold-project`~~ done 2026-09-12.
5. Run `pnpm db:push`, then `pnpm seed --decimals`.
6. Confirm `/api/health` lists 300+ reward coins with quote categories.

## Day 1 blocker

Identify the on-chain distributor signer for TREE, DIVI, and KNOTS (PRD section 8.1). Public RPCs rate-limit anonymous calls; use Helius. Record evidence in `docs/RESEARCH.md`.

## Sequencing with StonkFlow (decided 2026-09-11)

The owner's other entry, StonkFlow (`../../agents/stonkflow`, AnsemHack Clawrena, token live by Sep 20), gets one day (Sep 13 or 14) for deploy, first live launch, and the ClawPump token. Stonk Ledger gets every other build day through Sep 17. After Sep 18, shift to StonkFlow onboarding. A StonkFlow flagship reward coin should be one of the demo coins here.

## Rules that apply throughout

- Verify Jupiter and Helius parameter names from their docs before writing integration code.
- Never print secrets. `.env` stays gitignored.
- One working, tested unit per commit. Update this file at the end of every session.
