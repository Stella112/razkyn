// S6 (optional) — crank on the TEE (CLAUDE.md §10): `ScheduleCrankCpi` (1.x ScheduleTask)
// running `crank_tick` every 100 ms. Pass = fires repeatedly.
// Prereq: probe <id> delegated (tsx scripts/spike-setup.ts --id 2).
import * as anchor from "@coral-xyz/anchor";
import { MAGIC_PROGRAM_ID } from "@magicblock-labs/ephemeral-rollups-sdk";
import { loadKeypair, teeConn, spikeProgram, pdas, sendTee, saveEvidence, sleep, waitVisible } from "./spike-lib.ts";

const id = new anchor.BN(process.argv[2] ?? "2");
const INTERVAL_MS = 100;
const ITERATIONS = 100;
const WATCH_MS = 20_000;

const keeper = loadKeypair("keeper");
const tee = await teeConn(keeper);
const program = spikeProgram(tee, keeper);
const { probe } = pdas(program.programId, id);
await waitVisible(tee, probe);
type ProbeAcc = { crankTicks: anchor.BN; lastCrankSlot: anchor.BN };
const read = async () => (await program.account.probe.fetch(probe)) as unknown as ProbeAcc;

// Task ids are validator-global on 1.x: derive a collision-resistant one.
const taskId = new anchor.BN(Date.now()).mul(new anchor.BN(1000)).add(new anchor.BN(id.toNumber() % 1000));
const before = await read();
const ix = await program.methods
  .scheduleCrank(taskId, new anchor.BN(INTERVAL_MS), new anchor.BN(ITERATIONS))
  .accountsPartial({ magicProgram: MAGIC_PROGRAM_ID, payer: keeper.publicKey, probe, program: program.programId })
  .instruction();
const sched = await sendTee(tee, [ix], [keeper]);
console.log("schedule_crank (TEE):", sched.sig);

const samples: { tMs: number; crankTicks: string }[] = [];
const t0 = performance.now();
while (performance.now() - t0 < WATCH_MS) {
  const p = await read();
  samples.push({ tMs: Math.round(performance.now() - t0), crankTicks: p.crankTicks.sub(before.crankTicks).toString() });
  await sleep(1000);
}
const fired = Number(samples[samples.length - 1].crankTicks);
const pass = fired >= 2;
const result = {
  when: new Date().toISOString(), pass, taskId: taskId.toString(), intervalMs: INTERVAL_MS, iterations: ITERATIONS,
  teeScheduleSig: sched.sig, firedInWindow: fired, watchMs: WATCH_MS,
  observedRatePerSec: +(fired / (WATCH_MS / 1000)).toFixed(2), samples,
};
console.log(JSON.stringify(result, null, 2));
console.log(pass ? "S6 PASS" : "S6 FAIL");
saveEvidence("s6-crank", result);
