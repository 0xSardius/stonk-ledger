/**
 * The DRIP keeper identity and its Solana connection.
 *
 * DRIP_KEEPER_SECRET_KEY accepts either a base58 64-byte secret key or a JSON
 * byte array (the solana-keygen file format). The keeper is the delegate on
 * every holder's quote token account; it never holds a user's private key.
 */
import {
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  getBase58Encoder,
  sendAndConfirmTransactionFactory,
  type KeyPairSigner,
} from "@solana/kit";
import { requireEnv } from "../env";

export function keeperSecretBytes(raw = requireEnv("DRIP_KEEPER_SECRET_KEY")) {
  const trimmed = raw.trim();
  if (trimmed.startsWith("[")) {
    return new Uint8Array(JSON.parse(trimmed) as number[]);
  }
  return new Uint8Array(getBase58Encoder().encode(trimmed));
}

let _signer: Promise<KeyPairSigner> | null = null;
export function keeperSigner() {
  if (!_signer) _signer = createKeyPairSignerFromBytes(keeperSecretBytes());
  return _signer;
}

export function keeperConnection() {
  const key = requireEnv("HELIUS_API_KEY");
  const rpc = createSolanaRpc(`https://mainnet.helius-rpc.com/?api-key=${key}`);
  const rpcSubscriptions = createSolanaRpcSubscriptions(
    `wss://mainnet.helius-rpc.com/?api-key=${key}`
  );
  const sendAndConfirm = sendAndConfirmTransactionFactory({
    rpc,
    rpcSubscriptions,
  });
  return { rpc, rpcSubscriptions, sendAndConfirm };
}
