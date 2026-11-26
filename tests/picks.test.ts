// RAZKYN LIVE micro-picks (keeper/src/picks.ts): owner add-on Part B tests.
//   npx tsx tests/picks.test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EXTRACTS_LOCK, PICKS, isLate, leaderboard, parimutuel, parseMemo, resolve, schedule, type PubEvent } from "../keeper/src/picks.ts";

const start = 1_800_000_000;
const W = schedule(start);
const win = (t: "C" | "D", n: number) => W.find((w) => w.type === t && w.window === n)!;
let passed = 0;
const ok = (name: string, f: () => void) => { f(); passed++; console.log(`  ✓ ${name}`); };

console.log("schedule / locks");
ok("5 NEXT CRACK windows every 60 s, lock +5 s; 10 KNOCKOUT windows every 30 s, lock +3 s", () => {
  assert.equal(W.filter((w) => w.type === "C").length, PICKS.C.count);
  assert.equal(W.filter((w) => w.type === "D").length, PICKS.D.count);
  assert.deepEqual([win("C", 2).openTs - start, win("C", 2).lockTs - start, win("C", 2).endTs - start], [120, 125, 185]);
  assert.deepEqual([win("D", 9).openTs - start, win("D", 9).lockTs - start, win("D", 9).endTs - start], [270, 273, 300]);
});
ok("a bet at or after lock_ts is rejected (chain block time); one at lock - 1 is accepted", () => {
  const c1 = win("C", 1);
  assert.equal(isLate("C:1", c1.lockTs, start, W), true);
  assert.equal(isLate("C:1", c1.lockTs + 40, start, W), true);
  assert.equal(isLate("C:1", c1.lockTs - 1, start, W), false);
  assert.equal(isLate("C:1", c1.openTs - 1, start, W), true, "before the window opened");
  assert.equal(isLate("X:3", start + EXTRACTS_LOCK, start, W), true);
  assert.equal(isLate("X:3", start + EXTRACTS_LOCK - 1, start, W), false);
  assert.equal(isLate("D:0", start - 5, 0, []), false, "undecided before the raid starts (re-checked at start)");
});
ok("memo parsing: only this raid, valid windows and choices", () => {
  assert.deepEqual(parseMemo("razkyn-pick:42:C:3:2", "42"), { pool: "C:3", choice: 2 });
  assert.deepEqual(parseMemo("razkyn-bet:42:5:N", "42"), { pool: "X:5", choice: 1 });
  assert.equal(parseMemo("razkyn-pick:43:C:3:2", "42"), null);
  assert.equal(parseMemo("razkyn-pick:42:C:5:0", "42"), null, "no window 5");
  assert.equal(parseMemo("razkyn-pick:42:D:1:2", "42"), null, "D has 2 choices");
});

console.log("resolution (public events only)");
ok("NEXT CRACK: first district to crack after lock wins; a crack before lock does not count", () => {
  const c = win("C", 1); // open 60, lock 65, end 125
  const ev: PubEvent[] = [{ ts: start + 62, kind: "crack", district: 0 }, { ts: start + 90, kind: "crack", district: 2 }, { ts: start + 100, kind: "crack", district: 1 }];
  assert.equal(resolve(c, ev, start + 91), 2);
  assert.equal(resolve(c, [{ ts: start + 62, kind: "crack", district: 0 }], start + 100), null, "still open");
  assert.equal(resolve(c, [{ ts: start + 62, kind: "crack", district: 0 }], c.endTs), 3, "NONE at the end");
});
ok("KNOCKOUT IN 30 S: YES on the first knockout in the watched 30 s, NO at the end", () => {
  const d = win("D", 4); // open 120, lock 123, end 153
  assert.equal(resolve(d, [{ ts: start + 140, kind: "death", slot: 3 }], start + 141), 0);
  assert.equal(resolve(d, [{ ts: start + 121, kind: "death", slot: 3 }], start + 140), null, "before lock: ignored");
  assert.equal(resolve(d, [{ ts: start + 160, kind: "death", slot: 3 }], d.endTs), 1, "after end: NO");
});

console.log("payouts");
ok("pools are fully distributed (no dust) or refunded — 2,000 random pools", () => {
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 2000; k++) {
    const n = 1 + Math.floor(rnd() * 9), choices = 2 + Math.floor(rnd() * 3);
    const stakes = Array.from({ length: n }, (_, i) => ({ bettor: `b${Math.floor(rnd() * 5)}`, choice: Math.floor(rnd() * choices), amount: 1 + Math.floor(rnd() * 100), order: i }));
    const winning = Math.floor(rnd() * choices);
    const out = parimutuel(stakes, winning);
    const total = stakes.reduce((a, s) => a + s.amount, 0);
    assert.equal(out.reduce((a, o) => a + o.amount, 0), total, `pool ${k} sums to its total`);
    assert.ok(out.every((o) => Number.isInteger(o.amount) && o.amount >= 0));
    if (!stakes.some((s) => s.choice === winning)) assert.ok(out.every((o) => o.reason === "refund"));
    else assert.ok(out.every((o) => o.reason === "win"));
  }
});
ok("example: 30 on FACTORY + 10 on HARBOR, FACTORY wins → winner takes 40", () => {
  assert.deepEqual(parimutuel([{ bettor: "a", choice: 1, amount: 30, order: 0 }, { bettor: "b", choice: 2, amount: 10, order: 1 }], 1), [{ bettor: "a", amount: 40, reason: "win" }]);
});

console.log("leaderboard");
ok("ranks by correct picks, then net; tracks the best streak", () => {
  const rows = leaderboard([
    { bettor: "a", ts: 1, correct: true, staked: 10, paid: 20 }, { bettor: "a", ts: 2, correct: true, staked: 10, paid: 15 },
    { bettor: "a", ts: 3, correct: false, staked: 10, paid: 0 }, { bettor: "a", ts: 4, correct: true, staked: 10, paid: 30 },
    { bettor: "b", ts: 1, correct: true, staked: 50, paid: 60 },
  ]);
  assert.equal(rows[0].bettor, "a"); assert.equal(rows[0].correct, 3); assert.equal(rows[0].bestStreak, 2); assert.equal(rows[0].net, 25);
  assert.equal(rows[1].bettor, "b"); assert.equal(rows[1].net, 10);
});

console.log("privacy");
ok("the resolver touches no private account: picks.ts and bets.ts never derive RaiderPrivate, View, Crate or RaidSecret", () => {
  for (const f of ["keeper/src/picks.ts", "keeper/src/bets.ts"]) {
    const src = readFileSync(f, "utf8");
    for (const s of ['"rprv"', '"view"', '"crate"', '"secret"', "rprv(", "crateAcc(", "readMine", "teeK"]) assert.ok(!src.includes(s), `${f} references ${s}`);
  }
  // Inputs are public facts only: hazard (district crack) and kill, from the non-member WIRE feed.
  const bets = readFileSync("keeper/src/bets.ts", "utf8");
  const used = [...bets.matchAll(/f\.kind === "(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(used)].sort(), ["hazard", "kill"]);
});
console.log(`\n${passed} passed`);
