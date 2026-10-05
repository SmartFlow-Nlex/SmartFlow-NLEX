import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { StageEvent } from "./stage-bus";
import type { NlexMascotHandles } from "./mascot/createNlexMascotModel";
import type { FaceExpression } from "./mascot/face";

/**
 * The 3D NLEX mascot as a stage actor (the model in ./mascot, rebuilt from the
 * character sheet on 5 Oct 2026).
 *
 * The model is imported lazily, so its code and decals load only where the car
 * is shown (sign-in, the Overview hero). Lighting follows the brief's rig: a
 * white key spot (18, from 4,6,3), a blue rim from behind (-5,3,-4) and a warm
 * fill (#fff3e6, 0.8, from -2,-4,2), plus a soft studio environment (three's
 * RoomEnvironment) for the glossy toy-plastic reflections. The rim is a sky
 * blue (#6fa8ff, 5) rather than the brief's #5c7aff at 10, which pushed the
 * paint to indigo under ACES.
 *
 * Behaviour (decoration only: nothing here reads or shows data):
 *   - Arrival (7 Oct 2026): the car drives toward the reader along the road
 *     painted in the background art (public/light_bg, public/dark_bg; both
 *     share one composition). It appears small up the road, follows the lane
 *     round the bend, grows with perspective, its nose following the road and
 *     its wheels rolling at its ground speed, then pulls up on its spot, turns
 *     to face the reader, settles on its springs and lights up. The path is
 *     mapped from the art's pixels to the window with the same rules the CSS
 *     uses to place the art (styles/nlex-environment.css, .env-bg).
 *   - Idle: a slow bob and sway; the face blinks on its own and the pupils
 *     follow the pointer (wandering when the pointer rests); now and then a
 *     gold sparkle twinkles beside it; every 7-12 s a small fidget: rocking
 *     up onto two wheels with a laugh, a hop, a look around, a wink or a blush
 *     (after the animated reference, Downloads/Mascot/Reference.mp4).
 *   - Hover over the car: a laugh, a little rock onto two wheels and a burst
 *     of sparkles. Click it: a hop, a wink and sparkles.
 *   - Showcase (7 Oct 2026): hold the car and drag to turn it all the way
 *     round (left and right) and tip it to see its roof or underside; it
 *     coasts a little when let go. Click it while turned and it swings back
 *     to face the reader. While it is being shown, fidgets and hover
 *     reactions wait.
 *   - Sign-in: each story turns it to the camera with a different expression;
 *     the sign-in button flashes the headlights; a pending sign-in spins the
 *     wheels with a focused face; an error gets a surprised face and a shake.
 * Wheels come to rest with their hub "N" upright, as on the sheet.
 */

export type Mascot3DActor = {
  root: THREE.Group;
  layout(rect: DOMRect | null, viewW: number, viewH: number, camera: THREE.PerspectiveCamera): void;
  wheelY(): number | null;
  grab(on: boolean): void;
  turnBy(dxPx: number, dyPx: number): void;
  isTurned(): boolean;
  recenter(): void;
  update(dt: number, time: number, pointer: THREE.Vector2, still: boolean, rawPointer?: THREE.Vector2): void;
  event(e: StageEvent): void;
  setLight(light: boolean): void;
  dispose(): void;
};

const NORMALISED = 3.5; // largest dimension after normalising, per the brief
const PIVOT_Y = -0.4;
const DRIVE_S = 2.9; // the drive along the road
const SIMPLE_DRIVE_S = 1.5; // narrow screens: a short approach
const TURN_S = 0.6;

/* The background art (1798 x 875 px) and the lane the car drives in, far to near, in art pixels:
   up the road, round the bend at the right, and down toward the viewer. The last point is the
   car's own spot (the hero's mascot anchor), added at run time. The horizon is at art y 330. */
const ART = { w: 1798, h: 875, horizon: 330 };
const ROAD_LANE: [number, number][] = [
  [1250, 446],
  [1400, 481],
  [1530, 523],
  [1615, 575],
  [1645, 632],
];
/** Where an art pixel lands in the window: mirrors .env-bg in styles/nlex-environment.css. */
function artToWindow(ix: number, iy: number, vw: number, vh: number): [number, number] {
  let w: number;
  let x0: number;
  if (vw > 980) {
    w = Math.max(vw, 1.7 * vh); // width: max(100%, 170vh), anchored right
    x0 = vw - w;
  } else {
    w = Math.max(vw, 2.05 * vh); // left: 50%, width: max(100%, 205vh), translate -70%
    x0 = vw / 2 - 0.7 * w;
  }
  const h = (w * ART.h) / ART.w;
  return [x0 + (ix * w) / ART.w, vh - h + (iy * h) / ART.h];
}
const HOP_S = 0.62;
const ACCENT_HEX = 0xffb400; // the sheet's Yellow Accent
/** Tipped toward the camera, so it is seen a little from above as on the character sheet:
 *  the top of the cap shows and the face reads larger. */
const BASE_PITCH = 0.1; // a little from above, as the reference sheet shows it
const STORY_FACES: FaceExpression[] = ["wink", "excited", "blush", "curious"];

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutBack = (t: number) => {
  const c = 1.7;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function createMascot3D(
  renderer: THREE.WebGLRenderer,
  onReady: () => void,
  onFail: (reason: unknown) => void,
): Mascot3DActor {
  // root -> pivot (drive, turn, bob, sway) -> lift (hop) -> tilt (two-wheel rock, origin on the
  // planted wheels' contact line) -> tiltBack -> squash (springs, origin at the wheels) -> body
  const root = new THREE.Group();
  root.visible = false;
  const pivot = new THREE.Group();
  const lift = new THREE.Group();
  const tilt = new THREE.Group();
  const tiltBack = new THREE.Group();
  const squash = new THREE.Group();
  const body = new THREE.Group();
  root.add(pivot);
  pivot.add(lift);
  lift.add(tilt);
  tilt.add(tiltBack);
  tiltBack.add(squash);
  squash.add(body);
  pivot.position.y = PIVOT_Y;

  // --- lighting rig (children of the actor, so they travel with the car) ---
  const key = new THREE.SpotLight(0xffffff, 18, 0, Math.PI / 5, 0.6, 1.2);
  key.position.set(4, 6, 3);
  key.target = pivot;
  const rim = new THREE.DirectionalLight(0x6fa8ff, 5);
  rim.position.set(-5, 3, -4);
  rim.target = pivot;
  const fill = new THREE.DirectionalLight(0xfff3e6, 0.8);
  fill.position.set(-2, -4, 2);
  fill.target = pivot;
  root.add(key, rim, fill);

  // Soft studio reflections for the glossy paint, chrome and lenses (prefiltered once).
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const envMap = pmrem.fromScene(room, 0.04).texture;
  room.dispose();
  pmrem.dispose();
  const ENV_INTENSITY: Record<string, number> = {
    "body-paint": 0.12,
    chrome: 1.0,
    "trim-white": 0.3,
    "face-white": 0.2,
    "window-glass": 0.15,
    "window-frame": 0.14,
    "taillight-lens": 0.4,
    "tyre-rubber": 0.12,
    "cap-fabric-blue": 0.12,
    "cap-fabric-white": 0.12,
  };

  // The key light's soft shadow is drawn as a contact ellipse under the
  // wheels: a real-time shadow map left a hard edge where its frustum ended,
  // and cost a second render of the car every frame.
  const contactTex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const ctx = c.getContext("2d")!;
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(0,0,0,0.85)");
    g.addColorStop(0.6, "rgba(0,0,0,0.3)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const contactMat = new THREE.MeshBasicMaterial({ map: contactTex, transparent: true, depthWrite: false, toneMapped: false, opacity: 0.85 });
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), contactMat);
  contact.rotation.x = -Math.PI / 2;
  contact.renderOrder = 1;
  root.add(contact);
  let contactBase = 0.85;
  const contactScale = new THREE.Vector2(1, 1);

  // Twinkling four-point stars, warm white and gold, as in the animated reference: a burst round
  // the car on arrival, hover, click or a two-wheel rock, and now and then one on its own.
  const starTex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d")!;
    const glow = g.createRadialGradient(64, 64, 0, 64, 64, 40);
    glow.addColorStop(0, "rgba(255,255,255,0.9)");
    glow.addColorStop(0.35, "rgba(255,240,200,0.35)");
    glow.addColorStop(1, "rgba(255,240,200,0)");
    g.fillStyle = glow;
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = "#ffffff";
    g.beginPath();
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 - Math.PI / 2;
      const r = k % 2 === 0 ? 60 : 9;
      const x = 64 + Math.cos(a) * r;
      const y = 64 + Math.sin(a) * r;
      if (k === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath();
    g.fill();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const STARS = 16;
  const stars: { sprite: THREE.Sprite; mat: THREE.SpriteMaterial; pos: THREE.Vector3; size: number; t: number; delay: number; spin: number }[] = [];
  const starGroup = new THREE.Group();
  lift.add(starGroup);
  for (let k = 0; k < STARS; k++) {
    const m = new THREE.SpriteMaterial({ map: starTex, color: 0xfff1c6, transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, opacity: 0 });
    const sprite = new THREE.Sprite(m);
    sprite.visible = false;
    sprite.renderOrder = 5;
    starGroup.add(sprite);
    stars.push({ sprite, mat: m, pos: new THREE.Vector3(), size: 0.3, t: -1, delay: 0, spin: 0 });
  }
  let nextAmbient = 1.5;
  /** Place a star somewhere on a loose ring round the car (pivot units). */
  const placeStar = (st: (typeof stars)[number], delay: number) => {
    const a = Math.random() * Math.PI * 2;
    const rx = size.x * (0.52 + Math.random() * 0.22);
    const ry = size.y * (0.46 + Math.random() * 0.18);
    st.pos.set(Math.cos(a) * rx, Math.sin(a) * ry * (Math.sin(a) < 0 ? 0.55 : 1) + size.y * 0.04, size.z * (0.15 + Math.random() * 0.25));
    st.size = size.y * (0.06 + Math.random() * 0.07);
    st.t = 0;
    st.delay = delay;
    st.spin = (Math.random() - 0.5) * 1.6;
  };
  let handles: NlexMascotHandles | null = null;
  let model: THREE.Group | null = null;
  let size = new THREE.Vector3(1, 1, 1);
  let wheelR = 0.31; // in pivot units once normalised
  let wheelLine: number | null = null;
  let disposed = false;

  // Where the car is on screen (CSS px), for hover and for where the eyes look.
  let rect: DOMRect | null = null;
  let viewW = 1;
  let viewH = 1;

  // Behaviour state.
  const turn = new THREE.Vector2();
  const lastPointer = new THREE.Vector2(9, 9);
  let lastMove = -10;
  let spin = 0; // rad/s; the wheels rest at idle so the hub "N" stays upright
  let storyTurn = 0; // 1 -> 0 over 0.8 s
  let flash = 0;
  let pending = false;
  let intro: "wait" | "drive" | "turn" | "done" = "wait";
  let introT = 0;
  let roadMode = true; // false on narrow screens, where the car does not stand on the painted road
  let turnFrom = 0; // the yaw the car arrives with, eased to face the reader
  let driveYaw = 0;
  let lastG = 0;
  // The last layout, for mapping window pixels into the actor's space during the drive.
  const lay = { s: 1, worldW: 1, worldH: 1, camY: 0 };
  // The yaw that points the car's face straight at the camera from where it stands on screen (it
  // sits right of centre, so without this it shows its inner side; user request, 7 Oct 2026).
  let camYaw = 0;
  let contactRestY = 0;
  let hopT = -1;
  let hopH = 0.3;
  let sq = 0; // spring: positive squashes, negative stretches
  let sqV = 0;
  let shakeT = -1;
  let hovered = false;
  let hoverCool = 0;
  let nextFidget = 9 + Math.random() * 4;
  let fidget: { kind: "look" | "wiggle"; t: number; dur: number } | null = null;

  // Showcase: the reader's own turn of the car, on top of everything else.
  const show = { yaw: 0, pitch: 0, tYaw: 0, tPitch: 0, held: false, back: -1, fromYaw: 0, fromPitch: 0, flick: 0, flickAt: 0 };
  const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

  const face = () => handles?.face ?? null;
  const hop = (h: number) => {
    if (hopT >= 0) return;
    hopT = 0;
    hopH = h;
  };
  const burst = () => {
    stars.forEach((st, k) => placeStar(st, k * 0.025 + Math.random() * 0.12));
  };
  // Rock up onto the wheels on one side (dir +1 lifts the car's -X side) and come back down.
  let tiltT = -1;
  let tiltDir = 1;
  let tiltMax = 0.3;
  let tiltDur = 1.2;
  const rock = (max: number, dur: number, dir = Math.random() < 0.5 ? 1 : -1) => {
    if (tiltT >= 0) return;
    tiltT = 0;
    tiltDir = dir;
    tiltMax = max;
    tiltDur = dur;
    const edge = size.x * 0.42;
    tilt.position.x = tiltDir * edge;
    tiltBack.position.x = -tiltDir * edge;
  };

  import("./mascot/createNlexMascotModel")
    .then(async ({ createNlexMascotModel }) => {
      if (disposed) return;
      // Build when the browser is idle, so the geometry, decals and shader
      // compiles do not land on top of the page's own first second (the title
      // reveal, the first data read).
      await new Promise<void>((resolve) => {
        const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
        if (ric) ric(() => resolve(), { timeout: 1200 });
        else setTimeout(resolve, 300);
      });
      if (disposed) return;
      const m = createNlexMascotModel({ assetBase: "/brand/mascot/", anisotropy: Math.min(8, renderer.capabilities.getMaxAnisotropy()) });
      const h = m.userData.mascot as NlexMascotHandles;
      await h.ready;
      if (disposed) {
        h.dispose();
        return;
      }
      m.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        for (const mm of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          const std = mm as THREE.MeshStandardMaterial;
          if (!std.isMeshStandardMaterial) continue;
          std.envMap = envMap;
          std.envMapIntensity = ENV_INTENSITY[std.name] ?? (std.name.startsWith("headlight") ? 0.3 : 0.2);
          std.needsUpdate = true;
        }
      });
      // Normalise: largest dimension 3.5, recentred with the scaled bounding box.
      const box = new THREE.Box3().setFromObject(m);
      const s = box.getSize(new THREE.Vector3());
      const k = NORMALISED / Math.max(s.x, s.y, s.z, 1e-6);
      m.scale.setScalar(k);
      const box2 = new THREE.Box3().setFromObject(m);
      const c = box2.getCenter(new THREE.Vector3());
      m.position.sub(c);
      size = box2.getSize(new THREE.Vector3());
      wheelR = (h.wheels[0]?.parent?.position.y ?? 0.31) * k;
      // The springs compress toward the wheels, not the middle of the car.
      squash.position.y = -size.y / 2;
      body.position.y = size.y / 2;
      // The rock pivots on the planted wheels' contact line.
      tilt.position.y = -size.y / 2;
      tiltBack.position.y = size.y / 2;
      body.add(m);
      model = m;
      handles = h;
      h.setHeadlights(1);
      contactRestY = PIVOT_Y - size.y / 2 + 0.01;
      contact.position.y = contactRestY;
      contactScale.set(size.x * 1.05, size.z * 0.9);
      contact.scale.set(contactScale.x, contactScale.y, 1);
      root.visible = true;
      onReady();
    })
    .catch((err) => {
      if (!disposed) onFail(err);
    });

  return {
    root,
    layout(r, vw, vh, camera) {
      if (!r || r.width < 4 || r.height < 4) {
        root.visible = false;
        wheelLine = null;
        rect = null;
        return;
      }
      if (!model) return;
      rect = r;
      viewW = vw;
      viewH = vh;
      root.visible = true;
      const dist = camera.position.z;
      const worldH = 2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const worldW = worldH * (vw / vh);
      const toX = (px: number) => (px / vw - 0.5) * worldW;
      const toY = (py: number) => camera.position.y + (0.5 - py / vh) * worldH;
      const boxW = toX(r.right) - toX(r.left);
      const boxH = toY(r.top) - toY(r.bottom);
      // Fit the car (as seen roughly front-on) inside the anchor, standing on its bottom edge.
      const s = Math.min(boxH / size.y, boxW / Math.max(size.x, size.z * 0.8)) * 0.9;
      root.scale.setScalar(s);
      const cx = (toX(r.left) + toX(r.right)) / 2;
      const bottom = toY(r.bottom);
      // Set back by half its depth, so the front of the car (not its middle)
      // sits on the anchor's plane and perspective does not over-enlarge it.
      root.position.set(cx, bottom + s * (size.y / 2 - PIVOT_Y), -s * size.z * 0.5);
      wheelLine = bottom;
      lay.s = s;
      lay.worldW = worldW;
      lay.worldH = worldH;
      lay.camY = camera.position.y;
      camYaw = Math.atan2(camera.position.x - root.position.x, camera.position.z - root.position.z);
      // The arrival: along the painted road where the car stands on it (wide screens), else a
      // short approach from up and to the right.
      if (intro === "wait") {
        roadMode = vw > 980;
        intro = "drive";
        introT = 0;
        lastG = 0;
      }
    },
    wheelY: () => wheelLine,
    grab(on) {
      if (intro !== "done" && on) return;
      show.held = on;
      if (on) {
        show.back = -1; // a new hold stops a return in progress where it is
        show.tYaw = show.yaw;
        show.tPitch = show.pitch;
      } else if (performance.now() - show.flickAt < 80) {
        // Let go while moving: it coasts on a little.
        show.tYaw += clamp(show.flick * 5, -1.6, 1.6);
      }
    },
    turnBy(dx, dy) {
      if (intro !== "done") return;
      const dYaw = dx * 0.011; // about one full turn for a 570 px drag
      show.tYaw += dYaw;
      show.tPitch = clamp(show.tPitch + dy * 0.006, -0.45, 0.9);
      show.flick = dYaw;
      show.flickAt = performance.now();
    },
    isTurned: () => show.held || Math.abs(wrapAngle(show.yaw)) > 0.03 || Math.abs(show.pitch) > 0.03,
    recenter() {
      show.held = false;
      show.yaw = wrapAngle(show.yaw);
      show.fromYaw = show.yaw;
      show.fromPitch = show.pitch;
      show.back = 0;
    },
    update(dt, time, pointer, still, rawPointer) {
      if (!model || !handles) return;
      const f = face();
      if (still) {
        // A settled frame: facing the reader, at rest, smiling.
        intro = "done";
        hopT = -1;
        sq = sqV = 0;
        shakeT = -1;
        tiltT = -1;
        stars.forEach((st) => (st.t = -1));
        fidget = null;
      }

      // --- where the eyes look ---------------------------------------------
      if (Math.abs(pointer.x - lastPointer.x) + Math.abs(pointer.y - lastPointer.y) > 0.002) lastMove = time;
      lastPointer.copy(pointer);
      let lookX = 0;
      let lookY = 0;
      let inside = false;
      if (rect) {
        const px = (pointer.x * 0.5 + 0.5) * viewW;
        const py = (0.5 - pointer.y * 0.5) * viewH;
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height * 0.45;
        // The eyes follow the pointer, but never all the way to the side: the car keeps looking at the reader.
        lookX = clamp((px - cx) / (viewW * 0.28), -1, 1) * 0.6;
        lookY = clamp((py - cy) / (viewH * 0.32), -1, 1) * 0.6;
        // Hover uses where the pointer really is; the eased pointer trails it by about a second.
        const hp = rawPointer ?? pointer;
        const hx = (hp.x * 0.5 + 0.5) * viewW;
        const hy = (0.5 - hp.y * 0.5) * viewH;
        inside = hx > rect.left + rect.width * 0.12 && hx < rect.right - rect.width * 0.12 && hy > rect.top + rect.height * 0.08 && hy < rect.bottom;
      }
      if (time - lastMove > 4) {
        // The pointer has rested: the eyes settle on the reader, with only a small drift.
        lookX = 0.12 * Math.sin(time * 0.55) * Math.sin(time * 0.21 + 1);
        lookY = 0.05 * Math.sin(time * 0.8);
      }

      // --- arrival -----------------------------------------------------------
      let yawBase = camYaw; // at rest: facing the reader
      let introFace = 1; // 0 while arriving: pointer turn and sway off
      let drive: { x: number; y: number; k: number; contactY: number } | null = null;
      if (intro === "drive" && rect) {
        introT += dt;
        const T = roadMode ? DRIVE_S : SIMPLE_DRIVE_S;
        const u = Math.min(1, introT / T);
        // Quick away, easing to a stop on the spot.
        const g = 1 - Math.pow(1 - u, 2.3);
        // The path in window px, far to near; the last point is where the wheels rest.
        const fx = rect.left + rect.width / 2;
        const fy = rect.bottom;
        let pts: [number, number][];
        let horizonY: number;
        if (roadMode) {
          pts = ROAD_LANE.map(([ix, iy]) => artToWindow(ix, iy, viewW, viewH));
          horizonY = artToWindow(0, ART.horizon, viewW, viewH)[1];
        } else {
          pts = [
            [fx + viewW * 0.2, fy - viewH * 0.1],
            [fx + viewW * 0.09, fy - viewH * 0.045],
          ];
          horizonY = fy - viewH * 0.25;
        }
        pts.push([fx, fy]);
        horizonY = Math.min(horizonY, fy - 40);
        // Ground coordinates under the art's perspective (x across, z toward the viewer), so the
        // car keeps an even ground speed and its nose follows the road, not the screen.
        const F = viewW * 0.9;
        const toGround = (x: number, y: number) => {
          const d = 1 / Math.max(4, y - horizonY);
          return [(x - viewW / 2) * d, -F * d] as const;
        };
        const curve = new THREE.CatmullRomCurve3(pts.map(([x, y]) => new THREE.Vector3(x, y, 0)), false, "centripetal");
        const N = 64;
        const samp = curve.getPoints(N);
        const glen = [0];
        for (let k = 1; k <= N; k++) {
          const [ax, az] = toGround(samp[k - 1].x, samp[k - 1].y);
          const [bx, bz] = toGround(samp[k].x, samp[k].y);
          glen.push(glen[k - 1] + Math.hypot(bx - ax, bz - az));
        }
        const total = glen[N] || 1;
        const at = (frac: number) => {
          const target = Math.min(1, Math.max(0, frac)) * total;
          let k = 1;
          while (k < N && glen[k] < target) k++;
          const f = (target - glen[k - 1]) / Math.max(1e-9, glen[k] - glen[k - 1]);
          return [samp[k - 1].x + (samp[k].x - samp[k - 1].x) * f, samp[k - 1].y + (samp[k].y - samp[k - 1].y) * f] as const;
        };
        const [px, py] = at(g);
        // Heading from a short look ahead along the ground.
        const [qx, qy] = at(Math.min(1, g + 0.03));
        const [gx0, gz0] = toGround(px, py);
        const [gx1, gz1] = toGround(qx, qy);
        if (Math.hypot(gx1 - gx0, gz1 - gz0) > 1e-9) {
          const want = clamp(Math.atan2(gx1 - gx0, gz1 - gz0), -1.45, 1.45);
          driveYaw += (want - driveYaw) * Math.min(1, dt * 7);
        }
        // Perspective: the car's size follows its distance below the horizon.
        const grow = smooth(0, 0.07, u); // it emerges quickly rather than popping in
        const k = clamp((py - horizonY) / Math.max(1, fy - horizonY), 0.1, 1) * (0.25 + 0.75 * grow);
        // Window px -> world -> the actor's own units.
        const wx = (px / viewW - 0.5) * lay.worldW;
        const wy = lay.camY + (0.5 - py / viewH) * lay.worldH;
        const contactY = (wy - root.position.y) / lay.s;
        drive = { x: (wx - root.position.x) / lay.s, y: contactY + (k * size.y) / 2, k, contactY };
        // Wheels roll at the car's ground speed (converted at the spot's depth to car units).
        const dG = (g - lastG) * total;
        lastG = g;
        const depthAtSpot = 1 / Math.max(4, fy - horizonY);
        const carUnitsPerGround = lay.worldW / viewW / (lay.s * depthAtSpot);
        handles.wheels.forEach((w) => (w.rotation.x += (dG * carUnitsPerGround) / wheelR));
        yawBase = driveYaw;
        introFace = 0;
        f?.setBase("happy");
        lookX = clamp(Math.sin(driveYaw) * 1.3, -1, 1); // looking where it's going
        if (u >= 1) {
          intro = "turn";
          introT = 0;
          turnFrom = driveYaw;
          sqV += 1.6; // the nose dips as it stops
        }
      } else if (intro === "turn") {
        introT += dt;
        const u = Math.min(1, introT / TURN_S);
        yawBase = turnFrom + (camYaw - turnFrom) * easeInOutCubic(u);
        introFace = u;
        handles.wheels.forEach((w) => (w.rotation.x += dt * 4 * (1 - u)));
        if (u >= 1) {
          intro = "done";
          sqV += 2.2;
          f?.play("excited", 1.1);
          burst();
          flash = 1;
          nextFidget = 7 + Math.random() * 4;
        }
      }
      if (!drive) pivot.position.x = 0;
      const ready = intro === "done";

      // --- showcase ----------------------------------------------------------
      if (show.back >= 0) {
        // Setting back: the shortest way round to facing the reader, then a little settle.
        show.back += dt / 0.75;
        const e = easeInOutCubic(Math.min(1, show.back));
        show.yaw = show.fromYaw * (1 - e);
        show.pitch = show.fromPitch * (1 - e);
        show.tYaw = show.yaw;
        show.tPitch = show.pitch;
        if (show.back >= 1) {
          show.back = -1;
          show.yaw = show.pitch = show.tYaw = show.tPitch = 0;
          sqV += 1.6;
          f?.play("excited", 0.9);
        }
      } else {
        const k = still ? 1 : Math.min(1, dt * 12);
        show.yaw += (show.tYaw - show.yaw) * k;
        show.pitch += (show.tPitch - show.pitch) * k;
      }
      const showing = show.held || show.back >= 0 || Math.abs(wrapAngle(show.yaw)) > 0.03 || Math.abs(show.pitch) > 0.03;
      if (showing) {
        fidget = null;
        nextFidget = Math.max(nextFidget, 4);
      }

      // --- hover, fidgets ---------------------------------------------------
      hoverCool = Math.max(0, hoverCool - dt);
      if (ready && !still) {
        if (inside && !hovered && hoverCool <= 0 && !showing) {
          f?.play("excited", 1.2);
          f?.talk(1.0);
          rock(0.16, 0.9);
          burst();
          hoverCool = 2.5;
        }
        hovered = inside;
        nextFidget -= dt;
        if (nextFidget <= 0 && !pending && hopT < 0 && !fidget && !showing) {
          const pick = Math.random();
          if (pick < 0.32) {
            // The reference's signature move: up on two wheels, laughing, sparkles round it.
            rock(0.3, 1.3);
            f?.play("excited", 1.4);
            f?.talk(1.2);
            burst();
          } else if (pick < 0.5) {
            hop(0.24);
            f?.play("excited", 0.9);
          } else if (pick < 0.66) {
            fidget = { kind: "look", t: 0, dur: 2.2 };
            f?.play("curious", 2.2);
          } else if (pick < 0.84) {
            f?.play("wink", 0.9);
            sqV += 1.2;
          } else {
            fidget = { kind: "wiggle", t: 0, dur: 1.4 };
            f?.play("blush", 1.5);
          }
          nextFidget = 7 + Math.random() * 5;
        }
      }
      let fidgetYaw = 0;
      let fidgetRoll = 0;
      if (fidget) {
        fidget.t += dt;
        const u = fidget.t / fidget.dur;
        if (fidget.kind === "look") {
          // Glance one way, then the other, then back.
          const sweep = Math.sin(u * Math.PI * 2) * Math.sin(u * Math.PI);
          fidgetYaw = 0.32 * sweep;
          lookX = clamp(sweep * 1.6, -1, 1);
        } else {
          fidgetRoll = 0.07 * Math.sin(u * Math.PI * 6) * (1 - u);
        }
        if (u >= 1) fidget = null;
      }

      // --- pose --------------------------------------------------------------
      // The body only leans toward the pointer, slowly (user request, 7 Oct 2026: it swung too far);
      // the eyes follow it.
      turn.x += (pointer.x - turn.x) * 0.03;
      turn.y += (pointer.y - turn.y) * 0.03;
      storyTurn = Math.max(0, storyTurn - dt / 0.8);
      const sway = still ? 0 : THREE.MathUtils.degToRad(3) * Math.sin((time / 9) * Math.PI * 2);
      const faceCam = Math.sin(storyTurn * Math.PI);
      let shakeRoll = 0;
      if (shakeT >= 0) {
        shakeT += dt;
        shakeRoll = 0.09 * Math.sin(shakeT * 42) * Math.max(0, 1 - shakeT / 0.6);
        if (shakeT > 0.6) shakeT = -1;
      }
      // While it is being shown, the reader's turn replaces the lean and the sway.
      const calm = showing ? 0 : 1;
      pivot.rotation.y = yawBase + ((turn.x * 0.09 + sway) * calm * (1 - faceCam) + fidgetYaw) * introFace + show.yaw;
      pivot.rotation.x = BASE_PITCH - turn.y * 0.03 * introFace * calm + show.pitch;
      pivot.rotation.z = fidgetRoll + shakeRoll;
      const bob = still ? 0 : 0.03 * Math.sin((time / 4.2) * Math.PI * 2);
      if (drive) {
        // On the road: placed and sized by the drive, no idle bob.
        pivot.position.set(drive.x, drive.y, 0);
        pivot.scale.setScalar(drive.k);
      } else {
        pivot.position.y = PIVOT_Y + bob;
        pivot.scale.setScalar(1);
      }

      // Hop: a crouch, a parabola, and a squash on landing.
      let air = 0;
      if (hopT >= 0) {
        const before = hopT;
        hopT += dt;
        const crouch = 0.1;
        if (hopT < crouch) {
          sq += (0.16 - sq) * Math.min(1, dt * 30);
        } else {
          if (before < crouch) sqV -= 3.2; // stretch on take-off
          const u = Math.min(1, (hopT - crouch) / (HOP_S - crouch));
          air = hopH * 4 * u * (1 - u);
          if (u >= 1) {
            hopT = -1;
            air = 0;
            sqV += 2.6;
          }
        }
      }
      lift.position.y = air;

      // Two-wheel rock: up quickly, a little wobble at the top, back down with a bounce.
      let tiltAng = 0;
      if (tiltT >= 0 && !still) {
        tiltT += dt / tiltDur;
        const up = easeOutCubic(clamp(tiltT / 0.3, 0, 1));
        const down = 1 - easeInOutCubic(clamp((tiltT - 0.6) / 0.4, 0, 1));
        const wobble = 1 + 0.07 * Math.sin(tiltT * Math.PI * 9) * smooth(0.25, 0.35, tiltT) * (1 - smooth(0.55, 0.65, tiltT));
        tiltAng = tiltMax * up * down * wobble;
        if (tiltT >= 1) {
          tiltT = -1;
          tiltAng = 0;
          sqV += 2.2; // lands on its springs
        }
      }
      tilt.rotation.z = -tiltDir * tiltAng;

      // Springs, in fixed 1/120 s steps: a long frame (a hitch, a busy machine) used to let the
      // spring overshoot and lock into flicking between fully squashed and fully stretched.
      if (!still) {
        let rem = Math.min(dt, 0.1);
        while (rem > 1e-6) {
          const h = Math.min(rem, 1 / 120);
          sqV += (-260 * sq - 13 * sqV) * h;
          sq += sqV * h;
          if (sq > 0.26) {
            sq = 0.26;
            sqV = Math.min(sqV, 0);
          } else if (sq < -0.22) {
            sq = -0.22;
            sqV = Math.max(sqV, 0);
          }
          rem -= h;
        }
      }
      squash.scale.set(1 + sq * 0.55, 1 - sq, 1 + sq * 0.55);

      // Sparkles: each pops in, twinkles and fades; one appears on its own every couple of seconds.
      if (ready && !still) {
        nextAmbient -= dt;
        if (nextAmbient <= 0) {
          const free = stars.find((st) => st.t < 0);
          if (free) placeStar(free, 0);
          nextAmbient = 1.4 + Math.random() * 1.8;
        }
      }
      for (const st of stars) {
        if (st.t < 0) continue;
        st.t += dt;
        const lt = st.t - st.delay;
        if (lt < 0) {
          st.sprite.visible = false;
          continue;
        }
        const LIFE = 0.95;
        const pop = easeOutBack(Math.min(1, lt / 0.22));
        const out = 1 - smooth(0.55, LIFE, lt);
        const twinkle = 0.75 + 0.25 * Math.sin(lt * 26 + st.spin * 10);
        st.sprite.visible = true;
        st.sprite.position.set(st.pos.x, st.pos.y + lt * size.y * 0.05, st.pos.z);
        st.sprite.scale.setScalar(Math.max(0.001, st.size * pop * out * twinkle));
        st.mat.rotation = st.spin * lt;
        st.mat.opacity = out;
        if (lt >= LIFE) {
          st.t = -1;
          st.sprite.visible = false;
        }
      }

      // --- wheels ------------------------------------------------------------
      const spinTarget = pending ? 9 : storyTurn * 6;
      spin += (spinTarget - spin) * Math.min(1, dt * (pending ? 2.5 : 1.6));
      if (!still) handles.wheels.forEach((w) => (w.rotation.x += spin * dt));
      // Once the spin dies down, ease each wheel to the nearest full turn so the "N" ends upright.
      if (ready && !pending && spin < 1.2) {
        const ease = Math.min(1, dt * 2.5);
        handles.wheels.forEach((w) => {
          const rest = Math.ceil(w.rotation.x / (Math.PI * 2) - 0.02) * Math.PI * 2;
          w.rotation.x += (rest - w.rotation.x) * ease;
        });
      }

      // --- headlights, face, shadow -----------------------------------------
      flash = Math.max(0, flash - dt / 0.6);
      handles.setHeadlights(1 + flash * 2.2 + (pending ? 0.4 : 0));
      if (f) {
        f.look(lookX, lookY);
        f.update(dt, still);
      }
      // The contact shadow tightens and fades as the car leaves the ground.
      const away = drive ? 0 : clamp(air / 0.6 + (still ? 0 : (bob + 0.03) * 2.5), 0, 1);
      const ck = drive ? drive.k : 1;
      contact.scale.set(contactScale.x * ck * (1 - away * 0.25), contactScale.y * ck * (1 - away * 0.25), 1);
      contact.position.x = pivot.position.x;
      contact.position.y = drive ? drive.contactY + 0.01 : contactRestY;
      contactMat.opacity = contactBase * (1 - away * 0.45);
    },
    event(e) {
      const f = face();
      if (e.type === "story") {
        storyTurn = 1;
        f?.play(STORY_FACES[e.index % STORY_FACES.length], 1.2);
      } else if (e.type === "flash") {
        flash = 1;
        f?.play("excited", 0.9);
      } else if (e.type === "pending") {
        pending = e.on;
        f?.setBase(e.on ? "focused" : "happy");
      } else if (e.type === "error") {
        pending = false;
        f?.setBase("happy");
        f?.play("surprised", 1.8);
        shakeT = 0;
      } else if (e.type === "poke") {
        if (intro !== "done") return;
        hop(0.34);
        f?.play("wink", 1.0);
        f?.talk(0.8);
        burst();
        spin = Math.max(spin, 5);
      }
    },
    setLight(light) {
      rim.intensity = light ? 3 : 5;
      contactBase = light ? 0.45 : 0.85;
      contactMat.opacity = contactBase;
      // Additive light vanishes on porcelain: in the light theme the sparkles are drawn in gold.
      for (const st of stars) {
        st.mat.blending = light ? THREE.NormalBlending : THREE.AdditiveBlending;
        st.mat.color.setHex(light ? ACCENT_HEX : 0xfff1c6);
        st.mat.needsUpdate = true;
      }
    },
    dispose() {
      disposed = true;
      handles?.dispose();
      contact.geometry.dispose();
      contactMat.dispose();
      contactTex.dispose();
      starTex.dispose();
      stars.forEach((st) => st.mat.dispose());
      envMap.dispose();
      key.dispose();
      rim.dispose();
      fill.dispose();
    },
  };
}
