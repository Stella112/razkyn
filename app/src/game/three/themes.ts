// Map themes: the same 64 × 40 market floor and the same rules, dressed three ways.
// A theme only changes what THIS player's browser draws (floor paint, surrounding scenery,
// lighting, weather). It never changes positions, tiles, crates, hazards, exits or terminals.
// All geometry is original and procedural; everything solid-looking stays outside the playfield
// (the program lets raiders walk every tile).
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { DISTRICT_TILES, MAP_H, MAP_W } from "../../lib/chain";
import { PAL, Sign } from "./world";

export type Theme = "street" | "mall" | "farm";
export const THEMES: { id: Theme; name: string; blurb: string }[] = [
  { id: "street", name: "STREET", blurb: "Rain-soaked financial district at night: towers, factory, harbor cranes." },
  { id: "mall", name: "MALL", blurb: "A closed shopping mall after hours: storefronts, escalators, food court." },
  { id: "farm", name: "FARM", blurb: "A farm at dusk: silos, barn, windmill, cornfield and a pond." },
];
export const getTheme = (): Theme => {
  try { const t = window.localStorage.getItem("razkyn-theme"); if (t === "mall" || t === "farm" || t === "street") return t; } catch { /* storage blocked */ }
  return "street";
};
export const setTheme = (t: Theme) => { try { window.localStorage.setItem("razkyn-theme", t); } catch { /* storage blocked */ } };

/** Sky, fog, light and weather per theme. */
export const LOOK: Record<Theme, { bg: number; fog: number; fogD: number; sky: number; ground: number; hemi: number; moon: number; moonI: number; rain: boolean; outer: number }> = {
  street: { bg: 0x0a0e12, fog: 0x0c1216, fogD: 0.0085, sky: 0x5f7482, ground: 0x161b20, hemi: 2.3, moon: 0xc6d4e0, moonI: 2.4, rain: true, outer: 0x0d1013 },
  mall: { bg: 0x100d0b, fog: 0x14110e, fogD: 0.006, sky: 0x8a7b68, ground: 0x1c1813, hemi: 2.3, moon: 0xf0dcc0, moonI: 1.8, rain: false, outer: 0x17130f },
  farm: { bg: 0x1a2230, fog: 0x1f2735, fogD: 0.0075, sky: 0x8090a8, ground: 0x241c14, hemi: 2.1, moon: 0xffc89a, moonI: 2.2, rain: false, outer: 0x1d1a12 },
};

const box = (w: number, h: number, d: number, x: number, y: number, z: number) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; };
const std = (color: number, rough = 0.6, metal = 0.2) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
const glow = (color: number) => new THREE.MeshBasicMaterial({ color, toneMapped: false });
const add = (scene: THREE.Scene, geos: THREE.BufferGeometry[], m: THREE.Material, shadow = false) => {
  if (!geos.length) return null;
  const mesh = new THREE.Mesh(mergeGeometries(geos), m);
  mesh.castShadow = shadow; mesh.receiveShadow = true; scene.add(mesh);
  return mesh;
};

// ---------------------------------------------------------------- floor paint
/** Paints districts + corridors for mall / farm (pads, exits and the border are painted by world.ts). */
export function paintThemedFloor(c: CanvasRenderingContext2D, theme: Theme, P: number, r: () => number) {
  const H = MAP_H * P;
  DISTRICT_TILES.forEach(([lo, hi], d) => {
    const x0 = lo * P, w = (hi - lo + 1) * P;
    if (theme === "mall") {
      if (d === 0) { // atrium: black marble, brass inlay
        c.fillStyle = "#17171a"; c.fillRect(x0, 0, w, H);
        for (let y = 0; y < MAP_H; y += 2) for (let x = lo; x <= hi; x += 2) { const v = 24 + Math.floor(r() * 8); c.fillStyle = `rgb(${v},${v},${v + 3})`; c.fillRect(x * P + 1, y * P + 1, P * 2 - 2, P * 2 - 2); }
        c.strokeStyle = "rgba(217,172,101,0.45)"; c.lineWidth = 2;
        for (let y = 4; y < MAP_H; y += 8) { c.beginPath(); c.moveTo(x0, y * P); c.lineTo(x0 + w, y * P); c.stroke(); }
      } else if (d === 1) { // food court: terracotta tiles
        c.fillStyle = "#3a2a22"; c.fillRect(x0, 0, w, H);
        for (let y = 0; y < MAP_H; y++) for (let x = lo; x <= hi; x++) { const v = r(); c.fillStyle = `rgb(${70 + v * 20},${44 + v * 12},${34 + v * 8})`; c.fillRect(x * P + 1, y * P + 1, P - 2, P - 2); }
      } else { // loading dock: concrete, yellow bay lines
        c.fillStyle = "#26282a"; c.fillRect(x0, 0, w, H);
        for (let i = 0; i < 2500; i++) { const v = 30 + Math.floor(r() * 20); c.fillStyle = `rgba(${v},${v},${v},0.5)`; c.fillRect(x0 + r() * w, r() * H, 2, 2); }
        c.fillStyle = "rgba(217,172,101,0.6)";
        for (let x = lo + 2; x < hi; x += 4) c.fillRect(x * P, 0, 4, 6 * P);
      }
    } else { // farm
      if (d === 0) { // grain yard: packed dirt, straw
        c.fillStyle = "#3b2f22"; c.fillRect(x0, 0, w, H);
        for (let i = 0; i < 3000; i++) { c.fillStyle = r() < 0.3 ? "rgba(200,170,90,0.35)" : "rgba(30,22,14,0.4)"; c.fillRect(x0 + r() * w, r() * H, 3 + r() * 6, 1.5); }
      } else if (d === 1) { // barnyard: worn grass with a dirt track
        c.fillStyle = "#2b3a22"; c.fillRect(x0, 0, w, H);
        for (let i = 0; i < 4000; i++) { const g = 40 + Math.floor(r() * 40); c.fillStyle = `rgba(${g - 10},${g + 20},${g - 20},0.6)`; c.fillRect(x0 + r() * w, r() * H, 2, 3); }
        c.fillStyle = "rgba(70,52,34,0.85)"; c.fillRect(x0, 18 * P, w, 4 * P);
      } else { // crop rows by the pond
        c.fillStyle = "#33281c"; c.fillRect(x0, 0, w, H);
        for (let y = 0; y < MAP_H; y += 2) { c.fillStyle = "rgba(80,110,50,0.55)"; c.fillRect(x0, y * P + 6, w, P - 12); }
      }
    }
  });
  for (const cx of [21, 43]) { // corridors
    c.fillStyle = theme === "mall" ? "#2c2a27" : "#4a3c2a";
    c.fillRect(cx * P, 0, P, H);
    c.fillStyle = theme === "mall" ? "rgba(217,172,101,0.6)" : "rgba(120,96,64,0.7)";
    for (let y = 0; y < H; y += 24) c.fillRect(cx * P + P / 2 - 2, y, 4, 12);
  }
}

// ---------------------------------------------------------------- mall
const STORES = ["NOODLE TERMINAL", "LEVERAGE & LACE", "BULL BAR", "CANDLE CO.", "DARK POOL ARCADE", "DIAMOND HANDS", "SHORT STACK DINER", "LIQUID GOLD SPA"];
export function buildMall(scene: THREE.Scene, r: () => number) {
  const wall = std(0x2b2723, 0.7, 0.1), trim = std(0x6a5a44, 0.4, 0.7), glass = new THREE.MeshStandardMaterial({ color: 0x1a1d20, roughness: 0.05, metalness: 0.9, envMapIntensity: 1.4 });
  const warm = glow(0xf0cf95), teal = glow(PAL.teal);
  const walls: THREE.BufferGeometry[] = [], trims: THREE.BufferGeometry[] = [], glasses: THREE.BufferGeometry[] = [], lights: THREE.BufferGeometry[] = [], tealL: THREE.BufferGeometry[] = [];
  // North: two storeys of storefronts with a balcony.
  for (let i = 0; i < 8; i++) {
    const x = 4 + i * 8;
    walls.push(box(8, 9, 1.2, x, 4.5, -1.6));
    glasses.push(box(6.4, 3, 0.1, x, 1.7, -0.95));
    lights.push(box(6.4, 0.08, 0.08, x, 3.3, -0.9));
    glasses.push(box(6.4, 2.4, 0.1, x, 6.4, -0.95));
    const s = new Sign(5.6, 0.9, 400); s.draw(STORES[i], i % 2 ? "OPEN LATE" : "CLOSED · AFTER HOURS", i % 3 ? "#D9AC65" : "#45C9B2"); s.mesh.position.set(x, 4.1, -0.88); scene.add(s.mesh);
  }
  trims.push(box(MAP_W + 6, 0.25, 2.2, MAP_W / 2, 4.9, -0.6)); // balcony floor
  trims.push(box(MAP_W + 6, 0.08, 0.08, MAP_W / 2, 5.95, 0.45)); // railing
  for (let x = -2; x <= MAP_W + 2; x += 2) trims.push(box(0.06, 1, 0.06, x, 5.45, 0.45));
  // Skylight frame high above the north half (the camera looks under it).
  for (let x = -2; x <= MAP_W + 2; x += 6) trims.push(box(0.3, 0.3, 14, x, 15, 4));
  trims.push(box(MAP_W + 6, 0.3, 0.3, MAP_W / 2, 15, -3), box(MAP_W + 6, 0.3, 0.3, MAP_W / 2, 15, 11));
  // West / east: storefront walls and escalators.
  for (const side of [-1, 1]) {
    const x = side < 0 ? -1.6 : MAP_W + 1.6;
    for (let z = 0; z < MAP_H; z += 8) {
      walls.push(box(1.2, 5.5, 8, x, 2.75, z + 4));
      glasses.push(box(0.1, 2.6, 6, x - side * 0.65, 1.5, z + 4));
      (z % 16 ? tealL : lights).push(box(0.08, 0.08, 6, x - side * 0.7, 2.95, z + 4));
    }
    const esc = new THREE.BoxGeometry(1.4, 0.3, 9); esc.rotateX(-0.5); esc.translate(x - side * 1.6, 2.3, 22); trims.push(esc);
    trims.push(box(0.08, 0.9, 9.2, x - side * 0.9, 2.9, 22), box(0.08, 0.9, 9.2, x - side * 2.3, 2.9, 22));
  }
  // South: low planters and benches only.
  for (let x = 2; x < MAP_W; x += 6) { trims.push(box(2.6, 0.6, 1, x, 0.3, MAP_H + 1.6)); }
  const leafMat = std(0x2f4a2e, 0.8, 0);
  const leaves: THREE.BufferGeometry[] = [];
  for (let x = 2; x < MAP_W; x += 6) { const g = new THREE.SphereGeometry(0.7, 8, 6); g.scale(1.6, 0.6, 0.8); g.translate(x, 0.9, MAP_H + 1.6); leaves.push(g); }
  // Kiosks on the corridors' outer ends and a fountain north of the food court (outside the floor).
  const fountain = new THREE.CylinderGeometry(3, 3.2, 0.6, 24); fountain.translate(32, 0.3, -6); trims.push(fountain);
  const water = new THREE.Mesh(new THREE.CircleGeometry(2.8, 24), new THREE.MeshStandardMaterial({ color: 0x0f2a2a, roughness: 0.05, metalness: 0.8 }));
  water.rotation.x = -Math.PI / 2; water.position.set(32, 0.62, -6); scene.add(water);
  add(scene, walls, wall); add(scene, trims, trim, true); add(scene, glasses, glass); add(scene, lights, warm); add(scene, tealL, teal); add(scene, leaves, leafMat);
  // Warm downlights along the shopfronts (sources for the colour on the floor).
  for (let x = 8; x < MAP_W; x += 16) { const l = new THREE.PointLight(0xf0cf95, 18, 16, 1.4); l.position.set(x, 4.5, 1.5); scene.add(l); }
  // Hanging banners over the corridors (high, thin).
  const banners: THREE.Mesh[] = [];
  for (const cx of [21.5, 43.5]) { const s = new Sign(1.4, 3.6, 160); s.draw("SALE", "-50%", "#E4514E"); s.mesh.position.set(cx, 8, 2); scene.add(s.mesh); banners.push(s.mesh); }
  return { tick(t: number) { banners.forEach((b, i) => (b.rotation.y = Math.sin(t / 1400 + i) * 0.12)); } };
}

// ---------------------------------------------------------------- farm
export function buildFarm(scene: THREE.Scene, r: () => number) {
  const red = std(0x6e2a22, 0.8, 0.05), white = std(0xcfc6b4, 0.7, 0.05), metal = std(0x8a8f92, 0.35, 0.8), wood = std(0x4b3826, 0.85, 0), roof = std(0x2e2a28, 0.7, 0.3);
  const hay = std(0xb08a3c, 0.9, 0), leaf = std(0x2d4626, 0.85, 0), trunk = std(0x3a2a1c, 0.9, 0), corn = std(0x6c8a3a, 0.8, 0);
  const reds: THREE.BufferGeometry[] = [], whites: THREE.BufferGeometry[] = [], metals: THREE.BufferGeometry[] = [], woods: THREE.BufferGeometry[] = [], roofs: THREE.BufferGeometry[] = [];
  const hays: THREE.BufferGeometry[] = [], leaves: THREE.BufferGeometry[] = [], trunks: THREE.BufferGeometry[] = [], corns: THREE.BufferGeometry[] = [];
  // Barn north of the barnyard (Factory district).
  reds.push(box(14, 7, 9, 32, 3.5, -7));
  const gable = new THREE.CylinderGeometry(0.01, 7.6, 4, 4, 1); gable.rotateY(Math.PI / 4); gable.scale(1.32, 1, 0.84); gable.translate(32, 9, -7); roofs.push(gable);
  whites.push(box(4, 5, 0.2, 32, 2.5, -2.4), box(0.3, 7.2, 9.2, 25, 3.6, -7), box(0.3, 7.2, 9.2, 39, 3.6, -7));
  // Silos north of the grain yard (Tower district).
  for (const [x, z, h] of [[5, -6, 18], [10, -8, 22], [15, -5, 16]] as const) {
    const s = new THREE.CylinderGeometry(2, 2, h, 20); s.translate(x, h / 2, z); metals.push(s);
    const dome = new THREE.SphereGeometry(2, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2); dome.translate(x, h, z); metals.push(dome);
    for (let k = 3; k < h; k += 3) { const band = new THREE.CylinderGeometry(2.05, 2.05, 0.15, 20); band.translate(x, k, z); roofs.push(band); }
  }
  // Windmill north-east (Harbor district) — blades turn.
  const mill = new THREE.CylinderGeometry(0.4, 1.4, 16, 8); mill.translate(56, 8, -8); woods.push(mill);
  const blades = new THREE.Group(); blades.position.set(56, 15.5, -6.6);
  for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 6, 0.08), white); b.position.y = 3; const arm = new THREE.Group(); arm.rotation.z = (k * Math.PI) / 2; arm.add(b); blades.add(arm); }
  scene.add(blades);
  // Pond east with a jetty.
  const pond = new THREE.Mesh(new THREE.CircleGeometry(12, 40), new THREE.MeshStandardMaterial({ color: 0x14242a, roughness: 0.08, metalness: 0.7 }));
  pond.rotation.x = -Math.PI / 2; pond.scale.set(1, 1.8, 1); pond.position.set(80, -0.05, 20); scene.add(pond);
  for (let k = 0; k < 8; k++) woods.push(box(1.6, 0.12, 0.5, 70 + k * 0.4, 0.3, 14 + k * 0.6));
  // Cornfield beyond the west edge, fences round the playfield, hay bales, trees, a tractor.
  for (let x = -18; x < -3; x += 1.2) for (let z = -2; z < MAP_H + 2; z += 0.9) corns.push(box(0.12, 1.6 + r() * 0.6, 0.12, x + r() * 0.3, 0.9, z));
  for (let x = 0; x <= MAP_W; x += 2) { woods.push(box(0.12, 1, 0.12, x, 0.5, -0.8)); }
  woods.push(box(MAP_W, 0.08, 0.06, MAP_W / 2, 0.8, -0.8), box(MAP_W, 0.08, 0.06, MAP_W / 2, 0.45, -0.8));
  for (let z = 0; z <= MAP_H; z += 2) { woods.push(box(0.12, 1, 0.12, -0.8, 0.5, z), box(0.12, 1, 0.12, MAP_W + 0.8, 0.5, z)); }
  for (let k = 0; k < 14; k++) { const g = new THREE.CylinderGeometry(0.7, 0.7, 1.2, 14); g.rotateZ(Math.PI / 2); g.translate(-2 - r() * 6 + (k % 2 ? MAP_W + 10 : 0), 0.7, 2 + k * 2.8); hays.push(g); }
  for (let k = 0; k < 16; k++) {
    const x = k % 2 ? -22 - r() * 10 : MAP_W + 14 + r() * 10, z = -6 + k * 3.2, h = 3 + r() * 3;
    const t = new THREE.CylinderGeometry(0.25, 0.35, h, 6); t.translate(x, h / 2, z); trunks.push(t);
    const c = new THREE.SphereGeometry(1.8 + r(), 10, 8); c.translate(x, h + 1.2, z); leaves.push(c);
  }
  reds.push(box(2.4, 1.2, 1.4, 46, 1.2, -4)); roofs.push(box(1.2, 1, 1.2, 45.6, 2.3, -4));
  for (const [dx, dz, rr] of [[-0.9, -0.8, 0.6], [-0.9, 0.8, 0.6], [1, -0.8, 0.4], [1, 0.8, 0.4]] as const) { const w = new THREE.CylinderGeometry(rr, rr, 0.3, 14); w.rotateX(Math.PI / 2); w.translate(46 + dx, rr, -4 + dz); roofs.push(w); }
  add(scene, reds, red, true); add(scene, whites, white); add(scene, metals, metal, true); add(scene, woods, wood, true); add(scene, roofs, roof, true);
  add(scene, hays, hay, true); add(scene, leaves, leaf, true); add(scene, trunks, trunk); add(scene, corns, corn);
  // Lanterns (warm sources) on the fence line and a barn lamp.
  for (let x = 6; x < MAP_W; x += 14) { const l = new THREE.PointLight(0xffb070, 10, 12, 1.5); l.position.set(x, 2.5, -1); scene.add(l); const m = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.35, 0.25), glow(0xffc07a)); m.position.set(x, 1.4, -0.8); scene.add(m); }
  // Fireflies.
  const N = 160, pos = new Float32Array(N * 3), seed = new Float32Array(N);
  for (let i = 0; i < N; i++) { pos.set([r() * MAP_W, 0.5 + r() * 2.5, r() * MAP_H], i * 3); seed[i] = r() * 100; }
  const fg = new THREE.BufferGeometry(); fg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const flies = new THREE.Points(fg, new THREE.PointsMaterial({ color: 0xf3e38a, size: 0.12, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  scene.add(flies);
  return {
    tick(t: number, dt: number) {
      blades.rotation.z -= dt * 0.6;
      const a = fg.attributes.position as THREE.BufferAttribute, arr = a.array as Float32Array;
      for (let i = 0; i < N; i++) { arr[i * 3] += Math.sin(t / 900 + seed[i]) * dt * 0.4; arr[i * 3 + 1] = 0.5 + 1.2 * (1 + Math.sin(t / 1300 + seed[i])); arr[i * 3 + 2] += Math.cos(t / 1100 + seed[i]) * dt * 0.4; }
      a.needsUpdate = true;
    },
  };
}
