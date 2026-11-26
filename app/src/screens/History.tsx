import { useEffect, useState } from "react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { navigate } from "../App";
import { getHistory, type HistoryItem } from "../lib/keeper";
import { useGameWallet } from "../lib/wallet";

/** Raid History: every published raid (newest first); your own raids are highlighted. */
export default function History() {
  const w = useGameWallet();
  const [items, setItems] = useState<HistoryItem[] | null | undefined>(undefined);
  const [mineOnly, setMineOnly] = useState(false);
  useEffect(() => { getHistory().then(setItems); }, []);
  const me = w.publicKey?.toBase58();
  const shown = (items ?? []).filter((it) => !mineOnly || it.raiders.some((r) => r.wallet === me));
  return (
    <div className="page">
      <div className="topbar">
        <a className="brand" href="/" onClick={(e) => { e.preventDefault(); navigate("/"); }}>RAZKYN</a>
        <span className="pill">RAID HISTORY</span>
        <div className="spacer" />
        {w.kind === "dev" ? <span className="pill warn">{w.label}</span> : <WalletMultiButton />}
      </div>
      <div className="wrap">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 16 }}>
          <div className="wordmark" style={{ fontSize: "clamp(28px, 5vw, 48px)", animation: "none" }}>RAID HISTORY</div>
          {me && <button className="btn" onClick={() => setMineOnly((v) => !v)}>{mineOnly ? "Show all raids" : "Only my raids"}</button>}
        </div>
        {items === undefined && <p className="dim">Loading…</p>}
        {items === null && <div className="card"><h3>GAME SERVER OFFLINE</h3><p className="note">Try again in a minute.</p></div>}
        {items && shown.length === 0 && <p className="dim">{mineOnly ? "No raids with this wallet yet." : "No raids yet."}</p>}
        <div style={{ display: "grid", gap: 12 }}>
          {shown.map((it) => {
            const you = it.raiders.find((r) => r.wallet === me);
            const out = it.raiders.filter((r) => r.extracted).length;
            return (
              <button key={it.raidId} className="mode-card" style={{ padding: 16, background: you ? "linear-gradient(160deg, rgba(182,255,59,0.12), rgba(16,11,44,0.9) 55%)" : undefined }} onClick={() => navigate(`/report/${it.raidId}`)}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <div>
                    <div className="title" style={{ fontSize: 17 }}>{it.mode === "mystery" ? <span className="neon-m">🌀 {it.title ?? "MYSTERY MARKET"}</span> : <span className="neon-c">📡 LIVE MARKET</span>}</div>
                    <div className="note mono">raid {it.raidId}{it.day ? ` · ${it.day}` : ""} · {out}/{it.raiders.length} extracted</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    {you ? (
                      <>
                        <div className={`go ${you.extracted ? "neon-a" : you.alive === false ? "down" : "amber"}`}>{you.extracted ? "YOU EXTRACTED" : you.alive === false ? "YOU WERE KNOCKED OUT" : "YOU WERE STRANDED"}</div>
                        <div className="mono">{(Number(you.dusd) / 1e6).toFixed(2)} dUSD</div>
                      </>
                    ) : <div className="go dim">REPORT ▸</div>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
