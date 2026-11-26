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
// Fairness for human raiders: each BOT opens at most 2 crates (14 of the 24 active ones for 7 BOTs),
// and BOTs wait 15 s before looting when a human is in the raid.
const MAX_BOT_CRATES = 2;
const HUMAN_HEAD_START = 15;

// Hazard avoidance (public information only: each District's hazard level and price change).
// The program hurts a raider standing on rows 16-23 (level 1) or 12-27 (level 2) of a falling
// district (constants.rs HAZARD*_ROWS); the corridors between districts (x tiles 21, 43) are safe.
// A district at level >= 1, or within 0.5% of the -2% trigger, is treated as dangerous on the wider
// rows 11-28 (level-2 rows plus a 1-row margin), because it can escalate while a BOT is there.
const DISTRICT_TILES: [number, number][] = [[0, 20], [22, 42], [44, 63]];
const DANGER_ROWS: [number, number] = [11, 28];
const DANGER_BPS = -150;
// Safe rows 9 and 30 leave one tile of slack outside the band: walkTo stops within a radius, and
// stopping on the band's margin row made BOTs "escape" again and again (devnet raid 1795625037689).
const SAFE_ROWS_Y = [950, 3050];
const CORRIDORS_X = [2150, 4350]; // x tiles 21 and 43: between districts, never hazard tiles
const WAYPOINT_WITHIN = 30; // keeps waypoints inside a 1-tile corridor / on the safe row
// Planning speed: measured on devnet (raid 1795626234189) a planned 15 s exit run took > 25 s,
// so plan at ~2.8 tiles/s plus a fixed overhead for the final position check.
const WALK_UNITS_PER_S = 280;
const WALK_OVERHEAD_S = 2;
const WAYPOINT_SYNC_S = 1; // confirmation wait + position read at each waypoint
const EXTRACT_SECS = 6; // 5 s channel + send slack
const RAID_END = 300;
const RISKY_EXIT_MIN_HP = 95; // a band exit costs 2-4 s walking + 5 s standing at 10 HP/s (one BOT died at 85+)
type Bands = ([number, number] | null)[];
const districtOfX = (x: number) => DISTRICT_TILES.findIndex(([lo, hi]) => Math.floor(x / 100) >= lo && Math.floor(x / 100) <= hi);
export function inBand(x: number, y: number, bands: Bands) {
  const d = districtOfX(x);
  const b = d >= 0 ? bands[d] : null;
  const ty = Math.floor(y / 100);
  return !!b && ty >= b[0] && ty <= b[1];
}
/** On or within r units of a danger band (a walk that stops within r of the point may land there). */
function nearBand(x: number, y: number, r: number, bands: Bands) {
  return [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]].some(([dx, dy]) => inBand(x + dx, y + dy, bands));
}
/** Shortest safe polyline (waypoints) from a to b, or null. Direct, via a safe row, or via a corridor. */
export function planRoute(ax: number, ay: number, x: number, y: number, bands: Bands, allowTargetInBand = false): { wps: [number, number][]; len: number } | null {
  const candidates: [number, number][][] = [[]];
  for (const ry of SAFE_ROWS_Y) candidates.push([[ax, ry], [x, ry]]);
  for (const ry1 of SAFE_ROWS_Y) for (const ry2 of SAFE_ROWS_Y) for (const cx of CORRIDORS_X) candidates.push([[ax, ry1], [cx, ry1], [cx, ry2], [x, ry2]]);
  let best: { wps: [number, number][]; len: number } | null = null;
  for (const wps of candidates) {
    const pts: [number, number][] = [[ax, ay], ...wps, [x, y]];
    let ok = true, len = 0;
    for (let i = 1; i < pts.length && ok; i++) {
      len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      // Into a target on hazard rows only straight down/up from a safe row (shortest time on hazard).
      const last = i === pts.length - 1 && Math.abs(pts[i - 1][0] - x) < 50;
      if (!(last && allowTargetInBand) && !segmentSafe(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], bands)) ok = false;
    }
    if (ok && (!best || len < best.len)) best = { wps, len };
  }
  return best;
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
  private opened = new Map<number, number>();
  private seed: number;

  /** `elapsed()` returns raid seconds on the TEE clock. */
  /** humans > 0: BOTs leave room for players (MAX_BOT_CRATES each, HUMAN_HEAD_START s before looting). */
  constructor(private S: RaidSession, private slots: number[], private elapsed: () => number, seed = 1, private humans = 0) {
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
   * full speed, to a safe row), then follow the shortest safe route (planRoute).
   * Returns false if the target is on or next to a band (caller picks another target) or no route exists.
   */
  private async safeWalk(slot: number, x: number, y: number, within: number, intervalMs = 250, allowTargetInBand = false): Promise<boolean> {
    const bands = await this.bands();
    let me = await this.S.rprv(slot);
    if (inBand(me.x, me.y, bands)) {
      const ty = SAFE_ROWS_Y.reduce((a, b) => (Math.abs(a - me.y) < Math.abs(b - me.y) ? a : b));
      await this.S.walkTo(slot, me.x, ty, WAYPOINT_WITHIN, 110);
      this.log(slot, "hazard_escape", { to: [me.x, ty] });
      me = await this.S.rprv(slot);
    }
    if (!allowTargetInBand && nearBand(x, y, within, bands)) return false;
    // Stream the whole route; if some moves were rejected, re-plan from where the BOT really is.
    for (let attempt = 0; attempt < 4; attempt++) {
      const route = planRoute(me.x, me.y, x, y, bands, allowTargetInBand);
      if (!route) return false;
      if (await this.walkPath(slot, [...route.wps, [x, y]], within, allowTargetInBand ? 110 : intervalMs, bands, allowTargetInBand)) return true;
      me = await this.S.rprv(slot);
    }
    return false;
  }

  /**
   * Stream moves along a polyline (same pacing as RaidSession.walkTo). Moves are relative, so a
   * rejected move shifts the rest of the path; at each waypoint the BOT waits for its moves and
   * re-reads its real position before the next leg (corridors are only 1 tile wide: devnet raid
   * 1795627119584, 4 BOTs drifted onto hazard tiles without this).
   * Returns true when the BOT ends within `within` of the last point.
   */
  private async walkPath(slot: number, pts: [number, number][], within: number, intervalMs: number, bands: Bands, allowTargetInBand: boolean): Promise<boolean> {
    const S = this.S;
    for (let i = 0; i < pts.length; i++) {
      const [tx, ty] = pts[i];
      const last = i === pts.length - 1;
      const tol = last ? within : WAYPOINT_WITHIN;
      // Up to 5 rounds per leg: stream the moves, wait, read the real position, top up the rest.
      for (let round = 0; ; round++) {
        const at = await S.rprv(slot);
        if (Math.hypot(tx - at.x, ty - at.y) <= tol) break;
        if (round >= 5) return false;
        // The correction from where the BOT really is must itself stay off the danger band.
        if (!(last && allowTargetInBand) && !segmentSafe(at.x, at.y, tx, ty, bands)) return false;
        let cx = at.x, cy = at.y;
        const inflight: Promise<unknown>[] = [];
        for (;;) {
          const dx = tx - cx, dy = ty - cy, d = Math.hypot(dx, dy);
          if (d <= Math.max(last ? within - 10 : 5, 0.5)) break;
          const step = Math.min(50, d);
          const sx = Math.round((dx * step) / d), sy = Math.round((dy * step) / d);
          if (sx === 0 && sy === 0) break;
          const ix = await S.T.methods.moveTo(slot, sx, sy).accountsPartial({ raid: S.raid, rprv: S.slot("rprv", slot), raidKey: S.raiders[slot].raidKey.publicKey }).instruction();
          inflight.push(S.sendFast(slot, ix).catch(() => null));
          cx += sx; cy += sy;
          await sleep(intervalMs);
        }
        await Promise.all(inflight);
      }
    }
    return true;
  }

  private async state() {
    return (await this.S.readRaid()) as unknown as { status: number; exitWindow: number; openExits: number[]; cratePos: { x: number; y: number }[] };
  }

  private async runOne(slot: number) {
    if (this.humans > 0) await sleep(HUMAN_HEAD_START * 1000 + Math.floor(this.rnd() * 4000));
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
    if ((this.opened.get(slot) ?? 0) >= MAX_BOT_CRATES) return false; // leave the rest for human raiders
    const me = await this.S.rprv(slot);
    const districts = await Promise.all([0, 1, 2].map((i) => this.S.districtAcc(i)));
    const bands = await this.bands();
    let best = -1, bd = Infinity;
    for (let i = 0; i < NUM_CRATES; i++) {
      if (this.claimed.has(i)) continue;
      if (nearBand(pos[i].x, pos[i].y, 60, bands)) continue; // on (or next to) hazard tiles: not now
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
      this.opened.set(slot, (this.opened.get(slot) ?? 0) + 1);
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
    const safe = TERMINALS.filter(([tx, ty]) => !nearBand(tx, ty, 60, bands));
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
    // Stage near the middle, off every danger band (re-checked each second while waiting): the
    // exits of the last window are private until it opens, and the middle is closest to all four.
    const stages = [CENTER, [CENTER[0], SAFE_ROWS_Y[0]], [CENTER[0], SAFE_ROWS_Y[1]], [CORRIDORS_X[0], CENTER[1]], [CORRIDORS_X[1], CENTER[1]]];
    const stage = async () => {
      const bands = await this.bands();
      const me = await this.S.rprv(slot);
      if (!nearBand(me.x, me.y, WAYPOINT_WITHIN, bands) && Math.hypot(me.x - CENTER[0], me.y - CENTER[1]) < 1300) return;
      // Shortest safe route first (a BOT in the bottom half stages at the bottom, not across the map).
      const ranked = stages.map(([sx, sy]) => ({ sx, sy, r: nearBand(sx, sy, WAYPOINT_WITHIN, bands) ? null : planRoute(me.x, me.y, sx, sy, bands) }))
        .filter((c) => c.r).sort((a, b) => a.r!.len - b.r!.len).map((c) => [c.sx, c.sy]);
      for (const [sx, sy] of ranked) {
        try { if (await this.safeWalk(slot, sx, sy, WAYPOINT_WITHIN, 110)) return; } catch { /* try the next stage */ }
      }
    };
    await stage();
    let raid = await this.state();
    while (raid.status === 2 && raid.exitWindow !== 3) { await sleep(1000); await stage(); raid = await this.state(); }
    if (raid.status !== 2) return;

    // Pick the exit by estimated time over the safe route; a band exit only with enough HP.
    const hp = (await this.S.rpub(slot)).hp;
    const bands = await this.bands();
    const me = await this.S.rprv(slot);
    const left = RAID_END - this.elapsed() - 1;
    const options = [...raid.openExits].filter((e) => e !== 255).map((e) => {
      const band = inBand(EXITS[e][0], EXITS[e][1], bands);
      const route = planRoute(me.x, me.y, EXITS[e][0], EXITS[e][1], bands, true);
      const secs = route ? route.len / WALK_UNITS_PER_S + route.wps.length * WAYPOINT_SYNC_S + WALK_OVERHEAD_S + EXTRACT_SECS : Infinity;
      return { e, band, secs, ok: secs <= left && (!band || hp >= RISKY_EXIT_MIN_HP) };
    }).sort((a, b) => Number(b.ok) - Number(a.ok) || Number(a.band) - Number(b.band) || a.secs - b.secs);
    const pick = options[0];
    if (!pick || !pick.ok) {
      this.log(slot, "extract_skipped", { reason: pick ? (pick.secs > left ? "too far for the time left" : "open exits on hazard tiles") : "no exit", hp, left: Math.round(left), options });
      return;
    }
    const exit = pick.e;
    this.log(slot, "extract_go", { exit, estSecs: Math.round(pick.secs), left: Math.round(left), band: pick.band });
    // Retry the walk while there is time (a walk can fail under load); start_extract needs ≤ 1 tile.
    let arrived = false;
    while (!arrived && this.elapsed() < RAID_END - EXTRACT_SECS - 1) {
      try { arrived = await this.safeWalk(slot, EXITS[exit][0], EXITS[exit][1], 60, 110, true); } catch { /* re-plan from where we are */ }
    }
    try {
      if (!arrived) throw new Error("did not reach the exit in time");
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
