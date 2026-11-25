// THE WIRE — HTTP feed for the client (CLAUDE.md §8: ticker along the bottom of the HUD).
//   GET /wire/:raidId          -> JSON array of lines so far
//   GET /wire/:raidId/stream   -> Server-Sent Events, one `data:` JSON line per WireLine
// Lines are public by construction (public facts + post-filter), so the feed needs no auth.
import { createServer, type Server } from "node:http";
import type { Wire, WireLine } from "./wire.ts";

export class WireServer {
  private wires = new Map<string, Wire>();
  private server: Server;

  constructor(readonly port = Number(process.env.WIRE_PORT ?? 8787)) {
    this.server = createServer((req, res) => {
      res.setHeader("access-control-allow-origin", "*");
      const m = /^\/wire\/(\d+)(\/stream)?\/?$/.exec(req.url ?? "");
      const wire = m ? this.wires.get(m[1]) : undefined;
      if (!m || !wire) { res.writeHead(404, { "content-type": "application/json" }).end('{"error":"unknown raid"}'); return; }
      if (!m[2]) { res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(wire.lines)); return; }
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
      const send = (l: WireLine) => res.write(`data: ${JSON.stringify(l)}\n\n`);
      wire.lines.forEach(send);
      const off = wire.subscribe(send);
      const ping = setInterval(() => res.write(": ping\n\n"), 15_000);
      req.on("close", () => { off(); clearInterval(ping); });
    });
  }

  register(raidId: string, wire: Wire) { this.wires.set(raidId, wire); }
  listen() { return new Promise<void>((r) => this.server.listen(this.port, r)); }
  close() { return new Promise<void>((r) => { this.server.closeAllConnections(); this.server.close(() => r()); }); }
}
