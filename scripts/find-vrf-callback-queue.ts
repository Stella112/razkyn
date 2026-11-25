// Look for a raid's VRF fulfilment via the (public) delegated VRF queue on devnet-tee.
import { PublicKey } from "@solana/web3.js";
import { loadKeypair, teeConn } from "./spike-lib.ts";
const QUEUE = new PublicKey("5hBR571xnXppuCPveTrctfTU7tJLSN94nq7kv7FRK5Tc");
const raid = process.argv[2];
const tee = await teeConn(loadKeypair("keeper"));
let before: string | undefined;
let seen = 0;
for (let page = 0; page < 10; page++) {
  const sigs = await tee.getSignaturesForAddress(QUEUE, { limit: 100, before });
  if (!sigs.length) break;
  for (const s of sigs) {
    seen++;
    const t = await tee.getTransaction(s.signature, { maxSupportedTransactionVersion: 0 });
    const keys = t?.transaction.message.staticAccountKeys?.map((k) => k.toBase58()) ?? [];
    if (keys.includes(raid)) { console.log("FOUND", s.signature, "err=", JSON.stringify(s.err), new Date((s.blockTime ?? 0) * 1000).toISOString()); }
  }
  before = sigs[sigs.length - 1].signature;
}
console.log("scanned", seen);
