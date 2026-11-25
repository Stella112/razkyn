import { useEffect, useState } from "react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { navigate } from "../App";
import { base, buildJoinTx, dusdBalance, raidKeyFor, readRaidBase, readPublic, teePublic, type RaidAcc } from "../lib/chain";
import { explorerTx } from "../lib/config";
import { getLobby, openRaid, type Lobby as LobbyT } from "../lib/keeper";
import { useGameWallet } from "../lib/wallet";

const PHASE: Record<LobbyT["phase"], string> = {
  idle: "No raid running",
  lobby: "Seats open: join before the countdown ends",
  setup: "Building the city: private rollup, sealed crates, VRF spawns (2–3 min)",
  live: "Raid live",
  settling: "Settling on the base layer",
  done: "Raid finished",
};

export default function Lobby() {
  const w = useGameWallet();
  const [lobby, setLobby] = useState<LobbyT | null | undefined>(undefined);
  const [raid, setRaid] = useState<RaidAcc | null>(null);
  const [sol, setSol] = useState<number | null>(null);
  const [dusd, setDusd] = useState<number | null>(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [joinSig, setJoinSig] = useState("");
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let stop = false;
    const tick = async () => {
      const l = await getLobby();
      if (stop) return;
      setLobby(l);
      if (l && l.phase !== "idle") {
        // Before delegation the base copy is current; after it, the TEE copy is (public, no token).
        const r = l.phase === "lobby" ? await readRaidBase(l.raidId) : (await readPublic(teePublic, l.raidId)).raid ?? (await readRaidBase(l.raidId));
        if (!stop) setRaid(r);
      }
    };
    tick();
    const a = setInterval(tick, 2500), b = setInterval(() => setNow(Date.now()), 500);
    return () => { stop = true; clearInterval(a); clearInterval(b); };
  }, []);

  useEffect(() => {
    if (!w.publicKey) return;
    let stop = false;
    const f = async () => {
      const [s, d] = await Promise.all([base.getBalance(w.publicKey!).catch(() => 0), dusdBalance(w.publicKey!)]);
      if (!stop) { setSol(s / LAMPORTS_PER_SOL); setDusd(d / 1e6); }
    };
    f();
    const i = setInterval(f, 5000);
    return () => { stop = true; clearInterval(i); };
  }, [w.publicKey, joinSig]);

  const mySlot = raid && w.publicKey ? raid.raiders.findIndex((r) => r.joined && r.wallet.equals(w.publicKey!)) : -1;
  const freeHuman = lobby && raid ? lobby.humanSlots.find((s) => !raid.raiders[s].joined) : undefined;
  const secsLeft = lobby ? Math.max(0, Math.round((lobby.joinDeadline - now) / 1000)) : 0;

  // Joined and the raid is live: go play.
  useEffect(() => {
    if (lobby && mySlot >= 0 && (lobby.phase === "live")) navigate(`/raid/${lobby.raidId}`);
  }, [lobby, mySlot]);

  const [opening, setOpening] = useState(false);
  const open = async (mode: "mystery" | "live") => {
    setErr(""); setOpening(true);
    const r = await openRaid(mode);
    setOpening(false);
    if (!r.ok) setErr(r.error ?? "could not open a raid");
    else setLobby(await getLobby());
  };

  const join = async () => {
    if (!lobby || !w.publicKey || freeHuman === undefined) return;
    setErr(""); setBusy("Building the join transaction (faucet 10 dUSD if needed + 10 dUSD stake into escrow)…");
    try {
      const rk = raidKeyFor(lobby.raidId, true)!;
      const tx = await buildJoinTx(w.publicKey, lobby.raidId, freeHuman, rk.publicKey);
      setBusy("Sign in your wallet (base layer). This is the only signature until settlement.");
      const sig = await w.signAndSend(tx);
      setJoinSig(sig);
      setBusy("");
    } catch (e) {
      setBusy("");
      setErr(String((e as Error)?.message ?? e).slice(0, 240));
    }
  };

  const PHASES: LobbyT["phase"][] = ["lobby", "setup", "live", "settling", "done"];
  const phaseIdx = lobby ? PHASES.indexOf(lobby.phase) : -1;
  const short = (k: { toBase58(): string }) => `${k.toBase58().slice(0, 4)}…${k.toBase58().slice(-4)}`;

  return (
    <div className="page">
      <div className="topbar">
        <a className="brand" href="/" onClick={(e) => { e.preventDefault(); navigate("/"); }}>RAZKYN</a>
        <span className="pill">devnet</span>
        <div className="spacer" />
        {w.kind === "dev" ? <span className="pill warn">{w.label}</span> : <WalletMultiButton />}
      </div>
      <div className="wrap">
        {lobby === undefined && <p className="dim">Finding the game server…</p>}
        {lobby === null && (
          <div className="card">
            <h3>GAME SERVER OFFLINE</h3>
            <p className="note">The keeper isn&apos;t answering right now. Try again in a minute, or watch a finished raid&apos;s report.</p>
          </div>
        )}

        {lobby && lobby.phase === "idle" && (
          <>
            <div style={{ textAlign: "center", margin: "6px 0 22px" }}>
              <div className="wordmark" style={{ fontSize: "clamp(30px, 6vw, 56px)", animation: "none" }}>PICK YOUR RAID</div>
              <p className="note" style={{ fontSize: 15 }}>You get a seat, a second human can grab the other, BOT raiders fill the rest. It drops about 3 minutes after the join window.</p>
            </div>
            <div className="modes">
              <button className="mode-card" disabled={opening || lobby.canOpen?.ok === false} onClick={() => open("mystery")}>
                <span className="glyph">🌀</span>
                <div className="title neon-m">MYSTERY MARKET</div>
                <p>The city replays a real past trading day, but you don&apos;t know which one. Read the streets, not the news. The day is revealed (and proven) when the raid ends.</p>
                <div className="go neon-m">OPEN RAID ▸</div>
              </button>
              <button className="mode-card live" disabled={opening || lobby.canOpen?.ok === false} onClick={() => open("live")}>
                <span className="glyph">📡</span>
                <div className="title neon-c">LIVE MARKET</div>
                <p>Tower, Factory and Harbor track SOL, BTC and ETH right now through MagicBlock&apos;s price oracle. The map moves with the real market.</p>
                <div className="go neon-c">OPEN RAID ▸</div>
              </button>
            </div>
            {opening && <div className="banner">⏳ Creating your raid on devnet…</div>}
            {lobby.canOpen?.ok === false && (
              <div className="banner">⚠ Raids are paused: {lobby.canOpen.reason}. The game server pays the devnet fees for each raid.</div>
            )}
            {err && <div className="banner err-b">✖ {err}</div>}
            {lobby.last?.raidId && (
              <p className="note" style={{ marginTop: 14 }}>
                Last raid {lobby.last.raidId}:{" "}
                {lobby.last.error ? <span className="down">failed ({lobby.last.error.slice(0, 80)})</span> : <a href={`/report/${lobby.last.raidId}`} onClick={(e) => { e.preventDefault(); navigate(`/report/${lobby.last!.raidId}`); }}>see its Market Raid Report ▸</a>}
              </p>
            )}
          </>
        )}

        {lobby && lobby.phase !== "idle" && (
          <div className="grid2">
            <div className="card">
              <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <h3>{lobby.mode === "mystery" ? "🌀 MYSTERY MARKET RAID" : "📡 LIVE MARKET RAID"}</h3>
                  <div className="note mono">raid {lobby.raidId}</div>
                </div>
                {lobby.phase === "lobby" ? (
                  <div style={{ textAlign: "right" }}><div className="label">drops in</div><div className="count">{secsLeft}s</div></div>
                ) : (
                  <span className={`pill ${lobby.phase === "live" ? "live" : "warn"}`}>{lobby.phase}</span>
                )}
              </div>
              <div className="phase-steps">{PHASES.map((p, i) => <div key={p} className={i <= phaseIdx ? "on" : ""} title={PHASE[p]} />)}</div>
              <div className="note" style={{ marginBottom: 14 }}>{PHASE[lobby.phase]}</div>
              <div className="roster">
                {Array.from({ length: lobby.slots }, (_, s) => {
                  const r = raid?.raiders[s];
                  const me = !!(r?.joined && w.publicKey && r.wallet.equals(w.publicKey));
                  const cls = !r?.joined ? (lobby.humanSlots.includes(s) && lobby.phase === "lobby" ? "open" : "") : me ? "filled me" : r.isBot ? "filled bot" : "filled";
                  return (
                    <div key={s} className={`slot ${cls}`}>
                      <div className="num">#{s + 1}</div>
                      <div className="who">{r?.joined ? (me ? "YOU" : r.isBot ? "🤖 BOT" : short(r.wallet)) : lobby.humanSlots.includes(s) ? "open seat" : "BOT soon"}</div>
                      {r?.joined && <span className={`pill ${me ? "live" : r.isBot ? "bot" : ""}`} style={{ alignSelf: "flex-start" }}>{me ? "you" : r.isBot ? "bot" : "human"}</span>}
                    </div>
                  );
                })}
              </div>
              <p className="note" style={{ marginTop: 14 }}>Entry 10 dUSD → <b className="neon-a">4.0 always yours</b> · 5.5 into the loot crates · 0.5 fee.</p>
            </div>

            <div className="card">
              <h3>YOUR WALLET</h3>
              {!w.publicKey && (
                <>
                  <p className="note">Connect Phantom or Solflare (set to devnet). You sign once, to join; in the raid a throwaway raid key signs every move for you, gas-free.</p>
                  <div className="row"><WalletMultiButton /><button className="btn" onClick={w.enableDev}>Use a dev wallet</button></div>
                </>
              )}
              {w.publicKey && (
                <div className="kv">
                  <span>Address</span><span className="mono">{short(w.publicKey)}</span>
                  <span>devnet SOL</span><span className="mono">{sol?.toFixed(3) ?? "…"} {sol !== null && sol < 0.01 && <a href="https://faucet.solana.com" target="_blank" rel="noreferrer">get devnet SOL</a>}</span>
                  <span>dUSD</span><span className="mono">{dusd?.toFixed(2) ?? "…"} <span className="dim">(free 10 added when you join)</span></span>
                </div>
              )}
              <div style={{ marginTop: 20 }}>
                {mySlot >= 0 ? (
                  <>
                    <div className="result-title win" style={{ fontSize: 30 }}>YOU&apos;RE IN · #{mySlot + 1}</div>
                    <p className="note">{lobby.phase === "live" ? "Dropping in…" : "Stay on this page: you drop in automatically when the raid goes live."}</p>
                    {lobby.phase === "live" && <button className="btn primary big" onClick={() => navigate(`/raid/${lobby.raidId}`)}>▶ ENTER THE RAID</button>}
                  </>
                ) : lobby.phase === "lobby" ? (
                  <button className="btn primary big" style={{ width: "100%" }} disabled={!w.publicKey || freeHuman === undefined || !!busy || (sol ?? 0) < 0.005} onClick={join}>
                    {freeHuman === undefined ? "NO SEAT FREE" : "▶ JOIN · STAKE 10 dUSD"}
                  </button>
                ) : (
                  <button className="btn cyan big" style={{ width: "100%" }} onClick={() => navigate(`/watch/${lobby.raidId}`)}>◉ WATCH THIS RAID</button>
                )}
                {busy && <div className="banner">⏳ {busy}</div>}
                {err && <div className="banner err-b">✖ {err}</div>}
                {joinSig && <p className="note">Joined: <a href={explorerTx(joinSig)} target="_blank" rel="noreferrer">{joinSig.slice(0, 16)}…</a></p>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
