// RAZKYN 3D world (Three.js): the playable 64 × 40 tile market floor plus the city around it.
// Everything here is original procedural geometry and canvas-drawn textures (no third-party assets).
// World units: 1 unit = 1 map tile. Map x → world x, map y → world z (on-chain units are tile × 100).
//
// Layout (camera looks north from the south, so nothing tall is placed south of the playfield):
//   north  — district skylines: glass towers (NVDA Tower / Tower), factory halls + chimneys (Factory),
//            container stacks + cranes (Harbor);  east — harbor water, cranes, a moored cargo ship;
//   west   — more towers;  south — low barriers and street lamps only (no camera occlusion).
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { DISTRICT_TILES, EXITS, HAZARD_ROWS, MAP_H, MAP_W, TERMINALS } from "../../lib/chain";
import { dressCity } from "./dressing";
import { LOOK, buildFarm, buildMall, paintThemedFloor, type Theme } from "./themes";

/** Market Noir palette. */
export const PAL = {
  carbon: 0x10151a, gunmetal: 0x303b43, silver: 0xc8d2d1, amber: 0xd9ac65, red: 0xe4514e, teal: 0x45c9b2,
  night: 0x0a0e12, steel: 0x58646c, concrete: 0x2a3034,
};
export const CSS = {
  carbon: "#10151A", gunmetal: "#303B43", silver: "#C8D2D1", amber: "#D9AC65", red: "#E4514E", teal: "#45C9B2",
};

/** Seeded RNG so the city looks the same on every load. */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---------------------------------------------------------------- fog of war (world space)
/** Shared uniforms: the player's XZ position and vision radius darken the floor beyond sight. */
export const fow = {
  uFowCenter: { value: new THREE.Vector2(32, 20) },
  uFowRadius: { value: 8 },
  uFowOn: { value: 0 },
};
/** Patch a built-in material so fragments beyond the vision radius darken (real world-space falloff). */
export function patchFow<M extends THREE.Material>(m: M, strength = 0.82): M {
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, fow);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vFowWorld;")
      .replace("#include <project_vertex>", `#include <project_vertex>
vec4 fowP = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
fowP = instanceMatrix * fowP;
#endif
vFowWorld = (modelMatrix * fowP).xyz;`);
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vFowWorld;\nuniform vec2 uFowCenter;\nuniform float uFowRadius;\nuniform float uFowOn;")
      .replace("#include <dithering_fragment>", `#include <dithering_fragment>
if (uFowOn > 0.5) {
  float fowD = distance(vFowWorld.xz, uFowCenter);
  float fowK = smoothstep(uFowRadius * 0.72, uFowRadius * 1.04, fowD);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * ${(1 - strength).toFixed(2)}, fowK);
}`);
  };
  m.customProgramCacheKey = () => `fow${strength}`;
  return m;
}

// ---------------------------------------------------------------- canvas textures
function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, srgb = true) {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  draw(cv.getContext("2d")!);
  const t = new THREE.CanvasTexture(cv);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** The market floor: one texture for the whole 64 × 40 playfield, 32 px per tile. */
function floorTexture(theme: Theme) {
  const P = 32;
  const r = rng(7);
  return canvasTex(MAP_W * P, MAP_H * P, (c) => {
    c.fillStyle = "#14191d"; c.fillRect(0, 0, MAP_W * P, MAP_H * P);
    if (theme !== "street") paintThemedFloor(c, theme, P, r);
    else {
    DISTRICT_TILES.forEach(([lo, hi], d) => {
      const x0 = lo * P, w = (hi - lo + 1) * P, H = MAP_H * P;
      if (d === 0) { // polished stone plaza: big slabs, silver seams
        c.fillStyle = "#1a2126"; c.fillRect(x0, 0, w, H);
        for (let y = 0; y < MAP_H; y += 2) for (let x = lo; x <= hi; x += 2) {
          const v = 22 + Math.floor(r() * 10);
          c.fillStyle = `rgb(${v},${v + 6},${v + 10})`; c.fillRect(x * P + 1, y * P + 1, P * 2 - 2, P * 2 - 2);
        }
        c.strokeStyle = "rgba(200,210,209,0.10)"; c.lineWidth = 1;
        for (let x = lo; x <= hi + 1; x += 2) { c.beginPath(); c.moveTo(x * P, 0); c.lineTo(x * P, H); c.stroke(); }
        for (let y = 0; y <= MAP_H; y += 2) { c.beginPath(); c.moveTo(x0, y * P); c.lineTo(x0 + w, y * P); c.stroke(); }
      } else if (d === 1) { // factory concrete: stains, expansion joints, yellow lane paint
        c.fillStyle = "#24282a"; c.fillRect(x0, 0, w, H);
        for (let i = 0; i < 260; i++) {
          c.fillStyle = `rgba(${r() < 0.5 ? "0,0,0" : "60,64,66"},${0.08 + r() * 0.12})`;
          c.beginPath(); c.ellipse(x0 + r() * w, r() * H, 4 + r() * 28, 3 + r() * 16, r() * 3, 0, Math.PI * 2); c.fill();
        }
        c.strokeStyle = "rgba(0,0,0,0.45)"; c.lineWidth = 2;
        for (let x = lo; x <= hi + 1; x += 4) { c.beginPath(); c.moveTo(x * P, 0); c.lineTo(x * P, H); c.stroke(); }
        for (let y = 0; y <= MAP_H; y += 4) { c.beginPath(); c.moveTo(x0, y * P); c.lineTo(x0 + w, y * P); c.stroke(); }
        c.fillStyle = "rgba(217,172,101,0.55)";
        for (const y of [6, 34]) c.fillRect(x0, y * P - 3, w, 6);
      } else { // harbor asphalt: wet, lane markings, container footprints
        c.fillStyle = "#121618"; c.fillRect(x0, 0, w, H);
        for (let i = 0; i < 4000; i++) { const v = 14 + Math.floor(r() * 22); c.fillStyle = `rgba(${v},${v + 3},${v + 5},0.6)`; c.fillRect(x0 + r() * w, r() * H, 2, 2); }
        c.strokeStyle = "rgba(200,210,209,0.35)"; c.lineWidth = 3; c.setLineDash([22, 18]);
        for (const y of [10, 20, 30]) { c.beginPath(); c.moveTo(x0, y * P); c.lineTo(x0 + w, y * P); c.stroke(); }
        c.setLineDash([]);
        c.strokeStyle = "rgba(217,172,101,0.18)"; c.lineWidth = 2;
        for (let i = 0; i < 10; i++) c.strokeRect(x0 + (2 + ((i * 7) % (hi - lo - 6))) * P, (2 + ((i * 11) % (MAP_H - 5))) * P, 5 * P, 2 * P);
      }
    });
    // Corridors between districts: steel grating.
    for (const cx of [21, 43]) {
      c.fillStyle = "#2b3439"; c.fillRect(cx * P, 0, P, MAP_H * P);
      c.strokeStyle = "rgba(0,0,0,0.5)"; c.lineWidth = 1;
      for (let y = 0; y < MAP_H * P; y += 6) { c.beginPath(); c.moveTo(cx * P, y); c.lineTo(cx * P + P, y); c.stroke(); }
      c.fillStyle = "rgba(217,172,101,0.7)";
      for (let y = 0; y < MAP_H * P; y += 40) { c.fillRect(cx * P, y, 4, 20); c.fillRect(cx * P + P - 4, y + 20, 4, 20); }
    }
    }
    // Terminal pads.
    for (const [tx, ty] of TERMINALS) {
      c.strokeStyle = "rgba(69,201,178,0.7)"; c.lineWidth = 3;
      c.beginPath(); c.arc(tx * P + P / 2, ty * P + P / 2, P * 1.05, 0, Math.PI * 2); c.stroke();
    }
    // Exit pads: hazard chevrons.
    for (const [ex, ey] of EXITS) {
      const cx = ex * P + P / 2, cy = ey * P + P / 2;
      c.fillStyle = "#0c0f11"; c.beginPath(); c.arc(cx, cy, P * 1.3, 0, Math.PI * 2); c.fill();
      for (let k = 0; k < 12; k++) {
        c.fillStyle = k % 2 ? "#d9ac65" : "#10151a";
        c.beginPath(); c.moveTo(cx, cy); c.arc(cx, cy, P * 1.3, (k * Math.PI) / 6, ((k + 1) * Math.PI) / 6); c.fill();
      }
      c.fillStyle = "#0c0f11"; c.beginPath(); c.arc(cx, cy, P * 1.0, 0, Math.PI * 2); c.fill();
    }
    // Map border paint.
    c.strokeStyle = "rgba(217,172,101,0.8)"; c.lineWidth = 6; c.strokeRect(3, 3, MAP_W * P - 6, MAP_H * P - 6);
  });
}

/** Facade: dark panels with a grid of windows, some lit (amber, silver, teal). Tiles every 4 × 4 units. */
function facadeTextures() {
  const r = rng(11);
  const S = 256, cells = 8;
  const lit: [number, number, string][] = [];
  for (let y = 0; y < cells; y++) for (let x = 0; x < cells; x++) {
    const p = r();
    if (p < 0.2) lit.push([x, y, p < 0.06 ? "#45c9b2" : p < 0.24 ? "#e8c27e" : "#c8d2d1"]);
  }
  const map = canvasTex(S, S, (c) => {
    c.fillStyle = "#0d1114"; c.fillRect(0, 0, S, S);
    const cw = S / cells;
    for (let y = 0; y < cells; y++) for (let x = 0; x < cells; x++) {
      c.fillStyle = "#1b2329"; c.fillRect(x * cw + 6, y * cw + 6, cw - 12, cw - 10);
    }
    c.fillStyle = "#0b0e10"; c.fillRect(0, 0, 4, 4); // roof texel (uv 0,0)
    for (const [x, y, col] of lit) { c.fillStyle = col; c.globalAlpha = 0.35; c.fillRect(x * cw + 6, y * cw + 6, cw - 12, cw - 10); }
    c.globalAlpha = 1;
  });
  const emissive = canvasTex(S, S, (c) => {
    c.fillStyle = "#000"; c.fillRect(0, 0, S, S);
    const cw = S / cells;
    for (const [x, y, col] of lit) { c.fillStyle = col; c.fillRect(x * cw + 7, y * cw + 7, cw - 14, cw - 12); }
  });
  for (const t of [map, emissive]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  return { map, emissive };
}

/** Box with UVs in world units (one texture repeat per 4 units); roofs sample the dark corner texel. */
function cityBox(w: number, h: number, d: number, x: number, y: number, z: number, ry = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const R = 4;
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z (4 vertices each).
  const dims: [number, number][] = [[d, h], [d, h], [0, 0], [0, 0], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
    const i = f * 4 + k;
    const [du, dv] = dims[f];
    uv.setXY(i, du ? uv.getX(i) * (du / R) : 0.001, dv ? uv.getY(i) * (dv / R) : 0.999);
  }
  g.rotateY(ry);
  g.translate(x, y + h / 2, z);
  return g;
}

// ---------------------------------------------------------------- signs (market tickers in the city)
export class Sign {
  readonly mesh: THREE.Mesh;
  private cv = document.createElement("canvas");
  private tex: THREE.CanvasTexture;
  private last = "";
  constructor(w: number, h: number, private px = 512) {
    this.cv.width = px; this.cv.height = Math.round((px * h) / w);
    this.tex = new THREE.CanvasTexture(this.cv);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false, transparent: true }));
  }
  /** Redraws only when the text changes. */
  draw(title: string, line: string, color: string) {
    const key = title + line + color;
    if (key === this.last) return;
    this.last = key;
    const c = this.cv.getContext("2d")!, W = this.cv.width, H = this.cv.height;
    c.clearRect(0, 0, W, H);
    c.fillStyle = "rgba(10,14,18,0.88)"; c.fillRect(0, 0, W, H);
    c.strokeStyle = color; c.lineWidth = Math.max(3, H * 0.035); c.strokeRect(4, 4, W - 8, H - 8);
    c.fillStyle = "#C8D2D1"; c.font = `700 ${Math.round(H * 0.3)}px "Barlow Condensed", "Arial Narrow", sans-serif`; c.textAlign = "center"; c.textBaseline = "middle";
    c.fillText(title, W / 2, H * 0.34);
    c.fillStyle = color; c.font = `600 ${Math.round(H * 0.26)}px "JetBrains Mono", monospace`;
    c.fillText(line, W / 2, H * 0.72);
    this.tex.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- the world
export type World = {
  scene: THREE.Scene;
  floor: THREE.Mesh;
  districtLights: THREE.PointLight[];
  signs: Sign[];
  hazards: { mesh: THREE.Mesh; level: number }[][]; // [district][level 1, 2]
  embers: THREE.Points[];
  rain: THREE.LineSegments;
  steam: THREE.Points;
  water: THREE.Mesh | null;
  tick: (t: number, dt: number, focus: THREE.Vector3) => void;
};

export function buildWorld(renderer: THREE.WebGLRenderer, theme: Theme = "street"): World {
  const L = LOOK[theme];
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(L.bg);
  scene.fog = new THREE.FogExp2(L.fog, L.fogD);

  // Lighting: cool moonlight (shadows on the playfield), dim sky fill, district market lights.
  scene.add(new THREE.HemisphereLight(L.sky, L.ground, L.hemi));
  const moon = new THREE.DirectionalLight(L.moon, L.moonI);
  moon.position.set(MAP_W / 2 - 18, 40, MAP_H / 2 + 22);
  moon.target.position.set(MAP_W / 2, 0, MAP_H / 2);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  Object.assign(moon.shadow.camera, { left: -40, right: 40, top: 30, bottom: -30, near: 5, far: 110 });
  moon.shadow.bias = -0.0006;
  moon.shadow.normalBias = 0.02;
  scene.add(moon, moon.target);

  const districtLights = DISTRICT_TILES.map(([lo, hi]) => {
    const l = new THREE.PointLight(PAL.amber, 30, 42, 1.0);
    l.position.set((lo + hi + 1) / 2, 7, MAP_H / 2);
    scene.add(l);
    return l;
  });

  // Floor.
  const floorTex = floorTexture(theme);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(MAP_W, MAP_H),
    patchFow(new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.5, metalness: 0.18, envMapIntensity: 1.0 }), 0.62),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(MAP_W / 2, 0, MAP_H / 2);
  floor.receiveShadow = true;
  scene.add(floor);
  // Ground outside the playfield (streets / quay), slightly darker.
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(260, 200), new THREE.MeshStandardMaterial({ color: L.outer, roughness: 0.6, metalness: 0.2 }));
  outer.rotation.x = -Math.PI / 2; outer.position.set(MAP_W / 2, -0.02, MAP_H / 2); outer.receiveShadow = true;
  scene.add(outer);
  // Curb around the playfield.
  const curbMat = new THREE.MeshStandardMaterial({ color: PAL.gunmetal, roughness: 0.6, metalness: 0.5 });
  const curbs = [
    cityBox(MAP_W + 1, 0.25, 0.5, MAP_W / 2, 0, -0.25), cityBox(MAP_W + 1, 0.25, 0.5, MAP_W / 2, 0, MAP_H + 0.25),
    cityBox(0.5, 0.25, MAP_H, -0.25, 0, MAP_H / 2), cityBox(0.5, 0.25, MAP_H, MAP_W + 0.25, 0, MAP_H / 2),
  ];
  scene.add(new THREE.Mesh(mergeGeometries(curbs), curbMat));

  const r = rng(3);
  const chimneys: [number, number][] = [[25, -10], [33, -12], [40, -9]];
  let water: THREE.Mesh | null = null;
  let themed: { tick: (t: number, dt: number) => void } | null = null;
  if (theme === "street") {
  // City blocks (one merged mesh, one material).
  const fac = facadeTextures();
  const facadeMat = new THREE.MeshStandardMaterial({ map: fac.map, emissiveMap: fac.emissive, emissive: 0xffffff, emissiveIntensity: 0.8, roughness: 0.55, metalness: 0.45 });
  const glassMat = new THREE.MeshStandardMaterial({ map: fac.map, emissiveMap: fac.emissive, emissive: 0xbfeee6, emissiveIntensity: 0.7, roughness: 0.18, metalness: 0.85 });
  const towers: THREE.BufferGeometry[] = [], blocks: THREE.BufferGeometry[] = [];
  // North of Tower district + west edge: glass towers.
  for (let x = -14; x < 22; x += 5 + r() * 2) {
    const w = 4 + r() * 3, d = 4 + r() * 4, h = 16 + r() * 30;
    towers.push(cityBox(w, h, d, x, 0, -4 - d / 2 - r() * 6));
  }
  for (let z = -2; z < MAP_H + 4; z += 6 + r() * 2) {
    const w = 5 + r() * 4, h = z > MAP_H - 6 ? 4 + r() * 3 : 12 + r() * 24;
    towers.push(cityBox(w, h, 5, -5 - w / 2, 0, z));
  }
  // North of Factory: halls (sawtooth roofs added below) and service blocks.
  for (let x = 22; x < 43; x += 7) blocks.push(cityBox(6.4, 6 + r() * 3, 7, x + 3.2, 0, -6.5));
  // North of Harbor: warehouses behind the container yard.
  for (let x = 45; x < 70; x += 8) blocks.push(cityBox(7, 5 + r() * 4, 6, x + 3.5, 0, -12));
  // Far skyline behind everything.
  for (let x = -30; x < 100; x += 6 + r() * 4) {
    const h = 20 + r() * 44, w = 5 + r() * 5;
    towers.push(cityBox(w, h, 6, x, 0, -32 - r() * 16));
  }
  scene.add(new THREE.Mesh(mergeGeometries(towers), glassMat));
  const blockMesh = new THREE.Mesh(mergeGeometries(blocks), facadeMat);
  blockMesh.castShadow = true;
  scene.add(blockMesh);

  // Factory details: sawtooth roofs, chimneys, pipes.
  const steelMat = new THREE.MeshStandardMaterial({ color: PAL.steel, roughness: 0.45, metalness: 0.75 });
  const rustMat = new THREE.MeshStandardMaterial({ color: 0x4a3a30, roughness: 0.8, metalness: 0.4 });
  const saw: THREE.BufferGeometry[] = [], pipes: THREE.BufferGeometry[] = [];
  for (let x = 22; x < 43; x += 7) for (let k = 0; k < 3; k++) {
    const g = new THREE.CylinderGeometry(1.2, 1.2, 6.4, 3, 1);
    g.rotateZ(Math.PI / 2); g.translate(x + 3.2, 9.4, -9 + k * 2.4);
    saw.push(g);
  }
  for (const [cx, cz] of chimneys) {
    const g = new THREE.CylinderGeometry(0.9, 1.3, 22, 12); g.translate(cx, 11, cz); pipes.push(g);
    const band = new THREE.CylinderGeometry(1.05, 1.05, 0.5, 12); band.translate(cx, 18, cz); pipes.push(band);
  }
  for (let k = 0; k < 4; k++) { // horizontal pipe runs along the factory's north wall
    const g = new THREE.CylinderGeometry(0.22, 0.22, 21, 8); g.rotateZ(Math.PI / 2); g.translate(32, 1.2 + k * 0.6, -2.2 - k * 0.35); pipes.push(g);
  }
  scene.add(new THREE.Mesh(mergeGeometries(saw), rustMat));
  const pipeMesh = new THREE.Mesh(mergeGeometries(pipes), steelMat);
  pipeMesh.castShadow = true;
  scene.add(pipeMesh);

  // Harbor: container stacks, cranes, water, a cargo ship.
  const contColors = [0x7a3b30, 0x2f4d58, 0x6b5a32, 0x3e4a3c, 0x55585c];
  const contGeo = new THREE.BoxGeometry(2.4, 1.1, 1.0);
  const contMat = new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.5 });
  const spots: THREE.Matrix4[] = [], cols: THREE.Color[] = [];
  const stack = (x: number, z: number, n: number, rot = 0) => {
    for (let k = 0; k < n; k++) {
      const m = new THREE.Matrix4().makeRotationY(rot).setPosition(x, 0.55 + k * 1.1, z);
      spots.push(m); cols.push(new THREE.Color(contColors[Math.floor(r() * contColors.length)]));
    }
  };
  for (let x = 45; x < 66; x += 2.6) for (let row = 0; row < 3; row++) stack(x, -2.2 - row * 1.15, 1 + Math.floor(r() * 4));
  for (let z = 4; z < 40; z += 6) stack(70 + r() * 2, z, 1 + Math.floor(r() * 3), Math.PI / 2);
  const containers = new THREE.InstancedMesh(contGeo, contMat, spots.length);
  spots.forEach((m, i) => { containers.setMatrixAt(i, m); containers.setColorAt(i, cols[i]); });
  containers.castShadow = true;
  scene.add(containers);
  const crane: THREE.BufferGeometry[] = [];
  const addCrane = (x: number, z: number, h: number, boomDir: number) => {
    for (const [dx, dz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) { const g = new THREE.BoxGeometry(0.35, h, 0.35); g.translate(x + dx, h / 2, z + dz); crane.push(g); }
    const top = new THREE.BoxGeometry(3, 0.6, 3); top.translate(x, h, z); crane.push(top);
    const boom = new THREE.BoxGeometry(0.6, 0.6, 22); boom.translate(x, h + 0.6, z + boomDir * 6); crane.push(boom);
    const cab = new THREE.BoxGeometry(1.4, 1.2, 1.4); cab.translate(x, h - 1.5, z + boomDir * 1.5); crane.push(cab);
  };
  addCrane(52, -9, 16, 1); addCrane(61, -10, 18, 1); addCrane(76, 10, 15, 0); addCrane(76, 28, 17, 0);
  const craneMesh = new THREE.Mesh(mergeGeometries(crane), new THREE.MeshStandardMaterial({ color: 0x9a7b45, roughness: 0.55, metalness: 0.6 }));
  craneMesh.castShadow = true;
  scene.add(craneMesh);
  water = new THREE.Mesh(new THREE.PlaneGeometry(90, 160), new THREE.MeshStandardMaterial({ color: 0x0a1418, roughness: 0.12, metalness: 0.9, envMapIntensity: 1.2 }));
  water.rotation.x = -Math.PI / 2; water.position.set(122, -0.4, 10);
  scene.add(water);
  const quay = new THREE.Mesh(cityBox(2, 0.6, 120, 78, -0.6, 10), curbMat);
  scene.add(quay);
  const ship: THREE.BufferGeometry[] = [];
  { const hull = new THREE.BoxGeometry(9, 4, 46); hull.translate(88, 1.2, 14); ship.push(hull);
    const bridge = new THREE.BoxGeometry(7, 6, 5); bridge.translate(88, 6.2, -4); ship.push(bridge); }
  scene.add(new THREE.Mesh(mergeGeometries(ship), new THREE.MeshStandardMaterial({ color: 0x2b2f33, roughness: 0.6, metalness: 0.6 })));

  // South edge: low barriers and lamps (never tall: the camera sits south of the player).
  const barrier: THREE.BufferGeometry[] = [];
  for (let x = 1; x < MAP_W; x += 3) { const g = new THREE.BoxGeometry(2.2, 0.8, 0.4); g.translate(x + 0.5, 0.4, MAP_H + 1.4); barrier.push(g); }
  scene.add(new THREE.Mesh(mergeGeometries(barrier), new THREE.MeshStandardMaterial({ color: 0x3a4248, roughness: 0.7 })));
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xf3d9a6, toneMapped: false });
  const lampPosts: THREE.BufferGeometry[] = [], lampHeads: THREE.BufferGeometry[] = [];
  for (let x = 4; x < MAP_W; x += 12) for (const z of [-1.4, MAP_H + 2.4]) {
    const p = new THREE.CylinderGeometry(0.08, 0.1, 5, 6); p.translate(x, 2.5, z); lampPosts.push(p);
    const h = new THREE.BoxGeometry(0.9, 0.12, 0.25); h.translate(x, 5, z); lampHeads.push(h);
  }
  scene.add(new THREE.Mesh(mergeGeometries(lampPosts), steelMat), new THREE.Mesh(mergeGeometries(lampHeads), lampMat));

  } else themed = theme === "mall" ? buildMall(scene, r) : buildFarm(scene, r);

  // District signs (live district moves), mounted high on the north side, facing the camera.
  const signs = DISTRICT_TILES.map(([lo, hi]) => {
    const s = new Sign(11, 3.2);
    s.mesh.position.set((lo + hi + 1) / 2, 12.5, -3.2);
    scene.add(s.mesh);
    return s;
  });

  // Hazard overlays: cracked, glowing floor on the rows the program damages (HAZARD_ROWS).
  const crackTex = canvasTex(512, 256, (c) => {
    const rr = rng(5);
    c.clearRect(0, 0, 512, 256);
    c.strokeStyle = "rgba(255,120,90,1)"; c.lineCap = "round";
    for (let k = 0; k < 26; k++) {
      let x = rr() * 512, y = rr() * 256; c.lineWidth = 1 + rr() * 3; c.beginPath(); c.moveTo(x, y);
      for (let s = 0; s < 6; s++) { x += (rr() - 0.5) * 90; y += (rr() - 0.5) * 50; c.lineTo(x, y); }
      c.stroke();
    }
  });
  crackTex.wrapS = crackTex.wrapT = THREE.RepeatWrapping;
  const hazards = DISTRICT_TILES.map(([lo, hi]) => [1, 2].map((level) => {
    const [r0, r1] = HAZARD_ROWS[level];
    const w = hi - lo + 1, h = r1 - r0 + 1;
    const t = crackTex.clone(); t.repeat.set(w / 8, h / 4); t.needsUpdate = true;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, color: PAL.red, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(lo + w / 2, 0.03 + level * 0.005, r0 + h / 2);
    m.visible = false;
    scene.add(m);
    return { mesh: m, level };
  }));

  // Embers rising from cracked floors.
  const emberTex = canvasTex(32, 32, (c) => { const g = c.createRadialGradient(16, 16, 0, 16, 16, 16); g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(1, "rgba(255,255,255,0)"); c.fillStyle = g; c.fillRect(0, 0, 32, 32); });
  const embers = DISTRICT_TILES.map(([lo, hi]) => {
    const n = 160, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = lo + r() * (hi - lo + 1); pos[i * 3 + 1] = r() * 3; pos[i * 3 + 2] = 12 + r() * 16; }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const p = new THREE.Points(g, new THREE.PointsMaterial({ map: emberTex, color: 0xff7a4a, size: 0.35, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    p.visible = false; scene.add(p);
    return p;
  });

  // Chimney steam.
  const steamN = 120, steamPos = new Float32Array(steamN * 3);
  for (let i = 0; i < steamN; i++) { const c = chimneys[i % 3]; steamPos[i * 3] = c[0]; steamPos[i * 3 + 1] = 22 + r() * 10; steamPos[i * 3 + 2] = c[1]; }
  const steamGeo = new THREE.BufferGeometry(); steamGeo.setAttribute("position", new THREE.BufferAttribute(steamPos, 3));
  const steam = new THREE.Points(steamGeo, new THREE.PointsMaterial({ map: emberTex, color: 0x7d8a92, size: 3.2, transparent: true, opacity: 0.22, depthWrite: false }));
  steam.visible = theme === "street";
  scene.add(steam);

  // Rain: streaks in a box that follows the camera focus.
  const rainN = 1400, rainPos = new Float32Array(rainN * 6);
  for (let i = 0; i < rainN; i++) {
    const x = (r() - 0.5) * 60, y = r() * 26, z = (r() - 0.5) * 50;
    rainPos.set([x, y, z, x + 0.05, y - 0.45, z + 0.03], i * 6);
  }
  const rainGeo = new THREE.BufferGeometry(); rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0x9fb2bd, transparent: true, opacity: 0.13, depthWrite: false }));
  rain.frustumCulled = false;
  rain.visible = L.rain;
  scene.add(rain);

  // Environment reflections for wet metal.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x1a2329);
  const glowA = new THREE.Mesh(new THREE.PlaneGeometry(40, 10), new THREE.MeshBasicMaterial({ color: 0xd9ac65 })); glowA.position.set(0, 8, -20); envScene.add(glowA);
  const glowB = new THREE.Mesh(new THREE.PlaneGeometry(30, 8), new THREE.MeshBasicMaterial({ color: 0x45c9b2 })); glowB.position.set(-25, 5, 10); glowB.rotation.y = Math.PI / 2; envScene.add(glowB);
  scene.environment = pmrem.fromScene(envScene, 0.04).texture;
  pmrem.dispose();

  const dressing = theme === "street" ? dressCity(scene) : null;
  const tick = (t: number, dt: number, focus: THREE.Vector3) => {
    dressing?.tick(dt, focus);
    themed?.tick(t, dt);
    // Rain falls and wraps around the focus.
    const a = rainGeo.attributes.position as THREE.BufferAttribute;
    const arr = a.array as Float32Array;
    const fall = dt * 22;
    for (let i = 0; i < rainN; i++) {
      const o = i * 6;
      arr[o + 1] -= fall; arr[o + 4] -= fall;
      if (arr[o + 4] < 0) { arr[o + 1] += 26; arr[o + 4] += 26; }
    }
    a.needsUpdate = true;
    rain.position.set(focus.x, 0, focus.z);
    // Steam drifts up and east, then recycles.
    const s = steamGeo.attributes.position as THREE.BufferAttribute;
    const sa = s.array as Float32Array;
    for (let i = 0; i < steamN; i++) {
      sa[i * 3 + 1] += dt * (1.2 + (i % 5) * 0.2); sa[i * 3] += dt * 0.6;
      if (sa[i * 3 + 1] > 36) { const c = chimneys[i % 3]; sa[i * 3] = c[0]; sa[i * 3 + 1] = 22; sa[i * 3 + 2] = c[1]; }
    }
    s.needsUpdate = true;
    // Embers rise.
    for (const p of embers) {
      if (!p.visible) continue;
      const e = p.geometry.attributes.position as THREE.BufferAttribute;
      const ea = e.array as Float32Array;
      for (let i = 0; i < ea.length; i += 3) { ea[i + 1] += dt * (0.8 + ((i / 3) % 7) * 0.15); if (ea[i + 1] > 3.2) ea[i + 1] = 0; }
      e.needsUpdate = true;
    }
    if (water) (water.material as THREE.MeshStandardMaterial).roughness = 0.1 + 0.04 * Math.sin(t / 900);
  };

  return { scene, floor, districtLights, signs, hazards, embers, rain, steam, water, tick };
}
