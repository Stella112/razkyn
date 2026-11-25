// THE WIRE — newsroom (CLAUDE.md §7): WIRE LIVE (batched every ~3 s), WIRE EVENTS (game-rule events,
// tagged IN-GAME EVENT), WIRE DEBRIEF (≤ 120 words per raider after the raid).
// Inputs are sanitized public facts only (facts.ts). Every output passes the post-filter (filter.ts);
// on any failure the template line ships instead (templates.ts).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { REPO } from "../../scripts/spike-lib.ts";
import { DISTRICTS, sanitizeLog, type Fact } from "./facts.ts";
import { rejectReason, type FilterContext } from "./filter.ts";
import { WireLlm } from "./llm.ts";
import { headlineFact, isEvent, raiderName, templateDebrief, templateLine, type DebriefInput } from "./templates.ts";

export type WireTag = "LIVE" | "BREAKING" | "IN-GAME EVENT" | "DEBRIEF";
export type WireLine = {
  t: number; tag: WireTag; text: string; source: "llm" | "template";
  slot?: number; llmMs?: number; fallback?: string; headlines?: { title: string; url: string; ts: string }[];
};

export type Headline = { ts: string; title: string; url: string; source?: string };

/** Headlines for a revealed day. Entries without a timestamp or a source URL are never shipped. */
export function loadHeadlines(day: string): Headline[] {
  const f = join(REPO, "data", "mystery", "headlines.json");
  if (!existsSync(f)) return [];
  const all = JSON.parse(readFileSync(f, "utf8")) as Record<string, Partial<Headline>[]>;
  return (all[day] ?? []).filter((h): h is Headline =>
    typeof h.title === "string" && typeof h.ts === "string" && typeof h.url === "string" && /^https:\/\//.test(h.url));
}

const D = (d: number) => DISTRICTS[d];

/** Render facts as plain public text for the model. Only sanitized fields reach this function. */
function describe(f: Fact): string {
  const who = (s: number, b: boolean) => raiderName(s, b);
  switch (f.kind) {
    case "price": return `t=${f.t}s ${D(f.district)} ${f.bps >= 0 ? "+" : ""}${(f.bps / 100).toFixed(2)}% vs raid start, ${f.move30Bps >= 0 ? "+" : ""}${(f.move30Bps / 100).toFixed(2)}% in the last 30 s`;
    case "hazard": return `t=${f.t}s IN-GAME EVENT ${D(f.district)} hazard level ${f.level} (falling district; floor tiles drain 10 HP/s${f.level >= 2 ? ", area doubled" : ""})`;
    case "wake": return `t=${f.t}s IN-GAME EVENT ${D(f.district)} is up 2%+ on the raid: its dormant crates woke up`;
    case "exit_open": return `t=${f.t}s IN-GAME EVENT exit window ${f.window} opened (2 exits, 30 s)`;
    case "exposed": return `t=${f.t}s ${who(f.slot, f.bot)} started a trade at a ${D(f.district)} terminal; position public while trading`;
    case "crate_opened": return `t=${f.t}s ${who(f.slot, f.bot)} opened ${f.drop ? "a dropped backpack" : "a crate"} in ${D(f.district)}`;
    case "kill": return `t=${f.t}s ${who(f.slot, f.bot)} knocked out${f.by != null ? ` by ${who(f.by, !!f.byBot)}` : ""}; backpack dropped as a crate`;
    case "extract": return `t=${f.t}s ${who(f.slot, f.bot)} extracted`;
    case "raid_end": return `t=${f.t}s raid ended`;
  }
}

export class Wire {
  readonly lines: WireLine[] = [];
  readonly log: Fact[] = [];
  private pending: Fact[] = [];
  private timer: NodeJS.Timeout | null = null;
  private busy = false;
  private listeners = new Set<(l: WireLine) => void>();
  private lastEvent = new Map<string, number>();
  revealed = false;

  constructor(readonly mode: "mystery" | "live", readonly llm: Pick<WireLlm, "complete"> = new WireLlm(), readonly batchMs = 3000) {}

  subscribe(fn: (l: WireLine) => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  private publish(l: WireLine) { this.lines.push(l); for (const fn of this.listeners) fn(l); }

  private ctx(maxChars: number, headlines?: string[]): FilterContext {
    return { revealed: this.revealed, mode: this.mode, maxChars, headlines };
  }

  /** Accept a fact (re-sanitized here too, so callers cannot bypass the whitelist). */
  push(f: unknown) {
    const [s] = sanitizeLog([f]);
    if (!s) return;
    this.log.push(s);
    if (isEvent(s)) {
      // A district's hazard level can flicker around a threshold; announce the same event at most
      // once per 30 s of raid time.
      const key = `${s.kind}:${"district" in s ? s.district : ""}:${"level" in s ? s.level : ""}:${"window" in s ? s.window : ""}`;
      const last = this.lastEvent.get(key);
      if (last !== undefined && s.t - last < 30) return;
      this.lastEvent.set(key, s.t);
      void this.event(s);
    } else this.pending.push(s);
  }

  start() { this.timer = setInterval(() => void this.flush(), this.batchMs); }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }

  /** Model line with 1.5 s budget + post-filter; template otherwise. */
  private async line(prompt: string, fallback: string, maxChars: number): Promise<Pick<WireLine, "text" | "source" | "llmMs" | "fallback">> {
    const r = await this.llm.complete(prompt, 80);
    if (r.text) {
      const text = r.text.replace(/\s+/g, " ").replace(/^["“]|["”]$/g, "").trim();
      const why = rejectReason(text, this.ctx(maxChars));
      if (!why) return { text, source: "llm", llmMs: Math.round(r.ms) };
      return { text: fallback, source: "template", llmMs: Math.round(r.ms), fallback: `filtered: ${why}` };
    }
    return { text: fallback, source: "template", llmMs: Math.round(r.ms), fallback: r.why };
  }

  /** WIRE LIVE: one ≤ 90-char line for the facts gathered since the last batch. */
  async flush() {
    if (this.busy || !this.pending.length) return;
    this.busy = true;
    const batch = this.pending.splice(0);
    try {
      const top = headlineFact(batch)!;
      const tpl = templateLine(top);
      const prompt = `LIVE. Day revealed: ${this.revealed ? "yes" : "no"}. Facts since the last line:\n${batch.map(describe).join("\n")}\nMost newsworthy: ${describe(top)}`;
      const out = await this.line(prompt, tpl, 90);
      const breaking = top.kind === "kill" || top.kind === "extract" || (top.kind === "price" && Math.abs(top.move30Bps) >= 100);
      this.publish({ t: top.t, tag: breaking ? "BREAKING" : "LIVE", ...out });
    } finally { this.busy = false; }
  }

  /** WIRE EVENTS: hazards, wakes and exit windows, labelled IN-GAME EVENT. */
  async event(f: Fact) {
    const out = await this.line(`EVENT. Day revealed: ${this.revealed ? "yes" : "no"}.\n${describe(f)}`, templateLine(f), 90);
    this.publish({ t: f.t, tag: "IN-GAME EVENT", ...out });
  }

  /** WIRE DEBRIEF for one raider, after the raid (public log + their now-public results). */
  async debrief(d: DebriefInput, headlines: Headline[] = []): Promise<WireLine> {
    const mine = this.log.filter((f) => ("slot" in f && f.slot === d.slot) || (f.kind === "kill" && f.by === d.slot));
    const tpl = templateDebrief(d);
    const titles = headlines.map((h) => h.title);
    const prompt = [
      `DEBRIEF for ${raiderName(d.slot, d.bot)}. Day revealed: ${this.revealed ? "yes" : "no"}.`,
      `Outcome: ${d.extracted ? "extracted" : d.alive ? "alive, did not extract" : "knocked out"}; knockouts ${d.kills}; crates opened ${d.cratesOpened}; trades ${d.trades}.`,
      `Payout ${(d.payout / 1e6).toFixed(2)} dUSD on a ${(d.stake / 1e6).toFixed(0)} dUSD stake.`,
      `Market: best ${D(d.bestDistrict)} ${(d.bestBps / 100).toFixed(2)}%, worst ${D(d.worstDistrict)} ${(d.worstBps / 100).toFixed(2)}%.`,
      d.reveal ? `Revealed day: ${d.reveal.day}; districts tracked ${d.reveal.tracks.join(", ")}.` : "",
      `Their public log:\n${mine.map(describe).join("\n") || "(nothing public)"}`,
      `HEADLINES (quote only these, word for word, or none):\n${titles.length ? titles.map((t) => `- ${t}`).join("\n") : "(none)"}`,
    ].filter(Boolean).join("\n");
    const r = await this.llm.complete(prompt, 260);
    let text = tpl, source: WireLine["source"] = "template", fallback = r.why;
    if (r.text) {
      const cand = r.text.replace(/\s+/g, " ").trim();
      const words = cand.split(" ").length;
      const why = words > 120 ? `too long (${words} words)` : rejectReason(cand, this.ctx(900, titles));
      if (!why) { text = cand; source = "llm"; fallback = undefined; } else fallback = `filtered: ${why}`;
    }
    const cited = headlines.filter((h) => text.includes(h.title)).map((h) => ({ title: h.title, url: h.url, ts: h.ts }));
    const line: WireLine = { t: 300, tag: "DEBRIEF", text, source, slot: d.slot, llmMs: Math.round(r.ms), fallback, headlines: cited };
    this.publish(line);
    return line;
  }
}
