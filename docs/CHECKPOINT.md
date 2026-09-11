# Checkpoint — Stonk Ledger

**Last updated:** 2026-09-11
**Phase:** Build, Day 0 (Stocklana hackathon, deadline 2026-09-18)
**Spec:** `docs/PRD.md` v0.4. Handoff: `.superstack/idea-context.md`.
**Research repo:** `../stonkfun-product-ideas` (private; idea reports, red-team, protocol facts)

## Where things are
- Folder created 2026-09-11. Docs copied from the research repo. No code yet.
- Git not initialized yet (owner is setting up the remote first).
- Keys not yet gathered: Helius, Neon `DATABASE_URL`, Telegram bot token, Jupiter referral account.

## Day 0 checklist (PRD section 12)
1. Register on hackathons.solana.com.
2. `git init`, first commit with `.gitignore` in place, confirm `.env` is ignored.
3. Get a Helius API key and a Neon database.
4. `/session-start`, then `scaffold-project` (reads `.superstack/idea-context.md`).
5. Seed the `coins` table from `GET /tokens?mode=reward` across all categories.
6. `/api/health` lists 300+ reward coins with quote categories.

## Day 1 blocker
Identify the on-chain distributor signer for TREE, DIVI, and KNOTS (PRD section 8.1). Public RPCs rate-limit anonymous calls; use Helius. Record evidence in `docs/RESEARCH.md`.

## Rules that apply throughout
- Verify Jupiter and Helius parameter names from their docs before writing integration code.
- Never print secrets. `.env` stays gitignored.
- One working, tested unit per commit. Update this file at the end of every session.
