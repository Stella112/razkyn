// THE WIRE — template lines. Used when no model is configured, when a call takes longer than
// 1.5 s, fails, refuses, or when its output fails the post-filter. The demo never waits on the LLM.
// Templates use only relative moves, generic district names and slot labels, so they always pass
// the spoiler filter (checked in tests/devnet/test10-wire-leak.ts).
import type { Fact } from "./facts.ts";
import { DISTRICTS } from "./facts.ts";

export const raiderName = (slot: number, bot: boolean) => `${bot ? "BOT " : "Raider "}${slot + 1}`;
const pct = (bps: number) => `${bps >= 0 ? "+" : "−"}${(Math.abs(bps) / 100).toFixed(1)}%`;
const D = (d: number) => DISTRICTS[d] ?? "District";

/** Facts that are game-rule events (narrated as IN-GAME EVENT lines). */
export const isEvent = (f: Fact) => f.kind === "hazard" || f.kind === "wake" || f.kind === "exit_open" || f.kind === "market_event";

const PRIORITY: Record<Fact["kind"], number> = {
  kill: 9, extract: 8, exposed: 7, crate_opened: 5, hazard: 6, wake: 6, exit_open: 6, market_event: 8, pick_result: 7, raid_end: 10, price: 1,
};

/** Pick the most newsworthy fact of a batch (ties: latest). */
export function headlineFact(batch: Fact[]): Fact | null {
  let best: Fact | null = null;
  for (const f of batch) {
    const p = f.kind === "price" ? (Math.abs(f.move30Bps) >= 50 ? 4 : 1) : PRIORITY[f.kind];
    const bp = best ? (best.kind === "price" ? (Math.abs(best.move30Bps) >= 50 ? 4 : 1) : PRIORITY[best.kind]) : -1;
    if (p >= bp) best = f;
  }
  return best;
}

export function templateLine(f: Fact): string {
  switch (f.kind) {
    case "price":
      return Math.abs(f.move30Bps) >= 50
        ? `${D(f.district)} ${f.move30Bps > 0 ? "rips" : "slides"} ${pct(f.move30Bps)} in 30s, ${pct(f.bps)} on the raid`
        : `${D(f.district)} drifts, ${pct(f.bps)} since the drop`;
    case "hazard":
      return f.level >= 2 ? `MARKET CRASH: ${D(f.district)} floor caves in, hazard zone doubled` : `VOLATILITY ALERT: ${D(f.district)} cracks open, hazard tiles at 10 HP/s`;
    case "wake":
      return `LIQUIDITY SURGE: ${D(f.district)} up 2%+, dormant crates wake`;
    case "exit_open":
      return `EXTRACTION WATCH: exit window ${f.window} open, two exits for 30s`;
    case "exposed":
      return `${raiderName(f.slot, f.bot)} trading in ${D(f.district)}, position exposed`;
    case "crate_opened":
      return f.drop ? `${raiderName(f.slot, f.bot)} loots a dropped backpack in ${D(f.district)}` : `${raiderName(f.slot, f.bot)} cracks a crate in ${D(f.district)}`;
    case "kill":
      return f.by != null ? `${raiderName(f.by, !!f.byBot)} drops ${raiderName(f.slot, f.bot)}, backpack on the floor` : `${raiderName(f.slot, f.bot)} is down, backpack on the floor`;
    case "extract":
      return `${raiderName(f.slot, f.bot)} extracts, bag banked`;
    case "market_event":
      return f.event === 1 ? `TRADING HALT: ${D(f.district)} terminals frozen for 30s`
        : f.event === 2 ? "RATE SHOCK: hazards trigger early across the map for 30s"
        : `EARNINGS SURPRISE: ${D(f.district)} crates wake, loot unlocked`;
    case "pick_result": {
      const crowd = f.bets ? ` · ${f.pct}% of spectators called it${f.mult10 ? `, paid ${(f.mult10 / 10).toFixed(1)}×` : ""}` : "";
      if (f.pick === 0) return `LIVE PICK: ${f.outcome === 3 ? "no district cracked" : `${D(f.outcome)} cracked first`}${crowd}`;
      return `LIVE PICK: ${f.outcome === 0 ? "a raider went down" : "nobody went down"} in that 30 s${crowd}`;
    }
    case "raid_end":
      return "Raid over. Settlement is on its way to the base layer";
  }
}

export type DebriefInput = {
  slot: number;
  bot: boolean;
  extracted: boolean;
  alive: boolean;
  kills: number;
  cratesOpened: number;
  trades: number;
  /** dUSD base units (6 decimals), public after end_raid. */
  payout: number;
  stake: number;
  bestDistrict: number;
  bestBps: number;
  worstDistrict: number;
  worstBps: number;
  reveal?: { day: string; title?: string; tracks: string[] } | null;
};

export function templateDebrief(d: DebriefInput): string {
  const who = raiderName(d.slot, d.bot);
  const outcome = d.extracted ? "made it out" : d.alive ? "never reached an exit" : "went down in the fog";
  const pnl = ((d.payout - d.stake) / d.stake) * 100;
  const parts = [
    `${who} ${outcome}.`,
    `${d.cratesOpened} crate${d.cratesOpened === 1 ? "" : "s"} opened, ${d.trades} trade${d.trades === 1 ? "" : "s"} under fire, ${d.kills} knockout${d.kills === 1 ? "" : "s"}.`,
    `${D(d.bestDistrict)} was the market's best district (${pct(d.bestBps)}); ${D(d.worstDistrict)} the worst (${pct(d.worstBps)}).`,
    `Payout ${(d.payout / 1e6).toFixed(2)} dUSD on a ${(d.stake / 1e6).toFixed(0)} dUSD stake (${pnl >= 0 ? "+" : ""}${pnl.toFixed(1)}%).`,
  ];
  if (d.reveal) parts.push(`The tape was ${d.reveal.title ? `${d.reveal.title}, ` : ""}${d.reveal.day}: ${d.reveal.tracks.join(", ")}.`);
  return parts.join(" ");
}
