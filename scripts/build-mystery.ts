// Build the Mystery Market Day set (CLAUDE.md §6.4) from free Binance 1-minute spot klines.
//   - Each day: SOLUSDT (Tower), BTCUSDT (Factory), ETHUSDT (Harbor), one 300-minute window,
//     closes rebased so step 0 = 100.0000 (index ×10^4 = 1_000_000), u32.
//   - data_hash = sha256(slice as u32 LE, step-major [step][asset]) — same bytes as RaidSecret.
//   - leaf = sha256(day_id(10 B) ‖ slice_start(u32 LE) ‖ data_hash ‖ headlines_hash).
//   - Leaves ordered by leaf hash (the index reveals nothing about the date); parent =
//     sha256(left ‖ right); an odd node at a level is paired with itself.
// Public:  data/mystery/merkle.json (root, count, leaf hashes), data/mystery/SOURCES.md.
// Private (gitignored until after the demo): data/mystery/private/{days.json, slices/*.json}.
// The slices are private too: published, they would let a player match the first live steps
// and read the rest of the day in advance (DECISIONS.md #17).
// usage: tsx scripts/build-mystery.ts
import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { REPO, retryingFetch } from "./spike-lib.ts";

const SYMBOLS = ["SOLUSDT", "BTCUSDT", "ETHUSDT"]; // district 0, 1, 2
const STEPS = 300;
const PRICE_ONE = 1_000_000;
// Window rule: "volatile" days use the 300-minute window with the largest BTC high–low range
// (by close); "ordinary" days use a fixed 14:00–19:00 UTC window. Dates chosen by the builder;
// no claim is made here about what happened on them (headlines come from headlines.json, M6).
const DAYS: { day: string; kind: "volatile" | "ordinary" }[] = [
  ...["2021-05-19", "2021-09-07", "2021-12-04", "2022-05-09", "2022-05-12", "2022-06-13", "2022-11-08",
    "2022-11-09", "2023-03-10", "2023-03-13", "2024-01-11", "2024-03-05", "2024-08-05", "2024-11-06", "2024-12-05"]
    .map((day) => ({ day, kind: "volatile" as const })),
  ...["2021-02-14", "2021-10-03", "2022-02-22", "2023-04-18", "2023-07-19", "2023-10-02", "2024-06-12", "2025-02-10"]
    .map((day) => ({ day, kind: "ordinary" as const })),
];
const ORDINARY_START = 14 * 60;

const sha = (...parts: Buffer[]) => createHash("sha256").update(Buffer.concat(parts)).digest();
const url = (sym: string, day: string) => `https://data.binance.vision/data/spot/daily/klines/${sym}/1m/${sym}-1m-${day}.zip`;

/** Minimal single-entry zip reader (local file header + raw deflate). */
function unzipFirst(buf: Buffer): Buffer {
  if (buf.readUInt32LE(0) !== 0x04034b50) throw new Error("not a zip");
  const method = buf.readUInt16LE(8), csize = buf.readUInt32LE(18), nlen = buf.readUInt16LE(26), xlen = buf.readUInt16LE(28);
  const data = buf.subarray(30 + nlen + xlen, 30 + nlen + xlen + csize);
  return method === 8 ? inflateRawSync(data) : Buffer.from(data);
}

async function closes(sym: string, day: string): Promise<number[] | null> {
  const r = await retryingFetch(url(sym, day));
  if (r.status !== 200) return null;
  const rows = unzipFirst(Buffer.from(await r.arrayBuffer())).toString("utf8").trim().split("\n");
  const c = rows.map((l) => Number(l.split(",")[4])); // close
  return c.length === 1440 && c.every((x) => x > 0) ? c : null;
}

function bestWindow(btc: number[]): number {
  let best = 0, bestRange = -1;
  for (let s = 0; s + STEPS <= btc.length; s++) {
    let lo = Infinity, hi = -Infinity;
    for (let i = s; i < s + STEPS; i++) { lo = Math.min(lo, btc[i]); hi = Math.max(hi, btc[i]); }
    const range = (hi - lo) / btc[s];
    if (range > bestRange) { bestRange = range; best = s; }
  }
  return best;
}

const headlinesFile = join(REPO, "data", "mystery", "headlines.json");
const headlines: Record<string, unknown[]> = existsSync(headlinesFile) ? JSON.parse(readFileSync(headlinesFile, "utf8")) : {};
const canonical = (v: unknown): string =>
  Array.isArray(v) ? `[${v.map(canonical).join(",")}]`
  : v && typeof v === "object" ? `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(",")}}`
  : JSON.stringify(v);

const priv = join(REPO, "data", "mystery", "private");
mkdirSync(join(priv, "slices"), { recursive: true });
type Leaf = { day: string; kind: string; sliceStart: number; dataHash: string; headlinesHash: string; leaf: string; urls: string[] };
const leaves: Leaf[] = [];
const skipped: string[] = [];
for (const { day, kind } of DAYS) {
  const series = await Promise.all(SYMBOLS.map((s) => closes(s, day)));
  if (series.some((s) => !s)) { skipped.push(day); console.warn(`skip ${day}: missing data`); continue; }
  const [sol, btc, eth] = series as number[][];
  const start = kind === "volatile" ? bestWindow(btc) : ORDINARY_START;
  const slice = new Uint32Array(STEPS * 3);
  for (let t = 0; t < STEPS; t++) {
    [sol, btc, eth].forEach((c, a) => { slice[t * 3 + a] = Math.round((c[start + t] / c[start]) * PRICE_ONE); });
  }
  const bytes = Buffer.from(slice.buffer);
  const dataHash = sha(bytes);
  const hh = sha(Buffer.from(canonical(headlines[day] ?? []), "utf8"));
  const sliceStart = Buffer.alloc(4); sliceStart.writeUInt32LE(start);
  const leaf = sha(Buffer.from(day, "ascii"), sliceStart, dataHash, hh);
  leaves.push({ day, kind, sliceStart: start, dataHash: dataHash.toString("hex"), headlinesHash: hh.toString("hex"), leaf: leaf.toString("hex"), urls: SYMBOLS.map((s) => url(s, day)) });
  writeFileSync(join(priv, "slices", `${day}.json`), JSON.stringify({ day, sliceStart: start, symbols: SYMBOLS, steps: Array.from(slice) }));
  console.log(`${day} ${kind.padEnd(8)} window ${String(Math.floor(start / 60)).padStart(2, "0")}:${String(start % 60).padStart(2, "0")} UTC  end Δ SOL ${((slice[897] / PRICE_ONE - 1) * 100).toFixed(2)}% BTC ${((slice[898] / PRICE_ONE - 1) * 100).toFixed(2)}% ETH ${((slice[899] / PRICE_ONE - 1) * 100).toFixed(2)}%`);
}

leaves.sort((a, b) => a.leaf.localeCompare(b.leaf));
// Merkle levels.
const levels: Buffer[][] = [leaves.map((l) => Buffer.from(l.leaf, "hex"))];
while (levels[levels.length - 1].length > 1) {
  const cur = levels[levels.length - 1], next: Buffer[] = [];
  for (let i = 0; i < cur.length; i += 2) next.push(sha(cur[i], cur[i + 1] ?? cur[i]));
  levels.push(next);
}
const root = levels[levels.length - 1][0];
const proofOf = (index: number) => {
  const p: string[] = [];
  let i = index;
  for (let k = 0; k < levels.length - 1; k++) {
    const sib = levels[k][i ^ 1] ?? levels[k][i];
    p.push(sib.toString("hex"));
    i >>= 1;
  }
  return p;
};
writeFileSync(join(REPO, "data", "mystery", "merkle.json"), JSON.stringify({
  root: root.toString("hex"), leafCount: leaves.length, leaves: leaves.map((l) => l.leaf),
  scheme: "leaf=sha256(day_id[10]||slice_start u32le||data_hash||headlines_hash); node=sha256(left||right); odd node paired with itself; leaves sorted by hash",
}, null, 2));
writeFileSync(join(priv, "days.json"), JSON.stringify(leaves.map((l, index) => ({ index, ...l, proof: proofOf(index) })), null, 2));
const sources = [
  "# Mystery Market Day sources", "",
  "All price data: Binance public spot klines, 1-minute interval, from https://data.binance.vision (free).",
  "Tower = SOLUSDT, Factory = BTCUSDT, Harbor = ETHUSDT. Each day is one 300-minute window, closes rebased to 100.0000 at step 0.",
  "Window rule: \"volatile\" days use the 300-minute window with the largest BTC high–low range; \"ordinary\" days use 14:00–19:00 UTC.",
  "Which dates are in the set is private until after the demo (the files below list only what was fetched).", "",
  `Days fetched: ${leaves.length}. Skipped (data missing): ${skipped.join(", ") || "none"}.`, "",
  "Files downloaded (one per symbol per day):", "",
  ...SYMBOLS.map((s) => `- https://data.binance.vision/data/spot/daily/klines/${s}/1m/${s}-1m-<YYYY-MM-DD>.zip`),
];
writeFileSync(join(REPO, "data", "mystery", "SOURCES.md"), sources.join("\n") + "\n");
console.log(JSON.stringify({ root: root.toString("hex"), leafCount: leaves.length, skipped, depth: levels.length - 1 }, null, 2));
