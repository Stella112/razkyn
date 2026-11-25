// Keeper HTTP API client (keeper/wire/server.ts) + report verification helpers.
import { KEEPER_URL } from "./config";

export type Lobby = {
  raidId: string; raid: string; mode: "mystery" | "live"; slots: number; humanSlots: number[];
  phase: "lobby" | "setup" | "live" | "settling" | "done"; joinDeadline: number; startTs?: number; reportHash?: string;
};
export type WireLine = {
  t: number; tag: "LIVE" | "BREAKING" | "IN-GAME EVENT" | "DEBRIEF"; text: string; source: "llm" | "template";
  slot?: number; headlines?: { title: string; url: string; ts: string }[];
};

export async function getLobby(): Promise<Lobby | null> {
  try {
    const r = await fetch(`${KEEPER_URL}/lobby`, { cache: "no-store" });
    return r.ok ? ((await r.json()) as Lobby) : null;
  } catch { return null; }
}

/** THE WIRE over SSE. Returns a closer. */
export function subscribeWire(raidId: string, onLine: (l: WireLine) => void): () => void {
  let es: EventSource | null = null;
  try {
    es = new EventSource(`${KEEPER_URL}/wire/${raidId}/stream`);
    es.onmessage = (e) => {
      try {
        const l = JSON.parse(e.data) as WireLine;
        (window as unknown as { __razkynWire?: WireLine[] }).__razkynWire?.push(l); // test 9 recording
        onLine(l);
      } catch { /* ignore */ }
    };
  } catch { /* keeper offline */ }
  return () => es?.close();
}

export type ReportFile = { report: Record<string, any>; hash: string; postReportSig: string }; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Report from the keeper, falling back to the static copy deployed with the app. */
export async function getReport(raidId: string, src?: string): Promise<ReportFile | null> {
  const urls = src ? [src] : [`${KEEPER_URL}/reports/${raidId}`, `/reports/${raidId}.json`];
  for (const u of urls) {
    try {
      const r = await fetch(u, { cache: "no-store" });
      if (r.ok) return (await r.json()) as ReportFile;
    } catch { /* next */ }
  }
  return null;
}

/** Canonical JSON (keys sorted recursively, no whitespace): same rule as keeper/src/report.ts. */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
}

export const hex = (b: ArrayBuffer | Uint8Array) => Array.from(b instanceof Uint8Array ? b : new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
export const unhex = (h: string) => Uint8Array.from(h.match(/../g)!.map((x) => parseInt(x, 16)));
export async function sha256(...parts: Uint8Array[]): Promise<Uint8Array> {
  const len = parts.reduce((a, p) => a + p.length, 0);
  const buf = new Uint8Array(len);
  let o = 0;
  for (const p of parts) { buf.set(p, o); o += p.length; }
  return new Uint8Array(await crypto.subtle.digest("SHA-256", buf));
}

/**
 * Mystery reveal check, same rules as the program (market.rs mystery_leaf / merkle_root):
 * leaf = sha256(day_id[10] ‖ slice_start u32 LE ‖ data_hash ‖ headlines_hash);
 * at level k, bit k of index = 1 → node is the right child; parent = sha256(left ‖ right).
 */
export async function verifyMystery(m: { day: string; sliceStart: number; dataHash: string; headlinesHash: string; proof: string[]; leafIndex: number }, rootHex: string) {
  const day = new TextEncoder().encode(m.day);
  const start = new Uint8Array(4);
  new DataView(start.buffer).setUint32(0, m.sliceStart, true);
  const leaf = await sha256(day, start, unhex(m.dataHash), unhex(m.headlinesHash));
  let node = leaf;
  for (let k = 0; k < m.proof.length; k++) {
    const sib = unhex(m.proof[k]);
    node = (m.leafIndex >> k) & 1 ? await sha256(sib, node) : await sha256(node, sib);
  }
  return { leaf: hex(leaf), root: hex(node), ok: hex(node) === rootHex.toLowerCase() };
}
