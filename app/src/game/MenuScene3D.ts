// Title-screen scene: the same 3D city as the raid, an operator idling on a deployment pad, and a
// slow cinematic camera drift. Decorative only: no market data is shown here.
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { CSS, PAL, buildWorld } from "./three/world";
import { CrateModel, ExitModel, LOOKS, Operator, TerminalModel, avatarFromSeed, loadAvatar, loadBotModel } from "./three/actors";
import type { Theme, Weather } from "./three/themes";

export function startMenuScene(parent: HTMLElement, theme: Theme = "street", weather: Weather = "night") {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.3;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  parent.appendChild(renderer.domElement);
  renderer.domElement.style.display = "block";

  const world = buildWorld(renderer, theme, weather);
  const scene = world.scene;
  world.signs.forEach((s, i) => s.draw(["TOWER", "FACTORY", "HARBOR"][i], "MARKET OPEN 24/7", [CSS.teal, CSS.amber, CSS.silver][i]));
  world.districtLights.forEach((l, i) => { l.color.setHex([PAL.teal, PAL.amber, PAL.red][i]); l.intensity = 34; });

  // Deployment pad with the operator, a crate and a terminal nearby, an open exit beam behind.
  const focus = new THREE.Vector3(30, 0, 22);
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.8, 0.16, 6), new THREE.MeshStandardMaterial({ color: 0x2a3339, roughness: 0.4, metalness: 0.8 }));
  pad.position.copy(focus).setY(0.08); pad.receiveShadow = true; scene.add(pad);
  const padRing = new THREE.Mesh(new THREE.TorusGeometry(1.62, 0.03, 6, 6), new THREE.MeshBasicMaterial({ color: PAL.amber, toneMapped: false }));
  padRing.rotation.x = -Math.PI / 2; padRing.position.copy(focus).setY(0.17); scene.add(padRing);
  const op = new Operator(LOOKS.me, loadAvatar());
  op.root.position.copy(focus).setY(0.16);
  op.facing = 0.5; op.aim = 0.2;
  scene.add(op.root);
  const crate = new CrateModel(); crate.root.position.set(focus.x + 2.6, 0, focus.z - 0.6); crate.root.rotation.y = -0.4; scene.add(crate.root);
  const term = new TerminalModel(); term.root.position.set(focus.x - 3, 0, focus.z - 1.5); term.root.rotation.y = 0.5; scene.add(term.root);
  const exit = new ExitModel(); exit.open = true; exit.root.position.set(focus.x + 5, 0, focus.z - 7); scene.add(exit.root);
  // The squad: another human patrolling behind, a BOT on guard by the exit (labelled scene dressing, no market data).
  const mate = new Operator(LOOKS.human, avatarFromSeed([7, 3, 11, 2, 9, 5]));
  scene.add(mate.root);
  const bot = new Operator(LOOKS.bot, { kind: "bot", model: loadBotModel() });
  bot.root.position.set(focus.x + 3.4, 0, focus.z - 5.2); bot.facing = -2.4; bot.aim = -2.1;
  scene.add(bot.root);
  const sparks = new THREE.Points(new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(new Float32Array(60 * 3), 3)), new THREE.PointsMaterial({ color: PAL.amber, size: 0.06, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  scene.add(sparks);
  const key = new THREE.SpotLight(0xe8dcc6, 60, 18, 0.5, 0.6, 1.2);
  key.position.set(focus.x - 3, 7, focus.z + 4); key.target.position.copy(focus); key.castShadow = true;
  scene.add(key, key.target);

  const camera = new THREE.PerspectiveCamera(34, 1, 0.5, 400);
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.75, 0.55, 0.66);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const resize = () => {
    const w = Math.max(1, parent.clientWidth), h = Math.max(1, parent.clientHeight);
    renderer.setSize(w, h); composer.setSize(w, h); bloom.resolution.set(w / 2, h / 2);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize); ro.observe(parent); resize();

  let raf = 0, last = performance.now(), alive = true;
  const frame = (now: number) => {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const a = now / 14000;
    // Drift: low three-quarter angle, slowly orbiting so the skyline and the beam pass behind.
    camera.position.set(focus.x + Math.sin(a) * 7 + 3, 4.2 + Math.sin(a * 0.7) * 0.6, focus.z + 9 + Math.cos(a) * 2);
    camera.lookAt(focus.x - 5.5, 2.4, focus.z - 4);
    op.aim = 0.2 + Math.sin(now / 2600) * 0.5;
    op.update(dt);
    // Patrol: the other human walks a slow loop behind the pad.
    const pa = now / 5200;
    const px = focus.x - 1 + Math.cos(pa) * 3.2, pz = focus.z - 5 + Math.sin(pa) * 1.6;
    mate.speed = 1.3; mate.facing = Math.atan2(-Math.sin(pa) * 3.2, Math.cos(pa) * 1.6); mate.aim = mate.facing;
    mate.root.position.set(px, 0, pz); mate.update(dt);
    bot.aim = -2.1 + Math.sin(now / 1900) * 0.4; bot.update(dt);
    // The crate cracks open and reseals on a loop, with a spark burst when the seal breaks.
    const cyc = (now % 6000) / 6000;
    const openNow = cyc > 0.45 && cyc < 0.9;
    crate.rip(cyc > 0.3 && cyc <= 0.45 ? (cyc - 0.3) / 0.15 : 0);
    crate.set(openNow ? 1 : 0, false, true, now); crate.update(dt, now);
    const sp = sparks.geometry.attributes.position as THREE.BufferAttribute;
    const burst = cyc > 0.45 && cyc < 0.62 ? (cyc - 0.45) / 0.17 : -1;
    for (let i = 0; i < 60; i++) {
      if (burst < 0) { sp.setXYZ(i, 0, -50, 0); continue; }
      const ang = i * 2.399, r = burst * (0.6 + (i % 7) * 0.15);
      sp.setXYZ(i, crate.root.position.x + Math.cos(ang) * r, 0.6 + burst * 1.4 - burst * burst * 1.6 + (i % 5) * 0.05, crate.root.position.z + Math.sin(ang) * r);
    }
    sp.needsUpdate = true;
    (sparks.material as THREE.PointsMaterial).opacity = burst < 0 ? 0 : 1 - burst;
    exit.update(now);
    world.tick(now, dt, focus);
    composer.render(dt);
  };
  raf = requestAnimationFrame(frame);
  return () => { alive = false; cancelAnimationFrame(raf); ro.disconnect(); renderer.dispose(); renderer.domElement.remove(); };
}
