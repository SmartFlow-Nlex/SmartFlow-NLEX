"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { ExitStatus, SegmentStatus } from "../../lib/corridor-status";
import { accessLabel, displayExitName, type NlexExit } from "../../lib/nlex-exits";
import SignalGlyph, { type SignalState } from "../dashboard/SignalGlyph";

/**
 * The Overview's 3D corridor.
 *
 * Both carriageways at true km, a gantry over every exit whose signs show that
 * exit's live state per direction, and a car the operator drags along the road.
 * The car is a cursor, not a vehicle in the data: it marks the km being read.
 * The camera rides behind it, so dragging is driving the corridor.
 *
 * Everything drawn comes from the same ExitStatus list the counts and the
 * Live Corridor Status panel use. A queue is drawn at its reported length
 * (the longest single queue, never a sum), centred on the exit it was matched
 * to, with a short floor so a 60 m queue is still visible; the readout gives
 * the exact figures.
 */

const KM0 = 12;
const KM1 = 88.25;
const U = 12; // scene units per km
const Z_NB = -6.5;
const Z_SB = 6.5;
const GANTRY_H = 10;
const MIN_QUEUE_KM = 0.35;

type Palette = {
  ground: number; asphalt: number; laneLine: number; median: number; steel: number; signFace: number;
  clear: number; slow: number; congested: number; none: number; car: number; carCabin: number; grid: number; fog: number;
};

function readPalette(): Palette {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string, fb: string) => new THREE.Color(cs.getPropertyValue(n).trim() || fb).getHex();
  const attr = document.documentElement.getAttribute("data-theme");
  const dark = attr === "dark" || (attr !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  // Signals always use the bright values: a gantry sign is lit in both themes.
  return dark
    ? { ground: 0x0b1934, asphalt: 0x1d2c4c, laneLine: 0x7d93c4, median: 0x2c3f66, steel: 0x6176a3, signFace: 0x0a1630,
        clear: 0x34d17f, slow: 0xffb21e, congested: 0xff5c5c, none: 0x3a4a6e, car: v("--action", "#5cc8ff"), carCabin: 0xdff3ff, grid: 0x15295a, fog: 0x0b1934 }
    : { ground: 0xdfe6f1, asphalt: 0x3a4766, laneLine: 0xe8eefb, median: 0x8d9ab5, steel: 0x5a6d93, signFace: 0x0a1630,
        clear: 0x2fbf73, slow: 0xf2a516, congested: 0xf04a4a, none: 0x9aa7c0, car: v("--action", "#0a6cc2"), carCabin: 0xffffff, grid: 0xcbd5e5, fog: 0xdfe6f1 };
}

const X = (km: number) => (km - KM0) * U;

export type CorridorSceneProps = {
  exits: NlexExit[];
  statuses: ExitStatus[];
  km: number;
  onKm: (km: number) => void;
  /** True until the first feed read has answered: signs draw as "no report". */
  waiting: boolean;
};

export default function CorridorScene({ exits, statuses, km, onKm, waiting }: CorridorSceneProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const apiRef = useRef<{ setKm: (k: number) => void; rebuild: () => void } | null>(null);
  const [labels, setLabels] = useState<{ k: number; name: string; x: number; y: number }[]>([]);
  const [readoutPos, setReadoutPos] = useState<{ x: number; y: number } | null>(null);
  const [webglFailed, setWebglFailed] = useState(false);

  const ordered = useMemo(() => [...exits].sort((a, b) => a.km - b.km), [exits]);
  const statusOf = useMemo(() => {
    const m = new Map<string, ExitStatus>();
    for (const s of statuses) m.set(`${s.exit.toLowerCase().trim()}|${s.direction}`, s);
    return (x: NlexExit, dir: "NB" | "SB") => m.get(`${x.exit_name.toLowerCase().trim()}|${dir}`);
  }, [statuses]);

  const kmRef = useRef(km);
  kmRef.current = km;

  // Build the scene once per data change; the car and camera move without a rebuild.
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap || !ordered.length) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    } catch {
      setWebglFailed(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 1, 4000);
    const car = new THREE.Group();
    const disposables: { dispose: () => void }[] = [];
    let P = readPalette();

    const mat = (color: number) => { const m = new THREE.MeshLambertMaterial({ color }); disposables.push(m); return m; };
    const flat = (color: number) => { const m = new THREE.MeshBasicMaterial({ color }); disposables.push(m); return m; };
    const geo = <G extends THREE.BufferGeometry>(g: G) => { disposables.push(g); return g; };
    const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(geo(new THREE.BoxGeometry(w, h, d)), m);
      mesh.position.set(x, y, z);
      scene.add(mesh);
      return mesh;
    };

    const build = () => {
      while (scene.children.length) scene.remove(scene.children[0]);
      disposables.splice(0).forEach((d) => d.dispose());
      P = readPalette();
      renderer.setClearColor(P.ground);
      scene.fog = new THREE.Fog(P.fog, 140, 560);
      scene.add(new THREE.AmbientLight(0xffffff, 0.85));
      const sun = new THREE.DirectionalLight(0xffffff, 0.55);
      sun.position.set(-200, 300, 200);
      scene.add(sun);

      const L = X(KM1);
      // Unlit, so the ground meets the clear colour at the horizon with no band.
      const ground = new THREE.Mesh(geo(new THREE.PlaneGeometry(L + 1400, 1400)), flat(P.ground));
      ground.rotation.x = -Math.PI / 2;
      ground.position.set(L / 2, -0.6, 0);
      scene.add(ground);
      for (let k = 15; k <= 85; k += 5) box(0.3, 0.02, 140, flat(P.grid), X(k), -0.5, 0);

      for (const z of [Z_NB, Z_SB]) {
        box(L, 0.4, 9, mat(P.asphalt), L / 2, 0, z);
        box(L, 0.05, 0.22, flat(P.laneLine), L / 2, 0.25, z - 1.5);
        box(L, 0.05, 0.22, flat(P.laneLine), L / 2, 0.25, z + 1.5);
      }
      box(L, 0.9, 1.2, mat(P.median), L / 2, 0.2, 0);

      const colourFor = (s: SegmentStatus | "none") => (s === "congested" ? P.congested : s === "slow" ? P.slow : s === "clear" ? P.clear : P.none);

      for (const [dir, z] of [["NB", Z_NB - 5.4], ["SB", Z_SB + 5.4]] as const) {
        box(L, 0.3, 1, flat(waiting ? P.none : P.clear), L / 2, 0.15, z);
        if (waiting) continue;
        for (const x of ordered) {
          const s = statusOf(x, dir);
          if (!s || s.status === "clear") continue;
          const lenKm = Math.max(MIN_QUEUE_KM, (s.longestQueueMeters ?? 0) / 1000);
          box(lenKm * U, 0.62, 1.7, flat(colourFor(s.status)), X(x.km), 0.32, z);
        }
      }

      for (const x of ordered) {
        const gx = X(x.km);
        box(0.6, GANTRY_H, 0.6, mat(P.steel), gx, GANTRY_H / 2, Z_NB - 7.4);
        box(0.6, GANTRY_H, 0.6, mat(P.steel), gx, GANTRY_H / 2, Z_SB + 7.4);
        box(0.7, 0.8, 29, mat(P.steel), gx, GANTRY_H, 0);
        for (const [dir, z] of [["NB", Z_NB], ["SB", Z_SB]] as const) {
          const noAccess = accessLabel(x, dir) === "No Access";
          const st: SegmentStatus | "none" = waiting || noAccess ? "none" : statusOf(x, dir)?.status ?? "clear";
          box(0.5, 2.4, 3.4, flat(P.signFace), gx - 0.4, GANTRY_H - 1.6, z);
          box(0.2, 1.4, 1.4, flat(colourFor(st)), gx - 0.75, GANTRY_H - 1.6, z);
        }
      }

      car.clear();
      const body = new THREE.Mesh(geo(new THREE.BoxGeometry(5, 1.4, 2.6)), mat(P.car));
      body.position.y = 1.2;
      const cabin = new THREE.Mesh(geo(new THREE.BoxGeometry(2.6, 1.1, 2.2)), mat(P.carCabin));
      cabin.position.set(-0.3, 2.4, 0);
      car.add(body, cabin);
      const wheel = geo(new THREE.CylinderGeometry(0.62, 0.62, 0.5, 16));
      for (const [wx, wz] of [[1.6, 1.3], [-1.6, 1.3], [1.6, -1.3], [-1.6, -1.3]]) {
        const w = new THREE.Mesh(wheel, mat(0x111827));
        w.rotation.x = Math.PI / 2;
        w.position.set(wx, 0.62, wz);
        car.add(w);
      }
      car.scale.setScalar(1.7);
      scene.add(car);
    };

    const v = new THREE.Vector3();
    const project = (k: number, y: number, z: number, w: number, h: number) => {
      v.set(X(k), y, z).project(camera);
      return { x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h, behind: v.z > 1 };
    };

    const render = () => {
      const w = wrap.clientWidth, h = wrap.clientHeight;
      if (!w || !h) return;
      const k = kmRef.current;
      car.position.set(X(k), 0.2, Z_NB);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      // Behind, above and to the right of the car, so the car sits in the lower
      // third with the road ahead of it running to the horizon.
      camera.position.set(X(k) - 44, 30, 20);
      camera.lookAt(X(k) + 52, 0, -2);
      camera.updateMatrixWorld();
      renderer.render(scene, camera);

      const ahead: { k: number; name: string; x: number; y: number }[] = [];
      const placed: { x: number; y: number; w: number }[] = [];
      for (const x of ordered) {
        if (x.km <= k + 0.3 || ahead.length >= 5) continue;
        const p = project(x.km, GANTRY_H + 2.5, 0, w, h);
        if (p.behind || p.x < 40 || p.x > w - 40 || p.y < 24) continue;
        const name = displayExitName(x.exit_name);
        const lw = 8.5 * (name.length + 5);
        if (placed.some((r) => Math.abs(r.x - p.x) < (r.w + lw) / 2 && Math.abs(r.y - p.y) < 26)) continue;
        placed.push({ x: p.x, y: p.y, w: lw });
        ahead.push({ k: x.km, name, x: p.x, y: p.y });
      }
      setLabels(ahead);
      const c = project(k, 8, Z_NB, w, h);
      setReadoutPos({ x: c.x, y: c.y });
    };

    const resize = () => {
      renderer.setSize(wrap.clientWidth, wrap.clientHeight, false);
      render();
    };

    build();
    resize();

    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const rebuild = () => { build(); render(); };
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    window.addEventListener("smartflow:themechange", rebuild);
    mq.addEventListener("change", rebuild);

    apiRef.current = { setKm: () => render(), rebuild };

    return () => {
      ro.disconnect();
      window.removeEventListener("smartflow:themechange", rebuild);
      mq.removeEventListener("change", rebuild);
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      apiRef.current = null;
    };
  }, [ordered, statusOf, waiting]);

  // Re-render when the km changes (car and camera only).
  useEffect(() => {
    apiRef.current?.setKm(km);
  }, [km]);

  // Drag on the scene: horizontal movement drives the car along the road.
  const drag = useRef<{ x: number; km: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, km: kmRef.current };
    (e.target as Element).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const next = drag.current.km + (e.clientX - drag.current.x) * 0.04;
    onKm(Math.min(KM1, Math.max(KM0, next)));
  };
  const onPointerUp = () => { drag.current = null; };

  const nearest = useMemo(() => {
    if (!ordered.length) return null;
    return ordered.reduce((a, b) => (Math.abs(b.km - km) < Math.abs(a.km - km) ? b : a));
  }, [ordered, km]);

  const dirLine = (dir: "NB" | "SB") => {
    if (!nearest) return null;
    if (accessLabel(nearest, dir) === "No Access") {
      return { state: "none" as SignalState, word: "No access", detail: "" };
    }
    if (waiting) return { state: "none" as SignalState, word: "No report yet", detail: "" };
    const s = statusOf(nearest, dir);
    const state: SignalState = s?.status ?? "clear";
    const bits: string[] = [];
    if (s?.longestQueueMeters) bits.push(`${Math.round(s.longestQueueMeters)} m queue`);
    if (s?.delaySeconds) bits.push(`${Math.max(1, Math.round(s.delaySeconds / 60))} min delay`);
    if (s?.speedKmh != null) bits.push(`${Math.round(s.speedKmh)} km/h`);
    const word = state === "clear" ? (s ? "Clear" : "Clear, no report") : state === "slow" ? "Slow" : "Congested";
    return { state, word, detail: bits.join(" · ") };
  };

  return (
    <div className="ov-stage" ref={wrapRef}>
      {webglFailed ? (
        <div className="ov-stage-fallback">
          3D view unavailable on this device. The km ruler and the corridor panel below show the same live state.
        </div>
      ) : (
        <canvas
          ref={canvasRef}
          className="ov-canvas"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          aria-hidden="true"
        />
      )}
      <p className="ov-stage-hint">Drag the road, or use the km ruler, to read any point on the corridor</p>
      <div aria-hidden="true">
        {labels.map((l) => (
          <div key={l.k} className="ov-gantry-label" style={{ left: l.x, top: l.y }}>
            <em>{l.k.toFixed(1)}</em>{l.name}
          </div>
        ))}
      </div>
      {nearest && readoutPos && !webglFailed ? (
        <div
          className="ov-readout"
          style={{ left: Math.max(150, Math.min((wrapRef.current?.clientWidth ?? 300) - 150, readoutPos.x)), top: readoutPos.y }}
          aria-hidden="true"
        >
          <div className="ov-readout-km">KM {km.toFixed(1)} · NEAREST EXIT KM {nearest.km.toFixed(1)}</div>
          <div className="ov-readout-name">{displayExitName(nearest.exit_name)}</div>
          {(["NB", "SB"] as const).map((d) => {
            const line = dirLine(d);
            if (!line) return null;
            return (
              <div key={d} className="ov-readout-dir">
                <SignalGlyph state={line.state} size={20} title="" />
                <span className="ov-readout-dirname">{d}</span>
                <span className="ov-readout-word">{line.word}</span>
                {line.detail ? <span className="ov-readout-detail">{line.detail}</span> : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export { KM0 as CORRIDOR_KM0, KM1 as CORRIDOR_KM1 };
