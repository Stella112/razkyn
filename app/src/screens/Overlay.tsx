// Streamer overlay (/overlay or /overlay/:raidId): transparent broadcast graphics for an OBS browser
// source (1920 × 1080) laid over the game capture. Public data only: raid clock and districts from the
// TEE public accounts, THE WIRE stream, on-chain LIVE picks, awards from the report.
import { useEffect, useState } from "react";
import { changeBps, districtNames, readPublic, readRaidBase, teePublic, type PublicState } from "../lib/chain";
import { getLobby, getReport, subscribeWire, type WireLine } from "../lib/keeper";
import { UNRESOLVED, poolChoices, poolTimes, readBook, type Book } from "../lib/picks";

const mmss = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, "0")}`;

export default function Overlay({ raidId: given }: { raidId: string }) {
  const [raidId, setRaidId] = useState(given);
  const [pub, setPub] = useState<PublicState | null>(null);
  const [book, setBook] = useState<Book | null>(null);
  const [line, setLine] = useState<WireLine | null>(null);
  const [awards, setAwards] = useState<Record<string, { who?: string; wallet?: string; hp?: number; value?: number; correct?: number; picks?: number } | null> | null>(null);
  const [, setTick] = useState(0);
  useEffect(() => {
    document.body.style.background = "transparent";
    document.documentElement.style.background = "transparent";
    const t = setInterval(() => setTick((x) => x + 1), 500);
    return () => clearInterval(t);
  }, []);
  // Follow the keeper's current raid when no id is given.
  useEffect(() => {
    if (given) return;
    const f = async () => { const l = await getLobby(); if (l?.raidId && l.raidId !== raidId) { setRaidId(l.raidId); setAwards(null); } };
    void f(); const i = setInterval(f, 10000); return () => clearInterval(i);
  }, [given, raidId]);
  useEffect(() => {
    if (!raidId) return;
    let stop = false;
    const f = async () => {
      const s = await readPublic(teePublic, raidId).catch(() => null);
      if (s && !s.raid) s.raid = await readRaidBase(raidId);
      const b = await readBook(raidId);
      if (!stop) { setPub(s); setBook(b); }
      if (s?.raid && s.raid.status >= 3 && !awards) { const r = await getReport(raidId); if (!stop && r?.report.awards) setAwards(r.report.awards); }
    };
    void f(); const i = setInterval(f, 1000);
    const off = subscribeWire(raidId, (l) => setLine(l));
    return () => { stop = true; clearInterval(i); off(); };
  }, [raidId, awards]);
  const raid = pub?.raid;
  if (!raid) return <div className="ov-root" />;
  const now = Date.now() / 1000;
  const start = raid.status >= 2 ? Number(raid.startTs.toString()) : 0;
  const left = start ? 300 - (now - start) : 300;
  const DN = districtNames(raid.mode);
  const alive = raid.raiders.filter((r, s) => r.joined && pub?.rpubs[s]?.alive && !pub?.rpubs[s]?.extracted).length;
  const out = pub?.rpubs.filter((r, s) => r && raid.raiders[s].joined && r.extracted).length ?? 0;
  // The current pick: the newest opened NEXT CRACK / KNOCKOUT window.
  const picks = start && book ? [8, 13].map((base) => { let p = -1; for (let i = 0; i < (base === 8 ? 5 : 10); i++) if (poolTimes(start, base + i)[0] <= now) p = base + i; return p; }).filter((p) => p >= 0) : [];
  return (
    <div className="ov-root">
      <div className="ov-top">
        <span className="ov-brand">RAZKYN <i>LIVE</i></span>
        <span className="ov-clock">{raid.status >= 3 ? "RAID OVER" : raid.status === 2 ? mmss(left) : "DROPPING SOON"}</span>
        <span className="ov-stat">{alive} IN · {out} OUT</span>
        {[0, 1, 2].map((d) => { const b = changeBps(pub?.districts[d] ?? null); return <span key={d} className={`ov-d ${b >= 0 ? "up" : "down"}`}>{DN[d].toUpperCase()} {b >= 0 ? "▲" : "▼"} {(Math.abs(b) / 100).toFixed(2)}%</span>; })}
      </div>
      {picks.length > 0 && book && (
        <div className="ov-picks">
          {picks.map((p) => {
            const [, lock] = poolTimes(start, p);
            const choices = poolChoices(p), t = book.totals[p].slice(0, choices.length), tot = t.reduce((a, b) => a + b, 0);
            const o = book.outcome[p];
            return (
              <div key={p} className="ov-pick">
                <div className="ov-ph">{p < 13 ? "NEXT CRACK" : "KNOCKOUT IN 30 S"} <span>{o !== UNRESOLVED ? "RESOLVED" : now < lock ? `LOCKS IN ${Math.ceil(lock - now)}s` : "LOCKED"}</span></div>
                {t.map((v, c) => <div key={c} className={`ov-pc ${o === c ? "won" : ""}`}><span>{p < 13 && c < 3 ? DN[c].toUpperCase() : choices[c]}</span><div style={{ width: `${tot ? (v / tot) * 100 : 0}%` }} /><b>{tot ? Math.round((v / tot) * 100) : 0}%</b></div>)}
              </div>
            );
          })}
        </div>
      )}
      {awards && (
        <div className="ov-awards">
          {awards.topRaider && <div><span>TOP RAIDER</span><b>{awards.topRaider.who}</b></div>}
          {awards.mostDramaticEscape && <div><span>DRAMATIC ESCAPE</span><b>{awards.mostDramaticEscape.who} · {awards.mostDramaticEscape.hp} HP</b></div>}
          {awards.topSpectator && <div><span>TOP SPECTATOR</span><b>{awards.topSpectator.wallet?.slice(0, 4)}… · {awards.topSpectator.correct}/{awards.topSpectator.picks}</b></div>}
        </div>
      )}
      {line && (
        <div className="ov-wire" key={line.text}>
          <span className="ov-wb">THE WIRE</span>
          <span className={`ov-tag ${line.tag === "BREAKING" ? "brk" : ""}`}>{line.tag}</span>
          <span className="ov-wt">{line.text}</span>
        </div>
      )}
    </div>
  );
}
