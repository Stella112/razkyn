// Diagnose S4: request logs, probe state, recent txs on probe and the ephemeral queue (TEE).
import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { loadKeypair, teeConn, spikeProgram, pdas, txLogs } from "./spike-lib.ts";
const keeper = loadKeypair("keeper");
const tee = await teeConn(keeper);
const program = spikeProgram(tee, keeper);
const { probe } = pdas(program.programId, new anchor.BN(2));
const reqSig = process.argv[2];
console.log("request logs:\n" + (await txLogs(tee, reqSig)).join("\n"));
const p = (await program.account.probe.fetch(probe)) as any;
console.log("probe pending_vrf", p.pendingVrf, "requests", p.vrfRequests.toString(), "fulfilled", p.vrfFulfilled.toString());
for (const [label, pk] of [["probe", probe], ["eph queue", new PublicKey("5hBR571xnXppuCPveTrctfTU7tJLSN94nq7kv7FRK5Tc")]] as const) {
  const sigs = await tee.getSignaturesForAddress(pk, { limit: 8 }).catch((e) => { console.log(label, "sigs error", String(e)); return []; });
  console.log(`\n${label}: ${sigs.length} recent sigs`);
  for (const s of sigs) console.log(" ", s.signature.slice(0, 20), "err=", JSON.stringify(s.err), new Date((s.blockTime ?? 0) * 1000).toISOString());
}
const q = await tee.getAccountInfo(new PublicKey("5hBR571xnXppuCPveTrctfTU7tJLSN94nq7kv7FRK5Tc"));
console.log("\nqueue on TEE:", q ? { owner: q.owner.toBase58(), len: q.data.length } : null);
const fails = await tee.getSignaturesForAddress(probe, { limit: 1 });
if (fails[0]) {
  const t = await tee.getTransaction(fails[0].signature, { maxSupportedTransactionVersion: 0 });
  console.log("\nlatest fulfilment attempt", fails[0].signature, "\n" + (t?.meta?.logMessages ?? []).join("\n"));
  console.log("CU consumed:", t?.meta?.computeUnitsConsumed);
}
