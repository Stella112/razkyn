import { useEffect, useState } from "react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { navigate } from "../App";
import { CLASSES, base, buildJoinTx, dusdBalance, raidKeyFor, readRaidBase, readPublic, teePublic, type RaidAcc } from "../lib/chain";
import { explorerTx } from "../lib/config";
import { getLobby, openRaid, type Lobby as LobbyT, getProfiles, loadHandle, publishProfile, saveHandle, validHandle, type Profile } from "../lib/keeper";
import { useGameWallet } from "../lib/wallet";
import OperatorPreview from "../game/OperatorPreview";
import Customize from "./Customize";
import { loadAvatar } from "../game/three/actors";
import { programError } from "../lib/errors";

const PHASE: Record<LobbyT["phase"], string> = {
  idle: "No raid running",
  lobby: "Seats open: join before the countdown ends",
  setup: "Building the city: private rollup, sealed crates, VRF spawns (2–3 min)",
  live: "Raid live",
  settling: "Settling on the base layer",
  done: "Raid finished",
};

/** Join is locked in the last seconds of the countdown (the keeper then fills seats with BOTs). */
const JOIN_CUTOFF_MS = 8_000;

/** Readable reason for a failed join dry-run (RazkynError codes, programs/razkyn/src/errors.rs). */
function explainJoinFailure(err: unknown, logs: string[]): string {
  const text = `${JSON.stringify(err)} ${logs.join(" ")}`;
  if (/insufficient (funds|lamports)|0x1\b|AccountNotFound|attempt to debit/i.test(text)) return "Not enough devnet SOL in your wallet for the join fee. Get some at faucet.solana.com.";
  const name = programError(text);
  const known: Record<string, string> = {
    SlotTaken: "That seat was just taken. Open a new raid.", AlreadyJoined: "This wallet is already in this raid.",
    BadStatus: "The raid has already started. Open a new one.", FaucetCap: "Daily dUSD faucet limit reached for this wallet (100/day).",
  };
  return known[name] ?? `The join would fail on-chain (${name}).`;
}

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
  const [cls, setCls] = useState(0);
  const [avatar, setAvatar] = useState(loadAvatar());
  const [custom, setCustom] = useState(false);
  const [profiles, setProfiles] = useState<Record<number, Profile>>({});
  const [handle, setHandle] = useState(loadHandle());
  const [profErr, setProfErr] = useState("");

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
        const p = await getProfiles(l.raidId);
        if (!stop) setProfiles(p);
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

  const myReady = mySlot >= 0 && !!profiles[mySlot]?.ready;
  const sendProfile = async (ready: boolean) => {
    if (!lobby || mySlot < 0) return;
    const rk = raidKeyFor(lobby.raidId);
    if (!rk) { setProfErr("No raid key in this browser for this seat."); return; }
    const h = handle.trim() || `Raider ${mySlot + 1}`;
    if (!validHandle(h)) { setProfErr("Handle: 1–16 letters, digits, space, _ or - (and not starting with BOT)."); return; }
    saveHandle(h); setProfErr("");
    const e = await publishProfile(lobby.raidId, mySlot, rk, h, ready);
    if (e) setProfErr(e); else setProfiles(await getProfiles(lobby.raidId));
  };

  // Joined and the raid is live: go play.
  useEffect(() => {
    if (lobby && mySlot >= 0 && (lobby.phase === "live")) navigate(`/raid/${lobby.raidId}`);
  }, [lobby, mySlot]);

  const [opening, setOpening] = useState(false);
  const open = async (mode: "mystery" | "live" | "live-markets") => {
    setErr(""); setOpening(true);
    const r = await openRaid(mode);
    setOpening(false);
    if (!r.ok) setErr(r.error ?? "could not open a raid");
    else setLobby(await getLobby());
  };

  const join = async () => {
    if (!lobby || !w.publicKey) return;
    setErr(""); setBusy("Checking your seat…");
    try {
      // Re-read the seats right now: the keeper fills empty seats with BOTs when the countdown ends.
      const fresh = await readRaidBase(lobby.raidId);
      const seat = fresh ? lobby.humanSlots.find((s) => !fresh.raiders[s].joined) : undefined;
      if (seat === undefined) throw new Error("All seats just filled. Open a new raid from the lobby.");
      if (lobby.joinDeadline - Date.now() < JOIN_CUTOFF_MS) throw new Error("Too late: the join window is closing. Open a new raid in a moment.");
      const rk = raidKeyFor(lobby.raidId, true)!;
      setBusy("Building the join (free 10 dUSD if needed + 10 dUSD stake)…");
      const tx = await buildJoinTx(w.publicKey, lobby.raidId, seat, rk.publicKey, cls);
      // Dry-run it first: wallets report a failed transaction only as "Unexpected error".
      const sim = await base.simulateTransaction(tx);
      if (sim.value.err) throw new Error(explainJoinFailure(sim.value.err, sim.value.logs ?? []));
      setBusy("Approve in your wallet. This is the only signature until the payout.");
      const sig = await w.signAndSend(tx);
      setJoinSig(sig);
      setBusy("");
    } catch (e) {
      setBusy("");
      const msg = String((e as Error)?.message ?? e);
      setErr(/unexpected error/i.test(msg) ? "Your wallet refused the transaction. Check it is on Solana devnet and has a little devnet SOL, then try again." : msg.slice(0, 240));
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
                
                <div className="title neon-m">MYSTERY MARKET</div>
                <p>The city replays a real past trading day, but you don&apos;t know which one. Read the streets, not the news. The day is revealed (and proven) when the raid ends.</p>
                <div className="go neon-m">OPEN RAID ▸</div>
              </button>
              <button className="mode-card live" disabled={opening || lobby.canOpen?.ok === false} onClick={() => open("live")}>
                
                <div className="title neon-c">LIVE CRYPTO</div>
                <p>Tower, Factory and Harbor track SOL, BTC and ETH right now through MagicBlock&apos;s price oracle. The map moves with the real market.</p>
                <div className="go neon-c">OPEN RAID ▸</div>
              </button>
              <button className="mode-card gold" disabled={opening || lobby.canOpen?.ok === false} onClick={() => open("live-markets")}>
                
                <div className="title neon-a">NVDA · TSLA · SOL</div>
                <p>NVDA Tower, TSLA Factory and SOL Harbor track Nvidia, Tesla and Solana live from the oracle. The stocks only move in US market hours; SOL trades 24/7.</p>
                <div className="go neon-a">OPEN RAID ▸</div>
              </button>
            </div>
            {opening && <div className="banner">Creating your raid on devnet…</div>}
            {lobby.canOpen?.ok === false && (
              <div className="banner">Raids are paused: {lobby.canOpen.reason}. The game server pays the devnet fees for each raid.</div>
            )}
            {err && <div className="banner err-b">{err}</div>}
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
                  <h3>{lobby.mode === "mystery" ? "MYSTERY MARKET RAID" : lobby.mode === "live-markets" ? "LIVE MARKETS RAID · NVDA · TSLA · SOL" : "LIVE CRYPTO RAID"}</h3>
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
                      <div className="who">{r?.joined ? (r.isBot ? "BOT" : profiles[s]?.handle ? `${profiles[s].handle}${me ? " (you)" : ""}` : me ? "YOU" : short(r.wallet)) : lobby.humanSlots.includes(s) ? "open seat" : "BOT soon"}</div>
                      {r?.joined && <span className={`pill ${me ? "live" : r.isBot ? "bot" : ""}`} style={{ alignSelf: "flex-start" }}>{me ? "you" : r.isBot ? "bot" : "human"}</span>}
                      {r?.joined && raid?.classes && <span className="cls-tag">{CLASSES[raid.classes[s]]?.tag ?? ""}</span>}
                      {r?.joined && !r.isBot && lobby.phase === "lobby" && <span className={`pill ${profiles[s]?.ready ? "live" : "warn"}`} style={{ alignSelf: "flex-start" }}>{profiles[s]?.ready ? "READY" : "not ready"}</span>}
                    </div>
                  );
                })}
              </div>
              <p className="note" style={{ marginTop: 14 }}>Entry 10 dUSD → <b className="neon-a">2.0 always yours</b> · 7.5 into the loot crates · 0.5 fee.</p>
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
                    {lobby.phase === "lobby" && (
                      <div className="ready-box">
                        <div className="label" style={{ marginBottom: 6 }}>Your handle (shown to the other raiders)</div>
                        <div className="row" style={{ gap: 8 }}>
                          <input className="handle-in" maxLength={16} value={handle} placeholder={`Raider ${mySlot + 1}`} onChange={(e) => setHandle(e.target.value)} />
                          <button className={`btn ${myReady ? "" : "primary"}`} onClick={() => void sendProfile(!myReady)}>{myReady ? "NOT READY" : "READY"}</button>
                        </div>
                        <p className="note" style={{ fontSize: 12, marginTop: 6 }}>When every joined player is READY the raid drops early; empty seats become BOTs. Signed with your raid key, no wallet popup.</p>
                        {profErr && <div className="err">{profErr}</div>}
                      </div>
                    )}
                    {lobby.phase === "live" && <button className="btn primary big" onClick={() => navigate(`/raid/${lobby.raidId}`)}>ENTER THE RAID</button>}
                  </>
                ) : lobby.phase === "lobby" ? (
                  <>
                  <OperatorPreview cls={cls} avatar={avatar} />
                  <button className="btn" style={{ width: "100%", marginBottom: 10 }} onClick={() => setCustom(true)}>EDIT CHARACTER · MAP · TIME</button>
                  {custom && <Customize onClose={() => { setCustom(false); setAvatar(loadAvatar()); }} onWorld={() => {}} />}
                  <div className="label" style={{ marginBottom: 6 }}>Pick your class · loadout</div>
                  <div className="classes">
                    {CLASSES.map((c, i) => (
                      <button key={c.tag} className={`class-card ${cls === i ? "on" : ""}`} onClick={() => setCls(i)} disabled={!!busy}>
                        <b>{c.name}</b><span>{c.perk}</span>
                      </button>
                    ))}
                  </div>
                  <button className="btn primary big" style={{ width: "100%" }} disabled={!w.publicKey || freeHuman === undefined || !!busy || (sol ?? 0) < 0.005 || lobby.joinDeadline - now < JOIN_CUTOFF_MS} onClick={join}>
                    {freeHuman === undefined ? "NO SEAT FREE" : lobby.joinDeadline - now < JOIN_CUTOFF_MS ? "JOIN WINDOW CLOSED" : `JOIN AS ${CLASSES[cls].tag} · STAKE 10 dUSD`}
                  </button>
                  </>
                ) : (
                  <button className="btn cyan big" style={{ width: "100%" }} onClick={() => navigate(`/watch/${lobby.raidId}`)}>WATCH THIS RAID</button>
                )}
                {busy && <div className="banner">{busy}</div>}
                {err && <div className="banner err-b">{err}</div>}
                {joinSig && <p className="note">Joined: <a href={explorerTx(joinSig)} target="_blank" rel="noreferrer">{joinSig.slice(0, 16)}…</a></p>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
