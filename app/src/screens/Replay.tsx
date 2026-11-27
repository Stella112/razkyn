// EVENT REPLAY of a finished raid, rebuilt only from what was recorded: the per-second price path,
// committed market events, THE WIRE's timestamped lines, crate positions (public Raid account) and the
// keeper's BOT log (waypoints each BOT reached, crates, trades, engagements, knockouts, extractions).
// Human positions were private in the TEE and were never recorded, so they are not shown.
import { useEffect, useMemo, useRef, useState } from "react";
import { navigate } from "../App";
import { COVER_RECTS, DISTRICT_TILES, EXITS, HAZARD_ROWS, MAP_H, MAP_W, TERMINALS, UNIT, readRaidBase } from "../lib/chain";
import { getReport, type ReportFile } from "../lib/keeper";

type Ev = { t: number; slot: number; kind: string; detail: Record<string, unknown> };
type Wire = { t: number; tag: string; text: string };
const RAID_SECS = 300;
const WINDOWS = [120, 210, 270]; // exit windows, 30 s each
const COLORS = { teal: "#45C9B2", amber: "#D9AC65", red: "#E4514E", silver: "#C8D2D1", dim: "#5C666C" };
const S = 15; // px per tile

export default function Replay({ raidId }: { raidId: string }) {
  const [file, setFile] = useState<ReportFile | null | undefined>(undefined);
  const [cratePos, setCratePos] = useState<{ x: number; y: number }[]>([]);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(4);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    getReport(raidId).then(setFile).catch(() => setFile(null));
    readRaidBase(raidId).then((r) => r && setCratePos((r as unknown as { cratePos: { x: number; y: number }[] }).cratePos ?? [])).catch(() => {});
  }, [raidId]);

  // Clock.
  useEffect(() => {
    if (!playing) return;
    let last = performance.now(); let raf = 0;
    const step = (now: number) => { const dt = (now - last) / 1000; last = now; setT((x) => { const n = x + dt * speed; if (n >= RAID_SECS) { setPlaying(false); return RAID_SECS; } return n; }); raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed]);

  const r = file?.report;
  const model = useMemo(() => {
    if (!r) return null;
    const prices: number[][] = (r.pricePath ?? []).map((p: { prices: string[] }) => p.prices.map(Number));
    const start = prices[0] ?? [1e6, 1e6, 1e6];
    const events: { kind: string; district: string; atSecond: number }[] = r.marketEvents?.events ?? [];
    const raiders: { slot: number; bot: boolean; extracted: boolean; alive: boolean; events?: Ev[] }[] = r.raiders ?? [];
    const wire: Wire[] = (r.wire?.live ?? []).filter((w: Wire) => typeof w.t === "number");
    const names: string[] = (r.assets ?? []).map((a: { district: string }) => a.district);
    // BOT tracks: waypoints with times (wander/hunt "to"), plus exits on extraction.
    const tracks = new Map<number, { t: number; x: number; y: number }[]>();
    const evs: Ev[] = [];
    for (const rd of raiders) for (const e of rd.events ?? []) {
      evs.push(e);
      const to = e.detail?.to as number[] | undefined;
      if (Array.isArray(to)) { const a = tracks.get(e.slot) ?? []; a.push({ t: e.t, x: to[0], y: to[1] }); tracks.set(e.slot, a); }
      if (e.kind === "extracted" && typeof e.detail?.exit === "number") { const [ex, ey] = EXITS[e.detail.exit as number]; const a = tracks.get(e.slot) ?? []; a.push({ t: e.t, x: ex * UNIT + 50, y: ey * UNIT + 50 }); tracks.set(e.slot, a); }
    }
    for (const a of tracks.values()) a.sort((p, q) => p.t - q.t);
    const endOf = new Map<number, { t: number; kind: string }>();
    for (const e of evs) if (e.kind === "extracted" || e.kind === "dead") endOf.set(e.slot, { t: e.t, kind: e.kind });
    for (const e of evs) if (e.kind === "knockout") { const v = e.detail?.target as number; if (typeof v === "number" && !endOf.has(v)) endOf.set(v, { t: e.t, kind: "dead" }); }
    return { prices, start, events, raiders, wire, names, tracks, evs, endOf };
  }, [r]);

  const posAt = (slot: number, time: number) => {
    const a = model?.tracks.get(slot); if (!a || !a.length || time < a[0].t) return null;
    let i = 0; while (i < a.length - 1 && a[i + 1].t <= time) i++;
    const p = a[i], q = a[i + 1];
    if (!q) return { x: p.x, y: p.y };
    const k = Math.min(1, Math.max(0, (time - p.t) / Math.max(0.1, q.t - p.t)));
    return { x: p.x + (q.x - p.x) * k, y: p.y + (q.y - p.y) * k };
  };

  // Draw.
  useEffect(() => {
    const c = canvas.current; if (!c || !model) return;
    const g = c.getContext("2d")!; const W = MAP_W * S, H = MAP_H * S;
    const sec = Math.min(RAID_SECS - 1, Math.floor(t));
    const p = model.prices[sec] ?? model.start;
    const bps = p.map((v, i) => ((v - model.start[i]) * 10000) / model.start[i]);
    const shock = model.events.some((e) => e.kind === "RATE SHOCK" && t >= e.atSecond && t < e.atSecond + 30);
    const lvl = bps.map((b) => (b <= (shock ? -300 : -500) ? 2 : b <= (shock ? -100 : -200) ? 1 : 0));
    g.fillStyle = "#0B0F12"; g.fillRect(0, 0, W, H);
    DISTRICT_TILES.forEach(([lo, hi], d) => {
      const up = bps[d] >= 200;
      g.fillStyle = lvl[d] ? "rgba(228,81,78,0.10)" : up ? "rgba(69,201,178,0.12)" : "rgba(200,210,209,0.04)";
      g.fillRect(lo * S, 0, (hi - lo + 1) * S, H);
      if (lvl[d]) { const [r0, r1] = HAZARD_ROWS[lvl[d]]; g.fillStyle = `rgba(228,81,78,${0.28 + 0.12 * Math.sin(t * 6)})`; g.fillRect(lo * S, r0 * S, (hi - lo + 1) * S, (r1 - r0 + 1) * S); }
      g.fillStyle = lvl[d] ? COLORS.red : up ? COLORS.teal : COLORS.silver; g.font = "bold 18px 'Barlow Condensed', sans-serif";
      g.fillText(`${(model.names[d] ?? ["TOWER", "FACTORY", "HARBOR"][d]).toUpperCase()}  ${bps[d] >= 0 ? "+" : "−"}${(Math.abs(bps[d]) / 100).toFixed(2)}%`, lo * S + 8, 22);
    });
    g.fillStyle = "rgba(200,210,209,0.16)"; for (const x of [21, 43]) g.fillRect(x * S, 0, S, H);
    g.fillStyle = "rgba(200,210,209,0.45)"; for (const [x0, y0, x1, y1] of COVER_RECTS) g.fillRect(x0 * S, y0 * S, (x1 - x0 + 1) * S, (y1 - y0 + 1) * S);
    g.fillStyle = COLORS.amber; for (const [x0, y0, x1] of COVER_RECTS) g.fillRect(x0 * S, y0 * S, (x1 - x0 + 1) * S, 2);
    g.fillStyle = COLORS.teal; for (const [tx, ty] of TERMINALS) g.fillRect(tx * S + 2, ty * S + 2, S - 4, S - 4);
    const winOpen = WINDOWS.findIndex((w) => t >= w && t < w + 30);
    EXITS.forEach(([ex, ey]) => { g.strokeStyle = winOpen >= 0 ? COLORS.teal : "rgba(200,210,209,0.35)"; g.lineWidth = winOpen >= 0 ? 3 : 1.5; g.beginPath(); g.arc(ex * S + S / 2, ey * S + S / 2, S * (1.4 + (winOpen >= 0 ? 0.3 * Math.sin(t * 5) : 0)), 0, Math.PI * 2); g.stroke(); });
    // crates: opened at the second a raider cracked them (BOT log); unknown = sealed
    const openedAt = new Map<number, number>();
    for (const e of model.evs) if (e.kind === "open_crate" && typeof e.detail?.crate === "number" && !openedAt.has(e.detail.crate as number)) openedAt.set(e.detail.crate as number, e.t);
    cratePos.slice(0, 36).forEach((cp, i) => {
      if (!cp || (cp.x === 0 && cp.y === 0)) return;
      const opened = (openedAt.get(i) ?? 1e9) <= t; const justOpened = opened && t - (openedAt.get(i) ?? 0) < 2;
      g.fillStyle = opened ? "rgba(200,210,209,0.25)" : COLORS.amber; const cs = S * 0.7;
      g.fillRect((cp.x / UNIT) * S - cs / 2, (cp.y / UNIT) * S - cs / 2, cs, cs);
      if (justOpened) { g.strokeStyle = COLORS.amber; g.lineWidth = 2; g.beginPath(); g.arc((cp.x / UNIT) * S, (cp.y / UNIT) * S, S * (1 + (t - (openedAt.get(i) ?? 0)) * 1.5), 0, Math.PI * 2); g.stroke(); }
    });
    // BOTs
    for (const rd of model.raiders) {
      if (!rd.bot) continue;
      const end = model.endOf.get(rd.slot);
      const pos = posAt(rd.slot, end && t > end.t ? end.t : t); if (!pos) continue;
      const x = (pos.x / UNIT) * S, y = (pos.y / UNIT) * S;
      if (end && t > end.t) {
        if (end.kind === "dead") { g.strokeStyle = COLORS.red; g.lineWidth = 3; g.beginPath(); g.moveTo(x - 7, y - 7); g.lineTo(x + 7, y + 7); g.moveTo(x - 7, y + 7); g.lineTo(x + 7, y - 7); g.stroke(); }
        else { g.strokeStyle = COLORS.teal; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 9, 0, Math.PI * 2); g.stroke(); }
        continue;
      }
      const fighting = model.evs.some((e) => (e.kind === "engage" || e.kind === "knockout") && e.slot === rd.slot && t >= e.t && t < e.t + 3);
      if (fighting) { g.fillStyle = `rgba(255,220,120,${0.5 + 0.5 * Math.sin(t * 20)})`; g.beginPath(); g.arc(x, y, 13, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = COLORS.red; g.beginPath(); g.arc(x, y, 6, 0, Math.PI * 2); g.fill();
      g.fillStyle = COLORS.silver; g.font = "bold 13px 'JetBrains Mono', monospace"; g.fillText(`BOT ${rd.slot + 1}`, x + 9, y - 8);
    }
    // timer
    g.fillStyle = "rgba(11,15,18,.8)"; g.fillRect(W / 2 - 70, H - 40, 140, 32);
    g.fillStyle = winOpen >= 0 ? COLORS.teal : COLORS.silver; g.font = "bold 22px 'Barlow Condensed', sans-serif"; g.textAlign = "center";
    g.fillText(winOpen >= 0 ? `EXIT WINDOW ${winOpen + 1}` : `${Math.floor((RAID_SECS - t) / 60)}:${String(Math.floor(RAID_SECS - t) % 60).padStart(2, "0")}`, W / 2, H - 16); g.textAlign = "left";
  }, [t, model, cratePos]); // eslint-disable-line react-hooks/exhaustive-deps

  if (file === undefined) return <div className="page"><div className="wrap"><p className="dim">Loading the raid record…</p></div></div>;
  if (!file || !model) return <div className="page"><div className="wrap"><h3>No record for raid {raidId}</h3><button className="btn" onClick={() => navigate("/history")}>Raid history</button></div></div>;
  const lines = model.wire.filter((w) => w.t <= t).slice(-7).reverse();
  const evNow = model.events.filter((e) => t >= e.atSecond && t < e.atSecond + 30);
  const day = r?.mystery?.event?.title as string | undefined;
  return (
    <div className="page">
      <div className="topbar">
        <a className="brand" href="/" onClick={(e) => { e.preventDefault(); navigate("/"); }}>RAZKYN</a>
        <span className="pill">REPLAY · raid {raidId}</span>
        <div className="spacer" />
        <button className="btn" onClick={() => navigate(`/report/${raidId}`)}>Report</button>
        <button className="btn" onClick={() => navigate("/history")}>History</button>
      </div>
      <div className="wrap" style={{ maxWidth: 1400 }}>
        <p className="note" style={{ marginTop: 0 }}>
          Event replay from the recorded raid: prices second by second, committed market events, THE WIRE, crates and the BOTs' logged waypoints (smoothed between points). Human positions were private on the TEE and were never recorded, so humans are not drawn.{day ? <> The tape was <b>{day}</b>.</> : null}
        </p>
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ flex: "1 1 720px", minWidth: 0 }}>
            <canvas ref={canvas} width={MAP_W * S} height={MAP_H * S} style={{ width: "100%", height: "auto", border: "1px solid rgba(200,210,209,.18)", background: "#0B0F12", display: "block" }} />
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
              <button className="btn" onClick={() => { if (t >= RAID_SECS) setT(0); setPlaying((p) => !p); }}>{playing ? "Pause" : t >= RAID_SECS ? "Replay" : "Play"}</button>
              {[1, 4, 10].map((s) => <button key={s} className="btn" style={{ opacity: speed === s ? 1 : 0.55 }} onClick={() => setSpeed(s)}>{s}×</button>)}
              <input type="range" min={0} max={RAID_SECS} step={0.5} value={t} onChange={(e) => setT(Number(e.target.value))} style={{ flex: 1, minWidth: 160 }} aria-label="Replay time" />
              <span className="mono">{Math.floor(t / 60)}:{String(Math.floor(t) % 60).padStart(2, "0")} / 5:00</span>
            </div>
          </div>
          <div style={{ flex: "0 1 400px", minWidth: 260 }}>
            {evNow.map((e) => <div key={e.kind + e.atSecond} className="card" style={{ borderLeft: `4px solid ${COLORS.red}`, marginBottom: 10, padding: 12 }}><b>IN-GAME EVENT · {e.kind}</b><div className="dim">{e.district} · from {Math.floor(e.atSecond / 60)}:{String(e.atSecond % 60).padStart(2, "0")} for 30 s</div></div>)}
            <div className="card" style={{ padding: 12 }}>
              <div className="label" style={{ marginBottom: 8 }}>THE WIRE</div>
              {lines.length === 0 && <div className="dim">Waiting for the first move…</div>}
              {lines.map((w, i) => <div key={w.t + w.text} style={{ padding: "6px 0", borderTop: i ? "1px solid rgba(200,210,209,.1)" : "none", opacity: i ? 0.7 : 1 }}><span className="mono" style={{ color: w.tag === "BREAKING" ? COLORS.red : w.tag === "IN-GAME EVENT" ? COLORS.amber : COLORS.teal, fontSize: 12 }}>{w.tag} · {Math.floor(w.t / 60)}:{String(Math.floor(w.t) % 60).padStart(2, "0")}</span><div>{w.text}</div></div>)}
            </div>
            <p className="note" style={{ fontSize: 12 }}>Legend: red dot = BOT · flash = shooting · ✕ = knocked out · teal ring = extracted · amber square = sealed crate · grey = opened · red rows = hazard · teal squares = terminals · rings = exits (pulse when open).</p>
          </div>
        </div>
      </div>
    </div>
  );
}
