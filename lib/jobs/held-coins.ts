import { eq } from "drizzle-orm";
import { db, schema } from "../db";

/**
 * Active reward coins among a set of held mints. Intersects in memory because
 * a wallet can hold hundreds of mints and a giant IN (...) breaks the query.
 */
export async function heldActiveCoins(heldMints: string[]) {
  if (heldMints.length === 0) return [];
  const held = new Set(heldMints);
  const all = await db()
    .select()
    .from(schema.coins)
    .where(eq(schema.coins.active, true));
  return all.filter((c) => held.has(c.mint));
}
