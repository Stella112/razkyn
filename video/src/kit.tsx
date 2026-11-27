import React from 'react'
import { AbsoluteFill, Easing, Img, OffthreadVideo, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'
import { loadFont as loadDisplay } from '@remotion/google-fonts/BarlowCondensed'
import { loadFont as loadBody } from '@remotion/google-fonts/Inter'
import { loadFont as loadMono } from '@remotion/google-fonts/JetBrainsMono'

export const display = loadDisplay('normal', { weights: ['600', '700', '800'], subsets: ['latin'] }).fontFamily
export const body = loadBody('normal', { weights: ['400', '500', '600', '700'], subsets: ['latin'] }).fontFamily
export const mono = loadMono('normal', { weights: ['400', '600', '800'], subsets: ['latin'] }).fontFamily

/** RAZKYN palette (app/src/noir.css). */
export const C = { bg: '#0B0F12', panel: '#10151A', line: 'rgba(200,210,209,0.16)', text: '#E9EEEE', dim: '#8A979A', silver: '#C8D2D1', amber: '#D9AC65', teal: '#45C9B2', red: '#E4514E', violet: '#8C7BF2' }
export const ease = Easing.bezier(0.22, 1, 0.36, 1)
export const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const

export function useSpring(at: number, cfg: { damping?: number; mass?: number; stiffness?: number } = {}) {
  const f = useCurrentFrame(); const { fps } = useVideoConfig()
  return spring({ frame: f - at, fps, config: { damping: 15, mass: 0.7, stiffness: 140, ...cfg } })
}

/** Fade + rise in at `at`; optional fade out at `out`. */
export function Rise({ at = 0, out, dist = 36, children, style }: { at?: number; out?: number; dist?: number; children: React.ReactNode; style?: React.CSSProperties }) {
  const f = useCurrentFrame(); const s = useSpring(at)
  const o = out !== undefined ? interpolate(f, [out, out + 10], [1, 0], clamp) : 1
  if (f < at - 1) return null
  return <div style={{ opacity: Math.min(s, 1) * o, transform: `translateY(${(1 - s) * dist}px)`, ...style }}>{children}</div>
}

/** Night-city background: deep gradient, drifting glow, faint grid and scanlines. */
export function Bg({ tint = C.teal }: { tint?: string }) {
  const f = useCurrentFrame()
  return (
    <AbsoluteFill style={{ background: `radial-gradient(1400px 900px at 70% 10%, #13232a 0%, ${C.bg} 55%, #07090b 100%)`, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: -300 + Math.sin(f / 90) * 80, top: 500 + Math.cos(f / 110) * 60, width: 900, height: 900, borderRadius: '50%', background: tint, filter: 'blur(160px)', opacity: 0.12 }} />
      <div style={{ position: 'absolute', right: -250 + Math.cos(f / 100) * 70, top: -300, width: 800, height: 800, borderRadius: '50%', background: C.amber, filter: 'blur(170px)', opacity: 0.08 }} />
      <AbsoluteFill style={{ backgroundImage: `linear-gradient(${C.line} 1px, transparent 1px), linear-gradient(90deg, ${C.line} 1px, transparent 1px)`, backgroundSize: '80px 80px', opacity: 0.18, transform: `translateY(${(f * 0.4) % 80}px)` }} />
      <AbsoluteFill style={{ backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,.18) 0 2px, transparent 2px 4px)', opacity: 0.35 }} />
    </AbsoluteFill>
  )
}

/** Small uppercase label chip. */
export function Kicker({ at, children, color = C.amber }: { at: number; children: React.ReactNode; color?: string }) {
  return (
    <Rise at={at}>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 14, padding: '10px 22px', border: `1.5px solid ${color}`, color, fontFamily: display, fontWeight: 800, fontSize: 28, letterSpacing: 6, textTransform: 'uppercase', background: 'rgba(11,15,18,.7)' }}>
        <span style={{ width: 10, height: 10, background: color }} />{children}
      </div>
    </Rise>
  )
}

/** Callout card that slides in from the side. */
export function Callout({ at, out, x, y, title, sub, color = C.amber, w = 560, align = 'left' }: { at: number; out?: number; x: number; y: number; title: string; sub?: string; color?: string; w?: number; align?: 'left' | 'right' }) {
  const f = useCurrentFrame(); const s = useSpring(at)
  const o = out !== undefined ? interpolate(f, [out, out + 10], [1, 0], clamp) : 1
  if (f < at - 1) return null
  const dx = (align === 'left' ? -1 : 1) * (1 - s) * 70
  return (
    <div style={{ position: 'absolute', left: x, top: y, width: w, opacity: Math.min(1, s) * o, transform: `translateX(${dx}px)`, background: 'rgba(16,21,26,.92)', borderLeft: `5px solid ${color}`, padding: '18px 24px', boxShadow: '0 30px 60px -20px rgba(0,0,0,.7)', backdropFilter: 'blur(6px)' }}>
      <div style={{ fontFamily: display, fontWeight: 800, fontSize: 38, letterSpacing: 1.5, color: C.text, textTransform: 'uppercase', lineHeight: 1.05 }}>{title}</div>
      {sub && <div style={{ fontFamily: body, fontWeight: 500, fontSize: 22, color: C.silver, marginTop: 8, lineHeight: 1.35 }}>{sub}</div>}
    </div>
  )
}

export type Zoom = { at: number; scale: number; x: number; y: number } // x,y = focus point 0..1 in the clip
/**
 * Framed footage from public/clips. `from` is the second in the source to start at.
 * Slow push-in, optional zoom keyframes to a focus point.
 */
export function Screen({ src, from = 0, x = 160, y = 110, w = 1600, at = 0, zooms = [], label, playbackRate = 1 }: { src: string; from?: number; x?: number; y?: number; w?: number; at?: number; zooms?: Zoom[]; label?: string; playbackRate?: number }) {
  const f = useCurrentFrame(); const { fps } = useVideoConfig(); const s = useSpring(at, { damping: 18 })
  const h = (w * 9) / 16
  // zoom path: base push-in 1 → 1.04; zoom keyframes ease between focus states
  const ks: Zoom[] = [{ at: 0, scale: 1, x: 0.5, y: 0.5 }, ...zooms]
  let cur = ks[0]; let nxt = ks[0]
  for (let i = 0; i < ks.length; i++) if (f >= ks[i].at) { cur = ks[i]; nxt = ks[i + 1] ?? ks[i] }
  const k = nxt === cur ? 1 : interpolate(f, [nxt.at - 18, nxt.at], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) })
  const zc = f >= (nxt.at ?? 0) - 18 && nxt !== cur ? { scale: cur.scale + (nxt.scale - cur.scale) * k, x: cur.x + (nxt.x - cur.x) * k, y: cur.y + (nxt.y - cur.y) * k } : cur
  const push = interpolate(f, [0, 900], [1, 1.05])
  const sc = zc.scale * push
  return (
    <div style={{ position: 'absolute', left: x, top: y + (1 - s) * 60, width: w, height: h, opacity: Math.min(1, s * 1.3), overflow: 'hidden', border: `1.5px solid ${C.line}`, boxShadow: '0 50px 120px -30px rgba(0,0,0,.85), 0 0 0 1px rgba(69,201,178,.12)', background: '#000' }}>
      <div style={{ position: 'absolute', inset: 0, transform: `scale(${sc})`, transformOrigin: `${zc.x * 100}% ${zc.y * 100}%` }}>
        <OffthreadVideo src={staticFile(`clips/${src}`)} startFrom={Math.round(from * fps)} muted playbackRate={playbackRate} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
      {label && <div style={{ position: 'absolute', left: 18, top: 16, padding: '6px 14px', background: 'rgba(11,15,18,.82)', border: `1px solid ${C.line}`, fontFamily: mono, fontSize: 18, color: C.teal, letterSpacing: 1 }}>● {label}</div>}
    </div>
  )
}

const SAY: [RegExp, string][] = [[/Razkin/g, 'RAZKYN'], [/razkyn dot vercel dot app/gi, 'razkyn.vercel.app'], [/V R F/g, 'VRF'], [/A I/g, 'AI'], [/on chain/g, 'on-chain'], [/devnet dollars/g, 'devnet dUSD']]
/** Captions with a moving word highlight. */
export function Captions({ caps }: { caps: { from: number; to: number; text: string }[] }) {
  const f = useCurrentFrame()
  const c = caps.find((c) => f >= c.from && f < c.to + 6)
  if (!c) return null
  let t = c.text; for (const [a, b] of SAY) t = t.replace(a, b)
  const words = t.split(' '); const span = Math.max(1, c.to - c.from)
  const o = interpolate(f, [c.from, c.from + 5, c.to, c.to + 6], [0, 1, 1, 0], clamp)
  return (
    <div style={{ position: 'absolute', bottom: 40, left: 0, right: 0, display: 'flex', justifyContent: 'center', opacity: o, zIndex: 50 }}>
      <div style={{ maxWidth: 1500, padding: '12px 28px', background: 'rgba(7,9,11,.86)', borderTop: `2px solid ${C.amber}`, color: C.text, fontFamily: body, fontSize: 32, fontWeight: 600, textAlign: 'center', lineHeight: 1.32 }}>
        {words.map((w, i) => { const wt = c.from + (i / words.length) * span; const on = f >= wt && f < wt + span / words.length + 3; return <span key={i} style={{ opacity: f >= wt ? 1 : 0.5, color: on ? C.amber : C.text }}>{w} </span> })}
      </div>
    </div>
  )
}

/** Count from a to b. */
export function Count({ from, to, a, b, decimals = 0, prefix = '', suffix = '' }: { from: number; to: number; a: number; b: number; decimals?: number; prefix?: string; suffix?: string }) {
  const f = useCurrentFrame(); const v = interpolate(f, [from, to], [a, b], { ...clamp, easing: ease })
  return <>{prefix}{v.toFixed(decimals)}{suffix}</>
}

/** The RAZKYN wordmark with its red slash, as on the title screen. */
export function Wordmark({ at = 0, size = 220 }: { at?: number; size?: number }) {
  const f = useCurrentFrame(); const s = useSpring(at, { damping: 12, stiffness: 160 })
  const slash = interpolate(f, [at + 10, at + 22], [0, 1], { ...clamp, easing: ease })
  if (f < at - 1) return null
  return (
    <div style={{ position: 'relative', display: 'inline-block', transform: `scale(${0.85 + 0.15 * s})`, opacity: Math.min(1, s * 1.4) }}>
      <div style={{ position: 'absolute', left: -size * 0.12, top: size * 0.06, width: size * 0.045, height: size * 0.95, background: C.amber }} />
      <div style={{ fontFamily: display, fontWeight: 800, fontSize: size, letterSpacing: size * 0.02, color: C.text, lineHeight: 1 }}>RAZKYN</div>
      <div style={{ position: 'absolute', left: -size * 0.04, top: size * 0.47, height: size * 0.05, width: `${slash * 112}%`, background: C.red, transform: 'rotate(-4deg)', transformOrigin: 'left' }} />
    </div>
  )
}

export type Mark = { at: number; x: number; y: number; w: number; h: number; color?: string } // box in source-image px
/**
 * A phone showing a real screenshot (e.g. Solana Explorer, mobile layout, 429×777 px), with optional
 * vertical pan and highlight boxes drawn over exact lines.
 */
export function Phone({ src, x, y, h = 820, at = 0, marks = [], tilt = 0, srcW = 429, srcH = 777, caption }: { src: string; x: number; y: number; h?: number; at?: number; marks?: Mark[]; tilt?: number; srcW?: number; srcH?: number; caption?: string }) {
  const f = useCurrentFrame(); const s = useSpring(at, { damping: 17 })
  const k = h / srcH; const w = srcW * k
  if (f < at - 1) return null
  return (
    <div style={{ position: 'absolute', left: x, top: y + (1 - s) * 120, opacity: Math.min(1, s * 1.3), transform: `perspective(1800px) rotateY(${tilt}deg)` }}>
      <div style={{ width: w + 26, height: h + 26, padding: 13, borderRadius: 46, background: '#0d1114', boxShadow: '0 50px 110px -25px rgba(0,0,0,.9), 0 0 0 2px #2a333a inset' }}>
        <div style={{ position: 'relative', width: w, height: h, borderRadius: 34, overflow: 'hidden', background: '#000' }}>
          <Img src={staticFile(`shots/${src}`)} style={{ position: 'absolute', left: 0, top: 0, width: w, height: h }} />
          {marks.map((m, i) => {
            const p = interpolate(f, [m.at, m.at + 10], [0, 1], { ...clamp, easing: ease })
            if (f < m.at) return null
            const col = m.color ?? C.amber
            return <div key={i} style={{ position: 'absolute', left: m.x * k - 4, top: m.y * k - 4, width: (m.w * k + 8) * p, height: m.h * k + 8, border: `3px solid ${col}`, borderRadius: 8, boxShadow: `0 0 0 9999px rgba(0,0,0,${0.35 * p}), 0 0 28px ${col}` }} />
          })}
        </div>
      </div>
      {caption && <div style={{ marginTop: 14, textAlign: 'center', fontFamily: mono, fontSize: 20, color: C.dim }}>{caption}</div>}
    </div>
  )
}

/** Simple animated price line (seeded), for districts. */
export function PriceLine({ w, h, seed, trend, at, color }: { w: number; h: number; seed: number; trend: number; at: number; color: string }) {
  const f = useCurrentFrame()
  const n = 60; const pts: string[] = []
  const shown = Math.max(2, Math.min(n, Math.floor((f - at) * 0.9)))
  let v = h * 0.5; let r = seed
  for (let i = 0; i < shown; i++) { r = (r * 9301 + 49297) % 233280; v += ((r / 233280) - 0.5) * 14 - trend * 1.1; v = Math.max(6, Math.min(h - 6, v)); pts.push(`${(i / (n - 1)) * w},${v}`) }
  return <svg width={w} height={h} style={{ overflow: 'visible' }}><polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth={4} strokeLinejoin="round" /></svg>
}
