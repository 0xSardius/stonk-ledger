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

## Coin attribution when quote mints collide

A distributor batch carries no coin id. When a wallet holds two coins that pay the same quote (two STONK-paid coins), the indexer attributes the payout to the coin where the wallet's position is worth the most (balance x market cap / 1B supply), and marks it `probable` only when the runner-up position is worth at least 20% of the top one. First observed on the largest KNOTS holder, who also holds dust of another STONK-paid coin. Exact attribution would require matching batch co-recipients against holder sets and is deferred.

## Live indexing results (2026-09-13, 3 pages of history each)

| Wallet           | Coin  | Payouts | Amount        | Window          |
| ---------------- | ----- | ------- | ------------- | --------------- |
| top KNOTS holder | KNOTS | 208     | 319,744 STONK | Sep 1 to Sep 13 |
| same wallet      | TACZ  | 33      | 123 ZCAT      | Sep 12 to 13    |
| top TREE holder  | TREE  | 146     | 48.70 APPLx   | Sep 6 to Sep 13 |
| top DIVI holder  | DIVI  | 14      | 529 STRCx     | Sep 11 to 13    |

## Jupiter swap path for the DRIP keeper (verified live 2026-09-13)

`GET https://lite-api.jup.ag/ultra/v1/order?inputMint=&outputMint=&amount=&taker=` answers without an API key. Test order: 1,000 STONK ($239) to SPYx, a Token-2022 mint.

| Field          | Value                                                                                 |
| -------------- | ------------------------------------------------------------------------------------- |
| router         | dflow (aggregator mode)                                                               |
| outAmount      | 0.3115 SPYx                                                                           |
| priceImpactPct | 0.21%                                                                                 |
| slippageBps    | 500 (Ultra default)                                                                   |
| Jupiter fee    | 10 bps, taken in the input mint                                                       |
| response       | unsigned `transaction` (base64) plus `requestId`; sign, then `POST /ultra/v1/execute` |

Decisions:

1. The keeper uses Ultra order -> sign -> execute. Jupiter submits the transaction; no RPC send path needed.
2. PRD open question 3 (integrator fees on Token-2022 outputs) is moot. The keeper receives the swap output in its own account and forwards 99% to the holder, keeping the 1% DRIP fee in the output stock. No Jupiter referral account is needed. `JUPITER_REFERRAL_ACCOUNT` stays optional for manual de-risk swaps later.
3. Show `priceImpactPct` and `outUsdValue` from a dry-run order on the approval screen.
4. Ultra rate limit is 50 requests per 10 s with no execute volume, enough for a 10-minute keeper.

## Who is paid enough to care (2026-09-13)

Script: `scripts/research/holder-distribution.ts`. Uniform random sample of 60 holders with balance > 0 (Helius DAS `getTokenAccounts`), one page (100 transactions) of quote-account history each, payouts summed over the trailing 7 days. Holders with no payout count as zero.

|                                    | TREE / APPLx | KNOTS / STONK |
| ---------------------------------- | ------------ | ------------- |
| Holders with balance > 0           | 2,805        | 14,345        |
| Got at least one payout in 7 days  | 65%          | 45%           |
| p25                                | $0.00        | $0.00         |
| Median                             | $4.67        | $0.00         |
| p75                                | $20.72       | $13.09        |
| p90                                | $135.75      | $149.19       |
| p99                                | $1,094.51    | $708.47       |
| Mean                               | $54.73       | $41.66        |
| Share earned by top 10% of holders | 78%          | 75%           |

Prices at sample time: APPLx $330.90, STONK $0.2454.

Reading:

- The median KNOTS holder is below the coin's $20 minimum and receives nothing. The median TREE holder gets about one $5 sweep a week.
- The product's customer is the top quartile of holders: roughly $20 to $1,000 of stock per week, arriving as dust. That is about 700 TREE wallets and 3,500 KNOTS wallets today, before counting the other 3,500 coins.
- The $5 default threshold is right for the median TREE holder and triggers daily from p75 upward.
- Caveat: one history page per wallet undercounts whales with more than 100 quote-account transactions a week, so p99 is a floor, not a ceiling.
- Pitch sizing: say "the holders who matter", top-quartile wallets, not "238k positions".

## Known limitation: two coins, one quote mint

When a wallet holds two coins paid in the same quote (the KNOTS whale also holds DEX, paid in STONK), DRIP delegations are per (wallet, quote mint) and the keeper only sweeps payouts attributed to the chosen coin. The status page shows both coins as candidates. Fine for the demo; merge candidates by quote mint after the hackathon.

## Not yet answered

- Whether coin minimums are enforced on chain (PRD open question 2).
