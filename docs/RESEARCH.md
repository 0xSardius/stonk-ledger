# Research: payout distributor (Day 1, 2026-09-13)

Procedure: docs/PRD.md section 8.1. Script: `scripts/research/find-distributor.ts`. Raw output per coin was kept out of the repo (holder addresses); summary below.

## Result

**One platform wallet distributes payouts for every coin sampled:**

`5KXDF6QnqhBj72hDtJNkkpFaQVUfbFXNybMsp3DiK6tD`

It is the fee payer and signer on every batch. Batches are plain token transfers, about 16 to 20 destinations per transaction, no DEX or aggregator program in the outer instructions. SPL Token program for STONK-quoted coins, Token-2022 for xStock-quoted coins (xStocks are Token-2022 mints).

| Coin  | Quote | Inbound quote txs sampled | Signed by distributor | Avg destinations per batch | Token program | Pool vaults skipped |
| ----- | ----- | ------------------------- | --------------------- | -------------------------- | ------------- | ------------------- |
| KNOTS | STONK | 79                        | 61                    | 18.4                       | SPL Token     | 1                   |
| DIVI  | STRCX | 68                        | 54                    | 16.2                       | Token-2022    | 0                   |
| TREE  | APPLX | 84                        | 84                    | 19.5                       | Token-2022    | 1                   |

Sample: 5 largest wallet holders per coin, last 20 transactions on each holder's quote-token account.

## Non-distributor inbound transfers

Every other fee payer in the sample is a swap: sources JUPITER, BYREAL, OKX_DEX_ROUTER, DFLOW; programs `JUP6LkbZ...`, `DF1ow4ts...` (Byreal), `proVF4pM...`; 2 to 6 destinations. These are holders buying the quote asset, not payouts. The classifier rule in PRD 8.2 (signer in distributor set, no DEX program, mint equals quote mint) excludes all of them.

## Sample payout transactions

- KNOTS: [5MzpfEcfnYbD8tqkPXVB...](https://solscan.io/tx/5MzpfEcfnYbD8tqkPXVBPkrMTHjqZGNEH5x59fJ6NQmg7b3RLzSEqnaCdKicdTiUAY5nrAQf8NN83vHVfmPrU3pE) to 20 destinations, 3386.289424 STONK to holder `6FpuXT6k...`
- KNOTS: [4m94A2E2iz3VLiUK2MXb...](https://solscan.io/tx/4m94A2E2iz3VLiUK2MXb2fUAHKsCCAZFBaew9Xoxe2RPDEikWfjnr1Cr5YCDHwpRjGM8nmjhVJJ9PxbLJr7wUVmF) to 20 destinations, 19.471916 STONK to holder `6FpuXT6k...`
- DIVI: [3YKu1N2wrRk5j2uAtEyF...](https://solscan.io/tx/3YKu1N2wrRk5j2uAtEyFhLhg1A4Di5WTJLgasVDjqRqohMda2QHy63oVHRrUxwzeQMVyFgKJojKX8B3ULerPFu4M) to 17 destinations, 43.478839 STRCX to holder `61RB6NX5...`
- DIVI: [55mwvueNtdTnvn38QLe6...](https://solscan.io/tx/55mwvueNtdTnvn38QLe6pFFHVJbxVHwv7iShq6kKTegYkEk7txMNHEyKaAgEP1UDdiDyUJzdYspzszY24yKN9dxy) to 13 destinations, 70.816353 STRCX to holder `61RB6NX5...`
- TREE: [4QakF2tDN6LyrdNKz5mS...](https://solscan.io/tx/4QakF2tDN6LyrdNKz5mSq1ah5Uh8E3qRg8dhfDgJHvab48fQarMiJbB9c58Jg4arqZQuHpiSiJ4iZw2kTE7QdFTU) to 17 destinations, 0.249326 APPLX to holder `4di7dpum...`
- TREE: [FKF5x4P7Gkvcgusa3ce4...](https://solscan.io/tx/FKF5x4P7Gkvcgusa3ce4UYt7CBoPSD6WXmqAtPF31513ypFhNCT5jQ77aMjTGrii46sj4ZfqZVtE67efhUpdVWJ) to 20 destinations, 0.225308 APPLX to holder `4di7dpum...`

## Decisions

1. `coins.distributor_signers` is set to `[5KXDF6QnqhBj72hDtJNkkpFaQVUfbFXNybMsp3DiK6tD]` for every active reward coin. Verified on KNOTS, DIVI, TREE; assumed for the rest because the signer is the platform's, not the coin's. The classifier still marks a payout `probable` when the signer is not in the set, so an unverified coin degrades gracefully.
2. PRD open question 1 ("one platform wallet or per coin?") is resolved: one platform wallet.
3. Step 5 of PRD 8.1 (daily transfer count versus `payoutCount` growth) will be checked by the indexer once it runs for 24 hours.

## Not yet answered

- Median payout per holder over 7 days (the "who is paid enough to care" gate). Needs the indexer on a random holder sample, not the top 5.
- Whether coin minimums are enforced on chain (PRD open question 2).
