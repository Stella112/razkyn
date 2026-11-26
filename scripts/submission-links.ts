// Gather SUBMISSION.md proof links for one raid from the chain: the base-layer transactions on the
// Raid PDA (create, join, delegate, commit, finalize) with their log hint, and the ops treasury from Config.
//   tsx scripts/submission-links.ts <raid_id>
import * as anchor from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import { PID, idl } from "./raid-lib.ts";
import { baseConn } from "./spike-lib.ts";

const conn = baseConn();
const id = new anchor.BN(process.argv[2]);
const raid = PublicKey.findProgramAddressSync([Buffer.from("raid"), id.toArrayLike(Buffer, "le", 8)], PID)[0];
const P = new anchor.Program(idl, new anchor.AnchorProvider(conn, new anchor.Wallet(Keypair.generate()), {}));
const cfgPda = PublicKey.findProgramAddressSync([Buffer.from("config")], PID)[0];
const cfg = P.coder.accounts.decode("config", (await conn.getAccountInfo(cfgPda))!.data) as Record<string, unknown>;
console.log("config", cfgPda.toBase58(), JSON.stringify(Object.fromEntries(Object.entries(cfg).map(([k, v]) => [k, v instanceof PublicKey ? v.toBase58() : String(v)]))));
const sigs = await conn.getSignaturesForAddress(raid, { limit: 60 });
for (const s of sigs.reverse()) {
  // web3.js 1.98 cannot parse version-1 transactions (the commit + Magic Action); list them without logs.
  const tx = await conn.getTransaction(s.signature, { maxSupportedTransactionVersion: 0, commitment: "confirmed" }).catch(() => null);
  const logs = (tx?.meta?.logMessages ?? []).filter((l) => /Instruction: |delegat|settled|Commit/i.test(l)).map((l) => l.replace("Program log: ", "")).slice(0, 4);
  console.log(`${s.signature} ${s.err ? "ERR" : "ok"} ${logs.join(" | ").slice(0, 160)}`);
}
process.exit(0);
