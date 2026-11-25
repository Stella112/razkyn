// M2 devnet evidence: crates placed on the TEE from the VRF seed, sealed-crate privacy, open →
// public, shoot → kill → drop crate → loot, loot conservation, ticks with hazards/fog.
// usage: tsx scripts/m2-devnet.ts
import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import { TEE_RPC, loadKeypair, saveEvidence, sendTee, sleep, baseTx } from "./spike-lib.ts";
import { RaidSession, NUM_CRATES, DROP_BASE } from "./raid-lib.ts";

const ev: Record<string, unknown> = { when: new Date().toISOString() };
const sum = (u: anchor.BN[]) => u.reduce((a, b) => a + Number(b.toString()), 0);
const t0 = Date.now();
const lap = (label: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${label}`);

const S = new RaidSession(new anchor.BN(Date.now()), 1);
await S.createRaid(2);
lap(`raid ${S.raidId.toString()} ${S.raid.toBase58()} created`);
await S.join(0, loadKeypair("playerA"));
await S.join(1, loadKeypair("playerB"));
lap("joined");
const delegated = await S.delegateAll();
lap(`delegated ${delegated.length} accounts`);
await S.connectTee();
await S.teeSetup(delegated);
ev.vrfMs = await S.seed();
lap("seeded");
await S.placeCrates();
await S.start();
lap("live");

// ---- crate layout + loot total (keeper view) ----
let total = 0;
const layout = [];
for (let i = 0; i < NUM_CRATES; i++) {
  const c = await S.crateAcc(i);
  total += sum(c.units);
  layout.push({ i, d: c.district, dormant: c.dormant, x: c.x, y: c.y });
}
ev.lootTotal = total;
ev.lootExpected = 2 * 5_500_000;

// ---- privacy before opening: B's token cannot read a sealed crate; no token neither ----
const read = async (label: string, conn: Connection, pk: PublicKey) => {
  try { const i = await conn.getAccountInfo(pk); return { label, result: i ? `data (${i.data.length} B)` : "null" }; }
  catch (e) { return { label, result: `error ${String(e).slice(0, 100)}` }; }
};
const meA = await S.rprv(0);
let best = -1, bestD = Infinity;
for (const l of layout) {
  if (l.dormant) continue;
  const d = Math.hypot(l.x - meA.x, l.y - meA.y);
  if (d < bestD) { bestD = d; best = l.i; }
}
const target = await S.crateAcc(best);
const privacy = [
  await read(`sealed crate ${best} by raider B`, S.raiders[1].tee!, S.crate(best)),
  await read(`sealed crate ${best} by raider A`, S.raiders[0].tee!, S.crate(best)),
  await read(`sealed crate ${best} without token`, new Connection(TEE_RPC), S.crate(best)),
  await read(`raider A RaiderPrivate by raider B`, S.raiders[1].tee!, S.slot("rprv", 0)),
];

// ---- A walks to the nearest active crate and opens it (2 s channel) ----
const walkA = await S.walkTo(0, target.x, target.y, 60);
lap(`A walked ${walkA} moves to crate ${best}`);
// "Too early" must be tested in one tx: a confirmed round trip from here takes ~4-5 s, longer
// than the 2 s channel. open + finish in the same tx execute in the same slot.
let early = "not tried";
try {
  await sendTee(S.raiders[0].tee!, [await S.openIx(0, best), await S.finishOpenIx(0, best)], [S.raiders[0].raidKey]);
  early = "accepted (unexpected)";
} catch (e) { early = String(e).includes("0x178c") ? "rejected 0x178c ChannelNotDone (whole tx reverted)" : String(e).slice(0, 160); }
S.sigs.openCrate = (await S.open(0, best)).sig;
await sleep(2500);
S.sigs.finishOpen = (await S.finishOpen(0, best)).sig;
const bpA = (await S.rprv(0)).backpack;
privacy.push(await read(`opened crate ${best} by raider B`, S.raiders[1].tee!, S.crate(best)));
lap("A opened crate");

// ---- B hunts A: walk within 5 tiles, 3 shots 600 ms apart ----
const posA = await S.rprv(0);
const walkB = await S.walkTo(1, posA.x, posA.y, 450);
lap(`B walked ${walkB} moves`);
const shots: string[] = [];
let cooldown = "not tried";
// Cooldown, same reasoning: two shots in one tx share a slot; the second must fail.
try {
  await sendTee(S.raiders[1].tee!, [await S.shootIx(1, 0), await S.shootIx(1, 0)], [S.raiders[1].raidKey]);
  cooldown = "accepted (unexpected)";
} catch (e) { cooldown = String(e).includes("0x178e") ? "rejected 0x178e Cooldown (whole tx reverted)" : String(e).slice(0, 160); }
for (let i = 0; i < 3; i++) shots.push((await S.shoot(1, 0)).sig); // each round trip > 500 ms
S.sigs.shots = shots;
const deadA = await S.rpub(0);
const drop = await S.crateAcc(DROP_BASE + 0);
privacy.push(await read("drop crate of A by raider B (public)", S.raiders[1].tee!, S.crate(DROP_BASE)));
lap(`A alive=${deadA.alive} hp=${deadA.hp}`);

// ---- B loots A's drop crate ----
await S.walkTo(1, drop.x, drop.y, 60);
S.sigs.openDrop = (await S.open(1, DROP_BASE)).sig;
await sleep(2500);
S.sigs.finishDrop = (await S.finishOpen(1, DROP_BASE)).sig;
const bpB = (await S.rprv(1)).backpack;

// ---- conservation: crates + backpacks == loot pool ----
let after = 0;
for (let i = 0; i < NUM_CRATES + 2; i++) after += sum((await S.crateAcc(i)).units);
after += sum((await S.rprv(0)).backpack) + sum((await S.rprv(1)).backpack);

// ---- a few ticks (hazard + fog pass) ----
const ticks = await S.tickIxs();
const tickSigs: string[] = [];
for (let i = 0; i < 5; i++) tickSigs.push((await sendTee(S.teeK, ticks, [S.keeper])).sig);
S.sigs.ticks = tickSigs;

Object.assign(ev, {
  raid: { id: S.raidId.toString(), pda: S.raid.toBase58() },
  crate: { idx: best, units: target.units.map(String), aBackpackAfterOpen: bpA.map(String) },
  finishBefore2s: early, secondShotInsideCooldown: cooldown,
  killed: { alive: deadA.alive, hp: deadA.hp, exposed: deadA.exposed, publishedPos: [deadA.pubX, deadA.pubY] },
  dropCrate: { units: drop.units.map(String) }, bBackpackAfterLoot: bpB.map(String), bKills: (await S.rpub(1)).kills,
  conservation: { before: total, after, ok: total === after && total === 11_000_000 },
  privacy, walks: { a: walkA, b: walkB }, tickNo: (await S.readRaid()).tickNo.toString(),
  sigs: S.sigs, baseExplorer: { createRaid: baseTx(S.sigs.createRaid as string), join0: baseTx(S.sigs.join_0 as string) },
});
console.table(privacy);
console.log(JSON.stringify({ ...ev, sigs: undefined, privacy: undefined }, null, 2));
saveEvidence("m2-devnet", ev);
