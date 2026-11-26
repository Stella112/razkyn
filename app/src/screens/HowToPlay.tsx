// HOW TO PLAY + colour legend. Rules match the program (CLAUDE.md §3, constants.rs).
import { useEffect } from "react";

const SEEN = "razkyn-howto-seen";
export const howToSeen = () => { try { return window.localStorage.getItem(SEEN) === "1"; } catch { return true; } };
const markSeen = () => { try { window.localStorage.setItem(SEEN, "1"); } catch { /* storage blocked */ } };

const STEPS: [string, string][] = [
  ["1 · LOOT", "Walk onto a crate (amber strip) and press E. Cracking the seal takes 2 s. What is inside was fixed by the raid's VRF seed and stays hidden in the TEE until you open it."],
  ["2 · READ THE MARKET", "Each district tracks one asset, so your backpack's dollar value moves with the market. A district up 2% wakes its dormant crates. A district down 2% cracks its floor: the red rows drain 10 HP a second (down 5%: twice the area)."],
  ["3 · TRADE", "On a terminal (teal ring) press E and swap a whole asset at the current price. It takes 3 s and everyone can see where you are while it runs. A hit cancels the trade."],
  ["4 · FIGHT", "Click a raider to shoot (6 tiles, 34 damage, 3 hits to knock out). A knocked-out raider's backpack drops as a crate anyone can open. Grey blocks with an amber top are cover: nobody walks or shoots through them."],
  ["5 · EXTRACT", "Exits open 2:00, 3:30 and 4:30 into the raid, two of the four for 30 s each (the clock shows the next window). Stand on an open exit (teal beam) and hold Space for 5 s. Your backpack settles to your wallet when the raid ends."],
];
const COLOURS: [string, string, string][] = [
  ["#45C9B2", "TEAL", "You · a rising district · terminals · open exits · a raider who is trading (exposed)"],
  ["#D9AC65", "AMBER", "Loot · sealed crates · other human raiders · your main actions"],
  ["#E4514E", "RED", "Danger · a falling district · cracked floor that hurts · trading halt · BOT raiders · damage"],
  ["#5C666C", "GREY", "Cover block (amber cap; nobody walks or shoots through it) · dormant crate (wakes when its district is up 2%) · an already-opened crate"],
  ["#C8D2D1", "SILVER", "Neutral information"],
];
const CONTROLS: [string, string][] = [
  ["WASD / arrows", "move"], ["Mouse", "aim"], ["Click", "shoot"], ["E", "open crate / trade at terminal"],
  ["Hold Space", "extract on an open exit"], ["Wheel", "zoom"], ["H", "this guide"], ["Tab", "inventory"], ["M", "full map"], ["Phone", "left stick + on-screen buttons"],
];

export default function HowToPlay({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    markSeen();
    const k = (e: KeyboardEvent) => { if (e.key === "Escape" || e.key.toLowerCase() === "h") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="howto-wrap" onClick={onClose}>
      <div className="howto" onClick={(e) => e.stopPropagation()}>
        <div className="howto-head"><span>HOW TO PLAY</span><button className="term-btn" onClick={onClose}>CLOSE · ESC</button></div>
        <p className="howto-goal">
          Five minutes, up to eight raiders. Your 10 dUSD entry splits into <b className="c-amber">2.00 that is always yours</b> (the protected slot),
          7.50 hidden in the crates and 0.50 fee. <b>Grab loot, ride the market, get out alive.</b> Knocked out = you keep only the protected slot.
          Loot nobody extracts is shared back to everyone by stake.
        </p>
        <div className="howto-grid">
          <div>{STEPS.map(([t, d]) => <div key={t} className="howto-step"><div className="hs-t">{t}</div><div className="hs-d">{d}</div></div>)}</div>
          <div>
            <div className="howto-sub">WHAT THE COLOURS MEAN</div>
            {COLOURS.map(([hex, name, d]) => (
              <div key={name} className="legend"><span className="sw" style={{ background: hex }} /><b>{name}</b><span>{d}</span></div>
            ))}
            <div className="legend"><span className="sym">▲ ▼</span><b>ARROWS</b><span>Up and down always carry an arrow and a sign, not only a colour.</span></div>
            <div className="howto-sub" style={{ marginTop: 14 }}>MINIMAP</div>
            <div className="hs-d">White dot = you (ring = your sight) · amber specks = sealed crates · teal squares = terminals · teal circles = open exits · red dots = BOTs you can see · amber dots = humans you can see · red × = knocked out.</div>
            <div className="howto-sub" style={{ marginTop: 14 }}>CONTROLS</div>
            <div className="controls">{CONTROLS.map(([k, v]) => <div key={k}><kbd>{k}</kbd><span>{v}</span></div>)}</div>
          </div>
        </div>
        <p className="hs-d" style={{ marginTop: 10 }}>Devnet demo: dUSD and the minted district tokens are test tokens, not money or shares. Practise for free in TRAINING GROUND.</p>
      </div>
    </div>
  );
}
