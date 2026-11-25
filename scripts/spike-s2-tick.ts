// S2 — tick rate (CLAUDE.md §10): permissionless `tick` at 10 Hz for 60 s on the TEE, plus a
// `move_to` from the raid key every 500 ms in the same window.
// Pass = ≥ 95 % of ticks land, p95 latency < 300 ms.
// Latency = time for sendRawTransaction with preflight ON to return (on the ER, preflight
// executes the tx, so a successful return means it ran; skill delegation.md checklist).
// Prereq: tsx scripts/spike-setup.ts --id 2 --min-tick-slots 0
import * as anchor from "@coral-xyz/anchor";
import { ComputeBudgetProgram, Connection, Keypair, Transaction, TransactionInstruction } from "@solana/web3.js";
import { loadKeypair, teeConn, spikeProgram, pdas, saveEvidence, pct, sleep, waitVisible } from "./spike-lib.ts";

const id = new anchor.BN(process.argv[2] ?? "2");
const HZ = Number(process.env.HZ ?? 10);
const SECONDS = Number(process.env.SECONDS ?? 60);
const N = HZ * SECONDS;

const keeper = loadKeypair("keeper");
const raidKey = loadKeypair("raidkey");
const tee = await teeConn(keeper);
const teeRaid = await teeConn(raidKey);
const program = spikeProgram(tee, keeper);
const { probe } = pdas(program.programId, id);
await waitVisible(tee, probe);

type ProbeAcc = { tickCalls: anchor.BN; tickNo: anchor.BN; moves: anchor.BN };
const readProbe = async () => (await program.account.probe.fetch(probe)) as unknown as ProbeAcc;
const before = await readProbe();
const slot0 = await tee.getSlot();

// Fresh blockhash in the background (ER blocks are ~10 ms; don't let one go stale).
let blockhash = (await tee.getLatestBlockhash()).blockhash;
let refreshing = true;
(async () => {
  while (refreshing) {
    try { blockhash = (await tee.getLatestBlockhash()).blockhash; } catch { /* keep last */ }
    await sleep(400);
  }
})();

const tickIx = await program.methods.tick().accountsPartial({ probe }).instruction();
// A varying compute-unit limit makes every tick tx unique (ER fees are 0, so it costs nothing).
function build(ix: TransactionInstruction, signer: Keypair, nonce: number): Transaction {
  const tx = new Transaction()
    .add(ComputeBudgetProgram.setComputeUnitLimit({ units: 100_000 + nonce }))
    .add(ix);
  tx.feePayer = signer.publicKey;
  tx.recentBlockhash = blockhash;
  tx.sign(signer);
  return tx;
}
async function timedSend(conn: Connection, tx: Transaction) {
  const t0 = performance.now();
  try {
    const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 0 });
    return { ok: true, sig, ms: performance.now() - t0, at: t0 };
  } catch (e) {
    return { ok: false, err: String(e).slice(0, 200), ms: performance.now() - t0, at: t0 };
  }
}

const tickResults: Promise<Awaited<ReturnType<typeof timedSend>>>[] = [];
const moveResults: Promise<Awaited<ReturnType<typeof timedSend>>>[] = [];
const start = performance.now();
for (let i = 0; i < N; i++) {
  const due = start + (i * 1000) / HZ;
  const wait = due - performance.now();
  if (wait > 0) await sleep(wait);
  tickResults.push(timedSend(tee, build(tickIx, keeper, i)));
  if (i % (HZ / 2) === 0) {
    const dx = (i / (HZ / 2)) % 2 === 0 ? 10 : -10;
    const mv = await program.methods.moveTo(dx, 0).accountsPartial({ probe, raidKey: raidKey.publicKey }).instruction();
    moveResults.push(timedSend(teeRaid, build(mv, raidKey, i)));
  }
}
const ticks = await Promise.all(tickResults);
const moves = await Promise.all(moveResults);
refreshing = false;
const wall = (performance.now() - start) / 1000;
await sleep(1500);
const after = await readProbe();
const slot1 = await tee.getSlot();

const landed = ticks.filter((t) => t.ok);
const lat = landed.map((t) => t.ms);
const landedAt = landed.map((t) => t.at + t.ms).sort((a, b) => a - b);
let maxGap = 0;
for (let i = 1; i < landedAt.length; i++) maxGap = Math.max(maxGap, landedAt[i] - landedAt[i - 1]);
const mvOk = moves.filter((m) => m.ok);
const errs = [...new Set(ticks.filter((t) => !t.ok).map((t) => t.err))].slice(0, 5);
const mvErrs = [...new Set(moves.filter((m) => !m.ok).map((m) => m.err))].slice(0, 5);

const summary = {
  when: new Date().toISOString(), hz: HZ, seconds: SECONDS, wallSecs: +wall.toFixed(1),
  ticksSent: N, ticksLanded: landed.length, landedPct: +((100 * landed.length) / N).toFixed(2),
  latencyMs: { p50: +pct(lat, 50).toFixed(0), p95: +pct(lat, 95).toFixed(0), p99: +pct(lat, 99).toFixed(0), max: +Math.max(...lat).toFixed(0) },
  maxGapBetweenLandedTicksMs: +maxGap.toFixed(0),
  onchainTickCallsDelta: after.tickCalls.sub(before.tickCalls).toString(),
  moves: { sent: moves.length, landed: mvOk.length, p95Ms: +pct(mvOk.map((m) => m.ms), 95).toFixed(0), onchainDelta: after.moves.sub(before.moves).toString() },
  erSlots: { delta: slot1 - slot0, msPerSlot: +((wall * 1000 + 1500) / Math.max(1, slot1 - slot0)).toFixed(2) },
  sampleTickSigs: landed.slice(0, 3).map((t) => t.sig), sampleMoveSigs: mvOk.slice(0, 3).map((m) => m.sig),
  tickErrors: errs, moveErrors: mvErrs,
};
const pass = summary.landedPct >= 95 && summary.latencyMs.p95 < 300 && mvOk.length > 0;
console.log(JSON.stringify(summary, null, 2));
console.log(pass ? "S2 PASS" : "S2 FAIL");
saveEvidence(`s2-tick-${HZ}hz`, { pass, ...summary });
