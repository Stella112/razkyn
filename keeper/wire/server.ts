// Keeper HTTP API for the client (public data only; no auth needed):
//   GET /lobby                 -> current raid the keeper runs (id, PDA, mode, slots, human slots, phase)
//   GET /reports/:raidId       -> Market Raid Report file ({report, hash, postReportSig})
//   GET /wire/:raidId          -> THE WIRE lines so far (JSON)
//   GET /wire/:raidId/stream   -> THE WIRE as Server-Sent Events, one `data:` JSON line per WireLine
//   POST /avatar               -> a player sets their cosmetic avatar, signed with the seat raid key (avatars.ts)
//   GET /avatars/:raidId       -> verified avatars by slot
//   POST /profile              -> a player sets their lobby handle + READY, signed with the seat raid key
//   GET /profiles/:raidId      -> verified handles + ready flags by slot
// THE WIRE lines are public by construction (public facts + post-filter); reports are published
// after settlement; the lobby holds only public ids.
import { createServer, type Server } from "node:http";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { REPO } from "../../scripts/spike-lib.ts";
import type { Wire, WireLine } from "./wire.ts";
import type { BetBook } from "../src/bets.ts";
import { AvatarBook } from "./avatars.ts";

export type Lobby = {
  raidId: string;
  raid: string;
  mode: "mystery" | "live" | "live-markets";
  slots: number;
  humanSlots: number[];
  /** idle: no raid, a player may open one (serve mode); lobby: waiting for players; setup: delegating/seeding; live; settling; done */
  phase: "idle" | "lobby" | "setup" | "live" | "settling" | "done";
  /** Serve mode, idle: the previous raid (for its report) and why the last open failed, if it did. */
  last?: { raidId: string; reportHash?: string; error?: string };
  /** Serve mode, idle: raids left this hour and whether the keeper has SOL for one. */
  canOpen?: { ok: boolean; reason?: string };
  joinDeadline: number; // unix ms
  startTs?: number;
  reportHash?: string;
};

/** Event title for an already-revealed Mystery day (data/mystery/private/events.json), for older reports. */
function eventTitle(day: string): string | null {
  try {
    const f = join(REPO, "data", "mystery", "private", "events.json");
    if (!existsSync(f)) return null;
    return (JSON.parse(readFileSync(f, "utf8")) as { day: string; title: string }[]).find((e) => e.day === day)?.title ?? null;
  } catch { return null; }
}

export class WireServer {
  private wires = new Map<string, Wire>();
  private books = new Map<string, BetBook>();
  private avatars = new AvatarBook();
  private server: Server;
  lobby: Lobby | null = null;
  /** Serve mode only: open a raid on request. */
  onOpen: ((mode: "mystery" | "live" | "live-markets") => Promise<{ ok: boolean; error?: string; raidId?: string }>) | null = null;
  /** Serve mode only: send a little devnet SOL to a player's empty wallet so they can pay the join fee. */
  onFund: ((wallet: string) => Promise<{ ok: boolean; error?: string; sig?: string }>) | null = null;

  constructor(readonly port = Number(process.env.WIRE_PORT ?? 8787)) {
    this.server = createServer((req, res) => {
      res.setHeader("access-control-allow-origin", "*");
      res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
      res.setHeader("access-control-allow-headers", "content-type");
      const url = (req.url ?? "").split("?")[0];
      const json = (code: number, body: unknown) => res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify(body));
      if (req.method === "OPTIONS") return res.writeHead(204).end();
      if (url === "/lobby" && req.method === "GET") return json(this.lobby ? 200 : 404, this.lobby ?? { error: "no raid" });
      // Serve mode: a player asks the keeper to open a raid ({"mode":"mystery"|"live"}).
      if (url === "/lobby/open" && req.method === "POST") {
        if (!this.onOpen) return json(404, { error: "this keeper runs a fixed raid (not serve mode)" });
        let body = "";
        req.on("data", (c) => { body += c; if (body.length > 1000) req.destroy(); });
        req.on("end", async () => {
          let mode: "mystery" | "live" | "live-markets" = "mystery";
          try { const m = JSON.parse(body || "{}").mode; mode = m === "live" || m === "live-markets" ? m : "mystery"; } catch { /* default */ }
          const r = await this.onOpen!(mode);
          json(r.ok ? 202 : 409, r);
        });
        return;
      }
      // Join-fee gas for a fresh devnet wallet ({"wallet":"<base58>"}); limits live in serve.ts.
      if (url === "/fund" && req.method === "POST") {
        if (!this.onFund) return json(404, { error: "funding is not offered by this keeper" });
        let body = "";
        req.on("data", (c) => { body += c; if (body.length > 300) req.destroy(); });
        req.on("end", async () => {
          let wallet = "";
          try { wallet = String(JSON.parse(body || "{}").wallet ?? ""); } catch { return json(400, { error: "bad json" }); }
          const r = await this.onFund!(wallet).catch((e) => ({ ok: false, error: String(e).slice(0, 120) }));
          json(r.ok ? 200 : 409, r);
        });
        return;
      }
      // Shared avatars (cosmetic; verified against the seat raid key on-chain).
      if (url === "/avatar" && req.method === "POST") {
        let body = "";
        req.on("data", (c) => { body += c; if (body.length > 1000) req.destroy(); });
        req.on("end", async () => {
          let parsed: Record<string, unknown> = {};
          try { parsed = JSON.parse(body || "{}"); } catch { return json(400, { error: "bad json" }); }
          const err = await this.avatars.submit(parsed).catch((e) => `error: ${String(e).slice(0, 80)}`);
          json(err ? 400 : 200, err ? { error: err } : { ok: true });
        });
        return;
      }
      if (url === "/profile" && req.method === "POST") {
        let body = "";
        req.on("data", (c) => { body += c; if (body.length > 1000) req.destroy(); });
        req.on("end", async () => {
          let parsed: Record<string, unknown> = {};
          try { parsed = JSON.parse(body || "{}"); } catch { return json(400, { error: "bad json" }); }
          const err = await this.avatars.submitProfile(parsed).catch((e) => `error: ${String(e).slice(0, 80)}`);
          json(err ? 400 : 200, err ? { error: err } : { ok: true });
        });
        return;
      }
      const pf = /^\/profiles\/(\d+)\/?$/.exec(url);
      if (pf && req.method === "GET") return json(200, this.avatars.getProfiles(pf[1]));
      const av = /^\/avatars\/(\d+)\/?$/.exec(url);
      if (av && req.method === "GET") return json(200, this.avatars.get(av[1]));
      // Extraction Market: pools, bets and payouts for a raid.
      const bm = /^\/bets\/(\d+)\/?$/.exec(url);
      if (bm && req.method === "GET") {
        const b = this.books.get(bm[1]);
        return b ? json(200, b.view()) : json(404, { error: "no market for this raid" });
      }
      // Raid history: newest first, a short public summary of each published report.
      if (url === "/reports" && req.method === "GET") {
        const dir = join(REPO, "app", "public", "reports");
        const files = existsSync(dir) ? readdirSync(dir).filter((f) => /^\d+\.json$/.test(f)) : [];
        const list = files.map((f) => {
          try {
            const { report: r, hash } = JSON.parse(readFileSync(join(dir, f), "utf8"));
            return {
              raidId: r.raid.id, mode: r.raid.mode, hash, day: r.mystery?.day ?? null, title: r.mystery?.event?.title ?? (r.mystery?.day ? eventTitle(r.mystery.day) : null),
              raiders: (r.raiders as { slot: number; bot: boolean; wallet: string | null; extracted: boolean; alive: boolean | null; dusdPayout: string }[])
                .filter((x) => x.wallet).map((x) => ({ slot: x.slot, bot: x.bot, wallet: x.wallet, extracted: x.extracted, alive: x.alive, dusd: x.dusdPayout })),
            };
          } catch { return null; }
        }).filter(Boolean).sort((a, b) => Number(BigInt(b!.raidId) - BigInt(a!.raidId) > 0n ? 1 : -1));
        return json(200, list.slice(0, 50));
      }
      const rep = /^\/reports\/(\d+)\/?$/.exec(url);
      if (rep) {
        const f = join(REPO, "app", "public", "reports", `${rep[1]}.json`);
        if (!existsSync(f)) return json(404, { error: "report not published yet" });
        return res.writeHead(200, { "content-type": "application/json" }).end(readFileSync(f));
      }
      const m = /^\/wire\/(\d+)(\/stream)?\/?$/.exec(url);
      const wire = m ? this.wires.get(m[1]) : undefined;
      if (!m || !wire) return json(404, { error: "unknown raid" });
      if (!m[2]) return json(200, wire.lines);
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
      const send = (l: WireLine) => res.write(`data: ${JSON.stringify(l)}\n\n`);
      wire.lines.forEach(send);
      const off = wire.subscribe(send);
      const ping = setInterval(() => res.write(": ping\n\n"), 15_000);
      req.on("close", () => { off(); clearInterval(ping); });
    });
  }

  /** Lobby: every joined human seat pressed READY (the keeper may drop early). */
  allReady(raidId: string, joinedHumanSlots: number[]) { return this.avatars.allReady(raidId, joinedHumanSlots); }
  /** Player-chosen handles by slot (public). */
  handles(raidId: string): Record<string, string> { return Object.fromEntries(Object.entries(this.avatars.getProfiles(raidId)).map(([s, p]) => [s, p.handle])); }
  register(raidId: string, wire: Wire) { this.wires.set(raidId, wire); }
  registerBets(raidId: string, book: BetBook) { this.books.set(raidId, book); }
  setLobby(l: Lobby | null) { this.lobby = l; }
  patchLobby(p: Partial<Lobby>) { if (this.lobby) this.lobby = { ...this.lobby, ...p }; }
  /** WIRE_HOST=127.0.0.1 on a server behind a reverse proxy (default: all interfaces, for local dev). */
  listen() { return new Promise<void>((r) => this.server.listen(this.port, process.env.WIRE_HOST ?? "0.0.0.0", r)); }
  close() { return new Promise<void>((r) => { this.server.closeAllConnections(); this.server.close(() => r()); }); }
}
