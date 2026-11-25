// M4 devnet evidence: settlement on devnet + devnet-tee, and §9 test 11.
//   R1: loot → exit window 1 → both raiders extract (raid ends early) → end_raid → commit +
//       finalize_raid Magic Action → settled via 1 → claims sum to escrow.
//   R2: same, but TestFlags.fail_finalize is set during its end_raid → the action fails → the
//       committor commits without it → after 120 s settle_stuck_raid → settled via 2 → claims;
//       a second claim never pays.
// usage: tsx scripts/m4-devnet.ts
import * as anchor from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { GetCommitmentSignature } from "@magicblock-labs/ephemeral-rollups-sdk";
import { baseTx, saveEvidence, sleep } from "./spike-lib.ts";
import { RaidSession, NUM_CRATES, DUSD, TOKEN, setTestFlags } from "./raid-lib.ts";

const t0 = Date.now();
const lap = (s: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${s}`);
const err = (e: unknown) => String(e).match(/custom program error: (0x[0-9a-f]+)/)?.[1] ?? String(e).slice(0, 140);
const EXITS = [[1, 20], [32, 1], [32, 38], [62, 20]].map(([x, y]) => [x * 100 + 50, y * 100 + 50]);
const bal = async (S: RaidSession, owner: PublicKey, pdaOwner = false) =>
  Number((await S.base.getTokenAccountBalance(getAssociatedTokenAddressSync(DUSD, owner, pdaOwner, TOKEN)).catch(() => ({ value: { amount: "0" } }))).value.amount);

async function setup(label: string) {
  const S = new RaidSession(new anchor.BN(Date.now()), 1);
  await S.createRaid(2);
  await S.join(0, Keypair.generate());
  await S.join(1, Keypair.generate());
  const d = await S.delegateAll();
  await S.connectTee();
  await S.teeSetup(d);
  await S.seed();
  await S.placeCrates();
  lap(`${label} ready: ${S.raid.toBase58()}`);
  return S;
}

// Set both raids up first (≈2.5 min each), then start them back to back: a raid lasts 300 s.
const R1 = await setup("R1");
const R2 = await setup("R2");
await R1.start();
await R2.start();
lap("both live");
const raids = [R1, R2];

// Keeper ticks both raids ~1/s in the background (exit windows open from tick).
let ticking = true;
const tickers = await Promise.all(raids.map((S) => S.tickIxs()));
(async () => {
  while (ticking) {
    await Promise.all(raids.map((S, i) => S.keeperFast(tickers[i]).catch(() => null)));
    await sleep(900);
  }
})();

// Loot one crate in each raid (slot 0), using the public positions.
for (const S of raids) {
  const raid = (await S.T.account.raid.fetch(S.raid)) as unknown as { cratePos: { x: number; y: number }[] };
  const me = await S.rprv(0);
  let best = 0, bd = Infinity;
  for (let i = 0; i < NUM_CRATES; i++) {
    if (i % 12 >= 8) continue;
    const d = Math.hypot(raid.cratePos[i].x - me.x, raid.cratePos[i].y - me.y);
    if (d < bd) { bd = d; best = i; }
  }
  await S.walkTo(0, raid.cratePos[best].x, raid.cratePos[best].y, 60);
  await S.open(0, best);
  await sleep(2500);
  await S.finishOpen(0, best);
}
lap("looted");

// Exits: a window lasts 30 s, so raiders wait at the map centre, then walk concurrently to the
// nearest open exit and extract together. Both raids run in parallel. If they cannot make it,
// the raid simply ends at 300 s (end_raid by time).
const CENTER = [3250, 2050];
const extractSigs: Record<string, unknown> = {};
async function extractRaid(k: number, S: RaidSession) {
  await Promise.all([0, 1].map((s) => S.walkTo(s, CENTER[0], CENTER[1], 60)));
  const log: string[] = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    let r = (await S.readRaid()) as unknown as { exitWindow: number; openExits: number[]; status: number };
    while (r.exitWindow === 0 && r.status === 2) { await sleep(1000); r = (await S.readRaid()) as never; }
    if (r.status !== 2) break;
    const exit = [...r.openExits].sort((a, b) =>
      Math.hypot(EXITS[a][0] - CENTER[0], EXITS[a][1] - CENTER[1]) - Math.hypot(EXITS[b][0] - CENTER[0], EXITS[b][1] - CENTER[1]))[0];
    try {
      await Promise.all([0, 1].map((s) => S.walkTo(s, EXITS[exit][0], EXITS[exit][1], 60)));
      const starts = await Promise.all([0, 1].map((s) => S.startExtract(s, exit)));
      await sleep(5500);
      const fins = await Promise.all([0, 1].map((s) => S.finishExtract(s)));
      log.push(...starts.map((x) => x.sig), ...fins.map((x) => x.sig));
      extractSigs[`R${k + 1}`] = { exit, window: r.exitWindow, sigs: log };
      return;
    } catch (e) {
      log.push(`window ${r.exitWindow} exit ${exit}: ${err(e)}`);
      await Promise.all([0, 1].map((s) => S.walkTo(s, CENTER[0], CENTER[1], 60).catch(() => null)));
      // wait for this window to close before trying the next one
      while (((await S.readRaid()) as unknown as { exitWindow: number }).exitWindow === r.exitWindow) await sleep(1000);
    }
  }
  extractSigs[`R${k + 1}`] = { extracted: false, attempts: log };
}
await Promise.all(raids.map((S, k) => extractRaid(k, S)));
lap(`extraction done: ${JSON.stringify(Object.fromEntries(Object.entries(extractSigs).map(([k, v]) => [k, (v as { exit?: number }).exit ?? "none"])))}`);
// Raids where not everyone extracted end by time (300 s).
for (const S of raids) {
  for (;;) {
    const r = (await S.readRaid()) as unknown as { status: number; startTs: anchor.BN };
    const all = (await Promise.all([0, 1].map((s) => S.rpub(s)))).every((u) => u.extracted || !u.alive);
    if (all || r.status === 3 || Date.now() / 1000 > Number(r.startTs.toString()) + 302) break;
    await sleep(3000);
  }
}
ticking = false;
lap("raids over");

// ---- R1: normal settlement through the post-commit action ----
const escrow1 = await bal(R1, R1.escrowAuth, true);
const tre0 = await bal(R1, R1.keeper.publicKey);
const end1 = await R1.endRaid();
lap("R1 end_raid sent");
let commit1 = "";
try { commit1 = await GetCommitmentSignature(end1, R1.teeK); } catch (e) { commit1 = `err ${err(e)}`; }
let s1 = await R1.readSettlement();
for (let i = 0; i < 40 && !s1.settled; i++) { await sleep(1500); s1 = await R1.readSettlement(); }
const res1 = await R1.readResultsBase();
const raid1Owner = (await R1.base.getAccountInfo(R1.raid))?.owner.toBase58();
lap(`R1 settled=${s1.settled} via=${s1.settledVia}`);

// ---- R2: force finalize_raid to fail → recover with settle_stuck_raid ----
const flagOn = await setTestFlags(true);
const end2 = await R2.endRaid();
let commit2 = "";
try { commit2 = await GetCommitmentSignature(end2, R2.teeK); } catch (e) { commit2 = `err ${err(e)}`; }
await sleep(30_000);
const s2before = await R2.readSettlement();
const res2 = await R2.readResultsBase();
const raid2Owner = (await R2.base.getAccountInfo(R2.raid))?.owner.toBase58();
const flagOff = await setTestFlags(false);
lap(`R2 after forced failure: settled=${s2before.settled}, results owner=${res2?.owner}, raid owner=${raid2Owner}`);
let early = "not tried";
try { await R2.settleStuck(R2.keeper); early = "accepted (unexpected)"; } catch (e) { early = err(e); }
await sleep(95_000); // ended_ts + 120 s
const stuckSig = await R2.settleStuck(R2.keeper);
const s2 = await R2.readSettlement();
lap(`R2 settled=${s2.settled} via=${s2.settledVia}`);

// ---- Claims (keeper as permissionless claimer) ----
const claimed: Record<string, unknown> = {};
for (const [k, S] of raids.entries()) {
  const r = (await S.readResultsBase())!.data;
  const rows = [];
  for (const s of [0, 1]) {
    const sig = await S.claim(s, S.keeper);
    const got = await bal(S, S.raiders[s].wallet.publicKey);
    rows.push({ slot: s, sig, dusd: got, expected: Number(r.raiders[s].dusdPayout.toString()), mintUnits: r.raiders[s].mintUnits.map(String) });
  }
  let second = "not tried";
  try { await S.claim(0, S.keeper); second = "accepted (unexpected)"; } catch (e) { second = String(e).includes("already in use") ? "rejected: claim record already exists" : err(e); }
  claimed[`R${k + 1}`] = {
    rows, secondClaim: second,
    escrowAfter: await bal(S, S.escrowAuth, true),
    reserve: await bal(S, S.reserveAuth, true),
    results: { stakes: r.stakesTotal.toString(), ops: r.ops.toString(), reserve: r.reserveTotal.toString(), dusd: r.dusdTotal.toString(), scaled: r.scaled, prices: r.finalPrices.map(String) },
  };
}
const tre1 = await bal(R1, R1.keeper.publicKey);

const ev = {
  when: new Date().toISOString(),
  R1: {
    raid: R1.raid.toBase58(), escrowBefore: escrow1, endRaidTee: end1, baseCommit: commit1, baseCommitExplorer: commit1.startsWith("err") ? null : baseTx(commit1),
    settled: s1.settled, settledVia: s1.settledVia, resultsOwner: res1?.owner, raidOwnerOnBase: raid1Owner, extract: extractSigs.R1,
  },
  R2_test11: {
    raid: R2.raid.toBase58(), testFlagOn: flagOn, testFlagOff: flagOff, endRaidTee: end2, baseCommit: commit2,
    afterForcedFailure: { settled: s2before.settled, resultsOwner: res2?.owner, raidOwnerOnBase: raid2Owner },
    settleStuckBefore120s: early, settleStuckSig: stuckSig, settleStuckExplorer: baseTx(stuckSig), settled: s2.settled, settledVia: s2.settledVia, extract: extractSigs.R2,
  },
  claims: claimed, opsTreasuryDelta: tre1 - tre0,
};
console.log(JSON.stringify(ev, null, 2));
saveEvidence("m4-devnet", ev);
