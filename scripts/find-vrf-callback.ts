// List txs touching an account on devnet-tee (as the keeper) with their invoked programs and
// instruction names. Used to locate a raid's VRF callback.
import { PublicKey } from "@solana/web3.js";
import { loadKeypair, teeConn } from "./spike-lib.ts";
const tee = await teeConn(loadKeypair("keeper"));
for (const a of process.argv.slice(2)) {
  const sigs = await tee.getSignaturesForAddress(new PublicKey(a), { limit: 100 });
  console.log(`== ${a}: ${sigs.length} sigs`);
  for (const s of sigs.reverse()) {
    const t = await tee.getTransaction(s.signature, { maxSupportedTransactionVersion: 0 });
    const logs = t?.meta?.logMessages ?? [];
    const names = logs.filter((l) => /Instruction:|invoke \[1\]/.test(l)).map((l) => l.replace("Program log: Instruction: ", "").replace(/Program (\w{4})\w+ invoke \[1\]/, "[$1]")).slice(0, 3);
    if (!names.some((n) => /Tick/.test(n))) console.log(" ", s.signature.slice(0, 88), "err=", JSON.stringify(s.err), logs.length ? names.join(" ") : "(no logs visible)");
  }
}
