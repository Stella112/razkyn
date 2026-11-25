import { useEffect, useRef } from "react";
import { navigate } from "../App";

/**
 * Neon skyline of the three districts (decorative; no market data): glass towers (Tower),
 * chimneys with smoke (Factory), cranes and containers over water (Harbor). Windows flicker.
 */
function Skyline() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext("2d")!;
    let raf = 0;
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    type B = { x: number; w: number; h: number; kind: 0 | 1 | 2; wins: number[][] };
    let bs: B[] = [];
    let W = 0, H = 0, dpr = 1;
    const smoke: { x: number; y: number; r: number; a: number }[] = [];
    const build = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = c.clientWidth; H = c.clientHeight; c.width = W * dpr; c.height = H * dpr;
      seed = 7; bs = [];
      let x = -10;
      while (x < W + 20) {
        const third = x / W;
        const kind = (third < 0.36 ? 0 : third < 0.68 ? 1 : 2) as 0 | 1 | 2;
        const w = kind === 0 ? 26 + rnd() * 40 : kind === 1 ? 40 + rnd() * 50 : 30 + rnd() * 40;
        const h = kind === 0 ? H * (0.35 + rnd() * 0.55) : kind === 1 ? H * (0.18 + rnd() * 0.3) : H * (0.1 + rnd() * 0.2);
        const wins: number[][] = [];
        for (let yy = 8; yy < h - 6; yy += kind === 0 ? 9 : 12) for (let xx = 5; xx < w - 5; xx += kind === 0 ? 7 : 10) if (rnd() < (kind === 0 ? 0.55 : 0.3)) wins.push([xx, yy, rnd()]);
        bs.push({ x, w, h, kind, wins });
        x += w + 2 + rnd() * 8;
      }
    };
    build();
    const colors = ["#22f2ff", "#ffc53d", "#3dffa0"];
    let t = 0;
    const draw = () => {
      t++;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const ground = H - 26;
      for (const b of bs) {
        const col = colors[b.kind];
        const top = ground - b.h;
        ctx.fillStyle = "rgba(10,6,30,0.95)";
        ctx.fillRect(b.x, top, b.w, b.h);
        ctx.shadowBlur = 14; ctx.shadowColor = col; ctx.strokeStyle = col; ctx.globalAlpha = 0.8; ctx.lineWidth = 1.4;
        ctx.strokeRect(b.x + 0.5, top + 0.5, b.w - 1, b.h);
        if (b.kind === 0) { // antenna
          ctx.beginPath(); ctx.moveTo(b.x + b.w / 2, top); ctx.lineTo(b.x + b.w / 2, top - 14); ctx.stroke();
          ctx.fillStyle = t % 60 < 30 ? "#ff2bd6" : "#5a1050"; ctx.fillRect(b.x + b.w / 2 - 2, top - 17, 4, 4);
        }
        if (b.kind === 1 && b.w > 60) { // chimney + smoke
          const cx = b.x + b.w * 0.7;
          ctx.strokeRect(cx, top - 26, 9, 26);
          if (t % 18 === 0) smoke.push({ x: cx + 4, y: top - 28, r: 4, a: 0.5 });
        }
        if (b.kind === 2 && b.w > 50) { // crane
          ctx.beginPath(); ctx.moveTo(b.x + 8, top); ctx.lineTo(b.x + 8, top - 40); ctx.lineTo(b.x + b.w + 30, top - 40); ctx.moveTo(b.x + 8, top - 30); ctx.lineTo(b.x + 26, top - 40); ctx.stroke();
        }
        ctx.shadowBlur = 0; ctx.globalAlpha = 1;
        for (const [wx, wy, p] of b.wins) {
          const on = Math.sin(t / 40 + p * 50) > -0.6;
          ctx.fillStyle = on ? col : "rgba(255,255,255,0.05)";
          ctx.globalAlpha = on ? 0.55 + 0.4 * p : 1;
          ctx.fillRect(b.x + wx, top + wy, b.kind === 0 ? 3 : 5, b.kind === 0 ? 4 : 3);
        }
        ctx.globalAlpha = 1;
      }
      for (const s of smoke) { s.y -= 0.5; s.x += 0.25; s.r += 0.12; s.a -= 0.004; ctx.fillStyle = `rgba(255,197,61,${Math.max(0, s.a) * 0.35})`; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 7); ctx.fill(); }
      while (smoke.length && smoke[0].a <= 0) smoke.shift();
      // neon horizon + water reflection
      const g = ctx.createLinearGradient(0, ground, W, ground);
      g.addColorStop(0, "#22f2ff"); g.addColorStop(0.5, "#ff2bd6"); g.addColorStop(1, "#3dffa0");
      ctx.fillStyle = g; ctx.shadowBlur = 18; ctx.shadowColor = "#ff2bd6"; ctx.fillRect(0, ground, W, 2); ctx.shadowBlur = 0;
      ctx.globalAlpha = 0.18;
      for (let y = ground + 6; y < H; y += 5) ctx.fillRect(Math.sin((y + t) / 9) * 14, y, W, 1);
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    };
    draw();
    window.addEventListener("resize", build);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", build); };
  }, []);
  return <canvas ref={ref} className="skyline" aria-hidden />;
}

const FACTS = ["8 RAIDERS", "5 MINUTES", "36 SEALED CRATES", "3 EXIT WINDOWS", "LOOT HIDDEN IN A TEE", "VRF SPAWNS", "THE MAP IS THE MARKET", "THE WIRE IS WATCHING", "DEVNET DEMO · NOT REAL MONEY"];

export default function Landing() {
  return (
    <div className="page" style={{ overflow: "hidden" }}>
      <div className="ticker"><div>{[...FACTS, ...FACTS].map((f, i) => <span key={i} className={["neon-c", "neon-m", "neon-a"][i % 3]}>◆ {f}</span>)}</div></div>
      <div className="hero">
        <div className="wordmark">RAZKYN</div>
        <div className="tagline"><span className="t1">RAID.</span> <span className="t2">TRADE.</span> <span className="t3">EXTRACT.</span></div>
        <p className="hero-sub">
          Drop into a night-market city where every district is a live price chart. Rising streets light up and wake hidden loot.
          Falling ones crack into hazard. Grab what you can, trade under fire, and get out before the exits close.
        </p>
        <div className="row" style={{ justifyContent: "center", marginTop: 6 }}>
          <button className="btn primary big" onClick={() => navigate("/play")}>▶ PLAY</button>
          <button className="btn big" onClick={() => navigate("/watch")}>◉ WATCH</button>
        </div>
        <div className="steps" style={{ marginTop: 22 }}>
          <div className="step"><div className="n neon-c">01 RAID</div><p>Stake 10 devnet dUSD and drop in with up to 7 others. Sealed crates hide loot you can't see until you crack one open.</p></div>
          <div className="step"><div className="n neon-a">02 TRADE</div><p>Your backpack is worth whatever the market says, live. Swap at a terminal, but everyone sees where you are while you do.</p></div>
          <div className="step"><div className="n neon-m">03 EXTRACT</div><p>Exits open at 2:00, 3:30 and 4:30. Hold five seconds on a green beacon and the bag is yours. Go down and it drops for others.</p></div>
        </div>
        <div className="stack" style={{ marginTop: 10 }}>
          {["Private ER (TEE)", "Permissions", "VRF", "Pricing Oracle", "Magic Actions", "Raid keys"].map((s) => <span className="pill" key={s}>{s}</span>)}
        </div>
      </div>
      <Skyline />
    </div>
  );
}
