import * as THREE from "three";
import { onStage, type StageEvent } from "./stage-bus";
import { createMascot3D } from "./mascot3d";

/**
 * The mascot stage: one transparent WebGL canvas over the NLEX environment.
 *
 * Since 7 Oct 2026 the background is the NLEX environment
 * (components/environment), drawn in CSS and SVG; this canvas only draws the
 * 3D mascot, on the page that has one (the Overview), over that page's
 * [data-stage-anchor="mascot"] box. Everywhere else it is switched off and
 * costs nothing. (Before that it also drew the background: a liquid-light
 * wave, then a carbon ground with a race circuit; both are in the session
 * backups and REDESIGN_INVENTORY.md.)
 *
 * The engine never touches React. NightCorridorStage owns the lifecycle and
 * feeds it config; pages talk to it through stage-bus.
 */

export type StageConfig = {
  variant: "signin" | "dashboard";
  /** Pages without the car: nothing to draw, so the canvas stops completely. */
  off: boolean;
  /** Light theme: the car's rim light softens to suit the day sky. */
  light: boolean;
  /** The mascot: the 3D model (falling back to the 2.5D plane), the plane
   *  itself, or none. Drawn over the page's [data-stage-anchor="mascot"]. */
  mascot: false | "3d" | "plane";
  /** prefers-reduced-motion: the 2.5D plane, one still frame. */
  reducedMotion: boolean;
};

export type StageHandle = {
  setConfig(next: Partial<StageConfig>): void;
  dispose(): void;
};

const MASCOT_SRC = "/brand/nlex-mascot.png";
const MASCOT_ASPECT = 1107 / 1161;
/* Headlight centres measured on the PNG (bright-core centroids, 4 Oct 2026). */
const HEADLIGHTS: [number, number][] = [
  [0.2195, 0.6151],
  [0.7596, 0.6908],
];

/* ------------------------------------------------------------------------ */
/* Helpers                                                                   */
/* ------------------------------------------------------------------------ */

function radialTexture(size: number, stops: [number, string][]): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([o, col]) => g.addColorStop(o, col));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ------------------------------------------------------------------------ */
/* Mascot (2.5D)                                                             */
/* ------------------------------------------------------------------------ */

type MascotActor = {
  root: THREE.Group;
  /** Places the mascot over a screen rectangle (CSS px). */
  layout(rect: DOMRect | null, viewW: number, viewH: number, camera: THREE.PerspectiveCamera): void;
  /** World y of the wheel line (null until laid out). */
  wheelY(): number | null;
  /** `rawPointer` is the pointer where it actually is (for hover); `pointer` is eased (for motion). */
  update(dt: number, time: number, pointer: THREE.Vector2, still: boolean, rawPointer?: THREE.Vector2): void;
  event(e: StageEvent): void;
  /** Showcase (3D car only): held and dragged to turn it, a click sets it back. */
  grab?(on: boolean): void;
  turnBy?(dxPx: number, dyPx: number): void;
  isTurned?(): boolean;
  recenter?(): void;
  setLight(light: boolean): void;
  dispose(): void;
};

function createMascotPlane(onReady: () => void): MascotActor {
  const root = new THREE.Group();
  const tilt = new THREE.Group();
  const float = new THREE.Group();
  root.add(tilt);
  tilt.add(float);
  root.visible = false;

  const disposables: { dispose(): void }[] = [];
  const planeGeo = new THREE.PlaneGeometry(MASCOT_ASPECT, 1);
  disposables.push(planeGeo);

  const mat = new THREE.MeshBasicMaterial({
    transparent: true,
    alphaTest: 0.02,
    toneMapped: false,
    premultipliedAlpha: true,
    depthWrite: false,
  });
  disposables.push(mat);
  const plane = new THREE.Mesh(planeGeo, mat);
  plane.renderOrder = 3;

  /* The rim light: a blurred, blue-tinted copy of the alpha, behind the car. */
  const haloMat = new THREE.MeshBasicMaterial({
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    opacity: 0.55,
  });
  disposables.push(haloMat);
  const halo = new THREE.Mesh(planeGeo, haloMat);
  halo.scale.setScalar(1.08);
  halo.position.z = -0.02;
  halo.renderOrder = 2;

  /* Headlight glows: additive radial sprites at the measured centres. */
  const glowTex = radialTexture(128, [
    [0, "rgba(255,255,255,1)"],
    [0.18, "rgba(226,238,255,0.85)"],
    [0.45, "rgba(140,180,255,0.28)"],
    [1, "rgba(92,122,255,0)"],
  ]);
  disposables.push(glowTex);
  const glowGeo = new THREE.PlaneGeometry(1, 1);
  disposables.push(glowGeo);
  const glows = HEADLIGHTS.map(([fx, fy]) => {
    const m = new THREE.MeshBasicMaterial({
      map: glowTex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      opacity: 0.6,
    });
    disposables.push(m);
    const g = new THREE.Mesh(glowGeo, m);
    g.position.set((fx - 0.5) * MASCOT_ASPECT, 0.5 - fy, 0.01);
    g.scale.setScalar(0.26);
    g.renderOrder = 4;
    return g;
  });

  /* Contact shadow on the "road" beneath the wheels. */
  const shadowTex = radialTexture(128, [
    [0, "rgba(0,0,0,0.75)"],
    [0.55, "rgba(0,0,0,0.35)"],
    [1, "rgba(0,0,0,0)"],
  ]);
  disposables.push(shadowTex);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTex,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    opacity: 0.9,
  });
  disposables.push(shadowMat);
  const shadow = new THREE.Mesh(glowGeo, shadowMat);
  shadow.renderOrder = 1;

  float.add(halo, plane, ...glows);
  root.add(shadow);

  let unitH = 1; // world height of the PNG
  let wheelLine: number | null = null;
  let flash = 0;
  let pending = false;
  const tiltNow = new THREE.Vector2();

  const img = new Image();
  img.decoding = "async";
  img.onload = () => {
    const tex = new THREE.Texture(img);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.premultiplyAlpha = true;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    mat.map = tex;
    mat.needsUpdate = true;
    disposables.push(tex);

    // Rim light from the alpha channel: tint, then blur.
    const w = 256;
    const h = Math.round(w / MASCOT_ASPECT);
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d")!;
    const pad = 18;
    const inner = document.createElement("canvas");
    inner.width = w;
    inner.height = h;
    const ictx = inner.getContext("2d")!;
    ictx.drawImage(img, pad, pad, w - pad * 2, h - pad * 2);
    ictx.globalCompositeOperation = "source-in";
    ictx.fillStyle = "#3660ff";
    ictx.fillRect(0, 0, w, h);
    if (typeof (ctx as { filter?: unknown }).filter === "string") {
      ctx.filter = "blur(9px)";
      ctx.drawImage(inner, 0, 0);
    } else {
      // No canvas filter: blur by scaling down and back up.
      const tiny = document.createElement("canvas");
      tiny.width = 32;
      tiny.height = Math.round(32 / MASCOT_ASPECT);
      tiny.getContext("2d")!.drawImage(inner, 0, 0, tiny.width, tiny.height);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(tiny, 0, 0, w, h);
    }
    const haloTex = new THREE.CanvasTexture(c);
    haloTex.colorSpace = THREE.SRGBColorSpace;
    haloMat.map = haloTex;
    haloMat.needsUpdate = true;
    disposables.push(haloTex);

    root.visible = true;
    onReady();
  };
  img.src = MASCOT_SRC;

  return {
    root,
    layout(rect, viewW, viewH, camera) {
      if (!rect || rect.width < 4 || rect.height < 4) {
        root.visible = false;
        wheelLine = null;
        return;
      }
      if (mat.map) root.visible = true;
      // World size of the visible frame at the mascot's depth (z = 0).
      const dist = camera.position.z;
      const worldH = 2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const worldW = worldH * (viewW / viewH);
      const toX = (px: number) => (px / viewW - 0.5) * worldW;
      const toY = (py: number) => camera.position.y + (0.5 - py / viewH) * worldH;
      // Fit the PNG inside the anchor (contain), standing on its bottom edge.
      const boxW = toX(rect.right) - toX(rect.left);
      const boxH = toY(rect.top) - toY(rect.bottom);
      unitH = Math.min(boxH, boxW / MASCOT_ASPECT);
      const cx = (toX(rect.left) + toX(rect.right)) / 2;
      const bottom = toY(rect.bottom);
      root.position.set(cx, bottom + unitH / 2, 0);
      tilt.scale.setScalar(unitH);
      shadow.position.set(0, -unitH / 2 + unitH * 0.012, -0.03);
      shadow.scale.set(unitH * MASCOT_ASPECT * 0.86, unitH * 0.11, 1);
      wheelLine = bottom;
    },
    wheelY: () => wheelLine,
    update(dt, time, pointer, still) {
      // Pointer tilt, eased.
      tiltNow.x += (pointer.x - tiltNow.x) * 0.05;
      tiltNow.y += (pointer.y - tiltNow.y) * 0.05;
      tilt.rotation.y = tiltNow.x * 0.18;
      tilt.rotation.x = -tiltNow.y * 0.1;

      // Float: a 6 px-equivalent bob on a 4.2 s sine with a 1.5 deg counter-phase roll.
      const phase = (time / 4.2) * Math.PI * 2;
      const bob = still ? 0 : Math.sin(phase);
      const bobWorld = (6 / 900) * 2.8 * bob; // 6 px at a 900 px viewport
      float.position.y = bobWorld / Math.max(unitH, 0.001);
      float.rotation.z = still ? 0 : -Math.sin(phase) * THREE.MathUtils.degToRad(1.5);
      const lift = (bob + 1) / 2; // 0 resting, 1 at the top
      shadow.scale.x = unitH * MASCOT_ASPECT * 0.86 * (1 - lift * 0.08);
      shadowMat.opacity = 0.9 - lift * 0.18;

      // Headlights breathe (0.55 to 0.8 over 3 s) and flash once when asked.
      flash = Math.max(0, flash - dt / 0.6);
      const breathe = still ? 0.68 : 0.675 + 0.125 * Math.sin((time / 3) * Math.PI * 2);
      const boost = pending ? 0.12 : 0;
      glows.forEach((g) => {
        (g.material as THREE.MeshBasicMaterial).opacity = Math.min(1, breathe + boost + flash * 0.9);
        g.scale.setScalar(0.26 * (1 + flash * 0.55));
      });
    },
    event(e) {
      if (e.type === "flash") flash = 1;
      else if (e.type === "pending") pending = e.on;
      else if (e.type === "error") pending = false;
    },
    setLight(light) {
      haloMat.opacity = light ? 0.32 : 0.55;
      shadowMat.color.set(light ? "#1a2238" : "#000000");
    },
    dispose() {
      disposables.forEach((d) => d.dispose());
    },
  };
}

/* ------------------------------------------------------------------------ */
/* Stage                                                                     */
/* ------------------------------------------------------------------------ */

export function createStage(canvas: HTMLCanvasElement, initial: StageConfig): StageHandle | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      // Transparent: the NLEX environment shows through around the car.
      alpha: true,
      powerPreference: "high-performance",
    });
  } catch {
    return null;
  }
  if (!renderer.getContext()) return null;

  let cfg: StageConfig = { ...initial };
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  // Lower than the brief's 2.2 so the car's paint keeps the PNG's saturated
  // blue instead of washing to lilac.
  renderer.toneMappingExposure = 1.35;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 0.2, 3.0);
  scene.add(camera);

  let mascot: MascotActor | null = null;
  const anchor = () => document.querySelector<HTMLElement>('[data-stage-anchor="mascot"]');

  const pointer = new THREE.Vector2();
  const pointerTarget = new THREE.Vector2();
  let raf = 0;
  let running = false;
  let lastFrame = 0;
  let clock = 0;
  let disposed = false;
  let layoutTimer = 0;
  // Re-measure the car's anchor only when something can have moved it (7 Oct 2026): reading its
  // box every frame forced a full layout on each frame while the page was still rendering.
  let layoutDirty = true;
  const markLayoutDirty = () => {
    layoutDirty = true;
  };

  const drawing = () => !cfg.off && !!cfg.mascot;

  const resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();
    relayout();
  };

  const relayout = () => {
    if (!mascot) return;
    const el = anchor();
    mascot.layout(el ? el.getBoundingClientRect() : null, window.innerWidth, window.innerHeight, camera);
  };

  let mascotKind: "3d" | "plane" | null = null;
  const mascotReady = () => {
    relayout();
    if (!running) renderOnce();
    // Lets the page retire its <img> stand-in once the stage draws the car.
    document.documentElement.dataset.stageMascot = "ready";
  };
  const swapToPlane = () => {
    if (mascot) {
      scene.remove(mascot.root);
      mascot.dispose();
    }
    mascot = createMascotPlane(mascotReady);
    mascotKind = "plane";
    mascot.setLight(cfg.light);
    scene.add(mascot.root);
    relayout();
  };
  const ensureMascot = () => {
    const want = cfg.off ? false : cfg.mascot;
    if (want && !mascot) {
      // The 2.5D plane stands in whenever the 3D car should not run: reduced
      // motion, a low-memory device, or the model failing to load.
      const lowMemory = typeof navigator !== "undefined" && typeof (navigator as { deviceMemory?: number }).deviceMemory === "number" && (navigator as { deviceMemory?: number }).deviceMemory! < 4;
      // Until it is drawn, the page keeps its <img> stand-in hidden (CSS shows
      // it anyway after a few seconds, or at once if the stage never starts).
      document.documentElement.dataset.stageMascot = "pending";
      if (want === "3d" && !cfg.reducedMotion && !lowMemory) {
        mascot = createMascot3D(renderer, mascotReady, () => swapToPlane());
        mascotKind = "3d";
        mascot.setLight(cfg.light);
        scene.add(mascot.root);
        relayout();
      } else {
        swapToPlane();
      }
    } else if (want && mascot && want === "plane" && mascotKind === "3d") {
      swapToPlane();
    } else if (!want && mascot) {
      scene.remove(mascot.root);
      mascot.dispose();
      mascot = null;
      mascotKind = null;
      delete document.documentElement.dataset.stageMascot;
    }
  };

  const step = (dt: number, still: boolean) => {
    clock += dt;
    pointer.x += (pointerTarget.x - pointer.x) * 0.05;
    pointer.y += (pointerTarget.y - pointer.y) * 0.05;
    // The Overview's car stands in the hero, which scrolls inside <main>: scrolling, resizing and
    // the periodic check below mark the layout dirty, and only then is the anchor measured again.
    if (layoutDirty) {
      layoutDirty = false;
      relayout();
    }
    mascot?.update(dt, clock, pointer, still, pointerTarget);
  };

  const renderOnce = () => {
    if (disposed) return;
    if (!drawing()) {
      renderer.clear();
      return;
    }
    if (cfg.reducedMotion) step(0, true);
    renderer.render(scene, camera);
  };

  const frame = (now: number) => {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - (lastFrame || now)) / 1000);
    lastFrame = now;
    step(dt, false);
    renderer.render(scene, camera);
  };

  const start = () => {
    if (running || disposed) return;
    // Nothing to animate without the car; reduced motion gets one still frame.
    if (!drawing() || cfg.reducedMotion || document.hidden) {
      renderOnce();
      return;
    }
    running = true;
    lastFrame = 0;
    raf = requestAnimationFrame(frame);
  };

  const stop = () => {
    running = false;
    cancelAnimationFrame(raf);
  };

  const applyConfig = () => {
    ensureMascot();
    mascot?.setLight(cfg.light);
    resize();
    stop();
    start();
  };

  /* The car can be held: press on it (not on a link or control that happens to sit there) and
     drag to turn it and look it over. A click (a press that barely moves) sets a turned car back
     where it was, or pokes a car that is already at rest (a hop and a wink). The anchor shows a
     grab hand. */
  const overCar = (e: PointerEvent) => {
    if (!mascot || !mascot.root.visible) return null;
    const el = anchor();
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const inside =
      e.clientX > r.left + r.width * 0.12 && e.clientX < r.right - r.width * 0.12 && e.clientY > r.top + r.height * 0.08 && e.clientY < r.bottom;
    return { el, inside };
  };
  const onPointer = (e: PointerEvent) => {
    pointerTarget.set((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1));
    const hit = overCar(e);
    if (hit) hit.el.dataset.stageHover = hit.inside ? "1" : "0";
  };
  let held: { id: number; x: number; y: number; moved: boolean } | null = null;
  const onPress = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const hit = overCar(e);
    if (!hit?.inside) return;
    if ((e.target as Element | null)?.closest?.("a, button, input, select, textarea, label, [role='button']")) return;
    e.preventDefault(); // no text selection or native image drag while the car is held
    held = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
    document.documentElement.dataset.stageDrag = "1";
    mascot?.grab?.(true);
    if (!running) renderOnce();
  };
  const onHeldMove = (e: PointerEvent) => {
    if (!held || e.pointerId !== held.id) return;
    const dx = e.clientX - held.x;
    const dy = e.clientY - held.y;
    if (!held.moved && Math.hypot(dx, dy) < 5) return; // still a click
    held.moved = true;
    held.x = e.clientX;
    held.y = e.clientY;
    mascot?.turnBy?.(dx, dy);
    if (!running) renderOnce();
  };
  const onRelease = (e: PointerEvent) => {
    if (!held || e.pointerId !== held.id) return;
    const click = !held.moved && e.type === "pointerup";
    held = null;
    delete document.documentElement.dataset.stageDrag;
    mascot?.grab?.(false);
    if (click) {
      if (mascot?.isTurned?.()) mascot.recenter?.();
      else mascot?.event({ type: "poke" });
    }
    if (!running) renderOnce();
  };
  const onVisibility = () => {
    if (document.hidden) stop();
    else start();
  };
  const offBus = onStage((e) => {
    mascot?.event(e);
    if (!running) renderOnce();
  });
  const onContextLost = (e: Event) => {
    e.preventDefault();
    stop();
    canvas.dispatchEvent(new CustomEvent("stage:lost", { bubbles: true }));
  };
  const onScroll = () => {
    if (!mascot) return;
    relayout();
    if (!running) renderOnce();
  };
  window.addEventListener("resize", resize);
  window.addEventListener("scroll", onScroll, { passive: true });
  // <main> scrolls, not the window, and scroll does not bubble: listen in the capture phase.
  document.addEventListener("scroll", markLayoutDirty, { capture: true, passive: true });
  window.addEventListener("pointermove", onPointer, { passive: true });
  window.addEventListener("pointermove", onHeldMove, { passive: true });
  window.addEventListener("pointerdown", onPress, { passive: false });
  window.addEventListener("pointerup", onRelease, { passive: true });
  window.addEventListener("pointercancel", onRelease, { passive: true });
  document.addEventListener("visibilitychange", onVisibility);
  canvas.addEventListener("webglcontextlost", onContextLost);
  // The mascot anchor also moves with layout (fonts, cards loading in): check four times a second.
  // While the frame loop runs it measures on its next frame; when idle, measure and draw here.
  layoutTimer = window.setInterval(() => {
    if (running) {
      layoutDirty = true;
      return;
    }
    relayout();
    if (mascot) renderOnce();
  }, 250);

  applyConfig();

  return {
    setConfig(next) {
      cfg = { ...cfg, ...next };
      applyConfig();
    },
    dispose() {
      disposed = true;
      stop();
      offBus();
      window.clearInterval(layoutTimer);
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("scroll", markLayoutDirty, { capture: true });
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("pointerdown", onPress);
      window.removeEventListener("pointermove", onHeldMove);
      window.removeEventListener("pointerup", onRelease);
      window.removeEventListener("pointercancel", onRelease);
      delete document.documentElement.dataset.stageDrag;
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      mascot?.dispose();
      delete document.documentElement.dataset.stageMascot;
      renderer.dispose();
    },
  };
}
