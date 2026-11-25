// THE WIRE — public fact feed (CLAUDE.md §7).
//
// THE WIRE sees only public state, enforced two ways:
//   1. Source: it reads the TEE with a token for a freshly generated keypair that is never a
//      member of any permission (not the keeper, not a raid key, not a wallet). Private accounts
//      (RaiderPrivate, View, sealed Crates, RaidSecret) come back empty to it by construction.
//   2. Shape: every fact is rebuilt by `sanitizeFact` from a fixed whitelist of public fields.
//      Anything else (a backpack, a private position, a seed) is dropped before a model or a
//      template ever sees it. Test 10 (tests/devnet/test10-wire-leak.ts) checks this.
import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { idl, PID } from "../../scripts/raid-lib.ts";
import { teeConn, sleep } from "../../scripts/spike-lib.ts";

export const DISTRICTS = ["Tower", "Factory", "Harbor"] as const;
const NUM_CRATES = 36;
const DROP_BASE = 36;
const STATUS_LIVE = 2;

/** Public facts. Positions are tiles; prices are relative (basis points vs raid start), never absolute. */
export type Fact =
  | { kind: "price"; t: number; district: number; bps: number; move30Bps: number }
  | { kind: "hazard"; t: number; district: number; level: number }
  | { kind: "wake"; t: number; district: number }
  | { kind: "exit_open"; t: number; window: number; exits: number[] }
  | { kind: "exposed"; t: number; slot: number; bot: boolean; district: number }
  | { kind: "crate_opened"; t: number; slot: number; bot: boolean; district: number; drop: boolean }
  | { kind: "kill"; t: number; slot: number; bot: boolean; by: number | null; byBot: boolean | null }
  | { kind: "extract"; t: number; slot: number; bot: boolean }
  | { kind: "raid_end"; t: number };

const int = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : 0);
const bool = (v: unknown) => v === true;
const slotOf = (v: unknown) => Math.min(7, Math.max(0, int(v)));
const dist = (v: unknown) => Math.min(2, Math.max(0, int(v)));

/** Rebuild a fact from the public whitelist only. Unknown kinds return null. */
export function sanitizeFact(f: unknown): Fact | null {
  const o = (f ?? {}) as Record<string, unknown>;
  const t = int(o.t);
  switch (o.kind) {
    case "price": return { kind: "price", t, district: dist(o.district), bps: int(o.bps), move30Bps: int(o.move30Bps) };
    case "hazard": return { kind: "hazard", t, district: dist(o.district), level: Math.min(2, Math.max(0, int(o.level))) };
    case "wake": return { kind: "wake", t, district: dist(o.district) };
    case "exit_open": return { kind: "exit_open", t, window: int(o.window), exits: Array.isArray(o.exits) ? o.exits.slice(0, 2).map(int) : [] };
    case "exposed": return { kind: "exposed", t, slot: slotOf(o.slot), bot: bool(o.bot), district: dist(o.district) };
    case "crate_opened": return { kind: "crate_opened", t, slot: slotOf(o.slot), bot: bool(o.bot), district: dist(o.district), drop: bool(o.drop) };
    case "kill": return { kind: "kill", t, slot: slotOf(o.slot), bot: bool(o.bot), by: o.by == null ? null : slotOf(o.by), byBot: o.byBot == null ? null : bool(o.byBot) };
    case "extract": return { kind: "extract", t, slot: slotOf(o.slot), bot: bool(o.bot) };
    case "raid_end": return { kind: "raid_end", t };
    default: return null;
  }
}

export const sanitizeLog = (log: unknown[]): Fact[] => log.map(sanitizeFact).filter((f): f is Fact => f !== null);

const districtOfX = (xUnits: number) => (xUnits < 2100 ? 0 : xUnits < 4300 ? 1 : 2);

type Decoded = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * Polls the public raid accounts once per second through a non-member TEE connection and turns
 * changes into Facts. `onFact` receives sanitized facts only.
 */
export class PublicFeed {
  readonly facts: Fact[] = [];
  readonly reader = Keypair.generate(); // never a permission member
  private conn!: Connection;
  // Program coder: camelCase account and field names (same decoding as raid-lib).
  private coder!: anchor.AccountsCoder;
  private lastError = "";
  private running = false;
  private loop: Promise<void> | null = null;
  private prev = {
    hazard: [0, 0, 0], awake: [false, false, false], window: 0, exposed: [] as boolean[], alive: [] as boolean[],
    extracted: [] as boolean[], kills: [] as number[], opened: new Set<number>(), started: false, ended: false,
  };
  private priceHist: number[][] = [[], [], []]; // bps per second
  private startTs = 0;
  bots: boolean[] = [];

  constructor(readonly raidId: anchor.BN, readonly onFact: (f: Fact) => void = () => {}) {}

  private pda(seed: string, extra?: number) {
    const seeds = [Buffer.from(seed), this.raidId.toArrayLike(Buffer, "le", 8)];
    if (extra !== undefined) seeds.push(Buffer.from([extra]));
    return PublicKey.findProgramAddressSync(seeds, PID)[0];
  }

  /** Refuse to run with a key that is a member of anything in this raid. */
  assertNotMember(memberKeys: PublicKey[]) {
    if (memberKeys.some((k) => k.equals(this.reader.publicKey))) throw new Error("WIRE reader key is a permission member");
  }

  async start() {
    this.conn = await teeConn(this.reader);
    this.coder = new anchor.Program(idl, new anchor.AnchorProvider(this.conn, new anchor.Wallet(this.reader), {})).coder.accounts;
    this.running = true;
    this.loop = (async () => {
      while (this.running) {
        try { await this.poll(); } catch (e) {
          // Transient RPC errors retry on the next poll; a new kind of error is logged once.
          const msg = String(e).slice(0, 160);
          if (msg !== this.lastError) { this.lastError = msg; console.warn(`WIRE feed poll error: ${msg}`); }
        }
        if (this.prev.ended) break;
        await sleep(1000);
      }
    })();
  }

  async stop() { this.running = false; await this.loop; }

  private emit(f: unknown) {
    const s = sanitizeFact(f);
    if (!s) return;
    this.facts.push(s);
    this.onFact(s);
  }

  /** Read and decode public accounts; sealed crates come back null to this reader. */
  async poll() {
    const raidKey = this.pda("raid");
    const keys = [raidKey, 0, 1, 2].map((v) => (typeof v === "number" ? this.pda("district", v) : v)) as PublicKey[];
    for (let s = 0; s < 8; s++) keys.push(this.pda("rpub", s));
    for (let i = 0; i < NUM_CRATES + 8; i++) keys.push(this.pda("crate", i));
    const infos = await this.conn.getMultipleAccountsInfo(keys);
    if (!infos[0]) return;
    const raid = this.coder.decode("raid", infos[0].data) as Decoded;
    const status = Number(raid.status);
    if (status < STATUS_LIVE) return;
    if (!this.startTs) this.startTs = Number(raid.startTs.toString());
    const now = Math.floor(Date.now() / 1000);
    const t = Math.max(0, Math.min(300, now - this.startTs));
    const P = this.prev;

    // Districts: relative price, hazards, wake.
    for (let d = 0; d < 3; d++) {
      const info = infos[1 + d];
      if (!info) continue;
      const dd = this.coder.decode("district", info.data) as Decoded;
      const start = Number(dd.startPrice.toString()) || 1_000_000;
      const bps = Math.round(((Number(dd.currentPrice.toString()) - start) / start) * 10_000);
      const h = this.priceHist[d];
      h.push(bps);
      const move30 = h.length > 30 ? bps - h[h.length - 31] : bps;
      if (h.length % 3 === 0) this.emit({ kind: "price", t, district: d, bps, move30Bps: move30 });
      const level = Number(dd.hazardLevel);
      if (level > P.hazard[d]) this.emit({ kind: "hazard", t, district: d, level });
      P.hazard[d] = level;
      if (dd.awake && !P.awake[d]) this.emit({ kind: "wake", t, district: d });
      P.awake[d] = !!dd.awake;
    }

    // Exit windows (public schedule on Raid).
    const win = Number(raid.exitWindow);
    if (win > P.window && win > 0) this.emit({ kind: "exit_open", t, window: win, exits: Array.from(raid.openExits as number[]).filter((e) => e !== 255) });
    P.window = win;

    // Raiders (public fields only).
    const slots = (raid.raiders as Decoded[]).map((r) => !!r.joined);
    const rp: (Decoded | null)[] = [];
    for (let s = 0; s < 8; s++) {
      const info = infos[4 + s];
      rp.push(slots[s] && info ? (this.coder.decode("raiderPublic", info.data) as Decoded) : null);
      this.bots[s] = !!rp[s]?.isBot;
    }
    const newlyDead: number[] = [];
    for (let s = 0; s < 8; s++) {
      const r = rp[s];
      if (!r) continue;
      const bot = !!r.isBot;
      if (r.exposed && !P.exposed[s] && r.alive && !r.extracted) this.emit({ kind: "exposed", t, slot: s, bot, district: districtOfX(Number(r.pubX)) });
      P.exposed[s] = !!r.exposed;
      if (P.alive[s] !== false && !r.alive) newlyDead.push(s);
      P.alive[s] = !!r.alive;
      if (r.extracted && !P.extracted[s]) this.emit({ kind: "extract", t, slot: s, bot });
      P.extracted[s] = !!r.extracted;
    }
    // Attribute each death to a raider whose public kill count rose in the same poll (if exactly one).
    const killers = rp.map((r, s) => (r && Number(r.kills) > (P.kills[s] ?? 0) ? s : -1)).filter((s) => s >= 0);
    for (const s of newlyDead) {
      const by = killers.length === 1 ? killers[0] : null;
      this.emit({ kind: "kill", t, slot: s, bot: this.bots[s], by, byBot: by == null ? null : this.bots[by] });
    }
    rp.forEach((r, s) => { if (r) P.kills[s] = Number(r.kills); });

    // Crates: readable only once opened (sealed crates are private to the keeper).
    for (let i = 0; i < NUM_CRATES + 8; i++) {
      const info = infos[12 + i];
      if (!info || P.opened.has(i)) continue;
      const c = this.coder.decode("crate", info.data) as Decoded;
      if (Number(c.state) !== 1) continue;
      P.opened.add(i);
      const by = Number(c.openedBy);
      if (by > 7) continue;
      this.emit({ kind: "crate_opened", t, slot: by, bot: this.bots[by] ?? false, district: i >= DROP_BASE ? districtOfX(Number(c.x)) : Number(c.district), drop: i >= DROP_BASE });
    }

    if (status > STATUS_LIVE && !P.ended) { P.ended = true; this.emit({ kind: "raid_end", t }); }
  }
}
