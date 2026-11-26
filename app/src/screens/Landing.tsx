// Title screen: a real in-engine 3D scene (game/MenuScene3D.ts) with the game menu over it,
// a live status panel (current raid from the keeper, last settled raid) and a proof strip for judges.
import { useCallback, useEffect, useRef, useState } from "react";
import { navigate } from "../App";
import { startMenuScene } from "../game/MenuScene3D";
import { getTheme, getWeather, type Theme, type Weather } from "../game/three/themes";
import { getHistory, getLobby, type HistoryItem, type Lobby } from "../lib/keeper";
import { PID } from "../lib/chain";
import { explorerAddr } from "../lib/config";
import { sfx } from "../lib/sfx";
import Customize, { WorldPicker } from "./Customize";
import HowToPlay from "./HowToPlay";

const ITEMS: { label: string; sub: string; to: string; primary?: boolean }[] = [
  { label: "DEPLOY", sub: "Stake 10 devnet dUSD · up to 8 raiders · 5 minutes", to: "/play", primary: true },
  { label: "MYSTERY MARKET DAY", sub: "Replay a real past trading day. Revealed and proven at the end", to: "/play" },
  { label: "CHARACTER", sub: "Male or female, skin, hair, clothes · BOT style · map and time of day", to: "#char" },
  { label: "HOW TO PLAY", sub: "The loop in five steps, controls and what every colour means", to: "#howto" },
  { label: "TRAINING GROUND", sub: "Learn the controls offline · nothing touches the chain", to: "/training" },
  { label: "WATCH LIVE", sub: "Spectate the current raid · public state only", to: "/watch" },
  { label: "RAID HISTORY", sub: "Every settled raid, verified on-chain", to: "/history" },
];

const MODE: Record<string, string> = { mystery: "MYSTERY MARKET DAY", live: "LIVE CRYPTO", "live-markets": "STOCKS & GOLD" };
const mmss = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, "0")}`;

/** What is happening on the server right now, and the last settled raid. Real data only. */
function StatusPanel() {
  const [lobby, setLobby] = useState<Lobby | null | undefined>(undefined);
  const [hist, setHist] = useState<HistoryItem[] | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    let stop = false;
    const poll = async () => { const l = await getLobby(); if (!stop) setLobby(l); };
    const ph = async () => { const h = await getHistory(); if (!stop) setHist(h); };
    void poll(); void ph();
    const a = setInterval(poll, 3000), b = setInterval(ph, 30000), c = setInterval(() => setNow(Date.now()), 1000);
    return () => { stop = true; clearInterval(a); clearInterval(b); clearInterval(c); };
  }, []);
  const last = hist?.[0];
  const lastOut = last ? last.raiders.filter((r) => r.extracted).length : 0;
  const lastHumans = last ? last.raiders.filter((r) => !r.bot).length : 0;
  let state: { tag: string; cls: string; line: string; cta?: { label: string; to: string } };
  if (lobby === undefined) state = { tag: "CONNECTING", cls: "", line: "Reaching the game server…" };
  else if (lobby === null) state = { tag: "OFFLINE", cls: "down", line: "The game server is not answering. Training Ground still works." , cta: { label: "TRAINING", to: "/training" } };
  else if (lobby.phase === "lobby") state = { tag: "RAID OPEN", cls: "up", line: `${MODE[lobby.mode]} · join closes in ${mmss((lobby.joinDeadline - now) / 1000)}`, cta: { label: "JOIN NOW", to: "/play" } };
  else if (lobby.phase === "setup") state = { tag: "DROPPING SOON", cls: "amber", line: `${MODE[lobby.mode]} · building the city: private rollup, sealed crates, VRF spawns`, cta: { label: "WATCH", to: "/watch" } };
  else if (lobby.phase === "live") state = { tag: "RAID LIVE", cls: "down", line: `${MODE[lobby.mode]} · ${lobby.startTs ? `${mmss(300 - (now / 1000 - lobby.startTs))} left` : "in progress"}`, cta: { label: "WATCH LIVE", to: "/watch" } };
  else if (lobby.phase === "settling" || lobby.phase === "done") state = { tag: "SETTLING", cls: "amber", line: "Commit + Magic Action to the base layer, then claims", cta: { label: "WATCH", to: "/watch" } };
  else state = { tag: "NO RAID RUNNING", cls: "", line: lobby.canOpen?.ok === false ? `Paused: ${lobby.canOpen.reason}` : "Press DEPLOY to open one. BOT raiders fill the empty seats.", cta: lobby.canOpen?.ok === false ? undefined : { label: "DEPLOY", to: "/play" } };
  return (
    <aside className="status-panel" aria-live="polite">
      <div className="sp-head"><span className={`sp-dot ${state.cls}`} /><span className="sp-tag">{state.tag}</span></div>
      <div className="sp-line">{state.line}</div>
      {state.cta && <button className="sp-cta" onClick={() => navigate(state.cta!.to)}>{state.cta.label}</button>}
      {last && (
        <div className="sp-last" onClick={() => navigate(`/report/${last.raidId}`)} role="link" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && navigate(`/report/${last.raidId}`)}>
          <div className="sp-k">LAST RAID · {MODE[last.mode] ?? last.mode}</div>
          {last.title && <div className="sp-title">{last.title}</div>}
          <div className="sp-v">{lastOut}/{last.raiders.length} extracted · {lastHumans} human{lastHumans === 1 ? "" : "s"} · report hash on-chain</div>
          <div className="sp-link">OPEN VERIFIED REPORT ▸</div>
        </div>
      )}
      {hist && <div className="sp-count">{hist.length >= 50 ? "50+" : hist.length} raids settled on devnet</div>}
    </aside>
  );
}

export default function Landing() {
  const host = useRef<HTMLDivElement>(null);
  const [theme, setT] = useState<Theme>(getTheme());
  const [weather, setW] = useState<Weather>(getWeather());
  const [howto, setHowto] = useState(false);
  const [char, setChar] = useState(false);
  const [rev, setRev] = useState(0);
  const [focus, setFocus] = useState(0);
  const btns = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => (host.current ? startMenuScene(host.current, theme, weather) : undefined), [theme, weather, rev]);

  const go = useCallback((to: string) => {
    sfx.trade();
    if (to === "#howto") setHowto(true); else if (to === "#char") setChar(true); else navigate(to);
  }, []);
  // Keyboard: ↑ / ↓ move through the menu, Enter selects (like a console title screen).
  useEffect(() => {
    if (howto || char) return;
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.("input,textarea")) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setFocus((f) => { const n = (f + (e.key === "ArrowDown" ? 1 : ITEMS.length - 1)) % ITEMS.length; btns.current[n]?.focus(); return n; });
        sfx.tick();
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [howto, char]);

  return (
    <div className="title-screen">
      <div className="title-canvas" ref={host} key={`${theme}-${weather}-${rev}`} />
      <div className="title-shade" />
      <div className="title-menu">
        <div className="logo intro" aria-label="RAZKYN">
          <span className="wick" aria-hidden /><span className="logo-text">RAZKYN</span>
        </div>
        <div className="logo-sub intro-sub">RAID · TRADE · EXTRACT</div>
        <div className="logo-pitch intro-sub">A market-driven extraction game on Solana. The city moves with the market; the loot is real devnet assets.</div>
        <nav className="menu-list" aria-label="Main menu">
          {ITEMS.map((it, i) => (
            <button
              key={it.label} ref={(el) => { btns.current[i] = el; }}
              className={`menu-item ${it.primary ? "primary" : ""} ${focus === i ? "kb" : ""}`}
              style={{ animationDelay: `${0.25 + i * 0.07}s` }}
              onMouseEnter={() => { setFocus(i); sfx.tick(); }} onFocus={() => setFocus(i)} onClick={() => go(it.to)}
            >
              <span className="mi-label">{it.label}</span>
              <span className="mi-sub">{it.sub}</span>
            </button>
          ))}
        </nav>
        <div className="title-world"><WorldPicker theme={theme} weather={weather} onTheme={setT} onWeather={setW} /></div>
      </div>
      <StatusPanel />
      <div className="title-foot">
        <span className="proof">
          BUILT ON MAGICBLOCK · Private Ephemeral Rollup (TEE) · VRF · Pricing Oracle · Magic Actions ·{" "}
          <a href={explorerAddr(PID.toBase58())} target="_blank" rel="noreferrer">program {PID.toBase58().slice(0, 4)}…{PID.toBase58().slice(-4)} ↗</a>
        </span>
        <span className="warn-t">DEVNET DEMO · TOKENS ARE NOT REAL MONEY OR SHARES · ↑ ↓ ENTER</span>
      </div>
      {howto && <HowToPlay onClose={() => setHowto(false)} />}
      {char && <Customize onClose={() => { setChar(false); setRev((r) => r + 1); }} onWorld={(t, w) => { setT(t); setW(w); }} />}
    </div>
  );
}
