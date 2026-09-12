import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { requireEnv } from "../env";
import * as schema from "./schema";

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

/** Lazy so that importing this module without DATABASE_URL does not throw. */
export function db() {
  if (!_db) {
    _db = drizzle(neon(requireEnv("DATABASE_URL")), { schema });
  }
  return _db;
}

export { schema };
