// Title screen: a real in-engine 3D scene (game/MenuScene3D.ts) with the game menu over it.
import { useEffect, useRef } from "react";
import { navigate } from "../App";
import { startMenuScene } from "../game/MenuScene3D";

const ITEMS: { label: string; sub: string; to: string; primary?: boolean }[] = [
  { label: "DEPLOY", sub: "Stake 10 devnet dUSD · up to 8 raiders · 5 minutes", to: "/play", primary: true },
  { label: "MYSTERY MARKET DAY", sub: "Replay a real past trading day. Revealed and proven at the end", to: "/play" },
  { label: "WATCH LIVE", sub: "Spectate the current raid · public state only", to: "/watch" },
  { label: "TRAINING GROUND", sub: "Learn the controls offline · nothing touches the chain", to: "/training" },
  { label: "RAID HISTORY", sub: "Every settled raid, verified on-chain", to: "/history" },
];

export default function Landing() {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => (host.current ? startMenuScene(host.current) : undefined), []);
  return (
    <div className="title-screen">
      <div className="title-canvas" ref={host} />
      <div className="title-shade" />
      <div className="title-menu">
        <div className="logo" aria-label="RAZKYN">
          <span className="wick" aria-hidden /><span className="logo-text">RAZKYN</span>
        </div>
        <div className="logo-sub">RAID · TRADE · EXTRACT</div>
        <nav className="menu-list">
          {ITEMS.map((it) => (
            <button key={it.label} className={`menu-item ${it.primary ? "primary" : ""}`} onClick={() => navigate(it.to)}>
              <span className="mi-label">{it.label}</span>
              <span className="mi-sub">{it.sub}</span>
            </button>
          ))}
        </nav>
      </div>
      <div className="title-foot">
        <span>Market-driven extraction on Solana · MagicBlock Private ER · VRF · Pricing Oracle · Magic Actions</span>
        <span className="warn-t">DEVNET DEMO · TOKENS ARE NOT REAL MONEY OR SHARES</span>
      </div>
    </div>
  );
}
