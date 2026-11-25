// Keeper HTTP API for the client (public data only; no auth needed):
//   GET /lobby                 -> current raid the keeper runs (id, PDA, mode, slots, human slots, phase)
//   GET /reports/:raidId       -> Market Raid Report file ({report, hash, postReportSig})
//   GET /wire/:raidId          -> THE WIRE lines so far (JSON)
//   GET /wire/:raidId/stream   -> THE WIRE as Server-Sent Events, one `data:` JSON line per WireLine
// THE WIRE lines are public by construction (public facts + post-filter); reports are published
// after settlement; the lobby holds only public ids.
import { createServer, type Server } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { REPO } from "../../scripts/spike-lib.ts";
import type { Wire, WireLine } from "./wire.ts";

export type Lobby = {
  raidId: string;
  raid: string;
  mode: "mystery" | "live";
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

export class WireServer {
  private wires = new Map<string, Wire>();
  private server: Server;
  lobby: Lobby | null = null;
  /** Serve mode only: open a raid on request. */
  onOpen: ((mode: "mystery" | "live") => Promise<{ ok: boolean; error?: string; raidId?: string }>) | null = null;

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
          let mode: "mystery" | "live" = "mystery";
          try { mode = JSON.parse(body || "{}").mode === "live" ? "live" : "mystery"; } catch { /* default */ }
          const r = await this.onOpen!(mode);
          json(r.ok ? 202 : 409, r);
        });
        return;
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

  register(raidId: string, wire: Wire) { this.wires.set(raidId, wire); }
  setLobby(l: Lobby | null) { this.lobby = l; }
  patchLobby(p: Partial<Lobby>) { if (this.lobby) this.lobby = { ...this.lobby, ...p }; }
  /** WIRE_HOST=127.0.0.1 on a server behind a reverse proxy (default: all interfaces, for local dev). */
  listen() { return new Promise<void>((r) => this.server.listen(this.port, process.env.WIRE_HOST ?? "0.0.0.0", r)); }
  close() { return new Promise<void>((r) => { this.server.closeAllConnections(); this.server.close(() => r()); }); }
}
