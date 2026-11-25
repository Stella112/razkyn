// §9 test 10 — WIRE leak: feed THE WIRE a log that includes a live private backpack (and other
// private fields). Its model prompts and its output must never mention them.
// Also checks the spoiler post-filter and that every template line passes it.
//   tsx tests/devnet/test10-wire-leak.ts
// With ANTHROPIC_API_KEY set (gitignored .env) it also runs the real model path.
import assert from "node:assert/strict";
import { Wire } from "../../keeper/wire/wire.ts";
import { WireLlm, type LlmResult } from "../../keeper/wire/llm.ts";
import { rejectReason } from "../../keeper/wire/filter.ts";
import { templateDebrief, templateLine } from "../../keeper/wire/templates.ts";
import { sanitizeFact, type Fact } from "../../keeper/wire/facts.ts";
import { saveEvidence } from "../../scripts/spike-lib.ts";

// Private values that must never leave: a live backpack, a private position, a VRF seed, a crate's contents.
const SECRET_UNITS = 7_654_321;
const SECRET_UNITS2 = 4_242_424;
const SECRET_X = 3_917, SECRET_Y = 2_583;
const SECRET_SEED = "9f1c0ffee5eed";
const secrets = [String(SECRET_UNITS), "7,654,321", String(SECRET_UNITS2), "4,242,424", String(SECRET_X), String(SECRET_Y), SECRET_SEED, "backpack:", "seed"];

const poisonedLog: unknown[] = [
  { kind: "price", t: 30, district: 2, bps: -240, move30Bps: -180, currentPrice: 976_000, ticker: "SOLUSDT" },
  { kind: "backpack", t: 31, slot: 1, backpack: [SECRET_UNITS, 0, SECRET_UNITS2] },
  { kind: "crate_opened", t: 32, slot: 1, bot: true, district: 2, drop: false, units: [SECRET_UNITS, 0, 0], x: SECRET_X, y: SECRET_Y },
  { kind: "exposed", t: 40, slot: 3, bot: false, district: 0, backpack: [SECRET_UNITS2, 0, 0], privX: SECRET_X, privY: SECRET_Y },
  { kind: "kill", t: 55, slot: 3, bot: false, by: 1, byBot: true, victimBackpack: [SECRET_UNITS2, 0, 0] },
  { kind: "hazard", t: 60, district: 2, level: 1, seed: SECRET_SEED },
  { kind: "secret", t: 61, seed: SECRET_SEED, slice: [1, 2, 3] },
  { kind: "extract", t: 250, slot: 1, bot: true, backpack: [SECRET_UNITS, 0, SECRET_UNITS2] },
];

const results: Record<string, unknown> = {};
const leaks = (s: string) => secrets.filter((x) => s.toLowerCase().includes(x.toLowerCase()));

// --- 1. Sanitizer drops private fields and private-only records.
const clean = poisonedLog.map(sanitizeFact).filter(Boolean) as Fact[];
assert.equal(clean.length, 6, "backpack and secret records dropped");
assert.deepEqual(leaks(JSON.stringify(clean)), [], "sanitized facts carry no private value");
results.sanitized = clean;

// --- 2. A model that tries to leak and spoil: prompts recorded, outputs must be replaced.
class HostileLlm {
  prompts: string[] = [];
  async complete(prompt: string): Promise<LlmResult> {
    this.prompts.push(prompt);
    return { text: `Raider 4 hauling ${SECRET_UNITS.toLocaleString("en-US")} units at ${SECRET_X},${SECRET_Y}, SOL $142.10 on 14 March 2024`, ms: 5 };
  }
}
async function runWire(llm: { complete: (p: string, n: number) => Promise<LlmResult> }, revealed: boolean) {
  const w = new Wire("mystery", llm, 60_000);
  w.revealed = revealed;
  for (const f of poisonedLog) w.push(f);
  await new Promise((r) => setTimeout(r, 50)); // let event lines settle
  await w.flush();
  await w.debrief({ slot: 1, bot: true, extracted: true, alive: true, kills: 1, cratesOpened: 1, trades: 0, payout: 12_345_678, stake: 10_000_000, bestDistrict: 0, bestBps: 120, worstDistrict: 2, worstBps: -240, reveal: revealed ? { day: "2024-03-14", tracks: ["SOLUSDT", "BTCUSDT", "ETHUSDT"] } : null });
  return w;
}
const hostile = new HostileLlm();
const w1 = await runWire(hostile, false);
const promptLeaks = hostile.prompts.flatMap(leaks);
assert.deepEqual(promptLeaks, [], `prompts leak ${promptLeaks}`);
for (const l of w1.lines) {
  assert.deepEqual(leaks(l.text), [], `output leaks: ${l.text}`);
  assert.equal(l.source, "template", `hostile output must be replaced: ${l.text}`);
}
results.hostile = { prompts: hostile.prompts, lines: w1.lines };
console.log(`hostile model: ${hostile.prompts.length} prompts, 0 private values in prompts; ${w1.lines.length} lines, all replaced by templates`);

// --- 3. Spoiler filter (pre-reveal Mystery).
const ctx = { revealed: false, mode: "mystery" as const, maxChars: 90 };
const bad = ["BTC rips 4% in a minute", "Solana slides", "Harbor at $142", "Tower hits 67,000", "Crash of March 2024", "Like 2022 all over again",
  "Binance halts withdrawals", "Fed speaks, Factory dumps", "Harbor sits at 142.37", "x".repeat(91), "see https://example.com"];
const good = ["Harbor −2.4% in 30s, hazard tiles live", "BOT 2 drops Raider 4 in Factory", "Tower rips +1.2% in 30s, +3.0% on the raid", "Exit window 2 open: two exits live for 30s"];
for (const s of bad) assert.ok(rejectReason(s, ctx), `should reject: ${s}`);
for (const s of good) assert.equal(rejectReason(s, ctx), null, `should pass: ${s}`);
assert.ok(rejectReason('Quote: "Exchange halts all withdrawals today"', { revealed: true, mode: "mystery", maxChars: 900, headlines: [] }), "invented quote rejected");
assert.ok(rejectReason("Coinbase pops", { revealed: false, mode: "live", maxChars: 90 }), "live: no company names");
console.log(`spoiler filter: ${bad.length}/${bad.length} spoilers rejected, ${good.length}/${good.length} clean lines pass`);

// --- 4. Every template passes the filter.
const all: Fact[] = [
  { kind: "price", t: 1, district: 0, bps: 512, move30Bps: 130 }, { kind: "price", t: 1, district: 1, bps: -12, move30Bps: -3 },
  { kind: "hazard", t: 1, district: 2, level: 1 }, { kind: "hazard", t: 1, district: 2, level: 2 }, { kind: "wake", t: 1, district: 0 },
  { kind: "exit_open", t: 120, window: 1, exits: [0, 3] }, { kind: "exposed", t: 1, slot: 7, bot: true, district: 1 },
  { kind: "crate_opened", t: 1, slot: 0, bot: false, district: 2, drop: true }, { kind: "kill", t: 1, slot: 2, bot: true, by: null, byBot: null },
  { kind: "kill", t: 1, slot: 2, bot: true, by: 5, byBot: false }, { kind: "extract", t: 1, slot: 4, bot: true }, { kind: "raid_end", t: 300 },
];
for (const f of all) assert.equal(rejectReason(templateLine(f), ctx), null, `template fails filter: ${templateLine(f)}`);
const deb = templateDebrief({ slot: 0, bot: false, extracted: false, alive: false, kills: 0, cratesOpened: 2, trades: 1, payout: 4_000_000, stake: 10_000_000, bestDistrict: 0, bestBps: 300, worstDistrict: 1, worstBps: -500, reveal: null });
assert.equal(rejectReason(deb, { revealed: true, mode: "mystery", maxChars: 900 }), null);
assert.ok(deb.split(" ").length <= 120);
console.log(`templates: ${all.length}/${all.length} lines + debrief pass the filter`);

// --- 5. Real model (only with a key): same poisoned log, outputs checked.
const real = new WireLlm();
if (real.available) {
  const w2 = await runWire(real, false);
  for (const l of w2.lines) assert.deepEqual(leaks(l.text), [], `real model output leaks: ${l.text}`);
  results.real = w2.lines;
  console.log(`real model (${w2.lines.filter((l) => l.source === "llm").length}/${w2.lines.length} model lines):`);
  for (const l of w2.lines) console.log(`  [${l.tag}] ${l.source} ${l.llmMs} ms${l.fallback ? ` (${l.fallback})` : ""}: ${l.text}`);
} else {
  results.real = "skipped: no ANTHROPIC_API_KEY";
  console.log("real model: skipped (no ANTHROPIC_API_KEY); template path only");
}

saveEvidence("test10-wire-leak", results);
console.log("TEST 10 PASS: no private value reached a prompt or an output");
