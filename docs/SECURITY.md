# Security notes

What Stonk Ledger can and cannot do with a holder's funds, and how each claim is enforced. Written for judges and for the holder reading the approval screen.

## The ledger

The statement reads public chain data. It never asks for a signature. Payouts are classified by a fixed rule: the transaction's fee payer is the StonkFun distributor `5KXDF6QnqhBj72hDtJNkkpFaQVUfbFXNybMsp3DiK6tD`, no DEX or aggregator program appears in the outer instructions, and the mint equals the coin's quote mint (`lib/classify.ts`, fixture-tested). Anything else is not a payout. Rows that matched by batch shape rather than by signer carry a `probable` flag and are labelled on the page.

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
5. If the swap or the return fails after the transfer, the keeper sends the quote tokens straight back to the holder and logs the refund signature. Nothing stays on the keeper.

### What the keeper holds

- Its own SOL for fees.
- The 1% fee in the output stock.
- A holder's tokens for the seconds between transfer and return. This is the trust window, and it is disclosed on the approval screen and in this file.

### Keeper key

A single Ed25519 keypair. The secret lives in the deploy environment (`DRIP_KEEPER_SECRET_KEY`) and in GitHub Actions secrets; it is never in the repo. Compromise of that key exposes at most the sum of all remaining caps across active delegations, never whole balances. Caps default to four weeks of payouts at the trailing rate.

## Web surface

- `/api/rpc` relays a fixed allow-list of JSON-RPC methods to Helius so the browser never sees the API key.
- `/api/webhooks/helius` requires the registration secret in the `Authorization` header and answers 403 otherwise. Inserts are idempotent on (signature, wallet), so retries and replays cannot duplicate rows.
- `/api/drip/approve` and `/revoke` verify the delegation on chain before touching the database; a client cannot record a delegation that does not exist.
- No secrets are printed by any script. `.env` is gitignored and was never committed.

## Known limitations

- Two coins that pay the same quote mint cannot be told apart from the batch alone. Attribution uses the holder's larger position and marks the row `probable` when the positions are close.
- USD at receipt uses the nearest recorded price within two hours; older payouts show no value rather than a guess.
- The keeper is a single process on a schedule. If it is down, nothing is swept and nothing is at risk; payouts simply accumulate in the holder's account.
