// Tiny WebAudio synth for game feedback (no audio files). Muted state is a per-viewer preference.
let ctx: AudioContext | null = null;
let muted = (() => { try { return window.localStorage.getItem("razkyn-muted") === "1"; } catch { return false; } })();

function ac(): AudioContext | null {
  if (muted) return null;
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch { return null; }
}

function tone(freq: number, dur: number, type: OscillatorType = "square", vol = 0.06, slideTo?: number, delay = 0) {
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(a.destination); o.start(t0); o.stop(t0 + dur + 0.02);
}

export const sfx = {
  get muted() { return muted; },
  /** Call inside a click handler: browsers only start audio after a user gesture. */
  unlock() { ac(); },
  toggle() { muted = !muted; try { window.localStorage.setItem("razkyn-muted", muted ? "1" : "0"); } catch { /* ignore */ } return muted; },
  shot() { tone(880, 0.08, "sawtooth", 0.05, 220); },
  hit() { tone(140, 0.25, "square", 0.08, 60); },
  loot() { [660, 880, 1320].forEach((f, i) => tone(f, 0.12, "triangle", 0.07, undefined, i * 0.07)); },
  open() { tone(320, 0.5, "sine", 0.03, 640); },
  trade() { tone(520, 0.1, "square", 0.04); tone(780, 0.1, "square", 0.04, undefined, 0.1); },
  extract() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, "triangle", 0.08, undefined, i * 0.09)); },
  deny() { tone(200, 0.12, "square", 0.05, 150); },
  peek() { tone(1200, 0.05, "square", 0.04); tone(300, 0.2, "sawtooth", 0.05, 120, 0.06); },
  tick() { tone(1000, 0.03, "square", 0.025); },
};
