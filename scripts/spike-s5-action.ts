// S5 — Magic Action (CLAUDE.md §10): commit-and-undelegate Probe with one post-commit
// #[action] `set_flag` that writes a flag on base. Run twice: fail=false (expect flag set)
// and fail=true (observe what the committor does when the action errors).
// Prereq: probes delegated, e.g. tsx scripts/spike-setup.ts --id 3 ; --id 4
// usage: tsx scripts/spike-s5-action.ts <id> <fail:true|false>
// SDK: GetCommitmentSignature, MAGIC_PROGRAM_ID, MAGIC_CONTEXT_ID, DELEGATION_PROGRAM_ID
//      (vendor/ephemeral-rollups-sdk/ts/web3js/src/{utils.ts,constants.ts})
import * as anchor from "@coral-xyz/anchor";
import {
  GetCommitmentSignature, MAGIC_PROGRAM_ID, MAGIC_CONTEXT_ID, DELEGATION_PROGRAM_ID,
} from "@magicblock-labs/ephemeral-rollups-sdk";
import {
  BASE_RPC, baseConn, baseTx, loadKeypair, teeConn, spikeProgram, pdas, sendTee, saveEvidence,
  sleep, waitVisible, routerStatus, txLogs,
} from "./spike-lib.ts";

const id = new anchor.BN(process.argv[2] ?? "3");
const fail = (process.argv[3] ?? "false") === "true";

const keeper = loadKeypair("keeper");
const tee = await teeConn(keeper);
const base = baseConn();
const program = spikeProgram(tee, keeper);
const baseProgram = spikeProgram(base, keeper);
const { probe, flag } = pdas(program.programId, id);
await waitVisible(tee, probe);

// Put some state on the ER so we can see it arrive on base.
for (let i = 0; i < 3; i++) {
  await sendTee(tee, [await program.methods.tick().accountsPartial({ probe }).instruction()], [keeper]);
}
type ProbeAcc = { tickNo: anchor.BN };
const erTickNo = ((await program.account.probe.fetch(probe)) as unknown as ProbeAcc).tickNo.toString();

const ix = await program.methods
  .commitWithAction(fail)
  .accountsPartial({
    payer: keeper.publicKey, probe, flag, programId: program.programId,
    magicContext: MAGIC_CONTEXT_ID, magicProgram: MAGIC_PROGRAM_ID,
  })
  .instruction();
const sched = await sendTee(tee, [ix], [keeper]);
console.log("commit_with_action scheduled on TEE:", sched.sig);
const schedLogs = await txLogs(tee, sched.sig);

let commitSig: string | null = null;
let commitErr: string | null = null;
try {
  commitSig = await GetCommitmentSignature(sched.sig, tee);
  await base.confirmTransaction(commitSig, "confirmed");
} catch (e) {
  commitErr = String(e).slice(0, 400);
}
console.log("base commit signature:", commitSig, commitErr ?? "");

// Base settlement txs are v1: fetch with maxSupportedTransactionVersion 1 over raw JSON-RPC.
async function baseTxRaw(sig: string) {
  const r = await fetch(BASE_RPC, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getTransaction", params: [sig, { encoding: "json", maxSupportedTransactionVersion: 1, commitment: "confirmed" }] }),
  });
  const j = (await r.json()) as { result?: { meta?: { err: unknown; logMessages?: string[] } }; error?: unknown };
  return j.result ? { err: j.result.meta?.err ?? null, logs: j.result.meta?.logMessages ?? [] } : { rpcError: j.error };
}

// Observe base for up to 90 s: probe owner back to program? flag set? any action txs on flag?
type FlagAcc = { set: boolean; count: anchor.BN; committedTickNo: anchor.BN };
let observed: Record<string, unknown> = {};
const t0 = Date.now();
while (Date.now() - t0 < 90_000) {
  const probeInfo = await base.getAccountInfo(probe);
  const f = (await baseProgram.account.flag.fetch(flag)) as unknown as FlagAcc;
  observed = {
    secsAfterSchedule: Math.round((Date.now() - t0) / 1000),
    probeOwnerOnBase: probeInfo?.owner.toBase58(),
    probeUndelegated: probeInfo?.owner.equals(program.programId) ?? false,
    probeStillDelegated: probeInfo?.owner.equals(DELEGATION_PROGRAM_ID) ?? false,
    baseTickNo: probeInfo && probeInfo.owner.equals(program.programId)
      ? (baseProgram.coder.accounts.decode("probe", probeInfo.data) as ProbeAcc).tickNo.toString() : null,
    flag: { set: f.set, count: f.count.toString(), committedTickNo: f.committedTickNo.toString() },
  };
  const done = observed.probeUndelegated && (fail || f.set);
  if (done && Date.now() - t0 > (fail ? 45_000 : 0)) break; // on fail, keep watching for retries
  await sleep(2000);
}
const flagSigs = (await base.getSignaturesForAddress(flag, { limit: 10 })).map((s) => ({ sig: s.signature, err: s.err }));
const baseCommitTx = commitSig ? await baseTxRaw(commitSig) : null;
const flagTxs = [];
for (const s of flagSigs.slice(0, 4)) flagTxs.push({ ...s, explorer: baseTx(s.sig), detail: await baseTxRaw(s.sig) });

const pass = fail ? true : (observed as { flag: { set: boolean } }).flag.set === true;
const result = {
  when: new Date().toISOString(), id: id.toString(), forcedFailure: fail, pass,
  erTickNoBeforeCommit: erTickNo, teeScheduleSig: sched.sig, scheduleLogs: schedLogs.filter((l) => /Magic|commit|intent|Scheduled/i.test(l)),
  baseCommitSig: commitSig, baseCommitExplorer: commitSig && baseTx(commitSig), commitTrackingError: commitErr,
  baseCommitTx, observed, flagTxs, routerStatus: await routerStatus(probe),
};
console.log(JSON.stringify(result, null, 2));
console.log(fail ? "S5 (forced failure) OBSERVED" : pass ? "S5 PASS" : "S5 FAIL");
saveEvidence(`s5-action-${fail ? "fail" : "ok"}`, result);
