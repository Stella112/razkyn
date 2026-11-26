// Compact minimap (top-right HUD). Draws only what this client already has: public raid state
// (exits, crate positions, opened crates, exposed / downed raiders) plus, for a player, their own
// position and the raiders inside their own fog-of-war View. No hidden state is added here.
import { useEffect, useRef } from "react";
import { DISTRICT_TILES, EXITS, MAP_H, MAP_W, NUM_CRATES, TERMINALS, UNIT, type PublicState } from "../lib/chain";

export default function Minimap({ pub, me, visible, mySlot, names, scale = 3, big = false }: {
  pub: PublicState | null; me: { x: number; y: number } | null; visible: { slot: number; x: number; y: number }[]; mySlot: number; names: string[];
  /** px per tile (3 = HUD minimap; the M full map passes a larger one). */ scale?: number; big?: boolean;
}) {
  const S = scale;
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current?.getContext("2d");
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = MAP_W * S, H = MAP_H * S;
    if (ref.current!.width !== W * dpr) { ref.current!.width = W * dpr; ref.current!.height = H * dpr; }
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    c.fillStyle = "rgba(11,15,18,0.85)"; c.fillRect(0, 0, W, H);
    DISTRICT_TILES.forEach(([lo, hi], d) => {
      const lvl = pub?.districts[d]?.hazardLevel ?? 0;
      c.fillStyle = lvl ? "rgba(228,81,78,0.16)" : ["rgba(69,201,178,0.06)", "rgba(217,172,101,0.06)", "rgba(200,210,209,0.05)"][d];
      c.fillRect(lo * S, 0, (hi - lo + 1) * S, H);
    });
    c.fillStyle = "rgba(200,210,209,0.18)";
    for (const x of [21, 43]) c.fillRect(x * S, 0, S, H);
    const raid = pub?.raid;
    const open = raid?.exitWindow ? raid.openExits.filter((e) => e !== 255) : [];
    EXITS.forEach(([ex, ey], i) => {
      c.strokeStyle = open.includes(i) ? "#45C9B2" : "rgba(200,210,209,0.35)"; c.lineWidth = open.includes(i) ? 2 : 1;
      c.beginPath(); c.arc(ex * S + S / 2, ey * S + S / 2, S * 1.6, 0, Math.PI * 2); c.stroke();
    });
    c.fillStyle = "#45C9B2";
    for (const [tx, ty] of TERMINALS) c.fillRect(tx * S, ty * S, S, S);
    raid?.cratePos.forEach((p, i) => {
      if (i >= NUM_CRATES || (p.x === 0 && p.y === 0)) return;
      const openedC = pub?.crates[i]?.state === 1;
      c.fillStyle = openedC ? "rgba(200,210,209,0.2)" : "#D9AC65";
      const cs = Math.max(2, S * 0.7); c.fillRect((p.x / UNIT) * S - cs / 2, (p.y / UNIT) * S - cs / 2, cs, cs);
    });
    const k = S / 3; // dots grow with the map
    const dot = (x: number, y: number, col: string, r = 2.2) => { c.fillStyle = col; c.beginPath(); c.arc((x / UNIT) * S, (y / UNIT) * S, r * Math.max(1, k * 0.6), 0, Math.PI * 2); c.fill(); };
    pub?.rpubs.forEach((r, s) => {
      if (!r || s === mySlot || !raid?.raiders[s]?.joined) return;
      if (r.exposed && r.alive) dot(r.pubX, r.pubY, "#45C9B2", 2.6);
      else if (!r.alive) { c.strokeStyle = "#E4514E"; c.lineWidth = 1.2; const x = (r.pubX / UNIT) * S, y = (r.pubY / UNIT) * S; c.beginPath(); c.moveTo(x - 2, y - 2); c.lineTo(x + 2, y + 2); c.moveTo(x - 2, y + 2); c.lineTo(x + 2, y - 2); c.stroke(); }
    });
    for (const v of visible) if (v.slot !== mySlot) dot(v.x, v.y, pub?.rpubs[v.slot]?.isBot ? "#E4514E" : "#D9AC65");
    if (me) {
      c.strokeStyle = "rgba(69,201,178,0.35)"; c.lineWidth = 1;
      c.beginPath(); c.arc((me.x / UNIT) * S, (me.y / UNIT) * S, 8 * S, 0, Math.PI * 2); c.stroke();
      dot(me.x, me.y, "#ffffff", 2.8);
    }
    c.strokeStyle = "rgba(200,210,209,0.3)"; c.lineWidth = 1; c.strokeRect(0.5, 0.5, W - 1, H - 1);
  });
  return (
    <div className={`minimap ${big ? "big" : ""}`}>
      <canvas ref={ref} style={{ width: MAP_W * S, height: MAP_H * S, display: "block" }} />
      <div className="mm-names">{names.map((n, i) => <span key={i}>{n}</span>)}</div>
    </div>
  );
}
