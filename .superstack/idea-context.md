---
phase: idea
completed_at: 2026-09-11T02:45:00Z
prd_version: 0.4 (Stocklana hackathon edition; deadline 2026-09-25 (extended 2026-09-16), target submit 2026-09-23; stock-forward: statement + Stock DRIP primitive)
red_team: 2026-09-11 found Slawth, The Stonk Board, StonkBot; score 14 -> 12; see docs/PRD.md sections 2, 13, 16
chosen_idea:
  slug: knot-ledger
  name: Stonk Ledger (formerly Knot Ledger)
  one_liner: The receipt and the reinvestment for meme coins that pay dividends in tokenized stocks. Paste a wallet, see every APPLx or SPYx payout with a proof link, and turn any payout stream into a stock position with one approval (Stock DRIP).
  why_crypto: Payouts arrive as STONK transfers in the holder's own wallet, enforced by a Token-2022 transfer tax on every KNOTS transfer. The statement reads them from chain. The sweep is a user-signed Jupiter swap. Buying KNOTS with earned STONK pays 3% back to every other holder on-chain. No account, no custody.
  scores:
    founder_fit: 3
    mvp_speed: 3
    distribution_clarity: 2
    market_pull: 3
    revenue_path: 2
  competitors:
    - name: Slawth (slawth.xyz)
      type: adjacent
      gap: non-custodial auto-compounder with a forward calculator; no payout history, no alerts
    - name: The Stonk Board (thestonkboard.com)
      type: adjacent
      gap: per-coin APR/APY board; no wallet lookup
    - name: StonkFun token page and /tokens/{mint}/rewards
      type: direct
      gap: no per-wallet view, no yield on cost, no sweep
    - name: knotsonstonk.com
      type: direct
      gap: static site, no wallet tooling, team earns no fees to fund one
    - name: Step Finance / Sonar
      type: substitute
      gap: cannot separate STONK payouts from price change or show eligibility
  mvp_checklist:
    - Paste-a-wallet statement with auditable transaction list, USD at receipt and today, yield on cost
    - Eligibility badge, next payout estimate, daily carry
    - Honest calculator: carry net of 3% entry, 3% exit, 3% compounding tax; round-trip recovery days
    - De-risk sweep STONK to SPYx only, user-signed, Jupiter integrator fee; link to Slawth for compounding
    - Telegram bot with payday pings and weekly statement
    - Opt-in leaderboard and share cards
    - Generalize to any reward coin by config
  gtm:
    wedge: The 7,553 wallets already receiving STONK, reached through X search traffic for $KNOTS, the StonkFun Telegram, share cards with proof links, and the 393-member KNOTS Telegram if mods allow
    first_ten_users: Most active posters in the KNOTS Telegram and accounts replying to @KnotsOnStonk; each gets a personal statement screenshot
    channels:
      - KNOTS Telegram
      - X replies to @KnotsOnStonk
      - StonkFun Telegram
    message_angle: Your KNOTS paid you 1,240 STONK this week. Run it back.
stack_hints:
  frontend: Next.js 15 App Router, TypeScript, Tailwind, shadcn/ui
  solana: "@solana/kit, wallet-standard (ConnectorKit or @solana/react-hooks)"
  data: Postgres (Neon) via Drizzle, Helius enhanced transactions and webhooks
  swaps: Jupiter Ultra with referral account (verify field names in docs before coding)
  bot: grammY on Railway
key_addresses:
  knots_mint: 8RVBk8vxLiUHueLUW1f4izFVqN3nWippLhkohKg6EGkS
  knots_pool: GeNDy5afAWz7S9w2tMLgpK3xQqXjeDaCvYV9h8joEmjo
  stonk_mint: 6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx
  spyx_mint: XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W
  stonkfun_api: https://www.stonkfun.xyz/api/public/v1
prd: docs/PRD.md
hackathon:
  name: Stocklana
  url: https://hackathons.solana.com/hackathons/stocklana
  organizer: Solana Foundation
  prize: $100,000 main track
  deadline: 2026-09-25 (extended on 2026-09-16 from 2026-09-18; target submit 2026-09-23)
  tracks_entered: main, PreStocks bounty, Tessera bounty
  field_on_2026-09-11: 35 registered, 4 submissions
  submission: repo, live demo (devnet or mainnet), 3-min pitch video, 5-min technical video
source_reports:
  - idea-shortlist-20260911-004500.html
  - idea-shortlist-knots-20260911-011500.html
  - idea-combined-ranking-20260911-014000.html
---

# Idea context: Knot Ledger

Phase 1 (Idea) is complete. The chosen idea is Knot Ledger. The full PRD is in `docs/PRD.md`. Next phase: `scaffold-project`, then `build-with-claude`.

Day 1 blocker to resolve first: identify the on-chain distributor that signs STONK payouts to KNOTS holders (procedure in PRD section 7.1). Public RPCs rate-limit anonymous calls; a Helius key is required.
