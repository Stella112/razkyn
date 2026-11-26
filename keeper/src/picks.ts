// RAZKYN LIVE — spectator micro-picks (owner add-on Part B, keeper-run per DECISIONS #38).
// Pure logic only (no chain access), so it is unit-tested in tests/picks.test.ts:
//   schedule → which pick windows exist, when they lock and what period they watch;
//   resolve  → outcome of a window from PUBLIC raid events only (district cracks, knockouts);
//   parimutuel → payouts per pool that always sum to the pool (no dust), refunds if nobody won;
//   leaderboard → correct picks, best streak, net dPLAY per spectator.
// Bets themselves are devnet dPLAY transfers to the keeper (bets.ts); "late" is decided by the
// transaction's on-chain block time, never by the client.

export type PickType = "C" | "D";
/** NEXT_CRACK (C): which district cracks first. DEATH_30S (D): does anyone get knocked out. */
export const PICKS: Record<PickType, { name: string; every: number; lockAfter: number; watch: number; count: number; choices: string[] }> = {
  C: { name: "NEXT CRACK", every: 60, lockAfter: 5, watch: 60, count: 5, choices: ["TOWER", "FACTORY", "HARBOR", "NONE"] },
  D: { name: "KNOCKOUT IN 30 S", every: 30, lockAfter: 3, watch: 30, count: 10, choices: ["YES", "NO"] },
};
export const RAID_SECS = 300;
/** EXTRACTS(slot): open from raid creation, locks 30 s before the last exit window ends (start + 270 s). */
export const EXTRACTS_LOCK = 270;

export type PickWindow = { type: PickType; window: number; openTs: number; lockTs: number; endTs: number };

/** Every pick window of a raid. The watched period is [lockTs, endTs): it starts AFTER betting locks,
 *  so nothing a spectator can see before locking decides the outcome. */
export function schedule(startTs: number): PickWindow[] {
  const out: PickWindow[] = [];
  for (const type of ["C", "D"] as PickType[]) {
    const p = PICKS[type];
    for (let w = 0; w < p.count; w++) {
      const openTs = startTs + w * p.every;
      const lockTs = openTs + p.lockAfter;
      out.push({ type, window: w, openTs, lockTs, endTs: Math.min(lockTs + p.watch, startTs + RAID_SECS) });
    }
  }
  return out;
}

/** Late / invalid by the chain clock (block time of the bet transaction):
 *  EXTRACTS at or after start + 270 s; a pick before its window opened or at / after its lock;
 *  any pick before the raid started (its windows do not exist yet). */
export function isLate(pool: string, ts: number, startTs: number, windows: PickWindow[]): boolean {
  if (pool.startsWith("X:")) return startTs > 0 && ts >= startTs + EXTRACTS_LOCK;
  const [t, w] = pool.split(":");
  const win = windows.find((x) => x.type === t && x.window === Number(w));
  if (!win) return startTs > 0;
  return ts < win.openTs || ts >= win.lockTs;
}

/** Public raid events (from the WIRE feed, which reads only public accounts with a non-member key). */
export type PubEvent = { ts: number; kind: "crack"; district: number } | { ts: number; kind: "death"; slot: number };

/** Outcome (choice index) of a window, or null while still undecided at `now`. */
export function resolve(w: PickWindow, events: PubEvent[], now: number): number | null {
  const inWin = events.filter((e) => e.ts >= w.lockTs && e.ts < w.endTs).sort((a, b) => a.ts - b.ts);
  if (w.type === "C") {
    const first = inWin.find((e) => e.kind === "crack") as { district: number } | undefined;
    if (first) return first.district; // 0 Tower, 1 Factory, 2 Harbor
    return now >= w.endTs ? 3 : null; // NONE
  }
  if (inWin.some((e) => e.kind === "death")) return 0; // YES
  return now >= w.endTs ? 1 : null; // NO
}

export type StakeIn = { bettor: string; choice: number; amount: number; order: number };
export type Owed = { bettor: string; amount: number; reason: "win" | "refund" };

/**
 * Parimutuel payout of one pool. Winners split the whole pool pro rata to stake; the integer
 * remainder goes to the largest winning stake (earliest on ties), so the payouts always sum to the pool.
 * Nobody on the winning side → everyone is refunded.
 */
export function parimutuel(stakes: StakeIn[], winning: number): Owed[] {
  const total = stakes.reduce((a, s) => a + s.amount, 0);
  const winners = stakes.filter((s) => s.choice === winning);
  const wsum = winners.reduce((a, s) => a + s.amount, 0);
  if (!total) return [];
  if (!wsum) return stakes.map((s) => ({ bettor: s.bettor, amount: s.amount, reason: "refund" }));
  const out = winners.map((s) => ({ bettor: s.bettor, amount: Math.floor((s.amount * total) / wsum), reason: "win" as const, stake: s.amount, order: s.order }));
  const rest = total - out.reduce((a, o) => a + o.amount, 0);
  if (rest > 0) [...out].sort((a, b) => b.stake - a.stake || a.order - b.order)[0].amount += rest;
  return out.map(({ bettor, amount, reason }) => ({ bettor, amount, reason }));
}

export type Scored = { bettor: string; ts: number; correct: boolean; staked: number; paid: number };
export type BoardRow = { bettor: string; picks: number; correct: number; bestStreak: number; net: number };
/** Leaderboard from resolved picks: most correct, then net dPLAY, then best streak. */
export function leaderboard(entries: Scored[]): BoardRow[] {
  const by = new Map<string, Scored[]>();
  for (const e of entries) (by.get(e.bettor) ?? by.set(e.bettor, []).get(e.bettor)!).push(e);
  const rows: BoardRow[] = [];
  for (const [bettor, list] of by) {
    list.sort((a, b) => a.ts - b.ts);
    let streak = 0, best = 0;
    for (const e of list) { streak = e.correct ? streak + 1 : 0; best = Math.max(best, streak); }
    rows.push({ bettor, picks: list.length, correct: list.filter((e) => e.correct).length, bestStreak: best, net: list.reduce((a, e) => a + e.paid - e.staked, 0) });
  }
  return rows.sort((a, b) => b.correct - a.correct || b.net - a.net || b.bestStreak - a.bestStreak);
}

/** Memo formats: legacy EXTRACTS bet and the new picks. Returns the pool key and choice, or null. */
export function parseMemo(memo: string, raidId: string): { pool: string; choice: number } | null {
  const x = /^razkyn-bet:(\d+):([0-7]):([YN])$/.exec(memo.trim());
  if (x) return x[1] === raidId ? { pool: `X:${x[2]}`, choice: x[3] === "Y" ? 0 : 1 } : null;
  const p = /^razkyn-pick:(\d+):([CD]):(\d{1,2}):(\d)$/.exec(memo.trim());
  if (!p || p[1] !== raidId) return null;
  const type = p[2] as PickType, w = Number(p[3]), choice = Number(p[4]);
  if (w >= PICKS[type].count || choice >= PICKS[type].choices.length) return null;
  return { pool: `${type}:${w}`, choice };
}
