# Stocklana submission package

Submissions close 2026-09-25, 4 pm ET. Edits are allowed until close. Submitting without videos (decided 2026-09-24): the form requires at least one link, and the live site plus the repo carry the demo.

Tracks: **Main track** and **Best Use of PreStocks**. Do not select Tessera: the PreStocks bounty excludes projects that integrate any other pre-IPO token, and the Tessera targets were removed on 2026-09-23.

Links for the form:

- Live: https://stonk-ledger.vercel.app
- Repo (public, MIT): https://github.com/0xSardius/stonk-ledger

Every figure below was checked against production on 2026-09-24.

## 1. Short description

> Paste any Solana wallet to see every tokenized-stock dividend it earned from StonkFun meme coins, each with an onchain receipt. Then turn future payouts into a stock you pick, like SPYx or a PreStocks pre-IPO token, with one capped, non-custodial approval.

256 characters (form limit 280).

## 2. Full description (markdown)

```markdown
# Stonk Ledger

**The receipt and the reinvestment for meme coins that pay dividends in tokenized stocks.**

Live on mainnet: https://stonk-ledger.vercel.app · Repo (MIT): https://github.com/0xSardius/stonk-ledger

## The problem

StonkFun reward coins pay holders a share of each coin's trading tax in another token: Apple (APPLx), the S&P 500 (SPYx), Nvidia, or PreStocks pre-IPO tokens such as Anthropic and OpenAI. Stonk Ledger tracks over 6,500 of the most traded reward coins; over 1,500 of them pay in PreStocks.

The payouts arrive as plain token transfers from a platform wallet, often dozens of small ones a week per coin. A holder cannot easily answer two questions:

1. **What have I actually been paid, and is it still worth holding?**
2. **Can I get the stock I want instead of the one the coin pays?**

## The receipt: a dividend statement for any wallet

Paste any wallet address. No connection needed.

- Every payout per coin, valued at receipt and today, each linked to its transaction on Solscan.
- Totals in shares, not just dollars, because the payout is a stock.
- The payout trend: this week against the week before.
- Payouts measured against the value of the position that earned them.

Example: [a top TREE holder](https://stonk-ledger.vercel.app/wallet/4di7dpumucn9xr3Wt2SpMxP1kjpX7iM8KhgtnhCLPoVa) received 200 payouts totalling 52.98 APPLx, about $17,800 today. The same page shows those payouts fell 97% from one week to the next. Nothing else shows a holder this.

Every coin page carries a public proof feed of its distributions. For example, [AGI pays holders in Anthropic PreStocks](https://stonk-ledger.vercel.app/coin/CaWZeUM4FvX9dPkjGc2xHS6tSN3qJfTWyvaG77aM5o7h): 481 recorded batches, 4,349 dividends.

## The reinvestment: Stock DRIP

Connect the wallet, sign one capped token approval, and pick a target:

- **Public stocks (xStocks):** SPYx, QQQx, NVDAx, APPLx, TSLAx, GLDx, MCDx.
- **Pre-IPO (PreStocks):** OpenAI, Anthropic, SpaceX, Anduril, Neuralink, Polymarket, Kalshi, Figure AI.

A keeper runs on a schedule several times a day. When your new payouts are worth at least $5, it sweeps them up to your cap, swaps them through Jupiter Ultra, and sends the stock back to your wallet. Each run leaves three signatures (transfer, swap, return) on your statement. The fee is 1% of the output. Revoke is one signed transaction.

Any payout token Jupiter can route works as input, so a coin that pays in STONK, BONK, or PEPE can become SPYx or Anthropic PreStocks. Auto-compounders put payouts back into the meme coin; DRIP turns them into the asset you chose.

**Proof on mainnet:** three DRIP runs so far, one made unattended by the scheduled keeper. First run: [transfer](https://solscan.io/tx/63pXozKtz2PMRjt3wPNFeK6pZ9pxSydpiamyxh6zi3qT1paKCnkX4yXXNneoaWs2Dp8pD6TY2qvNHN7MR5H13RiF) · [swap](https://solscan.io/tx/4uRAYhtbjE8EiCKZV8b5Zs2qjQdMaKFazHeBeyUVdMtQBirBxvbiEq9YbYP2Ur74chKTXXMSpgUFbckX62pXE3SE) · [return](https://solscan.io/tx/4WLjeFx5BCH3aTfcRHqkTugzhqcbbCm5dKmLcX6ScHe4yV552QQM1bg6SCPH6xAFxTZQKnqjMF3NrZDHxi1FHmpN). All runs are listed at https://stonk-ledger.vercel.app/drip.

## Why PreStocks

PreStocks tokens are already money to thousands of wallets: they are the payout asset of over 1,500 StonkFun coins. Stonk Ledger makes those PreStocks dividends visible and provable per wallet, and makes every PreStocks token a DRIP target, so any payout stream, whatever it pays in, can become pre-IPO exposure. The target list is checked against the PreStocks API in a test. PreStocks is the only pre-IPO issuer the app integrates.

## Why Solana

- The payouts are transfer-tax distributions that exist only on Solana.
- A capped delegation is a native token-program primitive (`ApproveChecked`), so non-custodial DRIP needs no smart contract and no custody.
- Jupiter routes into xStocks and PreStocks tokens (Token-2022) today.

## Trust model

- The holder signs one `ApproveChecked` with a cap they choose. The keeper can move only that token, only up to the cap, only payouts that arrived after the approval.
- The app records a delegation only for an approval the wallet itself signed, checked on chain.
- Each run is a recorded state machine. Every signature is stored before its transaction is sent, and a run interrupted mid-way is finished on the next pass. Quote tokens are refunded only if no swap landed; a landed swap is always returned, with the amount read from chain.
- The keeper refuses a Jupiter quote that would lose more than 2%.
- Full notes: `docs/SECURITY.md`.

## How it is built

- Next.js 16 on Vercel, `@solana/kit` 7 with wallet-standard signing, Postgres on Neon (Drizzle), Helius for RPC and parsed history, Jupiter Ultra for swaps and Jupiter Price for valuation.
- Scheduled jobs on GitHub Actions: price snapshots, the DRIP keeper, and a pull of the distributors' newest batches for the proof feeds.
- The payout classifier is a fixed rule (tokens leave a StonkFun distributor wallet, no DEX program in the transaction), tested against captured mainnet transactions. Mainnet changed under us twice during the build: StonkFun moved fee paying to new wallets, then moved most payouts to a second distributor. Both changes are documented in `docs/RESEARCH.md` with regression tests.
- Every coin is a config row seeded from the StonkFun API. Nothing is hand-picked.
- 76 tests, including the classifier and the keeper against mainnet fixtures.

## Known limits

- The proof feed per coin is a recent sample. StonkFun sends over 100,000 distributor transactions a day, more than the free tier of our data provider can read. A wallet's statement always reads that wallet's full history.
- USD at receipt uses a recorded price when one exists within two hours of the payout; otherwise it is estimated from today's price and labelled.
- DRIP has run only on the builder's own wallet so far.

Informational only. Not tax or investment advice.
```

## 3. Form checklist

1. Open https://hackathons.solana.com/hackathons/stocklana and sign in (register first if needed).
2. Click **Submit Project**. Name: "Stonk Ledger".
3. Paste the short description (section 1) and the full description (section 2, without the code fence).
4. Live URL and repo URL from the top of this file.
5. Select **Main track** and **Best Use of PreStocks**. Not Tessera.
6. Submit before 2026-09-25, 4 pm ET.
