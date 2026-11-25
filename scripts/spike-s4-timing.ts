// S4 timing on-chain: slot of request tx vs slot of callback tx on the TEE, converted with the
// TEE's measured ms/slot. Removes this client's network round-trip from the measurement.
import { readFileSync } from "node:fs";
import { loadKeypair, teeConn, sleep, saveEvidence, REPO } from "./spike-lib.ts";
const ev = JSON.parse(readFileSync(`${REPO}/spikes/results/s4-vrf.json`, "utf8"));
const tee = await teeConn(loadKeypair("keeper"));
const s0 = await tee.getSlot(); const t0 = Date.now(); await sleep(20_000);
const s1 = await tee.getSlot(); const msPerSlot = (Date.now() - t0) / (s1 - s0);
const rows = [];
for (const r of ev.rounds) {
  const a = await tee.getTransaction(r.requestSig, { maxSupportedTransactionVersion: 0 });
  const b = await tee.getTransaction(r.callbackSig, { maxSupportedTransactionVersion: 0 });
  const slots = b!.slot - a!.slot;
  rows.push({ round: r.round, requestSlot: a!.slot, callbackSlot: b!.slot, slots, onchainMs: Math.round(slots * msPerSlot), blockTimeDeltaS: (b!.blockTime ?? 0) - (a!.blockTime ?? 0) });
}
console.table(rows);
const pass = rows.every((x) => x.onchainMs <= 5000);
console.log(`TEE ms/slot=${msPerSlot.toFixed(2)}  ${pass ? "S4 PASS (on-chain timing)" : "S4 FAIL (on-chain timing)"}`);
saveEvidence("s4-vrf-timing", { msPerSlot, rows, pass });
