import React from 'react'
import { AbsoluteFill, Audio, Img, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion'
import tl from './timeline.json'
import ev from './events.json'
import { Bg, C, Callout, Captions, Count, Kicker, Phone, PriceLine, Rise, Screen, Wordmark, body, clamp, display, ease, mono, useSpring } from './kit'

type Scene = (typeof tl.scenes)[number]
const S = Object.fromEntries(tl.scenes.map((s) => [s.id, s])) as Record<string, Scene>
/** Frame (scene-local) where caption i of scene id starts. */
const cap = (id: string, i: number) => S[id].captions[Math.min(i, S[id].captions.length - 1)].from
/** Seconds into raid.webm where a recorded moment happened (with fallback). */
const at = (name: string, fb: number) => (ev.events.find((e: { name: string }) => e.name === name) as { t: number } | undefined)?.t ?? fb

function Shell({ s, children, tint }: { s: Scene; children: React.ReactNode; tint?: string }) {
  const f = useCurrentFrame()
  const o = interpolate(f, [0, 8, s.dur - 8, s.dur], [0, 1, 1, 0], clamp)
  return (
    <AbsoluteFill style={{ opacity: o, fontFamily: body, color: C.text }}>
      <Bg tint={tint} />
      {children}
      <Sequence from={6}><Audio src={staticFile(`${s.id}.mp3`)} /></Sequence>
      <Captions caps={s.captions} />
    </AbsoluteFill>
  )
}
const H1 = ({ children, color = C.text, size = 120 }: { children: React.ReactNode; color?: string; size?: number }) => (
  <div style={{ fontFamily: display, fontWeight: 800, fontSize: size, lineHeight: 0.95, letterSpacing: 2, textTransform: 'uppercase', color }}>{children}</div>
)

// ---------------- 1. HOOK ----------------
function Hook() {
  const s = S.hook; const f = useCurrentFrame()
  const c1 = cap('hook', 1), c2 = cap('hook', 2)
  const shake = f > c1 && f < c2 ? Math.sin(f * 1.7) * 3 : 0
  return (
    <Shell s={s} tint={C.red}>
      <div style={{ position: 'absolute', left: 150, top: 230 }}>
        <Rise at={4} out={c2 - 6}><H1>Loot you'll</H1><H1 color={C.red}>never own.</H1></Rise>
      </div>
      {/* locked chest */}
      <Rise at={12} out={c1 - 4} style={{ position: 'absolute', right: 230, top: 250 }}>
        <svg width="420" height="340" viewBox="0 0 420 340"><rect x="30" y="120" width="360" height="200" fill={C.panel} stroke={C.amber} strokeWidth="6" /><rect x="30" y="60" width="360" height="80" fill="#1a2128" stroke={C.amber} strokeWidth="6" /><rect x="185" y="150" width="50" height="70" fill={C.amber} /><line x1="10" y1="330" x2="410" y2="20" stroke={C.red} strokeWidth="16" strokeDasharray={600} strokeDashoffset={interpolate(f, [24, 40], [600, 0], clamp)} /></svg>
      </Rise>
      {/* casino chart */}
      <Rise at={c1} out={c2 - 4} style={{ position: 'absolute', right: 180, top: 220, transform: `translateX(${shake}px)` }}>
        <div style={{ width: 560, height: 380, border: `1.5px solid ${C.line}`, background: 'rgba(16,21,26,.85)', padding: 24 }}>
          <div style={{ fontFamily: mono, color: C.red, fontSize: 26 }}>BUY · SELL · BUY · SELL</div>
          <div style={{ marginTop: 30 }}><PriceLine w={510} h={240} seed={7} trend={0} at={c1} color={C.red} /></div>
        </div>
      </Rise>
      <div style={{ position: 'absolute', left: 150, top: 230 }}>
        <Rise at={c1 + 2} out={c2 - 6} dist={20}><div style={{ marginTop: 300, fontFamily: display, fontWeight: 700, fontSize: 64, color: C.silver, textTransform: 'uppercase' }}>Markets that feel like a casino.</div></Rise>
      </div>
      <AbsoluteFill style={{ display: 'grid', placeItems: 'center' }}>
        <Rise at={c2} style={{ textAlign: 'center' }}>
          <H1 size={110}>What if the market</H1>
          <H1 size={110}>was the <span style={{ color: C.teal }}>map</span>,</H1>
          <Rise at={c2 + 40}><H1 size={110}>and the loot was <span style={{ color: C.amber }}>real?</span></H1></Rise>
        </Rise>
      </AbsoluteFill>
    </Shell>
  )
}

// ---------------- 2. INTRO: the map is the market ----------------
function Crate({ i, a }: { i: number; a: number }) {
  const p = useSpring(a)
  return <div style={{ position: 'absolute', left: 60 + i * 130, bottom: 50, width: 90, height: 60, background: C.amber, transform: `scale(${p})`, boxShadow: `0 0 30px ${C.amber}` }} />
}
function District({ x, name, asset, at: a, mood, label }: { x: number; name: string; asset: string; at: number; mood: number; label?: string }) {
  const f = useCurrentFrame(); const s = useSpring(a)
  const col = mood > 0 ? C.teal : mood < 0 ? C.red : C.silver
  const on = f > a + 30 && mood !== 0
  const glow = on ? 0.35 + Math.sin(f / 6) * 0.15 : 0
  return (
    <div style={{ position: 'absolute', left: x, top: 300 + (1 - s) * 80, width: 480, height: 440, opacity: Math.min(1, s), background: `linear-gradient(180deg, rgba(16,21,26,.95), rgba(11,15,18,.95))`, border: `2px solid ${on ? col : C.line}`, boxShadow: on ? `0 0 80px rgba(${mood > 0 ? '69,201,178' : '228,81,78'},${glow})` : 'none', padding: 28, overflow: 'hidden' }}>
      <div style={{ fontFamily: display, fontWeight: 800, fontSize: 52, letterSpacing: 4 }}>{name}</div>
      <div style={{ fontFamily: mono, fontSize: 24, color: C.dim }}>tracks {asset}</div>
      <div style={{ marginTop: 24 }}><PriceLine w={420} h={170} seed={x + 3} trend={mood * 2.2} at={a} color={col} /></div>
      {on && mood > 0 && [0, 1, 2].map((i) => <Crate key={i} i={i} a={a + 36 + i * 6} />)}
      {on && mood < 0 && (<svg width="480" height="160" style={{ position: 'absolute', left: 0, bottom: 0 }}><polyline points="0,40 90,70 150,30 230,90 300,50 380,110 480,70" fill="none" stroke={C.red} strokeWidth="5" strokeDasharray={700} strokeDashoffset={interpolate(f, [a + 34, a + 60], [700, 0], clamp)} /><polyline points="60,160 120,100 200,140 260,95 340,150" fill="none" stroke={C.red} strokeWidth="4" strokeDasharray={500} strokeDashoffset={interpolate(f, [a + 44, a + 70], [500, 0], clamp)} /></svg>)}
      {label && on && <div style={{ position: 'absolute', left: 28, top: 296, fontFamily: display, fontWeight: 800, fontSize: 34, color: col, background: 'rgba(11,15,18,.85)', padding: '2px 8px' }}>{label}</div>}
    </div>
  )
}
function Intro() {
  const s = S.intro; const f = useCurrentFrame()
  const c1 = cap('intro', 1), c2 = cap('intro', 2), c3 = cap('intro', 3), c4 = cap('intro', 4), c5 = cap('intro', 5)
  const titleOut = c2 - 4
  return (
    <Shell s={s}>
      {f < titleOut + 12 && (
        <AbsoluteFill style={{ opacity: interpolate(f, [titleOut, titleOut + 12], [1, 0], clamp) }}>
          <Screen src="title.mp4" from={1} x={0} y={0} w={1920} />
          <AbsoluteFill style={{ background: 'linear-gradient(90deg, rgba(7,9,11,.92) 0%, rgba(7,9,11,.55) 55%, rgba(7,9,11,.2) 100%)' }} />
          <div style={{ position: 'absolute', left: 170, top: 300 }}>
            <Wordmark at={6} size={230} />
            <Rise at={26}><div style={{ marginTop: 34, fontFamily: display, fontWeight: 700, fontSize: 46, letterSpacing: 22, color: C.silver }}>RAID · TRADE · EXTRACT</div></Rise>
            <Rise at={c1}><div style={{ marginTop: 50, display: 'flex', gap: 18 }}>{['8 raiders', '5 minutes', '10 ticks / s', 'Solana · MagicBlock'].map((t, i) => <div key={t} style={{ padding: '12px 22px', border: `1.5px solid ${i === 3 ? C.teal : C.line}`, fontFamily: display, fontWeight: 700, fontSize: 32, letterSpacing: 3, textTransform: 'uppercase', color: i === 3 ? C.teal : C.text, background: 'rgba(11,15,18,.7)' }}>{t}</div>)}</div></Rise>
          </div>
        </AbsoluteFill>
      )}
      {f >= c2 - 4 && (<>
        <div style={{ position: 'absolute', left: 150, top: 150 }}><Kicker at={c2}>The map is the market</Kicker></div>
        <District x={150} name="TOWER" asset="SOL" at={c2 + 2} mood={0} />
        <District x={720} name="FACTORY" asset="BTC" at={c2 + 8} mood={f > c3 ? 1 : 0} label="+2.1% · CRATES WAKE" />
        <District x={1290} name="HARBOR" asset="ETH" at={c2 + 14} mood={f > c4 ? -1 : 0} label="−2.4% · FLOOR CRACKS" />
        <Rise at={c5} style={{ position: 'absolute', left: 150, top: 790 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 28, padding: '16px 28px', background: 'rgba(16,21,26,.95)', border: `1.5px solid ${C.line}`, width: 1620 }}>
            <div style={{ fontFamily: display, fontWeight: 800, fontSize: 30, letterSpacing: 4, color: C.dim }}>BACKPACK · LIVE VALUE</div>
            <div style={{ fontFamily: mono, fontWeight: 800, fontSize: 54, color: C.amber }}><Count from={c5} to={c5 + 70} a={3.1} b={7.42} decimals={2} /> dUSD</div>
            <PriceLine w={600} h={70} seed={11} trend={-1.2} at={c5} color={C.teal} />
          </div>
        </Rise>
      </>)}
    </Shell>
  )
}

// ---------------- 3. JOIN ----------------
function Join() {
  const s = S.join
  return (
    <Shell s={s}>
      <Screen src="lobby.mp4" from={ev.lobbyFrom ?? 4} x={110} y={110} w={1180} label="razkyn.vercel.app · live" />
      <div style={{ position: 'absolute', left: 1330, top: 140 }}><Kicker at={4} color={C.teal}>MagicBlock · Private ER</Kicker></div>
      <Callout at={cap('join', 0)} x={1330} y={240} w={500} title="One signature" sub="Free devnet dUSD + the 10 dUSD stake. That's the only wallet popup." color={C.amber} align="right" />
      <Callout at={cap('join', 1)} x={1330} y={440} w={500} title="Session key" sub="A raid-scoped key signs every move on the TEE. It can never move tokens." color={C.teal} align="right" />
      <Callout at={cap('join', 1) + 70} x={1330} y={640} w={500} title="No popups · No gas" sub="10 ticks per second on MagicBlock's Private Ephemeral Rollup." color={C.violet} align="right" />
    </Shell>
  )
}

// ---------------- 4. LOOT + PEEK ----------------
function Loot() {
  const s = S.loot; const f = useCurrentFrame()
  const c1 = cap('loot', 1)
  const crateT = at('open_crate', 30) - 2.2, peekT = at('peek', 55) - 0.6
  return (
    <Shell s={s}>
      {f < c1 + 4 && <Screen src="raid.mp4" from={crateT} x={110} y={120} w={1300} zooms={[{ at: 40, scale: 1.25, x: 0.5, y: 0.55 }]} label="live raid · devnet" />}
      {f >= c1 && <Screen src="raid.mp4" from={peekT} at={c1} x={110} y={120} w={1300} zooms={[{ at: c1 + 30, scale: 1.7, x: 0.86, y: 0.36 }]} label="Try to Peek · real TEE reads" />}
      <Callout at={cap('loot', 0) + 6} out={c1 - 4} x={1440} y={250} w={420} title="Sealed by VRF" sub="Crate contents fixed by the raid's verifiable random seed." color={C.amber} align="right" />
      <Callout at={cap('loot', 0) + 40} out={c1 - 4} x={1440} y={470} w={420} title="Hidden in the TEE" sub="Private until a raider opens it. Then public." color={C.teal} align="right" />
      <Rise at={c1 + 30} style={{ position: 'absolute', left: 1440, top: 300, width: 420 }}>
        <div style={{ padding: 26, background: 'rgba(228,81,78,.12)', border: `2px solid ${C.red}` }}>
          <div style={{ fontFamily: display, fontWeight: 800, fontSize: 58, color: C.red, letterSpacing: 3 }}>ACCESS DENIED</div>
          {['sealed crate', "another raider's state", 'the secret day'].map((t, i) => <Rise key={t} at={c1 + 44 + i * 10}><div style={{ fontFamily: mono, fontSize: 24, color: C.silver, marginTop: 12 }}>✕ {t} → refused</div></Rise>)}
        </div>
      </Rise>
    </Shell>
  )
}

// ---------------- 5. TRADE + FIGHT ----------------
function Fight() {
  const s = S.fight; const f = useCurrentFrame()
  const c1 = cap('fight', 1), c2 = cap('fight', 2), c3 = cap('fight', 3), c4 = cap('fight', 4)
  const tradeT = at('trade', 80) - 1.5, shotT = at('first_shot', 100) - 2
  return (
    <Shell s={s}>
      {f < c1 + 4 && <Screen src="raid.mp4" from={tradeT} x={110} y={120} w={1300} zooms={[{ at: 30, scale: 1.3, x: 0.5, y: 0.5 }]} label="trade at a terminal" />}
      {f >= c1 && <Screen src="raid.mp4" from={shotT} at={c1} x={110} y={120} w={1300} zooms={[{ at: c1 + 40, scale: 1.2, x: 0.5, y: 0.5 }]} label="BOTs hunting" />}
      <Callout at={8} out={c1 - 4} x={1440} y={300} w={420} title="3 s exposed" sub="While a trade runs, your position is public. A hit cancels it." color={C.amber} align="right" />
      <Callout at={c1 + 4} out={c4 - 4} x={1440} y={150} w={420} title="Own fog only" sub="Each BOT sees only its own view, like you." color={C.red} align="right" />
      <Callout at={c2} out={c4 - 4} x={1440} y={345} w={420} title="Checked on-chain" sub="Range · cooldown · line of sight, for every shot." color={C.teal} align="right" />
      <Callout at={c3} out={c4 - 4} x={1440} y={540} w={420} title="Cover is real" sub="13 blocks the program enforces for moves and shots." color={C.silver} align="right" />
      <Rise at={c4} style={{ position: 'absolute', left: 1440, top: 180, width: 420 }}>
        <div style={{ fontFamily: display, fontWeight: 800, fontSize: 34, color: C.dim, letterSpacing: 4 }}>CLASSES</div>
        {[['GUNNER', '7 tiles · 400 ms'], ['SCOUT', 'sees 10 tiles'], ['TRADER', 'trades in 2 s']].map(([a, b], i) => <Rise key={a} at={c4 + 6 + i * 6}><div style={{ marginTop: 10, padding: '10px 16px', background: 'rgba(16,21,26,.95)', borderLeft: `4px solid ${C.amber}`, fontFamily: display, fontWeight: 700, fontSize: 30 }}>{a} <span style={{ color: C.dim, fontFamily: mono, fontSize: 20 }}>{b}</span></div></Rise>)}
        <div style={{ marginTop: 26, fontFamily: display, fontWeight: 800, fontSize: 34, color: C.dim, letterSpacing: 4 }}>MARKET EVENTS · VRF</div>
        {['TRADING HALT', 'RATE SHOCK', 'EARNINGS SURPRISE'].map((a, i) => <Rise key={a} at={c4 + 30 + i * 6}><div style={{ marginTop: 10, padding: '10px 16px', background: 'rgba(228,81,78,.12)', borderLeft: `4px solid ${C.red}`, fontFamily: display, fontWeight: 700, fontSize: 30 }}>{a}</div></Rise>)}
      </Rise>
    </Shell>
  )
}

// ---------------- 6. EXTRACT + REVEAL ----------------
function Still({ src, at: a, x, y, w, h, zoomTo }: { src: string; at: number; x: number; y: number; w: number; h: number; zoomTo?: { x: number; y: number; s: number } }) {
  const f = useCurrentFrame(); const sp = useSpring(a, { damping: 18 })
  const z = zoomTo ? interpolate(f, [a + 20, a + 160], [1, zoomTo.s], { ...clamp, easing: ease }) : interpolate(f, [a, a + 300], [1, 1.06])
  if (f < a - 1) return null
  return (
    <div style={{ position: 'absolute', left: x, top: y + (1 - sp) * 60, width: w, height: h, opacity: Math.min(1, sp * 1.3), overflow: 'hidden', border: '1.5px solid ' + C.line, boxShadow: '0 50px 120px -30px rgba(0,0,0,.85)' }}>
      <Img src={staticFile('shots/' + src)} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scale(' + z + ')', transformOrigin: zoomTo ? (zoomTo.x * 100) + '% ' + (zoomTo.y * 100) + '%' : '50% 50%' }} />
    </div>
  )
}
function Extract() {
  const s = S.extract; const f = useCurrentFrame()
  const c1 = cap('extract', 1)
  const exT = at('extract_hold', 130) - 3
  return (
    <Shell s={s}>
      {f < c1 + 4 && <Screen src="raid.mp4" from={exT} x={110} y={120} w={1300} zooms={[{ at: 30, scale: 1.3, x: 0.5, y: 0.55 }]} label="extracting · hold 5 s" />}
      {f >= c1 && <Still src="pass2-extracted.jpg" at={c1} x={110} y={120} w={1300} h={731} zoomTo={{ x: 0.3, y: 0.32, s: 1.25 }} />}
      <Callout at={8} out={c1 - 4} x={1440} y={330} w={420} title="Bag banked" sub="Stand on an open exit for 5 s. Exits open at 2:00, 3:30 and 4:30." color={C.teal} align="right" />
      <Callout at={c1 + 10} x={1440} y={230} w={420} title="It was a real day" sub="Revealed only after the raid: here, Ukraine tensions hit crypto, 22 Feb 2022." color={C.amber} align="right" />
      <Callout at={c1 + 80} x={1440} y={500} w={420} title="Price data verified ✓" sub="Checked against a Merkle root committed on-chain before the raid." color={C.teal} align="right" />
    </Shell>
  )
}

// ---------------- 7. SETTLE: real explorer transactions ----------------
function Settle() {
  const s = S.settle; const f = useCurrentFrame()
  const c1 = cap('settle', 1), c2 = cap('settle', 2), c3 = cap('settle', 3)
  return (
    <Shell s={s} tint={C.violet}>
      <div style={{ position: 'absolute', left: 150, top: 80 }}><Kicker at={4} color={C.violet}>Real transactions · explorer.solana.com · devnet</Kicker></div>
      {f < c2 + 4 && (<>
        <Phone src="ex-commit-top.jpg" x={150} y={160} h={740} at={6} marks={[{ at: 40, x: 20, y: 565, w: 370, h: 85, color: C.teal }]} />
        <Phone src="ex-commit-logs.jpg" x={610} y={160} h={740} at={20} marks={[{ at: 80, x: 28, y: 348, w: 362, h: 82 }, { at: 120, x: 30, y: 603, w: 300, h: 36, color: C.violet }]} />
        <Callout at={46} out={c1 - 4} x={1170} y={220} w={600} title="Paid by MagicBlock's TEE validator" sub="Fee payer MTEWGuqx…: the private rollup commits the raid back to Solana." color={C.teal} align="right" />
        <Callout at={86} out={c1 - 4} x={1170} y={450} w={600} title="Magic Action: finalize_raid" sub={'"settled raid … via 1: ops=4000000 reserve=11681654", then Undelegate.'} color={C.amber} align="right" />
        {f >= c1 && <Phone src="ex-claim-tokens.jpg" x={1100} y={160} h={740} at={c1} marks={[{ at: c1 + 20, x: 228, y: 228, w: 152, h: 56, color: C.teal }, { at: c1 + 50, x: 220, y: 588, w: 160, h: 56, color: C.red }]} />}
        {f >= c1 && <Phone src="ex-claim-logs.jpg" x={1580} y={250} h={640} at={c1 + 30} marks={[{ at: c1 + 70, x: 30, y: 483, w: 345, h: 42 }]} />}
        <Rise at={c1 + 24} style={{ position: 'absolute', left: 150, top: 1000 }}><div style={{ fontFamily: mono, fontSize: 22, color: C.teal }}>claim 3Q6nbF5f… · player wallet FG8i… +8.039793 dUSD → 16.143201</div></Rise>
      </>)}
      {f >= c2 - 2 && (
        <Rise at={c2} style={{ position: 'absolute', left: 110, top: 170, width: 1700 }}>
          <div style={{ background: '#07090b', border: '1.5px solid ' + C.line, padding: '30px 38px', fontFamily: mono, fontSize: 30, lineHeight: 1.55 }}>
            <div style={{ color: C.dim }}>$ npx tsx scripts/payout-proof.ts 1795735156066</div>
            <Rise at={c2 + 10}><div>settled on Solana: <span style={{ color: C.teal }}>true</span> (via Magic Action finalize_raid)</div></Rise>
            <Rise at={c2 + 18}><div>claim: 3Q6nbF5f… <span style={{ color: C.teal }}>ok</span></div></Rise>
            <Rise at={c2 + 26}><div>dUSD  before 8.103408 → after <span style={{ color: C.amber }}>16.143201</span>  (+8.039793)</div></Rise>
            <Rise at={c2 + 40}><div>second claim (simulated): <span style={{ color: C.red, fontWeight: 800 }}>refused</span> · paid only once</div></Rise>
          </div>
          {f >= c3 - 2 && (
            <Rise at={c3} style={{ marginTop: 50 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 26, fontFamily: display, fontWeight: 800, fontSize: 72, textTransform: 'uppercase' }}>
                {[['Payouts', C.teal], ['+', C.dim], ['Reserve', C.amber], ['+', C.dim], ['Fees', C.silver], ['=', C.dim], ['Stakes', C.text]].map(([t, c], i) => <Rise key={i} at={c3 + i * 5}><span style={{ color: c as string }}>{t}</span></Rise>)}
                <Rise at={c3 + 40}><span style={{ color: C.teal, fontSize: 90 }}>✓</span></Rise>
              </div>
              <Rise at={c3 + 30}><div style={{ fontFamily: mono, fontSize: 26, color: C.dim, marginTop: 14 }}>asserted in the program at settlement · shown on every report</div></Rise>
            </Rise>
          )}
        </Rise>
      )}
    </Shell>
  )
}

// ---------------- 8. STACK: MagicBlock end to end ----------------
function Node({ x, y, w = 330, title, sub, color, a }: { x: number; y: number; w?: number; title: string; sub: string; color: string; a: number }) {
  const s = useSpring(a)
  const f = useCurrentFrame()
  if (f < a - 1) return null
  return (
    <div style={{ position: 'absolute', left: x, top: y, width: w, transform: `scale(${0.8 + 0.2 * s})`, opacity: Math.min(1, s), background: 'rgba(16,21,26,.96)', border: `2px solid ${color}`, padding: '16px 20px', boxShadow: `0 0 40px ${color}33` }}>
      <div style={{ fontFamily: display, fontWeight: 800, fontSize: 34, color, textTransform: 'uppercase', letterSpacing: 1 }}>{title}</div>
      <div style={{ fontFamily: body, fontSize: 20, color: C.silver, marginTop: 6 }}>{sub}</div>
    </div>
  )
}
function Edge({ x1, y1, x2, y2, a, color }: { x1: number; y1: number; x2: number; y2: number; a: number; color: string }) {
  const f = useCurrentFrame()
  const k = interpolate(f, [a, a + 14], [0, 1], { ...clamp, easing: ease })
  const t = ((f - a) % 40) / 40
  if (f < a) return null
  return (
    <svg style={{ position: 'absolute', inset: 0, overflow: 'visible' }} width={1920} height={1080}>
      <line x1={x1} y1={y1} x2={x1 + (x2 - x1) * k} y2={y1 + (y2 - y1) * k} stroke={color} strokeWidth={3} strokeDasharray="10 8" opacity={0.8} />
      {k >= 1 && <circle cx={x1 + (x2 - x1) * t} cy={y1 + (y2 - y1) * t} r={8} fill={color} />}
    </svg>
  )
}
function Stack() {
  const s = S.stack
  const c = (i: number) => cap('stack', i)
  return (
    <Shell s={s} tint={C.teal}>
      <div style={{ position: 'absolute', left: 150, top: 110 }}><Kicker at={4} color={C.teal}>MagicBlock · end to end</Kicker></div>
      <Node x={795} y={430} w={330} a={c(1)} color={C.teal} title="Private ER · TEE" sub="Fog of war, sealed loot, private backpacks" />
      <Node x={160} y={250} a={c(0) + 6} color={C.amber} title="Player wallet" sub="1 signature: stake 10 dUSD" />
      <Node x={1430} y={250} a={c(2)} color={C.violet} title="VRF" sub="Spawns, crates, exits, events, the day" />
      <Node x={1430} y={620} a={c(3)} color={C.teal} title="Pricing Oracle" sub="SOL · BTC · ETH · NVDA · TSLA" />
      <Node x={160} y={620} a={c(4)} color={C.amber} title="Session key" sub="Signs every move · zero popups" />
      <Node x={795} y={790} w={330} a={c(5)} color={C.violet} title="Magic Action" sub="Commit + finalize_raid on Solana" />
      <Edge x1={490} y1={300} x2={795} y2={470} a={c(1) + 4} color={C.amber} />
      <Edge x1={1430} y1={300} x2={1125} y2={470} a={c(2) + 4} color={C.violet} />
      <Edge x1={1430} y1={670} x2={1125} y2={520} a={c(3) + 4} color={C.teal} />
      <Edge x1={490} y1={670} x2={795} y2={520} a={c(4) + 4} color={C.amber} />
      <Edge x1={960} y1={560} x2={960} y2={790} a={c(5) + 4} color={C.violet} />
    </Shell>
  )
}

// ---------------- 9. WORLD: modes, picks, THE WIRE ----------------
const WIRE = ['Shots fired: BOT 4 under fire, down to 66 HP', 'MARKET CRASH: Harbor floor caves in, hazard zone doubled', 'BOT 5 drops Raider 2, backpack on the floor', 'Factory rips +0.5% in 30s, +0.1% on the raid']
function World() {
  const s = S.world; const f = useCurrentFrame()
  const c1 = cap('world', 1), c2 = cap('world', 2)
  return (
    <Shell s={s}>
      {f < c1 + 4 && (
        <div style={{ position: 'absolute', left: 150, top: 240, display: 'flex', gap: 40 }}>
          {[['Mystery Market', 'A real past day · revealed & proven', C.amber], ['Live Crypto', 'SOL · BTC · ETH via the oracle', C.teal], ['Live Markets', 'NVDA · TSLA · SOL', C.amber]].map(([t, d, col], i) => (
            <Rise key={t} at={4 + i * 8}><div style={{ width: 500, height: 330, padding: 34, background: 'rgba(16,21,26,.95)', borderTop: `4px solid ${col}`, border: `1.5px solid ${C.line}` }}>
              <div style={{ fontFamily: display, fontWeight: 800, fontSize: 56, color: col as string, textTransform: 'uppercase' }}>{t}</div>
              <div style={{ fontFamily: body, fontSize: 28, color: C.silver, marginTop: 14 }}>{d}</div>
              <div style={{ marginTop: 34 }}><PriceLine w={430} h={90} seed={i * 31 + 5} trend={i === 0 ? -1 : i === 1 ? 0.8 : 0.3} at={6 + i * 8} color={col as string} /></div>
            </div></Rise>
          ))}
        </div>
      )}
      {f >= c1 && f < c2 + 4 && (
        <>
          <Rise at={c1} style={{ position: 'absolute', left: 150, top: 130 }}>
            <div style={{ width: 1000, height: 750, overflow: 'hidden', border: `1.5px solid ${C.line}` }}><Img src={staticFile('shots/live-picks-watch.jpg')} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${interpolate(f, [c1, c2], [1.02, 1.12])})`, transformOrigin: '20% 30%' }} /></div>
          </Rise>
          <Callout at={c1 + 10} x={1220} y={300} w={560} title="On-chain picks" sub="Who extracts? Which district cracks next? A knockout in 30 s? Locked by the program's clock, resolved from public state." color={C.teal} align="right" />
        </>
      )}
      {f >= c2 && (
        <AbsoluteFill>
          <div style={{ position: 'absolute', left: 150, top: 170 }}><Kicker at={c2} color={C.red}>THE WIRE · AI newsroom</Kicker></div>
          {WIRE.map((t, i) => (
            <Rise key={t} at={c2 + 10 + i * 12} style={{ position: 'absolute', left: 150, top: 290 + i * 120, width: 1620 }}>
              <div style={{ display: 'flex', alignItems: 'stretch', background: 'rgba(16,21,26,.95)' }}>
                <div style={{ padding: '18px 26px', background: i === 1 ? C.amber : C.red, color: '#10151a', fontFamily: display, fontWeight: 800, fontSize: 30, letterSpacing: 3 }}>{i === 1 ? 'IN-GAME EVENT' : 'BREAKING'}</div>
                <div style={{ padding: '18px 28px', fontFamily: body, fontWeight: 600, fontSize: 34 }}>{t}</div>
              </div>
            </Rise>
          ))}
          <Rise at={c2 + 70} style={{ position: 'absolute', right: 150, top: 175 }}><div style={{ fontFamily: mono, fontSize: 26, color: C.teal }}>public facts only · never a permission member</div></Rise>
        </AbsoluteFill>
      )}
    </Shell>
  )
}

// ---------------- 10. PROOF: numbers + the on-chain trail ----------------
function Proof() {
  const s = S.proof
  const c = (i: number) => cap('proof', i)
  const Big = ({ a, n, label, color }: { a: number; n: React.ReactNode; label: string; color: string }) => (
    <Rise at={a}><div style={{ marginBottom: 34 }}><div style={{ fontFamily: display, fontWeight: 800, fontSize: 130, color, lineHeight: 1 }}>{n}</div><div style={{ fontFamily: display, fontWeight: 700, fontSize: 34, color: C.silver, textTransform: 'uppercase', letterSpacing: 3 }}>{label}</div></div></Rise>
  )
  return (
    <Shell s={s} tint={C.amber}>
      <div style={{ position: 'absolute', left: 150, top: 130 }}>
        <Big a={c(0)} n={<Count from={c(0)} to={c(0) + 40} a={0} b={34} />} label="raids settled on devnet" color={C.amber} />
        <Big a={c(1)} n={<><Count from={c(1)} to={c(1) + 40} a={0} b={28} />/28</>} label="program tests passing" color={C.teal} />
        <Rise at={c(2)}><div style={{ padding: '18px 26px', border: '2px solid ' + C.amber, fontFamily: display, fontWeight: 800, fontSize: 40, textTransform: 'uppercase', letterSpacing: 2, width: 640 }}>No setup · the game pays your join fee</div></Rise>
      </div>
      <Phone src="ex-delegate.jpg" x={820} y={190} h={640} at={8} tilt={-8} marks={[{ at: 30, x: 48, y: 122, w: 330, h: 52, color: C.violet }]} caption="1 · delegate to MagicBlock" />
      <Phone src="ex-commit-logs.jpg" x={1140} y={160} h={680} at={16} marks={[{ at: 40, x: 28, y: 348, w: 362, h: 82 }]} caption="2 · settle via Magic Action" />
      <Phone src="ex-claim-tokens.jpg" x={1470} y={190} h={640} at={24} tilt={8} marks={[{ at: 50, x: 228, y: 228, w: 152, h: 56, color: C.teal }]} caption="3 · paid to the wallet" />
    </Shell>
  )
}

// ---------------- 11. CTA ----------------
function Cta() {
  const s = S.cta
  return (
    <Shell s={s}>
      <AbsoluteFill style={{ opacity: 0.35 }}><Screen src="title.mp4" from={3} x={0} y={0} w={1920} /></AbsoluteFill>
      <AbsoluteFill style={{ background: 'radial-gradient(circle at 50% 45%, rgba(7,9,11,.55), rgba(7,9,11,.95) 70%)' }} />
      <AbsoluteFill style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 30, marginTop: -60 }}>
        <Wordmark at={4} size={240} />
        <Rise at={18}><div style={{ fontFamily: display, fontWeight: 700, fontSize: 50, letterSpacing: 24, color: C.silver }}>RAID · TRADE · EXTRACT</div></Rise>
        <Rise at={40}><div style={{ marginTop: 20, padding: '18px 40px', background: C.amber, color: '#10151a', fontFamily: display, fontWeight: 800, fontSize: 64, letterSpacing: 4 }}>razkyn.vercel.app</div></Rise>
        <Rise at={58}><div style={{ fontFamily: mono, fontSize: 26, color: C.dim }}>Built on MagicBlock · Solana devnet · program CTJGR8bj…ox97</div></Rise>
      </AbsoluteFill>
    </Shell>
  )
}

const SCENES: Record<string, React.FC> = { hook: Hook, intro: Intro, join: Join, loot: Loot, fight: Fight, extract: Extract, settle: Settle, stack: Stack, world: World, proof: Proof, cta: Cta }
export const Razkyn: React.FC = () => (
  <AbsoluteFill style={{ background: C.bg }}>
    {tl.scenes.map((s) => { const Comp = SCENES[s.id]; return <Sequence key={s.id} from={s.start} durationInFrames={s.dur}><Comp /></Sequence> })}
    <Audio src={staticFile('music.mp3')} volume={(f) => interpolate(f, [0, 30, tl.total - 90, tl.total], [0, 0.11, 0.11, 0], clamp)} />
  </AbsoluteFill>
)
