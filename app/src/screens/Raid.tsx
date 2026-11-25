import { useEffect, useMemo, useRef, useState } from "react";
import * as anchor from "@coral-xyz/anchor";
import type { Connection, Keypair } from "@solana/web3.js";
import { navigate } from "../App";
import {
  DISTRICTS, EXITS, MAP_H, MAP_W, NUM_CRATES, P, PRICE_ONE, RaidPlayer, SHOOT_RANGE_TILES, TERMINALS, UNIT,
  backpackValue, changeBps, raidKeyFor, readMine, readPublic, readRaidBase, teeAuthed, teePublic,
  type PublicState, type RprvAcc, type ViewAcc,
} from "../lib/chain";
import { programError } from "../lib/errors";
import { getLobby, getReport, subscribeWire, verifyMystery, hex, type ReportFile, type WireLine } from "../lib/keeper";
import { startGame, type RaidScene } from "../game/RaidScene";

const RAID_SECS = 300;
const WINDOWS = [120, 210, 270];
const STEP = 50; // units per move (max 60 per 100 ms tick, DECISIONS #10)
const MOVE_MS = 110;
const fmt = (n: number) => (n / 1e6).toFixed(2);
const pct = (bps: number) => `${bps >= 0 ? "+" : "−"}${(Math.abs(bps) / 100).toFixed(2)}%`;
const mmss = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, "0")}`;
const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);
const center = (t: [number, number]) => ({ x: t[0] * UNIT + UNIT / 2, y: t[1] * UNIT + UNIT / 2 });

function Sparkline({ data }: { data: number[] }) {
  if (data.length < 2) return <svg width={120} height={26} />;
  const lo = Math.min(...data), hi = Math.max(...data), r = hi - lo || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * 120},${24 - ((v - lo) / r) * 22}`).join(" ");
  const up = data[data.length - 1] >= data[0];
  return <svg width={120} height={26}><polyline points={pts} fill="none" stroke={up ? "#22d37a" : "#ff4b5c"} strokeWidth={1.5} /></svg>;
}

type Peek = { target: string; result: string; ok: boolean }[];

export default function Raid({ raidId: initialId, watch }: { raidId: string; watch: boolean }) {
  const [raidId, setRaidId] = useState(initialId);
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<() => RaidScene | null>(() => null);
  const [pub, setPub] = useState<PublicState | null>(null);
  const [mine, setMine] = useState<{ rprv: RprvAcc | null; view: ViewAcc | null } | null>(null);
  const [tee, setTee] = useState<{ conn: Connection; kp: Keypair } | null>(null);
  const [wire, setWire] = useState<WireLine[]>([]);
  const [toast, setToast] = useState<{ text: string; until: number } | null>(null);
  const [channel, setChannel] = useState<{ label: string; start: number; ms: number } | null>(null);
  const [peek, setPeek] = useState<Peek | null>(null);
  const [trade, setTrade] = useState(false);
  const [report, setReport] = useState<ReportFile | null>(null);
  const [reveal, setReveal] = useState<{ ok: boolean; root: string; onchainRoot: string } | null>(null);
  const [now, setNow] = useState(Date.now());
  const [noKey, setNoKey] = useState(false);
  const pending = useRef({ dx: 0, dy: 0 });
  const values = useRef<number[]>([]);
  const pubRef = useRef(pub); pubRef.current = pub;
  const mineRef = useRef(mine); mineRef.current = mine;
  const extractHeld = useRef(false);

  const say = (text: string, ms = 1800) => setToast({ text, until: Date.now() + ms });

  // Watch with no id: follow the keeper's current raid.
  useEffect(() => {
    if (raidId) return;
    getLobby().then((l) => { if (l) setRaidId(l.raidId); });
  }, [raidId]);

  // Phaser.
  useEffect(() => {
    if (!hostRef.current) return;
    const { game, scene } = startGame(hostRef.current);
    sceneRef.current = scene;
    return () => game.destroy(true);
  }, []);

  // Public state through a token-less TEE connection (public accounts only); base as fallback.
  useEffect(() => {
    if (!raidId) return;
    let stop = false;
    const poll = async () => {
      try {
        const s = await readPublic(teePublic, raidId);
        if (!s.raid) s.raid = await readRaidBase(raidId); // before delegation / after settlement
        if (!stop) setPub(s);
      } catch { /* transient */ }
    };
    poll();
    const i = setInterval(poll, 700);
    const c = setInterval(() => setNow(Date.now()), 250);
    return () => { stop = true; clearInterval(i); clearInterval(c); };
  }, [raidId]);

  // THE WIRE.
  useEffect(() => {
    if (!raidId) return;
    return subscribeWire(raidId, (l) => setWire((w) => [...w.slice(-80), l]));
  }, [raidId]);

  // Raid key + TEE token (players only).
  const raid = pub?.raid ?? null;
  const kp = useMemo(() => (raidId && !watch ? raidKeyFor(raidId) : null), [raidId, watch]);
  const mySlot = raid && kp ? raid.raiders.findIndex((r) => r.joined && r.raidKey.equals(kp.publicKey)) : -1;
  useEffect(() => {
    if (watch || !raidId) return;
    if (!kp) { setNoKey(true); return; }
    let stop = false;
    const auth = async () => {
      try { const a = await teeAuthed(kp); if (!stop) setTee({ conn: a.conn, kp }); } catch (e) { if (!stop) say(`TEE auth failed: ${programError(e)}`, 4000); }
    };
    auth();
    const i = setInterval(auth, 60_000); // refreshes the cached token 60 s before expiry
    return () => { stop = true; clearInterval(i); };
  }, [kp, raidId, watch]);
  const player = useMemo(() => (tee && mySlot >= 0 ? new RaidPlayer(tee.conn, tee.kp, raidId, mySlot) : null), [tee, mySlot, raidId]);

  // My private state (rprv + fog View), readable only with my raid key's token.
  useEffect(() => {
    if (!player) return;
    let stop = false;
    const poll = async () => {
      const before = { ...pending.current };
      try {
        const m = await readMine(player.conn, raidId, player.slot);
        if (stop) return;
        pending.current = { dx: pending.current.dx - before.dx, dy: pending.current.dy - before.dy };
        setMine(m);
        if (m.rprv && pubRef.current) {
          values.current = [...values.current.slice(-90), backpackValue(m.rprv.backpack, pubRef.current.districts)];
        }
      } catch { /* transient */ }
    };
    poll();
    const i = setInterval(poll, 300);
    return () => { stop = true; clearInterval(i); };
  }, [player, raidId]);

  const rpub = mySlot >= 0 ? pub?.rpubs[mySlot] ?? null : null;
  const live = raid?.status === 2;
  const canAct = !!player && live && !!rpub?.alive && !rpub?.extracted;
  const trading = mine?.rprv?.channelKind === 2;

  // Movement: pipelined moves every 110 ms while a direction is held (DECISIONS / STATUS M4 finding).
  useEffect(() => {
    if (!player) return;
    const i = setInterval(() => {
      const sc = sceneRef.current();
      const me = mineRef.current?.rprv;
      const r = pubRef.current?.rpubs[player.slot];
      if (!sc || !me || !r?.alive || r.extracted || pubRef.current?.raid?.status !== 2 || mineRef.current?.rprv?.channelKind === 2) return;
      const dir = sc.moveDir();
      if (!dir) return;
      // Predicted position, bounded: moves that the program rejects never land, so the
      // prediction must not run ahead of the last read by more than a few tiles.
      const MAXP = 300;
      pending.current = { dx: Math.max(-MAXP, Math.min(MAXP, pending.current.dx)), dy: Math.max(-MAXP, Math.min(MAXP, pending.current.dy)) };
      const cx = Math.max(0, Math.min(MAP_W * UNIT - 1, me.x + pending.current.dx));
      const cy = Math.max(0, Math.min(MAP_H * UNIT - 1, me.y + pending.current.dy));
      let dx = Math.round(dir.x * STEP), dy = Math.round(dir.y * STEP);
      // Stay inside the map; never more than one step in either direction.
      dx = Math.max(-STEP, Math.min(STEP, Math.max(-cx, Math.min(MAP_W * UNIT - 1 - cx, dx))));
      dy = Math.max(-STEP, Math.min(STEP, Math.max(-cy, Math.min(MAP_H * UNIT - 1 - cy, dy))));
      if (!dx && !dy) return;
      pending.current = { dx: pending.current.dx + dx, dy: pending.current.dy + dy };
      player.moveIx(dx, dy).then((ix) => player.send(ix)).catch(() => {});
    }, MOVE_MS);
    return () => clearInterval(i);
  }, [player]);

  // Actions.
  // Range checks use the on-chain position (the program checks the same one), not the prediction.
  const myPos = () => {
    const m = mineRef.current?.rprv;
    return m ? { x: m.x, y: m.y } : null;
  };
  const runChannel = async (label: string, ms: number, startIx: Promise<anchor.web3.TransactionInstruction>, finishIx: () => Promise<anchor.web3.TransactionInstruction>, done: string) => {
    if (!player) return;
    try {
      await player.send(await startIx);
      setChannel({ label, start: Date.now(), ms });
      await new Promise((r) => setTimeout(r, ms + 150));
      await player.send(await finishIx());
      say(done);
    } catch (e) { say(programError(e)); } finally { setChannel(null); }
  };

  const onShootAt = (wx: number, wy: number) => {
    if (!canAct || !player) return;
    const me = myPos();
    if (!me) return;
    const candidates = [
      ...(mineRef.current?.view?.entries.slice(0, mineRef.current.view.count) ?? []).map((v) => ({ slot: v.slot, x: v.x, y: v.y })),
      ...(pubRef.current?.rpubs ?? []).map((r, s) => (r && r.exposed && r.alive && s !== player.slot ? { slot: s, x: r.pubX, y: r.pubY } : null)).filter(Boolean) as { slot: number; x: number; y: number }[],
    ];
    const hit = candidates.filter((c) => dist(c.x, c.y, wx, wy) < 180).sort((a, b) => dist(a.x, a.y, wx, wy) - dist(b.x, b.y, wx, wy))[0];
    if (!hit) return;
    if (dist(hit.x, hit.y, me.x, me.y) > SHOOT_RANGE_TILES * UNIT) { say("Out of range (6 tiles)"); return; }
    sceneRef.current()?.flash(me, hit);
    player.shootIx(hit.slot).then((ix) => player.send(ix)).catch((e) => say(programError(e)));
  };

  const onInteract = () => {
    if (!canAct || !player || channel) return;
    const me = myPos(); const p = pubRef.current;
    if (!me || !p?.raid) return;
    if (TERMINALS.some((t) => { const c = center(t); return dist(c.x, c.y, me.x, me.y) <= UNIT; })) { setTrade(true); return; }
    // Nearest crate within 1 tile (sealed, or a public drop crate).
    let best = -1, bd = Infinity;
    p.raid.cratePos.forEach((c, i) => { if (i < NUM_CRATES && !(p.crates[i]?.state === 1)) { const d = dist(c.x, c.y, me.x, me.y); if (d < bd) { bd = d; best = i; } } });
    for (let i = NUM_CRATES; i < p.crates.length; i++) { const c = p.crates[i]; if (c?.placed && c.state === 0) { const d = dist(c.x, c.y, me.x, me.y); if (d < bd) { bd = d; best = i; } } }
    if (best < 0 || bd > UNIT) { say("Nothing in reach: stand on a crate or a terminal"); return; }
    const district = best < NUM_CRATES ? Math.floor(best / 12) : p.crates[best]!.district; // drop crates are public
    if (best < NUM_CRATES && best % 12 >= 8 && !p.districts[district]?.awake) { say("Dormant crate: wakes when its district is +2%"); return; }
    void runChannel("Opening crate", 2000, player.openIx(best, district), () => player.finishOpenIx(best), "Crate opened: loot in your backpack");
  };

  const startExtract = async (down: boolean) => {
    extractHeld.current = down;
    if (!down || !canAct || !player || channel) return;
    const me = myPos(); const r = pubRef.current?.raid;
    if (!me || !r) return;
    const open = r.exitWindow ? r.openExits.filter((e) => e !== 255) : [];
    const exit = open.find((e) => { const c = center(EXITS[e]); return dist(c.x, c.y, me.x, me.y) <= UNIT; });
    if (exit === undefined) { say(open.length ? "Stand on an open exit (green ring)" : "No exit open right now"); return; }
    try {
      await player.send(await player.startExtractIx(exit));
      setChannel({ label: "Extracting: hold Space", start: Date.now(), ms: 5000 });
      await new Promise((r) => setTimeout(r, 5150));
      await player.send(await player.finishExtractIx());
      say("EXTRACTED: your backpack settles to your wallet", 3500);
    } catch (e) { say(programError(e)); } finally { setChannel(null); }
  };

  const doTrade = async (from: number, to: number) => {
    setTrade(false);
    const units = mine?.rprv?.backpack[from];
    if (!player || !units || units.isZero()) { say("Nothing to trade in that asset"); return; }
    await runChannel("Trading: your position is public", 3000, player.startTradeIx(from, to, units), () => player.finishTradeIx(), "Trade filled at the current price");
  };

  /** "Try to peek": real reads of private accounts with MY token. The TEE returns nothing. */
  const tryPeek = async () => {
    if (!tee || !raidId || !pub?.raid) return;
    const sealed = pub.raid.cratePos.findIndex((_, i) => i < NUM_CRATES && pub.crates[i]?.state !== 1);
    const other = pub.raid.raiders.findIndex((r, s) => r.joined && s !== mySlot);
    const targets = [
      sealed >= 0 ? { name: `sealed crate #${sealed + 1}`, key: P.slot("crate", raidId, sealed) } : null,
      other >= 0 ? { name: `raider ${other + 1}'s private state`, key: P.slot("rprv", raidId, other) } : null,
      { name: "the raid secret (mystery day)", key: P.secret(raidId) },
    ].filter(Boolean) as { name: string; key: anchor.web3.PublicKey }[];
    const out: Peek = [];
    for (const t of targets) {
      try {
        const info = await tee.conn.getAccountInfo(t.key);
        out.push({ target: t.name, ok: !info, result: info ? `READ ${info.data.length} bytes (unexpected!)` : "refused: the TEE returned nothing" });
      } catch (e) {
        out.push({ target: t.name, ok: true, result: `refused: ${String((e as Error).message).slice(0, 80)}` });
      }
    }
    setPeek(out);
  };

  // Feed the scene.
  useEffect(() => {
    const sc = sceneRef.current();
    if (!sc) return;
    sc.onShootAt = onShootAt; sc.onInteract = onInteract; sc.onExtract = (d) => void startExtract(d);
    const v = mine?.view;
    sc.setInput({
      watch, mySlot, pub,
      me: !watch && mine?.rprv ? { x: mine.rprv.x, y: mine.rprv.y, alive: !!rpub?.alive } : null,
      visible: v ? v.entries.slice(0, v.count) : [],
      pending: pending.current,
    });
  });

  // After the raid: report (keeper, after claims), reveal check, debrief.
  const ended = !!raid && raid.status >= 3;
  useEffect(() => {
    if (!ended || report) return;
    let stop = false;
    const f = async () => {
      const r = await getReport(raidId);
      if (!stop && r) {
        setReport(r);
        const m = r.report.mystery;
        if (m) {
          const base = await readRaidBase(raidId);
          const onchainRoot = base ? hex(Uint8Array.from(base.dayRoot)) : "";
          const v = await verifyMystery(m, onchainRoot || m.root);
          setReveal({ ok: v.ok && (!onchainRoot || onchainRoot === m.root), root: v.root, onchainRoot });
        }
      }
    };
    f();
    const i = setInterval(f, 4000);
    return () => { stop = true; clearInterval(i); };
  }, [ended, report, raidId]);

  // ---------- render ----------
  const elapsed = raid && Number(raid.startTs.toString()) > 0 ? now / 1000 - Number(raid.startTs.toString()) : 0;
  const left = RAID_SECS - elapsed;
  const nextWin = WINDOWS.find((w) => w + 30 > elapsed);
  const winOpen = !!raid?.exitWindow;
  const bpValue = mine?.rprv && pub ? backpackValue(mine.rprv.backpack, pub.districts) : 0;
  const lastWire = wire.filter((l) => l.tag !== "DEBRIEF").slice(-1)[0];
  const myDebrief = wire.find((l) => l.tag === "DEBRIEF" && l.slot === mySlot) ?? null;
  const myResult = report && mySlot >= 0 ? report.report.raiders?.[mySlot] : null;
  const ch = channel ? Math.min(1, (now - channel.start) / channel.ms) : 0;

  return (
    <div className="raid">
      <div className="raid-canvas" ref={hostRef} />
      <div className="portrait-hint">Turn your phone sideways: RAZKYN plays in landscape.</div>

      {/* top-left: me */}
      <div className="hud hud-tl">
        <div className="hud-box row" style={{ gap: 12 }}>
          <a className="brand" href="/" onClick={(e) => { e.preventDefault(); navigate("/"); }} style={{ fontSize: 12 }}>RAZKYN</a>
          <span className="pill">{raid?.mode === 0 ? "MYSTERY" : "LIVE"}</span>
          {watch ? <span className="pill">WATCH · public only</span> : mySlot >= 0 ? <span className="pill live">RAIDER {mySlot + 1}</span> : null}
        </div>
        {!watch && mySlot >= 0 && (
          <>
            <div className="hud-box hp">
              <div className="row" style={{ justifyContent: "space-between" }}><span className="label">Health</span><span>{rpub?.hp ?? "…"} HP</span></div>
              <div className="hp-bar"><div style={{ width: `${rpub?.hp ?? 0}%` }} /></div>
            </div>
            <div className="hud-box">
              <div className="label">Backpack (live value)</div>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className="big-num">{fmt(bpValue)} <span className="dim" style={{ fontSize: 12 }}>dUSD</span></span>
                <Sparkline data={values.current} />
              </div>
              <div className="dim" style={{ fontSize: 11 }}>
                {mine?.rprv?.backpack.map((u, i) => `${DISTRICTS[i][0]} ${(Number(u.toString()) / 1e6).toFixed(2)}`).join(" · ") ?? ""}
              </div>
              <div className="label" style={{ marginTop: 6 }}>Protected slot <span style={{ color: "var(--text)" }}>4.00 dUSD</span></div>
            </div>
          </>
        )}
      </div>

      {/* top-right: clock, exits, districts */}
      <div className="hud hud-tr">
        <div className="hud-box">
          <div className="label" style={{ textAlign: "right" }}>{live ? "Raid ends in" : ended ? "Raid over" : "Waiting for start"}</div>
          <div className="timer">{live ? mmss(left) : "—"}</div>
          <div className="label" style={{ textAlign: "right" }}>
            {winOpen ? <span className="up">EXIT WINDOW {raid!.exitWindow} OPEN</span> : nextWin !== undefined && live ? `next exit window in ${mmss(nextWin - elapsed)}` : ""}
          </div>
        </div>
        <div className="districts">
          {[0, 1, 2].map((d) => {
            const ds = pub?.districts[d]; const b = changeBps(ds ?? null);
            return (
              <div key={d} className={`district-chip ${ds?.hazardLevel ? "haz" : ""} ${ds?.awake && b >= 200 ? "wake" : ""}`}>
                <div className="label">{DISTRICTS[d]}</div>
                <div className={`px ${b >= 0 ? "up" : "down"}`}>{pct(b)}</div>
                <div className="dim" style={{ fontSize: 10 }}>{ds?.hazardLevel ? `HAZARD ${ds.hazardLevel}` : ds?.awake ? "crates awake" : "index " + (Number(ds?.currentPrice.toString() ?? PRICE_ONE) / 1e4).toFixed(2)}</div>
              </div>
            );
          })}
        </div>
        {!watch && player && (
          <div className="hud-box peek-panel">
            <button className="act" onClick={tryPeek}>🔒 Try to peek</button>
            {peek && (
              <div style={{ marginTop: 8, fontSize: 12 }}>
                <span className="lock">🔒</span>
                {peek.map((p) => <div key={p.target}><span className="dim">{p.target}:</span> <span className={p.ok ? "refused" : "amber"}>{p.result}</span></div>)}
              </div>
            )}
          </div>
        )}
      </div>

      {/* action buttons (touch + mouse) */}
      {!watch && canAct && (
        <div className="hud-actions">
          <button className="act" onClick={onInteract}><kbd>E</kbd>Open / trade</button>
          <button className="act" onPointerDown={() => void startExtract(true)} onPointerUp={() => (extractHeld.current = false)}><kbd>Space</kbd>Extract (hold)</button>
          <span className="note" style={{ textAlign: "right" }}>WASD move · click a raider to shoot</span>
        </div>
      )}
      <TouchStick onMove={(x, y) => { const sc = sceneRef.current(); if (sc) sc.stick = { x, y }; }} />

      {channel && (
        <div className="hud channel hud-box">
          <div className="label">{channel.label}</div>
          <div className="bar"><div style={{ width: `${ch * 100}%` }} /></div>
        </div>
      )}
      {trading && !channel && <div className="toast" style={{ top: "28%" }}>TRADING: your position is visible to everyone</div>}
      {toast && toast.until > now && <div className="toast">{toast.text}</div>}
      {!watch && rpub && !rpub.alive && !ended && <div className="toast" style={{ top: "40%" }}>KNOCKED OUT · your protected slot is safe · watching until the raid ends</div>}
      {!watch && rpub?.extracted && !ended && <div className="toast" style={{ top: "40%" }}>EXTRACTED · backpack frozen · settles at raid end</div>}
      {!raid && raidId && <div className="toast">Waiting for raid {raidId}…</div>}
      {noKey && !watch && (
        <div className="overlay"><div className="card"><h3>Not your raid key</h3><p className="note">This browser has no raid key for raid {raidId}. Join from the lobby, or watch it.</p><div className="row"><button className="btn" onClick={() => navigate("/play")}>Lobby</button><button className="btn" onClick={() => navigate(`/watch/${raidId}`)}>Watch</button></div></div></div>
      )}

      {/* trade picker */}
      {trade && mine?.rprv && (
        <div className="overlay" onClick={() => setTrade(false)}>
          <div className="card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <h3>Terminal · swap at the current price (no spread)</h3>
            <p className="note">Takes 3 s. Your position is public while it runs.</p>
            {[0, 1, 2].map((from) => (
              <div key={from} className="row" style={{ marginBottom: 8 }}>
                <span className="mono" style={{ width: 150 }}>{DISTRICTS[from]} {(Number(mine.rprv!.backpack[from].toString()) / 1e6).toFixed(2)}</span>
                {[0, 1, 2].filter((t) => t !== from).map((to) => (
                  <button key={to} className="btn" disabled={mine.rprv!.backpack[from].isZero()} onClick={() => doTrade(from, to)}>→ {DISTRICTS[to]}</button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* reveal + debrief */}
      {ended && (
        <div className="overlay">
          <div className="card">
            <h3>Raid over</h3>
            {!report && <p className="dim">Settling on the base layer and paying out… (report after claims, ~1 min)</p>}
            {report && (
              <>
                {report.report.mystery && (
                  <p style={{ fontSize: 18 }}>
                    The tape was <b className="mono">{report.report.mystery.day}</b> · Tower = SOL, Factory = BTC, Harbor = ETH ·{" "}
                    {reveal ? (reveal.ok ? <span className="verified">Verified ✓</span> : <span className="mismatch">Proof mismatch</span>) : "checking proof…"}
                  </p>
                )}
                {!watch && myResult && (
                  <div className="kv" style={{ margin: "12px 0" }}>
                    <span>Outcome</span><span>{myResult.extracted ? <span className="up">Extracted</span> : myResult.alive === false ? <span className="down">Knocked out</span> : "Did not extract"}</span>
                    <span>dUSD paid</span><span className="mono">{fmt(Number(myResult.dusdPayout))} dUSD</span>
                    <span>Minted (devnet demo)</span><span className="mono">{myResult.mintUnits.map((u: string, i: number) => `${(Number(u) / 1e6).toFixed(2)} d${["TWR", "FAC", "HRB"][i]}`).join(" · ")}</span>
                  </div>
                )}
                {!watch && <div className="debrief">{myDebrief?.text ?? report.report.wire?.debriefs?.find((d: WireLine) => d.slot === mySlot)?.text ?? "THE WIRE is writing your debrief…"}</div>}
                <div className="row" style={{ marginTop: 16 }}>
                  <button className="btn primary" onClick={() => navigate(`/report/${raidId}`)}>Market Raid Report</button>
                  <button className="btn" onClick={() => navigate("/play")}>Next raid</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* THE WIRE */}
      <div className="chyron">
        <div className="chyron-brand">THE WIRE</div>
        {lastWire && <div className={`chyron-tag ${lastWire.tag.split(" ")[0]}`}>{lastWire.tag}</div>}
        <div className="chyron-text"><span key={wire.length} className="fresh">{lastWire?.text ?? "Waiting for the first move…"}</span></div>
      </div>
    </div>
  );
}

function TouchStick({ onMove }: { onMove: (x: number, y: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const handle = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const x = (e.clientX - (r.left + r.width / 2)) / (r.width / 2), y = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const n = Math.min(1, Math.hypot(x, y)) / (Math.hypot(x, y) || 1);
    setKnob({ x: x * n, y: y * n }); onMove(x * n, y * n);
  };
  const end = () => { setKnob({ x: 0, y: 0 }); onMove(0, 0); };
  return (
    <div className="stick" ref={ref} onPointerDown={(e) => { ref.current!.setPointerCapture(e.pointerId); handle(e); }} onPointerMove={(e) => e.buttons && handle(e)} onPointerUp={end} onPointerCancel={end}>
      <div style={{ transform: `translate(${knob.x * 36}px, ${knob.y * 36}px)` }} />
    </div>
  );
}

