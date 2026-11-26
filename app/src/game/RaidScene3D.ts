// RAZKYN raid view in real 3D (Three.js). Same interface as the old Phaser map so the React layer
// and all game logic (on-chain movement, combat, crates, trades, extraction) are unchanged:
// the scene only renders authoritative state it is given and reports input (move intent, aim/click
// position in map units, E, Space). Nothing here decides an outcome.
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import {
  DISTRICT_TILES, EXITS, MAP_H, MAP_W, NUM_CRATES, TERMINALS, UNIT, VISION_TILES, changeBps, districtOfX, type PublicState,
} from "../lib/chain";
import { CSS, PAL, buildWorld, fow, type World } from "./three/world";
import { CrateModel, ExitModel, LOOKS, Operator, TerminalModel } from "./three/actors";

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

const DNAME_BY_MODE: Record<number, string[]> = { 2: ["NVDA TOWER", "TSLA FACTORY", "GOLD VAULT"] };
const dname = (mode: number | undefined) => DNAME_BY_MODE[mode ?? 0] ?? ["TOWER", "FACTORY", "HARBOR"];
const w = (u: number) => u / UNIT; // on-chain units → world units (tiles)

/** Text sprite (labels, pop-ups). */
function textSprite(text: string, color: string, size = 1) {
  const cv = document.createElement("canvas");
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, toneMapped: false }));
  sp.renderOrder = 10;
  const set = (t: string, c: string) => {
    const ctx = cv.getContext("2d")!;
    const font = `700 44px "Barlow Condensed", "Arial Narrow", sans-serif`;
    ctx.font = font;
    const tw = Math.ceil(ctx.measureText(t).width) + 28;
    cv.width = tw; cv.height = 60;
    ctx.font = font; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(10,14,18,0.78)"; ctx.fillRect(0, 6, tw, 48);
    ctx.fillStyle = c; ctx.fillRect(0, 6, 4, 48);
    ctx.fillStyle = c; ctx.fillText(t, tw / 2 + 2, 31);
    tex.needsUpdate = true;
    sp.scale.set((tw / 60) * 0.42 * size, 0.42 * size, 1);
  };
  set(text, color);
  return { sp, set };
}

type RaiderView = {
  op: Operator;
  label: ReturnType<typeof textSprite>;
  labelKey: string;
  pos: THREE.Vector3;
  target: THREE.Vector3;
  seen: boolean;
  exposedRing: THREE.Mesh;
};

export class RaidScene {
  input_: SceneInput | null = null;
  stick = { x: 0, y: 0 };
  onShootAt: (wx: number, wy: number) => void = () => {};
  onInteract: () => void = () => {};
  onExtract: (down: boolean) => void = () => {};

  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private camera: THREE.PerspectiveCamera;
  private world: World;
  private scene: THREE.Scene;
  private keys = new Set<string>();
  private raiders = new Map<number, RaiderView>();
  private crates: CrateModel[] = [];
  private drops = new Map<number, CrateModel>();
  private terminals: TerminalModel[] = [];
  private exits: ExitModel[] = [];
  private reticle: THREE.Mesh;
  private mouse = new THREE.Vector2(9, 9);
  private aimPoint: THREE.Vector3 | null = null;
  private ray = new THREE.Raycaster();
  private ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private camTarget = new THREE.Vector3(MAP_W / 2, 0, MAP_H / 2);
  private zoom = 1;
  private camInit = false;
  private shake = 0;
  private rip: { x: number; z: number; start: number; ms: number; crate: CrateModel | null } | null = null;
  private tracers: { m: THREE.Mesh; until: number }[] = [];
  private flashLight = new THREE.PointLight(0xffd9a0, 0, 7, 1.5);
  private sparks: { pts: THREE.Points; vel: Float32Array; life: Float32Array; next: number };
  private pops: { sp: THREE.Sprite; born: number }[] = [];
  private raf = 0;
  private last = performance.now();
  private frameMs: number[] = [];
  private lowPower = false;
  private disposed = false;
  private ro: ResizeObserver;

  constructor(private parent: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.3;
    this.renderer.info.autoReset = false;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    parent.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.touchAction = "none";

    this.world = buildWorld(this.renderer);
    this.scene = this.world.scene;
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.5, 400);
    this.camera.position.set(MAP_W / 2, 30, MAP_H + 28);

    // Static props from the map constants.
    for (const [tx, ty] of TERMINALS) {
      const t = new TerminalModel(); t.root.position.set(tx + 0.5, 0, ty + 0.5); this.scene.add(t.root); this.terminals.push(t);
    }
    for (const [ex, ey] of EXITS) {
      const e = new ExitModel(); e.root.position.set(ex + 0.5, 0, ey + 0.5); this.scene.add(e.root); this.exits.push(e);
    }
    for (let i = 0; i < NUM_CRATES; i++) { const c = new CrateModel(); c.root.visible = false; this.scene.add(c.root); this.crates.push(c); }
    this.reticle = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.4, 32), new THREE.MeshBasicMaterial({ color: PAL.amber, transparent: true, opacity: 0.85, toneMapped: false, depthTest: false }));
    this.reticle.rotation.x = -Math.PI / 2; this.reticle.renderOrder = 9; this.reticle.visible = false;
    this.scene.add(this.reticle, this.flashLight);

    // Spark particles (ring buffer).
    const N = 400;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3).fill(-999), 3));
    g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.12, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    pts.frustumCulled = false;
    this.scene.add(pts);
    this.sparks = { pts, vel: new Float32Array(N * 3), life: new Float32Array(N), next: 0 };

    // Post: bloom on emissive lights only (high threshold), then tone mapping / sRGB output.
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.5, 0.82);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(parent);
    this.resize();
    this.bindInput();
    this.raf = requestAnimationFrame(this.frame);
  }

  // ------------------------------------------------------------ input
  private onKey = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    const k = e.key.toLowerCase();
    if (e.type === "keydown") {
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) { this.keys.add(k); if (k.startsWith("arrow")) e.preventDefault(); }
      if (k === "e" && !e.repeat) this.onInteract();
      if (k === " " && !e.repeat) { e.preventDefault(); this.onExtract(true); }
    } else {
      this.keys.delete(k);
      if (k === " ") this.onExtract(false);
    }
  };
  private onBlur = () => this.keys.clear();
  private onPointerMove = (e: PointerEvent) => {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  };
  private onPointerDown = (e: PointerEvent) => {
    this.onPointerMove(e);
    if (e.button !== 0 || this.input_?.watch) return;
    const p = this.groundAt(this.mouse);
    if (p) this.onShootAt(p.x * UNIT, p.z * UNIT);
  };
  private onWheel = (e: WheelEvent) => { e.preventDefault(); this.zoom = THREE.MathUtils.clamp(this.zoom + Math.sign(e.deltaY) * 0.1, 0.7, 1.8); };
  private bindInput() {
    window.addEventListener("keydown", this.onKey);
    window.addEventListener("keyup", this.onKey);
    window.addEventListener("blur", this.onBlur);
    const el = this.renderer.domElement;
    el.addEventListener("pointermove", this.onPointerMove);
    el.addEventListener("pointerdown", this.onPointerDown);
    el.addEventListener("wheel", this.onWheel, { passive: false });
  }
  private groundAt(ndc: THREE.Vector2) {
    this.ray.setFromCamera(ndc, this.camera);
    const p = new THREE.Vector3();
    return this.ray.ray.intersectPlane(this.ground, p) ? p : null;
  }

  /** Movement intent from keys / touch stick: unit vector in map axes or null. */
  moveDir(): { x: number; y: number } | null {
    let x = 0, y = 0;
    if (this.keys.has("a") || this.keys.has("arrowleft")) x -= 1;
    if (this.keys.has("d") || this.keys.has("arrowright")) x += 1;
    if (this.keys.has("w") || this.keys.has("arrowup")) y -= 1;
    if (this.keys.has("s") || this.keys.has("arrowdown")) y += 1;
    x += this.stick.x; y += this.stick.y;
    const n = Math.hypot(x, y);
    return n < 0.2 ? null : { x: x / n, y: y / n };
  }

  // ------------------------------------------------------------ effects (called from React)
  startRip(u: { x: number; y: number }, ms: number) {
    const x = w(u.x), z = w(u.y);
    let best: CrateModel | null = null, bd = 1.5;
    for (const c of [...this.crates, ...this.drops.values()]) {
      if (!c.root.visible) continue;
      const d = Math.hypot(c.root.position.x - x, c.root.position.z - z);
      if (d < bd) { bd = d; best = c; }
    }
    this.rip = { x, z, start: performance.now(), ms, crate: best };
  }
  stopRip() { this.rip?.crate?.rip(0); this.rip = null; }
  flash(fromU: { x: number; y: number }, toU: { x: number; y: number }) {
    const me = this.input_ ? this.raiders.get(this.input_.mySlot) : undefined;
    const from = me && me.op.root.visible ? me.op.muzzle.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(w(fromU.x), 1.25, w(fromU.y));
    const to = new THREE.Vector3(w(toU.x), 1.1, w(toU.y));
    if (me) { me.op.aim = Math.atan2(to.x - me.pos.x, to.z - me.pos.z); me.op.fire(); }
    const len = from.distanceTo(to);
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, len), new THREE.MeshBasicMaterial({ color: 0xffe2b0, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, toneMapped: false }));
    m.position.copy(from).lerp(to, 0.5); m.lookAt(to);
    this.scene.add(m);
    this.tracers.push({ m, until: performance.now() + 110 });
    this.flashLight.position.copy(from); this.flashLight.intensity = 22;
    this.spawnSparks(to, 0xffc890, 14, 3);
    this.shake = Math.max(this.shake, 0.12);
  }
  hurt() {
    this.shake = Math.max(this.shake, 0.45);
    const me = this.input_ ? this.raiders.get(this.input_.mySlot) : undefined;
    me?.op.hit();
  }
  burst(u: { x: number; y: number }, color = PAL.amber, n = 28) { this.spawnSparks(new THREE.Vector3(w(u.x), 0.8, w(u.y)), color, n, 4); }
  popText(u: { x: number; y: number }, text: string, color = CSS.amber) {
    const { sp } = textSprite(text, color, 1.5);
    sp.position.set(w(u.x), 2.6, w(u.y));
    this.scene.add(sp);
    this.pops.push({ sp, born: performance.now() });
  }

  setInput(i: SceneInput) { this.input_ = i; }

  // ------------------------------------------------------------ internals
  private spawnSparks(at: THREE.Vector3, color: number, n: number, speed: number) {
    const S = this.sparks;
    const pos = S.pts.geometry.attributes.position as THREE.BufferAttribute;
    const col = S.pts.geometry.attributes.color as THREE.BufferAttribute;
    const c = new THREE.Color(color);
    for (let k = 0; k < n; k++) {
      const i = S.next; S.next = (S.next + 1) % S.life.length;
      pos.setXYZ(i, at.x, at.y, at.z);
      col.setXYZ(i, c.r, c.g, c.b);
      const a = Math.random() * Math.PI * 2, up = Math.random();
      S.vel.set([Math.cos(a) * speed * (0.4 + Math.random()), up * speed * 1.2, Math.sin(a) * speed * (0.4 + Math.random())], i * 3);
      S.life[i] = 0.5 + Math.random() * 0.5;
    }
    pos.needsUpdate = true; col.needsUpdate = true;
  }

  private resize() {
    const wpx = Math.max(1, this.parent.clientWidth), hpx = Math.max(1, this.parent.clientHeight);
    this.renderer.setSize(wpx, hpx);
    this.composer.setSize(wpx, hpx);
    this.bloom.resolution.set(wpx / 2, hpx / 2);
    this.camera.aspect = wpx / hpx;
    this.camera.updateProjectionMatrix();
  }

  private raider(slot: number, look: keyof typeof LOOKS): RaiderView {
    let v = this.raiders.get(slot);
    if (!v) {
      const op = new Operator(LOOKS[look]);
      const label = textSprite("", CSS.silver);
      label.sp.position.y = 2.35;
      op.root.add(label.sp);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.85, 40), new THREE.MeshBasicMaterial({ color: PAL.teal, transparent: true, opacity: 0, toneMapped: false, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04;
      op.root.add(ring);
      if (look === "me") { const lamp = new THREE.PointLight(0xdfeee9, 9, 7, 1.6); lamp.position.set(0, 2.2, 0.6); op.root.add(lamp); } // shoulder lamp
      this.scene.add(op.root);
      v = { op, label, labelKey: "", pos: new THREE.Vector3(), target: new THREE.Vector3(), seen: false, exposedRing: ring };
      this.raiders.set(slot, v);
    }
    return v;
  }

  private frame = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.frameMs.push(now - this.last);
    if (this.frameMs.length > 240) this.frameMs.shift();
    this.last = now;
    this.adapt();
    this.renderer.info.reset();
    this.update(now, dt);
    if (this.lowPower) this.renderer.render(this.scene, this.camera);
    else this.composer.render(dt);
  };

  /** Adaptive quality: if frames average > 25 ms over 4 s, drop bloom and pixel ratio. */
  private adapt() {
    if (this.lowPower || this.frameMs.length < 240) return;
    const avg = this.frameMs.reduce((a, b) => a + b, 0) / this.frameMs.length;
    if (avg > 25) { this.lowPower = true; this.renderer.setPixelRatio(1); this.resize(); }
  }

  stats() {
    const f = [...this.frameMs].sort((a, b) => a - b);
    const avg = f.reduce((a, b) => a + b, 0) / Math.max(1, f.length);
    return { frames: f.length, avgMs: +avg.toFixed(2), fps: +(1000 / Math.max(1, avg)).toFixed(1), p95Ms: +(f[Math.floor(f.length * 0.95)] ?? 0).toFixed(2), lowPower: this.lowPower, calls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles };
  }

  private update(t: number, dt: number) {
    const inp = this.input_;
    const pub = inp?.pub;
    const raid = pub?.raid ?? null;
    const watch = !!inp?.watch;

    // Market → districts: lights, signs, hazards.
    if (pub && raid) {
      const halt = raid.eventKind === 1 && Number(raid.eventUntil?.toString() ?? 0) * 1000 > Date.now() ? raid.eventDistrict ?? -1 : -1;
      DISTRICT_TILES.forEach((_, d) => {
        const dist = pub.districts[d];
        const bps = changeBps(dist);
        const l = this.world.districtLights[d];
        if (bps > 30) { l.color.setHex(PAL.teal); l.intensity = 30 + Math.min(40, bps / 8); }
        else if (bps < -30) { l.color.setHex(PAL.red); l.intensity = (26 + Math.min(40, -bps / 8)) * (0.75 + 0.25 * Math.sin(t / 70 + d)); }
        else { l.color.setHex(PAL.amber); l.intensity = 22; }
        const arrow = bps >= 0 ? "▲" : "▼";
        this.world.signs[d].draw(dname(raid.mode)[d], `${arrow} ${bps >= 0 ? "+" : "−"}${(Math.abs(bps) / 100).toFixed(2)}%${halt === d ? "  HALTED" : ""}`, halt === d || bps < -30 ? CSS.red : bps > 30 ? CSS.teal : CSS.amber);
        const level = dist?.hazardLevel ?? 0;
        for (const h of this.world.hazards[d]) {
          h.mesh.visible = h.level === level;
          (h.mesh.material as THREE.MeshBasicMaterial).opacity = 0.45 + 0.3 * Math.sin(t / 180 + d);
        }
        this.world.embers[d].visible = level > 0;
      });
      // Terminals (halted ones go red).
      this.terminals.forEach((tm) => {
        const d = districtOfX(tm.root.position.x * UNIT);
        tm.draw(halt === d ? "HALTED" : "TRADE", halt === d ? "trading halt" : "E · exposed", halt === d);
      });
      // Exits.
      const open = raid.exitWindow ? raid.openExits.filter((e) => e !== 255) : [];
      this.exits.forEach((e, i) => { e.open = open.includes(i); e.update(t); });
      // Crates (positions public; contents sealed until opened).
      raid.cratePos.forEach((p, i) => {
        if (i >= NUM_CRATES) return;
        const c = this.crates[i];
        const placed = !(p.x === 0 && p.y === 0);
        c.root.visible = placed;
        if (!placed) return;
        c.root.position.set(w(p.x), 0, w(p.y));
        const d = Math.floor(i / 12);
        const state = pub.crates[i]?.state === 1 ? 1 : 0;
        c.set(state, i % 12 >= 8 && !pub.districts[d]?.awake, changeBps(pub.districts[d]) > 200, t);
        c.update(dt, t);
      });
      for (let i = NUM_CRATES; i < pub.crates.length; i++) {
        const c = pub.crates[i];
        if (!c?.placed) { const m = this.drops.get(i); if (m) m.root.visible = false; continue; }
        let m = this.drops.get(i);
        if (!m) { m = new CrateModel(true); m.root.userData.drop = true; this.scene.add(m.root); this.drops.set(i, m); }
        m.root.visible = true;
        m.root.position.set(w(c.x), 0, w(c.y));
        m.set(c.state, false, false, t);
        m.update(dt, t);
      }
    }

    // Crate ripping.
    if (this.rip?.crate) {
      const k = Math.min(1, (t - this.rip.start) / this.rip.ms);
      this.rip.crate.rip(k);
      if (k >= 1) { this.spawnSparks(this.rip.crate.root.position.clone().setY(0.6), PAL.amber, 30, 3.5); this.rip.crate.rip(0); this.rip = null; }
    }

    // Raiders.
    const shown = new Set<number>();
    let focus: THREE.Vector3 | null = null;
    if (inp && raid) {
      const place = (slot: number, x: number, y: number, look: keyof typeof LOOKS, label: string, labelColor: string, snap = false) => {
        const v = this.raider(slot, look);
        v.target.set(w(x), 0, w(y));
        if (!v.seen || snap || v.pos.distanceTo(v.target) > 6) v.pos.copy(v.target);
        v.seen = true;
        const before = v.pos.clone();
        v.pos.lerp(v.target, 1 - Math.exp(-dt * 10));
        const moved = v.pos.distanceTo(before);
        const sp = moved / Math.max(dt, 1e-3);
        v.op.speed += (sp - v.op.speed) * (1 - Math.exp(-dt * 8));
        if (moved > 0.004) v.op.facing = Math.atan2(v.pos.x - before.x, v.pos.z - before.z);
        v.op.root.position.copy(v.pos);
        v.op.root.visible = true;
        const key = label + labelColor;
        if (key !== v.labelKey) { v.label.set(label, labelColor); v.labelKey = key; }
        shown.add(slot);
        return v;
      };
      if (inp.me && !watch) {
        const clamp = (v: number, max: number) => Math.max(0, Math.min(max, v));
        const v = place(inp.mySlot, clamp(inp.me.x + inp.pending.dx, MAP_W * UNIT - 1), clamp(inp.me.y + inp.pending.dy, MAP_H * UNIT - 1), "me", "YOU", CSS.teal);
        v.op.state = inp.me.alive ? (pub?.rpubs[inp.mySlot]?.extracted ? "extracted" : "alive") : "down";
        // Aim at the cursor.
        const p = this.groundAt(this.mouse);
        this.aimPoint = p;
        if (p && Math.abs(this.mouse.x) <= 1 && Math.abs(this.mouse.y) <= 1) {
          v.op.aim = Math.atan2(p.x - v.pos.x, p.z - v.pos.z);
          this.reticle.visible = inp.me.alive; this.reticle.position.set(p.x, 0.05, p.z);
        } else { v.op.aim = v.op.facing; this.reticle.visible = false; }
        focus = v.pos;
      } else this.reticle.visible = false;
      for (const vis of inp.visible) {
        if (shown.has(vis.slot)) continue;
        const r = pub?.rpubs[vis.slot];
        const v = place(vis.slot, vis.x, vis.y, r?.isBot ? "bot" : "human", `${r?.isBot ? "BOT " : "P"}${vis.slot + 1}`, r?.isBot ? CSS.red : CSS.amber);
        v.op.aim = v.op.facing; v.op.state = "alive";
      }
      pub?.rpubs.forEach((r, s) => {
        if (!r || shown.has(s) || !raid.raiders[s]?.joined) return;
        if (!(r.exposed || !r.alive || r.extracted)) return; // public only while trading / after death or extraction
        const status = r.exposed && r.alive ? " · TRADING" : !r.alive ? " · DOWN" : " · OUT";
        const v = place(s, r.pubX, r.pubY, r.isBot ? "bot" : "human", `${r.isBot ? "BOT " : "P"}${s + 1}${status}`, r.exposed && r.alive ? CSS.teal : CSS.silver);
        v.op.state = !r.alive ? "down" : r.extracted ? "extracted" : "alive";
        v.op.aim = v.op.facing;
      });
      this.raiders.forEach((v, s) => {
        const r = pub?.rpubs[s];
        const exposed = !!(r?.exposed && r.alive && !r.extracted);
        (v.exposedRing.material as THREE.MeshBasicMaterial).opacity = shown.has(s) && exposed ? 0.5 + 0.4 * Math.sin(t / 160) : 0;
        if (!shown.has(s)) { v.op.root.visible = false; v.seen = false; }
        v.op.update(dt);
      });
      // Fog of war around me.
      const cls = raid.classes?.[inp.mySlot];
      fow.uFowOn.value = inp.me && !watch ? 1 : 0;
      fow.uFowRadius.value = cls === 1 ? 10 : VISION_TILES;
      if (focus) fow.uFowCenter.value.set(focus.x, focus.z);
    }

    // Camera: damped follow (player) or overview (watch).
    const target = focus ?? new THREE.Vector3(MAP_W / 2, 0, MAP_H / 2 - 2);
    const snap = !this.camInit || this.camTarget.distanceTo(target) > 12;
    this.camInit = true;
    this.camTarget.lerp(target, snap ? 1 : 1 - Math.exp(-dt * (focus ? 6 : 2)));
    const dist = watch || !focus ? 2.35 : this.zoom;
    const off = new THREE.Vector3(0, 11 * dist, 14 * dist); // ~38° down
    const want = this.camTarget.clone().add(off);
    this.camera.position.lerp(want, snap ? 1 : 1 - Math.exp(-dt * 8));
    this.shake *= Math.exp(-dt * 9);
    if (this.shake > 0.01) this.camera.position.add(new THREE.Vector3((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake, 0));
    this.camera.lookAt(this.camTarget.x, 0.8, this.camTarget.z - 1.5);

    // Effects.
    this.tracers = this.tracers.filter((tr) => { if (tr.until > t) { (tr.m.material as THREE.MeshBasicMaterial).opacity = (tr.until - t) / 110; return true; } this.scene.remove(tr.m); tr.m.geometry.dispose(); return false; });
    this.flashLight.intensity *= Math.exp(-dt * 30);
    const S = this.sparks, pos = S.pts.geometry.attributes.position as THREE.BufferAttribute;
    let live = false;
    for (let i = 0; i < S.life.length; i++) {
      if (S.life[i] <= 0) continue;
      live = true;
      S.life[i] -= dt;
      S.vel[i * 3 + 1] -= 9 * dt;
      pos.setXYZ(i, pos.getX(i) + S.vel[i * 3] * dt, Math.max(0.02, pos.getY(i) + S.vel[i * 3 + 1] * dt), pos.getZ(i) + S.vel[i * 3 + 2] * dt);
      if (S.life[i] <= 0) pos.setXYZ(i, 0, -999, 0);
    }
    if (live) pos.needsUpdate = true;
    this.pops = this.pops.filter((p) => {
      const k = (t - p.born) / 1300;
      if (k >= 1) { this.scene.remove(p.sp); return false; }
      p.sp.position.y = 2.6 + k * 1.6;
      (p.sp.material as THREE.SpriteMaterial).opacity = 1 - k * k;
      return true;
    });
    this.world.tick(t, dt, this.camTarget);
  }

  destroy() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    window.removeEventListener("keydown", this.onKey);
    window.removeEventListener("keyup", this.onKey);
    window.removeEventListener("blur", this.onBlur);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

export function startGame(parent: HTMLElement): { game: { destroy: (all?: boolean) => void }; scene: () => RaidScene | null } {
  const s = new RaidScene(parent);
  (window as unknown as { __razkyn3d?: RaidScene }).__razkyn3d = s; // inspection in tests (stats())
  return { game: { destroy: () => s.destroy() }, scene: () => s };
}
