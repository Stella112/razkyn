// Baseline network RTT from this machine to devnet-tee: 60 sequential getSlot calls on a warm
// (keep-alive) connection. Separates client network time from TEE execution time in S2.
import { loadKeypair, teeConn, pct, saveEvidence } from "./spike-lib.ts";
const tee = await teeConn(loadKeypair("keeper"));
await tee.getSlot();
const ms: number[] = [];
for (let i = 0; i < 60; i++) { const t = performance.now(); await tee.getSlot(); ms.push(performance.now() - t); }
const r = { samples: ms.length, p50: Math.round(pct(ms, 50)), p95: Math.round(pct(ms, 95)), min: Math.round(Math.min(...ms)), max: Math.round(Math.max(...ms)) };
console.log("getSlot RTT to devnet-tee (ms):", r);
saveEvidence("rtt-devnet-tee", r);
