# Checkpoint — Stonk Ledger

**Last updated:** 2026-09-14 (evening)
**Phase:** Build. Days 0 to 4 complete, UX pass done. Remaining: owner mobile check, pitch video, technical video, submission (deadline 2026-09-18).
**Spec:** `docs/PRD.md` v0.5 (DRIP-first). Entry decision: `.superstack/entry-scoring.md`. Handoff: `.superstack/idea-context.md`, `.superstack/build-context.md`.
**Research repo:** `../stonkfun-product-ideas` (private; idea reports, red-team, protocol facts)

## Live and verified against production

- **https://stonk-ledger.vercel.app** (Vercel project `0xsardius-projects/stonk-ledger`, GitHub repo connected, pushes to `main` deploy). Production env: `DATABASE_URL`, `HELIUS_API_KEY`, `HELIUS_WEBHOOK_SECRET`, `DRIP_KEEPER_SECRET_KEY`, `NEXT_PUBLIC_APP_URL`.
- Routes verified 2026-09-14 by curl and by Chrome screenshots: `/`, `/wallet/[address]`, `/drip`, `/coins`, `/coin/[mint]` (top ten coins by volume render from config), `/api/og/[address]` (1200x630 PNG), `/api/wallet/[address]`, `/api/feed/[mint]`, `/api/health` (1,200 coins), `/api/rpc` (allow-listed relay), `/api/webhooks/helius` (403 without the secret).
- **Helius webhook** registered on the distributor `5KXDF6QnqhBj72hDtJNkkpFaQVUfbFXNybMsp3DiK6tD`, active. Delivered 7,456 payout rows across 417 batches and 15 coins in its first 30 minutes.
- **Workers on GitHub Actions**, one cron per workflow (`.github/workflows/prices.yml` every 5 min, `keeper.yml` every 10 min, `rewards.yml` hourly), repo secrets set. **Verified:** scheduled runs fire on their own (prices and keeper 21:54 UTC, rewards 22:30 UTC on 2026-09-14, all success). The earlier combined multi-cron workflow never fired; one cron per file is the shape that works.
- **Journey fixes (Sep 14, evening), verified on production:** home says no connection is needed for a statement and links to Coins; the statement's DRIP link says it needs the wallet connected; `/drip` shows "pending since approval" with the USD value and whether the next keeper pass will sweep, plus a "Your statement" link. Test wallet shows 0.153 STONK ($0.03) pending against the $0.05 test threshold.
- **First mainnet Stock DRIP run** on the owner's test wallet `88tvtBFWdb814MGm2PoGXXDqpEvntpxEwC8ayhbbJoN`: 0.121940 STONK in, 0.00003401 SPYx returned, 0.00000034 SPYx fee. Signatures: transfer `63pXozKtz2PMRjt3wPNFeK6pZ9pxSydpiamyxh6zi3qT1paKCnkX4yXXNneoaWs2Dp8pD6TY2qvNHN7MR5H13RiF`, swap `4uRAYhtbjE8EiCKZV8b5Zs2qjQdMaKFazHeBeyUVdMtQBirBxvbiEq9YbYP2Ur74chKTXXMSpgUFbckX62pXE3SE`, return `4WLjeFx5BCH3aTfcRHqkTugzhqcbbCm5dKmLcX6ScHe4yV552QQM1bg6SCPH6xAFxTZQKnqjMF3NrZDHxi1FHmpN`. Approval tx `6aHSyKNi8MKtDT1pZyugPG3dprhzoYnKwgrfN2uKdWo8biTYuqPcMm9WX4mwWUoyeMo9KSw9oBQRGTcngnRYN2V`, cap 0.610353 STONK, 0.488 remaining. Test threshold on that row is $0.05; production default is $5.
- Keeper public address `Hsmuc8GQADgdg6FrSUx9dFmR9HBEVRSDd3YNyTjyt5t3`, about 0.045 SOL. Secret in `.env`, Vercel env, and Actions secrets only.

## What exists (by day)

- **Day 0 (Sep 11/12):** scaffold from `create-solana-dapp` kit/nextjs (Next 16, @solana/kit 7), mainnet only, shadcn, Drizzle + Neon, `pnpm seed` (1,200 coins, 136 quote mints with decimals), `/api/health`.
- **Day 1 (Sep 13):** distributor identified, one platform wallet for all coins (`docs/RESEARCH.md`). Rate-cacher (Jupiter Price v3), Helius client, payout classifier with mainnet fixtures, indexer with value-weighted coin attribution. Holder distribution: TREE median $4.67/week, KNOTS median $0 (below its $20 minimum), top 10% earn 75 to 78%. Jupiter Ultra verified live; keeper takes the 1% fee from the output, no referral account.
- **Day 2 (Sep 13/14):** DRIP schema per (wallet, quote mint), targets, Ultra client, keeper signer, sweep arithmetic, on-chain verify, `runDelegation` with refund path, API (`status`, `quote`, `approve`, `revoke`), `/drip` page, keeper worker, `pnpm job drip-once`. Distributor webhook with `payouts` re-keyed to (sig, wallet) and nullable `coin_id` plus `quote_mint`. First live run (above). Fixes from the live test: browser RPC relay `/api/rpc` (public RPC 403s on send), wallet signs and relay submits with polling (no websocket), next-themes removed.
- **Day 3 (Sep 14):** brand pass (design-taste + brand-design): Ledger Ink, Instrument Serif + Inter + JetBrains Mono, `brand.md`. Statement page with the number-formatting spec (`lib/format.ts`), share card, first Vercel deploy, webhook registered, workers on Actions.
- **Day 4 (Sep 14):** proof feed `/coin/[mint]`, `/coins` (stock-paid first), `/api/feed/[mint]`; DRIP cap top-up (remaining cap from chain, Raise cap keeps the sweep window); `tests/drip-run.test.ts` on mainnet fixtures; `docs/SECURITY.md`; README for a stranger. 36 tests pass.
- **UX pass (Sep 14):** live-page review in Chrome against the design-taste checklist. Fixed: body font falling back to Times (font variables moved to `html`), stat row collision, estimated USD at receipt in lighter type where no price snapshot exists, headline scale on small screens, serif and explanatory `/drip`, bordered approval panel and approve button (`lib/ui.ts`), outline Connect Wallet. No strong anti-slop signals on any page. **Not verified at 375px** (Chrome resize did not take); CSS stacks to two columns and tables scroll.

## Remaining

1. Owner: open the statement and `/drip` on a phone and report anything wrong.
2. Confirm a scheduled Actions run fired (`gh run list --workflow=keeper.yml`).
3. Second DRIP run happens on its own once pending payouts on the test wallet pass $0.05.
4. Day 6: pitch video (3 min, product only, PRD 13), technical video (5 min: classifier evidence, keeper design, `docs/SECURITY.md`, webhook, schema), submission text, submit 24 hours early.
5. After the hackathon: merge candidates by quote mint on `/drip`, daily-close backfill for USD at receipt, portfolio totals across coins on the statement header (partially there).

## Decisions and rules that apply throughout

- No StonkFlow day; the owner also has Turbin3 coursework, so owner-side asks are batched and short.
- DRIP is the headline; the ledger is the proof layer. Never use "yield" or "APR" in the UI.
- Verify Jupiter and Helius parameter names from docs or live calls before writing integration code.
- Never print secrets. `.env` stays gitignored and was never committed.
- One working, tested unit per commit. Write files with the Write and Edit tools only; shell patches silently corrupted this file and one route during this build.
- Helius free tier: pace at 4 calls/s, never run two Helius-heavy scripts at once. Local background loops get killed for memory; use one-shot jobs.
- Update this file at the end of every session.
