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
  lobby: "Lobby open: join before the deadline",
  setup: "Setting up: delegating to the TEE, permissions, VRF seed, crates",
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

  return (
    <div className="page">
      <div className="topbar">
        <a className="brand" href="/" onClick={(e) => { e.preventDefault(); navigate("/"); }}>RAZKYN</a>
        <span className="pill">devnet</span>
        <div className="spacer" />
        {w.kind === "dev" ? <span className="pill warn">{w.label}</span> : <WalletMultiButton />}
      </div>
      <div className="wrap">
        {lobby === undefined && <p className="dim">Looking for the keeper…</p>}
        {lobby === null && (
          <div className="card">
            <h3>No raid running</h3>
            <p className="note">The keeper is not serving a lobby right now. Start one with <span className="mono">tsx keeper/src/index.ts --humans 1</span>, or watch a finished raid's report.</p>
          </div>
        )}
        {lobby && lobby.phase === "idle" && (
          <div className="card" style={{ maxWidth: 640 }}>
            <h3>No raid running</h3>
            <p className="note">Open one: you get a seat (another human can take the second), BOT raiders fill the rest, and it drops ~3 minutes after the join window. Mystery Market Day replays a real past day you only learn after the raid; Live tracks SOL, BTC and ETH right now.</p>
            <div className="row">
              <button className="btn primary big" disabled={opening || lobby.canOpen?.ok === false} onClick={() => open("mystery")}>Open a Mystery raid</button>
              <button className="btn big" disabled={opening || lobby.canOpen?.ok === false} onClick={() => open("live")}>Open a Live raid</button>
            </div>
            {opening && <p className="note">Creating the raid on devnet…</p>}
            {lobby.canOpen?.ok === false && <p className="note amber">{lobby.canOpen.reason}</p>}
            {err && <p className="err">{err}</p>}
            {lobby.last?.raidId && (
              <p className="note">Last raid {lobby.last.raidId}: {lobby.last.error ? <span className="down">failed ({lobby.last.error.slice(0, 80)})</span> : <a href={`/report/${lobby.last.raidId}`} onClick={(e) => { e.preventDefault(); navigate(`/report/${lobby.last!.raidId}`); }}>Market Raid Report</a>}</p>
            )}
          </div>
        )}
        {lobby && lobby.phase !== "idle" && (
          <div className="grid2">
            <div className="card">
              <h3>Raid</h3>
              <div className="kv">
                <span>Mode</span><span>{lobby.mode === "mystery" ? "Mystery Market Day (the day is revealed after the raid)" : "Live (Pricing Oracle on the TEE)"}</span>
                <span>Raid</span><span className="mono">{lobby.raidId}</span>
                <span>Phase</span><span>{PHASE[lobby.phase]}</span>
                {lobby.phase === "lobby" && <><span>Join closes in</span><span className="mono">{secsLeft}s</span></>}
                <span>Entry stake</span><span>10 dUSD → 4.0 protected · 5.5 loot pool · 0.5 ops</span>
              </div>
              <h3 style={{ marginTop: 18 }}>Raiders</h3>
              <table className="t">
                <tbody>
                  {Array.from({ length: lobby.slots }, (_, s) => {
                    const r = raid?.raiders[s];
                    return (
                      <tr key={s}>
                        <td className="mono">#{s + 1}</td>
                        <td className="mono">{r?.joined ? `${r.wallet.toBase58().slice(0, 4)}…${r.wallet.toBase58().slice(-4)}` : <span className="dim">{lobby.humanSlots.includes(s) ? "open (human)" : "BOT fills at start"}</span>}</td>
                        <td>{r?.joined ? (r.isBot ? <span className="pill bot">BOT</span> : <span className="pill live">{w.publicKey && r.wallet.equals(w.publicKey) ? "YOU" : "HUMAN"}</span>) : null}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="card">
              <h3>Your wallet (base layer only)</h3>
              {!w.publicKey && (
                <>
                  <p className="note">Connect Phantom or Solflare. The wallet signs once, to join; in the raid a raid-scoped key signs gasless moves on the TEE (it can never move tokens).</p>
                  <div className="row"><WalletMultiButton /><button className="btn" onClick={w.enableDev}>Use a dev wallet</button></div>
                </>
              )}
              {w.publicKey && (
                <div className="kv">
                  <span>Address</span><span className="mono">{w.publicKey.toBase58()}</span>
                  <span>devnet SOL</span><span className="mono">{sol?.toFixed(3) ?? "…"} {sol !== null && sol < 0.01 && <a href="https://faucet.solana.com" target="_blank" rel="noreferrer">get devnet SOL</a>}</span>
                  <span>dUSD (devnet)</span><span className="mono">{dusd?.toFixed(2) ?? "…"} <span className="dim">· the join tx fauceted 10 if needed</span></span>
                </div>
              )}
              <div style={{ marginTop: 18 }}>
                {mySlot >= 0 ? (
                  <>
                    <p>You are raider <b className="mono">#{mySlot + 1}</b>. {lobby.phase === "live" ? "Dropping in…" : "Waiting for the raid to start."}</p>
                    {lobby.phase === "live" && <button className="btn primary" onClick={() => navigate(`/raid/${lobby.raidId}`)}>Enter the raid</button>}
                  </>
                ) : lobby.phase === "lobby" ? (
                  <button className="btn primary big" disabled={!w.publicKey || freeHuman === undefined || !!busy || (sol ?? 0) < 0.005} onClick={join}>
                    {freeHuman === undefined ? "No human slot free" : "Join · stake 10 dUSD"}
                  </button>
                ) : (
                  <button className="btn" onClick={() => navigate(`/watch/${lobby.raidId}`)}>Watch this raid</button>
                )}
                {busy && <p className="note">{busy}</p>}
                {err && <p className="err">{err}</p>}
                {joinSig && <p className="note">Joined: <a href={explorerTx(joinSig)} target="_blank" rel="noreferrer">{joinSig.slice(0, 16)}…</a></p>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
