// Shareable raid card: a 1200×630 PNG drawn in the browser from the public report, plus a share
// link to the verifiable report page. Nothing is uploaded; the viewer downloads or shares it.
import { useEffect, useRef, useState } from "react";

export type CardData = {
  raidId: string;
  outcome: string; // EXTRACTED / KNOCKED OUT / STRANDED / RAID OVER
  payout?: string; // "12.34 dUSD"
  mode: string; // "Mystery Market Day" / "Live"
  title?: string; // revealed day title, if any
  line?: string; // e.g. award or kills
  hash?: string; // report hash
};

function draw(c: HTMLCanvasElement, d: CardData) {
  const g = c.getContext("2d")!;
  const W = 1200, H = 630;
  c.width = W; c.height = H;
  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#07090b"); bg.addColorStop(1, "#141a1e");
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  // skyline
  g.fillStyle = "rgba(200,210,209,0.06)";
  for (let x = 0, i = 0; x < W; i++) { const w = 40 + ((i * 37) % 70), h = 80 + ((i * 53) % 220); g.fillRect(x, H - h, w, h); x += w + 6; }
  const win = d.outcome === "EXTRACTED", lose = d.outcome === "KNOCKED OUT";
  const accent = win ? "#45C9B2" : lose ? "#E4514E" : "#D9AC65";
  g.fillStyle = accent; g.fillRect(0, 0, 12, H);
  g.fillStyle = "#c8d2d1"; g.font = "700 30px ui-monospace, Menlo, monospace";
  g.fillText("R A Z K Y N", 70, 90);
  g.font = "500 20px ui-monospace, Menlo, monospace"; g.fillStyle = "rgba(200,210,209,0.6)";
  g.fillText("RAID. TRADE. EXTRACT.", 70, 124);
  g.fillStyle = accent; g.font = "800 104px Impact, 'Arial Narrow', sans-serif";
  g.fillText(d.outcome, 66, 270);
  if (d.payout) { g.fillStyle = "#ffffff"; g.font = "700 64px ui-monospace, Menlo, monospace"; g.fillText(d.payout, 70, 360); }
  g.fillStyle = "rgba(200,210,209,0.85)"; g.font = "500 26px system-ui, sans-serif";
  g.fillText(d.title ? `${d.mode} · ${d.title}` : d.mode, 70, 420);
  if (d.line) g.fillText(d.line, 70, 460);
  g.fillStyle = "rgba(200,210,209,0.55)"; g.font = "500 18px ui-monospace, Menlo, monospace";
  g.fillText(`raid ${d.raidId}${d.hash ? ` · report ${d.hash.slice(0, 16)}…` : ""}`, 70, 540);
  g.fillText("Solana devnet · MagicBlock Private ER · devnet demo tokens, not real money", 70, 572);
}

export default function ShareCard({ data }: { data: CardData }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => { if (ref.current) { draw(ref.current, data); setUrl(ref.current.toDataURL("image/png")); } }, [JSON.stringify(data)]); // eslint-disable-line react-hooks/exhaustive-deps
  const link = `${window.location.origin}/report/${data.raidId}`;
  const text = `${data.outcome}${data.payout ? ` with ${data.payout}` : ""} in a RAZKYN raid on Solana (MagicBlock). Verifiable report:`;
  return (
    <div className="share-card">
      <canvas ref={ref} style={{ width: "100%", maxWidth: 480, height: "auto", display: "block", border: "1px solid rgba(200,210,209,0.2)" }} />
      <div className="row" style={{ gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        {url && <a className="btn" href={url} download={`razkyn-${data.raidId}.png`}>DOWNLOAD CARD</a>}
        <a className="btn" href={`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(link)}`} target="_blank" rel="noreferrer">SHARE ON X</a>
        <button className="btn" onClick={() => { navigator.clipboard?.writeText(link).then(() => setCopied(true)).catch(() => {}); }}>{copied ? "LINK COPIED" : "COPY LINK"}</button>
      </div>
    </div>
  );
}
