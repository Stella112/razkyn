// BOT routing around cover (DECISIONS #42), offline: for many random start/target pairs (targets at
// tile centres off cover, like crates, terminals and exits), planRoute must return a route whose legs
// never touch a cover tile, with and without hazard bands.
//   tsx scripts/check-bot-cover-sim.ts
import { COVER_RECTS, planRoute, tileBlocked } from "../keeper/src/bots.ts";

let seed = 7;
const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return ((seed >>> 0) % 1_000_000) / 1_000_000; };
const freeTile = () => { for (;;) { const tx = 1 + Math.floor(rnd() * 62), ty = 1 + Math.floor(rnd() * 38); if (!tileBlocked(tx, ty)) return [tx * 100 + 50, ty * 100 + 50]; } };
const onCover = (x: number, y: number) => tileBlocked(Math.floor(x / 100), Math.floor(y / 100));
const legHits = (a: number[], b: number[]) => {
  const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 10));
  for (let i = 0; i <= n; i++) if (onCover(a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n)) return true;
  return false;
};
const scenarios: [string, ([number, number] | null)[]][] = [["calm", [null, null, null]], ["all districts hazard", [[11, 28], [11, 28], [11, 28]]]];
let fail = 0;
for (const [name, bands] of scenarios) {
  let routed = 0, none = 0, hits = 0, viaGrid = 0;
  for (let i = 0; i < 4000; i++) {
    const a = freeTile(), b = freeTile();
    // A BOT on a danger band first escapes to a safe row (safeWalk); targets on a band are skipped.
    const inB = (p: number[]) => { const d = [[0, 20], [22, 42], [44, 63]].findIndex(([lo, hi]) => Math.floor(p[0] / 100) >= lo && Math.floor(p[0] / 100) <= hi); const r = d >= 0 ? bands[d] : null; return !!r && Math.floor(p[1] / 100) >= r[0] - 1 && Math.floor(p[1] / 100) <= r[1] + 1; };
    if (inB(a) || inB(b)) continue;
    const r = planRoute(a[0], a[1], b[0], b[1], bands);
    if (!r) { none++; continue; }
    routed++;
    if (r.wps.length > 4 || r.wps.some(([x, y]) => x % 100 === 50 && y % 100 === 50)) viaGrid++;
    const pts = [a, ...r.wps, b];
    for (let k = 1; k < pts.length; k++) if (legHits(pts[k - 1], pts[k])) { hits++; break; }
  }
  const ok = hits === 0 && none === 0;
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${routed} routes, ${none} with no route, ${hits} touching cover, ~${viaGrid} via the grid fallback`);
}
console.log(`cover blocks: ${COVER_RECTS.length}`);
process.exit(fail ? 1 : 0);
