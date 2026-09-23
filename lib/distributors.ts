/**
 * StonkFun platform wallets that pay reward-coin holders. One list for every
 * coin: the platform pays all coins from the same wallets, so a per-coin
 * setting only let new coins fall back to "probable".
 *
 * - 5KXDF… paid every batch until 2026-09-20 and still pays a few.
 * - HuBMe… pays most batches since 2026-09-20 and is funded by 5KXDF….
 *
 * Evidence in docs/RESEARCH.md ("Second distributor"). When StonkFun adds a
 * wallet, add it here; the classifier, the batch parser, and the scheduled
 * pull all read this list.
 */
export const PLATFORM_DISTRIBUTORS = [
  "5KXDF6QnqhBj72hDtJNkkpFaQVUfbFXNybMsp3DiK6tD",
  "HuBMeYW3aDn8BH65fo8xxbP4oiexyup8udzKyccgi8Ga",
] as const;

/** The platform list plus any signers stored on coin rows. */
export function distributorSet(extra: Iterable<string> = []): Set<string> {
  return new Set<string>([...PLATFORM_DISTRIBUTORS, ...extra]);
}
