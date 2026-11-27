// WebAudio synth for game feedback and a procedural soundtrack (no audio files, nothing licensed).
// Sound and music on/off are per-viewer preferences. Browsers start audio only after a user gesture.
let ctx: AudioContext | null = null;
let master: GainNode | null = null; // everything → master → compressor → speakers
const pref = (k: string) => { try { return window.localStorage.getItem(k); } catch { return null; } }
const save = (k: string, v: string) => { try { window.localStorage.setItem(k, v); } catch { /* storage blocked */ } };
let muted = pref("razkyn-muted") === "1";
let musicOn = pref("razkyn-music") !== "0";

function ac(): AudioContext | null {
  if (muted) return null;
  try {
    if (!ctx) {
      ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
      master = ctx.createGain(); master.gain.value = 0.9;
      master.connect(comp).connect(ctx.destination);
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch { return null; }
}
const out = () => master!;

function tone(freq: number, dur: number, type: OscillatorType = "square", vol = 0.06, slideTo?: number, delay = 0, dest?: AudioNode) {
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(dest ?? out()); o.start(t0); o.stop(t0 + dur + 0.02);
}

let noiseBuf: AudioBuffer | null = null;
function noise(dur: number, vol: number, filter: BiquadFilterType, freq: number, delay = 0, q = 0.8, dest?: AudioNode) {
  const a = ac();
  if (!a) return;
  if (!noiseBuf) { noiseBuf = a.createBuffer(1, a.sampleRate * 2, a.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const t0 = a.currentTime + delay;
  const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  s.buffer = noiseBuf; f.type = filter; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(f).connect(g).connect(dest ?? out()); s.start(t0, Math.random()); s.stop(t0 + dur + 0.02);
}

// ---------------- Procedural soundtrack ----------------
// Dark synth pulse in A minor, 100 BPM, scheduled ahead on the audio clock. Intensity:
// 0 = lobby / calm (pad + bass), 1 = raid live (+ kick, hats), 2 = exit window / last minute (+ arp lead, faster hats).
const BPM = 100, STEP = 60 / BPM / 4; // 16th notes
const PROG: number[][] = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [52, 56, 59]]; // Am F C E (MIDI)
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
let musicGain: GainNode | null = null;
let timer: number | null = null;
let nextT = 0, step = 0, intensity = 0;
function scheduleStep(t: number, s: number) {
  const a = ctx!; const mg = musicGain!;
  const bar = Math.floor(s / 16) % PROG.length, chord = PROG[bar], i16 = s % 16;
  // pad: re-voiced at each bar
  if (i16 === 0) chord.forEach((m) => { const o = a.createOscillator(), g = a.createGain(), f = a.createBiquadFilter(); o.type = 'sawtooth'; o.frequency.value = mtof(m - 12); o.detune.value = (Math.random() - 0.5) * 14; f.type = 'lowpass'; f.frequency.value = 900; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.035, t + 0.6); g.gain.linearRampToValueAtTime(0.0001, t + STEP * 16); o.connect(f).connect(g).connect(mg); o.start(t); o.stop(t + STEP * 16 + 0.05) })
  // bass: driving 8ths with a filter pluck
  if (i16 % 2 === 0) { const m = chord[0] - 24 + (i16 % 8 === 6 ? 12 : 0); const o = a.createOscillator(), f = a.createBiquadFilter(), g = a.createGain(); o.type = 'sawtooth'; o.frequency.value = mtof(m); f.type = 'lowpass'; f.Q.value = 6; f.frequency.setValueAtTime(1400, t); f.frequency.exponentialRampToValueAtTime(160, t + STEP * 1.8); g.gain.setValueAtTime(0.11, t); g.gain.exponentialRampToValueAtTime(0.0001, t + STEP * 1.9); o.connect(f).connect(g).connect(mg); o.start(t); o.stop(t + STEP * 2) }
  if (intensity >= 1) {
    if (i16 % 4 === 0) { const o = a.createOscillator(), g = a.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.16); g.gain.setValueAtTime(0.32, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24); o.connect(g).connect(mg); o.start(t); o.stop(t + 0.26) }
    if (i16 % 4 === 2 || (intensity >= 2 && i16 % 2 === 1)) noise(0.05, intensity >= 2 ? 0.05 : 0.04, 'highpass', 7000, t - a.currentTime, 0.7, mg)
    if (i16 === 12 && bar % 2 === 1) noise(0.18, 0.07, 'bandpass', 1800, t - a.currentTime, 1.2, mg) // snare-ish accent
  }
  if (intensity >= 2 && i16 % 2 === 0) { const arp = [chord[0], chord[1], chord[2], chord[1] + 12]; const m = arp[(i16 / 2) % 4] + 12; const o = a.createOscillator(), g = a.createGain(); o.type = 'square'; o.frequency.value = mtof(m); g.gain.setValueAtTime(0.022, t); g.gain.exponentialRampToValueAtTime(0.0001, t + STEP * 1.6); o.connect(g).connect(mg); o.start(t); o.stop(t + STEP * 1.7) }
}
function scheduler() {
  const a = ctx; if (!a || !musicGain) return;
  while (nextT < a.currentTime + 0.25) { scheduleStep(nextT, step); nextT += STEP; step++ }
}
const music = {
  get on() { return musicOn; },
  start() {
    if (!musicOn || timer !== null) return;
    const a = ac(); if (!a) return;
    musicGain = a.createGain(); musicGain.gain.setValueAtTime(0.0001, a.currentTime); musicGain.gain.linearRampToValueAtTime(0.55, a.currentTime + 2.5); musicGain.connect(out());
    nextT = a.currentTime + 0.1; step = 0
    timer = window.setInterval(scheduler, 60)
  },
  stop() {
    if (timer !== null) { window.clearInterval(timer); timer = null }
    if (musicGain && ctx) { const g = musicGain; g.gain.cancelScheduledValues(ctx.currentTime); g.gain.setValueAtTime(g.gain.value, ctx.currentTime); g.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.8); setTimeout(() => g.disconnect(), 1000) }
    musicGain = null
  },
  setIntensity(n: number) { intensity = n },
  get running() { return timer !== null && !!ctx && ctx.state === "running" },
  get level() { return intensity },
  toggle() { musicOn = !musicOn; save("razkyn-music", musicOn ? "1" : "0"); if (musicOn) music.start(); else music.stop(); return musicOn },
};

export const sfx = {
  get muted() { return muted; },
  /** Call inside a click handler: browsers only start audio after a user gesture. */
  unlock() { ac(); },
  toggle() { muted = !muted; save("razkyn-muted", muted ? "1" : "0"); if (muted) music.stop(); return muted; },
  music,
  shot() { noise(0.12, 0.35, 'bandpass', 1400, 0, 0.9); tone(160, 0.12, "square", 0.14, 50); },
  /** Gunfire from another raider in view (not you): a little softer. */
  gunfire() { noise(0.1, 0.22, 'bandpass', 1100, 0, 0.9); tone(120, 0.1, "square", 0.08, 45); },
  hit() { tone(140, 0.3, "square", 0.2, 50); noise(0.2, 0.25, 'lowpass', 600); },
  loot() { [660, 880, 1320].forEach((f, i) => tone(f, 0.16, "triangle", 0.16, undefined, i * 0.07)); },
  open() { tone(320, 0.5, "sine", 0.1, 640); noise(0.5, 0.05, 'bandpass', 2500, 0, 2); },
  trade() { tone(520, 0.12, "square", 0.09); tone(780, 0.12, "square", 0.09, undefined, 0.11); },
  extract() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.24, "triangle", 0.17, undefined, i * 0.09)); },
  deny() { tone(200, 0.14, "square", 0.12, 150); },
  peek() { tone(1200, 0.06, "square", 0.08); tone(300, 0.22, "sawtooth", 0.1, 120, 0.06); },
  tick() { tone(1000, 0.04, "square", 0.06); },
  /** A district cracks into hazard. */
  rumble() { noise(1.4, 0.4, 'lowpass', 180, 0, 1.5); tone(55, 1.2, "sine", 0.25, 32); },
  /** An exit window opens. */
  horn() { tone(220, 0.9, "sawtooth", 0.12, 233); tone(330, 0.9, "sawtooth", 0.08, 349); noise(0.9, 0.04, 'bandpass', 900) },
  /** THE WIRE breaking-news sting. */
  sting() { [988, 784, 659].forEach((f, i) => tone(f, 0.14, "square", 0.07, undefined, i * 0.09)); },
  /** Low-health heartbeat (two thumps). */
  heartbeat() { tone(70, 0.12, "sine", 0.35, 45); tone(62, 0.14, "sine", 0.28, 40, 0.2); },
};

// Inspection in tests (e.g. is the soundtrack running?), like window.__razkyn3d.
(window as unknown as { __razkynSfx?: typeof sfx }).__razkynSfx = sfx;
