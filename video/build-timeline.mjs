// Build src/timeline.json from the voice-over: scene lengths from each line's audio, captions from its cues.
// Copies the audio into public/ so Remotion can play it.
import { readFileSync, writeFileSync, copyFileSync } from 'fs'
import { execFileSync } from 'child_process'
const FPS = 30
const PAD_BEFORE = 6, PAD_AFTER = 14 // frames of air around each line
const lines = JSON.parse(readFileSync('vo/lines.json', 'utf8'))
// Extra hold (frames) after a line, where the picture needs time to land.
const HOLD = { hook: 10, intro: 6, loot: 10, fight: 8, extract: 16, settle: 12, stack: 8, world: 6, proof: 6, cta: 60 }
const t = (s) => { const [h, m, rest] = s.split(':'); const [sec, ms] = rest.split(','); return (+h * 3600 + +m * 60 + +sec + +ms / 1000) }
let start = 0
const scenes = lines.map(([id]) => {
  const dur = parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', `vo/${id}.mp3`]).toString())
  const audioFrames = Math.ceil(dur * FPS)
  const cues = readFileSync(`vo/${id}.vtt`, 'utf8').split(/\r?\n\r?\n/).map((b) => b.trim().split(/\r?\n/)).filter((b) => b.length >= 3)
  const captions = cues.map((b) => { const [a, z] = b[1].split(' --> '); return { from: PAD_BEFORE + Math.round(t(a) * FPS), to: PAD_BEFORE + Math.round(t(z) * FPS), text: b.slice(2).join(' ') } })
  const sceneDur = PAD_BEFORE + audioFrames + PAD_AFTER + (HOLD[id] ?? 0)
  copyFileSync(`vo/${id}.mp3`, `public/${id}.mp3`)
  const s = { id, start, dur: sceneDur, audioFrames, captions }
  start += sceneDur
  return s
})
writeFileSync('src/timeline.json', JSON.stringify({ fps: FPS, total: start, scenes }, null, 1))
console.log(scenes.map((s) => `${s.id.padEnd(8)} ${String(s.start).padStart(5)} +${s.dur}`).join('\n'))
console.log(`TOTAL ${start} frames = ${(start / FPS).toFixed(1)} s`)
