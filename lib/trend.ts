/**
 * Week-on-week payout change for the statement. Pure, unit-tested.
 *
 * Shown only when the stored history reaches back past the start of the
 * previous week: a wallet whose first view indexed only a few pages would
 * otherwise show a false rise. Payouts depend on trading volume, so this is
 * a record of what happened, not a forecast.
 */
export function weekOnWeek(i: {
  last7: number;
  prev7: number;
  /** Earliest stored payout for this coin and wallet. */
  first: Date;
  now: Date;
}): number | null {
  const start = i.now.getTime() - 14 * 86400_000;
  if (i.first.getTime() > start) return null;
  if (i.prev7 <= 0) return null;
  return i.last7 / i.prev7 - 1;
}
