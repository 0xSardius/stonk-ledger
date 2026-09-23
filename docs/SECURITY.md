# Security notes

What Stonk Ledger can and cannot do with a holder's funds, and how each claim is enforced. Written for judges and for the holder reading the approval screen.

## The ledger

The statement reads public chain data. It never asks for a signature. Payouts are classified by a fixed rule: the tokens leave a StonkFun distributor wallet listed in `lib/distributors.ts` (`5KXDF6Qn…` until 2026-09-20, `HuBMeYW3…` for most batches since; fees come from separate fee-payer wallets), no DEX or aggregator program appears in the outer instructions, and the mint equals the coin's quote mint (`lib/classify.ts`, fixture-tested). Anything else is not a payout. Rows that matched by batch shape rather than by signer carry a `probable` flag and are labelled on the page.

## Stock DRIP

### What the holder signs

One SPL Token or Token-2022 `ApproveChecked` on their quote token account, naming the keeper as delegate with a cap the holder typed. That is the whole grant. The holder's private key never leaves their wallet; the app cannot sign for them.

### What the keeper can do

- Move up to the cap out of that one token account. Nothing else: no other token, no SOL, no other account.
- Nothing after the holder signs `Revoke`, which is one transaction and takes effect immediately. The keeper checks the delegate on chain before every run and closes the row if it is gone.

### What the keeper does per run (`lib/drip/run.ts`)

1. Reads the holder's token account on chain. If the keeper is not the delegate, it stops.
2. Computes pending = payouts since the approval minus amounts already swept, from the ledger. It never sweeps balance that did not arrive as a payout after the approval.
3. Sweeps `min(pending, remaining cap, balance)`, only when worth at least the threshold ($5 default).
4. Transfer to the keeper's account, Jupiter Ultra swap, transfer of 99% of the output to the holder's target token account. Three signatures, all logged to `drip_runs` and shown on the statement.
5. Before signing the swap, the keeper checks Jupiter's order: same mints and amount as requested, and a value loss of at most 2%. Otherwise it refunds.
6. Each signature is written to `drip_runs` before its transaction is sent. Each step moves on only when chain confirms the outcome (`lib/drip/settle.ts`). If a pass stops part-way for any reason (crash, timeout, RPC error), the next pass finishes the run from the recorded state:
   - The quote tokens are refunded to the holder only when no swap landed.
   - Once a swap lands, the only way forward is returning its output. The output amount is read from the swap transaction on chain, not from Jupiter's response.
   - A run that is not finished still counts as swept, so the same payouts are never pulled twice.
7. Each pass claims a delegation with a 15-minute lease, so two passes never work on one delegation at once. One failed delegation does not stop the others.

### What the keeper holds

- Its own SOL for fees.
- The 1% fee in the output stock.
- A holder's tokens between transfer and return. This takes seconds in a normal run. If a run is interrupted, it lasts until the next keeper pass. This is the trust window, and it is disclosed on the approval screen and in this file.

### Keeper key

A single Ed25519 keypair. The secret lives in the deploy environment (`DRIP_KEEPER_SECRET_KEY`) and in GitHub Actions secrets; it is never in the repo. Compromise of that key exposes at most the sum of all remaining caps across active delegations, never whole balances. Caps default to four weeks of payouts at the trailing rate.

## Web surface

- `/api/rpc` relays a fixed allow-list of JSON-RPC methods to Helius, so the browser never sees the API key.
  - It accepts only requests from the app's own origin.
  - It takes at most 5 calls per batch and 10 accounts per lookup.
  - A script can forge the origin header, so these limits bound the cost of abuse; they do not prevent it.
- There is no inbound webhook. A scheduled job pulls fresh batches from the distributors' history, so no third party can post data into the database. Inserts are idempotent on (signature, wallet), so overlapping pulls cannot duplicate rows.
- `/api/drip/approve` records a delegation only when the named approval transaction meets all of these conditions:
  - It succeeded, was signed by the wallet, and is less than 30 minutes old.
  - It approves the keeper on that exact token account.
  - The delegation is live on chain.
- One approval registers one setting; changing the target or threshold needs a new signature. The threshold has a $1 minimum.
- `/revoke` confirms on chain that the keeper is no longer the delegate. A client cannot record or change a delegation it did not sign.
- No secrets are printed by any script. `.env` is gitignored and was never committed.

## Known limitations

- Two coins that pay the same quote mint cannot be told apart from the batch alone. Attribution uses the holder's larger position and marks the row `probable` when the positions are close.
- USD at receipt uses the nearest recorded price within two hours; older payouts show no value rather than a guess.
- The keeper is a single process on a schedule. If it is down, nothing is swept and nothing new is at risk; payouts simply accumulate in the holder's account. A run interrupted mid-way is finished on the next pass.
- The keeper assumes the quote token has no Token-2022 transfer fee. Every quote token in use today (STONK, xStocks, PreStocks) has none.
- The keeper secret is also set on the web deploy, because the approve and status routes read the keeper's address from it. After the hackathon, publish the address as a plain variable and remove the secret from the web deploy.
