// Simulated check of BOT hazard avoidance (keeper/src/bots.ts), no network.
// A fake RaidSession moves the BOT along straight lines (like walkTo) and counts every 25-unit
// sample that lands on a program hazard tile (constants.rs: level 1 rows 16-23, level 2 rows 12-27,
// inside the falling district's x range). Scenarios cover crossing, escaping, staging and exits.
//   tsx scripts/check-bot-hazard-sim.ts
import assert from "node:assert/strict";
import * as anchor from "@coral-xyz/anchor";
import { BotCrew, EXITS } from "../keeper/src/bots.ts";

const DX: [number, number][] = [[0, 20], [22, 42], [44, 63]];
const ROWS: Record<number, [number, number]> = { 1: [16, 23], 2: [12, 27] };

class FakeSession {
  pos = { x: 0, y: 0 };
  hazardSamples = 0;
  samples = 0;
  path: [number, number][] = [];
  constructor(public levels: number[], public bps: number[], public hp = 100, public raidState: Record<string, unknown> = {}) {}
  onHazard(x: number, y: number) {
    const tx = Math.floor(x / 100), ty = Math.floor(y / 100);
    const d = DX.findIndex(([lo, hi]) => tx >= lo && tx <= hi);
    const r = d >= 0 ? ROWS[this.levels[d]] : undefined;
    return !!r && ty >= r[0] && ty <= r[1];
  }
  async rprv() { return { x: this.pos.x, y: this.pos.y, backpack: [new anchor.BN(1), new anchor.BN(0), new anchor.BN(0)] }; }
  async rpub() { return { hp: this.hp, alive: true }; }
  async districtAcc(i: number) {
    return { startPrice: new anchor.BN(1_000_000), currentPrice: new anchor.BN(1_000_000 + this.bps[i] * 100), hazardLevel: this.levels[i], awake: false };
  }
  // Worst case for the real walkTo: it stops as soon as it is within `within` of the target,
  // so the fake stops at that distance along the approach (this is how BOTs ended up on a band margin).
  async walkTo(_slot: number, tx: number, ty: number, within = 0) {
    const d0 = Math.hypot(tx - this.pos.x, ty - this.pos.y);
    const k = d0 > 0 ? Math.max(0, d0 - Math.max(0, within - 1)) / d0 : 0;
    const x = this.pos.x + (tx - this.pos.x) * k, y = this.pos.y + (ty - this.pos.y) * k;
    const n = Math.max(1, Math.ceil(Math.hypot(x - this.pos.x, y - this.pos.y) / 25));
    for (let i = 1; i <= n; i++) {
      const px = this.pos.x + ((x - this.pos.x) * i) / n, py = this.pos.y + ((y - this.pos.y) * i) / n;
      this.samples++;
      if (this.onHazard(px, py)) this.hazardSamples++;
    }
    this.pos = { x, y };
    this.path.push([x, y]);
    return n;
  }
  async readRaid() { return this.raidState; }
  // Streamed moves (BotCrew.walkPath): moveTo builds a fake ix, sendFast applies it.
  trail: [number, number][] = [];
  raid = "raid";
  raiders = [{ raidKey: { publicKey: "k" } }];
  slot() { return "acc"; }
  T = { methods: { moveTo: (_s: number, dx: number, dy: number) => ({ accountsPartial: () => ({ instruction: async () => ({ dx, dy }) }) }) } };
  rejectEvery = 0; // simulate dropped/rejected moves (relative moves then drift)
  sent = 0;
  async sendFast(_slot: number, ix: { dx: number; dy: number }) {
    if (this.rejectEvery && ++this.sent % this.rejectEvery === 0) return "rejected";
    for (let i = 1; i <= 2; i++) {
      this.samples++;
      if (this.onHazard(this.pos.x + (ix.dx * i) / 2, this.pos.y + (ix.dy * i) / 2)) this.hazardSamples++;
    }
    this.pos = { x: this.pos.x + ix.dx, y: this.pos.y + ix.dy };
    this.trail.push([this.pos.x, this.pos.y]);
    return "sig";
  }
}

function crew(fake: FakeSession) {
  const c = new BotCrew(fake as unknown as ConstructorParameters<typeof BotCrew>[0], [0], () => 100, 7);
  return c as unknown as { safeWalk: (s: number, x: number, y: number, w: number, i?: number, allow?: boolean) => Promise<boolean>; events: { kind: string }[] };
}

const results: string[] = [];
// 1. Cross the map from Tower (5,5) to Harbor (55,35) with Factory at level 2: no hazard sample.
{
  const f = new FakeSession([0, 2, 0], [0, -600, 0]); f.pos = { x: 550, y: 550 };
  const ok = await crew(f).safeWalk(0, 5550, 3550, 60, 1);
  assert.ok(ok); assert.equal(f.hazardSamples, 0, "crossing touched hazard");
  const straight = new FakeSession([0, 2, 0], [0, -600, 0]); straight.pos = { x: 550, y: 550 }; await straight.walkTo(0, 5550, 3550);
  results.push(`cross: ${f.trail.length} streamed moves, 0 hazard samples (straight line: ${straight.hazardSamples})`);
}
// 2. Standing on Factory hazard tiles when it activates: escapes vertically first.
{
  const f = new FakeSession([0, 2, 0], [0, -600, 0]); f.pos = { x: 3250, y: 2050 };
  const c = crew(f);
  await c.safeWalk(0, 3250, 500, 60, 1);
  assert.ok(c.events.some((e) => e.kind === "hazard_escape"));
  assert.ok(f.hazardSamples <= 40, `escape too long: ${f.hazardSamples}`); // 10 tiles out of the band at most
  results.push(`escape: out of the band in ${f.hazardSamples} samples (~${(f.hazardSamples * 25) / 100} tiles)`);
}
// 3. Target on hazard tiles: refused (caller picks another crate/terminal).
{
  const f = new FakeSession([2, 0, 0], [-600, 0, 0]); f.pos = { x: 3250, y: 500 };
  assert.equal(await crew(f).safeWalk(0, 1050, 2050, 60, 1), false);
  assert.equal(f.hazardSamples, 0);
  results.push("target in band: refused, 0 hazard samples");
}
// 4. Near the trigger (−1.6%, level 0): treated as dangerous too (margin before it can escalate).
{
  const f = new FakeSession([0, 0, 0], [0, -160, 0]); f.pos = { x: 2350, y: 500 };
  const ok = await crew(f).safeWalk(0, 4150, 3500, 60, 1);
  assert.ok(ok);
  f.levels = [0, 2, 0]; // what if it had flipped to level 2 meanwhile: replay the same path
  const g = new FakeSession([0, 2, 0], [0, -160, 0]); g.pos = { x: 2350, y: 500 };
  for (const [x, y] of f.trail) await g.walkTo(0, x, y);
  assert.equal(g.hazardSamples, 0, "near-trigger path would cross the band");
  results.push(`near trigger: path avoids the band (0 samples if it escalates mid-walk)`);
}
// 6. Escape then route: no second escape (the margin-row loop seen on devnet).
{
  const f = new FakeSession([2, 2, 2], [-600, -600, -600]); f.pos = { x: 1948, y: 1600 };
  const c = crew(f);
  for (let i = 0; i < 3; i++) await c.safeWalk(0, 3250, 950, 30, 1);
  const esc = c.events.filter((e) => e.kind === "hazard_escape").length;
  assert.equal(esc, 1, `escaped ${esc} times`);
  results.push(`escape then route: 1 escape, then ${f.trail.length} streamed moves, no repeat`);
}
// 7. Drift: every 4th move rejected while crossing a dangerous district through the corridor.
{
  const f = new FakeSession([2, 0, 0], [-600, 0, 0]); f.pos = { x: 1050, y: 3500 }; f.rejectEvery = 4;
  // Target (13, 5): tile (10, 5) is cover since DECISIONS #42, and no crate can sit on cover.
  const ok = await crew(f).safeWalk(0, 1350, 500, 60, 1);
  assert.ok(ok, "did not arrive with drift");
  assert.equal(f.hazardSamples, 0, `drift put the BOT on hazard tiles (${f.hazardSamples} samples)`);
  results.push(`drift (25% moves rejected): arrived through the corridor, 0 hazard samples`);
}
// 5. Exits: side exits sit on hazard rows; a band exit is entered only from a safe row, at full speed.
{
  const f = new FakeSession([2, 0, 0], [-600, 0, 0]); f.pos = { x: 3250, y: 1050 };
  const ok = await crew(f).safeWalk(0, EXITS[0][0], EXITS[0][1], 60, 110, true);
  assert.ok(ok);
  const inside = f.hazardSamples * 25 / 100;
  assert.ok(inside <= 11, `band exit walk too long in hazard: ${inside} tiles`);
  results.push(`band exit (Tower, level 2): ${inside} tiles on hazard tiles before standing (~${(inside / 4.5).toFixed(1)} s at pipelined speed)`);
}
for (const r of results) console.log(r);
console.log("BOT hazard avoidance simulation OK");
