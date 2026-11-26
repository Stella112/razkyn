// RAZKYN LIVE (watch mode): on-chain spectator picks on the TEE (lib/picks.ts; program picks.rs; DECISIONS #39).
// Register once (one wallet signature), then picks are signed by a session key: no popups. The program
// clock locks each pick; resolve_picks (crank) settles pools from public raid state the moment they resolve.
import { useEffect, useState } from "react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import type { PublicState } from "../lib/chain";
import { districtNames } from "../lib/chain";
import { PICK_ERRORS, REFUNDED, UNRESOLVED, placePick, poolChoices, poolTimes, readBook, registerSpectator, sessionKey, type Book } from "../lib/picks";
import { useGameWallet } from "../lib/wallet";
import { programError } from "../lib/errors";
import { sfx } from "../lib/sfx";

const AMOUNTS = [5, 10, 25];
const BADGES = ["", "IRON STREAK", "TEAL STREAK", "AMBER STREAK", "RED STREAK"];
const errText = (e: unknown) => { const s = String((e as Error)?.message ?? e); const m = /"Custom":(\d+)/.exec(s) ?? /0x([0-9a-f]+)/i.exec(s); const c = m ? (m[0].startsWith("0x") ? parseInt(m[1], 16) : Number(m[1])) : 0; return PICK_ERRORS[c] ?? programError(e); };

export default function LivePicks({ raidId, pub }: { raidId: string; pub: PublicState | null }) {
  const w = useGameWallet();
  const [book, setBook] = useState<Book | null | undefined>(undefined);
  const [amount, setAmount] = useState(10);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [, setTick] = useState(0);
  useEffect(() => {
    let stop = false;
    const f = async () => { const b = await readBook(raidId); if (!stop) setBook(b); };
    void f();
    const i = setInterval(f, 1000), t = setInterval(() => setTick((x) => x + 1), 500);
    return () => { stop = true; clearInterval(i); clearInterval(t); };
  }, [raidId]);
  const raid = pub?.raid;
  if (book === undefined || !raid) return <div className="note" style={{ fontSize: 11 }}>Loading RAZKYN LIVE…</div>;
  if (book === null) return <div className="note" style={{ fontSize: 11 }}>No LIVE picks for this raid (its pick book was not created).</div>;
  const now = Date.now() / 1000;
  const started = raid.status >= 2;
  const start = started ? Number(raid.startTs.toString()) : 0;
  const names = districtNames(raid.mode).map((n) => n.toUpperCase());
  const label = (p: number, c: number) => (p >= 8 && p < 13 && c < 3 ? names[c] : poolChoices(p)[c]);
  const me = w.publicKey?.toBase58();
  const sess = sessionKey(raidId)?.publicKey.toBase58();
  const myIdx = book.spectators.findIndex((s) => s.wallet === me && s.session === sess);
  const mine = myIdx >= 0 ? book.spectators[myIdx] : null;
  const myBet = (p: number) => (myIdx >= 0 ? book.bets.find((b) => b.spec === myIdx && b.pool === p) : undefined);

  const join = async () => {
    if (!w.publicKey) return;
    setBusy("Sign once to join LIVE picks (no more popups after this)…"); setMsg("");
    try { await registerSpectator(raidId, w.publicKey, w.signTx); setMsg("Joined: 100 play credits. Picks are now one click."); sfx.loot(); }
    catch (e) { setMsg(errText(e)); sfx.deny(); } finally { setBusy(""); }
  };
  const pick = async (p: number, c: number) => {
    setBusy(`Picking ${label(p, c)}…`); setMsg("");
    try { await placePick(raidId, p, c, amount); setMsg(`Locked in: ${label(p, c)} · ${amount} credits`); sfx.trade(); }
    catch (e) { setMsg(errText(e)); sfx.deny(); } finally { setBusy(""); }
  };

  // Current windows: newest NEXT CRACK and KNOCKOUT window that has opened.
  const cur = started ? [8, 13].map((base) => {
    const n = base === 8 ? 5 : 10;
    let best = -1;
    for (let wi = 0; wi < n; wi++) if (poolTimes(start, base + wi)[0] <= now) best = base + wi;
    return best;
  }).filter((p) => p >= 0) : [];
  const card = (p: number) => {
    const [, lock, end] = poolTimes(start, p);
    const out = book.outcome[p];
    const state = out !== UNRESOLVED ? "result" : now < lock ? "open" : "locked";
    const totals = book.totals[p].slice(0, poolChoices(p).length);
    const tot = totals.reduce((a, b) => a + b, 0);
    const mb = myBet(p);
    const nBets = book.bets.filter((b) => b.pool === p).length;
    const won = mb && out === mb.choice;
    return (
      <div key={p} className={`pick-card ${state}`}>
        <div className="pc-head">
          <span className="pc-name">{p < 13 ? "NEXT CRACK" : "KNOCKOUT IN 30 S"}</span>
          <span className="pc-time">{state === "open" ? `LOCKS IN ${Math.max(0, Math.ceil(lock - now))}s` : state === "locked" ? `WATCHING · ${Math.max(0, Math.ceil(end - now))}s` : "RESOLVED"}</span>
        </div>
        <div className="pc-q">{p < 13 ? "Which district cracks first in the next 60 s?" : "Will any raider be knocked out in the next 30 s?"}</div>
        <div className="pc-choices">
          {totals.map((t, c) => (
            <button key={c} className={`pc-choice ${out === c ? "won" : ""} ${mb?.choice === c ? "mine" : ""}`} disabled={state !== "open" || !!busy || !mine || !!mb} onClick={() => pick(p, c)}>
              <span>{label(p, c)}</span><span className="pc-share">{tot ? Math.round((t / tot) * 100) : 0}%</span>
            </button>
          ))}
        </div>
        {state === "locked" && <div className="pc-stamp">LOCKED</div>}
        {state === "result" && (
          <div className="pc-result">
            {out === REFUNDED ? "Refunded" : label(p, out)} · {nBets ? `${Math.round((book.bets.filter((b) => b.pool === p && b.choice === out).length / nBets) * 100)}% called it` : "no picks"}
            {mb && <b> · you {won ? "WON" : out === REFUNDED ? "refunded" : "missed"}</b>}
          </div>
        )}
        <div className="pc-foot">{nBets} pick{nBets === 1 ? "" : "s"} · {tot} credits on-chain{mb ? ` · yours: ${mb.amount} on ${label(p, mb.choice)}` : ""}</div>
      </div>
    );
  };
  const board = [...book.spectators].sort((a, b) => b.correct - a.correct || b.credits - a.credits || b.bestStreak - a.bestStreak).slice(0, 5);

  return (
    <div className="live-picks">
      <div className="lp-title">RAZKYN LIVE · ON-CHAIN PICKS</div>
      <div className="note" style={{ fontSize: 10.5, marginBottom: 5 }}>Play credits on the private rollup · locked by the program clock · settled from public raid state · not money</div>
      {!w.publicKey ? (
        <div className="row" style={{ marginBottom: 6 }}><WalletMultiButton /><button className="btn" onClick={w.enableDev}>Dev wallet</button></div>
      ) : !mine ? (
        <button className="sp-cta" style={{ marginBottom: 8 }} disabled={!!busy || book.status !== 0} onClick={join}>JOIN LIVE PICKS · 1 SIGNATURE</button>
      ) : (
        <div className="row" style={{ gap: 6, marginBottom: 6 }}>
          {AMOUNTS.map((a) => <button key={a} className={`chip ${amount === a ? "on" : ""}`} onClick={() => setAmount(a)}>{a}</button>)}
          <span className="note mono" style={{ fontSize: 11 }}>{mine.credits} credits · {mine.correct}/{mine.picks} · streak {mine.streak}{mine.badge ? ` · ${BADGES[mine.badge]}` : ""}</span>
        </div>
      )}
      {book.status === 2 && <div className="note">This raid was cancelled: every pick was refunded.</div>}
      {cur.map(card)}
      <div className="lp-sub" style={{ marginTop: 6 }}>EXTRACTS? · locks at 4:30 into the raid</div>
      <div className="mkt-rows">
        {raid.raiders.map((r, s) => {
          if (!r.joined) return null;
          const out = book.outcome[s], t = book.totals[s], tot = t[0] + t[1], mb = myBet(s);
          const open = out === UNRESOLVED && (!started || now < start + 270);
          return (
            <div key={s} className="mkt-row">
              <div className="mono" style={{ width: 64, fontSize: 12 }}>{r.isBot ? "BOT" : "P"} {s + 1}<div className="note" style={{ fontSize: 10 }}>{out === 0 ? "EXTRACTED" : out === 1 ? "DIDN'T" : out === REFUNDED ? "REFUND" : mb ? `you: ${poolChoices(s)[mb.choice]}` : ""}</div></div>
              <div className="mkt-bar" title={`${t[0]} on YES · ${t[1]} on NO`}><div style={{ width: `${tot ? Math.round((t[0] / tot) * 100) : 50}%` }} /><span>{tot ? Math.round((t[0] / tot) * 100) : 50}% · {tot}</span></div>
              {open && mine && !mb && (
                <div className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
                  <button className="chip yes" disabled={!!busy} onClick={() => pick(s, 0)}>YES</button>
                  <button className="chip no" disabled={!!busy} onClick={() => pick(s, 1)}>NO</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {busy && <div className="note">{busy}</div>}
      {msg && <div className="note" style={{ color: "var(--text)" }}>{msg}</div>}
      {board.length > 0 && (
        <div className="lp-board">
          <div className="lp-sub">TOP SPECTATORS</div>
          {board.map((s, i) => (
            <div key={s.wallet} className={`lp-row ${s.wallet === me ? "me" : ""}`}>
              <span>{i + 1}. {s.wallet === me ? "YOU" : `${s.wallet.slice(0, 4)}…${s.wallet.slice(-4)}`}{s.badge ? ` · ${BADGES[s.badge]}` : ""}</span>
              <span>{s.correct}/{s.picks} · streak {s.bestStreak} · {s.credits}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
