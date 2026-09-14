/**
 * Sign with the connected wallet, submit through our HTTP relay, confirm by
 * polling. The kit wallet plugin exposes a modifying signer (the wallet signs,
 * it does not send), and the browser has no websocket: the public mainnet
 * socket refuses connections and /api/rpc is HTTP only.
 */
import {
  appendTransactionMessageInstructions,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Instruction,
  type TransactionSigner,
} from "@solana/kit";
import type { AppClient } from "./solana-client";

const POLL_MS = 1500;
const TIMEOUT_MS = 90_000;

export async function sendViaWallet(
  client: AppClient,
  signer: TransactionSigner,
  instructions: Instruction[]
): Promise<{ context: { signature: string } }> {
  const { value: blockhash } = await client.rpc
    .getLatestBlockhash({ commitment: "confirmed" })
    .send();
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(signer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
    (m) => appendTransactionMessageInstructions(instructions, m)
  );
  const signed = await signTransactionMessageWithSigners(message);
  const signature = await client.rpc
    .sendTransaction(getBase64EncodedWireTransaction(signed), {
      encoding: "base64",
      preflightCommitment: "confirmed",
    })
    .send();

  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    const { value } = await client.rpc
      .getSignatureStatuses([signature], { searchTransactionHistory: false })
      .send();
    const st = value[0];
    if (st?.err) throw new Error(`Transaction ${signature} failed on chain`);
    if (
      st &&
      (st.confirmationStatus === "confirmed" ||
        st.confirmationStatus === "finalized")
    ) {
      return { context: { signature } };
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  throw new Error(
    `Transaction ${signature} was sent but not confirmed in time`
  );
}
