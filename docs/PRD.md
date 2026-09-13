# Stonk Ledger — Product Requirements Document

**Version:** 0.5 (Stocklana hackathon edition, DRIP-first)
**Date:** 2026-09-12
**Deadline:** Stocklana submissions close 2026-09-18
**Status:** Build now. Seven days.
**Owner:** 0xsardius
**Name:** Stonk Ledger (formerly Knot Ledger, then Dividend Ledger)
**One-liner:** The receipt and the reinvestment for meme coins that pay dividends in tokenized stocks. Paste a wallet, see every APPLx, STRCx, or SPYx payout it earned with a proof link per transaction, and turn any payout stream into a stock position with one approval.
**Tagline:** Your memecoin pays you in Apple. We keep the receipts and buy you more.

**What changed from v0.4 (2026-09-12):** Stock DRIP is the headline feature and the ledger is the proof layer. Decision after scoring both as hackathon entries: DRIP-led scores 15/18, ledger-led 11/18, combined 16/18 (see `.superstack/entry-scoring.md`). DRIP moves to Day 2, the statement page to Day 3. Eligibility (F4), calculator (F5), and Telegram (F6) are cut from the submission. Portfolio view is deferred to Day 5. Name unchanged.

**What changed from v0.3:** the product is re-centered on the hackathon theme. KNOTS (pays STONK) becomes one coin among many; the lead coins pay holders in tokenized stocks. Stock DRIP, a non-custodial reinvestment of payouts into a chosen stock, moves from "later" to core because it is the novel primitive judges reward. Build plan is seven days to the deadline. Sections 2, 6, 12, and 13 are new.

---

## 1. Why this exists

StonkFun reward coins pay holders pro rata from a 3% Token-2022 transfer tax, in whatever the coin is paired against. Thousands of them are paired against tokenized stocks and pre-IPO tokens. As of 2026-09-11:

| Metric                                                                | Value                                                                                          | Source                                 |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------- |
| Reward coins paying in stocks or pre-IPO tokens                       | 3,520                                                                                          | `GET /rewards`, quote symbol filter    |
| Payouts made by those coins                                           | 1,936,561                                                                                      | same                                   |
| Holder positions receiving stock payouts                              | 237,865                                                                                        | same                                   |
| Top pages of stock-quoted reward coins (xStocks, Backpack, PreStocks) | 300 coins, 250 graduated, $18.9M 24h volume, $44.9M market cap                                 | `GET /tokens?category=...&mode=reward` |
| Largest single case                                                   | TREE / APPLx: 230,241 payouts to 5,994 holders, 1,253 APPLx distributed                        | `GET /rewards`                         |
| Others                                                                | DIVI / STRCx $4.1M cap; AGI / ANTHROPIC $3.6M; AMBA / SNDK $2.6M; GP / GLDx $870k daily volume | `GET /tokens`                          |
| Reference case (not stock-paid)                                       | KNOTS / STONK: 155,823 payouts, 7,553 holders, about $161k a day                               | `GET /tokens/{mint}/rewards`           |

Hundreds of thousands of wallets are accumulating tokenized stock through meme coin payouts and nobody shows them. Two tools show what a coin pays in general (The Stonk Board) or compound payouts back into the meme (Slawth). Nothing shows a wallet's actual stock dividends with proof, and nothing turns a payout stream into a stock position.

## 2. Hackathon fit

| Fact                | Value                                                                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Event               | Stocklana, hackathons.solana.com/hackathons/stocklana                                                                                                   |
| Organizer           | Solana Foundation                                                                                                                                       |
| Prize               | $100,000, single main track, no sponsor bounties listed yet                                                                                             |
| Brief               | "One week to build something innovative with stocks on Solana"                                                                                          |
| Deadline            | 2026-09-18                                                                                                                                              |
| Field on 2026-09-11 | 35 registered, 4 submissions                                                                                                                            |
| Judging             | Solana Foundation judges see all submissions and score 1 to 10. No published criteria.                                                                  |
| Submission          | Optional GitHub repo, live demo (devnet or mainnet), pitch video (3 min max), technical video (5 min), team invites by username; up to 3 sponsor tracks |

**Positioning against known judge patterns.** Grand-prize winners in Solana hackathons are infrastructure or novel primitives, not dashboards. The statement alone is a dashboard. Stock DRIP is a primitive nobody has shipped: meme coin payouts dollar-cost-averaged into tokenized equities, non-custodially, on a schedule. Lead with the primitive, prove it with the ledger.

**Theme check.** The product is about stocks on Solana in three ways: the payouts are tokenized stocks, the reinvestment target is tokenized stocks, and the statement values everything in the underlying equity. KNOTS is demoted to a supporting example.

## 3. Goals and non-goals

### Goals by 2026-09-18

1. Stock DRIP working end to end for at least one coin on mainnet, with a revoke button and a run log with three signatures. This is the headline.
2. Live mainnet demo: paste any wallet, see stock dividends with proof links, including every DRIP run.
3. Public proof feed per coin and share cards.
4. Generic across every reward coin from the first commit.
5. Repo, README with setup, 3-minute pitch video, 5-minute technical video, submitted 24 hours before the deadline.

### Non-goals

- No compounding back into the meme coin. Slawth does it. Link out.
- No per-coin APR leaderboard. The Stonk Board does it.
- No charts, limit orders, or trading.
- No subscription. Owner rule.
- No tax or investment advice. "Payouts" and "dividends received", never "yield" or "APR" in the UI.
- Cut for the submission (2026-09-12): eligibility badge (F4), calculator (F5), Telegram digest (F6). Revisit after Sep 18.

## 4. Users and jobs

| User                                              | Job                                                                            |
| ------------------------------------------------- | ------------------------------------------------------------------------------ |
| Holder of a stock-paid meme coin (238k positions) | "How much Apple has TREE actually paid me, and can I prove it?"                |
| Holder of a non-stock reward coin (KNOTS, ZCAT)   | "Turn my STONK or ZEC payouts into S&P 500 exposure without thinking about it" |
| Small holder                                      | "Am I above the payout minimum? When is the next drop?"                        |
| Coin community                                    | "Post proof that holders are being paid in real stock"                         |
| Judge                                             | "Show me something that did not exist last week and works on mainnet"          |

## 5. Verified protocol facts

| Fact                                     | Value                                                                                                                                                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| StonkFun public API, no key, 300 req/min | `https://www.stonkfun.xyz/api/public/v1`, OpenAPI at `/openapi.json`                                                                                                                                   |
| Reward coin list                         | `GET /tokens?mode=reward&category={xstock                                                                                                                                                              | backpack | prestock | custom}&sort=volume24h&pageSize=100` |
| Per-coin rewards                         | `GET /tokens/{mint}/rewards`: `distributedTokens`, `payoutCount`, `holderCount`, `lastPayoutAt`                                                                                                        |
| All reward launches                      | `GET /rewards` returns 10,840 launches with quote mint and totals                                                                                                                                      |
| Reward mechanics                         | Token-2022 transfer fee 100 or 300 bps; payouts pushed to holders in the quote token; no creator fee                                                                                                   |
| Example mints                            | TREE/APPLx (find via `/tokens?q=TREE`), KNOTS `8RVBk8vxLiUHueLUW1f4izFVqN3nWippLhkohKg6EGkS`, STONK `6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx`, SPYx `XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W` |
| xStocks                                  | Token-2022 mints, 8 decimals, no transfer fee, issued by Backed; trade on Jupiter and Raydium                                                                                                          |
| Eligibility and ops cut                  | Coin sites state minimums (KNOTS: $20) and about 2.5% ops; not verified on chain                                                                                                                       |

**Unresolved, Day 1:** the on-chain distributor signer per coin (procedure in 8.1). Public RPCs rate-limit anonymous calls; Helius is required.

## 6. Feature specification

### F1. Dividend statement (core, proof layer for F2)

Route: `/[coin]/[wallet]`.

- Headline: stock received from this coin, in shares and USD. "TREE has paid you 0.83 APPLx ($196)."
- USD at receipt versus USD today, so the holder sees the stock leg separately from the payout count.
- 7-day and 24-hour totals, payout count, first payout date.
- Every counted transaction with time, amount, USD at receipt, and a Solscan link.
- "Other {quote} received" total shown separately so nothing looks hidden.
- Current coin balance and value. Payouts as a percentage of current position, labelled as such.
- Portfolio view at `/wallet/[address]`: all reward coins this wallet holds, stock received per coin, total stock dividends in USD. Deferred to Day 5.

### F2. Stock DRIP (the primitive, headline feature)

- One approval: the holder approves a delegate on their quote-token account (SPL `approve` with a capped amount, or Token-2022 equivalent). No program deployment required. Same trust model Slawth uses, disclosed plainly.
- Keeper runs every 10 minutes: when a wallet's un-swept payouts exceed a threshold (default $5), it transfers the delegated amount, swaps via Jupiter into the holder's chosen stock (default SPYx), and sends the stock back to the holder's wallet in the same flow.
- Choices: keep the stock you are paid in (default for stock-paid coins), or convert to SPYx, QQQx, NVDAx, or any xStock. For coins paid in STONK or ZEC, the default target is SPYx.
- Revoke button and a plain explanation of what the delegate can and cannot do.
- Fee: 1% of the swept amount, in the output stock, disclosed before approval.
- Every DRIP execution appears on the statement with a proof link.

### F3. Proof feed and share cards

- Public feed per coin: latest distributions with verification links (the StonkBot pattern).
- OG share card per wallet: headline stock amount, coin logo, truncated address, link to the latest proof.

### F4. Eligibility and next payout (cut 2026-09-12)

- Balance versus the coin's stated minimum, with the source cited. Next payout estimate from the median interval over the last 24 hours.

### F5. Honest calculator (cut 2026-09-12)

- Payouts per day at trailing volume, net of the 3% entry, 3% exit, and any compounding tax. Volume slider always on screen.

### F6. Telegram digest (cut 2026-09-12)

- `/watch <wallet>`: daily digest of stock dividends received. Weekly card.

### F7. Generic coins (core)

- `coins` table seeded from `GET /tokens?mode=reward` across all categories. Adding a coin is a config row plus distributor identification.

## 7. Architecture

```
Browser: Next.js 15 App Router, TypeScript, Tailwind + shadcn, wallet-standard via ConnectorKit or @solana/react-hooks, @solana/kit, next/og
Route handlers: /api/statement/[coin]/[wallet]  /api/wallet/[address]  /api/feed/[coin]  /api/og/...  /api/drip/approve  /api/drip/revoke
Workers (Railway):
  indexer        Helius enhanced tx history -> classify payouts -> Postgres
  rate-cacher    60 s prices (stocks via Jupiter Price, coins via StonkFun), hourly reward snapshots
  drip-keeper    every 10 min: find eligible delegations, transfer -> Jupiter swap -> send stock back; log with signatures
  telegram-bot   grammY (stretch)
Storage: Postgres on Neon via Drizzle
External: Helius (key required), Jupiter Swap or Ultra (confirm field names in docs before coding), StonkFun API, Telegram (stretch)
```

**Keeper security design.** Delegation is capped per approval and re-approved when exhausted. The keeper key holds nothing between runs; any balance on it is swept back to owners or flagged. Every run writes input signature, swap signature, and return signature to `drip_runs`. The revoke path is one transaction from the holder. This is disclosed on the approval screen and in the technical video.

## 8. Data and algorithms

### 8.1 Day 1: identify each coin's distributor

1. `getTokenLargestAccounts` for the coin mint; skip the pool vault.
2. For five holder owners, find their quote-token account.
3. Pull the last 20 transactions per account with Helius enhanced parsing.
4. The signer common to all payout transactions, with many transfers to many destinations, is the distributor. Record address, program ids, instruction count, memo if any, in `docs/RESEARCH.md`.
5. Cross-check the daily transfer count against `payoutCount` growth.
6. Store as a set in `coins.distributor_signers`. If the payer is a program, store the program id and PDA. Check whether one distributor serves all coins; if so, Day 1 is short.

### 8.2 Payout classification

Inbound quote-token transfer counts as a payout when the signer is in the distributor set, no DEX or aggregator program appears in the outer instructions, and the mint equals the coin's quote mint. Fallback while unconfirmed: batch transfers with many destinations and no DEX program, labelled "probable".

### 8.3 Valuation

Store stock and coin prices every 60 s from Day 0. Earlier payouts use the nearest daily close, labelled "estimated". Stock amounts are shown in shares to four decimals and in USD.

### 8.4 Schema

```
coins(id, symbol, mint, quote_mint, quote_symbol, quote_decimals, quote_category, fee_bps, distributor_signers text[], min_rule text, min_source text, active bool)
wallets(address pk, first_seen, last_indexed_sig, last_indexed_at)
payouts(sig pk, coin_id, wallet, amount_raw bigint, amount numeric, block_time, usd_at_receipt numeric, usd_estimated bool, probable bool)
price_snapshots(mint, ts, usd numeric)
reward_snapshots(coin_id, ts, distributed_tokens numeric, payout_count int, holder_count int)
drip_delegations(wallet pk, coin_id, quote_mint, target_mint, cap_raw bigint, approved_sig, revoked_sig, threshold_usd numeric, created_at)
drip_runs(id pk, wallet, coin_id, in_amount, out_mint, out_amount, fee_amount, transfer_sig, swap_sig, return_sig, ts)
watches(chat_id, wallet, coin_id, mode text, created_at, last_ping_at)
```

## 9. UX notes

- Follow the `number-formatting` skill. Shares to four decimals, USD to two, tabular numerals.
- One big number above the fold: stock received. Proof within one click.
- The approval screen for DRIP states exactly what is delegated, the cap, the fee, and how to revoke, before the wallet prompt.
- Footer: informational only, not tax or investment advice, no custody except the momentary keeper hop during a DRIP run, which is disclosed.
- Brand via `/brand-design`. Direction: brokerage statement, not casino. Serif numerals are fine. Do not reuse StonkFun green.

## 10. Monetization (no subscription)

| Stream              | Mechanism                                                                                                |
| ------------------- | -------------------------------------------------------------------------------------------------------- |
| DRIP fee            | 1% of each swept amount, taken in the output stock                                                       |
| Swap integrator fee | 50 to 100 bps on manual de-risk swaps via Jupiter                                                        |
| Terminal referrals  | "Buy more" links carry a referral code                                                                   |
| Paid boosts         | reward-coin teams pay in SOL or USDC to feature in the proof feed                                        |
| x402 feed           | per-call pricing on the statement API and payout webhooks for bots and agents                            |
| Product token       | standard-mode StonkFun launch whose creator fee funds the tool; decide after the hackathon, never before |

## 11. Success metrics

| By 2026-09-18                                                          | Target                                   |
| ---------------------------------------------------------------------- | ---------------------------------------- |
| Coins with verified distributor and live statements                    | 10, including TREE, DIVI, AGI, GP, KNOTS |
| Wallets checked by real users before submission                        | 100                                      |
| DRIP delegations on mainnet                                            | 10, at least 3 not ours                  |
| DRIP runs with all three signatures logged                             | 25                                       |
| Share cards posted publicly                                            | 10                                       |
| Submission complete with repo, live demo, pitch video, technical video | 24 hours early                           |

## 12. Build plan (7 days to 2026-09-18)

| Day | Date   | Deliverable                                                                                                                                 | Done when                                                              |
| --- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 0   | Sep 11 | Register on hackathons.solana.com. Repo, Next.js 15, Drizzle, Neon, Helius key, coins table seeded across all categories, `.env` gitignored | `/api/health` lists 300+ reward coins with quote categories            |
| 1   | Sep 12 | Distributor identified for TREE, DIVI, KNOTS; rate-cacher; indexer and classifier                                                           | `docs/RESEARCH.md` has evidence; 10 wallets indexed                    |
| 2   | Sep 13 | DRIP approval flow, keeper, revoke, run log (F2)                                                                                            | One mainnet DRIP run with three signatures on a test wallet            |
| 3   | Sep 14 | Statement page with DRIP runs inline, share card (F1, F3 cards)                                                                             | Public URL; three cards posted with proof links                        |
| 4   | Sep 15 | Proof feed, second DRIP target, 10 coins live from config (F3 feed, F7)                                                                     | Second and third coins render with no code change; second target swaps |
| 5   | Sep 16 | Portfolio view, polish, README and setup, security notes, classifier and keeper tests                                                       | A stranger can run it from the README; both tests pass                 |
| 6   | Sep 17 | Pitch video (3 min), technical video (5 min), submission text; submit                                                                       | Submitted with all links                                               |
| 7   | Sep 18 | Buffer. Fix what judges would hit first.                                                                                                    | Nothing left on the critical path                                      |

One of Sep 13 or Sep 14 goes to StonkFlow (see `docs/CHECKPOINT.md`). If Sep 13 is taken, Day 2 and Day 3 shift by one day and Day 5 absorbs the loss.

Commit per working unit. Update `docs/CHECKPOINT.md` every session.

## 13. Submission plan

**Pitch video (3 minutes, product only, no slides):**

1. 0:00 Paste a real TREE holder's wallet. "This memecoin has paid this wallet 0.83 Apple." Click a proof link.
2. 0:40 Portfolio view: every coin this wallet holds, total stock dividends.
3. 1:10 Turn on Stock DRIP for a KNOTS wallet: approve once, pick SPYx, show the cap and the fee.
4. 1:50 Show a completed DRIP run: STONK in, SPYx out, three signatures.
5. 2:20 Proof feed and share card. The numbers: 3,520 coins, 1.9M payouts, 238k positions, none of it visible before today.
6. 2:50 What is next: every reward coin on Solana, any stock as the target.

**Technical video (5 minutes):** classifier and distributor evidence, keeper design and security, schema, how a coin is added from config, tests.

**Description opening line:** "Thousands of Solana meme coins now pay dividends in tokenized stocks. Stonk Ledger is the receipt and the reinvestment: proof of every share a wallet was paid, and one approval to turn any payout stream into a stock position."

**Repo requirements:** public, MIT, README with a five-minute setup, `.env.example`, seed script, one integration test for the classifier and one for the keeper against a mainnet fixture.

## 14. Risks

| Risk                                           | Mitigation                                                                                       |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Distributor cannot be identified cleanly       | fallback "probable" classifier; show evidence in the technical video                             |
| Keeper security concerns from judges           | capped delegation, three-signature logging, revoke path, disclosure; say it before they ask      |
| Jupiter fills poorly on thin xStock pools      | route only to SPYx, QQQx, NVDAx, APPLx by default; show impact before approval                   |
| Slawth ships stock targets before the deadline | our wedge remains the statement plus proof; DRIP into stocks is still first if shipped by Sep 18 |
| Seven days is not enough                       | F4, F5, F6 are cut; portfolio view deferred; F1, F2, F3, F7 are the submission                   |
| Helius free tier                               | on-demand indexing, caching, upgrade if needed for the demo week                                 |
| Users read payouts as guaranteed               | volume assumption on screen, no yield or APR wording                                             |

## 15. Open questions

1. ~~Distributor: one platform wallet for all coins, or per coin?~~ Resolved 2026-09-13: one platform wallet, `5KXDF6QnqhBj72hDtJNkkpFaQVUfbFXNybMsp3DiK6tD`. Evidence in `docs/RESEARCH.md`.
2. Are coin minimums enforced on chain or by policy?
3. Does Jupiter's current API support integrator fees on Token-2022 xStock outputs? Confirm before Day 3.
4. Team: solo, or invite a second builder by username for the keeper?
5. Final product name. Resolved 2026-09-12: Stonk Ledger stays. The pitch leads with DRIP; the name does not change.

## 16. How to build this with Claude Code

1. `/session-start`, then `scaffold-project` (reads `.superstack/idea-context.md`).
2. `solana-dev` for wallet connection, `@solana/kit`, delegation, and signing.
3. `brand-design`, then `frontend-design-guidelines` and `number-formatting` while building pages.
4. `build-with-claude` for F1, F2, F3, F7 in the day order above.
5. `railway-docs` for the workers. `submit-to-hackathon` on Day 6. `/phase-complete` per day, `/session-end` to wind down.
   Rules: verify Jupiter and Helius parameter names from docs before writing integration code; never print secrets; `.env` gitignored before the first commit; one working unit per commit.

## 17. Sources

- Stocklana: https://hackathons.solana.com/hackathons/stocklana and https://hackathons.solana.com/how-it-works
- StonkFun API: `https://www.stonkfun.xyz/api/public/v1/openapi.json`
- Slawth: https://slawth.xyz/ · The Stonk Board: https://thestonkboard.com/ · StonkBot: https://stonkbot.vip/ · KNOTS: https://www.knotsonstonk.com/
- Reports in this folder: `idea-shortlist-20260911-004500.html`, `idea-shortlist-knots-20260911-011500.html`, `idea-combined-ranking-20260911-014000.html`, `idea-deep-dive-knot-ledger-20260911-020000.html`
