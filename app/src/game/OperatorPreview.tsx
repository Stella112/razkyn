// Lobby loadout preview: your operator on a deployment pad, wearing the selected class's gear.
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { LOOKS, Operator } from "./three/actors";
import { PAL } from "./three/world";

export default function OperatorPreview({ cls }: { cls: number }) {
  const host = useRef<HTMLDivElement>(null);
  const opRef = useRef<Operator | null>(null);
  useEffect(() => {
    const el = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.3;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0x8ea2ae, 0x101418, 1.6));
    const key = new THREE.DirectionalLight(0xe8dcc6, 2.6); key.position.set(2, 4, 3); scene.add(key);
    const rim = new THREE.PointLight(PAL.teal, 12, 6, 1.5); rim.position.set(-1.5, 2.2, -1.5); scene.add(rim);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.05, 0.12, 6), new THREE.MeshStandardMaterial({ color: 0x2a3339, roughness: 0.4, metalness: 0.8 }));
    pad.position.y = -0.06; scene.add(pad);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.96, 0.02, 6, 6), new THREE.MeshBasicMaterial({ color: PAL.amber, toneMapped: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.01; scene.add(ring);
    const op = new Operator(LOOKS.me);
    opRef.current = op;
    scene.add(op.root);
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    camera.position.set(0, 1.6, 4.6); camera.lookAt(0, 1.0, 0);
    const resize = () => { const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); };
    const ro = new ResizeObserver(resize); ro.observe(el); resize();
    let raf = 0, last = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      op.facing = now / 2600; op.aim = op.facing;
      op.update(dt);
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); renderer.dispose(); renderer.domElement.remove(); };
  }, []);
  useEffect(() => { opRef.current?.setClass(cls); }, [cls]);
  return <div ref={host} className="op-preview" aria-label="Your operator" />;
}
