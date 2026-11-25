// M4 devnet proof of extraction → settlement → minted assets: one raid; raider 0 loots a
// crate, waits at the centre, walks (pipelined, ~4.5 tiles/s) to the nearest open exit and
// extracts; the raid ends at 300 s; end_raid → finalize action; claims mint slot 0's backpack
// as dTWR/dFAC/dHRB. Every step is timestamped on the raid's own clock.
// usage: tsx scripts/m4-extract-devnet.ts
import * as anchor from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { saveEvidence, sleep } from "./spike-lib.ts";
import { RaidSession, NUM_CRATES, TOKEN, cfg } from "./raid-lib.ts";

const EXITS = [[1, 20], [32, 1], [32, 38], [62, 20]].map(([x, y]) => [x * 100 + 50, y * 100 + 50]);
const CENTER = [3250, 2050];
const S = new RaidSession(new anchor.BN(Date.now()), 1);
await S.createRaid(2);
await S.join(0, Keypair.generate());
await S.join(1, Keypair.generate());
const d = await S.delegateAll();
await S.connectTee();
await S.teeSetup(d);
await S.seed();
await S.placeCrates();
await S.start();
const startTs = Number(((await S.readRaid()) as unknown as { startTs: anchor.BN }).startTs.toString());
const teeNow = async () => (await S.teeK.getBlockTime(await S.teeK.getSlot())) ?? 0;
const log: Record<string, unknown>[] = [];
const mark = async (event: string, extra: Record<string, unknown> = {}) => {
  const row = { event, raidT: (await teeNow()) - startTs, wall: new Date().toISOString().slice(11, 19), ...extra };
  log.push(row);
  console.log(JSON.stringify(row));
};
let ticking = true;
const ticks = await S.tickIxs();
(async () => { while (ticking) { await S.keeperFast(ticks).catch(() => null); await sleep(900); } })();

await mark("live");
// Loot the nearest active crate (public positions).
{
  const raid = (await S.T.account.raid.fetch(S.raid)) as unknown as { cratePos: { x: number; y: number }[] };
  const me = await S.rprv(0);
  let best = 0, bd = Infinity;
  for (let i = 0; i < NUM_CRATES; i++) {
    if (i % 12 >= 8) continue;
    const dd = Math.hypot(raid.cratePos[i].x - me.x, raid.cratePos[i].y - me.y);
    if (dd < bd) { bd = dd; best = i; }
  }
  await S.walkTo(0, raid.cratePos[best].x, raid.cratePos[best].y, 60);
  await S.open(0, best);
  await sleep(2500);
  await S.finishOpen(0, best);
  await mark("looted", { crate: best, backpack: (await S.rprv(0)).backpack.map(String) });
}
const t0 = Date.now();
const moves0 = await S.walkTo(0, CENTER[0], CENTER[1], 60);
await mark("at centre", { moves: moves0, secs: (Date.now() - t0) / 1000 });
let r = (await S.readRaid()) as unknown as { exitWindow: number; openExits: number[] };
while (r.exitWindow === 0) { await sleep(500); r = (await S.readRaid()) as never; }
const exit = [...r.openExits].sort((a, b) => Math.hypot(EXITS[a][0] - CENTER[0], EXITS[a][1] - CENTER[1]) - Math.hypot(EXITS[b][0] - CENTER[0], EXITS[b][1] - CENTER[1]))[0];
await mark("window seen", { window: r.exitWindow, openExits: r.openExits, chosen: exit });
const t1 = Date.now();
const moves = await S.walkTo(0, EXITS[exit][0], EXITS[exit][1], 60);
const at = await S.rprv(0);
await mark("at exit", { moves, secs: (Date.now() - t1) / 1000, pos: [at.x, at.y], exitPos: EXITS[exit], dist: Math.hypot(at.x - EXITS[exit][0], at.y - EXITS[exit][1]) });
const raidNow = (await S.readRaid()) as unknown as { exitWindow: number; openExits: number[] };
await mark("raid state before start", { exitWindow: raidNow.exitWindow, openExits: raidNow.openExits });
try { const s = await S.startExtract(0, exit); await mark("start ok", s); } catch (e) { await mark("start FAILED", { error: String(e).slice(0, 400) }); }
await sleep(5500);
try { const f = await S.finishExtract(0); await mark("finish ok", f); } catch (e) { await mark("finish FAILED", { error: String(e).slice(0, 400) }); }
const u = await S.rpub(0);
await mark("result", { extracted: u.extracted, exposed: u.exposed });

// Raid ends at 300 s (slot 1 is still inside) → end_raid → settle → claims.
for (;;) { if (((await S.readRaid()) as unknown as { status: number }).status === 3) break; await sleep(3000); }
ticking = false;
await mark("ended");
const endSig = await S.endRaid();
let st = await S.readSettlement();
for (let i = 0; i < 40 && !st.settled; i++) { await sleep(1500); st = await S.readSettlement(); }
await mark("settled", { settled: st.settled, via: st.settledVia, endRaid: endSig });
const res = (await S.readResultsBase())!.data;
const mints = [cfg.mints.twr, cfg.mints.fac, cfg.mints.hrb].map((k: string) => new PublicKey(k));
const claims = [];
for (const slot of [0, 1]) {
  const sig = await S.claim(slot, S.keeper);
  const w = S.raiders[slot].wallet.publicKey;
  const held = await Promise.all(mints.map((m) => S.base.getTokenAccountBalance(getAssociatedTokenAddressSync(m, w, false, TOKEN)).then((b) => b.value.amount).catch(() => "0")));
  claims.push({ slot, sig, expectedMintUnits: res.raiders[slot].mintUnits.map(String), assetsHeld: held, dusdPayout: res.raiders[slot].dusdPayout.toString(), extracted: res.raiders[slot].extracted });
}
await mark("claimed", { claims, reserveTotal: res.reserveTotal.toString(), dusdTotal: res.dusdTotal.toString(), ops: res.ops.toString(), finalPrices: res.finalPrices.map(String) });
saveEvidence("m4-extract-devnet", { raid: S.raid.toBase58(), log });
