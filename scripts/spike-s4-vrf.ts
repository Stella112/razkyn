// S4 — VRF on the TEE (CLAUDE.md §10): `request_vrf` sent to the TEE with
// DEFAULT_EPHEMERAL_QUEUE from a TEE-delegated Probe; the #[vrf_callback] must land.
// Pass = callback within 5 s. Runs ROUNDS requests sequentially and times each.
// Prereq: probe <id> delegated (tsx scripts/spike-setup.ts --id 2).
// Queue + program ids: vendor/ephemeral-rollups-sdk/rust/vrf-sdk/src/consts.rs
import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, SYSVAR_SLOT_HASHES_PUBKEY } from "@solana/web3.js";
import { loadKeypair, teeConn, spikeProgram, pdas, sendTee, saveEvidence, sleep, waitVisible } from "./spike-lib.ts";

const DEFAULT_EPHEMERAL_QUEUE = new PublicKey("5hBR571xnXppuCPveTrctfTU7tJLSN94nq7kv7FRK5Tc");
const VRF_PROGRAM_ID = new PublicKey("Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz");
const id = new anchor.BN(process.argv[2] ?? "2");
const ROUNDS = Number(process.env.ROUNDS ?? 5);

const keeper = loadKeypair("keeper");
const tee = await teeConn(keeper);
const program = spikeProgram(tee, keeper);
const { probe } = pdas(program.programId, id);
const programIdentity = PublicKey.findProgramAddressSync([Buffer.from("identity")], program.programId)[0];
await waitVisible(tee, probe);

type ProbeAcc = { vrfFulfilled: anchor.BN; pendingVrf: boolean; rnd: number[] };
const read = async () => (await program.account.probe.fetch(probe)) as unknown as ProbeAcc;

const rounds = [];
for (let r = 0; r < ROUNDS; r++) {
  const before = await read();
  if (before.pendingVrf) { rounds.push({ round: r, skipped: "a request is still pending from an earlier run" }); break; }
  const ix = await program.methods
    .requestVrf(r + 1)
    .accountsPartial({
      payer: keeper.publicKey, probe, authority: keeper.publicKey, oracleQueue: DEFAULT_EPHEMERAL_QUEUE,
      programIdentity, vrfProgram: VRF_PROGRAM_ID, slotHashes: SYSVAR_SLOT_HASHES_PUBKEY, systemProgram: SystemProgram.programId,
    })
    .instruction();
  const t0 = performance.now();
  let requestSig = "";
  try {
    requestSig = (await sendTee(tee, [ix], [keeper])).sig;
  } catch (e) {
    rounds.push({ round: r, requestOk: false, error: String(e).slice(0, 600) });
    break;
  }
  let fulfilledMs: number | null = null;
  let rnd = "";
  while (performance.now() - t0 < 15_000) {
    const now = await read();
    if (now.vrfFulfilled.gt(before.vrfFulfilled)) {
      fulfilledMs = performance.now() - t0;
      rnd = Buffer.from(now.rnd).toString("hex");
      break;
    }
    await sleep(100);
  }
  // Find the callback tx on the TEE (logs contain "vrf fulfilled").
  let callbackSig: string | null = null;
  if (fulfilledMs !== null) {
    const sigs = await tee.getSignaturesForAddress(probe, { limit: 10 });
    for (const s of sigs) {
      const t = await tee.getTransaction(s.signature, { maxSupportedTransactionVersion: 0 });
      if (t?.meta?.logMessages?.some((l) => l.includes("vrf fulfilled"))) { callbackSig = s.signature; break; }
    }
  }
  rounds.push({ round: r, requestOk: true, requestSig, callbackSig, fulfilledMs: fulfilledMs && Math.round(fulfilledMs), randomness: rnd });
  console.log(JSON.stringify(rounds[rounds.length - 1]));
}
const times = rounds.map((x) => (x as { fulfilledMs?: number | null }).fulfilledMs).filter((x): x is number => typeof x === "number");
const pass = times.length === ROUNDS && times.every((t) => t <= 5000);
console.log(pass ? "S4 PASS" : "S4 FAIL");
saveEvidence("s4-vrf", { when: new Date().toISOString(), pass, queue: DEFAULT_EPHEMERAL_QUEUE.toBase58(), rounds, maxMs: times.length ? Math.max(...times) : null });
