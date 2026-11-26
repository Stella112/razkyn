// Phaser map for a raid — neon night market (CLAUDE.md §8 "Look": dark trading floor at night; a
// rising district glows green and its crates shimmer; a falling one flickers red and its floor
// cracks; soft fog around the player; exposed trades, muzzle flashes and deaths show through it).
import Phaser from "phaser";
import {
  DISTRICT_TILES, EXITS, HAZARD_ROWS, MAP_H, MAP_W, NUM_CRATES, TERMINALS, UNIT, VISION_TILES, changeBps,
  type PublicState,
} from "../lib/chain";

export const T = 24; // px per tile
const W = MAP_W * T, H = MAP_H * T;
const COL = {
  magenta: 0xff2bd6, cyan: 0x22f2ff, acid: 0xb6ff3b, up: 0x3dffa0, down: 0xff3b6b, amber: 0xffc53d, violet: 0x9b7bff,
  white: 0xf2ecff, floor: 0x07051a,
};
const DCOL = [COL.cyan, COL.amber, COL.up]; // Tower, Factory, Harbor
const DNAME_BY_MODE: Record<number, string[]> = { 2: ["NVDA TOWER", "TSLA FACTORY", "GOLD VAULT"] };
const dname = (mode: number | undefined) => DNAME_BY_MODE[mode ?? 0] ?? ["TOWER", "FACTORY", "HARBOR"];
const px = (u: number) => (u / UNIT) * T;

export type Visible = { slot: number; x: number; y: number };
export type SceneInput = {
  watch: boolean;
  mySlot: number;
  pub: PublicState | null;
  me: { x: number; y: number; alive: boolean } | null;
  visible: Visible[];
  /** Planned local moves since the last position read (units), for smooth prediction. */
  pending: { dx: number; dy: number };
};

export class RaidScene extends Phaser.Scene {
  input_!: SceneInput;
  private dyn!: Phaser.GameObjects.Graphics;
  private glow!: Phaser.GameObjects.Graphics;
  private top!: Phaser.GameObjects.Graphics;
  private fog!: Phaser.GameObjects.RenderTexture;
  private brush!: Phaser.GameObjects.Image;
  private labels: Phaser.GameObjects.Text[] = [];
  private dLabels: Phaser.GameObjects.Text[] = [];
  private embers: Phaser.GameObjects.Particles.ParticleEmitter[] = [];
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private trail: { x: number; y: number; a: number }[] = [];
  private keys!: Record<"W" | "A" | "S" | "D" | "UP" | "LEFT" | "DOWN" | "RIGHT", Phaser.Input.Keyboard.Key>;
  private display = { x: 0, y: 0, init: false, ang: 0 };
  private flashes: { x1: number; y1: number; x2: number; y2: number; until: number }[] = [];
  private rip: { x: number; y: number; start: number; ms: number } | null = null;
  stick = { x: 0, y: 0 };
  onShootAt: (wx: number, wy: number) => void = () => {};
  onInteract: () => void = () => {};
  onExtract: (down: boolean) => void = () => {};

  constructor() { super("raid"); }

  create() {
    this.cameras.main.setBackgroundColor("#04020f");
    // Textures: a soft glow dot (particles) and the fog brush.
    const dot = this.textures.createCanvas("dot", 32, 32)!;
    const dc = dot.getContext();
    const dg = dc.createRadialGradient(16, 16, 0, 16, 16, 16);
    dg.addColorStop(0, "rgba(255,255,255,1)"); dg.addColorStop(0.35, "rgba(255,255,255,0.7)"); dg.addColorStop(1, "rgba(255,255,255,0)");
    dc.fillStyle = dg; dc.fillRect(0, 0, 32, 32); dot.refresh();
    const tex = this.textures.createCanvas("fogbrush", 512, 512)!;
    const ctx = tex.getContext();
    const g = ctx.createRadialGradient(256, 256, 60, 256, 256, 256);
    g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.65, "rgba(255,255,255,0.9)"); g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, 512, 512); tex.refresh();

    this.drawFloor();
    this.glow = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    this.dyn = this.add.graphics();
    // Hazard embers per district (on while that district's floor is cracked).
    DISTRICT_TILES.forEach(([lo, hi], d) => {
      const em = this.add.particles(0, 0, "dot", {
        x: { min: lo * T, max: (hi + 1) * T }, y: { min: 12 * T, max: 28 * T },
        lifespan: 1400, speedY: { min: -40, max: -12 }, speedX: { min: -8, max: 8 }, scale: { start: 0.35, end: 0 },
        alpha: { start: 0.9, end: 0 }, tint: [COL.down, COL.amber], blendMode: "ADD", frequency: 60, emitting: false,
      });
      em.setDepth(2);
      this.embers[d] = em;
    });
    this.sparks = this.add.particles(0, 0, "dot", {
      lifespan: 700, speed: { min: 60, max: 220 }, scale: { start: 0.55, end: 0 }, alpha: { start: 1, end: 0 }, blendMode: "ADD", emitting: false,
    });
    this.sparks.setDepth(13);
    this.brush = this.make.image({ key: "fogbrush", add: false });
    this.fog = this.add.renderTexture(0, 0, W, H).setOrigin(0, 0).setDepth(10);
    this.top = this.add.graphics().setDepth(11).setBlendMode(Phaser.BlendModes.ADD);
    for (let s = 0; s < 8; s++) {
      this.labels.push(this.add.text(0, 0, "", { fontFamily: "Bungee", fontSize: "11px", color: "#f2ecff" }).setDepth(12).setOrigin(0.5, 2).setVisible(false));
    }
    const kb = this.input.keyboard!;
    this.keys = kb.addKeys("W,A,S,D,UP,LEFT,DOWN,RIGHT") as typeof this.keys;
    kb.on("keydown-E", () => this.onInteract());
    kb.on("keydown-SPACE", () => this.onExtract(true));
    kb.on("keyup-SPACE", () => this.onExtract(false));
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (this.input_?.watch) return;
      this.onShootAt((p.worldX / T) * UNIT, (p.worldY / T) * UNIT);
    });
    this.scale.on("resize", () => this.fitCamera());
    this.fitCamera();
  }

  private fitCamera() {
    const cam = this.cameras.main;
    const zw = this.scale.width / W, zh = (this.scale.height - 48) / H;
    if (this.input_?.watch) {
      cam.setZoom(Math.min(zw, zh)); cam.centerOn(W / 2, H / 2);
    } else {
      cam.setZoom(Math.max(Math.min(zw, zh), this.scale.width / (24 * T)));
      cam.setBounds(-T * 4, -T * 4, W + T * 8, H + T * 8);
    }
  }

  /** Static floor art: district themes, corridors, terminals, labels. */
  private drawFloor() {
    const f = this.add.graphics();
    f.fillStyle(COL.floor, 1).fillRect(0, 0, W, H);
    DISTRICT_TILES.forEach(([lo, hi], d) => {
      const x0 = lo * T, w = (hi - lo + 1) * T, col = DCOL[d];
      f.fillStyle(col, 0.05).fillRect(x0, 0, w, H);
      f.lineStyle(1, col, 0.1);
      if (d === 0) { // Tower: glass panels
        for (let x = x0; x <= x0 + w; x += T * 2) f.lineBetween(x, 0, x, H);
        for (let y = 0; y <= H; y += T * 2) f.lineBetween(x0, y, x0 + w, y);
        for (let i = 0; i < 9; i++) { const bx = x0 + ((i * 7) % (hi - lo - 3)) * T + T, by = ((i * 11) % (MAP_H - 6)) * T + T; f.lineStyle(1.5, col, 0.22).strokeRect(bx, by, T * 3, T * 3); }
      } else if (d === 1) { // Factory: hazard stripes + pipes
        for (let y = 0; y < H; y += T) f.lineBetween(x0, y, x0 + w, y);
        f.lineStyle(2, col, 0.16);
        for (let i = -H; i < w; i += T * 3) f.lineBetween(x0 + i, H, x0 + i + H * 0.25, 0);
        f.lineStyle(3, col, 0.18).lineBetween(x0, 6 * T, x0 + w, 6 * T).lineBetween(x0, 34 * T, x0 + w, 34 * T);
      } else { // Harbor: container yard
        for (let x = x0; x <= x0 + w; x += T) f.lineBetween(x, 0, x, H);
        for (let i = 0; i < 14; i++) { const bx = x0 + ((i * 5) % (hi - lo - 4)) * T + T, by = ((i * 13) % (MAP_H - 4)) * T + T; f.lineStyle(1.5, col, 0.2).strokeRect(bx, by, T * 4, T * 2); }
      }
      // District border glow + big floor label.
      f.lineStyle(2, col, 0.75).strokeRect(x0 + 1, 1, w - 2, H - 2);
      this.dLabels[d] = this.add.text(x0 + w / 2, H / 2, dname(0)[d], { fontFamily: "Bungee", fontSize: "40px", color: "#ffffff", align: "center", lineSpacing: 6 })
        .setOrigin(0.5).setAlpha(0.08).setDepth(1);
    });
    // Corridors between districts.
    f.fillStyle(0x000000, 0.6).fillRect(21 * T, 0, T, H).fillRect(43 * T, 0, T, H);
    f.lineStyle(1, COL.violet, 0.4).lineBetween(21 * T, 0, 21 * T, H).lineBetween(22 * T, 0, 22 * T, H).lineBetween(43 * T, 0, 43 * T, H).lineBetween(44 * T, 0, 44 * T, H);
    f.lineStyle(3, COL.magenta, 0.7).strokeRect(0, 0, W, H);
    // Terminals: neon kiosks.
    for (const [tx, ty] of TERMINALS) {
      f.fillStyle(COL.cyan, 0.12).fillRoundedRect(tx * T - T, ty * T - T, 3 * T, 3 * T, 8);
      f.lineStyle(2, COL.cyan, 0.9).strokeRoundedRect(tx * T + 2, ty * T + 2, T - 4, T - 4, 5);
      this.add.text(tx * T + T / 2, ty * T - T - 2, "⇄ TRADE", { fontFamily: "Bungee", fontSize: "10px", color: "#22f2ff" }).setOrigin(0.5, 1).setAlpha(0.85).setDepth(1);
    }
    f.setDepth(0);
  }

  /** Movement intent from keys / touch stick: unit vector or null. */
  moveDir(): { x: number; y: number } | null {
    if (!this.keys) return null;
    let x = 0, y = 0;
    if (this.keys.A.isDown || this.keys.LEFT.isDown) x -= 1;
    if (this.keys.D.isDown || this.keys.RIGHT.isDown) x += 1;
    if (this.keys.W.isDown || this.keys.UP.isDown) y -= 1;
    if (this.keys.S.isDown || this.keys.DOWN.isDown) y += 1;
    x += this.stick.x; y += this.stick.y;
    const n = Math.hypot(x, y);
    return n < 0.2 ? null : { x: x / n, y: y / n };
  }

  // ---------- effects (called from the React layer) ----------
  /** Crate-ripping animation for the open channel (shake, cracks spreading, then the seal breaks). */
  startRip(u: { x: number; y: number }, ms: number) { this.rip = { x: px(u.x), y: px(u.y), start: this.time.now, ms }; }
  stopRip() { this.rip = null; }
  flash(fromU: { x: number; y: number }, toU: { x: number; y: number }) {
    this.flashes.push({ x1: px(fromU.x), y1: px(fromU.y), x2: px(toU.x), y2: px(toU.y), until: this.time.now + 140 });
    this.sparks.emitParticleAt(px(fromU.x), px(fromU.y), 6);
    this.cameras.main.shake(90, 0.004);
  }
  hurt() {
    this.cameras.main.shake(160, 0.009);
    this.cameras.main.flash(120, 255, 40, 90, false);
  }
  burst(u: { x: number; y: number }, color = COL.acid, n = 28) {
    this.sparks.setParticleTint(color);
    this.sparks.emitParticleAt(px(u.x), px(u.y), n);
  }
  popText(u: { x: number; y: number }, text: string, color = "#b6ff3b") {
    const t = this.add.text(px(u.x), px(u.y) - 14, text, { fontFamily: "Bungee", fontSize: "18px", color, stroke: "#000", strokeThickness: 4 })
      .setOrigin(0.5).setDepth(14);
    this.tweens.add({ targets: t, y: t.y - 46, alpha: 0, scale: 1.25, duration: 1300, ease: "Cubic.easeOut", onComplete: () => t.destroy() });
  }

  setInput(i: SceneInput) {
    const firstWatch = !this.input_ || this.input_.watch !== i.watch;
    this.input_ = i;
    if (firstWatch && this.cameras?.main) this.fitCamera();
  }

  private chevron(g: Phaser.GameObjects.Graphics, x: number, y: number, ang: number, size: number, color: number, alpha = 1) {
    const p = (a: number, r: number) => ({ x: x + Math.cos(ang + a) * r, y: y + Math.sin(ang + a) * r });
    const a = p(0, size), b = p(2.5, size * 0.85), c = p(Math.PI, size * 0.35), d = p(-2.5, size * 0.85);
    g.fillStyle(color, alpha).fillPoints([a, b, c, d], true);
  }

  /** Vision radius in tiles: 10 for a Scout (class 1), else 8. */
  private vision() {
    const cls = this.input_?.pub?.raid?.classes?.[this.input_.mySlot];
    return cls === 1 ? 10 : VISION_TILES;
  }

  update(time: number) {
    const inp = this.input_;
    const g = this.dyn, gl = this.glow, top = this.top;
    g.clear(); gl.clear(); top.clear();
    if (!inp?.pub?.raid) return;
    const { raid, districts, rpubs, crates } = inp.pub;
    const pulse = 0.5 + 0.5 * Math.sin(time / 260);
    const fast = 0.5 + 0.5 * Math.sin(time / 90);

    // TRADING HALT: the district's terminals glow red while the halt runs.
    const halt = raid.eventKind === 1 && Number(raid.eventUntil?.toString() ?? 0) * 1000 > Date.now() ? raid.eventDistrict : -1;
    if (halt !== undefined && halt >= 0) {
      for (const [tx, ty] of TERMINALS) {
        const d = DISTRICT_TILES.findIndex(([lo, hi]) => tx >= lo && tx <= hi);
        if (d !== halt) continue;
        gl.fillStyle(COL.down, 0.25 + 0.2 * Math.sin(time / 150)).fillRoundedRect(tx * T - T, ty * T - T, 3 * T, 3 * T, 8);
        gl.lineStyle(2, COL.down, 0.9).strokeRoundedRect(tx * T - T, ty * T - T, 3 * T, 3 * T, 8);
      }
    }
    // Districts: glow by direction, cracked hazard rows, embers.
    DISTRICT_TILES.forEach(([lo, hi], d) => {
      const dist = districts[d];
      const bps = changeBps(dist);
      const x0 = lo * T, w = (hi - lo + 1) * T;
      if (bps > 30) gl.fillStyle(COL.up, Math.min(0.06, 0.01 + bps / 12000)).fillRect(x0, 0, w, H);
      if (bps < -30) gl.fillStyle(COL.down, Math.min(0.09, 0.015 - bps / 9000) * (0.7 + 0.3 * fast)).fillRect(x0, 0, w, H);
      this.dLabels[d]?.setText(`${dname(raid.mode)[d]}
${bps >= 0 ? "▲" : "▼"} ${(Math.abs(bps) / 100).toFixed(1)}%`).setColor(bps >= 0 ? "#3dffa0" : "#ff3b6b").setAlpha(0.09 + Math.min(0.12, Math.abs(bps) / 4000));
      const level = dist?.hazardLevel ?? 0;
      const rows = HAZARD_ROWS[level];
      this.embers[d]?.[rows ? "start" : "stop"]();
      if (rows) {
        const y0 = rows[0] * T, h = (rows[1] - rows[0] + 1) * T;
        g.fillStyle(COL.down, 0.14 + 0.1 * pulse).fillRect(x0, y0, w, h);
        g.lineStyle(2, COL.down, 0.75);
        for (let r = rows[0]; r <= rows[1]; r += 2) {
          g.beginPath(); g.moveTo(x0, r * T + T / 2);
          for (let x = x0; x < x0 + w; x += T) g.lineTo(x + T / 2, r * T + ((x / T + r) % 3) * (T / 3));
          g.strokePath();
        }
        gl.lineStyle(6, COL.down, 0.18 + 0.15 * pulse).strokeRect(x0, y0, w, h);
      }
    });

    // Exits: rotating beacons; open ones throw a beam.
    const open = raid.exitWindow ? raid.openExits.filter((e) => e !== 255) : [];
    EXITS.forEach(([ex, ey], e) => {
      const cx = ex * T + T / 2, cy = ey * T + T / 2;
      if (open.includes(e)) {
        const r = T * (1.2 + 0.3 * pulse);
        gl.fillStyle(COL.acid, 0.16).fillCircle(cx, cy, r * 1.8);
        gl.lineStyle(4, COL.acid, 0.9).strokeCircle(cx, cy, r);
        for (let k = 0; k < 6; k++) {
          const a0 = time / 400 + (k * Math.PI) / 3;
          top.lineStyle(3, COL.acid, 0.9).beginPath().arc(cx, cy, r * 1.35, a0, a0 + 0.5).strokePath();
        }
        top.fillStyle(COL.acid, 0.12 + 0.1 * pulse).fillRect(cx - 6, cy - 400, 12, 400);
      } else {
        g.lineStyle(2, 0x3a2f6a, 0.9).strokeCircle(cx, cy, T * 0.9);
      }
    });

    // Crates: positions are public (DECISIONS #16), contents sealed until opened.
    raid.cratePos.forEach((p, i) => {
      if (i >= NUM_CRATES || (p.x === 0 && p.y === 0)) return;
      const c = crates[i];
      const d = Math.floor(i / 12);
      const dormant = i % 12 >= 8 && !districts[d]?.awake;
      const cx = px(p.x), cy = px(p.y);
      if (c && c.state === 1) { g.lineStyle(1, 0x4a3f7a, 0.9).strokeRect(cx - 4, cy - 4, 8, 8); return; }
      if (dormant) { g.lineStyle(1.5, 0x5f5590, 0.8).strokeRect(cx - 5, cy - 5, 10, 10); return; }
      const hot = changeBps(districts[d]) > 200;
      const s = 7 + (hot ? 2 * Math.sin(time / 120 + i) : Math.sin(time / 300 + i));
      gl.fillStyle(COL.amber, hot ? 0.35 : 0.22).fillCircle(cx, cy, s * 2.4);
      g.fillStyle(COL.amber, 1).fillPoints([{ x: cx, y: cy - s }, { x: cx + s, y: cy }, { x: cx, y: cy + s }, { x: cx - s, y: cy }], true);
      g.lineStyle(1.5, 0xffffff, 0.8).strokePoints([{ x: cx, y: cy - s }, { x: cx + s, y: cy }, { x: cx, y: cy + s }, { x: cx - s, y: cy }], true);
    });
    // Drop crates (dead raiders' backpacks): public, violet.
    for (let i = NUM_CRATES; i < crates.length; i++) {
      const c = crates[i];
      if (!c || !c.placed) continue;
      const cx = px(c.x), cy = px(c.y);
      if (c.state === 1) { g.lineStyle(1, 0x4a3f7a, 1).strokeCircle(cx, cy, 6); continue; }
      gl.fillStyle(COL.violet, 0.3).fillCircle(cx, cy, 18 + 3 * pulse);
      top.fillStyle(COL.violet, 0.95).fillCircle(cx, cy, 7);
    }

    // Raiders.
    const shown = new Set<number>();
    this.labels.forEach((l) => l.setVisible(false));
    const label = (s: number, x: number, y: number, text: string, color: string) => {
      this.labels[s].setText(text).setColor(color).setPosition(x, y).setVisible(true);
    };
    if (inp.me && !inp.watch) {
      const clampU = (v: number, max: number) => Math.max(0, Math.min(max, v));
      const tx = px(clampU(inp.me.x + inp.pending.dx, MAP_W * UNIT - 1)), ty = px(clampU(inp.me.y + inp.pending.dy, MAP_H * UNIT - 1));
      if (!this.display.init || !Number.isFinite(this.display.x) || Math.abs(this.display.x - tx) > 8 * T || Math.abs(this.display.y - ty) > 8 * T) {
        this.display = { x: tx, y: ty, init: true, ang: this.display.ang };
      }
      const vx = (tx - this.display.x) * 0.3, vy = (ty - this.display.y) * 0.3;
      this.display.x += vx; this.display.y += vy;
      if (Math.hypot(vx, vy) > 0.4) this.display.ang = Math.atan2(vy, vx);
      const { x, y, ang } = this.display;
      this.trail.push({ x, y, a: 1 });
      if (this.trail.length > 18) this.trail.shift();
      this.trail.forEach((p, k) => gl.fillStyle(COL.cyan, (k / this.trail.length) * 0.25).fillCircle(p.x, p.y, 3 + k / 4));
      gl.lineStyle(1, COL.cyan, 0.12).strokeCircle(x, y, this.vision() * T);
      gl.fillStyle(COL.cyan, 0.25).fillCircle(x, y, 18);
      this.chevron(top, x, y, ang, 13, inp.me.alive ? 0xffffff : 0x555555);
      top.lineStyle(2, COL.cyan, 0.9).strokeCircle(x, y, 16 + 2 * pulse);
      label(inp.mySlot, x, y, "YOU", "#22f2ff");
      shown.add(inp.mySlot);
      this.cameras.main.centerOn(x, y);
    }
    for (const v of inp.visible) {
      if (shown.has(v.slot)) continue;
      const r = rpubs[v.slot];
      const x = px(v.x), y = px(v.y);
      const col = r?.isBot ? COL.violet : COL.magenta;
      gl.fillStyle(col, 0.35).fillCircle(x, y, 16);
      top.fillStyle(col, 1).fillCircle(x, y, 8);
      top.lineStyle(2, 0xffffff, 0.6).strokeCircle(x, y, 10);
      label(v.slot, x, y, `${r?.isBot ? "BOT " : "P"}${v.slot + 1}`, r?.isBot ? "#9b7bff" : "#ff2bd6");
      shown.add(v.slot);
    }
    rpubs.forEach((r, s) => {
      if (!r || shown.has(s) || !raid.raiders[s]?.joined) return;
      if (!(r.exposed || !r.alive || r.extracted)) return; // public only while trading / after death or extraction
      const x = px(r.pubX), y = px(r.pubY);
      if (!r.alive) {
        top.lineStyle(4, COL.down, 0.95).lineBetween(x - 8, y - 8, x + 8, y + 8).lineBetween(x - 8, y + 8, x + 8, y - 8);
      } else if (r.extracted) {
        top.lineStyle(2, COL.acid, 0.8).strokeCircle(x, y, 9);
      } else {
        gl.fillStyle(COL.cyan, 0.3).fillCircle(x, y, 22 + 8 * pulse);
        top.fillStyle(COL.cyan, 1).fillCircle(x, y, 8);
        top.lineStyle(2, COL.cyan, 0.4 + 0.6 * pulse).strokeCircle(x, y, 14 + 8 * pulse);
      }
      label(s, x, y, `${r.isBot ? "BOT " : "P"}${s + 1}${r.exposed && r.alive ? " · TRADING" : !r.alive ? " · DOWN" : " · OUT"}`, r.exposed ? "#22f2ff" : "#a59bd0");
    });

    // Crate ripping.
    if (this.rip) {
      const k = Math.min(1, (time - this.rip.start) / this.rip.ms);
      const j = (1 + 5 * k) * Math.sin(time / 18);
      const cx = this.rip.x + j, cy = this.rip.y;
      const sz = 12 + 6 * k;
      gl.fillStyle(COL.amber, 0.25 + 0.5 * k).fillCircle(this.rip.x, cy, sz * (2 + 2 * k));
      top.fillStyle(COL.amber, 1).fillPoints([{ x: cx, y: cy - sz }, { x: cx + sz, y: cy }, { x: cx, y: cy + sz }, { x: cx - sz, y: cy }], true);
      top.lineStyle(2, 0xffffff, 0.95);
      const n = Math.floor(2 + 8 * k);
      for (let c = 0; c < n; c++) {
        const a = c * 2.399, r = sz * k * 1.1;
        top.lineBetween(cx, cy, cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      }
      top.lineStyle(3, COL.magenta, 0.9).beginPath().arc(this.rip.x, cy, sz * 2.2, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2).strokePath();
      if (k >= 1) this.rip = null;
    }

    // Muzzle flashes (light up through the fog).
    this.flashes = this.flashes.filter((f) => f.until > time);
    for (const f of this.flashes) {
      top.lineStyle(6, 0xff2bd6, 0.5).lineBetween(f.x1, f.y1, f.x2, f.y2);
      top.lineStyle(2, 0xffffff, 1).lineBetween(f.x1, f.y1, f.x2, f.y2);
    }

    // Fog (purple night).
    this.fog.clear();
    if (!inp.watch && inp.me) {
      this.fog.fill(0x05020f, 0.88);
      this.brush.setScale((this.vision() * T * 2.3) / 512);
      this.fog.erase(this.brush, this.display.x, this.display.y);
    }
  }
}

export function startGame(parent: HTMLElement): { game: Phaser.Game; scene: () => RaidScene | null } {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: "#04020f",
    scale: { mode: Phaser.Scale.RESIZE, width: parent.clientWidth, height: parent.clientHeight },
    scene: [RaidScene],
    input: { activePointers: 3 },
    render: { antialias: true },
  });
  (window as unknown as { __razkynGame?: Phaser.Game }).__razkynGame = game; // inspection in tests
  return { game, scene: () => (game.scene.getScene("raid") as RaidScene) ?? null };
}
