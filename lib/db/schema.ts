/**
 * Schema from docs/PRD.md section 8.4. Keep the PRD and this file in sync.
 */
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const coins = pgTable("coins", {
  id: serial("id").primaryKey(),
  symbol: text("symbol").notNull(),
  name: text("name"),
  mint: text("mint").notNull().unique(),
  quoteMint: text("quote_mint").notNull(),
  quoteSymbol: text("quote_symbol").notNull(),
  quoteDecimals: integer("quote_decimals"),
  quoteCategory: text("quote_category").notNull(),
  feeBps: integer("fee_bps"),
  distributorSigners: text("distributor_signers").array().notNull().default([]),
  minRule: text("min_rule"),
  minSource: text("min_source"),
  imageUrl: text("image_url"),
  marketCapUsd: numeric("market_cap_usd"),
  volume24hUsd: numeric("volume_24h_usd"),
  active: boolean("active").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const wallets = pgTable("wallets", {
  address: text("address").primaryKey(),
  firstSeen: timestamp("first_seen", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastIndexedSig: text("last_indexed_sig"),
  lastIndexedAt: timestamp("last_indexed_at", { withTimezone: true }),
});

export const payouts = pgTable(
  "payouts",
  {
    /** Transaction signature. One distributor batch pays many wallets, so the key is (sig, wallet). */
    sig: text("sig").notNull(),
    wallet: text("wallet").notNull(),
    /** Null until the batch is attributed to a coin (two coins can share a quote mint). */
    coinId: integer("coin_id").references(() => coins.id),
    quoteMint: text("quote_mint").notNull(),
    amountRaw: bigint("amount_raw", { mode: "bigint" }).notNull(),
    amount: numeric("amount").notNull(),
    blockTime: timestamp("block_time", { withTimezone: true }).notNull(),
    usdAtReceipt: numeric("usd_at_receipt"),
    usdEstimated: boolean("usd_estimated").notNull().default(false),
    probable: boolean("probable").notNull().default(false),
  },
  (t) => [
    primaryKey({ columns: [t.sig, t.wallet] }),
    index("payouts_wallet_coin_idx").on(t.wallet, t.coinId),
    index("payouts_coin_time_idx").on(t.coinId, t.blockTime),
    index("payouts_quote_time_idx").on(t.quoteMint, t.blockTime),
  ]
);

/**
 * One row per distributor batch (transaction x quote mint). Feeds the proof
 * feed and coin totals. `payouts` keeps per-recipient rows only for wallets
 * someone viewed or delegated; storing every recipient filled the database
 * in three days (2026-09-16).
 */
export const payoutBatches = pgTable(
  "payout_batches",
  {
    sig: text("sig").notNull(),
    quoteMint: text("quote_mint").notNull(),
    /** Null until a viewed wallet's rows resolve which coin paid this batch. */
    coinId: integer("coin_id").references(() => coins.id),
    blockTime: timestamp("block_time", { withTimezone: true }).notNull(),
    recipients: integer("recipients").notNull(),
    amount: numeric("amount").notNull(),
    usdAtReceipt: numeric("usd_at_receipt"),
  },
  (t) => [
    primaryKey({ columns: [t.sig, t.quoteMint] }),
    index("payout_batches_coin_time_idx").on(t.coinId, t.blockTime),
    index("payout_batches_quote_time_idx").on(t.quoteMint, t.blockTime),
  ]
);

/**
 * Batches older than the retention window, folded into one row per coin,
 * quote mint, and UTC day by `lib/jobs/rollup-batches.ts`. Keeps all-time
 * totals while `payout_batches` stays a rolling window. `coin_id` 0 means
 * the batch was never attributed to a coin.
 */
export const payoutDaily = pgTable(
  "payout_daily",
  {
    coinId: integer("coin_id").notNull(),
    quoteMint: text("quote_mint").notNull(),
    day: date("day").notNull(),
    batches: integer("batches").notNull(),
    recipients: integer("recipients").notNull(),
    amount: numeric("amount").notNull(),
    usdAtReceipt: numeric("usd_at_receipt"),
  },
  (t) => [primaryKey({ columns: [t.coinId, t.quoteMint, t.day] })]
);

export const priceSnapshots = pgTable(
  "price_snapshots",
  {
    mint: text("mint").notNull(),
    ts: timestamp("ts", { withTimezone: true }).notNull(),
    usd: numeric("usd").notNull(),
  },
  (t) => [primaryKey({ columns: [t.mint, t.ts] })]
);

export const rewardSnapshots = pgTable(
  "reward_snapshots",
  {
    coinId: integer("coin_id")
      .notNull()
      .references(() => coins.id),
    ts: timestamp("ts", { withTimezone: true }).notNull(),
    distributedTokens: numeric("distributed_tokens"),
    payoutCount: integer("payout_count"),
    holderCount: integer("holder_count"),
  },
  (t) => [primaryKey({ columns: [t.coinId, t.ts] })]
);

export const dripDelegations = pgTable(
  "drip_delegations",
  {
    wallet: text("wallet").notNull(),
    coinId: integer("coin_id")
      .notNull()
      .references(() => coins.id),
    quoteMint: text("quote_mint").notNull(),
    /** Token program that owns the quote mint: SPL Token or Token-2022. */
    quoteProgram: text("quote_program").notNull(),
    /** Holder's quote token account that carries the delegation. */
    quoteTokenAccount: text("quote_token_account").notNull(),
    targetMint: text("target_mint").notNull(),
    capRaw: bigint("cap_raw", { mode: "bigint" }).notNull(),
    approvedSig: text("approved_sig"),
    revokedSig: text("revoked_sig"),
    thresholdUsd: numeric("threshold_usd").notNull().default("5"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.wallet, t.quoteMint] })]
);

export const dripRuns = pgTable("drip_runs", {
  id: serial("id").primaryKey(),
  wallet: text("wallet").notNull(),
  coinId: integer("coin_id")
    .notNull()
    .references(() => coins.id),
  inAmount: numeric("in_amount").notNull(),
  outMint: text("out_mint").notNull(),
  outAmount: numeric("out_amount"),
  feeAmount: numeric("fee_amount"),
  transferSig: text("transfer_sig"),
  swapSig: text("swap_sig"),
  returnSig: text("return_sig"),
  ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
});

export const watches = pgTable(
  "watches",
  {
    chatId: text("chat_id").notNull(),
    wallet: text("wallet").notNull(),
    coinId: integer("coin_id").references(() => coins.id),
    mode: text("mode").notNull().default("daily"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastPingAt: timestamp("last_ping_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.chatId, t.wallet] })]
);
