// Extraction Market panel (watch mode): bet devnet dPLAY play-money on whether each raider extracts.
// Bets are real devnet transfers tagged with a memo; the keeper settles them parimutuel from the
// committed result (keeper/src/bets.ts, DECISIONS #33).
import { useEffect, useState } from "react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { PublicKey } from "@solana/web3.js";
import { buildBetTx, base, districtNames, playBalance, type PublicState } from "../lib/chain";
import LivePicks from "./LivePicks";
import { explorerTx } from "../lib/config";
import { getBets, type BetView } from "../lib/keeper";
import { useGameWallet } from "../lib/wallet";
import { sfx } from "../lib/sfx";

const AMOUNTS = [10, 50, 100];

export default function Market({ raidId, pub }: { raidId: string; pub: PublicState | null }) {
  const w = useGameWallet();
  const [book, setBook] = useState<BetView | null>(null);
  const [amount, setAmount] = useState(10);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [bal, setBal] = useState<number | null>(null);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (!raidId) return;
    let stop = false;
    const f = async () => { const b = await getBets(raidId); if (!stop) setBook(b); };
    f();
    const i = setInterval(f, 3000);
    return () => { stop = true; clearInterval(i); };
  }, [raidId]);
  useEffect(() => {
    if (!w.publicKey) return;
    let stop = false;
    const f = async () => { const b = await playBalance(w.publicKey!); if (!stop) setBal(b); };
    f();
    const i = setInterval(f, 6000);
    return () => { stop = true; clearInterval(i); };
  }, [w.publicKey, msg]);

  const raid = pub?.raid;
  const me = w.publicKey?.toBase58();
  const now = Date.now() / 1000;
  const startTs = raid ? Number(raid.startTs.toString()) : 0;
  const closeIn = startTs > 0 ? startTs + 270 - now : Infinity;
  const canBet = !!book && !book.settled && closeIn > 3 && (raid?.status ?? 0) <= 2;

  const bet = async (slot: number, side: "Y" | "N") => {
    if (!w.publicKey || !book) return;
    setMsg(""); setBusy(`Placing ${amount} dPLAY…`);
    try {
      const tx = await buildBetTx(w.publicKey, raidId, slot, side, amount, new PublicKey(book.keeperAta));
      const sim = await base.simulateTransaction(tx);
      if (sim.value.err) throw new Error(/AccountForFee|insufficient|AccountNotFound/i.test(JSON.stringify(sim.value.err) + (sim.value.logs ?? []).join(" ")) ? "Your wallet has no devnet SOL for the fee. Get a little at faucet.solana.com (devnet)." : `The bet would fail on-chain (${JSON.stringify(sim.value.err).slice(0, 60)}).`);
      const sig = await w.signAndSend(tx);
      setMsg(`Bet placed: ${side === "Y" ? "EXTRACTS" : "DOESN'T"} on raider ${slot + 1} · ${sig.slice(0, 10)}…`);
      sfx.trade();
    } catch (e) {
      const m = String((e as Error)?.message ?? e);
      setMsg(/unexpected error/i.test(m) ? "Your wallet refused the bet. Check it is on devnet with a little SOL." : m.slice(0, 160));
      sfx.deny();
    } finally { setBusy(""); }
  };

  if (!raid) return null;
  const myBets = (book?.bets ?? []).filter((b) => b.bettor === me);
  const myPay = (book?.payouts ?? []).filter((p) => p.bettor === me);
  return (
    <div className="hud-box market">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="label neon-a" style={{ letterSpacing: "0.14em" }}>EXTRACTION MARKET · RAZKYN LIVE · dPLAY</div>
        <button className="act mute" onClick={() => setOpen((o) => !o)}>{open ? "–" : "+"}</button>
      </div>
      {open && (
        <>
          <div className="note" style={{ fontSize: 11, margin: "2px 0 6px" }}>
            {book?.settled ? "Settled from the on-chain result." : !canBet ? "Betting closed." : Number.isFinite(closeIn) ? `Bets close in ${Math.max(0, Math.floor(closeIn))}s · free devnet play-money` : "Betting open until 4:30 into the raid · free devnet play-money"}
          </div>
          {!w.publicKey ? (
            <div className="row" style={{ marginBottom: 6 }}><WalletMultiButton /></div>
          ) : (
            <div className="row" style={{ gap: 6, marginBottom: 6 }}>
              {AMOUNTS.map((a) => <button key={a} className={`chip ${amount === a ? "on" : ""}`} onClick={() => setAmount(a)}>{a}</button>)}
              <span className="note mono" style={{ fontSize: 11 }}>you: {bal ?? "…"} dPLAY{(bal ?? 0) < amount ? " (+100 free)" : ""}</span>
            </div>
          )}
          {raid.raiders.every((r) => !r.joined) && <div className="note" style={{ fontSize: 11 }}>Raiders appear here as they join.</div>}
          <LivePicks book={book} amount={amount} names={districtNames(raid.mode).map((n) => n.toUpperCase())} onMsg={setMsg} />
          <div className="lp-sub" style={{ marginTop: 8 }}>EXTRACTS? · per raider</div>
          <div className="mkt-rows">
            {raid.raiders.map((r, s) => {
              if (!r.joined) return null;
              const rp = pub?.rpubs[s];
              const pool = book?.pools[s] ?? { yes: 0, no: 0 };
              const tot = pool.yes + pool.no;
              const pYes = tot ? Math.round((pool.yes / tot) * 100) : 50;
              const status = rp?.extracted ? "OUT" : rp && !rp.alive ? "DOWN" : "IN RAID";
              const outcome = book?.outcomes ? (book.outcomes[s] ? "EXTRACTED" : "DIDN'T") : null;
              return (
                <div key={s} className="mkt-row">
                  <div className="mono" style={{ width: 70, fontSize: 12 }}>{r.isBot ? "BOT" : "P"} {s + 1}<div className="note" style={{ fontSize: 10 }}>{outcome ?? status}</div></div>
                  <div className="mkt-bar" title={`${pool.yes} on EXTRACTS · ${pool.no} on DOESN'T`}>
                    <div style={{ width: `${pYes}%` }} />
                    <span>{pYes}% · {tot} dPLAY</span>
                  </div>
                  {canBet && w.publicKey && !rp?.extracted && rp?.alive !== false && (
                    <div className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
                      <button className="chip yes" disabled={!!busy} onClick={() => bet(s, "Y")} title="Bet that this raider extracts">YES</button>
                      <button className="chip no" disabled={!!busy} onClick={() => bet(s, "N")} title="Bet that this raider does not extract">NO</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {busy && <div className="note">{busy}</div>}
          {msg && <div className="note" style={{ color: "var(--text)" }}>{msg}</div>}
          {myBets.length > 0 && <div className="note" style={{ fontSize: 11 }}>Your bets: {myBets.map((b) => `${b.amount} on P${b.slot + 1} ${b.side === "Y" ? "extracts" : "doesnt"}${b.late ? " (late, refunded)" : ""}`).join(" · ")}</div>}
          {myPay.map((p) => (
            <div key={`${p.reason}${p.sig}`} className="note neon-a" style={{ fontSize: 12 }}>
              {p.reason === "win" ? "WON" : "REFUND"} {p.amount} dPLAY {p.sig && p.sig.length > 40 && <a href={explorerTx(p.sig)} target="_blank" rel="noreferrer">tx ↗</a>}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
