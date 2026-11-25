// BOT raiders (CLAUDE.md §8): each uses its own raid key and sends real transactions:
// wander/loot crates, trade at random, extract at the last exit window. Labelled BOT on-chain
// (join_raid co-signed by the keeper sets RaiderPublic.is_bot) and everywhere in the UI.
import * as anchor from "@coral-xyz/anchor";
import type { TransactionInstruction } from "@solana/web3.js";
import type { RaidSession } from "../../scripts/raid-lib.ts";
import { NUM_CRATES } from "../../scripts/raid-lib.ts";
import { sleep } from "../../scripts/spike-lib.ts";

export const EXITS = [[1, 20], [32, 1], [32, 38], [62, 20]].map(([x, y]) => [x * 100 + 50, y * 100 + 50]);
export const TERMINALS = [[5, 12], [15, 28], [27, 12], [37, 28], [49, 12], [59, 28]].map(([x, y]) => [x * 100 + 50, y * 100 + 50]);
const CENTER = [3250, 2050];
const LAST_WINDOW = 270;

// Hazard avoidance (public information only: each District's hazard level and price change).
// The program hurts a raider standing on rows 16-23 (level 1) or 12-27 (level 2) of a falling
// district (constants.rs HAZARD*_ROWS); the corridors between districts (x tiles 21, 43) are safe.
// A district at level >= 1, or within 0.5% of the -2% trigger, is treated as dangerous on the wider
// rows 11-28 (level-2 rows plus a 1-row margin), because it can escalate while a BOT is there.
const DISTRICT_TILES: [number, number][] = [[0, 20], [22, 42], [44, 63]];
const DANGER_ROWS: [number, number] = [11, 28];
const DANGER_BPS = -150;
const SAFE_ROWS_Y = [1050, 2950]; // rows 10 and 29, centre of tile
const CORRIDORS_X = [2150, 4350]; // x tiles 21 and 43: between districts, never hazard tiles
const RISKY_EXIT_MIN_HP = 85; // a band exit costs ~2 s walking + 5 s standing at 10 HP/s
type Bands = ([number, number] | null)[];
const districtOfX = (x: number) => DISTRICT_TILES.findIndex(([lo, hi]) => Math.floor(x / 100) >= lo && Math.floor(x / 100) <= hi);
export function inBand(x: number, y: number, bands: Bands) {
  const d = districtOfX(x);
  const b = d >= 0 ? bands[d] : null;
  const ty = Math.floor(y / 100);
  return !!b && ty >= b[0] && ty <= b[1];
}
function segmentSafe(ax: number, ay: number, bx: number, by: number, bands: Bands) {
  const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 25));
  for (let i = 0; i <= n; i++) if (inBand(ax + ((bx - ax) * i) / n, ay + ((by - ay) * i) / n, bands)) return false;
  return true;
}

export type BotEvent = { t: number; slot: number; kind: string; detail: Record<string, unknown> };

export class BotCrew {
  readonly events: BotEvent[] = [];
  private claimed = new Set<number>();
  private seed: number;

  /** `elapsed()` returns raid seconds on the TEE clock. */
  constructor(private S: RaidSession, private slots: number[], private elapsed: () => number, seed = 1) {
    this.seed = seed;
  }

  private rnd() {
    this.seed ^= this.seed << 13; this.seed ^= this.seed >>> 17; this.seed ^= this.seed << 5;
    return ((this.seed >>> 0) % 1_000_000) / 1_000_000;
  }

  private log(slot: number, kind: string, detail: Record<string, unknown> = {}) {
    this.events.push({ t: Math.round(this.elapsed()), slot, kind, detail });
  }

  private async fast(slot: number, ix: TransactionInstruction) {
    return this.S.sendFast(slot, ix);
  }

  async run() {
    await Promise.all(this.slots.map((s) => this.runOne(s).catch((e) => this.log(s, "error", { error: String(e).slice(0, 160) }))));
  }

  /** Danger bands per district from the public District accounts. */
  private async bands(): Promise<Bands> {
    const ds = await Promise.all([0, 1, 2].map((i) => this.S.districtAcc(i)));
    return ds.map((d) => {
      const start = Number(d.startPrice.toString()) || 1_000_000;
      const bps = ((Number(d.currentPrice.toString()) - start) * 10_000) / start;
      return d.hazardLevel >= 1 || bps <= DANGER_BPS ? DANGER_ROWS : null;
    });
  }

  /**
   * Walk to (x, y) without crossing a danger band: leave a band first (straight up or down, at
   * full speed), then go straight if the line is clear, else via a safe row (10 or 29).
   * Returns false if the target itself is inside a band (caller picks another target).
   */
  private async safeWalk(slot: number, x: number, y: number, within: number, intervalMs = 250, allowTargetInBand = false): Promise<boolean> {
    const bands = await this.bands();
    let me = await this.S.rprv(slot);
    if (inBand(me.x, me.y, bands)) {
      const ty = SAFE_ROWS_Y.reduce((a, b) => (Math.abs(a - me.y) < Math.abs(b - me.y) ? a : b));
      await this.S.walkTo(slot, me.x, ty, 60, 110);
      this.log(slot, "hazard_escape", { to: [me.x, ty] });
      me = await this.S.rprv(slot);
    }
    if (inBand(x, y, bands) && !allowTargetInBand) return false;
    if (segmentSafe(me.x, me.y, x, y, bands)) { await this.S.walkTo(slot, x, y, within, intervalMs); return true; }
    // Detour: via a safe row (10 or 29), or switch rows inside a corridor between districts
    // (x tiles 21 / 43, never hazardous). For a target inside a band, the last leg goes in at full speed.
    const candidates: [number, number][][] = [];
    for (const ry of SAFE_ROWS_Y) candidates.push([[me.x, ry], [x, ry]]);
    for (const ry1 of SAFE_ROWS_Y) for (const ry2 of SAFE_ROWS_Y) for (const cx of CORRIDORS_X) candidates.push([[me.x, ry1], [cx, ry1], [cx, ry2], [x, ry2]]);
    let best: [number, number][] | null = null, bestLen = Infinity;
    for (const wps of candidates) {
      const pts: [number, number][] = [[me.x, me.y], ...wps, [x, y]];
      let ok = true, len = 0;
      for (let i = 1; i < pts.length && ok; i++) {
        len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        const last = i === pts.length - 1;
        if (!(last && allowTargetInBand) && !segmentSafe(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], bands)) ok = false;
      }
      if (ok && len < bestLen) { best = wps; bestLen = len; }
    }
    if (!best) return false;
    for (const [wx, wy] of best) await this.S.walkTo(slot, wx, wy, 60, intervalMs);
    await this.S.walkTo(slot, x, y, within, inBand(x, y, bands) ? 110 : intervalMs);
    return true;
  }

  private async state() {
    return (await this.S.readRaid()) as unknown as { status: number; exitWindow: number; openExits: number[]; cratePos: { x: number; y: number }[] };
  }

  private async runOne(slot: number) {
    for (;;) {
      const raid = await this.state();
      if (raid.status !== 2) return;
      const me = await this.S.rpub(slot);
      if (!me.alive) { this.log(slot, "dead"); return; }
      if (this.elapsed() >= LAST_WINDOW - 30) return this.extract(slot);
      const looted = await this.lootOne(slot, raid.cratePos);
      if (!looted) await this.wander(slot);
      if (looted && this.rnd() < 0.35 && this.elapsed() < LAST_WINDOW - 40) await this.trade(slot);
    }
  }

  private async lootOne(slot: number, pos: { x: number; y: number }[]) {
    const me = await this.S.rprv(slot);
    const districts = await Promise.all([0, 1, 2].map((i) => this.S.districtAcc(i)));
    const bands = await this.bands();
    let best = -1, bd = Infinity;
    for (let i = 0; i < NUM_CRATES; i++) {
      if (this.claimed.has(i)) continue;
      if (inBand(pos[i].x, pos[i].y, bands)) continue; // on (or near) hazard tiles: not now
      if (i % 12 >= 8 && !districts[Math.floor(i / 12)].awake) continue; // dormant, district asleep
      const d = Math.hypot(pos[i].x - me.x, pos[i].y - me.y);
      if (this.elapsed() > LAST_WINDOW - 70 && d > 1000) continue; // late: only crates within 10 tiles
      if (d < bd) { bd = d; best = i; }
    }
    if (best < 0) return false;
    this.claimed.add(best);
    // Opened crates are public: if we can read it, someone already opened it.
    if (await this.S.raiders[slot].tee!.getAccountInfo(this.S.crate(best))) return false;
    if (!(await this.safeWalk(slot, pos[best].x, pos[best].y, 60))) { this.claimed.delete(best); return false; }
    try {
      await this.fast(slot, await this.S.openIx(slot, best));
      await sleep(2300);
      await this.fast(slot, await this.S.finishOpenIx(slot, best));
      const bp = (await this.S.rprv(slot)).backpack.map((b) => b.toString());
      this.log(slot, "open_crate", { crate: best, backpack: bp });
      return true;
    } catch (e) {
      this.log(slot, "open_failed", { crate: best, error: String(e).match(/0x[0-9a-f]+/)?.[0] ?? String(e).slice(0, 80) });
      return false;
    }
  }

  private async wander(slot: number) {
    for (let tries = 0; tries < 8; tries++) {
      // Short hops (≤ 12 tiles at walking pace ≈ 6 s) so the extraction clock is checked often.
      const me = await this.S.rprv(slot);
      const x = Math.min(6100, Math.max(300, me.x + Math.round((this.rnd() - 0.5) * 2400)));
      const y = Math.min(3700, Math.max(300, me.y + Math.round((this.rnd() - 0.5) * 2400)));
      if (await this.safeWalk(slot, x, y, 200)) { this.log(slot, "wander", { to: [x, y] }); return; }
    }
    await sleep(1000);
  }

  private async trade(slot: number) {
    const me = await this.S.rprv(slot);
    const from = me.backpack.findIndex((b) => !b.isZero());
    if (from < 0) return;
    const to = (from + 1 + Math.floor(this.rnd() * 2)) % 3;
    const bands = await this.bands();
    const safe = TERMINALS.filter(([tx, ty]) => !inBand(tx, ty, bands));
    if (!safe.length) return;
    const term = safe.reduce((a, b) => (Math.hypot(a[0] - me.x, a[1] - me.y) < Math.hypot(b[0] - me.x, b[1] - me.y) ? a : b));
    if (!(await this.safeWalk(slot, term[0], term[1], 60))) return;
    const units = me.backpack[from];
    const k = this.S.raiders[slot].raidKey.publicKey;
    try {
      const start = await this.S.T.methods.startTrade(slot, from, to, units).accountsPartial({ raid: this.S.raid, rprv: this.S.slot("rprv", slot), rpub: this.S.slot("rpub", slot), raidKey: k }).instruction();
      await this.fast(slot, start);
      await sleep(3300);
      const finish = await this.S.T.methods.finishTrade(slot).accountsPartial({
        raid: this.S.raid, rprv: this.S.slot("rprv", slot), rpub: this.S.slot("rpub", slot),
        district0: this.S.district(0), district1: this.S.district(1), district2: this.S.district(2), raidKey: k,
      }).instruction();
      await this.fast(slot, finish);
      this.log(slot, "trade", { from, to, units: units.toString(), after: (await this.S.rprv(slot)).backpack.map(String) });
    } catch (e) {
      this.log(slot, "trade_failed", { error: String(e).match(/0x[0-9a-f]+/)?.[0] ?? String(e).slice(0, 80) });
    }
  }

  private async extract(slot: number) {
    // Stage near the middle, on the first point outside every danger band; re-check while waiting.
    const stages = [CENTER, [CENTER[0], SAFE_ROWS_Y[0]], [CENTER[0], SAFE_ROWS_Y[1]], [2150, CENTER[1]], [4350, CENTER[1]]];
    const stage = async () => {
      const bands = await this.bands();
      const me = await this.S.rprv(slot);
      if (!inBand(me.x, me.y, bands) && Math.hypot(me.x - CENTER[0], me.y - CENTER[1]) < 1200) return;
      for (const [sx, sy] of stages) if (await this.safeWalk(slot, sx, sy, 150, 110)) return;
    };
    await stage();
    let raid = await this.state();
    while (raid.status === 2 && raid.exitWindow !== 3) { await sleep(1000); await stage(); raid = await this.state(); }
    if (raid.status !== 2) return;
    const me = await this.S.rprv(slot);
    const hp = (await this.S.rpub(slot)).hp;
    const bands = await this.bands();
    const dist = (e: number) => Math.hypot(EXITS[e][0] - me.x, EXITS[e][1] - me.y);
    // Prefer exits off hazard tiles; enter a band exit only with enough HP to survive it.
    const choices = [...raid.openExits].filter((e) => e !== 255 && (!inBand(EXITS[e][0], EXITS[e][1], bands) || hp >= RISKY_EXIT_MIN_HP))
      .sort((a, b) => Number(inBand(EXITS[a][0], EXITS[a][1], bands)) - Number(inBand(EXITS[b][0], EXITS[b][1], bands)) || dist(a) - dist(b));
    if (!choices.length) { this.log(slot, "extract_skipped", { reason: "open exits on hazard tiles", hp }); return; }
    const exit = choices[0];
    try {
      if (!(await this.safeWalk(slot, EXITS[exit][0], EXITS[exit][1], 60, 110, true))) throw new Error("no safe route to exit");
      await this.S.startExtract(slot, exit);
      await sleep(5400);
      await this.S.finishExtract(slot);
      this.log(slot, "extracted", { exit, backpack: (await this.S.rprv(slot)).backpack.map(String) });
    } catch (e) {
      this.log(slot, "extract_failed", { exit, error: String(e).match(/0x[0-9a-f]+/)?.[0] ?? String(e).slice(0, 80) });
    }
  }
}

export const bn = (x: number) => new anchor.BN(x);
