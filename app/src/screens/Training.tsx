// TRAINING GROUND — offline practice in the real 3D raid scene. Nothing here touches the chain:
// movement is local, the target is a practice dummy, and crates are props (no loot, no tokens).
// It exists so a new player (or a judge without devnet SOL) can learn the controls, and so the
// 3D scene can be inspected without a live raid. Labelled as such on screen.
import { useEffect, useRef, useState } from "react";
import { navigate } from "../App";
import { EXITS, MAP_H, MAP_W, UNIT, type PublicState } from "../lib/chain";
import { startGame, type RaidScene } from "../game/RaidScene3D";
import { getTheme, type Theme } from "../game/three/themes";
import HowToPlay, { howToSeen } from "./HowToPlay";
import { ThemePicker } from "./Landing";

const STEP = 50, MOVE_MS = 110;
const crateLayout = Array.from({ length: 36 }, (_, i) => {
  const d = Math.floor(i / 12), k = i % 12;
  const lo = [1, 23, 45][d];
  return { x: (lo + 2 + ((k * 7) % 16)) * UNIT + 50, y: (3 + ((k * 11) % 34)) * UNIT + 50 };
});

export default function Training() {
  const host = useRef<HTMLDivElement>(null);
  const sc = useRef<RaidScene | null>(null);
  const me = useRef({ x: 10 * UNIT + 50, y: 30 * UNIT + 50 });
  const opened = useRef(new Set<number>());
  const [msg, setMsg] = useState("WASD to move · aim with the mouse · click to fire · E at a crate");
  const [stats, setStats] = useState("");
  const [theme, setTheme] = useState<Theme>(getTheme());
  const [help, setHelp] = useState(() => !howToSeen());

  useEffect(() => {
    if (!host.current) return;
    const { game, scene } = startGame(host.current);
    const s = scene()!;
    sc.current = s;
    const dummy = { x: 14 * UNIT + 50, y: 26 * UNIT + 50 };
    const state = (): PublicState => ({
      at: Date.now(),
      raid: {
        mode: 0, status: 2, exitWindow: 1, openExits: [0, 255], cratePos: crateLayout, eventKind: 0,
        raiders: Array.from({ length: 8 }, (_, i) => ({ joined: i < 2 })), classes: [0, 0, 0, 0, 0, 0, 0, 0],
      } as unknown as PublicState["raid"],
      districts: [null, null, null],
      rpubs: [null, { isBot: true, alive: true, exposed: false, extracted: false } as unknown as PublicState["rpubs"][number], null, null, null, null, null, null],
      crates: crateLayout.map((_, i) => (opened.current.has(i) ? ({ state: 1 } as unknown as PublicState["crates"][number]) : null)),
    });
    const feed = () => {
      const near = Math.hypot(dummy.x - me.current.x, dummy.y - me.current.y) <= 8 * UNIT;
      s.setInput({ watch: false, mySlot: 0, pub: state(), me: { ...me.current, alive: true }, visible: near ? [{ slot: 1, ...dummy }] : [], pending: { dx: 0, dy: 0 } });
    };
    s.onShootAt = (wx, wy) => {
      const d = Math.hypot(wx - dummy.x, wy - dummy.y);
      if (d < 180 && Math.hypot(dummy.x - me.current.x, dummy.y - me.current.y) <= 6 * UNIT) { s.flash(me.current, dummy); setMsg("Hit · practice dummy (no damage in training)"); }
      else s.flash(me.current, { x: wx, y: wy });
    };
    s.onInteract = () => {
      let best = -1, bd = Infinity;
      crateLayout.forEach((c, i) => { const d = Math.hypot(c.x - me.current.x, c.y - me.current.y); if (!opened.current.has(i) && d < bd) { bd = d; best = i; } });
      if (best < 0 || bd > UNIT) { setMsg("Nothing in reach: stand on a crate"); return; }
      s.startRip(crateLayout[best], 2000);
      setMsg("Cracking the seal (2 s)…");
      setTimeout(() => { opened.current.add(best); s.stopRip(); s.popText(crateLayout[best], "TRAINING · NO LOOT"); setMsg("In a raid, crate contents are sealed in the TEE until you open them"); }, 2000);
    };
    s.onExtract = (down) => {
      if (!down) return;
      const [ex, ey] = EXITS[0];
      const ok = Math.hypot((ex + 0.5) * UNIT - me.current.x, (ey + 0.5) * UNIT - me.current.y) <= UNIT;
      setMsg(ok ? "In a raid you hold Space here for 5 s to extract and settle on-chain" : "Exits glow teal when their window is open; stand inside and hold Space");
    };
    const mv = setInterval(() => {
      const dir = s.moveDir();
      if (dir) {
        me.current = {
          x: Math.max(0, Math.min(MAP_W * UNIT - 1, me.current.x + Math.round(dir.x * STEP))),
          y: Math.max(0, Math.min(MAP_H * UNIT - 1, me.current.y + Math.round(dir.y * STEP))),
        };
      }
      feed();
    }, MOVE_MS);
    const st = setInterval(() => { const x = s.stats(); setStats(x.frames < 60 ? "measuring frame rate…" : `${x.fps} fps · p95 ${x.p95Ms} ms · ${x.calls} draw calls${x.lowPower ? " · low power" : ""}`); }, 1000);
    feed();
    return () => { clearInterval(mv); clearInterval(st); game.destroy(); };
  }, [theme]);

  return (
    <div className="raid">
      <div className="raid-canvas" ref={host} key={theme} />
      <div className="training-bar">
        <a className="brand" href="/" onClick={(e) => { e.preventDefault(); navigate("/"); }}>RAZKYN</a>
        <span className="tag warn">TRAINING GROUND · OFFLINE · NOTHING HERE TOUCHES THE CHAIN</span>
        <span className="mono dim">{stats}</span>
        <button className="act mute help-btn" onClick={() => setHelp(true)}>HELP</button>
      </div>
      <div className="training-theme"><ThemePicker theme={theme} onPick={setTheme} /></div>
      {help && <HowToPlay onClose={() => setHelp(false)} />}
      <div className="prompt">{msg}</div>
    </div>
  );
}
