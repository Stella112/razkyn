// M3 devnet evidence.
// Mystery: VRF picks the leaf → keeper loads the slice → a wrong slice is rejected → the right
// one verifies → raid starts → ticks apply slice steps (checked step by step) → spoiler check
// on public accounts → a trade under exposure.
// Live: a second raid whose ticks read the Pricing Oracle feeds on the TEE.
// usage: tsx scripts/m3-devnet.ts
import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { REPO, TEE_RPC, loadKeypair, saveEvidence, sleep, teeConn } from "./spike-lib.ts";
import { RaidSession, NUM_CRATES } from "./raid-lib.ts";

const ev: Record<string, unknown> = { when: new Date().toISOString() };
const t0 = Date.now();
const lap = (s: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${s}`);
const merkle = JSON.parse(readFileSync(join(REPO, "data", "mystery", "merkle.json"), "utf8"));
const days = JSON.parse(readFileSync(join(REPO, "data", "mystery", "private", "days.json"), "utf8"));
const sliceOf = (day: string) => JSON.parse(readFileSync(join(REPO, "data", "mystery", "private", "slices", `${day}.json`), "utf8")).steps as number[];
const err = (e: unknown) => String(e).match(/custom program error: (0x[0-9a-f]+)/)?.[1] ?? String(e).slice(0, 120);

// ================= Mystery =================
const S = new RaidSession(new anchor.BN(Date.now()), 0, merkle.leafCount, Array.from(Buffer.from(merkle.root, "hex")));
await S.createRaid(2);
await S.join(0, Keypair.generate()); // fresh test wallets: the 100 dUSD/day faucet cap applies per wallet
await S.join(1, Keypair.generate());
const delegated = await S.delegateAll();
await S.connectTee();
await S.teeSetup(delegated);
await S.seed();
await S.placeCrates();
const idx = await S.leafIndex();
const day = days[idx];
lap(`mystery raid ${S.raid.toBase58()} seeded; VRF leaf index ${idx} of ${merkle.leafCount}`);

let startBeforeVerify = "not tried";
try { await S.start(); startBeforeVerify = "accepted (unexpected)"; } catch (e) { startBeforeVerify = err(e); }
const wrong = days[(idx + 1) % days.length];
let wrongLeaf = "not tried";
try { await S.loadAndVerify(wrong, sliceOf(wrong.day)); wrongLeaf = "accepted (unexpected)"; } catch (e) { wrongLeaf = err(e); }
await S.loadAndVerify(day, sliceOf(day.day));
await S.start();
lap("verified + live");

// Ticks ~4/s for 25 s; then compare each district to the slice at the current step.
const steps = sliceOf(day.day);
const ticks = await S.tickIxs();
const tickSigs: string[] = [];
const tEnd = Date.now() + 25_000;
while (Date.now() < tEnd) {
  tickSigs.push(await S.keeperFast(ticks).catch((e) => `err ${err(e)}`));
  await sleep(250);
}
await sleep(1000);
const raidAcc = await S.T.account.raid.fetch(S.raid) as unknown as { marketStep: number; tickNo: anchor.BN };
const step = raidAcc.marketStep;
const prices = [];
for (let i = 0; i < 3; i++) {
  const d = await S.districtAcc(i);
  prices.push({ district: i, start: d.startPrice.toString(), current: d.currentPrice.toString(), sliceAtStep: steps[step * 3 + i], match: Number(d.currentPrice.toString()) === steps[step * 3 + i], hazard: d.hazardLevel, awake: d.awake, histLen: d.histLen });
}
lap(`step ${step}, tick ${raidAcc.tickNo.toString()}`);

// Spoiler check: what a stranger can read holds no date, slice start or ticker.
const stranger = await teeConn(Keypair.generate());
const noToken = new Connection(TEE_RPC, "confirmed");
const pub = [S.raid, S.district(0), S.district(1), S.district(2), S.slot("rpub", 0), S.slot("rpub", 1)];
let leaked = 0, readable = 0;
for (const pk of pub) {
  const info = await stranger.getAccountInfo(pk);
  if (!info) continue;
  readable++;
  const ascii = info.data.toString("latin1");
  for (const needle of [day.day, "SOL", "BTC", "ETH", "USDT"]) if (ascii.includes(needle)) leaked++;
}
const secretByStranger = await stranger.getAccountInfo(S.secret);
const secretNoToken = await noToken.getAccountInfo(S.secret);

// Trade under exposure: A opens the nearest active crate, walks to a terminal, trades.
const TERMINALS = [[5, 12], [15, 28], [27, 12], [37, 28], [49, 12], [59, 28]].map(([x, y]) => [x * 100 + 50, y * 100 + 50]);
const me = await S.rprv(0);
let best = 0, bestD = Infinity;
const raidPub = await S.T.account.raid.fetch(S.raid) as unknown as { cratePos: { x: number; y: number }[] };
for (let i = 0; i < NUM_CRATES; i++) {
  if (i % 12 >= 8) continue; // dormant
  const d = Math.hypot(raidPub.cratePos[i].x - me.x, raidPub.cratePos[i].y - me.y);
  if (d < bestD) { bestD = d; best = i; }
}
await S.walkTo(0, raidPub.cratePos[best].x, raidPub.cratePos[best].y, 60); // public positions (DECISIONS #16)
S.sigs.openCrate = (await S.open(0, best)).sig;
await sleep(2500);
S.sigs.finishOpen = (await S.finishOpen(0, best)).sig;
const from = Math.floor(best / 12), to = (from + 1) % 3;
const bp = (await S.rprv(0)).backpack.map((b) => b.toString());
const units = new anchor.BN(bp[from]);
const here = await S.rprv(0);
const term = TERMINALS.reduce((a, b) => (Math.hypot(a[0] - here.x, a[1] - here.y) < Math.hypot(b[0] - here.x, b[1] - here.y) ? a : b));
await S.walkTo(0, term[0], term[1], 60);
const startIx = await S.T.methods.startTrade(0, from, to, units).accountsPartial({ raid: S.raid, rprv: S.slot("rprv", 0), rpub: S.slot("rpub", 0), raidKey: S.raiders[0].raidKey.publicKey }).instruction();
S.sigs.startTrade = (await S.asRaider(0, startIx)).sig;
const seenByB = await S.raiders[1].tee!.getAccountInfo(S.slot("rpub", 0));
const exposedView = S.T.coder.accounts.decode("raiderPublic", seenByB!.data) as { exposed: boolean; pubX: number; pubY: number };
await sleep(3500);
const finishIx = await S.T.methods.finishTrade(0).accountsPartial({
  raid: S.raid, rprv: S.slot("rprv", 0), rpub: S.slot("rpub", 0), district0: S.district(0), district1: S.district(1), district2: S.district(2),
  raidKey: S.raiders[0].raidKey.publicKey,
}).instruction();
S.sigs.finishTrade = (await S.asRaider(0, finishIx)).sig;
const bpAfter = (await S.rprv(0)).backpack.map((b) => b.toString());
lap("trade done");

Object.assign(ev, {
  mystery: {
    raid: S.raid.toBase58(), leafIndex: idx, leafCount: merkle.leafCount, root: merkle.root,
    startBeforeVerify, wrongLeafVerify: wrongLeaf,
    step, tickNo: raidAcc.tickNo.toString(), ticksSent: tickSigs.length, prices,
    spoiler: { publicAccountsReadByStranger: readable, datesOrTickersFound: leaked, secretByStranger: secretByStranger ? "data" : "null", secretNoToken: secretNoToken ? "data" : "null" },
    trade: { crate: best, from, to, units: units.toString(), backpackBefore: bp, backpackAfter: bpAfter, exposedSeenByB: exposedView.exposed, publicPos: [exposedView.pubX, exposedView.pubY], terminal: term },
    sigs: S.sigs,
  },
});

saveEvidence("m3-devnet", ev); // Mystery part saved before the Live raid

// ================= Live =================
const L = new RaidSession(new anchor.BN(Date.now()), 1);
await L.createRaid(2);
await L.join(0, Keypair.generate());
await L.join(1, Keypair.generate());
const ldel = await L.delegateAll();
await L.connectTee();
await L.teeSetup(ldel);
await L.seed();
await L.placeCrates();
await L.start();
const lticks = await L.tickIxs();
const liveSamples = [];
for (let s = 0; s < 12; s++) {
  await L.keeperFast(lticks).catch(() => null);
  await sleep(1000);
  const ds = await Promise.all([0, 1, 2].map((i) => L.districtAcc(i)));
  liveSamples.push(ds.map((d) => `${d.currentPrice.toString()} (raw0 ${d.startRaw.toString()})`));
}
lap("live done");
ev.live = { raid: L.raid.toBase58(), samples: liveSamples, sigs: { startRaid: L.sigs.startRaid } };
console.log(JSON.stringify({ ...ev, mystery: { ...(ev.mystery as object), sigs: undefined } }, null, 2));
saveEvidence("m3-devnet", ev);
void PublicKey;
