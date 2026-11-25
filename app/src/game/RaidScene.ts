// Phaser map for a raid (CLAUDE.md §8 "Look"): dark trading floor at night; a rising district glows
// green and its crates shimmer; a falling one flickers red and its hazard tiles crack; soft radial
// fog around the player (8-tile vision); exposed trades, muzzle flashes and deaths show through it.
import Phaser from "phaser";
import {
  DISTRICT_TILES, EXITS, HAZARD_ROWS, MAP_H, MAP_W, NUM_CRATES, TERMINALS, UNIT, VISION_TILES, changeBps,
  type PublicState,
} from "../lib/chain";

export const T = 24; // px per tile
const W = MAP_W * T, H = MAP_H * T;
const COL = { up: 0x22d37a, down: 0xff4b5c, amber: 0xffb22e, cyan: 0x46d2ff, violet: 0xa98bff, text: 0xdbe2ee, floor: 0x0a0e15, grid: 0x131a26 };
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
  private floor!: Phaser.GameObjects.Graphics;
  private dyn!: Phaser.GameObjects.Graphics;
  private top!: Phaser.GameObjects.Graphics;
  private fog!: Phaser.GameObjects.RenderTexture;
  private brush!: Phaser.GameObjects.Image;
  private labels: Phaser.GameObjects.Text[] = [];
  private keys!: Record<"W" | "A" | "S" | "D" | "UP" | "LEFT" | "DOWN" | "RIGHT", Phaser.Input.Keyboard.Key>;
  private display = { x: 0, y: 0, init: false };
  private flashes: { x1: number; y1: number; x2: number; y2: number; until: number }[] = [];
  stick = { x: 0, y: 0 };
  onShootAt: (wx: number, wy: number) => void = () => {};
  onInteract: () => void = () => {};
  onExtract: (down: boolean) => void = () => {};

  constructor() { super("raid"); }

  create() {
    this.cameras.main.setBackgroundColor("#04060a");
    this.floor = this.add.graphics();
    this.drawFloor();
    this.dyn = this.add.graphics();
    // Fog: a dark layer with a soft radial hole around the player.
    const tex = this.textures.createCanvas("fogbrush", 512, 512)!;
    const ctx = tex.getContext();
    const g = ctx.createRadialGradient(256, 256, 40, 256, 256, 256);
    g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.7, "rgba(255,255,255,0.85)"); g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, 512, 512); tex.refresh();
    this.brush = this.make.image({ key: "fogbrush", add: false });
    this.fog = this.add.renderTexture(0, 0, W, H).setOrigin(0, 0).setDepth(10);
    this.top = this.add.graphics().setDepth(11);
    for (let s = 0; s < 8; s++) this.labels.push(this.add.text(0, 0, "", { fontFamily: "JetBrains Mono", fontSize: "11px", color: "#dbe2ee" }).setDepth(12).setOrigin(0.5, 1.6).setVisible(false));
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
    const zw = this.scale.width / W, zh = (this.scale.height - 44) / H;
    if (this.input_?.watch) {
      cam.setZoom(Math.min(zw, zh)); cam.centerOn(W / 2, H / 2);
    } else {
      // Show ~26 tiles across: enough to see the vision radius with margin.
      cam.setZoom(Math.max(Math.min(zw, zh), this.scale.width / (26 * T)));
      cam.setBounds(-T * 4, -T * 4, W + T * 8, H + T * 8);
    }
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

  flash(fromU: { x: number; y: number }, toU: { x: number; y: number }) {
    this.flashes.push({ x1: px(fromU.x), y1: px(fromU.y), x2: px(toU.x), y2: px(toU.y), until: this.time.now + 160 });
  }

  setInput(i: SceneInput) {
    const firstWatch = !this.input_ || this.input_.watch !== i.watch;
    this.input_ = i;
    if (firstWatch && this.cameras?.main) this.fitCamera();
  }

  private drawFloor() {
    const f = this.floor;
    f.fillStyle(COL.floor, 1).fillRect(0, 0, W, H);
    f.lineStyle(1, COL.grid, 1);
    for (let x = 0; x <= MAP_W; x++) f.lineBetween(x * T, 0, x * T, H);
    for (let y = 0; y <= MAP_H; y++) f.lineBetween(0, y * T, W, y * T);
    // Corridors between districts (x tiles 21 and 43).
    f.fillStyle(0x000000, 0.55).fillRect(21 * T, 0, T, H).fillRect(43 * T, 0, T, H);
    f.lineStyle(2, 0x1f2a3b, 1).strokeRect(0, 0, W, H);
  }

  update(time: number) {
    const inp = this.input_;
    const g = this.dyn, top = this.top;
    g.clear(); top.clear();
    if (!inp?.pub?.raid) return;
    const { raid, districts, rpubs, crates } = inp.pub;
    const pulse = 0.5 + 0.5 * Math.sin(time / 260);

    // Districts: glow by direction, hazard tiles by level.
    DISTRICT_TILES.forEach(([lo, hi], d) => {
      const dist = districts[d];
      const bps = changeBps(dist);
      const x0 = lo * T, w = (hi - lo + 1) * T;
      if (bps > 30) g.fillStyle(COL.up, Math.min(0.16, 0.03 + bps / 4000)).fillRect(x0, 0, w, H);
      if (bps < -30) g.fillStyle(COL.down, Math.min(0.16, 0.03 - bps / 4000) * (0.75 + 0.25 * pulse)).fillRect(x0, 0, w, H);
      const level = dist?.hazardLevel ?? 0;
      const rows = HAZARD_ROWS[level];
      if (rows) {
        const y0 = rows[0] * T, h = (rows[1] - rows[0] + 1) * T;
        g.fillStyle(COL.down, 0.18 + 0.12 * pulse).fillRect(x0, y0, w, h);
        g.lineStyle(1, COL.down, 0.55);
        // Cracks: a fixed zig-zag per row so it reads as broken floor.
        for (let r = rows[0]; r <= rows[1]; r += 2) {
          g.beginPath(); g.moveTo(x0, r * T + T / 2);
          for (let x = x0; x < x0 + w; x += T) g.lineTo(x + T / 2, r * T + ((x / T + r) % 3) * (T / 3));
          g.strokePath();
        }
      }
    });

    // Terminals and exits.
    for (const [tx, ty] of TERMINALS) {
      g.fillStyle(COL.cyan, 0.15).fillRect(tx * T - T, ty * T - T, 3 * T, 3 * T);
      g.lineStyle(2, COL.cyan, 0.9).strokeRect(tx * T + 3, ty * T + 3, T - 6, T - 6);
    }
    const open = raid.exitWindow ? raid.openExits.filter((e) => e !== 255) : [];
    EXITS.forEach(([ex, ey], e) => {
      const isOpen = open.includes(e);
      g.lineStyle(isOpen ? 3 : 1, isOpen ? COL.up : 0x2a3547, isOpen ? 0.6 + 0.4 * pulse : 0.8).strokeCircle(ex * T + T / 2, ey * T + T / 2, isOpen ? T * (1.1 + 0.25 * pulse) : T * 0.9);
      if (isOpen) top.lineStyle(2, COL.up, 0.5 + 0.5 * pulse).strokeCircle(ex * T + T / 2, ey * T + T / 2, T * 1.4);
    });

    // Crates: positions are public (DECISIONS #16), contents are sealed until opened.
    raid.cratePos.forEach((p, i) => {
      if (i >= NUM_CRATES || (p.x === 0 && p.y === 0)) return;
      const c = crates[i];
      const d = Math.floor(i / 12);
      const dormant = i % 12 >= 8 && !districts[d]?.awake;
      const cx = px(p.x), cy = px(p.y);
      if (c && c.state === 1) { g.lineStyle(1, 0x3a4456, 1).strokeRect(cx - 5, cy - 5, 10, 10); return; }
      if (dormant) { g.fillStyle(0x2a3140, 1).fillRect(cx - 5, cy - 5, 10, 10); return; }
      const shimmer = changeBps(districts[d]) > 200 ? 0.6 + 0.4 * Math.sin(time / 120 + i) : 1;
      g.fillStyle(COL.amber, 0.9 * shimmer).fillRect(cx - 6, cy - 6, 12, 12);
      g.lineStyle(1, 0xffffff, 0.35).strokeRect(cx - 6, cy - 6, 12, 12);
    });
    // Drop crates (dead raiders' backpacks): public.
    for (let i = NUM_CRATES; i < crates.length; i++) {
      const c = crates[i];
      if (!c || !c.placed) continue;
      const cx = px(c.x), cy = px(c.y);
      if (c.state === 1) { g.lineStyle(1, 0x3a4456, 1).strokeCircle(cx, cy, 6); continue; }
      top.fillStyle(COL.violet, 0.95).fillCircle(cx, cy, 7);
    }

    // Raiders. Me: predicted position. Others: my private View (inside vision) or public exposure.
    const shown = new Set<number>();
    this.labels.forEach((l) => l.setVisible(false));
    const label = (s: number, x: number, y: number, text: string, color: string) => {
      const l = this.labels[s]; l.setText(text).setColor(color).setPosition(x, y).setVisible(true);
    };
    if (inp.me && !inp.watch) {
      const clampU = (v: number, max: number) => Math.max(0, Math.min(max, v));
      const tx = px(clampU(inp.me.x + inp.pending.dx, MAP_W * UNIT - 1)), ty = px(clampU(inp.me.y + inp.pending.dy, MAP_H * UNIT - 1));
      if (!Number.isFinite(this.display.x) || Math.abs(this.display.x - tx) > 8 * T || Math.abs(this.display.y - ty) > 8 * T) this.display = { x: tx, y: ty, init: true };
      if (!this.display.init) { this.display = { x: tx, y: ty, init: true }; }
      this.display.x += (tx - this.display.x) * 0.3; this.display.y += (ty - this.display.y) * 0.3;
      const { x, y } = this.display;
      g.lineStyle(1, COL.text, 0.08).strokeCircle(x, y, VISION_TILES * T);
      (inp.me.alive ? top : g).fillStyle(inp.me.alive ? 0xffffff : 0x555555, 1).fillCircle(x, y, 7);
      top.lineStyle(2, COL.cyan, 1).strokeCircle(x, y, 10);
      label(inp.mySlot, x, y, "YOU", "#46d2ff");
      shown.add(inp.mySlot);
      this.cameras.main.centerOn(x, y);
    }
    for (const v of inp.visible) {
      if (shown.has(v.slot)) continue;
      const r = rpubs[v.slot];
      const x = px(v.x), y = px(v.y);
      g.fillStyle(COL.amber, 1).fillCircle(x, y, 7);
      label(v.slot, x, y, `${r?.isBot ? "BOT " : ""}${v.slot + 1}`, r?.isBot ? "#a98bff" : "#ffb22e");
      shown.add(v.slot);
    }
    rpubs.forEach((r, s) => {
      if (!r || shown.has(s) || !raid.raiders[s]?.joined) return;
      if (!(r.exposed || !r.alive || r.extracted)) return; // position public only while trading / after death or extraction
      const x = px(r.pubX), y = px(r.pubY);
      if (!r.alive) {
        top.lineStyle(3, COL.down, 0.9).lineBetween(x - 6, y - 6, x + 6, y + 6).lineBetween(x - 6, y + 6, x + 6, y - 6);
      } else if (r.extracted) {
        top.lineStyle(2, COL.up, 0.8).strokeCircle(x, y, 8);
      } else {
        top.fillStyle(COL.cyan, 0.9).fillCircle(x, y, 7);
        top.lineStyle(2, COL.cyan, 0.4 + 0.6 * pulse).strokeCircle(x, y, 12 + 6 * pulse);
      }
      label(s, x, y, `${r.isBot ? "BOT " : ""}${s + 1}${r.exposed && r.alive ? " TRADING" : !r.alive ? " DOWN" : " OUT"}`, r.exposed ? "#46d2ff" : "#7c879a");
    });

    // Muzzle flashes (light up through fog).
    this.flashes = this.flashes.filter((f) => f.until > time);
    for (const f of this.flashes) top.lineStyle(3, 0xfff1a8, 0.95).lineBetween(f.x1, f.y1, f.x2, f.y2);

    // Fog.
    this.fog.clear();
    if (!inp.watch && inp.me) {
      this.fog.fill(0x020305, 0.86);
      const s = (VISION_TILES * T * 2.25) / 512;
      this.brush.setScale(s);
      this.fog.erase(this.brush, this.display.x, this.display.y);
    }
  }
}

export function startGame(parent: HTMLElement): { game: Phaser.Game; scene: () => RaidScene | null } {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: "#04060a",
    scale: { mode: Phaser.Scale.RESIZE, width: parent.clientWidth, height: parent.clientHeight },
    scene: [RaidScene],
    input: { activePointers: 3 },
    render: { antialias: true },
  });
  (window as unknown as { __razkynGame?: Phaser.Game }).__razkynGame = game; // inspection in tests
  return { game, scene: () => (game.scene.getScene("raid") as RaidScene) ?? null };
}
