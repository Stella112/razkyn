// Set dressing that gives the market floor vertical density without changing the rules: walls,
// ads, pipes and stairs stand OUTSIDE the 64 × 40 playfield (the program lets raiders walk every
// tile, so nothing inside the playfield may look solid); inside it there are only overhead gantries
// (pillars sit on the corridor edges), floor puddles, cables and steam vents.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { MAP_H, MAP_W } from "../../lib/chain";
import { PAL, Sign, rng } from "./world";

const box = (w: number, h: number, d: number, x: number, y: number, z: number) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; };

/** Original in-universe ad copy (no real brands). */
const ADS: [string, string, string][] = [
  ["LIQUIDITY IS A WEAPON", "BUY THE FEAR", "#D9AC65"], ["MARGIN CALL", "NO REFUNDS AFTER DARK", "#E4514E"],
  ["EXTRACT OR EVAPORATE", "EXITS OPEN 2:00 · 3:30 · 4:30", "#45C9B2"], ["SEALED CRATES", "CONTENTS UNKNOWN", "#D9AC65"],
  ["THE WIRE", "MARKETS NEVER SLEEP", "#C8D2D1"], ["VOLATILITY", "IS A FEATURE", "#E4514E"],
];

export function dressCity(scene: THREE.Scene) {
  const r = rng(21);
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x232b31, roughness: 0.7, metalness: 0.45 });
  const trimMat = new THREE.MeshStandardMaterial({ color: PAL.gunmetal, roughness: 0.45, metalness: 0.7 });
  const pipeMat = new THREE.MeshStandardMaterial({ color: 0x5b6870, roughness: 0.35, metalness: 0.85 });
  const glowAmber = new THREE.MeshBasicMaterial({ color: 0xe8c27e, toneMapped: false });
  const glowTeal = new THREE.MeshBasicMaterial({ color: PAL.teal, toneMapped: false });
  const walls: THREE.BufferGeometry[] = [], trims: THREE.BufferGeometry[] = [], pipes: THREE.BufferGeometry[] = [];
  const strips: THREE.BufferGeometry[] = [], tealStrips: THREE.BufferGeometry[] = [];

  // North wall (behind the playfield, the camera looks at it): stepped storefronts, vents, AC units.
  for (let x = -2; x < MAP_W + 2; x += 4) {
    const h = 3.2 + r() * 2.6;
    walls.push(box(4, h, 1.2, x + 2, h / 2, -1.4));
    trims.push(box(4, 0.18, 1.5, x + 2, h, -1.3));
    if (r() < 0.6) { const ac = box(0.9, 0.6, 0.5, x + 1 + r() * 2, 1.6 + r() * 1.5, -0.6); trims.push(ac); }
    if (r() < 0.5) strips.push(box(2.6, 0.06, 0.06, x + 2, 2.6, -0.76));
    else tealStrips.push(box(0.06, 1.4, 0.06, x + 0.4, 1.6, -0.76));
  }
  // Overhead pipe bundle along the north wall.
  for (let k = 0; k < 3; k++) { const g = new THREE.CylinderGeometry(0.14, 0.14, MAP_W + 6, 8); g.rotateZ(Math.PI / 2); g.translate(MAP_W / 2, 3.4 + k * 0.32, -0.85 + k * 0.05); pipes.push(g); }
  // West and east walls (seen at the sides), with stairs up to catwalks.
  for (const side of [-1, 1]) {
    const x = side < 0 ? -1.4 : MAP_W + 1.4;
    for (let z = 0; z < MAP_H; z += 5) {
      const h = 2.6 + r() * 2.2;
      walls.push(box(1.2, h, 5, x, h / 2, z + 2.5));
      trims.push(box(1.5, 0.16, 5, x, h, z + 2.5));
      if (r() < 0.5) strips.push(box(0.06, 0.06, 3.4, x - side * 0.62, 2.2, z + 2.5));
    }
    // Stairs (steps rising along z) against the wall.
    for (let s = 0; s < 10; s++) trims.push(box(1.1, 0.18, 0.5, x - side * 1.2, 0.18 + s * 0.3, 8 + s * 0.5));
    trims.push(box(1.1, 0.12, 6, x - side * 1.2, 3.1, 15)); // catwalk
    for (let z = 12; z <= 18; z += 1.5) trims.push(box(0.05, 0.9, 0.05, x - side * 1.75, 3.6, z)); // railing posts
    trims.push(box(0.05, 0.05, 6, x - side * 1.75, 4.05, 15));
  }
  scene.add(new THREE.Mesh(mergeGeometries(walls), wallMat));
  const trimMesh = new THREE.Mesh(mergeGeometries(trims), trimMat); trimMesh.castShadow = true; scene.add(trimMesh);
  scene.add(new THREE.Mesh(mergeGeometries(pipes), pipeMat));
  scene.add(new THREE.Mesh(mergeGeometries(strips), glowAmber), new THREE.Mesh(mergeGeometries(tealStrips), glowTeal));

  // Ad panels on the north wall.
  const ads: Sign[] = [];
  for (let i = 0; i < 6; i++) {
    const s = new Sign(5, 1.6, 400);
    const [a, b, c] = ADS[i];
    s.draw(a, b, c);
    s.mesh.position.set(5 + i * 11, 4.9 + (i % 2) * 0.6, -0.7);
    scene.add(s.mesh);
    ads.push(s);
  }

  // Gantries over the two corridors: pillars on the corridor edges, a deck and a banner overhead.
  const gantry: THREE.BufferGeometry[] = [];
  for (const cx of [21.5, 43.5]) {
    for (const z of [6, 20, 34]) {
      for (const dx of [-0.55, 0.55]) gantry.push(box(0.22, 6, 0.22, cx + dx, 3, z));
      gantry.push(box(1.6, 0.3, 2.2, cx, 6.1, z));
      gantry.push(box(0.12, 0.12, 14, cx - 0.6, 6.25, z));
      gantry.push(box(0.12, 0.12, 14, cx + 0.6, 6.25, z));
    }
  }
  const gantryMat = new THREE.MeshStandardMaterial({ color: PAL.gunmetal, roughness: 0.45, metalness: 0.7, transparent: true, opacity: 1 });
  const gantryMesh = new THREE.Mesh(mergeGeometries(gantry), gantryMat); gantryMesh.castShadow = true; scene.add(gantryMesh);

  // Puddles (mirror-like), cables and steam vents on the floor.
  const puddleMat = new THREE.MeshStandardMaterial({ color: 0x161d22, roughness: 0.12, metalness: 0.9, envMapIntensity: 0.2, transparent: true, opacity: 0.22, depthWrite: false });
  const puddles: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 46; i++) {
    const g = new THREE.CircleGeometry(0.6 + r() * 1.4, 18);
    g.scale(1, 0.4 + r() * 0.6, 1); g.rotateZ(r() * Math.PI); g.rotateX(-Math.PI / 2);
    g.translate(1 + r() * (MAP_W - 2), 0.012, 1 + r() * (MAP_H - 2));
    puddles.push(g);
  }
  const pm = new THREE.Mesh(mergeGeometries(puddles), puddleMat); pm.renderOrder = 1; scene.add(pm);
  const vents: THREE.Vector3[] = [];
  const ventGeo: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 9; i++) {
    const v = new THREE.Vector3(2 + r() * (MAP_W - 4), 0, 2 + r() * (MAP_H - 4));
    vents.push(v);
    const g = new THREE.CylinderGeometry(0.45, 0.45, 0.04, 16); g.translate(v.x, 0.02, v.z); ventGeo.push(g);
  }
  scene.add(new THREE.Mesh(mergeGeometries(ventGeo), trimMat));
  const steamTex = (() => { const cv = document.createElement("canvas"); cv.width = cv.height = 64; const c = cv.getContext("2d")!; const g = c.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, "rgba(255,255,255,0.9)"); g.addColorStop(1, "rgba(255,255,255,0)"); c.fillStyle = g; c.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(cv); return t; })();
  const N = vents.length * 14, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { const v = vents[i % vents.length]; pos.set([v.x, (i / N) * 3, v.z], i * 3); }
  const sg = new THREE.BufferGeometry(); sg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const steam = new THREE.Points(sg, new THREE.PointsMaterial({ map: steamTex, color: 0x9aa8b0, size: 1.4, transparent: true, opacity: 0.14, depthWrite: false }));
  scene.add(steam);

  // Neon blade signs sticking out of the north wall (original words), with the colour they throw on the floor.
  const BLADES: [string, string][] = [["BUY", "#45C9B2"], ["SELL", "#E4514E"], ["LONG", "#D9AC65"], ["SHORT", "#E4514E"], ["HODL", "#45C9B2"], ["BAGS", "#D9AC65"], ["ALPHA", "#C8D2D1"], ["DUMP", "#E4514E"], ["PUMP", "#45C9B2"], ["FOMO", "#D9AC65"]];
  BLADES.forEach(([word, col], i) => {
    const cv = document.createElement("canvas"); cv.width = 64; cv.height = 256;
    const c = cv.getContext("2d")!;
    c.fillStyle = "#0b0f12"; c.fillRect(0, 0, 64, 256); c.strokeStyle = col; c.lineWidth = 4; c.strokeRect(3, 3, 58, 250);
    c.fillStyle = col; c.font = `800 ${Math.min(46, 220 / word.length)}px "Barlow Condensed", "Arial Narrow", sans-serif`; c.textAlign = "center"; c.textBaseline = "middle";
    [...word].forEach((ch, k) => c.fillText(ch, 32, 128 + (k - (word.length - 1) / 2) * (220 / word.length)));
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const blade = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 2.4), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, side: THREE.DoubleSide }));
    blade.position.set(3 + i * 6.4, 3.0 + (i % 3) * 0.35, -0.2); blade.rotation.y = Math.PI / 2;
    scene.add(blade);
  });
  for (const [x, col] of [[10, PAL.teal], [32, PAL.red], [54, PAL.amber]] as const) { const l = new THREE.PointLight(col, 12, 10, 1.4); l.position.set(x, 2.6, 0.6); scene.add(l); }
  // Light shafts under the street lamps (cheap additive cones).
  const shaftMat = new THREE.MeshBasicMaterial({ color: 0xf3d9a6, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const shafts: THREE.BufferGeometry[] = [];
  for (let x = 4; x < MAP_W; x += 12) { const g = new THREE.ConeGeometry(2.2, 5, 20, 1, true); g.translate(x, 2.5, -1.4); shafts.push(g); }
  scene.add(new THREE.Mesh(mergeGeometries(shafts), shaftMat));

  // Overhead lantern cables across the market (high above head height: thin, never block a view).
  const cableMat = new THREE.MeshStandardMaterial({ color: 0x15191c, roughness: 0.6, metalness: 0.4 });
  const bulbs: THREE.BufferGeometry[] = [], cables: THREE.BufferGeometry[] = [];
  for (const z of [7, 15, 25, 33]) {
    const pts = [new THREE.Vector3(-1.4, 5.2, z), new THREE.Vector3(MAP_W / 4, 4.2, z + 0.4), new THREE.Vector3(MAP_W / 2, 4.6, z - 0.3), new THREE.Vector3((MAP_W * 3) / 4, 4.2, z + 0.4), new THREE.Vector3(MAP_W + 1.4, 5.2, z)];
    const curve = new THREE.CatmullRomCurve3(pts);
    cables.push(new THREE.TubeGeometry(curve, 60, 0.025, 4));
    for (let k = 0.02; k < 1; k += 0.025) { const p = curve.getPoint(k); const b = new THREE.SphereGeometry(0.05, 6, 4); b.translate(p.x, p.y - 0.12, p.z); bulbs.push(b); }
  }
  scene.add(new THREE.Mesh(mergeGeometries(cables), cableMat), new THREE.Mesh(mergeGeometries(bulbs), new THREE.MeshBasicMaterial({ color: 0xe8b86a, toneMapped: false })));

  return {
    /** Occlusion: fade the gantries while the focus is close to a corridor (camera is south of it). */
    tick(dt: number, focus?: THREE.Vector3) {
      const near = focus ? Math.min(Math.abs(focus.x - 21.5), Math.abs(focus.x - 43.5)) < 2.5 : false;
      gantryMat.opacity += ((near ? 0.25 : 1) - gantryMat.opacity) * Math.min(1, dt * 6);
      gantryMat.depthWrite = gantryMat.opacity > 0.95;
      const a = sg.attributes.position as THREE.BufferAttribute;
      const arr = a.array as Float32Array;
      for (let i = 0; i < N; i++) {
        arr[i * 3 + 1] += dt * 0.9; arr[i * 3] += dt * 0.15 * Math.sin(i);
        if (arr[i * 3 + 1] > 3) { const v = vents[i % vents.length]; arr[i * 3] = v.x; arr[i * 3 + 1] = 0; arr[i * 3 + 2] = v.z; }
      }
      a.needsUpdate = true;
    },
  };
}
