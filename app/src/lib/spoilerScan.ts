// §9 test 9 — spoiler check, run inside the client (enabled with ?record=1).
// Scans every fetch response body the browser received (polyfills.ts records them) and every
// WIRE line, before the reveal, for: a date, a ticker / coin / exchange name, a month name, and
// absolute prices (any decoded District with start_raw ≠ 0 or a price outside the ×10^4 index
// band). Account data is base64; it is decoded to bytes and searched as ASCII too.
import { Buffer } from "buffer";
import { coder } from "./chain";

const TICKER = /\b(BTC|ETH|SOL|USDT|USDC|BITCOIN|ETHEREUM|SOLANA|BINANCE|SOLUSDT|BTCUSDT|ETHUSDT)\b/i;
const DATE = /\b(19|20)\d{2}-\d{2}-\d{2}\b/;
const MONTH = /\b(January|February|March|April|June|July|August|September|October|November|December)\b/;
// Raw account bytes: only long, unambiguous patterns (short tickers would match random bytes).
const BYTES = /(SOLUSDT|BTCUSDT|ETHUSDT|(19|20)\d{2}-\d{2}-\d{2})/;

export type ScanResult = { responses: number; accountsDecoded: number; districts: number; wireLines: number; findings: string[] };

export function spoilerScan(traffic: { url: string; body: string }[], wire: { text: string; tag: string }[]): ScanResult {
  const findings: string[] = [];
  let accounts = 0, districts = 0;
  const check = (where: string, s: string) => {
    for (const [name, re] of [["date", DATE], ["ticker", TICKER], ["month", MONTH]] as const) {
      const m = re.exec(s);
      if (m) findings.push(`${name} "${m[0]}" in ${where}`);
    }
  };
  for (const t of traffic) {
    if (/\/reports\//.test(t.url)) continue; // the report is fetched only after the reveal
    let json: unknown = null;
    try { json = JSON.parse(t.body.replace(/^REQ [^\n]*\n/, "")); } catch { check(t.url, t.body); continue; }
    // Collect base64 account data blobs anywhere in the response.
    const blobs: string[] = [];
    const walk = (v: unknown) => {
      if (Array.isArray(v)) { if (v.length === 2 && v[1] === "base64" && typeof v[0] === "string") blobs.push(v[0]); else v.forEach(walk); }
      else if (v && typeof v === "object") Object.values(v).forEach(walk);
    };
    walk(json);
    const textOnly = JSON.stringify(json).replace(/"[A-Za-z0-9+/=]{40,}"/g, '""');
    check(t.url, textOnly);
    for (const b of blobs) {
      const bytes = Buffer.from(b, "base64");
      const bm = BYTES.exec(bytes.toString("latin1"));
      if (bm) findings.push(`"${bm[0]}" in account bytes from ${t.url.split("?")[0]}`);
      accounts++;
      try {
        const d = coder.decode("district", bytes) as { startRaw: { toString(): string }; currentPrice: { toString(): string }; startPrice: { toString(): string } };
        districts++;
        if (d.startRaw.toString() !== "0") findings.push(`district start_raw = ${d.startRaw.toString()} (absolute price)`);
        for (const p of [d.currentPrice, d.startPrice]) {
          const n = Number(p.toString());
          if (n !== 0 && (n < 200_000 || n > 5_000_000)) findings.push(`district price ${n} outside the index band`);
        }
      } catch { /* not a District */ }
    }
  }
  for (const l of wire) if (l.tag !== "DEBRIEF") check(`WIRE ${l.tag}`, l.text);
  return { responses: traffic.length, accountsDecoded: accounts, districts, wireLines: wire.length, findings };
}
