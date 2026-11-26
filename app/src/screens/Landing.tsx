// Title screen: a real in-engine 3D scene (game/MenuScene3D.ts) with the game menu over it.
import { useEffect, useRef, useState } from "react";
import { navigate } from "../App";
import { startMenuScene } from "../game/MenuScene3D";
import { getTheme, getWeather, type Theme, type Weather } from "../game/three/themes";
import Customize, { WorldPicker } from "./Customize";
import HowToPlay from "./HowToPlay";

const ITEMS: { label: string; sub: string; to: string; primary?: boolean }[] = [
  { label: "DEPLOY", sub: "Stake 10 devnet dUSD · up to 8 raiders · 5 minutes", to: "/play", primary: true },
  { label: "CHARACTER", sub: "Male or female, skin, hair, clothes · BOT style · map and time of day", to: "#char" },
  { label: "HOW TO PLAY", sub: "The loop in five steps, controls and what every colour means", to: "#howto" },
  { label: "TRAINING GROUND", sub: "Learn the controls offline · nothing touches the chain", to: "/training" },
  { label: "MYSTERY MARKET DAY", sub: "Replay a real past trading day. Revealed and proven at the end", to: "/play" },
  { label: "WATCH LIVE", sub: "Spectate the current raid · public state only", to: "/watch" },
  { label: "RAID HISTORY", sub: "Every settled raid, verified on-chain", to: "/history" },
];

export default function Landing() {
  const host = useRef<HTMLDivElement>(null);
  const [theme, setT] = useState<Theme>(getTheme());
  const [weather, setW] = useState<Weather>(getWeather());
  const [howto, setHowto] = useState(false);
  const [char, setChar] = useState(false);
  const [rev, setRev] = useState(0);
  useEffect(() => (host.current ? startMenuScene(host.current, theme, weather) : undefined), [theme, weather, rev]);
  return (
    <div className="title-screen">
      <div className="title-canvas" ref={host} key={`${theme}-${weather}-${rev}`} />
      <div className="title-shade" />
      <div className="title-menu">
        <div className="logo" aria-label="RAZKYN">
          <span className="wick" aria-hidden /><span className="logo-text">RAZKYN</span>
        </div>
        <div className="logo-sub">RAID · TRADE · EXTRACT</div>
        <nav className="menu-list">
          {ITEMS.map((it) => (
            <button key={it.label} className={`menu-item ${it.primary ? "primary" : ""}`} onClick={() => (it.to === "#howto" ? setHowto(true) : it.to === "#char" ? setChar(true) : navigate(it.to))}>
              <span className="mi-label">{it.label}</span>
              <span className="mi-sub">{it.sub}</span>
            </button>
          ))}
        </nav>
        <div className="title-world"><WorldPicker theme={theme} weather={weather} onTheme={setT} onWeather={setW} /></div>
      </div>
      <div className="title-foot">
        <span>Market-driven extraction on Solana · MagicBlock Private ER · VRF · Pricing Oracle · Magic Actions</span>
        <span className="warn-t">DEVNET DEMO · TOKENS ARE NOT REAL MONEY OR SHARES</span>
      </div>
      {howto && <HowToPlay onClose={() => setHowto(false)} />}
      {char && <Customize onClose={() => { setChar(false); setRev((r) => r + 1); }} onWorld={(t, w) => { setT(t); setW(w); }} />}
    </div>
  );
}
