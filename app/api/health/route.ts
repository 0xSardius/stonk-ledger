import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Day 0 done-when: lists 300+ reward coins with quote categories.
 */
export async function GET() {
  if (!env.DATABASE_URL) {
    return NextResponse.json(
      { ok: false, db: "missing", error: "DATABASE_URL is not set" },
      { status: 503 }
    );
  }
  try {
    const rows = await db()
      .select({
        category: schema.coins.quoteCategory,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.coins)
      .where(sql`${schema.coins.active} = true`)
      .groupBy(schema.coins.quoteCategory);
    const byCategory = Object.fromEntries(
      rows.map((r) => [r.category, r.count])
    );
    const coins = rows.reduce((a, r) => a + r.count, 0);
    return NextResponse.json({
      ok: coins >= 300,
      db: "ok",
      coins,
      byCategory,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, db: "error", error: String(err) },
      { status: 500 }
    );
  }
}
