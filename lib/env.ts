import "dotenv/config";
import { z } from "zod";

/**
 * Server-side environment. Import only from route handlers, scripts, and
 * workers. Never from client components.
 */
const schema = z.object({
  DATABASE_URL: z.url().optional(),
  HELIUS_API_KEY: z.string().min(1).optional(),
  HELIUS_WEBHOOK_SECRET: z.string().min(16).optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  JUPITER_REFERRAL_ACCOUNT: z.string().optional(),
  DRIP_KEEPER_SECRET_KEY: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
  STONKFUN_API_BASE: z.url().default("https://www.stonkfun.xyz/api/public/v1"),
});

export const env = schema.parse(process.env);

export function requireEnv<K extends keyof typeof env>(key: K) {
  const value = env[key];
  if (value == null || value === "") {
    throw new Error(`Missing required environment variable ${key}`);
  }
  return value as NonNullable<(typeof env)[K]>;
}

export function heliusRpcUrl() {
  return `https://mainnet.helius-rpc.com/?api-key=${requireEnv("HELIUS_API_KEY")}`;
}
