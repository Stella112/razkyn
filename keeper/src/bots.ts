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

  private async state() {
    return (await this.S.readRaid()) as unknown as { status: number; exitWindow: number; openExits: number[]; cratePos: { x: number; y: number }[] };
  }

  private async runOne(slot: number) {
    for (;;) {
      const raid = await this.state();
      if (raid.status !== 2) return;
      const me = await this.S.rpub(slot);
      if (!me.alive) { this.log(slot, "dead"); return; }
      if (this.elapsed() >= LAST_WINDOW - 22) return this.extract(slot);
      const looted = await this.lootOne(slot, raid.cratePos);
      if (!looted) await this.wander(slot);
      if (looted && this.rnd() < 0.35 && this.elapsed() < LAST_WINDOW - 40) await this.trade(slot);
    }
  }

  private async lootOne(slot: number, pos: { x: number; y: number }[]) {
    const me = await this.S.rprv(slot);
    const districts = await Promise.all([0, 1, 2].map((i) => this.S.districtAcc(i)));
    let best = -1, bd = Infinity;
    for (let i = 0; i < NUM_CRATES; i++) {
      if (this.claimed.has(i)) continue;
      if (i % 12 >= 8 && !districts[Math.floor(i / 12)].awake) continue; // dormant, district asleep
      const d = Math.hypot(pos[i].x - me.x, pos[i].y - me.y);
      if (d < bd) { bd = d; best = i; }
    }
    if (best < 0) return false;
    this.claimed.add(best);
    // Opened crates are public: if we can read it, someone already opened it.
    if (await this.S.raiders[slot].tee!.getAccountInfo(this.S.crate(best))) return false;
    await this.S.walkTo(slot, pos[best].x, pos[best].y, 60, 250);
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
    const x = 300 + Math.floor(this.rnd() * 5800), y = 300 + Math.floor(this.rnd() * 3400);
    await this.S.walkTo(slot, x, y, 200, 250);
    this.log(slot, "wander", { to: [x, y] });
  }

  private async trade(slot: number) {
    const me = await this.S.rprv(slot);
    const from = me.backpack.findIndex((b) => !b.isZero());
    if (from < 0) return;
    const to = (from + 1 + Math.floor(this.rnd() * 2)) % 3;
    const term = TERMINALS.reduce((a, b) => (Math.hypot(a[0] - me.x, a[1] - me.y) < Math.hypot(b[0] - me.x, b[1] - me.y) ? a : b));
    await this.S.walkTo(slot, term[0], term[1], 60, 250);
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
    await this.S.walkTo(slot, CENTER[0], CENTER[1], 150, 110);
    let raid = await this.state();
    while (raid.status === 2 && raid.exitWindow !== 3) { await sleep(1000); raid = await this.state(); }
    if (raid.status !== 2) return;
    const me = await this.S.rprv(slot);
    const exit = [...raid.openExits].sort((a, b) => Math.hypot(EXITS[a][0] - me.x, EXITS[a][1] - me.y) - Math.hypot(EXITS[b][0] - me.x, EXITS[b][1] - me.y))[0];
    try {
      await this.S.walkTo(slot, EXITS[exit][0], EXITS[exit][1], 60, 110);
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
