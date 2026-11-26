import { useEffect, useState } from "react";
import { navigate } from "../App";
import { P, base, coder, decode, districtNames, type RaidAcc } from "../lib/chain";
import { explorerAddr, explorerTx } from "../lib/config";
import { canonical, getReport, hex, sha256, verifyMystery, type ReportFile } from "../lib/keeper";
import ShareCard from "../game/ShareCard";

type Check = { recomputed: string; onchain: string; ok: boolean } | null;

function PricePath({ path }: { path: { step: number; prices: string[] }[] }) {
  if (!path?.length) return null;
  const W = 640, H = 160;
  const all = path.flatMap((p) => p.prices.map(Number));
  const lo = Math.min(...all), hi = Math.max(...all), r = hi - lo || 1;
  const maxStep = Math.max(...path.map((p) => p.step), 1);
  const colors = ["#22d37a", "#46d2ff", "#ffb22e"];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }} role="img" aria-label="District price index over the raid">
      <line x1={0} x2={W} y1={H - ((1_000_000 - lo) / r) * (H - 10) - 5} y2={H - ((1_000_000 - lo) / r) * (H - 10) - 5} stroke="#2a3547" strokeDasharray="4 4" />
      {[0, 1, 2].map((a) => (
        <polyline key={a} fill="none" stroke={colors[a]} strokeWidth={1.6}
          points={path.map((p) => `${(p.step / maxStep) * W},${H - ((Number(p.prices[a]) - lo) / r) * (H - 10) - 5}`).join(" ")} />
      ))}
    </svg>
  );
}

export default function Report({ raidId }: { raidId: string }) {
  const [file, setFile] = useState<ReportFile | null | undefined>(undefined);
  const [check, setCheck] = useState<Check>(null);
  const [proof, setProof] = useState<{ ok: boolean; root: string; onchain: string } | null>(null);
  const [planCheck, setPlanCheck] = useState<{ ok: boolean; onchain: string } | null>(null);

  useEffect(() => {
    const src = new URLSearchParams(window.location.search).get("src") ?? undefined; // test 13: a tampered copy
    (async () => {
      const f = await getReport(raidId, src);
      setFile(f);
      if (!f) return;
      // Recompute the hash of the report body and compare with the hash posted on-chain.
      const recomputed = hex(await sha256(new TextEncoder().encode(canonical(f.report))));
      const info = await base.getAccountInfo(P.settlement(raidId));
      const st = info ? (coder.decode("settlement", info.data) as { reportHash: number[]; reportPosted: boolean }) : null;
      const onchain = st?.reportPosted ? hex(Uint8Array.from(st.reportHash)) : "";
      setCheck({ recomputed, onchain, ok: !!onchain && onchain === recomputed });
      // Market event plan (v2 raids): recompute sha256("razkyn-events" ‖ plan) and compare with Raid.event_plan_hash on-chain.
      const ev = f.report.marketEvents as { planHex?: string } | undefined;
      if (ev?.planHex) {
        const raidAcc = decode<RaidAcc & { eventPlanHash?: number[] }>("raid", (await base.getAccountInfo(P.raid(raidId)))?.data);
        const plan = Uint8Array.from((ev.planHex.match(/../g) ?? []).map((b) => parseInt(b, 16)));
        const mine = hex(await sha256(new Uint8Array([...new TextEncoder().encode("razkyn-events"), ...plan])));
        const onchainPlan = raidAcc?.eventPlanHash ? hex(Uint8Array.from(raidAcc.eventPlanHash)) : "";
        setPlanCheck({ ok: !!onchainPlan && onchainPlan === mine, onchain: onchainPlan });
      }
      const m = f.report.mystery;
      if (m) {
        const raidInfo = await base.getAccountInfo(P.raid(raidId));
        const raid = decode<{ dayRoot: number[] }>("raid", raidInfo?.data); // v1 layout fallback for raids before the v2 upgrade
        const onRoot = raid ? hex(Uint8Array.from(raid.dayRoot)) : "";
        const v = await verifyMystery(m, onRoot);
        setProof({ ok: v.ok, root: v.root, onchain: onRoot });
      }
    })();
  }, [raidId]);

  const r = file?.report;
  const liveMarkets = (r?.mode ?? r?.raid?.mode) === "live-markets";
  const DN = districtNames(liveMarkets ? 2 : 0);
  return (
    <div className="page">
      <div className="topbar">
        <a className="brand" href="/" onClick={(e) => { e.preventDefault(); navigate("/"); }}>RAZKYN</a>
        <span className="pill">Market Raid Report</span>
        <div className="spacer" />
        <span className="mono dim" style={{ fontSize: 12 }}>raid {raidId}</span>
      </div>
      <div className="wrap" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {file === undefined && <p className="dim">Loading the report…</p>}
        {file === null && <div className="card"><h3>Not published yet</h3><p className="note">The keeper publishes the report after settlement and claims.</p></div>}
        {r && (
          <>
            <div className="card">
              <h3>Integrity</h3>
              <div className="kv">
                <span>Report hash</span>
                <span>{check ? (check.ok ? <span className="verified">Verified ✓</span> : <span className="mismatch">Mismatch</span>) : "checking…"}</span>
                <span>recomputed sha256</span><span className="mono">{check?.recomputed}</span>
                <span>on-chain (Settlement)</span><span className="mono">{check?.onchain || "not posted"} {file?.postReportSig && <a href={explorerTx(file.postReportSig)} target="_blank" rel="noreferrer">post tx</a>}</span>
                {r.mystery && (
                  <>
                    <span>Mystery day</span>
                    <span><b className="mono">{r.mystery.day}</b> (leaf {r.mystery.leafIndex} of {r.mystery.leafCount}) · {proof ? (proof.ok ? <span className="verified">Merkle proof ✓ vs Raid.day_root</span> : <span className="mismatch">Merkle proof mismatch</span>) : "checking…"}</span>
                    {r.mystery.event && (<><span>What happened</span><span><b className="neon-m">{r.mystery.event.title}</b> · {r.mystery.event.summary} {(r.mystery.event.sources ?? []).map((x: { url: string; outlet: string }) => <a key={x.url} href={x.url} target="_blank" rel="noreferrer" style={{ marginLeft: 6 }}>{x.outlet} ↗</a>)}<div className="note" style={{ fontSize: 11 }}>{r.mystery.event.note}</div></span></>)}
                    <span>day_root (on-chain)</span><span className="mono">{proof?.onchain}</span>
                    <span>Sources</span><span>{(r.mystery.sources ?? []).map((u: string) => <div key={u}><a href={u} target="_blank" rel="noreferrer" className="mono" style={{ fontSize: 12 }}>{u}</a></div>)}</span>
                  </>
                )}
                {r.marketEvents?.events && (
                  <>
                    <span>Market events</span>
                    <span>
                      {(r.marketEvents.events as { kind: string; district: string; atSecond: number }[]).map((e, i) => <div key={i}><b className="neon-a">{e.kind}</b> · {e.kind === "RATE SHOCK" ? "all districts" : e.district} · t = {e.atSecond} s</div>)}
                      <div className="note" style={{ fontSize: 12 }}>Drawn from the VRF seed and committed by hash before the raid started. {planCheck ? (planCheck.ok ? <span className="verified">Plan hash ✓ vs Raid.event_plan_hash</span> : <span className="mismatch">Plan hash mismatch</span>) : "checking…"}</div>
                    </span>
                  </>
                )}
                <span>Program</span><span className="mono"><a href={explorerAddr(r.programId)} target="_blank" rel="noreferrer">{r.programId}</a></span>
                <span>Raid PDA</span><span className="mono"><a href={explorerAddr(r.raid.pda)} target="_blank" rel="noreferrer">{r.raid.pda}</a></span>
              </div>
            </div>

            <div className="card">
              <h3>Market · {r.mode === "mystery" || r.raid.mode === "mystery" ? "Mystery Market Day" : liveMarkets ? "Live markets (NVDA · TSLA · SOL)" : "Live"} · {r.pricePathSource ?? "price path"}</h3>
              <PricePath path={r.pricePath} />
              <div className="row note">
                {(r.assets ?? []).map((a: { district: string; tracks: string }, i: number) => (
                  <span key={i}><span style={{ color: ["#22d37a", "#46d2ff", "#ffb22e"][i] }}>■</span> {a.district} → {a.tracks}</span>
                ))}
                <span>final index: {(r.results.finalPrices as string[]).map((p, i) => `${DN[i]} ${(Number(p) / 1e4).toFixed(2)}`).join(" · ")}</span>
              </div>
            </div>

            <div className="card">
              <h3>Raiders and payouts</h3>
              <table className="t">
                <thead><tr><th>#</th><th>Who</th><th>Outcome</th><th>Kills</th><th>dUSD paid</th><th>Minted (devnet demo, not a share)</th><th>Claim</th></tr></thead>
                <tbody>
                  {r.raiders.filter((x: { wallet: string | null }) => x.wallet).map((x: { slot: number; bot: boolean; wallet: string; extracted: boolean; alive: boolean | null; kills: number; dusdPayout: string; mintUnits: string[] }) => {
                    const claim = (r.claims as { slot: number; sig: string }[]).find((c) => c.slot === x.slot);
                    return (
                      <tr key={x.slot}>
                        <td className="mono">{x.slot + 1}</td>
                        <td>{x.bot ? <span className="pill bot">BOT</span> : <span className="pill live">HUMAN</span>} <span className="mono dim">{x.wallet.slice(0, 4)}…</span>{r.classes?.[x.slot] && <span className="cls-tag" style={{ marginLeft: 6 }}>{r.classes[x.slot]}</span>}</td>
                        <td>{x.extracted ? <span className="up">extracted</span> : x.alive === false ? <span className="down">knocked out</span> : "no extraction"}</td>
                        <td className="mono">{x.kills}</td>
                        <td className="mono">{(Number(x.dusdPayout) / 1e6).toFixed(2)}</td>
                        <td className="mono">{x.mintUnits.map((u, i) => (Number(u) ? `${(Number(u) / 1e6).toFixed(2)} d${["TWR", "FAC", "HRB"][i]}` : "")).filter(Boolean).join(" · ") || "—"}</td>
                        <td>{claim && claim.sig.length > 40 ? <a href={explorerTx(claim.sig)} target="_blank" rel="noreferrer">tx</a> : <span className="dim">{claim?.sig ?? ""}</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="note">
                Conservation: dUSD {(Number(r.results.dusd) / 1e6).toFixed(2)} + reserve {(Number(r.results.reserve) / 1e6).toFixed(2)} + ops {(Number(r.results.ops) / 1e6).toFixed(2)} = stakes {(Number(r.results.stakes) / 1e6).toFixed(2)}{" "}
                {Number(r.results.dusd) + Number(r.results.reserve) + Number(r.results.ops) === Number(r.results.stakes) ? <span className="verified">✓</span> : <span className="mismatch">✗</span>}
              </p>
            </div>

            {r.awards && (
              <div className="card">
                <h3>Awards · from recorded results</h3>
                <div className="awards">
                  {r.awards.topRaider && <div className="award"><span className="aw-k">TOP RAIDER</span><b>{r.awards.topRaider.who}</b><span>{(r.awards.topRaider.value / 1e6).toFixed(2)} dUSD total payout</span></div>}
                  {r.awards.biggestExtraction && <div className="award"><span className="aw-k">BIGGEST EXTRACTION</span><b>{r.awards.biggestExtraction.who}</b><span>{(r.awards.biggestExtraction.backpack / 1e6).toFixed(2)} dUSD backpack banked</span></div>}
                  {r.awards.mostDramaticEscape && <div className="award"><span className="aw-k">MOST DRAMATIC ESCAPE</span><b>{r.awards.mostDramaticEscape.who}</b><span>extracted on {r.awards.mostDramaticEscape.hp} HP</span></div>}
                  {r.awards.mostKnockouts && <div className="award"><span className="aw-k">MOST KNOCKOUTS</span><b>{r.awards.mostKnockouts.who}</b><span>{r.awards.mostKnockouts.kills} knockout{r.awards.mostKnockouts.kills === 1 ? "" : "s"}</span></div>}
                  {r.awards.topSpectator && <div className="award"><span className="aw-k">TOP SPECTATOR</span><b className="mono">{r.awards.topSpectator.wallet.slice(0, 4)}…{r.awards.topSpectator.wallet.slice(-4)}</b><span>{r.awards.topSpectator.correct}/{r.awards.topSpectator.picks} correct · streak {r.awards.topSpectator.bestStreak}</span></div>}
                </div>
              </div>
            )}

            <div className="card">
              <h3>Share this raid</h3>
              <ShareCard data={{ raidId, outcome: "VERIFIED RAID", mode: r.mystery ? "Mystery Market Day" : liveMarkets ? "Live markets" : "Live", title: r.mystery?.event?.title, payout: r.awards?.topRaider ? `${(r.awards.topRaider.value / 1e6).toFixed(2)} dUSD` : undefined, line: r.awards?.topRaider ? `top raider: ${r.awards.topRaider.who}` : undefined, hash: file?.hash }} />
            </div>

            {r.livePicks && (
              <div className="card">
                <h3>RAZKYN LIVE · on-chain spectator picks</h3>
                <p className="note">{r.livePicks.rules}</p>
                <div className="kv" style={{ marginBottom: 8 }}>
                  <span>Pick book</span><span className="mono"><a href={explorerAddr(r.livePicks.book)} target="_blank" rel="noreferrer">{r.livePicks.book.slice(0, 8)}… ↗</a> {r.livePicks.status === 1 ? "· committed to Solana" : r.livePicks.status === 2 ? "· cancelled (refunded)" : ""}</span>
                  {r.livePicks.sigs?.create && <><span>Created / delegated</span><span className="mono"><a href={explorerTx(String(r.livePicks.sigs.create))} target="_blank" rel="noreferrer">create ↗</a> · <a href={explorerTx(String(r.livePicks.sigs.delegate))} target="_blank" rel="noreferrer">delegate ↗</a></span></>}
                  {r.livePicks.sigs?.crank && <><span>Resolve crank</span><span className="mono" style={{ fontSize: 12 }}>{String(r.livePicks.sigs.crank).slice(0, 20)}… <span className="dim">(TEE tx)</span></span></>}
                  {Array.isArray(r.livePicks.sigs?.badgeClaims) && r.livePicks.sigs.badgeClaims.length > 0 && <><span>Badge claims</span><span>{(r.livePicks.sigs.badgeClaims as string[]).map((s) => <a key={s} href={explorerTx(s)} target="_blank" rel="noreferrer" className="mono" style={{ marginRight: 8 }}>{s.slice(0, 8)}… ↗</a>)}</span></>}
                </div>
                <table className="t">
                  <thead><tr><th>Pick</th><th>Outcome</th><th>Picks</th><th>Called it</th><th>Paid</th></tr></thead>
                  <tbody>
                    {(r.livePicks.pools as { pool: number; name: string; choices: string[]; outcome: number; bets: number; pct: number; mult: number }[]).map((p) => (
                      <tr key={p.pool}>
                        <td>{p.name}</td>
                        <td>{p.outcome === 254 ? "refunded" : p.outcome === 255 ? "—" : p.pool >= 8 && p.pool < 13 && p.outcome < 3 ? DN[p.outcome] : p.choices[p.outcome]}</td>
                        <td className="mono">{p.bets}</td><td className="mono">{p.pct}%</td><td className="mono">{p.mult ? `${p.mult.toFixed(1)}×` : "refund"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {(r.livePicks.leaderboard as { wallet: string; picks: number; correct: number; bestStreak: number; credits: number; badge: number; badgeClaimed: boolean }[]).slice(0, 10).map((x, i) => (
                  <div key={x.wallet} className="mono" style={{ fontSize: 12 }}>{i + 1}. {x.wallet.slice(0, 4)}…{x.wallet.slice(-4)} · {x.correct}/{x.picks} correct · streak {x.bestStreak} · {x.credits} credits{x.badge ? ` · badge #${x.badge}${x.badgeClaimed ? " minted" : ""}` : ""}</div>
                ))}
              </div>
            )}

            {r.spectators && (
              <div className="card">
                <h3>EXTRACTION MARKET · dPLAY PLAY-MONEY</h3>
                <p className="note">{r.spectators.rules}</p>
                <table className="t">
                  <thead><tr><th>Raider</th><th>On extracts</th><th>On doesn&apos;t</th><th>Result</th></tr></thead>
                  <tbody>
                    {(r.spectators.pools as { slot: number; yes: number; no: number; count: number }[]).filter((p) => p.count > 0).map((p) => (
                      <tr key={p.slot}><td className="mono">{p.slot + 1}</td><td className="mono">{p.yes}</td><td className="mono">{p.no}</td><td>{r.spectators.outcomes ? (r.spectators.outcomes[p.slot] ? <span className="up">extracted</span> : <span className="down">did not</span>) : "—"}</td></tr>
                    ))}
                  </tbody>
                </table>
                {(r.spectators.bets as unknown[]).length === 0 && <p className="note">No bets this raid.</p>}
                {Array.isArray(r.spectators.picks) && (
                  <>
                    <div className="label" style={{ marginTop: 12 }}>RAZKYN LIVE picks · resolved from public raid state</div>
                    <table className="t">
                      <thead><tr><th>Pick</th><th>Window</th><th>Outcome</th><th>Picks</th><th>Called it</th><th>Paid</th></tr></thead>
                      <tbody>
                        {(r.spectators.picks as { type: string; window: number; name: string; choices: string[]; bets: number; result: { outcome: number; pct: number; mult: number } | null }[]).map((p) => (
                          <tr key={`${p.type}${p.window}`}>
                            <td>{p.name}</td><td className="mono">{p.window + 1}</td>
                            <td>{p.result ? (p.type === "C" && p.result.outcome < 3 ? DN[p.result.outcome] : p.choices[p.result.outcome]) : "—"}</td>
                            <td className="mono">{p.bets}</td><td className="mono">{p.result && p.bets ? `${p.result.pct}%` : "—"}</td>
                            <td className="mono">{p.result?.mult ? `${p.result.mult.toFixed(1)}×` : p.bets ? "refund" : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {Array.isArray(r.spectators.leaderboard) && r.spectators.leaderboard.length > 0 && (
                      <>
                        <div className="label" style={{ marginTop: 10 }}>Top spectators</div>
                        {(r.spectators.leaderboard as { bettor: string; picks: number; correct: number; bestStreak: number; net: number }[]).slice(0, 10).map((x, i) => (
                          <div key={x.bettor} className="mono" style={{ fontSize: 12 }}>{i + 1}. {x.bettor.slice(0, 4)}…{x.bettor.slice(-4)} · {x.correct}/{x.picks} correct · best streak {x.bestStreak} · net {x.net >= 0 ? "+" : ""}{x.net} dPLAY</div>
                        ))}
                      </>
                    )}
                  </>
                )}
                {(r.spectators.payouts as { bettor: string; amount: number; reason: string; sig?: string }[]).map((p, i) => (
                  <div key={i} className="mono" style={{ fontSize: 12 }}>{p.reason === "win" ? "won" : "refund"} {p.amount} dPLAY → {p.bettor.slice(0, 4)}…{p.bettor.slice(-4)} {p.sig && p.sig.length > 40 && <a href={explorerTx(p.sig)} target="_blank" rel="noreferrer">tx ↗</a>}</div>
                ))}
              </div>
            )}

            <div className="grid2">
              <div className="card">
                <h3>Onchain trail</h3>
                <div className="kv">
                  <span>VRF requests</span><span>{(r.vrf.requests ?? []).map((s: string) => <div key={s} className="mono" style={{ fontSize: 12, wordBreak: "break-all" }}>{s} <span className="dim">(TEE tx: readable with a TEE token, not on the base explorer)</span></div>)}</span>
                  <span>VRF callback</span><span className="note">{r.vrf.callback}</span>
                  <span>end_raid (TEE)</span><span className="mono">{r.settlement.endRaid?.slice(0, 24)}…</span>
                  <span>Commit + action</span><span>{r.settlement.baseCommit?.length > 40 ? <a href={explorerTx(r.settlement.baseCommit)} target="_blank" rel="noreferrer" className="mono">{r.settlement.baseCommit.slice(0, 20)}…</a> : <span className="dim">{r.settlement.baseCommit}</span>}</span>
                  <span>Settled via</span><span>{r.settlement.settledVia === 1 ? "finalize_raid Magic Action" : r.settlement.settledVia === 2 ? "settle_stuck_raid recovery" : String(r.settlement.settledVia)}</span>
                  <span>Ticks</span><span className="mono">{r.tick.landed}/{r.tick.sent} at {r.tick.hz} Hz · max gap {r.tick.maxGapMs} ms</span>
                </div>
              </div>
              <div className="card">
                <h3>THE WIRE · debriefs</h3>
                {(r.wire?.debriefs ?? []).map((d: { slot: number; text: string; source: string; headlines?: { title: string; url: string }[] }) => (
                  <div key={d.slot} style={{ marginBottom: 10 }}>
                    <div className="label">Raider {d.slot + 1} · {d.source === "llm" ? "model" : "template"}</div>
                    <div style={{ fontSize: 13, lineHeight: 1.5 }}>{d.text}</div>
                    {(d.headlines ?? []).map((h) => <div key={h.url}><a href={h.url} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>{h.title}</a></div>)}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
