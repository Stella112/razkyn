// RAZKYN LIVE (watch mode): quick spectator picks during the raid, settled from public raid state by
// the keeper (keeper/src/picks.ts, bets.ts; DECISIONS #38). dPLAY play-money on devnet only.
// A pick is a real devnet transfer + memo; it counts only if its on-chain block time is before the lock.
import { useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { buildPickTx, base } from "../lib/chain";
import type { BetView, PickView } from "../lib/keeper";
import { useGameWallet } from "../lib/wallet";
import { sfx } from "../lib/sfx";

const mmss = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, "0")}`;

function PickCard({ p, book, amount, onMsg, busy, setBusy, names }: {
  p: PickView; book: BetView; amount: number; onMsg: (m: string) => void; busy: boolean; setBusy: (b: boolean) => void; names: string[];
}) {
  const w = useGameWallet();
  const now = Date.now() / 1000;
  const me = w.publicKey?.toBase58();
  const label = (c: number) => (p.type === "C" && c < 3 ? names[c] : p.choices[c]);
  const mine = (book.bets ?? []).filter((b) => b.bettor === me && b.pool === `${p.type}:${p.window}`);
  const total = p.totals.reduce((a, b) => a + b, 0);
  const state = p.result ? "result" : now < p.lockTs ? "open" : "locked";
  const pick = async (choice: number) => {
    if (!w.publicKey) return;
    setBusy(true); onMsg("");
    try {
      const tx = await buildPickTx(w.publicKey, book.raidId, p.type, p.window, choice, amount, new PublicKey(book.keeperAta));
      const sim = await base.simulateTransaction(tx);
      if (sim.value.err) throw new Error("The pick would fail on-chain (devnet SOL for the fee?).");
      const sig = await w.signAndSend(tx);
      onMsg(`Picked ${label(choice)} · ${amount} dPLAY · ${sig.slice(0, 8)}… (counts if its block time is before the lock)`);
      sfx.trade();
    } catch (e) { onMsg(String((e as Error)?.message ?? e).slice(0, 140)); sfx.deny(); } finally { setBusy(false); }
  };
  const myWin = p.result ? mine.filter((b) => !b.late && b.choice === p.result!.outcome).reduce((a, b) => a + b.amount, 0) : 0;
  const myPay = p.result && p.result.winning ? Math.floor((myWin * p.result.total) / p.result.winning) : 0;
  return (
    <div className={`pick-card ${state}`}>
      <div className="pc-head">
        <span className="pc-name">{p.name}</span>
        <span className="pc-time">
          {state === "open" ? `LOCKS IN ${Math.max(0, Math.ceil(p.lockTs - now))}s` : state === "locked" ? `WATCHING · ${mmss(p.endTs - now)}` : "RESOLVED"}
        </span>
      </div>
      <div className="pc-q">{p.type === "C" ? "Which district cracks first in the next 60 s?" : "Will any raider be knocked out in the next 30 s?"}</div>
      <div className="pc-choices">
        {p.choices.map((_, c) => {
          const share = total ? Math.round((p.totals[c] / total) * 100) : 0;
          const won = p.result?.outcome === c;
          return (
            <button key={c} className={`pc-choice ${won ? "won" : ""}`} disabled={state !== "open" || busy || !w.publicKey} onClick={() => pick(c)}>
              <span>{label(c)}</span><span className="pc-share">{share}%</span>
            </button>
          );
        })}
      </div>
      {state === "locked" && <div className="pc-stamp">LOCKED</div>}
      {p.result && (
        <div className="pc-result">
          {label(p.result.outcome)} · {p.bets ? `${p.result.pct}% called it${p.result.mult ? ` · paid ${p.result.mult.toFixed(1)}×` : " · refunded"}` : "no picks"}
          {mine.length > 0 && <b> · you {myPay ? `+${myPay} dPLAY` : "missed"}</b>}
        </div>
      )}
      <div className="pc-foot">{p.bets} pick{p.bets === 1 ? "" : "s"} · {total} dPLAY{mine.length ? ` · yours: ${mine.map((b) => `${b.amount} on ${label(b.choice ?? 0)}${b.late ? " (late, refunded)" : ""}`).join(", ")}` : ""}</div>
    </div>
  );
}

export default function LivePicks({ book, amount, names, onMsg }: { book: BetView | null; amount: number; names: string[]; onMsg: (m: string) => void }) {
  const w = useGameWallet();
  const [busy, setBusy] = useState(false);
  const [, setTick] = useState(0);
  useEffect(() => { const i = setInterval(() => setTick((t) => t + 1), 500); return () => clearInterval(i); }, []);
  if (!book?.picks?.length || !book.startTs) return <div className="note" style={{ fontSize: 11 }}>LIVE picks open when the raid drops.</div>;
  const now = Date.now() / 1000;
  // Newest window of each type that has opened.
  const cur = (["C", "D"] as const).map((t) => book.picks!.filter((p) => p.type === t && p.openTs <= now).sort((a, b) => b.window - a.window)[0]).filter(Boolean) as PickView[];
  const board = (book.leaderboard ?? []).slice(0, 5);
  const me = w.publicKey?.toBase58();
  return (
    <div className="live-picks">
      <div className="lp-title">RAZKYN LIVE · PICKS</div>
      {cur.length === 0 && <div className="note" style={{ fontSize: 11 }}>First picks open at the drop.</div>}
      {cur.map((p) => <PickCard key={`${p.type}${p.window}`} p={p} book={book} amount={amount} onMsg={onMsg} busy={busy} setBusy={setBusy} names={names} />)}
      {board.length > 0 && (
        <div className="lp-board">
          <div className="lp-sub">TOP SPECTATORS</div>
          {board.map((r, i) => (
            <div key={r.bettor} className={`lp-row ${r.bettor === me ? "me" : ""}`}>
              <span>{i + 1}. {r.bettor === me ? "YOU" : `${r.bettor.slice(0, 4)}…${r.bettor.slice(-4)}`}</span>
              <span>{r.correct}/{r.picks} · streak {r.bestStreak} · {r.net >= 0 ? "+" : ""}{r.net}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
