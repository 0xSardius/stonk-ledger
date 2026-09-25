# Checkpoint — Stonk Ledger

**Last updated:** 2026-09-23
**Phase:** Review and hardening after a full product review (2026-09-22/23). Entry is now **main track + PreStocks bounty only**. Tessera was dropped: the PreStocks bounty page, updated Sep 19, makes projects that integrate any non-PreStocks pre-IPO token ineligible. Submissions close 2026-09-25 4 pm ET. **New target: submit the morning of Sep 25.**

## Resume here (2026-09-23 session)

### Review verdict (2026-09-22)

Worth submitting, but only after fixes. Three reviews ran: DRIP money path, ledger data, and a hackathon/market check. Likely bands (estimates): main track top 25% of 176+ entries; PreStocks bounty a top-3 contender now that Tessera is out. Weaknesses a judge will see: zero outside DRIP users, tiny demo amounts, Slawth uses the same delegation mechanism (it compounds into the meme coin; DRIP turns payouts into a chosen stock). Most top StonkFun coins now pay crypto (ZEC, HYPE, PEPE), so the pitch moves to "any payout into any stock". Honest answer to "does it help a user": the statement helps now (payout trend, payouts against position, a receipt per payout); DRIP is a convenience that has not yet earned outside trust.

### Fixed and pushed on 2026-09-23 (all on `main`, deployed by Vercel)

1. `be3db7a` **Second distributor.** Since about 2026-09-20 06:30 UTC StonkFun pays most batches from `HuBMeYW3aDn8BH65fo8xxbP4oiexyup8udzKyccgi8Ga`, funded by `5KXDF…`. Ingestion read only `5KXDF…`, so feeds were near-frozen, statements showed new payouts as `probable`, and funding transfers were stored as fake one-recipient batches. `lib/distributors.ts` now holds both; regression test on mainnet fixtures. **Verified on Actions** (run 35805894171): HuBMe pages yield about 90 batches each, 926 batches in one pass.
2. `30348a4` **DRIP hardening.** Run state machine on `drip_runs` (`status`, `status_at`; `lib/drip/settle.ts`): signatures recorded before sending, refund only when no swap landed, landed swaps always returned with output read from chain, interrupted runs finished next pass. Ultra order guard (mints, amount, at most 2% loss). 15-minute lease per delegation (`locked_until`). Per-delegation try/catch in `drip-once`. `/api/drip/approve` requires a recent approval tx signed by the wallet; $1 minimum threshold; re-approval after revoke starts fresh. `/api/rpc`: own origin only, 5 calls per batch, 10 accounts. Columns added in production with `scripts/maintenance/add-run-status.ts` (additive). **Verified live:** relay returns 403 without origin and 200 from the app origin.
3. `692fb08` Tessera targets removed; a test pins PreStocks as the only pre-IPO issuer.
4. `f37d69e`, `7e8ee1b` Honest cadence and labels. GitHub runs the 10-minute cron every 1.5 to 7 hours; the UI and README now say "several times a day". Enhanced history costs 100 Helius credits per page (1M free a month), so ingestion is capped at 10 pages, split HuBMe 10 / 5KXDF 2, about 250k credits a month. Coin pages lead with StonkFun's lifetime total and label the ledger's count as a sample; 24-hour stats removed.
5. `f99ffb4` `/drip` public view: run counts, recent runs with proof links, targets, for visitors without a wallet.
6. `4cdbc43` Statement shows the week-on-week payout change per coin when history covers two weeks.
7. `3268d95` `scripts/maintenance/fix-distributor-rows.ts` (dry run by default). Dry run result: 5,443 of 5,485 one-recipient batches since Sep 20 are funding transfers; 89 of 89 probable payouts came from a distributor. **Not applied: needs owner approval (deletes production rows).**

76 tests pass. `pnpm build`, typecheck, and lint are clean.

### 2026-09-24: submitting without videos

The owner is short on time (Turbin3 capstone, SolEnrich traction) and chose to submit without videos; the form requires only one link.

- Repair applied with owner approval: deleted 5,443 funding-transfer batch rows, kept 846 real one-recipient batches, confirmed 188 probable payouts (test wallet now 0 probable).
- `docs/SUBMISSION.md` (`77b3b21`) holds the short and full descriptions, figures checked against production on 2026-09-24, and the form checklist.
- **Final live check 2026-09-24 23:49 UTC:** health ok (6,582 coins, 1,513 PreStocks-paid); `/`, `/drip`, `/coins`, both demo statements, the AGI coin page, `/api/drip/public`, and the OG card all 200; latest keeper, prices, and rewards runs green; no "ten minutes" or Tessera on the served pages.

- **DRIP approval smoke test passed on production (2026-09-25 00:56 UTC),** the first live test of the Sep 23 signed-approval check. The owner approved from the test wallet `88tv…` into ANTHROPIC (PreStocks), and all steps in the UI succeeded. Verified server-side:
  - The delegation row is active: coin 902 (KNOTS), target ANTHROPIC, cap 5.103141 STONK, threshold $5.
  - The approval tx `27ahtVAy…` is a successful `approveChecked`, owner `88tv…`, delegate keeper `Hsmuc8GQ…`.
  - `/api/drip/public` shows 1 active delegation.
  - Not tested live: a keeper run with the new state machine. The wallet earns about $0.06 a day, so the $5 threshold will not be reached before the deadline.

### Remaining

1. Owner: submit at https://hackathons.solana.com/hackathons/stocklana before 2026-09-25 4 pm ET. Main track + Best Use of PreStocks only. Paste both descriptions from `docs/SUBMISSION.md`.
2. Not planned: videos, a new DRIP run (the test wallet earns about $0.06 a day, so a $5 run is not reachable), phone check (375px still unverified), outreach to holders.
3. If the project is shelved after submission: disable the four scheduled workflows to stop Helius credit and Actions use. The site can stay up; no delegation is active.

Post-hackathon from the review: statement stop cursor per token account (`wallets.lastIndexedSig`), keeper address as a public env var (remove the secret from Vercel), per-IP rate limit on `/api/drip/status`, auto-detect new distributor wallets, CSV export of payouts with USD at receipt, historical prices for USD at receipt (89% of recent rows are estimated because prices run only several times a day).

## Earlier: resume notes from 2026-09-19

Product is ready to submit; `docs/SUBMISSION.md` holds the description, both video scripts, and the form checklist. Everything left is owner-side; see "Remaining" below. Claude's job on resume: confirm the four scheduled jobs are still green (`gh run list --limit 8`), confirm `/api/health` responds, and help with anything the phone check or the recording turns up.

Optional if time: post one statement link on X to check the share-card unfurl.

### Hackathon page re-check (2026-09-16, evening)

Verified from the page payload at hackathons.solana.com/hackathons/stocklana:

- **Deadline moved to 2026-09-25T20:00Z (Sep 25, 4 pm ET).** The header, countdown, and the machine-readable field all say Sep 25; only the stale "Rules" paragraph still says Sep 18. Judging runs through Oct 2. Field: 618 registered, 87 submissions, prize pool $121,000.
- **Main track $100k.** Wedges named on the page: "Investing: recurring buys, index baskets, robo portfolios" and "Credit and yield: ... dividends". Judging question: "could this be a real app that people will actually use?" (real user, end-to-end demo, reason it belongs on Solana, execution quality).
- **Five bounties.** Meteora DBC $5k (no fit, we do not touch DBC). Clawpump agent $5k (no fit, requires launching a token). PreStocks $5k (strong fit: 300 seeded coins pay in PreStocks tokens, 5,834 attributed payouts to 2,476 wallets already in the ledger, AGI alone 4,281 payouts to 2,053 wallets). Tessera $6k (fit if T-OpenAI, T-Kalshi, T-SpaceX become DRIP targets; no StonkFun coin pays in them). Pyth market data (prize is 3 months of Pyth Pro, judged on how central Pyth is; we price with Jupiter today).
- **Sponsor tokens are DRIP-ready with config only:** all Tessera and PreStocks mints are Token-2022, 9 decimals, priced on Jupiter Price v3 with $85k to $575k liquidity, and Ultra dry-runs route STONK into T-OpenAI and into ANTHROPIC (PreStocks). `lib/drip/run.ts` already assumes Token-2022 targets. Coverage query: `pnpm tsx scripts/research/sponsor-coverage.ts`.

**Locked in (2026-09-16, late):** main track + PreStocks bounty + Tessera bounty. Commit `8da22be` adds eleven targets (8 PreStocks, 3 Tessera) grouped by issuer on `/drip`, with `tests/drip-targets.test.ts` checking mints and decimals against captured issuer API fixtures. **Third mainnet DRIP run, first into a Tessera token, verified on production:** 0.190898 STONK → 0.000040159 T-OpenAI. Signatures (all finalized, no error): transfer `2LCk6GmQsRgrzgm23e5BVk3G1mjEoTix53Ks9DNcQBMtBFLM8b1d1Xr4kFFsH3TgDWgb8NZY9EpeE7HZSbpmetqL`, swap `5oVGhEkAsdYQ8zKuQ1TibZuREMMSE5N9WRzirLfLgEh428DQvVUXufFRkAYxk6fBGmaS4Z3m84XYtZAtGq55aVCx`, return `2n9CJzL8N3QKB55YsfWo5Wxf6tWMXXpge6quGB3ANEKvDBc7ucyCLHRDEtiNG4Y5HmoX5HjRqFuDaH9WVQaZmpmu`. The second run (Sep 15, 0.297514 STONK → 0.00008045 SPYx, swap `5LMuaRP8ErWXqAW2VFsnNz2T8WHm8yFJvgxyhKtFGGpUtv4d8y4v45CazDtYZFWVDpzyGgRYvcad7x39dnjX9jBy`) was made unattended by the GitHub Actions keeper. The test row was retargeted with `scripts/set-delegation-target.ts` (threshold now $0.02); its cap is fully used, so the owner must Raise cap on `/drip` before another run. Not done: Pyth (see the re-check note above; Hermes price endpoint now returns 401 without a key). Deadline references updated to Sep 25 with a Sep 23 target across README, PRD, CLAUDE.md, and `.superstack/idea-context.md`.

### Production incident and two fixes (2026-09-17)

1. **Database full.** Neon free tier is 0.5 GB; the database hit 489 MB and every insert failed with SQLSTATE 53100 from 2026-09-16 02:39 UTC. Cause: the webhook stored one `payouts` row per recipient for every distributor batch on the platform (908,870 rows, 78,570 wallets, 600k rows/day), while only 20,450 rows belonged to the 124 wallets anyone had viewed. Fix (commit `0dcbee5`): `payout_batches` holds one row per batch for the feed and coin totals; `payouts` keeps per-recipient rows only for tracked wallets (viewed, or with a delegation; approve now tracks the wallet). Migration `scripts/maintenance/retention-migrate.ts` ran (owner-approved): 489 MB → 49 MB, 69,282 batch rows kept, 888,420 untracked rows deleted, `vacuum full` succeeded. Coin pages verified after deploy (AGI: 477 batches, 4,281 payouts preserved).
2. **Fee payer change.** After the deploy, 196 consecutive real webhook deliveries parsed as "not a payout". Replaying the distributor's history (`scripts/research/parse-recent-distributor.ts`) showed StonkFun now pays batch fees from `nPbqzU7rkGzpP9LaxwrtPiCjuQawEqg7oxqJJ4u1SL6` and `7P7Xg2fAhzFc1auiv9hsb6nQiEg8CzrCEeGzgsgbovyi` while all 788 sampled transfers still leave `5KXDF…`. Fix (commit `b571c64`): both the webhook parser and the history classifier key on tokens leaving a distributor wallet, not on the fee payer. Regression test on a captured mainnet batch (`tests/new-feepayer.test.ts`). `docs/RESEARCH.md` has the evidence. 48 tests pass.
3. `scripts/backfill-batches.ts` walks the distributor's history to refill `payout_batches` for the gap (Sep 16 02:39 UTC onward). Started 2026-09-17 ~19:30 UTC with `--pages=400`.
4. The statement rows that landed for the TREE holder on Sep 17 via the history walk before fix 2 are flagged `probable`; harmless, labelled on the page.
5. **Verified on production:** after the classifier deploy, a live webhook delivery stored a real batch with block time 2026-09-17 19:30:20 UTC (later than the backfill's starting point, so it came from the webhook, not the backfill). Ingestion is healthy again.

### Architecture change: webhook removed, scheduled pull (2026-09-17, evening)

Owner asked for the lowest-cost solid design. Numbers: the webhook fired once per distributor transaction, about 50k a day (bursts of 60/s), roughly 1.5M Vercel invocations a month against a 1M free allowance, with Neon never idle. Commit `0355e0b`:

- `pnpm job ingest-distributor` (`lib/jobs/ingest-distributor.ts`) runs first in `keeper.yml` every 10 minutes: reads the distributor's history newest-first, 100 per Helius call, stops two minutes past the newest stored batch, 30-page cap. First local pass: 4 pages, 331 batches, stopped at the floor. `scripts/backfill-batches.ts` is the same code with a deeper cap.
- The keeper re-indexes each delegating wallet (2 pages) before deciding what is pending, so DRIP never depends on platform ingestion. This closes a latent bug: with the webhook down, pending went stale and nothing swept.
- `daily.yml` (03:23 UTC): `pnpm seed --pages=10` (top 1,000 coins per quote category; StonkFun has ~45,800 reward coins, most dead) and `pnpm job rollup-batches 14`, which folds batches older than 14 days into `payout_daily` (coin, quote mint, UTC day) in one atomic statement. Feed totals read raw plus rolled. Storage now scales with our users plus a two-week window of batches.
- Removed: Helius webhook registration (deleted via API, none remain), `app/api/webhooks/helius/route.ts`, `scripts/register-webhook.ts`, `HELIUS_WEBHOOK_SECRET` from env schema and `.env.example`. The Vercel env var of that name can be deleted by the owner; it is unused.
- Known limit: a single burst above 3,000 distributor transactions inside one 10-minute window would leave a gap the next pass does not revisit; observed peaks are well under that. Rerun `backfill-batches` if it ever happens.
- Not done: option C (on-demand feed with no platform ingestion at all) is documented in this session's discussion as the post-hackathon step if cost still matters.
- **Verified on GitHub Actions (dispatched 22:55 UTC, both success):** keeper run pulled 2 pages, 129 batches, then ran the keeper; daily run seeded 4,000 coins (health now reports 4,019) and rolled 219 daily rows for batches older than Sep 3. Production feed after rollup: AGI 479 batches, 4,313 payouts, first seen Aug 11 (from `payout_daily`). Database 69 MB, 97,407 batch rows, 21,491 tracked payout rows.
- **Owner action before recording:** the test wallet's delegation row is closed. Its cap was fully consumed by the T-OpenAI sweep, the token program clears the delegate at zero, and the keeper closed the row on its next check, as designed. Open `/drip`, connect `88tvtBFW…`, and approve again (any cap, threshold $5 default or lower for a demo).

Submission checklist status: public MIT repo ✓, README five-minute setup ✓, `.env.example` ✓, seed script ✓, classifier fixture test ✓, keeper fixture test ✓, live mainnet demo ✓, registration ?, pitch video ✗, technical video ✗, description ✗.
**Spec:** `docs/PRD.md` v0.5 (DRIP-first). Entry decision: `.superstack/entry-scoring.md`. Handoff: `.superstack/idea-context.md`, `.superstack/build-context.md`.
**Research repo:** `../stonkfun-product-ideas` (private; idea reports, red-team, protocol facts)

## Live and verified against production

- **https://stonk-ledger.vercel.app** (Vercel project `0xsardius-projects/stonk-ledger`, GitHub repo connected, pushes to `main` deploy). Production env: `DATABASE_URL`, `HELIUS_API_KEY`, `DRIP_KEEPER_SECRET_KEY`, `NEXT_PUBLIC_APP_URL` (`HELIUS_WEBHOOK_SECRET` still set on Vercel but unused since 2026-09-17; owner may delete).
- Routes verified 2026-09-14 by curl and by Chrome screenshots: `/`, `/wallet/[address]`, `/drip`, `/coins`, `/coin/[mint]` (top ten coins by volume render from config), `/api/og/[address]` (1200x630 PNG), `/api/wallet/[address]`, `/api/feed/[mint]`, `/api/health` (1,200 coins then; 4,961 on 2026-09-19), `/api/rpc` (allow-listed relay). The webhook route was removed on 2026-09-17.
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

1. Owner: re-approve DRIP on `/drip` with the test wallet `88tvtBFW…` (the old delegation closed when its cap was consumed).
2. Owner: register on hackathons.solana.com.
3. Owner: open the statement and `/drip` on a phone and report anything wrong (375px never verified).
4. By 2026-09-23: pitch video (3 min) and technical video (5 min) from `docs/SUBMISSION.md`, submit with repo, live URL, videos, three tracks.
5. Scheduled jobs verified on 2026-09-19: keeper, prices, rewards, daily all green; health 4,961 coins.

## Post-hackathon candidates (decided 2026-09-19, none before submission)

Carried over from earlier sessions:

- Merge candidates by quote mint on `/drip`; daily-close backfill for USD at receipt; portfolio totals across coins on the statement header (partially there).
- Option C ingestion (on-demand feed, no platform ingestion) if cost ever matters.
- Pyth price feeds (Hermes needs a key now); fallback lookup for held coins that are not seeded.

TypeSafe (Jev) judgments, in value order. The `typesafe@typesafe-ai` plugin is installed (skill `/typesafe:typesafe-ai`). Each needs a paid TypeSafe key held server-side and a cached result per coin so cost stays flat. Code keeps every rule, calculation, and money flow; the model only supplies understanding where the app now shows raw facts.

1. **Coin trust signals.** Input: coin name, ticker, description plus observed state (payout regularity, holder count, days since last batch, ticker collision with an established coin). Three judgments: impersonating another coin, description matches chain behavior, likely abandoned. Output: one badge with reasons on `/coins` and the statement. Never ranks by return, so it stays inside the "no yield" rule. Highest value; no change to classifier, keeper, or trust model.
2. **Plain-English DRIP policies.** Holder types a policy ("everything into SPYx, keep anything paid in Apple, skip payouts under $5"); Jev maps it to the typed fields the keeper already has (target per quote mint, threshold, exceptions); user reads the parsed policy back before signing. Keeper stays deterministic. Pays off once there are more than a handful of delegations.
3. **Complete statement.** Sort the "Other received" bucket using the Helius description and source label into swap, wallet transfer, airdrop, or payout from an unindexed platform, with a probability; flag uncertain rows instead of guessing. Also reveals which other platforms pay dividends.
4. **Ask the statement.** Text box that maps "how much did TREE pay me in August" to a typed query over existing tables. Cheapest; demo value mostly.

## Decisions and rules that apply throughout

- No StonkFlow day; the owner also has Turbin3 coursework, so owner-side asks are batched and short.
- DRIP is the headline; the ledger is the proof layer. Never use "yield" or "APR" in the UI.
- Verify Jupiter and Helius parameter names from docs or live calls before writing integration code.
- Never print secrets. `.env` stays gitignored and was never committed.
- One working, tested unit per commit. Write files with the Write and Edit tools only; shell patches silently corrupted this file and one route during this build.
- Helius free tier: pace at 4 calls/s, never run two Helius-heavy scripts at once. Local background loops get killed for memory; use one-shot jobs.
- Update this file at the end of every session.
