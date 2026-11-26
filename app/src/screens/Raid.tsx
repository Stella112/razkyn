import { useEffect, useMemo, useRef, useState } from "react";
import * as anchor from "@coral-xyz/anchor";
import type { Connection, Keypair } from "@solana/web3.js";
import { navigate } from "../App";
import {
  CLASSES, EXITS, MAP_H, MAP_W, MARKET_EVENTS, NUM_CRATES, P, PRICE_ONE, RaidPlayer, TERMINALS, UNIT, districtNames, rangeTiles,
  HAZARD_ROWS, backpackValue, changeBps, districtOfX, raidKeyFor, readMine, readPublic, readRaidBase, teeAuthed, teePublic,
  type PublicState, type RprvAcc, type ViewAcc,
} from "../lib/chain";
import { programError } from "../lib/errors";
import { explorerTx } from "../lib/config";
import { getLobby, getReport, subscribeWire, verifyMystery, hex, type ReportFile, type WireLine } from "../lib/keeper";
import { startGame, type RaidScene } from "../game/RaidScene3D";
import Market from "../game/Market";
import Minimap from "../game/Minimap";
import { sfx } from "../lib/sfx";

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

/** TRADING HALT active on the district at x (raid v2 fields; absent on older raids). */
const haltedHere = (r: { eventKind?: number; eventDistrict?: number; eventUntil?: { toString(): string } }, x: number) =>
  r.eventKind === 1 && Number(r.eventUntil?.toString() ?? 0) * 1000 > Date.now() && r.eventDistrict === districtOfX(x);

/** The most natural English voice the browser has (Edge/Chrome ship neural "Natural"/"Online"/Google voices). */
let cachedVoice: SpeechSynthesisVoice | null | undefined;
function newsVoice(): SpeechSynthesisVoice | null {
  if (cachedVoice) return cachedVoice;
  const all = typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis.getVoices() : [];
  if (!all.length) return null; // voices load asynchronously; try again on the next line
  const en = all.filter((v) => /^en(-|_|$)/i.test(v.lang));
  const rank = (v: SpeechSynthesisVoice) => (/natural/i.test(v.name) ? 4 : /neural|online/i.test(v.name) ? 3 : /google/i.test(v.name) ? 2 : /samantha|daniel|aria|guy|jenny/i.test(v.name) ? 1 : 0);
  cachedVoice = [...en].sort((a, b) => rank(b) - rank(a))[0] ?? null;
  return cachedVoice;
}

/** Eases a displayed number toward its target (rolling counter). */
function useRolling(target: number) {
  const [v, setV] = useState(target);
  const ref = useRef(target);
  useEffect(() => {
    const i = setInterval(() => {
      const d = target - ref.current;
      ref.current = Math.abs(d) < 500 ? target : ref.current + d * 0.25;
      setV(ref.current);
      if (ref.current === target) clearInterval(i);
    }, 40);
    return () => clearInterval(i);
  }, [target]);
  return v;
}

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
  const [noLive, setNoLive] = useState(false);
  const pending = useRef({ dx: 0, dy: 0 });
  const values = useRef<number[]>([]);
  const [hurtAt, setHurtAt] = useState(0);
  const [pops, setPops] = useState<{ id: number; text: string }[]>([]);
  const [muted, setMuted] = useState(sfx.muted);
  const prevHp = useRef<number | null>(null);
  const prevVal = useRef<number | null>(null);
  const [voice, setVoice] = useState(() => { try { return window.localStorage.getItem("razkyn-voice") === "1"; } catch { return false; } });
  const voiceRef = useRef(voice); voiceRef.current = voice;
  const toggleVoice = () => setVoice((v) => { const n = !v; try { window.localStorage.setItem("razkyn-voice", n ? "1" : "0"); } catch { /* ignore */ } if (!n) window.speechSynthesis?.cancel(); return n; });
  const alerted = useRef<Set<number>>(new Set());
  const pop = (text: string) => { const id = Date.now() + Math.random(); setPops((p) => [...p, { id, text }]); setTimeout(() => setPops((p) => p.filter((x) => x.id !== id)), 1500); };
  const pubRef = useRef(pub); pubRef.current = pub;
  const mineRef = useRef(mine); mineRef.current = mine;
  const extractHeld = useRef(false);

  const say = (text: string, ms = 1800) => setToast({ text, until: Date.now() + ms });

  // Watch with no id: follow the keeper's current raid.
  useEffect(() => {
    if (raidId) return;
    getLobby().then((l) => { if (l && l.raidId && l.phase !== "idle") setRaidId(l.raidId); else setNoLive(true); });
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
    return subscribeWire(raidId, (l) => {
      setWire((w) => [...w.slice(-80), l]);
      // Voice narration (optional): breaking news and in-game events, read by the browser voice.
      if (voiceRef.current && (l.tag === "BREAKING" || l.tag === "IN-GAME EVENT") && "speechSynthesis" in window) {
        try {
          const u = new SpeechSynthesisUtterance(l.text.replace(/[▲▼]/g, ""));
          const v = newsVoice();
          if (v) u.voice = v;
          u.rate = v && /natural|neural|online/i.test(v.name) ? 1.05 : 1.08; u.pitch = 0.95; u.volume = 0.95;
          window.speechSynthesis.cancel(); window.speechSynthesis.speak(u);
        } catch { /* no voice available */ }
      }
    });
  }, [raidId]);

  // Raid key + TEE token (players only).
  const raid = pub?.raid ?? null;
  const DN = districtNames(raid?.mode);
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
    let inFlight = false;
    const MAXP = 300;
    const poll = async () => {
      // One read at a time: overlapping reads would each subtract the same sent moves and run the
      // prediction away (seen on a slow / background tab: pending.dy reached -6,501,600).
      if (inFlight) return;
      inFlight = true;
      const before = { ...pending.current };
      try {
        const m = await readMine(player.conn, raidId, player.slot);
        if (stop) return;
        const dx = pending.current.dx - before.dx, dy = pending.current.dy - before.dy;
        pending.current = { dx: Math.max(-MAXP, Math.min(MAXP, dx)), dy: Math.max(-MAXP, Math.min(MAXP, dy)) };
        setMine(m);
        if (m.rprv && pubRef.current) {
          values.current = [...values.current.slice(-90), backpackValue(m.rprv.backpack, pubRef.current.districts)];
        }
      } catch { /* transient */ } finally { inFlight = false; }
    };
    poll();
    const i = setInterval(poll, 300);
    return () => { stop = true; clearInterval(i); };
  }, [player, raidId]);

  const rpub = mySlot >= 0 ? pub?.rpubs[mySlot] ?? null : null;
  useEffect(() => {
    const hp = rpub?.hp;
    if (hp == null) return;
    if (prevHp.current != null && hp < prevHp.current) { sceneRef.current()?.hurt(); setHurtAt(Date.now()); sfx.hit(); }
    prevHp.current = hp;
  }, [rpub?.hp]);
  const curVal = mine?.rprv && pub ? backpackValue(mine.rprv.backpack, pub.districts) : null;
  useEffect(() => {
    if (curVal == null) return;
    const prev = prevVal.current;
    prevVal.current = curVal;
    // Loot lands as a jump far bigger than a one-second price move (trades keep the value level).
    if (prev != null && curVal - prev > Math.max(50_000, prev * 0.03) && mine?.rprv?.channelKind !== 2) {
      const gain = curVal - prev;
      // Rarity by value (the 5.5 dUSD x raiders loot pool averages ~1.2 dUSD a crate).
      const tier = gain >= 2_000_000 ? "JACKPOT" : gain >= 1_000_000 ? "RARE" : "";
      pop(`${tier ? tier + " " : ""}+${(gain / 1e6).toFixed(2)} dUSD`);
      sfx.loot(); if (tier) setTimeout(() => sfx.loot(), 160); if (tier === "JACKPOT") setTimeout(() => sfx.extract(), 320);
      if (tier) { sceneRef.current()?.burst({ x: mine!.rprv!.x, y: mine!.rprv!.y }, tier === "JACKPOT" ? 0xd9ac65 : 0x45c9b2, tier === "JACKPOT" ? 90 : 55); }
      const sc = sceneRef.current();
      if (sc && mine?.rprv) { sc.burst({ x: mine.rprv.x, y: mine.rprv.y }); sc.popText({ x: mine.rprv.x, y: mine.rprv.y }, `+${(gain / 1e6).toFixed(2)}`); }
    }
  }, [curVal]); // eslint-disable-line react-hooks/exhaustive-deps
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
      if (label.startsWith("Ripping")) sfx.open(); else sfx.trade();
      const isTrade = label.startsWith("Trading");
      const t0 = Date.now();
      let seen = false;
      while (Date.now() - t0 < ms + 150) {
        await new Promise((r) => setTimeout(r, 100));
        const k = mineRef.current?.rprv?.channelKind;
        if (isTrade && k === 2) seen = true;
        // Combat interrupts trades (program v2): the channel is gone before it finished.
        if (isTrade && seen && k === 0) { say("TRADE INTERRUPTED: you took a hit, nothing swapped", 3000); sfx.deny(); setHurtAt(Date.now()); return; }
      }
      await player.send(await finishIx());
      say(done);
    } catch (e) {
      const m = programError(e);
      say(label.startsWith("Trading") && m.startsWith("Interrupted") ? "TRADE INTERRUPTED: you took a hit, nothing swapped" : m, 3000); sfx.deny();
    } finally { setChannel(null); }
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
    const range = rangeTiles(pubRef.current?.raid?.classes?.[player.slot]);
    if (dist(hit.x, hit.y, me.x, me.y) > range * UNIT) { say(`Out of range (${range} tiles)`); return; }
    sceneRef.current()?.flash(me, hit);
    sfx.shot();
    player.shootIx(hit.slot).then((ix) => player.send(ix)).catch((e) => say(programError(e)));
  };

  const onInteract = () => {
    if (!canAct || !player || channel) return;
    const me = myPos(); const p = pubRef.current;
    if (!me || !p?.raid) return;
    if (TERMINALS.some((t) => { const c = center(t); return dist(c.x, c.y, me.x, me.y) <= UNIT; })) {
      if (haltedHere(p.raid, me.x)) { say("TRADING HALT: this district's terminals are frozen", 2500); sfx.deny(); return; }
      setTrade(true); return;
    }
    // Nearest crate within 1 tile (sealed, or a public drop crate).
    let best = -1, bd = Infinity;
    p.raid.cratePos.forEach((c, i) => { if (i < NUM_CRATES && !(p.crates[i]?.state === 1)) { const d = dist(c.x, c.y, me.x, me.y); if (d < bd) { bd = d; best = i; } } });
    for (let i = NUM_CRATES; i < p.crates.length; i++) { const c = p.crates[i]; if (c?.placed && c.state === 0) { const d = dist(c.x, c.y, me.x, me.y); if (d < bd) { bd = d; best = i; } } }
    if (best < 0 || bd > UNIT) { say("Nothing in reach: stand on a crate or a terminal"); return; }
    const district = best < NUM_CRATES ? Math.floor(best / 12) : p.crates[best]!.district; // drop crates are public
    if (best < NUM_CRATES && best % 12 >= 8 && !p.districts[district]?.awake) { say("Dormant crate: wakes when its district is +2%"); return; }
    const at = best < NUM_CRATES ? p.raid.cratePos[best] : { x: p.crates[best]!.x, y: p.crates[best]!.y };
    sceneRef.current()?.startRip(at, 2000);
    void runChannel("Ripping crate open", 2000, player.openIx(best, district), () => player.finishOpenIx(best), `Crate #${best + 1} open: contents were fixed by this raid's VRF seed`)
      .finally(() => sceneRef.current()?.stopRip());
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
      sfx.extract();
      sceneRef.current()?.burst(me, 0x45c9b2, 60);
    } catch (e) { say(programError(e)); } finally { setChannel(null); }
  };

  const doTrade = async (from: number, to: number) => {
    setTrade(false);
    const units = mine?.rprv?.backpack[from];
    if (!player || !units || units.isZero()) { say("Nothing to trade in that asset"); return; }
    const me = mineRef.current?.rprv;
    if (!me) return;
    const ms = pubRef.current?.raid?.classes?.[player.slot] === 2 ? 2000 : 3000; // Trader: 2 s
    await runChannel("Trading: your position is public", ms, player.startTradeIx(from, to, units, districtOfX(me.x)), () => player.finishTradeIx(), "Trade filled at the current price");
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
    sfx.peek();
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
  const rolling = useRolling(bpValue);
  const myD = mine?.rprv ? districtOfX(mine.rprv.x) : -1;
  const myRows = myD >= 0 ? HAZARD_ROWS[pub?.districts[myD]?.hazardLevel ?? 0] : undefined;
  // Trade alert: any raider trading within 12 tiles (their position is public while they trade).
  const alerts = (pub?.rpubs ?? []).map((r, s) => {
    if (!r || s === mySlot || !r.exposed || !r.alive || r.extracted || !mine?.rprv) return null;
    const dx = r.pubX - mine.rprv.x, dy = r.pubY - mine.rprv.y, d = Math.hypot(dx, dy) / 100;
    if (d > 12) return null;
    const dir = (dy < -150 ? "N" : dy > 150 ? "S" : "") + (dx > 150 ? "E" : dx < -150 ? "W" : "");
    return { s, d: Math.round(d), dir: dir || "here", bot: r.isBot };
  }).filter(Boolean) as { s: number; d: number; dir: string; bot: boolean }[];
  useEffect(() => {
    for (const a of alerts) if (!alerted.current.has(a.s)) { alerted.current.add(a.s); sfx.peek(); }
    for (const s of [...alerted.current]) if (!alerts.some((a) => a.s === s)) alerted.current.delete(s);
  }, [alerts.map((a) => a.s).join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  const inHaz = !!(myRows && mine?.rprv && rpub?.alive && Math.floor(mine.rprv.y / 100) >= myRows[0] && Math.floor(mine.rprv.y / 100) <= myRows[1]);
  const outcome = watch ? { t: "RAID OVER", c: "meh" } : rpub?.extracted || myResult?.extracted ? { t: "EXTRACTED", c: "win" } : rpub && !rpub.alive ? { t: "KNOCKED OUT", c: "lose" } : { t: "STRANDED", c: "meh" };

  // Contextual prompt (bottom centre): what E / Space would do right here, from the on-chain position.
  const ctxPrompt = (() => {
    const m = mine?.rprv;
    if (watch || !canAct || !m || !pub?.raid || channel) return null;
    if (TERMINALS.some((t) => { const c = center(t); return dist(c.x, c.y, m.x, m.y) <= UNIT; })) return haltedHere(pub.raid, m.x) ? "TRADING HALTED · terminals frozen" : `E · TRADE AT TERMINAL · ${pub.raid.classes?.[mySlot] === 2 ? 2 : 3} s exposed`;
    const openEx = pub.raid.exitWindow ? pub.raid.openExits.filter((e) => e !== 255) : [];
    if (openEx.some((e) => { const c = center(EXITS[e]); return dist(c.x, c.y, m.x, m.y) <= UNIT; })) return "HOLD SPACE · EXTRACT · 5 s";
    const sealed = pub.raid.cratePos.some((c, i) => i < NUM_CRATES && !(c.x === 0 && c.y === 0) && pub.crates[i]?.state !== 1 && dist(c.x, c.y, m.x, m.y) <= UNIT)
      || pub.crates.slice(NUM_CRATES).some((c) => c?.placed && c.state === 0 && dist(c.x, c.y, m.x, m.y) <= UNIT);
    return sealed ? "E · CRACK SEAL · 2 s" : null;
  })();

  return (
    <div className="raid">
      <div className="raid-canvas" ref={hostRef} />
      {ctxPrompt && <div className="ctx-prompt">{ctxPrompt}</div>}
      <div className="portrait-hint">Turn your phone sideways: RAZKYN plays in landscape.</div>
      <div className={`vignette ${now - hurtAt < 260 ? "on" : inHaz ? "haz" : ""}`} />
      {pops.map((p) => <div key={p.id} className="popup">{p.text}</div>)}
      {!watch && alerts.length > 0 && (
        <div className="trade-alert">{alerts.map((a) => `${a.bot ? "BOT" : "RAIDER"} ${a.s + 1} TRADING · ${a.d} tiles ${a.dir}`).join("  ·  ")}</div>
      )}

      {/* top-left: me */}
      <div className="hud hud-tl">
        <div className="hud-box row" style={{ gap: 12 }}>
          <a className="brand" href="/" onClick={(e) => { e.preventDefault(); navigate("/"); }} style={{ fontSize: 12 }}>RAZKYN</a>
          <span className="pill">{raid?.mode === 0 ? "MYSTERY" : "LIVE"}</span>
          {watch ? <span className="pill">WATCH · public only</span> : mySlot >= 0 ? <span className="pill live">RAIDER {mySlot + 1}</span> : null}
          <button className="act mute" title={muted ? "Sound off" : "Sound on"} onClick={() => setMuted(sfx.toggle())}>{muted ? "SND OFF" : "SND"}</button>
          <button className="act mute" title={voice ? "THE WIRE voice on" : "THE WIRE voice off"} onClick={toggleVoice} style={{ opacity: voice ? 1 : 0.5 }}>VOICE</button>
        </div>
        {watch && raidId && <Market raidId={raidId} pub={pub} />}
        {!watch && mySlot >= 0 && (
          <>
            <div className="hud-box hp">
              <div className="row" style={{ justifyContent: "space-between" }}><span className="label">Health</span><span>{rpub?.hp ?? "…"} HP</span></div>
              <div className="hp-bar"><div style={{ width: `${rpub?.hp ?? 0}%` }} /></div>
            </div>
            <div className="hud-box">
              <div className="label">Backpack (live value)</div>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className="big-num">{fmt(rolling)} <span className="dim" style={{ fontSize: 12 }}>dUSD</span></span>
                <Sparkline data={values.current} />
              </div>
              <div className="dim" style={{ fontSize: 11 }}>
                {mine?.rprv?.backpack.map((u, i) => `${DN[i].split(" ")[0]} ${(Number(u.toString()) / 1e6).toFixed(2)}`).join(" · ") ?? ""}
              </div>
              <div className="label" style={{ marginTop: 6 }}>Protected slot <span style={{ color: "var(--text)" }}>4.00 dUSD</span></div>
            </div>
          </>
        )}
      </div>

      {/* top-centre: clock and extraction state */}
      <div className="hud hud-tc">
        <div className="hud-box">
          <div className="label" style={{ textAlign: "right" }}>{live ? "Raid ends in" : ended ? "Raid over" : "Waiting for start"}</div>
          <div className={`timer ${live && left < 30 ? "hot" : ""}`}>{live ? mmss(left) : "—"}</div>
          <div className="label" style={{ textAlign: "right" }}>
            {winOpen ? <span className="up">EXIT WINDOW {raid!.exitWindow} OPEN</span> : nextWin !== undefined && live ? `next exit window in ${mmss(nextWin - elapsed)}` : ""}
          </div>
        </div>
      </div>

      {/* top-right: minimap, districts, peek */}
      <div className="hud hud-tr">
        <Minimap pub={pub} me={!watch && mine?.rprv ? { x: mine.rprv.x, y: mine.rprv.y } : null} visible={mine?.view ? mine.view.entries.slice(0, mine.view.count) : []} mySlot={watch ? -1 : mySlot} names={DN} />
        <div className="districts">
          {[0, 1, 2].map((d) => {
            const ds = pub?.districts[d]; const b = changeBps(ds ?? null);
            return (
              <div key={d} className={`district-chip ${ds?.hazardLevel ? "haz" : ""} ${ds?.awake && b >= 200 ? "wake" : ""}`}>
                <div className="label">{DN[d]}</div>
                <div className={`px ${b >= 0 ? "up" : "down"}`}>{pct(b)}</div>
                <div className="dim" style={{ fontSize: 10 }}>{ds?.hazardLevel ? `HAZARD ${ds.hazardLevel}` : ds?.awake ? "crates awake" : Number(ds?.currentPrice.toString() ?? 0) > 0 ? "index " + (Number(ds!.currentPrice.toString()) / 1e4).toFixed(2) : "opens at the drop"}</div>
              </div>
            );
          })}
        </div>
        {!watch && player && (
          <div className="hud-box peek-panel">
            <button className="act" onClick={tryPeek}>TRY TO PEEK</button>
            {peek && (
              <div style={{ marginTop: 8, fontSize: 12 }}>
                <span className="lock">ACCESS DENIED</span>
                {peek.map((p) => <div key={p.target}><span className="dim">{p.target}:</span> <span className={p.ok ? "refused" : "amber"}>{p.result}</span></div>)}
              </div>
            )}
          </div>
        )}
      </div>

      {/* action buttons (touch + mouse) */}
      {!watch && canAct && (
        <div className="hud-actions">
          <button className="act loot" onClick={onInteract}><kbd>E</kbd>Open / trade</button>
          <button className="act exit" onPointerDown={() => void startExtract(true)} onPointerUp={() => (extractHeld.current = false)}><kbd>Space</kbd>Extract (hold)</button>
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
      {raid && (raid.eventKind ?? 0) > 0 && Number(raid.eventUntil?.toString() ?? 0) * 1000 > now && (
        <div className={`event-banner ${raid.eventKind === 1 ? "halt" : ""}`}>
          {MARKET_EVENTS[raid.eventKind!]}{raid.eventKind === 2 ? " · hazards trigger early" : ` · ${DN[raid.eventDistrict ?? 0]}`}{raid.eventKind === 1 ? " · terminals frozen" : raid.eventKind === 3 ? " · crates wake" : ""} · {Math.max(0, Math.ceil(Number(raid.eventUntil!.toString()) - now / 1000))}s
        </div>
      )}
      {!watch && rpub && !rpub.alive && !ended && <div className="toast" style={{ top: "40%" }}>KNOCKED OUT · your protected slot is safe · watching until the raid ends</div>}
      {!watch && rpub?.extracted && !ended && <div className="toast" style={{ top: "40%" }}>EXTRACTED · backpack frozen · settles at raid end</div>}
      {!raid && raidId && <div className="toast">Waiting for raid {raidId}…</div>}
      {raid && raid.status < 2 && <div className="toast" style={{ top: "40%" }}>{watch ? "RAID DROPS SOON · place your bets on the left" : "GET READY · the city is being built"}</div>}
      {watch && noLive && !raidId && (
        <div className="overlay"><div className="card" style={{ maxWidth: 520 }}>
          <div className="result-title meh" style={{ fontSize: 34 }}>NO LIVE RAID</div>
          <p className="note">Nobody is raiding right now. Open one from the lobby (BOTs fill the empty seats), or look back at past raids.</p>
          <div className="row"><button className="btn primary" onClick={() => navigate("/play")}>OPEN A RAID</button><button className="btn" onClick={() => navigate("/history")}>RAID HISTORY</button></div>
        </div></div>
      )}
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
                <span className="mono" style={{ width: 150 }}>{DN[from]} {(Number(mine.rprv!.backpack[from].toString()) / 1e6).toFixed(2)}</span>
                {[0, 1, 2].filter((t) => t !== from).map((to) => (
                  <button key={to} className="btn" disabled={mine.rprv!.backpack[from].isZero()} onClick={() => doTrade(from, to)}>→ {DN[to]}</button>
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
            <div className={`result-title ${outcome.c}`}>{outcome.t}</div>
            {!watch && myResult && <div className="payout">{fmt(Number(myResult.dusdPayout) + 0)} <span style={{ fontSize: 18 }}>dUSD</span>{myResult.mintUnits.some((u: string) => Number(u) > 0) && <span className="note" style={{ fontSize: 14, marginLeft: 10 }}>+ loot minted as {myResult.mintUnits.map((u: string, i: number) => (Number(u) ? `${(Number(u) / 1e6).toFixed(2)} d${["TWR", "FAC", "HRB"][i]}` : "")).filter(Boolean).join(" · ")}</span>}</div>}
            {!report && <p className="dim">Settling on-chain and paying everyone out… (about a minute)</p>}
            {report && (
              <>
                {report.report.mystery && <Reveal m={report.report.mystery} watch={watch} survived={outcome.c === "win"} proof={reveal} />}
                {!watch && myResult && (
                  <div className="kv" style={{ margin: "12px 0" }}>
                    <span>Outcome</span><span>{myResult.extracted ? <span className="up">Extracted</span> : myResult.alive === false ? <span className="down">Knocked out</span> : "Did not extract"}</span>
                    <span>dUSD paid</span><span className="mono">{fmt(Number(myResult.dusdPayout))} dUSD</span>
                    <span>Minted (devnet demo)</span><span className="mono">{myResult.mintUnits.map((u: string, i: number) => `${(Number(u) / 1e6).toFixed(2)} d${["TWR", "FAC", "HRB"][i]}`).join(" · ")}</span>
                  </div>
                )}
                {!watch && myResult && (
                  <div className="receipt">
                    <div className="label">extraction receipt · devnet</div>
                    {(report.report.claims as { slot: number; sig: string }[]).filter((c) => c.slot === mySlot).map((c) => (
                      <div key={c.sig} className="mono" style={{ fontSize: 12 }}>claim → your wallet: {c.sig.length > 40 ? <a href={explorerTx(c.sig)} target="_blank" rel="noreferrer">{c.sig.slice(0, 22)}… ↗</a> : c.sig}</div>
                    ))}
                    {report.report.settlement?.baseCommit?.length > 40 && <div className="mono" style={{ fontSize: 12 }}>settlement (commit + Magic Action): <a href={explorerTx(report.report.settlement.baseCommit)} target="_blank" rel="noreferrer">{report.report.settlement.baseCommit.slice(0, 22)}… ↗</a></div>}
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

type MysteryEvent = { title: string; summary: string; sources: { url: string; outlet: string }[]; note?: string } | null;
/** Cinematic Mystery Market Day reveal: the real day, sourced context, and the proof check. */
function Reveal({ m, watch, survived, proof }: { m: { day: string; event?: MysteryEvent }; watch: boolean; survived: boolean; proof: { ok: boolean } | null }) {
  const date = new Date(`${m.day}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  return (
    <div className="reveal">
      <div className="label">{watch ? "the tape was" : survived ? "you just survived" : "you just raided"}</div>
      <div className="reveal-title">{m.event?.title ?? "A REAL MARKET DAY"}</div>
      <div className="reveal-date">{date} · Tower = SOL · Factory = BTC · Harbor = ETH</div>
      {m.event?.summary && <p className="reveal-sum">{m.event.summary}</p>}
      <div className="row" style={{ gap: 8 }}>
        {(m.event?.sources ?? []).map((x) => <a key={x.url} className="pill" href={x.url} target="_blank" rel="noreferrer">{x.outlet} ↗</a>)}
        <span className="pill">{proof ? (proof.ok ? <span className="verified">price data Verified ✓</span> : <span className="mismatch">proof mismatch</span>) : "checking proof…"}</span>
      </div>
      {m.event?.note && <div className="note" style={{ marginTop: 8, fontSize: 11 }}>{m.event.note}</div>}
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

