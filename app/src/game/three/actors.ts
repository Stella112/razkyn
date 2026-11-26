// RAZKYN actors: the operator (procedural, jointed, code-animated), crates, terminals and exits.
// All geometry is original and built from primitives (no third-party models).
import * as THREE from "three";
import { PAL } from "./world";

const mat = (color: number, rough = 0.55, metal = 0.5) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
const glow = (color: number) => new THREE.MeshBasicMaterial({ color, toneMapped: false });

// ---------------------------------------------------------------- operator
export type OperatorLook = { visor: number; accent: number; armor: number };
export const LOOKS = {
  me: { visor: PAL.teal, accent: PAL.teal, armor: 0x3a464e },
  human: { visor: PAL.amber, accent: PAL.amber, armor: 0x3b3a36 },
  bot: { visor: PAL.red, accent: 0x8c96a0, armor: 0x2c3237 },
} satisfies Record<string, OperatorLook>;

type Limb = { pivot: THREE.Group; lower: THREE.Group };

/**
 * A jointed operator ~1.75 units tall. Pivots: hips (root), torso (yaws toward the aim), shoulders,
 * elbows, hips/knees. Animation is procedural: run cycle from ground speed, aim pose, recoil, flinch,
 * downed (falls), extracted (lifts away in the beam).
 */
export class Operator {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private torso = new THREE.Group();
  private head = new THREE.Group();
  private legs: Limb[] = [];
  private arms: Limb[] = [];
  private gun = new THREE.Group();
  readonly muzzle = new THREE.Object3D();
  private visorMat: THREE.MeshBasicMaterial;
  private phase = 0;
  private recoil = 0;
  private flinch = 0;
  private down = 0;
  private lift = 0;
  facing = 0;
  aim = 0;
  speed = 0;
  state: "alive" | "down" | "extracted" = "alive";

  constructor(look: OperatorLook) {
    const armor = mat(look.armor, 0.45, 0.65), cloth = mat(0x1b2024, 0.85, 0.1), dark = mat(0x111417, 0.6, 0.4);
    const accent = mat(look.accent, 0.4, 0.5);
    this.visorMat = glow(look.visor);
    const cap = (r: number, l: number, m: THREE.Material) => { const x = new THREE.Mesh(new THREE.CapsuleGeometry(r, l, 4, 8), m); x.castShadow = true; return x; };
    const box = (w: number, h: number, d: number, m: THREE.Material) => { const x = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); x.castShadow = true; return x; };

    this.root.add(this.body);
    this.body.position.y = 0.92; // hips
    const pelvis = box(0.36, 0.18, 0.22, cloth); this.body.add(pelvis);
    // Torso (yaws toward aim).
    this.torso.position.y = 0.08;
    this.body.add(this.torso);
    const chest = box(0.44, 0.46, 0.26, armor); chest.position.y = 0.3; this.torso.add(chest);
    const plate = box(0.34, 0.24, 0.06, accent); plate.position.set(0, 0.34, 0.15); this.torso.add(plate);
    const pack = box(0.36, 0.42, 0.2, dark); pack.position.set(0, 0.3, -0.22); this.torso.add(pack);
    const packStrip = box(0.3, 0.04, 0.01, this.visorMat); packStrip.position.set(0, 0.42, -0.325); this.torso.add(packStrip);
    // Head + helmet + visor.
    this.head.position.y = 0.66;
    this.torso.add(this.head);
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), armor); helmet.scale.set(1, 1.1, 1.08); helmet.castShadow = true; this.head.add(helmet);
    const visor = box(0.24, 0.07, 0.06, this.visorMat); visor.position.set(0, 0.02, 0.14); this.head.add(visor);
    const fin = box(0.04, 0.08, 0.2, accent); fin.position.set(0, 0.17, -0.02); this.head.add(fin);
    // Legs.
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(side * 0.11, -0.06, 0); this.body.add(pivot);
      const thigh = cap(0.075, 0.28, cloth); thigh.position.y = -0.2; pivot.add(thigh);
      const lower = new THREE.Group(); lower.position.y = -0.42; pivot.add(lower);
      const shin = cap(0.065, 0.28, armor); shin.position.y = -0.2; lower.add(shin);
      const boot = box(0.12, 0.08, 0.22, dark); boot.position.set(0, -0.42, 0.04); lower.add(boot);
      this.legs.push({ pivot, lower });
    }
    // Arms (hold the rifle).
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(side * 0.27, 0.48, 0); this.torso.add(pivot);
      const upper = cap(0.06, 0.2, armor); upper.position.y = -0.14; pivot.add(upper);
      const lower = new THREE.Group(); lower.position.y = -0.3; pivot.add(lower);
      const fore = cap(0.055, 0.2, cloth); fore.position.y = -0.13; lower.add(fore);
      this.arms.push({ pivot, lower });
    }
    // Rifle.
    this.gun.position.set(0.08, 0.3, 0.3);
    this.torso.add(this.gun);
    const recv = box(0.08, 0.12, 0.42, dark); this.gun.add(recv);
    const barrel = box(0.04, 0.04, 0.32, mat(0x22282c, 0.4, 0.8)); barrel.position.z = 0.36; this.gun.add(barrel);
    const sight = box(0.02, 0.02, 0.1, this.visorMat); sight.position.set(0, 0.08, 0.05); this.gun.add(sight);
    this.muzzle.position.z = 0.54; this.gun.add(this.muzzle);
    this.root.scale.setScalar(1.12);
    // Class gear (hidden until setClass): Scout antenna + wide visor, Trader wrist terminal, Gunner long barrel + plates.
    const gearMat = mat(0x1a1f23, 0.5, 0.6);
    const antenna = box(0.015, 0.34, 0.015, gearMat); antenna.position.set(0.1, 0.3, -0.06); this.head.add(antenna);
    const tip = box(0.04, 0.04, 0.04, this.visorMat); tip.position.set(0.1, 0.48, -0.06); this.head.add(tip);
    const wideVisor = box(0.3, 0.05, 0.05, this.visorMat); wideVisor.position.set(0, 0.07, 0.15); this.head.add(wideVisor);
    const wrist = box(0.12, 0.03, 0.16, mat(0x2a3339, 0.4, 0.7)); wrist.position.set(0, -0.2, 0.05); this.arms[0].lower.add(wrist);
    const wristScreen = box(0.1, 0.005, 0.12, glow(PAL.amber)); wristScreen.position.set(0, -0.184, 0.05); this.arms[0].lower.add(wristScreen);
    const longBarrel = box(0.05, 0.05, 0.3, mat(0x22282c, 0.4, 0.8)); longBarrel.position.z = 0.66; this.gun.add(longBarrel);
    const brake = box(0.08, 0.08, 0.06, dark); brake.position.z = 0.82; this.gun.add(brake);
    const shoulder = box(0.14, 0.08, 0.2, accent); shoulder.position.set(0.3, 0.52, 0); this.torso.add(shoulder);
    const shoulderL = shoulder.clone(); shoulderL.position.x = -0.3; this.torso.add(shoulderL);
    this.gear = { scout: [antenna, tip, wideVisor], trader: [wrist, wristScreen], gunner: [longBarrel, brake, shoulder, shoulderL] };
    this.setClass(0);
  }

  private gear!: { scout: THREE.Object3D[]; trader: THREE.Object3D[]; gunner: THREE.Object3D[] };
  private cls = -1;
  /** 0 Raider, 1 Scout, 2 Trader, 3 Gunner (constants.rs CLASS_*). Visible gear only; rules live on-chain. */
  setClass(cls: number) {
    if (cls === this.cls) return;
    this.cls = cls;
    this.gear.scout.forEach((o) => (o.visible = cls === 1));
    this.gear.trader.forEach((o) => (o.visible = cls === 2));
    this.gear.gunner.forEach((o) => (o.visible = cls === 3));
    this.muzzle.position.z = cls === 3 ? 0.86 : 0.54;
  }

  fire() { this.recoil = 1; }
  hit() { this.flinch = 1; }
  setVisor(color: number) { this.visorMat.color.setHex(color); }

  /** dt in seconds. Rotations are radians around +Y; 0 = facing +Z (map "down"). */
  update(dt: number) {
    const k = (rate: number) => 1 - Math.exp(-rate * dt);
    // Down / extracted transitions.
    this.down += ((this.state === "down" ? 1 : 0) - this.down) * k(6);
    this.lift += ((this.state === "extracted" ? 1 : 0) - this.lift) * k(1.2);
    this.root.rotation.y = this.facing;
    const run = Math.min(1, this.speed / 3.5) * (1 - this.down);
    this.phase += dt * (4 + this.speed * 2.2) * (run > 0.05 ? 1 : 0);
    const s = Math.sin(this.phase), c = Math.cos(this.phase);
    // Legs: swing + knee bend.
    this.legs[0].pivot.rotation.x = s * 0.75 * run; this.legs[1].pivot.rotation.x = -s * 0.75 * run;
    this.legs[0].lower.rotation.x = Math.max(0, -c) * 1.1 * run; this.legs[1].lower.rotation.x = Math.max(0, c) * 1.1 * run;
    this.body.position.y = 0.92 + Math.abs(c) * 0.05 * run - this.down * 0.62 + this.lift * 2.5;
    // Upper body aims (relative yaw, clamped), breathes, recoils, flinches.
    let rel = this.aim - this.facing;
    rel = Math.atan2(Math.sin(rel), Math.cos(rel));
    this.torso.rotation.y += (THREE.MathUtils.clamp(rel, -1.4, 1.4) - this.torso.rotation.y) * k(14);
    this.recoil *= Math.exp(-dt * 14); this.flinch *= Math.exp(-dt * 7);
    const breathe = Math.sin(performance.now() / 700) * 0.015 * (1 - run);
    this.torso.rotation.x = 0.08 * run - this.recoil * 0.12 - this.flinch * 0.35 + breathe;
    this.torso.rotation.z = Math.sin(this.phase) * 0.05 * run + this.flinch * 0.15;
    this.gun.position.z = 0.3 - this.recoil * 0.08;
    // Arms in an aim hold: right arm forward to the grip, left arm reaching the handguard.
    this.arms[1].pivot.rotation.set(-1.25 + this.recoil * 0.2, 0, -0.15);
    this.arms[1].lower.rotation.x = -0.35;
    this.arms[0].pivot.rotation.set(-1.15 + this.recoil * 0.2, 0, 0.45);
    this.arms[0].lower.rotation.x = -0.75;
    // Downed: fall onto the back.
    this.body.rotation.x = -this.down * 1.45;
    this.root.visible = this.lift < 0.97;
  }
}

// ---------------------------------------------------------------- crate
/** Sealed hard case: body, hinged lid, emissive strip (amber sealed, dim dormant, off once opened). */
export class CrateModel {
  readonly root = new THREE.Group();
  private lid = new THREE.Group();
  private stripMat = glow(PAL.amber);
  private innerMat = glow(PAL.amber);
  private open = 0;
  private target = 0;
  private shake = 0;
  constructor(drop = false) {
    this.root.scale.setScalar(1.25);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.42, 0.6), mat(drop ? 0x3a2a2a : 0x2e383f, 0.5, 0.7));
    body.position.y = 0.21; body.castShadow = true; body.receiveShadow = true; this.root.add(body);
    for (const sx of [-1, 1]) { const rib = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.44, 0.62), mat(0x1a1f23, 0.6, 0.6)); rib.position.set(sx * 0.3, 0.21, 0); this.root.add(rib); }
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.045, 0.62), this.stripMat); strip.position.y = 0.3; this.root.add(strip);
    const inner = new THREE.Mesh(new THREE.PlaneGeometry(0.76, 0.5), this.innerMat); inner.rotation.x = -Math.PI / 2; inner.position.y = 0.4; this.root.add(inner);
    this.lid.position.set(0, 0.42, -0.3); this.root.add(this.lid);
    const lidMesh = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.1, 0.62), mat(drop ? 0x4a3030 : 0x36424a, 0.45, 0.7));
    lidMesh.position.set(0, 0.05, 0.31); lidMesh.castShadow = true; this.lid.add(lidMesh);
    const latch = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.04), this.stripMat); latch.position.set(0, 0.04, 0.63); this.lid.add(latch);
    this.root.userData.drop = drop;
    if (drop) this.stripMat.color.setHex(PAL.red);
  }
  /** state: 0 sealed, 1 opened; dormant dims the strip; hot (district +2%) pulses. */
  set(state: number, dormant: boolean, hot: boolean, t: number) {
    this.target = state === 1 ? 1 : 0;
    const base = this.root.userData.drop ? PAL.red : PAL.amber;
    if (state === 1) this.stripMat.color.setHex(0x1c2226);
    else if (dormant) this.stripMat.color.setHex(0x3b4247);
    else { this.stripMat.color.setHex(base); this.stripMat.color.multiplyScalar(hot ? 1 + 0.6 * Math.sin(t / 120) : 0.85 + 0.15 * Math.sin(t / 400)); }
  }
  rip(k: number) { this.shake = k; }
  update(dt: number, t: number) {
    this.open += (this.target - this.open) * (1 - Math.exp(-dt * 5));
    this.lid.rotation.x = -this.open * 1.9;
    this.innerMat.color.setHex(PAL.amber); this.innerMat.color.multiplyScalar(this.open * (0.4 + 0.6 * Math.exp(-this.open * 0.5)) * (this.target ? 1 : 0));
    this.root.rotation.z = this.shake ? Math.sin(t / 22) * 0.06 * this.shake : 0;
    if (this.shake) { this.stripMat.color.setHex(0xffffff); this.stripMat.color.lerp(new THREE.Color(PAL.amber), 1 - this.shake); }
  }
}

// ---------------------------------------------------------------- terminal
export class TerminalModel {
  readonly root = new THREE.Group();
  private screenMat: THREE.MeshBasicMaterial;
  private cv = document.createElement("canvas");
  private tex: THREE.CanvasTexture;
  private lastKey = "";
  readonly light = new THREE.PointLight(PAL.teal, 5, 5, 1.6);
  constructor() {
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.15, 0.5), mat(0x2a3339, 0.45, 0.75));
    base.position.y = 0.575; base.castShadow = true; this.root.add(base);
    const hood = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.62), mat(0x1a2024, 0.5, 0.6)); hood.position.set(0, 1.5, 0.06); this.root.add(hood);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.4, 0.1), mat(0x1a2024)); post.position.set(0, 1.3, -0.15); this.root.add(post);
    this.cv.width = 256; this.cv.height = 160;
    this.tex = new THREE.CanvasTexture(this.cv); this.tex.colorSpace = THREE.SRGBColorSpace;
    this.screenMat = new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.44), this.screenMat);
    screen.position.set(0, 1.18, 0.27); screen.rotation.x = -0.35; this.root.add(screen);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.98, 1.05, 48), new THREE.MeshBasicMaterial({ color: PAL.teal, transparent: true, opacity: 0.55, toneMapped: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; this.root.add(ring);
    this.light.position.set(0, 1.6, 0.6); this.root.add(this.light);
    this.draw("TRADE", "E · 3 s exposed", false);
  }
  draw(title: string, sub: string, halted: boolean) {
    const key = title + sub + halted;
    if (key === this.lastKey) return;
    this.lastKey = key;
    const c = this.cv.getContext("2d")!;
    c.fillStyle = halted ? "#2a0d0d" : "#08201d"; c.fillRect(0, 0, 256, 160);
    c.strokeStyle = halted ? "#E4514E" : "#45C9B2"; c.lineWidth = 6; c.strokeRect(3, 3, 250, 154);
    c.fillStyle = halted ? "#E4514E" : "#45C9B2"; c.textAlign = "center";
    c.font = `700 54px "Barlow Condensed", "Arial Narrow", sans-serif`; c.fillText(title, 128, 76);
    c.fillStyle = "#C8D2D1"; c.font = `500 20px "JetBrains Mono", monospace`; c.fillText(sub, 128, 120);
    this.tex.needsUpdate = true;
    this.light.color.setHex(halted ? PAL.red : PAL.teal);
  }
}

// ---------------------------------------------------------------- exit
export class ExitModel {
  readonly root = new THREE.Group();
  private beam: THREE.Mesh;
  private ring: THREE.Mesh;
  private ringMat = new THREE.MeshBasicMaterial({ color: 0x3b4247, toneMapped: false, transparent: true, opacity: 0.9 });
  private beamMat = new THREE.MeshBasicMaterial({ color: PAL.teal, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  readonly light = new THREE.PointLight(PAL.teal, 0, 9, 1.4);
  open = false;
  constructor() {
    const pylon = mat(0x2b3338, 0.5, 0.7);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + 0.5;
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.6, 0.16), pylon); p.position.set(Math.cos(a) * 1.35, 0.8, Math.sin(a) * 1.35); p.castShadow = true; this.root.add(p);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.2), this.ringMat); cap.position.set(Math.cos(a) * 1.35, 1.62, Math.sin(a) * 1.35); this.root.add(cap);
    }
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.04, 8, 48), this.ringMat);
    this.ring.rotation.x = -Math.PI / 2; this.ring.position.y = 0.06; this.root.add(this.ring);
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.1, 18, 32, 1, true), this.beamMat);
    this.beam.position.y = 9; this.root.add(this.beam);
    this.light.position.y = 2; this.root.add(this.light);
  }
  update(t: number) {
    const pulse = 0.5 + 0.5 * Math.sin(t / 260);
    this.ringMat.color.setHex(this.open ? PAL.teal : 0x3b4247);
    this.beamMat.opacity = this.open ? 0.12 + 0.08 * pulse : 0;
    this.light.intensity = this.open ? 14 + 6 * pulse : 0;
    this.ring.scale.setScalar(this.open ? 1 + 0.08 * pulse : 1);
    this.ring.rotation.z = t / 900;
  }
}
