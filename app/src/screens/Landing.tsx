// Title screen: a real in-engine 3D scene (game/MenuScene3D.ts) with the game menu over it.
import { useEffect, useRef, useState } from "react";
import { navigate } from "../App";
import { startMenuScene } from "../game/MenuScene3D";
import { THEMES, getTheme, setTheme, type Theme } from "../game/three/themes";
import HowToPlay from "./HowToPlay";

const ITEMS: { label: string; sub: string; to: string; primary?: boolean }[] = [
  { label: "DEPLOY", sub: "Stake 10 devnet dUSD · up to 8 raiders · 5 minutes", to: "/play", primary: true },
  { label: "HOW TO PLAY", sub: "The loop in five steps, controls and what every colour means", to: "#howto" },
  { label: "TRAINING GROUND", sub: "Learn the controls offline · nothing touches the chain", to: "/training" },
  { label: "MYSTERY MARKET DAY", sub: "Replay a real past trading day. Revealed and proven at the end", to: "/play" },
  { label: "WATCH LIVE", sub: "Spectate the current raid · public state only", to: "/watch" },
  { label: "RAID HISTORY", sub: "Every settled raid, verified on-chain", to: "/history" },
];

export function ThemePicker({ theme, onPick }: { theme: Theme; onPick: (t: Theme) => void }) {
  return (
    <div>
      <div className="theme-pick">
        <span className="tp-l">MAP</span>
        {THEMES.map((t) => <button key={t.id} className={theme === t.id ? "on" : ""} onClick={() => { setTheme(t.id); onPick(t.id); }}>{t.name}</button>)}
      </div>
      <div className="theme-blurb">{THEMES.find((t) => t.id === theme)?.blurb} Looks only: the rules and the map are the same.</div>
    </div>
  );
}

export default function Landing() {
  const host = useRef<HTMLDivElement>(null);
  const [theme, setT] = useState<Theme>(getTheme());
  const [howto, setHowto] = useState(false);
  useEffect(() => (host.current ? startMenuScene(host.current, theme) : undefined), [theme]);
  return (
    <div className="title-screen">
      <div className="title-canvas" ref={host} key={theme} />
      <div className="title-shade" />
      <div className="title-menu">
        <div className="logo" aria-label="RAZKYN">
          <span className="wick" aria-hidden /><span className="logo-text">RAZKYN</span>
        </div>
        <div className="logo-sub">RAID · TRADE · EXTRACT</div>
        <nav className="menu-list">
          {ITEMS.map((it) => (
            <button key={it.label} className={`menu-item ${it.primary ? "primary" : ""}`} onClick={() => (it.to === "#howto" ? setHowto(true) : navigate(it.to))}>
              <span className="mi-label">{it.label}</span>
              <span className="mi-sub">{it.sub}</span>
            </button>
          ))}
        </nav>
        <ThemePicker theme={theme} onPick={setT} />
      </div>
      <div className="title-foot">
        <span>Market-driven extraction on Solana · MagicBlock Private ER · VRF · Pricing Oracle · Magic Actions</span>
        <span className="warn-t">DEVNET DEMO · TOKENS ARE NOT REAL MONEY OR SHARES</span>
      </div>
      {howto && <HowToPlay onClose={() => setHowto(false)} />}
    </div>
  );
}
