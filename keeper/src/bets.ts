// Extraction Market + RAZKYN LIVE micro-picks (spectators; CLAUDE.md §2, DECISIONS #33 and #38).
// Play-money only: dPLAY (devnet, 0 decimals, free faucet). A bet is a real devnet transfer of dPLAY
// from the spectator's wallet to the keeper's dPLAY account, tagged with an SPL memo:
//   razkyn-bet:<raidId>:<slot>:<Y|N>                 EXTRACTS(slot): does this raider extract?
//   razkyn-pick:<raidId>:<C|D>:<window>:<choice>     NEXT CRACK / KNOCKOUT IN 30 S (picks.ts)
// A bet counts only if its transaction's on-chain block time is inside the pool's betting window
// (opened, not yet locked); otherwise it is refunded. Outcomes come only from public raid state:
// EXTRACTS from the committed result, picks from the public WIRE feed (district cracks, knockouts).
// Pools pay parimutuel with no dust (picks.ts); every payout is a devnet transaction in the report.
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction, createTransferCheckedInstruction, getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import type { RaidSession } from "../../scripts/raid-lib.ts";
import { TOKEN, cfg } from "../../scripts/raid-lib.ts";
import { sendBase } from "../../scripts/spike-lib.ts";
import type { Fact } from "../wire/facts.ts";
import {
  EXTRACTS_LOCK, PICKS, isLate, leaderboard, parimutuel, parseMemo, resolve, schedule,
  type Owed, type PickType, type PickWindow, type PubEvent, type Scored,
} from "./picks.ts";

export const MEMO_PROGRAM = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
export const PLAY = new PublicKey(cfg.mints.play);
export const PLAY_DECIMALS = 0;
export const BET_CLOSE_SECS = EXTRACTS_LOCK;

/** One accepted transfer. `pool` = "X:<slot>" | "C:<window>" | "D:<window>"; `slot`/`side` kept for the EXTRACTS view. */
export type Bet = { sig: string; bettor: string; pool: string; choice: number; amount: number; ts: number; late: boolean; slot: number; side: "Y" | "N" | "" };
export type Payout = Owed & { sig?: string };
type Result = { outcome: number; resolvedTs: number; total: number; winning: number; pct: number; mult: number };

export class BetBook {
  readonly bets: Bet[] = [];
  readonly seen = new Set<string>();
  payouts: Payout[] = [];
  settled = false;
  outcomes: boolean[] | null = null;
  readonly ata: PublicKey;
  startTs = 0;
  windows: PickWindow[] = [];
  readonly events: PubEvent[] = [];
  readonly results = new Map<string, Result>();
  /** Called with a public fact when a pick resolves (THE WIRE announces it). */
  onResult: (f: Fact) => void = () => {};

  constructor(readonly S: RaidSession, readonly raidId: string, public closeTs: number) {
    this.ata = getAssociatedTokenAddressSync(PLAY, S.keeper.publicKey, false, TOKEN);
  }

  /** Raid went live: fix the pick schedule from the raid's on-chain start time. */
  start(startTs: number) {
    this.startTs = startTs;
    this.closeTs = startTs + EXTRACTS_LOCK;
    this.windows = schedule(startTs);
    for (const b of this.bets) b.late = this.isLate(b.pool, b.ts);
  }

  /** The keeper's dPLAY account must exist before anyone can bet into it. */
  async ensureAta() {
    if (await this.S.base.getAccountInfo(this.ata)) return;
    await sendBase(this.S.base, [createAssociatedTokenAccountIdempotentInstruction(this.S.keeper.publicKey, this.ata, this.S.keeper.publicKey, PLAY, TOKEN)], [this.S.keeper]);
  }

  private isLate(pool: string, ts: number) { return isLate(pool, ts, this.startTs, this.windows); }

  /** Read new transfers into the keeper's dPLAY account and record the bets for this raid. */
  async poll() {
    const sigs = await this.S.base.getSignaturesForAddress(this.ata, { limit: 100 });
    for (const s of sigs.reverse()) {
      if (this.seen.has(s.signature) || s.err) continue;
      this.seen.add(s.signature); // a transaction is counted once, however often it is seen
      const tx = await this.S.base.getParsedTransaction(s.signature, { maxSupportedTransactionVersion: 0, commitment: "confirmed" }).catch(() => null);
      if (!tx) { this.seen.delete(s.signature); continue; }
      let memo = "", amount = 0, bettor = "";
      for (const ix of tx.transaction.message.instructions) {
        const p = ix as { program?: string; parsed?: unknown; programId: PublicKey };
        if (p.programId.equals(MEMO_PROGRAM) && typeof p.parsed === "string") memo = p.parsed;
        const parsed = p.parsed as { type?: string; info?: { destination?: string; mint?: string; authority?: string; tokenAmount?: { amount: string } } } | undefined;
        if (parsed?.type === "transferChecked" && parsed.info?.destination === this.ata.toBase58() && parsed.info.mint === PLAY.toBase58()) {
          amount += Number(parsed.info.tokenAmount?.amount ?? 0);
          bettor = parsed.info.authority ?? bettor;
        }
      }
      const m = parseMemo(memo, this.raidId);
      if (!m || amount <= 0 || !bettor) continue;
      const ts = tx.blockTime ?? s.blockTime ?? Math.floor(Date.now() / 1000);
      const isX = m.pool.startsWith("X:");
      this.bets.push({
        sig: s.signature, bettor, pool: m.pool, choice: m.choice, amount, ts, late: this.isLate(m.pool, ts),
        slot: isX ? Number(m.pool.slice(2)) : -1, side: isX ? (m.choice === 0 ? "Y" : "N") : "",
      });
    }
  }

  /** Public facts from the WIRE feed (non-member reader): cracks and knockouts resolve picks live. */
  onFact(f: Fact) {
    if (!this.startTs) return;
    const ts = this.startTs + f.t;
    if (f.kind === "hazard") this.events.push({ ts, kind: "crack", district: f.district });
    if (f.kind === "kill") this.events.push({ ts, kind: "death", slot: f.slot });
    this.resolveDue(ts);
  }

  /** Resolve every window whose outcome is now known; announce each once. */
  resolveDue(now: number) {
    for (const w of this.windows) {
      const key = `${w.type}:${w.window}`;
      if (this.results.has(key)) continue;
      const outcome = resolve(w, this.events, now);
      if (outcome === null) continue;
      const on = this.bets.filter((b) => b.pool === key && !b.late);
      const total = on.reduce((a, b) => a + b.amount, 0);
      const winning = on.filter((b) => b.choice === outcome).reduce((a, b) => a + b.amount, 0);
      const r: Result = { outcome, resolvedTs: now, total, winning, pct: on.length ? Math.round((on.filter((b) => b.choice === outcome).length / on.length) * 100) : 0, mult: winning ? Math.round((total / winning) * 10) / 10 : 0 };
      this.results.set(key, r);
      if (on.length) this.onResult({ kind: "pick_result", t: Math.max(0, now - this.startTs), pick: w.type === "C" ? 0 : 1, window: w.window, outcome, pct: r.pct, mult10: Math.round(r.mult * 10), bets: on.length } as Fact);
    }
  }

  pools() {
    return Array.from({ length: 8 }, (_, slot) => {
      const on = this.bets.filter((b) => b.pool === `X:${slot}` && !b.late);
      const yes = on.filter((b) => b.choice === 0).reduce((a, b) => a + b.amount, 0);
      const no = on.filter((b) => b.choice === 1).reduce((a, b) => a + b.amount, 0);
      return { slot, yes, no, count: on.length };
    });
  }

  /** Settle every pool: EXTRACTS from the committed result, picks from the public feed. Idempotent. */
  async settle(extracted: boolean[]) {
    if (this.settled) return this.payouts;
    await this.poll();
    this.outcomes = extracted;
    this.resolveDue(Number.MAX_SAFE_INTEGER); // anything still open resolves at raid end (NONE / NO)
    const owed = new Map<string, Payout>();
    const add = (o: Owed) => {
      if (o.amount <= 0) return;
      const k = `${o.bettor}:${o.reason}`;
      const cur = owed.get(k);
      if (cur) cur.amount += o.amount; else owed.set(k, { ...o });
    };
    for (const b of this.bets.filter((x) => x.late)) add({ bettor: b.bettor, amount: b.amount, reason: "refund" });
    const pools = new Set(this.bets.filter((b) => !b.late).map((b) => b.pool));
    for (const pool of pools) {
      const on = this.bets.filter((b) => b.pool === pool && !b.late).map((b, order) => ({ bettor: b.bettor, choice: b.choice, amount: b.amount, order }));
      const winning = pool.startsWith("X:") ? (extracted[Number(pool.slice(2))] ? 0 : 1) : this.results.get(pool)?.outcome ?? -1;
      parimutuel(on, winning).forEach(add);
    }
    const list = [...owed.values()];
    for (let i = 0; i < list.length; i += 6) {
      const chunk = list.slice(i, i + 6);
      const ixs: TransactionInstruction[] = [];
      for (const p of chunk) {
        const owner = new PublicKey(p.bettor);
        const dest = getAssociatedTokenAddressSync(PLAY, owner, false, TOKEN);
        ixs.push(createAssociatedTokenAccountIdempotentInstruction(this.S.keeper.publicKey, dest, owner, PLAY, TOKEN));
        ixs.push(createTransferCheckedInstruction(this.ata, PLAY, dest, this.S.keeper.publicKey, BigInt(p.amount), PLAY_DECIMALS, [], TOKEN));
      }
      try {
        const sig = await sendBase(this.S.base, ixs, [this.S.keeper]);
        chunk.forEach((p) => (p.sig = sig));
      } catch (e) {
        chunk.forEach((p) => (p.sig = `failed: ${String(e).slice(0, 60)}`));
      }
    }
    this.payouts = list;
    this.settled = true;
    return list;
  }

  /** Spectator leaderboard from resolved pools (every accepted bet on a resolved pool counts as a pick). */
  board() {
    const entries: Scored[] = [];
    for (const b of this.bets.filter((x) => !x.late)) {
      const winning = b.pool.startsWith("X:") ? (this.outcomes ? (this.outcomes[b.slot] ? 0 : 1) : null) : this.results.get(b.pool)?.outcome ?? null;
      if (winning === null) continue;
      const on = this.bets.filter((x) => x.pool === b.pool && !x.late);
      const share = parimutuel(on.map((x, order) => ({ bettor: x.bettor, choice: x.choice, amount: x.amount, order })), winning);
      // This bettor's payout from this pool, attributed to their bets in it by stake.
      const mine = share.filter((o) => o.bettor === b.bettor).reduce((a, o) => a + o.amount, 0);
      const myStake = on.filter((x) => x.bettor === b.bettor).reduce((a, x) => a + x.amount, 0);
      entries.push({ bettor: b.bettor, ts: b.ts, correct: b.choice === winning, staked: b.amount, paid: myStake ? Math.round((mine * b.amount) / myStake) : 0 });
    }
    return leaderboard(entries);
  }

  /** Public view for the client and the report. */
  view() {
    const picks = this.windows.map((w) => {
      const key = `${w.type}:${w.window}`;
      const on = this.bets.filter((b) => b.pool === key && !b.late);
      const totals = PICKS[w.type].choices.map((_, c) => on.filter((b) => b.choice === c).reduce((a, b) => a + b.amount, 0));
      return { ...w, name: PICKS[w.type].name, choices: PICKS[w.type].choices, totals, bets: on.length, result: this.results.get(key) ?? null };
    });
    return {
      raidId: this.raidId, startTs: this.startTs, closeTs: this.closeTs, open: !this.settled && Date.now() / 1000 < this.closeTs, keeperAta: this.ata.toBase58(),
      mint: PLAY.toBase58(), pools: this.pools(), picks, bets: this.bets.map((b) => ({ ...b })), settled: this.settled, outcomes: this.outcomes,
      payouts: this.payouts, leaderboard: this.board(),
    };
  }
}

export type { PickType };
