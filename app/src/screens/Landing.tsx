import { useEffect, useRef } from "react";
import { navigate } from "../App";

/** A decorative tape in the background: random walk lines, no market data. */
function Tape() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext("2d")!;
    let raf = 0, t = 0;
    const lines = [0, 1, 2].map((i) => ({ color: ["#22d37a", "#46d2ff", "#ff4b5c"][i], pts: [] as number[], v: 0.5 }));
    const draw = () => {
      c.width = c.clientWidth * devicePixelRatio; c.height = c.clientHeight * devicePixelRatio;
      ctx.clearRect(0, 0, c.width, c.height);
      for (const l of lines) {
        if (l.pts.length === 0) for (let i = 0; i < 240; i++) { l.v = Math.min(0.9, Math.max(0.1, l.v + (Math.random() - 0.5) * 0.04)); l.pts.push(l.v); }
        if (t % 3 === 0) { l.v = Math.min(0.9, Math.max(0.1, l.v + (Math.random() - 0.5) * 0.04)); l.pts.push(l.v); l.pts.shift(); }
        ctx.strokeStyle = l.color; ctx.globalAlpha = 0.5; ctx.lineWidth = 1.5 * devicePixelRatio; ctx.beginPath();
        l.pts.forEach((p, i) => { const x = (i / (l.pts.length - 1)) * c.width, y = p * c.height; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
        ctx.stroke();
      }
      t++; raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} className="hero-tape" style={{ width: "100%", height: 160 }} aria-hidden />;
}

export default function Landing() {
  return (
    <div className="page">
      <div className="hero">
        <div className="wordmark">RAZKYN</div>
        <div className="tagline"><b>RAID.</b> TRADE. EXTRACT.</div>
        <p className="hero-sub">
          An 8-player extraction raid where the map is the market. Districts rise and fall with a price tape,
          sealed crates hide real (devnet) loot inside a TEE, and THE WIRE narrates every public move.
        </p>
        <div className="row" style={{ justifyContent: "center" }}>
          <button className="btn primary big" onClick={() => navigate("/play")}>Play</button>
          <button className="btn big" onClick={() => navigate("/watch")}>Watch</button>
        </div>
        <div className="stack">
          {["Private ER (TEE)", "Permissions", "VRF", "Pricing Oracle", "Magic Actions", "Raid keys"].map((s) => <span className="pill" key={s}>{s}</span>)}
        </div>
        <div className="note">Solana devnet demo · tokens are devnet stand-ins, not shares · BOT raiders are labelled BOT</div>
        <Tape />
      </div>
    </div>
  );
}
