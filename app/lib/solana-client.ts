import { createClient, MicroLamports } from "@solana/kit";
import { walletSigner } from "@solana/kit-plugin-wallet";
import { solanaRpc } from "@solana/kit-plugin-rpc";
import { tokenProgram } from "@solana-program/token";
import { systemProgram } from "@solana-program/system";

/**
 * Stonk Ledger is mainnet-only. Reward coins, xStocks, and payouts exist only
 * there. The RPC URL comes from NEXT_PUBLIC_RPC_URL so the browser can use a
 * provisioned endpoint without a key in the bundle.
 */
export const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.mainnet-beta.solana.com";
export const RPC_WS_URL =
  process.env.NEXT_PUBLIC_RPC_WS_URL ?? "wss://api.mainnet-beta.solana.com";

export const WALLET_CHAIN = "solana:mainnet" as const;

export type RpcUrlOverrides = {
  rpcUrl: string;
  rpcSubscriptionsUrl: string;
};

export function createAppClient(urls?: RpcUrlOverrides) {
  return createClient()
    .use(walletSigner({ chain: WALLET_CHAIN }))
    .use(
      solanaRpc({
        rpcUrl: urls?.rpcUrl ?? RPC_URL,
        rpcSubscriptionsUrl: urls?.rpcSubscriptionsUrl ?? RPC_WS_URL,
        transactionConfig: {
          microLamportsPerComputeUnit: 1000n as MicroLamports,
        },
      })
    )
    .use(systemProgram())
    .use(tokenProgram());
}

export type AppClient = ReturnType<typeof createAppClient>;
