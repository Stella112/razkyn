// RAZKYN actors: raiders (procedural, jointed, code-animated humans and robots), crates, terminals and exits.
// All geometry is original and built from primitives (no third-party models).
import * as THREE from "three";
import { PAL } from "./world";

const mat = (color: number, rough = 0.55, metal = 0.5) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
const glow = (color: number) => new THREE.MeshBasicMaterial({ color, toneMapped: false });

// ---------------------------------------------------------------- avatars
/** Identity colour per role: the backpack strip, armband and sight glow in it (you teal, humans amber, BOTs red). */
export type OperatorLook = { visor: number; accent: number; armor: number };
export const LOOKS = {
  me: { visor: PAL.teal, accent: PAL.teal, armor: 0x3a464e },
  human: { visor: PAL.amber, accent: PAL.amber, armor: 0x3b3a36 },
  bot: { visor: PAL.red, accent: 0x8c96a0, armor: 0x2c3237 },
} satisfies Record<string, OperatorLook>;

export type HumanSpec = { kind: "human"; body: "m" | "f"; skin: number; hair: number; hairColor: number; top: number; pants: number };
export type BotSpec = { kind: "bot"; model: number };
export type AvatarSpec = HumanSpec | BotSpec;
export const SKINS = [0xf2cfb0, 0xe0ac86, 0xc08a62, 0x9a6640, 0x6e4529, 0x45291a];
export const HAIR_STYLES = ["Short", "Buzz", "Long", "Ponytail", "Bun", "Curly"];
export const HAIR_COLORS = [0x15110e, 0x4a2e1c, 0x8a5a2b, 0xd1aa62, 0xa63a28, 0xc8cfd0];
export const TOPS = [0x2c3a44, 0x6b2f2a, 0x2e4a3a, 0x4d3f2c, 0x1e1f24, 0x8a6a3c];
export const PANTS = [0x1d2226, 0x2a3140, 0x3a3328, 0x4a4f55];
export const BOT_MODELS = ["SENTINEL", "DRONE", "HEAVY"];
export const DEFAULT_HUMAN: HumanSpec = { kind: "human", body: "m", skin: 2, hair: 0, hairColor: 0, top: 0, pants: 0 };

const pick = (n: number, b: number) => b % n;
/** Deterministic look for another human, from bytes of their wallet (the chain stores no avatar). */
export function avatarFromSeed(seed: ArrayLike<number>): HumanSpec {
  const b = (i: number) => seed[i % seed.length] ?? i * 37;
  return { kind: "human", body: b(0) % 2 ? "f" : "m", skin: pick(SKINS.length, b(1)), hair: pick(HAIR_STYLES.length, b(2)), hairColor: pick(HAIR_COLORS.length, b(3)), top: pick(TOPS.length, b(4)), pants: pick(PANTS.length, b(5)) };
}
export function randomHuman(): HumanSpec {
  const r = (n: number) => Math.floor(Math.random() * n);
  return { kind: "human", body: Math.random() < 0.5 ? "m" : "f", skin: r(SKINS.length), hair: r(HAIR_STYLES.length), hairColor: r(HAIR_COLORS.length), top: r(TOPS.length), pants: r(PANTS.length) };
}
/** Per-browser cosmetic settings (never sent anywhere). */
export function loadAvatar(): HumanSpec {
  try { const v = JSON.parse(window.localStorage.getItem("razkyn-avatar") ?? "null"); if (v && v.kind === "human") return { ...DEFAULT_HUMAN, ...v }; } catch { /* storage blocked */ }
  return DEFAULT_HUMAN;
}
export const saveAvatar = (a: HumanSpec) => { try { window.localStorage.setItem("razkyn-avatar", JSON.stringify(a)); } catch { /* storage blocked */ } };
export function loadBotModel(): number { try { const v = Number(window.localStorage.getItem("razkyn-bot-model")); return v >= 0 && v < BOT_MODELS.length ? v : 0; } catch { return 0; } }
export const saveBotModel = (m: number) => { try { window.localStorage.setItem("razkyn-bot-model", String(m)); } catch { /* storage blocked */ } };

type Limb = { pivot: THREE.Group; lower: THREE.Group };

/**
 * A jointed raider ~1.75 units tall: a human (male or female build, skin, hair, clothes) or a robot.
 * Same skeleton for all: hips (root), torso (yaws toward the aim), head, shoulders, elbows, hips, knees,
 * so the procedural animation (run cycle, aim, recoil, flinch, downed, extract lift) works for every look.
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

  constructor(look: OperatorLook, spec: AvatarSpec = { kind: "bot", model: 0 }) {
    const human = spec.kind === "human" ? spec : null;
    const botModel = spec.kind === "bot" ? spec.model : -1;
    const fem = human?.body === "f";
    const armor = mat(look.armor, 0.45, 0.65), dark = mat(0x111417, 0.6, 0.4), gunMetal = mat(0x22282c, 0.4, 0.8);
    const accent = mat(look.accent, 0.4, 0.5);
    this.visorMat = glow(look.visor);
    const skin = human ? mat(SKINS[human.skin], 0.75, 0.05) : armor;
    const top = human ? mat(TOPS[human.top], 0.8, 0.08) : armor;
    const pants = human ? mat(PANTS[human.pants], 0.85, 0.05) : mat(0x1b2024, 0.85, 0.1);
    const hairM = human ? mat(HAIR_COLORS[human.hairColor], 0.9, 0.05) : dark;
    const cap = (r: number, l: number, m: THREE.Material) => { const x = new THREE.Mesh(new THREE.CapsuleGeometry(r, l, 4, 8), m); x.castShadow = true; return x; };
    const box = (w: number, h: number, d: number, m: THREE.Material) => { const x = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); x.castShadow = true; return x; };
    const sph = (r: number, m: THREE.Material, phi = Math.PI) => { const x = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10, 0, Math.PI * 2, 0, phi), m); x.castShadow = true; return x; };

    this.root.add(this.body);
    this.body.position.y = 0.92; // hips
    const hipW = fem ? 0.36 : 0.33;
    const pelvis = box(hipW, 0.18, 0.22, pants); this.body.add(pelvis);
    // Jacket / coat hem flaps (front, back) that swing with the stride.
    const hemM = human ? top : mat(0x20272c, 0.8, 0.1);
    const hemL = human ? 0.26 : botModel === 1 ? 0.0 : 0.5;
    if (hemL > 0) for (const [g, z] of [[this.coatF, 0.12], [this.coatB, -0.13]] as const) { g.position.set(0, 0.02, z); const p = box(fem ? 0.36 : 0.4, hemL, 0.03, hemM); p.position.y = -hemL / 2; g.add(p); this.body.add(g); }
    // Torso (yaws toward aim).
    this.torso.position.y = 0.08;
    this.body.add(this.torso);
    let shoulderX = 0.27, headY = 0.66;
    if (human) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(fem ? 0.19 : 0.235, fem ? 0.16 : 0.18, 0.52, 12), top);
      t.scale.z = 0.62; t.position.y = 0.3; t.castShadow = true; this.torso.add(t);
      const collar = box(fem ? 0.2 : 0.24, 0.06, 0.16, top); collar.position.set(0, 0.57, 0); this.torso.add(collar);
      const belt = box(hipW + 0.02, 0.05, 0.24, dark); belt.position.y = 0.04; this.torso.add(belt);
      const neck = cap(0.05, 0.06, skin); neck.position.y = 0.62; this.torso.add(neck);
      shoulderX = fem ? 0.22 : 0.26; headY = 0.76;
    } else if (botModel === 2) { // Heavy
      const chest = box(0.56, 0.52, 0.34, armor); chest.position.y = 0.3; this.torso.add(chest);
      for (const sx of [-1, 1]) { const pad = box(0.2, 0.14, 0.3, accent); pad.position.set(sx * 0.36, 0.52, 0); this.torso.add(pad); }
      shoulderX = 0.34;
    } else if (botModel === 1) { // Drone: slim spine + core
      const spine = box(0.14, 0.5, 0.14, armor); spine.position.y = 0.3; this.torso.add(spine);
      const core = sph(0.13, this.visorMat); core.position.set(0, 0.34, 0.06); this.torso.add(core);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 6, 20), armor); ring.position.y = 0.34; this.torso.add(ring);
      shoulderX = 0.2; headY = 0.74;
    } else { // Sentinel (armoured operator)
      const chest = box(0.44, 0.46, 0.26, armor); chest.position.y = 0.3; this.torso.add(chest);
      const plate = box(0.34, 0.24, 0.06, accent); plate.position.set(0, 0.34, 0.15); this.torso.add(plate);
    }
    // Loot pack with the identity strip.
    const pack = box(0.34, 0.4, 0.18, dark); pack.position.set(0, 0.3, human ? -0.2 : -0.22); this.torso.add(pack);
    const packStrip = box(0.28, 0.04, 0.01, this.visorMat); packStrip.position.set(0, 0.42, human ? -0.296 : -0.316); this.torso.add(packStrip);
    // Head.
    this.head.position.y = headY;
    this.torso.add(this.head);
    let glassesZ = 0.15;
    if (human) {
      const skull = sph(0.125, skin); skull.scale.set(0.95, 1.12, 1.0); this.head.add(skull);
      for (const sx of [-1, 1]) {
        const eye = box(0.03, 0.022, 0.01, mat(0x101214, 0.3, 0)); eye.position.set(sx * 0.045, 0.015, 0.12); this.head.add(eye);
        const brow = box(0.045, 0.012, 0.01, hairM); brow.position.set(sx * 0.047, 0.05, 0.118); this.head.add(brow);
        const ear = sph(0.025, skin); ear.position.set(sx * 0.12, 0, 0); this.head.add(ear);
      }
      const nose = box(0.022, 0.04, 0.03, skin); nose.position.set(0, -0.01, 0.125); this.head.add(nose);
      const mouth = box(0.045, 0.008, 0.01, mat(0x5a2a24, 0.6, 0)); mouth.position.set(0, -0.06, 0.112); this.head.add(mouth);
      const style = human.hair;
      const crown = sph(style === 5 ? 0.165 : style === 1 ? 0.13 : 0.138, hairM, style === 5 ? Math.PI * 0.62 : Math.PI * 0.55);
      crown.position.set(0, style === 5 ? 0.02 : 0.025, -0.012); crown.rotation.x = -0.25; this.head.add(crown);
      if (style === 2) { const back = box(0.25, 0.32, 0.07, hairM); back.position.set(0, -0.1, -0.1); this.head.add(back); }
      if (style === 3) { const tail = cap(0.04, 0.2, hairM); tail.position.set(0, -0.05, -0.17); tail.rotation.x = 0.5; this.head.add(tail); }
      if (style === 4) { const bun = sph(0.065, hairM); bun.position.set(0, 0.12, -0.1); this.head.add(bun); }
      if (style === 0 && fem) { const fringe = box(0.2, 0.04, 0.05, hairM); fringe.position.set(0, 0.085, 0.09); this.head.add(fringe); }
      glassesZ = 0.13;
    } else if (botModel === 1) {
      const dome = sph(0.17, armor); this.head.add(dome);
      const eye = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.04, 16), this.visorMat); eye.rotation.x = Math.PI / 2; eye.position.set(0, 0, 0.16); this.head.add(eye);
      const halo = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.012, 6, 24), accent); halo.rotation.x = Math.PI / 2; halo.position.y = 0.12; this.head.add(halo);
      glassesZ = 0.18;
    } else if (botModel === 2) {
      const helm = box(0.28, 0.24, 0.28, armor); this.head.add(helm);
      const slit = box(0.22, 0.035, 0.02, this.visorMat); slit.position.set(0, 0.02, 0.145); this.head.add(slit);
      glassesZ = 0.16;
    } else {
      const helmet = sph(0.16, armor); helmet.scale.set(1, 1.1, 1.08); this.head.add(helmet);
      const visor = box(0.24, 0.07, 0.06, this.visorMat); visor.position.set(0, 0.02, 0.14); this.head.add(visor);
      const fin = box(0.04, 0.08, 0.2, accent); fin.position.set(0, 0.17, -0.02); this.head.add(fin);
    }
    // Legs.
    const shinM = human ? pants : armor;
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(side * (fem ? 0.1 : 0.1), -0.06, 0); this.body.add(pivot);
      const thigh = cap(human ? (fem ? 0.075 : 0.072) : botModel === 2 ? 0.09 : 0.075, 0.28, pants); thigh.position.y = -0.2; pivot.add(thigh);
      const lower = new THREE.Group(); lower.position.y = -0.42; pivot.add(lower);
      const shin = cap(botModel === 2 ? 0.08 : 0.062, 0.28, shinM); shin.position.y = -0.2; lower.add(shin);
      const boot = box(0.12, 0.08, 0.22, dark); boot.position.set(0, -0.42, 0.04); lower.add(boot);
      this.legs.push({ pivot, lower });
    }
    // Arms (hold the rifle). Humans: sleeves + hands; robots: plated limbs.
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(side * shoulderX, 0.48, 0); this.torso.add(pivot);
      const upper = cap(fem ? 0.052 : 0.06, 0.2, human ? top : armor); upper.position.y = -0.14; pivot.add(upper);
      const lower = new THREE.Group(); lower.position.y = -0.3; pivot.add(lower);
      const fore = cap(fem ? 0.047 : 0.054, 0.2, human ? top : mat(0x1b2024, 0.85, 0.1)); fore.position.y = -0.13; lower.add(fore);
      if (human) { const hand = sph(0.05, skin); hand.position.y = -0.27; lower.add(hand); }
      this.arms.push({ pivot, lower });
    }
    // Identity armband (you teal, humans amber) so people read at a glance.
    if (human) { const band = new THREE.Mesh(new THREE.CylinderGeometry(0.066, 0.066, 0.05, 12), this.visorMat); band.position.y = -0.18; this.arms[0].pivot.add(band); }
    // Rifle.
    this.gun.position.set(0.08, 0.3, 0.3);
    this.torso.add(this.gun);
    const recv = box(0.08, 0.12, 0.42, dark); this.gun.add(recv);
    const barrel = box(0.04, 0.04, 0.32, gunMetal); barrel.position.z = 0.36; this.gun.add(barrel);
    const sight = box(0.02, 0.02, 0.1, this.visorMat); sight.position.set(0, 0.08, 0.05); this.gun.add(sight);
    this.muzzle.position.z = 0.54; this.gun.add(this.muzzle);
    this.root.scale.setScalar(1.3);
    // Class gear (hidden until setClass): Scout headset antenna + AR glasses, Trader wrist terminal, Gunner long barrel + plates.
    const gearMat = mat(0x1a1f23, 0.5, 0.6);
    const antenna = box(0.015, 0.3, 0.015, gearMat); antenna.position.set(0.11, 0.26, -0.04); this.head.add(antenna);
    const tip = box(0.035, 0.035, 0.035, this.visorMat); tip.position.set(0.11, 0.42, -0.04); this.head.add(tip);
    const wideVisor = box(human ? 0.22 : 0.3, 0.035, 0.03, this.visorMat); wideVisor.position.set(0, human ? 0.018 : 0.07, glassesZ); this.head.add(wideVisor);
    const wrist = box(0.12, 0.03, 0.16, mat(0x2a3339, 0.4, 0.7)); wrist.position.set(0, -0.2, 0.05); this.arms[0].lower.add(wrist);
    const wristScreen = box(0.1, 0.005, 0.12, glow(PAL.amber)); wristScreen.position.set(0, -0.184, 0.05); this.arms[0].lower.add(wristScreen);
    const longBarrel = box(0.05, 0.05, 0.3, gunMetal); longBarrel.position.z = 0.66; this.gun.add(longBarrel);
    const brake = box(0.08, 0.08, 0.06, dark); brake.position.z = 0.82; this.gun.add(brake);
    const shoulder = box(0.14, 0.08, 0.2, accent); shoulder.position.set(shoulderX + 0.03, 0.52, 0); this.torso.add(shoulder);
    const shoulderL = shoulder.clone(); shoulderL.position.x = -(shoulderX + 0.03); this.torso.add(shoulderL);
    this.gear = { scout: [antenna, tip, wideVisor], trader: [wrist, wristScreen], gunner: [longBarrel, brake, shoulder, shoulderL] };
    this.setClass(0);
  }

  private coatF = new THREE.Group();
  private coatB = new THREE.Group();
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
    this.coatF.rotation.x = -0.06 - Math.abs(s) * 0.3 * run;
    this.coatB.rotation.x = 0.1 + Math.abs(c) * 0.35 * run;
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
  /** 0..1: fades the beam when it stands between the camera and the player. */
  fade = 1;
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
    this.beamMat.opacity = (this.open ? 0.12 + 0.08 * pulse : 0) * this.fade;
    this.light.intensity = this.open ? 14 + 6 * pulse : 0;
    this.ring.scale.setScalar(this.open ? 1 + 0.08 * pulse : 1);
    this.ring.rotation.z = t / 900;
  }
}
