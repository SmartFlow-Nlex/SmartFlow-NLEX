import * as THREE from "three";
import { DecalGeometry } from "three/examples/jsm/geometries/DecalGeometry.js";
import { createMascotFace, type MascotFace } from "./face";

/**
 * NLEX mascot car: procedural Three.js model built with the img2threejs pipeline.
 * Reconstruction data lives in ./nlex-mascot.sculpt-spec.json; the constants below mirror it.
 * Forward is +Z, Y up, the car's own left is +X. Origin on the ground between the axles.
 */

export interface NlexMascotHandles {
  wheels: THREE.Group[];
  headlights: THREE.Mesh[];
  headlightMaterials: THREE.MeshStandardMaterial[];
  setHeadlights(intensity01: number): void;
  /** The drawn, animatable face (null where no 2D canvas is available). */
  face: MascotFace | null;
  ready: Promise<void>;
  dispose(): void;
}

export interface CreateNlexMascotOptions {
  assetBase?: string;
  anisotropy?: number;
}

// ------------------------------------------------------------------ reconstruction data
type BodyKey = readonly [y: number, a: number, b: number, cz: number, n: number];

/**
 * Superellipse loft keys: height, half-width, half-depth, depth centre, exponent.
 * v2 (5 Oct 2026, hand-tuned past the pipeline's proportion-lock): a wide bumper the wheels
 * tuck behind, a bonnet that rolls into the windscreen, and a rounded roof and tail, so the car
 * reads as a car from the side instead of a box. v3 (the character sheet, 5 Oct 2026): the
 * windscreen stands more upright, as the sheet's side view draws it, so the face looks ahead.
 */
const BODY_KEYS: readonly BodyKey[] = [
  [0.2, 0.5, 0.66, 0.0, 3.0],
  [0.25, 0.615, 0.8, 0.02, 3.4],
  [0.31, 0.66, 0.845, 0.03, 3.8],
  [0.37, 0.665, 0.845, 0.025, 3.9],
  [0.43, 0.658, 0.8275, 0.0125, 3.8],
  [0.5, 0.648, 0.8075, 0.0075, 3.6],
  [0.59, 0.635, 0.785, 0.0, 3.4],
  [0.68, 0.62, 0.75, -0.015, 3.3],
  [0.76, 0.6, 0.705, -0.04, 3.2],
  [0.82, 0.585, 0.655, -0.07, 3.1],
  [0.9, 0.572, 0.62, -0.085, 3.0],
  [1.0, 0.562, 0.59, -0.09, 2.9],
  [1.1, 0.55, 0.555, -0.095, 2.85],
  [1.18, 0.535, 0.515, -0.1, 2.8],
  [1.25, 0.505, 0.455, -0.105, 2.7],
  [1.31, 0.45, 0.375, -0.105, 2.6],
  [1.355, 0.33, 0.27, -0.1, 2.4],
  [1.38, 0.004, 0.004, -0.1, 2.2],
];
const BODY_SEGMENTS = 168;
const BODY_RINGS_PER_KEY = 7;

const WHEEL = {
  radius: 0.31,
  width: 0.3,
  trackHalf: 0.53,
  axleZ: 0.47,
  frontToeIn: 0.2, // pigeon-toed cartoon stance: front wheels turned in so their hubs face forward
  hubOffset: 0.134,
  tyreProfile: [
    [0.1949, -0.1361], [0.2458, -0.1500], [0.2834, -0.1446], [0.3022, -0.1221], [0.3089, -0.0729], [0.3100, 0.0000],
    [0.3089, 0.0729], [0.3022, 0.1221], [0.2834, 0.1446], [0.2458, 0.1500], [0.1949, 0.1361], [0.1882, 0.0643], [0.1882, -0.0643], [0.1949, -0.1361],
  ] as const,
  hubProfile: [[0.2015, 0.0000], [0.1949, 0.0407], [0.1805, 0.0568], [0.1572, 0.0525], [0.1450, 0.0321], [0.1240, 0.0364], [0.0000, 0.0407]] as const,
};
const WELLS = { pad: 0.035, blend: 0.06, innerWallX: 0.35 };
/**
 * Fenders, moulded into the body: around the upper half of each wheel the flank swells out to
 * `outer` over a ring `band` wide outside the wheel well, rising fast at the well's edge (`rise`,
 * as a fraction of the band) and easing back into the flank from `fall`. The tyre stands a touch
 * proud of it, as on the sheet.
 */
const FENDER = { band: 0.15, rise: 0.22, fall: 0.55, outer: 0.7, fromX: 0.36, fullX: 0.5 };

const FACE_PANEL = {
  halfWidth: 0.48, yBottom: 0.82, yTopCentre: 1.238, humpX: 0.22, humpRise: 0.05, humpWidth: 0.12,
  topCornerRx: 0.15, topCornerRy: 0.22, bottomCornerRadius: 0.03, offset: 0.006, columns: 64, rows: 24,
};

/** Mirrors: rooted on the A-pillar (polar angle `rootT` on the loft at `rootY`), an egg-shaped
 *  housing a short stalk away, long axis outward and a little forward. */
const MIRROR = { rootY: 0.86, rootT: 0.62, reach: [0.115, 0.045, 0.02], headRadii: [0.175, 0.13, 0.105], yaw: 0.35, stalkRadius: 0.036 } as const;
type WindowSpec = { zRear: number; zFront: number; yCentre: number; halfHeight: number; rake: number; round: number; offset: number; columns: number; rows: number };
/** Side glass: a front pane behind the face and a rear quarter pane, split by a B-pillar. */
const SIDE_WINDOWS: readonly WindowSpec[] = [
  { zRear: -0.07, zFront: 0.27, yCentre: 1.045, halfHeight: 0.15, rake: 0.13, round: 4, offset: 0.006, columns: 32, rows: 12 },
  { zRear: -0.47, zFront: -0.14, yCentre: 1.045, halfHeight: 0.14, rake: -0.04, round: 4, offset: 0.006, columns: 32, rows: 12 },
];
/** The dark-blue frame round each pane: the same shape, this much bigger, just behind it. */
const WINDOW_FRAME = 0.024;
/** Rounded bumper lips swept along the loft, in front of and behind the wheels. */
const BUMPER = { front: { y: 0.37, radius: 0.064 }, rear: { y: 0.37, radius: 0.058 }, samples: 72, rings: 18 };
/** Rounded-rectangle taillights, red with an amber inner end, as in the sheet's rear detail. */
const TAILLIGHT = { x: 0.4, y: 0.6, w: 0.21, h: 0.1, r: 0.045, depth: 0.026 } as const;
/** The rear window under the cap, and the door handles. */
const REAR_WINDOW = { halfWidth: 0.33, yBottom: 0.88, yTop: 1.12, corner: 0.085, offset: 0.006, columns: 40, rows: 14 };
const HANDLE = { z: -0.1, y: 0.79, radius: 0.013, length: 0.075 };

const CAP = {
  position: [0.0, 1.31, -0.07], rotation: [-0.1, 0.0, 0.0], crownRadii: [0.62, 0.6, 0.56],
  brim: { halfWidth: 0.5, reach: 0.38, droop: 0.6, tilt: 0.26, thickness: 0.05, sweepDeg: 26 },
} as const;

/* The character sheet's palette: Primary Blue #0B6FFF, Light Blue #63B3FF, Dark Gray #2D3748. */
// Lifted a step toward cyan from the sheet's #0B6FFF: the renderer's ACES curve pushes a pure
// blue toward violet, and this lands on the sheet's on-screen azure.
const PAINT_HEX = 0x2484ff;
const CAP_BLUE_HEX = 0x1777f2;
const UNDERBODY_HEX = 0x2d3748;

// The white front panel sits in the middle of the crown, blue showing either side, as on the sheet.
const CAP_FRONT_PANEL = { halfSpan: 0.9, elevationTop: 1.18, offset: 0.006 };
const HEADLIGHT = { x: 0.37, y: 0.565, lensRadius: 0.114, domeDepth: 0.044, bezelRadius: 0.124, bezelTube: 0.02, emissive: 0.38, halo: 2.1, haloOpacity: 0.16 };
const STRIPE = { dir: [0.6, -0.2, 0.78], radius: 0.026, length: 0.13 } as const;
const TREAD = { count: 26, angleDeg: 32, axial: 0.064, block: [0.037, 0.014, 0.06] } as const;
const LOOK = { faceEmissive: 0.12, capWhiteEmissive: 0.08, decalEmissive: 0.26 };

/**
 * Decal projectors (model space). Each projects a cut of the PNG along `dir` (into the surface)
 * with the texture's up axis aligned to model +Y. Centres and sizes were solved by ray-casting the
 * crop boxes of the levelled PNG from the fitted reference camera (see README).
 */
interface DecalSpec {
  name: string;
  /** A file in assetBase, or "procedural:<name>" for a texture drawn here. */
  texture: string;
  targets: readonly ("windscreen-face-panel" | "body-shell" | "cap-front-panel" | "cap-crown")[];
  center: readonly [number, number, number];
  dir: readonly [number, number, number];
  size: readonly [number, number];
  depth: number;
}
const DECALS: readonly DecalSpec[] = [
  // The face is drawn (./face.ts) in the same projector box the PNG cut used, so it can blink and emote.
  { name: "face-decal", texture: "procedural:face", targets: ["windscreen-face-panel", "body-shell"], center: [0.0, 0.945, 0.3945], dir: [0.0, 0.064, -0.998], size: [1.08, 0.728], depth: 0.8 },
  { name: "cap-logo", texture: "decal-cap-logo.png", targets: ["cap-front-panel"], center: [0.0, 1.64, 0.3198], dir: [0.0, 0.2, -0.98], size: [0.62, 0.206], depth: 0.4 },
  { name: "bonnet-badge-n", texture: "decal-badge-n.png", targets: ["body-shell"], center: [0.0, 0.53, 0.7767], dir: [0.0, -0.03, -0.9996], size: [0.14, 0.1173], depth: 0.2 },
  // Rear: the "N" plate between the taillights, and the strap opening at the back of the cap.
  { name: "rear-plate", texture: "procedural:plate", targets: ["body-shell"], center: [0.0, 0.48, -0.8], dir: [0.0, 0.0, 1.0], size: [0.3, 0.14], depth: 0.25 },
  { name: "cap-back", texture: "procedural:cap-back", targets: ["cap-crown"], center: [0.0, 1.45, -0.62], dir: [0.0, -0.1, 0.995], size: [0.44, 0.28], depth: 0.35 },
];
const HUB_N = { texture: "decal-hub-n.png", width: 0.15, aspect: 368 / 508, lift: 0.003 };

// ------------------------------------------------------------------ math helpers
/** Fritsch-Carlson monotone cubic through uniformly spaced samples; s in [0, n-1]. */
function monotoneCurve(values: readonly number[]): (s: number) => number {
  const n = values.length;
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push(values[i + 1] - values[i]);
  const m: number[] = new Array(n).fill(0);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const h = a * a + b * b;
    if (h > 9) {
      const t = 3 / Math.sqrt(h);
      m[i] = t * a * d[i];
      m[i + 1] = t * b * d[i];
    }
  }
  return (s: number) => {
    const sc = Math.min(Math.max(s, 0), n - 1);
    const i = Math.min(Math.floor(sc), n - 2);
    const t = sc - i;
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * values[i] + (t3 - 2 * t2 + t) * m[i] + (-2 * t3 + 3 * t2) * values[i + 1] + (t3 - t2) * m[i + 1];
  };
}

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return t * t * (3 - 2 * t);
};

const signedPow = (v: number, p: number) => Math.sign(v) * Math.pow(Math.abs(v), p);

/** The body loft as a pure function of (t around, s along keys). */
class BodyLoft {
  private readonly Y = monotoneCurve(BODY_KEYS.map((k) => k[0]));
  private readonly A = monotoneCurve(BODY_KEYS.map((k) => k[1]));
  private readonly B = monotoneCurve(BODY_KEYS.map((k) => k[2]));
  private readonly CZ = monotoneCurve(BODY_KEYS.map((k) => k[3]));
  private readonly N = monotoneCurve(BODY_KEYS.map((k) => k[4]));
  readonly sMax = BODY_KEYS.length - 1;

  /** Point at polar angle t (from +X toward +Z) on the section at s; polar sampling keeps the flat side walls evenly tessellated. */
  point(t: number, s: number, out = new THREE.Vector3()): THREE.Vector3 {
    const y = this.Y(s);
    const a = this.A(s);
    const b = this.B(s);
    const n = this.N(s);
    const c = Math.cos(t);
    const si = Math.sin(t);
    const r = Math.pow(Math.pow(Math.abs(c / a), n) + Math.pow(Math.abs(si / b), n), -1 / n);
    let x = r * c;
    const z = this.CZ(s) + r * si;
    // wheel wells: pull |x| in to the well wall inside each wheel's radius
    for (const az of [WHEEL.axleZ, -WHEEL.axleZ]) {
      const dz = z - az;
      const dy = y - WHEEL.radius;
      const d = Math.hypot(dz, dy);
      const r = WHEEL.radius + WELLS.pad;
      const ax = Math.abs(x);
      if (d < r) {
        const w = smoothstep(r, r - WELLS.blend, d);
        if (ax > WELLS.innerWallX) x = Math.sign(x) * (ax - w * (ax - WELLS.innerWallX));
      } else {
        // the fender: only over the upper part of the wheel, and only on the flanks
        const u = (d - r) / FENDER.band;
        if (u < 1 && ax < FENDER.outer) {
          const push = smoothstep(0, FENDER.rise, u) * (1 - smoothstep(FENDER.fall, 1, u));
          const k = push * smoothstep(-0.03, 0.09, dy) * smoothstep(FENDER.fromX, FENDER.fullX, ax);
          if (k > 0) x = Math.sign(x) * (ax + k * (FENDER.outer - ax));
        }
      }
    }
    return out.set(x, y, z);
  }

  normal(t: number, s: number, out = new THREE.Vector3()): THREE.Vector3 {
    const e = 1e-3;
    const pt0 = this.point(t - e, s, new THREE.Vector3());
    const pt1 = this.point(t + e, s, new THREE.Vector3());
    const ps0 = this.point(t, Math.max(0, s - e), new THREE.Vector3());
    const ps1 = this.point(t, Math.min(this.sMax, s + e), new THREE.Vector3());
    const dt = pt1.sub(pt0);
    const ds = ps1.sub(ps0);
    out.crossVectors(ds, dt);
    if (out.lengthSq() < 1e-14) return out.set(0, s > this.sMax / 2 ? 1 : -1, 0);
    return out.normalize();
  }

  /** s at which the loft reaches height y (Y is monotone in s). */
  sAtHeight(y: number): number {
    let lo = 0;
    let hi = this.sMax;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (this.Y(mid) < y) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  }

  /** Surface depth z(x, y) on the front (end = 1) or the back (end = -1): the section at height y solved for lateral x. */
  endZ(x: number, y: number, end: 1 | -1 = 1): number {
    const s = this.sAtHeight(y);
    const a = this.A(s);
    const n = this.N(s);
    const u = Math.min(Math.abs(x) / a, 0.999999);
    return this.CZ(s) + end * this.B(s) * Math.pow(1 - Math.pow(u, n), 1 / n);
  }

  frontZ(x: number, y: number): number {
    return this.endZ(x, y, 1);
  }

  /** Surface point + outward normal on the front (end = 1) or the back (end = -1) for a lateral x and height y. */
  frontFrame(x: number, y: number, end: 1 | -1 = 1) {
    const e = 1e-3;
    const z = this.endZ(x, y, end);
    const dzdx = (this.endZ(x + e, y, end) - this.endZ(x - e, y, end)) / (2 * e);
    const dzdy = (this.endZ(x, y + e, end) - this.endZ(x, y - e, end)) / (2 * e);
    return { point: new THREE.Vector3(x, y, z), normal: new THREE.Vector3(-dzdx * end, -dzdy * end, end).normalize() };
  }

  /** Lateral extent |x|(z, y) of the side wall (above the wheel wells). */
  sideX(z: number, y: number): number {
    const s = this.sAtHeight(y);
    const b = this.B(s);
    const n = this.N(s);
    const u = Math.min(Math.abs(z - this.CZ(s)) / b, 0.999999);
    return this.A(s) * Math.pow(1 - Math.pow(u, n), 1 / n);
  }

  /** Surface point + outward normal on the side wall (side = 1 is +X). */
  sideFrame(z: number, y: number, side: 1 | -1) {
    const e = 1e-3;
    const x = this.sideX(z, y);
    const dxdz = (this.sideX(z + e, y) - this.sideX(z - e, y)) / (2 * e);
    const dxdy = (this.sideX(z, y + e) - this.sideX(z, y - e)) / (2 * e);
    return { point: new THREE.Vector3(side * x, y, z), normal: new THREE.Vector3(side, -dxdy, -dxdz).normalize() };
  }
}

// ------------------------------------------------------------------ geometry builders
/** The body, with vertex colours: the paint above, the sheet's dark-gray underbody along the sill. */
function buildBodyGeometry(loft: BodyLoft): THREE.BufferGeometry {
  const ringCount = loft.sMax * BODY_RINGS_PER_KEY + 1;
  const cols = BODY_SEGMENTS;
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const index: number[] = [];
  const paintC = new THREE.Color(PAINT_HEX);
  const underC = new THREE.Color(UNDERBODY_HEX);
  const tint = new THREE.Color();
  const shade = (y: number) => {
    tint.copy(paintC).lerp(underC, smoothstep(0.245, 0.215, y));
    colors.push(tint.r, tint.g, tint.b);
  };
  const p = new THREE.Vector3();
  const nrm = new THREE.Vector3();
  for (let j = 0; j < ringCount; j++) {
    const s = (j / (ringCount - 1)) * loft.sMax;
    for (let i = 0; i <= cols; i++) {
      const t = (i / cols) * Math.PI * 2;
      loft.point(t, s, p);
      loft.normal(t, s, nrm);
      positions.push(p.x, p.y, p.z);
      normals.push(nrm.x, nrm.y, nrm.z);
      shade(p.y);
    }
  }
  for (let j = 0; j < ringCount - 1; j++) {
    for (let i = 0; i < cols; i++) {
      const a = j * (cols + 1) + i;
      const b = a + 1;
      const c = a + cols + 1;
      const d = c + 1;
      index.push(a, c, b, b, c, d);
    }
  }
  // poles
  const bottom = positions.length / 3;
  const b0 = loft.point(0, 0);
  positions.push(0, b0.y - 0.004, 0);
  normals.push(0, -1, 0);
  shade(b0.y - 0.004);
  for (let i = 0; i < cols; i++) index.push(bottom, i, i + 1);
  const top = positions.length / 3;
  const lastRing = (ringCount - 1) * (cols + 1);
  const t0 = loft.point(Math.PI / 2, loft.sMax);
  positions.push(0, t0.y + 0.002, BODY_KEYS[BODY_KEYS.length - 1][3]);
  normals.push(0, 1, 0);
  shade(t0.y);
  for (let i = 0; i < cols; i++) index.push(top, lastRing + i + 1, lastRing + i);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(index);
  return g;
}

function facePanelTop(x: number): number {
  const P = FACE_PANEL;
  const ax = Math.abs(x);
  let y = P.yTopCentre + P.humpRise * Math.exp(-(((ax - P.humpX) / P.humpWidth) ** 2));
  const edge = P.halfWidth - P.topCornerRx; // elliptical top corners (traced from the PNG)
  if (ax > edge) {
    const u = Math.min((ax - edge) / P.topCornerRx, 1);
    y -= P.topCornerRy * (1 - Math.sqrt(1 - u * u));
  }
  return y;
}

function facePanelBottom(x: number): number {
  const P = FACE_PANEL;
  const ax = Math.abs(x);
  let y = P.yBottom;
  const edge = P.halfWidth - P.bottomCornerRadius;
  if (ax > edge) {
    const dx = Math.min(ax - edge, P.bottomCornerRadius);
    y += P.bottomCornerRadius - Math.sqrt(P.bottomCornerRadius ** 2 - dx * dx);
  }
  return y;
}

/** White face plate: a column-parameterised patch lying on the loft, offset along its normal. */
function buildFacePanelGeometry(loft: BodyLoft): THREE.BufferGeometry {
  const P = FACE_PANEL;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const index: number[] = [];
  for (let i = 0; i <= P.columns; i++) {
    const u = i / P.columns;
    const x = -P.halfWidth * Math.cos(u * Math.PI); // denser columns near the rounded sides
    const y0 = facePanelBottom(x);
    const y1 = facePanelTop(x);
    for (let j = 0; j <= P.rows; j++) {
      const v = j / P.rows;
      const y = y0 + (y1 - y0) * v;
      const f = loft.frontFrame(x, y);
      const p = f.point.addScaledVector(f.normal, P.offset);
      positions.push(p.x, p.y, p.z);
      normals.push(f.normal.x, f.normal.y, f.normal.z);
      uvs.push(u, v);
    }
  }
  const stride = P.rows + 1;
  for (let i = 0; i < P.columns; i++) {
    for (let j = 0; j < P.rows; j++) {
      const a = i * stride + j;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      index.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(index);
  return g;
}

/** Tinted side window on the cabin wall: rounded at both ends, its front edge raked back like the windscreen. */
function buildSideWindowGeometry(loft: BodyLoft, side: 1 | -1, W: WindowSpec): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const index: number[] = [];
  for (let i = 0; i <= W.columns; i++) {
    const u = i / W.columns; // rear -> front
    const half = W.halfHeight * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(u * 2 - 1), W.round)), 1 / W.round);
    for (let j = 0; j <= W.rows; j++) {
      const k = (j / W.rows) * 2 - 1; // bottom -> top
      const y = W.yCentre + k * half;
      const z = W.zRear + (W.zFront - W.zRear) * u - W.rake * k * u;
      const f = loft.sideFrame(z, y, side);
      const p = f.point.addScaledVector(f.normal, W.offset);
      positions.push(p.x, p.y, p.z);
      normals.push(f.normal.x, f.normal.y, f.normal.z);
    }
  }
  const stride = W.rows + 1;
  for (let i = 0; i < W.columns; i++) {
    for (let j = 0; j < W.rows; j++) {
      const a = i * stride + j;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      if (side > 0) index.push(a, b, c, b, d, c);
      else index.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  g.setIndex(index);
  return g;
}

/** Headlight lens face: a hot white core falling off to the PNG's pale blue rim, with two faint reflector rings. */
function buildHeadlightTexture(): THREE.Texture | null {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  if (!g) return null;
  const R = 128;
  const fill = g.createRadialGradient(R * 0.94, R * 0.88, 0, R, R, R);
  fill.addColorStop(0, "#ffffff");
  fill.addColorStop(0.22, "#f4faff");
  fill.addColorStop(0.45, "#c4e2ff");
  fill.addColorStop(0.7, "#7fb2ec");
  fill.addColorStop(0.88, "#5f93da");
  fill.addColorStop(1, "#4c80c8");
  g.fillStyle = fill;
  g.fillRect(0, 0, 256, 256);
  g.lineWidth = 3;
  for (const [r, a] of [[0.6, 0.16], [0.8, 0.12]] as const) {
    g.strokeStyle = `rgba(255,255,255,${a})`;
    g.beginPath();
    g.arc(R, R, R * r, 0, Math.PI * 2);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Planar UVs for a disc-like geometry facing +Z, centred on the origin with the given radius. */
function discUVs(g: THREE.BufferGeometry, r: number): THREE.BufferGeometry {
  const pos = g.getAttribute("position");
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = 0.5 + pos.getX(i) / (2 * r);
    uv[i * 2 + 1] = 0.5 + pos.getY(i) / (2 * r);
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return g;
}

/** Soft additive glow drawn in front of each headlight, so the lamps read as lit rather than as white plates. */
function buildHaloTexture(): THREE.Texture | null {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  if (!g) return null;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,255,255,0.9)");
  grad.addColorStop(0.3, "rgba(255,255,255,0.42)");
  grad.addColorStop(0.55, "rgba(255,255,255,0.12)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * A rounded lip swept across one end of the body at height y: half sunk into the paint, tapering
 * shut where it meets the wheel arches. end = 1 is the front bumper, -1 the rear.
 */
function buildBumperGeometry(loft: BodyLoft, y: number, radius: number, end: 1 | -1): THREE.BufferGeometry {
  const s = loft.sAtHeight(y);
  const clear = WHEEL.axleZ + WHEEL.radius + 0.015; // stay just ahead of (or behind) the tyres
  // the stretch of the section that clears the arches, centred on t = ±π/2
  const mid = end > 0 ? Math.PI / 2 : -Math.PI / 2;
  let span = 0;
  const p = new THREE.Vector3();
  for (let k = 1; k <= 400; k++) {
    const dt = (k / 400) * (Math.PI / 2);
    loft.point(mid + dt, s, p);
    if (p.z * end < clear) break;
    span = dt;
  }
  const S = BUMPER.samples;
  const R = BUMPER.rings;
  const positions: number[] = [];
  const index: number[] = [];
  const nrm = new THREE.Vector3();
  const tan = new THREE.Vector3();
  const bin = new THREE.Vector3();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  for (let i = 0; i <= S; i++) {
    const u = i / S;
    const t = mid - span + 2 * span * u;
    loft.point(t, s, p);
    loft.normal(t, s, nrm);
    loft.point(t - 1e-3, s, a);
    loft.point(t + 1e-3, s, b);
    tan.subVectors(b, a).normalize();
    bin.crossVectors(tan, nrm).normalize();
    const r = radius * Math.pow(Math.sin(Math.PI * u), 0.22);
    const c = p.clone().addScaledVector(nrm, r * 0.35);
    for (let j = 0; j <= R; j++) {
      const th = (j / R) * Math.PI * 2;
      positions.push(
        c.x + r * (Math.cos(th) * nrm.x + Math.sin(th) * bin.x),
        c.y + r * (Math.cos(th) * nrm.y + Math.sin(th) * bin.y),
        c.z + r * (Math.cos(th) * nrm.z + Math.sin(th) * bin.z),
      );
    }
  }
  for (let i = 0; i < S; i++) {
    for (let j = 0; j < R; j++) {
      const q = i * (R + 1) + j;
      const w = q + R + 1;
      index.push(q, q + 1, w, q + 1, w + 1, w);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/** Light-blue rear window: a rounded rectangle lying on the back of the body, under the cap. */
function buildRearWindowGeometry(loft: BodyLoft): THREE.BufferGeometry {
  const R = REAR_WINDOW;
  const positions: number[] = [];
  const normals: number[] = [];
  const index: number[] = [];
  for (let i = 0; i <= R.columns; i++) {
    const x = -R.halfWidth + (2 * R.halfWidth * i) / R.columns;
    const ax = Math.abs(x);
    const edge = R.halfWidth - R.corner;
    const inset = ax > edge ? R.corner - Math.sqrt(Math.max(0, R.corner * R.corner - (ax - edge) ** 2)) : 0;
    const y0 = R.yBottom + inset;
    const y1 = R.yTop - inset;
    for (let j = 0; j <= R.rows; j++) {
      const f = loft.frontFrame(x, y0 + ((y1 - y0) * j) / R.rows, -1);
      const p = f.point.addScaledVector(f.normal, R.offset);
      positions.push(p.x, p.y, p.z);
      normals.push(f.normal.x, f.normal.y, f.normal.z);
    }
  }
  const stride = R.rows + 1;
  for (let i = 0; i < R.columns; i++) {
    for (let j = 0; j < R.rows; j++) {
      const a = i * stride + j;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      index.push(a, b, c, b, d, c); // wound for a viewer behind the car
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  g.setIndex(index);
  return g;
}

/** A rounded-rectangle slab facing +Z, centred on the origin, its front face at z = depth. */
function buildRoundedSlab(w: number, h: number, r: number, depth: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const x0 = -w / 2;
  const y0 = -h / 2;
  shape.moveTo(x0 + r, y0);
  shape.lineTo(x0 + w - r, y0);
  shape.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r);
  shape.lineTo(x0 + w, y0 + h - r);
  shape.quadraticCurveTo(x0 + w, y0 + h, x0 + w - r, y0 + h);
  shape.lineTo(x0 + r, y0 + h);
  shape.quadraticCurveTo(x0, y0 + h, x0, y0 + h - r);
  shape.lineTo(x0, y0 + r);
  shape.quadraticCurveTo(x0, y0, x0 + r, y0);
  const bevel = Math.min(0.008, r * 0.4);
  return new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.001, depth - bevel), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 10 });
}

/** A basis whose +Z is `normal` and whose +Y stays as close to world up as it can. */
function surfaceQuaternion(normal: THREE.Vector3): THREE.Quaternion {
  const z = normal.clone().normalize();
  const y = new THREE.Vector3(0, 1, 0).addScaledVector(z, -z.y).normalize();
  const x = new THREE.Vector3().crossVectors(y, z);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

/** Rounded-rectangle path on a 2D canvas. */
function roundRectPath(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** The rear plate: a deep-blue plate with a white "N", as on the sheet's back view. */
function buildPlateTexture(): THREE.Texture | null {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = 384;
  c.height = 180;
  const g = c.getContext("2d");
  if (!g) return null;
  g.fillStyle = "#dfe8f7";
  roundRectPath(g, 4, 4, 376, 172, 30);
  g.fill();
  const bg = g.createLinearGradient(0, 12, 0, 168);
  bg.addColorStop(0, "#1b52c9");
  bg.addColorStop(1, "#0b2f86");
  g.fillStyle = bg;
  roundRectPath(g, 14, 14, 356, 152, 22);
  g.fill();
  g.fillStyle = "#ffffff";
  g.font = 'italic 900 128px "Arial Black", Arial, sans-serif';
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("N", 192, 96);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The back of the cap: the strap opening (a dark arch), the strap across it, a seam above. */
function buildCapBackTexture(): THREE.Texture | null {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 330;
  const g = c.getContext("2d");
  if (!g) return null;
  g.strokeStyle = "rgba(6, 34, 100, 0.55)";
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(256, 0);
  g.lineTo(256, 160);
  g.stroke();
  const arch = g.createLinearGradient(0, 170, 0, 330);
  arch.addColorStop(0, "#041a4a");
  arch.addColorStop(1, "#0a2f7a");
  g.fillStyle = arch;
  g.beginPath();
  g.moveTo(130, 330);
  g.bezierCurveTo(130, 220, 190, 168, 256, 168);
  g.bezierCurveTo(322, 168, 382, 220, 382, 330);
  g.closePath();
  g.fill();
  g.fillStyle = "#0a62e6";
  g.fillRect(118, 268, 276, 34);
  g.fillStyle = "rgba(4, 26, 74, 0.45)";
  g.fillRect(118, 268, 276, 5);
  g.fillRect(118, 297, 276, 5);
  g.fillStyle = "#d9e2ef";
  g.fillRect(232, 262, 48, 46);
  g.fillStyle = "#8d9bb1";
  g.fillRect(244, 274, 24, 22);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildCrownGeometry(): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 56, 18, 0, Math.PI * 2, 0, Math.PI / 2);
  g.scale(CAP.crownRadii[0], CAP.crownRadii[1], CAP.crownRadii[2]);
  return g;
}

/** Curved visor: inner edge follows the crown base, widest at the front, drooping at its sides. */
function buildBrimGeometry(): THREE.BufferGeometry {
  const B = CAP.brim;
  const [rx, , rz] = CAP.crownRadii;
  const cols = 48;
  const rows = 8;
  const phi0 = THREE.MathUtils.degToRad(B.sweepDeg);
  const positions: number[] = [];
  const index: number[] = [];
  const grid = (side: number) => {
    const base = positions.length / 3;
    for (let i = 0; i <= cols; i++) {
      const phi = phi0 + (Math.PI - 2 * phi0) * (i / cols);
      const ix = Math.cos(phi) * rx * 0.97;
      const iz = Math.sin(phi) * rz * 0.97;
      const ext = B.reach * Math.pow(Math.sin(phi), 1.6);
      const dirX = Math.cos(phi) * 0.35;
      const dirZ = Math.sin(phi);
      const len = Math.hypot(dirX, dirZ);
      for (let j = 0; j <= rows; j++) {
        const v = j / rows;
        const x = ix + (dirX / len) * (ext + 0.03) * v;
        const z = iz + (dirZ / len) * (ext + 0.03) * v;
        const y = -B.droop * Math.pow(Math.abs(x) / (rx + 0.05), 2.2) * 0.35 - Math.tan(B.tilt) * (ext + 0.03) * v;
        positions.push(x, y + side * B.thickness * 0.5, z);
      }
    }
    const stride = rows + 1;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const a = base + i * stride + j;
        const b = a + 1;
        const c = a + stride;
        const d = c + 1;
        if (side > 0) index.push(a, b, c, b, d, c);
        else index.push(a, c, b, b, c, d);
      }
    }
    return base;
  };
  const top = grid(1);
  const bottom = grid(-1);
  const stride = rows + 1;
  // outer rim strip
  for (let i = 0; i < cols; i++) {
    const ta = top + i * stride + rows;
    const tb = top + (i + 1) * stride + rows;
    const ba = bottom + i * stride + rows;
    const bb = bottom + (i + 1) * stride + rows;
    index.push(ta, bb, tb, ta, ba, bb);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/** Lathe about the X axis. `outward` = +1 builds toward +X. */
function latheX(profile: readonly (readonly [number, number])[], segments: number, outward: number): THREE.BufferGeometry {
  const pts = profile.map(([r, h]) => new THREE.Vector2(Math.max(r, 1e-4), h));
  const g = new THREE.LatheGeometry(pts, segments);
  g.rotateZ(-Math.PI / 2); // lathe axis Y -> +X
  if (outward < 0) reflectGeometryX(g);
  return g;
}

/** Reflect a geometry x -> -x in place, fixing winding so faces stay front-facing. */
function reflectGeometryX(g: THREE.BufferGeometry, flipU = false): THREE.BufferGeometry {
  g.applyMatrix4(new THREE.Matrix4().makeScale(-1, 1, 1));
  const idx = g.getIndex();
  if (idx) {
    const arr = idx.array as Uint16Array | Uint32Array;
    for (let i = 0; i < arr.length; i += 3) {
      const tmp = arr[i + 1];
      arr[i + 1] = arr[i + 2];
      arr[i + 2] = tmp;
    }
    idx.needsUpdate = true;
  } else {
    const pos = g.getAttribute("position");
    const attrs = Object.values(g.attributes);
    for (let i = 0; i < pos.count; i += 3) {
      for (const attr of attrs) {
        for (let k = 0; k < attr.itemSize; k++) {
          const a = attr.getComponent(i + 1, k);
          attr.setComponent(i + 1, k, attr.getComponent(i + 2, k));
          attr.setComponent(i + 2, k, a);
        }
      }
    }
  }
  if (flipU) {
    const uv = g.getAttribute("uv");
    if (uv) for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
  }
  return g;
}

function cylinderBetween(a: THREE.Vector3, b: THREE.Vector3, radius: number): THREE.BufferGeometry {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(radius, radius, len, 16, 1, false);
  g.translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  g.applyQuaternion(q);
  g.translate(a.x, a.y, a.z);
  return g;
}

/** White foam front panel: a patch on the crown ellipsoid, narrowing toward the apex. */
function buildCapFrontPanelGeometry(): THREE.BufferGeometry {
  const [rx, ry, rz] = CAP.crownRadii;
  const P = CAP_FRONT_PANEL;
  const cols = 40;
  const rows = 24;
  const positions: number[] = [];
  const normals: number[] = [];
  const index: number[] = [];
  for (let j = 0; j <= rows; j++) {
    const e = 0.02 + (P.elevationTop - 0.02) * (j / rows);
    const span = P.halfSpan * Math.pow(1 - (j / rows) * 0.92, 0.75);
    for (let i = 0; i <= cols; i++) {
      const a = -span + 2 * span * (i / cols);
      const ux = Math.cos(e) * Math.sin(a);
      const uy = Math.sin(e);
      const uz = Math.cos(e) * Math.cos(a);
      const n = new THREE.Vector3(ux / rx, uy / ry, uz / rz).normalize();
      positions.push(rx * ux + n.x * P.offset, ry * uy + n.y * P.offset, rz * uz + n.z * P.offset);
      normals.push(n.x, n.y, n.z);
    }
  }
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = j * (cols + 1) + i;
      const b = a + 1;
      const c = a + cols + 1;
      const d = c + 1;
      index.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  g.setIndex(index);
  return g;
}

/** Shallow spherical dome lens facing +Z. */
function buildLensGeometry(): THREE.BufferGeometry {
  const r = HEADLIGHT.lensRadius;
  const d = HEADLIGHT.domeDepth;
  const R = (r * r + d * d) / (2 * d);
  const alpha = Math.asin(r / R);
  const g = new THREE.SphereGeometry(R, 40, 10, 0, Math.PI * 2, 0, alpha);
  g.translate(0, -(R - d), 0);
  g.rotateX(Math.PI / 2);
  return g;
}

/** Point on an ellipsoid (centre c, radii r) along direction u. */
function ellipsoidPoint(c: THREE.Vector3, r: readonly [number, number, number], u: THREE.Vector3): THREE.Vector3 {
  const k = 1 / Math.sqrt((u.x / r[0]) ** 2 + (u.y / r[1]) ** 2 + (u.z / r[2]) ** 2);
  return c.clone().addScaledVector(u, k);
}

// ------------------------------------------------------------------ factory
export function createNlexMascotModel(options: CreateNlexMascotOptions = {}): THREE.Group {
  const assetBase = options.assetBase ?? "/brand/mascot/";
  const anisotropy = options.anisotropy ?? 4;
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const geo = <T extends THREE.BufferGeometry>(g: T): T => (geometries.add(g), g);
  const mat = <T extends THREE.Material>(m: T): T => (materials.add(m), m);
  const mesh = (name: string, g: THREE.BufferGeometry, m: THREE.Material) => {
    const o = new THREE.Mesh(geo(g), m);
    o.name = name;
    return o;
  };

  // ---- textures (loaded lazily; `ready` settles when every decal texture is in)
  const loader = new THREE.TextureLoader();
  const pending: Promise<void>[] = [];
  const texture = (file: string): THREE.Texture => {
    let resolve: () => void = () => undefined;
    let reject: (e: unknown) => void = () => undefined;
    pending.push(
      new Promise<void>((res, rej) => {
        resolve = res;
        reject = rej;
      }),
    );
    const url = assetBase + file;
    const t = loader.load(url, () => resolve(), undefined, (e) => reject(new Error("decal failed to load: " + url + " (" + String(e) + ")")));
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = anisotropy;
    textures.add(t);
    return t;
  };
  const decalMaterial = (name: string, map: THREE.Texture, roughness: number, clearcoat: number) =>
    mat(
      new THREE.MeshPhysicalMaterial({
        name,
        map,
        emissive: 0xffffff,
        emissiveMap: map,
        emissiveIntensity: LOOK.decalEmissive,
        roughness,
        metalness: 0,
        clearcoat,
        clearcoatRoughness: 0.15,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
      }),
    );

  // ---- materials
  const paint = mat(new THREE.MeshPhysicalMaterial({ name: "body-paint", color: PAINT_HEX, roughness: 0.3, metalness: 0, clearcoat: 0.75, clearcoatRoughness: 0.2 }));
  // The shell carries its colour per vertex (paint, and the dark-gray underbody along the sill).
  const bodyPaint = mat(new THREE.MeshPhysicalMaterial({ name: "body-paint", color: 0xffffff, vertexColors: true, roughness: 0.3, metalness: 0, clearcoat: 0.75, clearcoatRoughness: 0.2 }));
  const faceWhite = mat(
    new THREE.MeshPhysicalMaterial({ name: "face-white", color: 0xf4f7fc, roughness: 0.42, clearcoat: 0.25, clearcoatRoughness: 0.35, emissive: 0xffffff, emissiveIntensity: LOOK.faceEmissive }),
  );
  const capBlue = mat(new THREE.MeshStandardMaterial({ name: "cap-fabric-blue", color: CAP_BLUE_HEX, roughness: 0.82, side: THREE.DoubleSide }));
  const capWhite = mat(new THREE.MeshStandardMaterial({ name: "cap-fabric-white", color: 0xf4f6f9, roughness: 0.8, emissive: 0xffffff, emissiveIntensity: LOOK.capWhiteEmissive }));
  const rubber = mat(new THREE.MeshStandardMaterial({ name: "tyre-rubber", color: 0x16171b, roughness: 0.9 }));
  const lampRing = mat(new THREE.MeshPhysicalMaterial({ name: "headlight-ring", color: 0xdfe8f4, roughness: 0.25, metalness: 0.3, clearcoat: 1, emissive: 0x6fbaff, emissiveIntensity: 0.12 }));
  const chrome = mat(new THREE.MeshPhysicalMaterial({ name: "chrome", color: 0xb9c3d1, roughness: 0.18, metalness: 0.75, clearcoat: 1, clearcoatRoughness: 0.06 }));
  const trimWhite = mat(new THREE.MeshPhysicalMaterial({ name: "trim-white", color: 0xeef1f7, roughness: 0.3, clearcoat: 0.8, emissive: 0xffffff, emissiveIntensity: 0.12 }));
  const lensMap = buildHeadlightTexture();
  if (lensMap) textures.add(lensMap);
  const headlightMaterials = [0, 1].map((i) =>
    mat(
      new THREE.MeshPhysicalMaterial({
        name: i ? "headlight-lens-r" : "headlight-lens-l",
        color: 0xffffff,
        map: lensMap,
        roughness: 0.08,
        clearcoat: 1,
        clearcoatRoughness: 0.04,
        emissive: 0xffffff,
        emissiveMap: lensMap,
        emissiveIntensity: HEADLIGHT.emissive,
      }),
    ),
  );
  // Light-blue glass (#63B3FF on the sheet), lit a little from within so it stays light.
  const glass = mat(new THREE.MeshPhysicalMaterial({ name: "window-glass", color: 0x3f8fe8, roughness: 0.22, metalness: 0, clearcoat: 0.2, clearcoatRoughness: 0.3, emissive: 0x2a72d6, emissiveIntensity: 0.14 }));
  const tailLens = mat(new THREE.MeshPhysicalMaterial({ name: "taillight-lens", color: 0xd8262e, roughness: 0.12, clearcoat: 1, emissive: 0xff2a2a, emissiveIntensity: 0.55 }));
  const windowFrame = mat(new THREE.MeshPhysicalMaterial({ name: "window-frame", color: 0x0a4cc0, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.2 }));
  const tailAmber = mat(new THREE.MeshPhysicalMaterial({ name: "taillight-amber", color: 0xffa23a, roughness: 0.12, clearcoat: 1, emissive: 0xff8a1a, emissiveIntensity: 0.6 }));

  const root = new THREE.Group();
  root.name = "nlex-mascot";
  const loft = new BodyLoft();

  // ---- body + face plate
  const body = mesh("body-shell", buildBodyGeometry(loft), bodyPaint);
  root.add(body);
  const facePanel = mesh("windscreen-face-panel", buildFacePanelGeometry(loft), faceWhite);
  body.add(facePanel);

  // ---- headlights (+X placed on the loft frame; -X is its reflection)
  const headlights: THREE.Mesh[] = [];
  const lensGeometry = geo(discUVs(buildLensGeometry(), HEADLIGHT.lensRadius));
  const bezelGeometry = geo(new THREE.TorusGeometry(HEADLIGHT.bezelRadius, HEADLIGHT.bezelTube, 12, 56));
  const haloMap = buildHaloTexture();
  if (haloMap) textures.add(haloMap);
  const haloGeometry = geo(new THREE.PlaneGeometry(HEADLIGHT.lensRadius * HEADLIGHT.halo, HEADLIGHT.lensRadius * HEADLIGHT.halo));
  const haloMaterial = mat(
    new THREE.MeshBasicMaterial({ name: "headlight-glow", map: haloMap, color: 0xd6ebff, transparent: true, opacity: HEADLIGHT.haloOpacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  );
  body.add(mesh("bumper-front", buildBumperGeometry(loft, BUMPER.front.y, BUMPER.front.radius, 1), paint));
  body.add(mesh("bumper-rear", buildBumperGeometry(loft, BUMPER.rear.y, BUMPER.rear.radius, -1), paint));
  // Side windows, door handles, taillights and the rear window make the sides and tail read as a car.
  body.add(mesh("rear-window", buildRearWindowGeometry(loft), glass));
  const tailGeometry = geo(buildRoundedSlab(TAILLIGHT.w, TAILLIGHT.h, TAILLIGHT.r, TAILLIGHT.depth));
  const amberGeometry = geo(buildRoundedSlab(TAILLIGHT.w * 0.26, TAILLIGHT.h * 0.56, TAILLIGHT.r * 0.5, 0.006));
  const handleGeometry = geo(new THREE.CapsuleGeometry(HANDLE.radius, HANDLE.length, 4, 10).rotateX(Math.PI / 2));
  for (const side of [1, -1] as const) {
    SIDE_WINDOWS.forEach((w, wi) => {
      const tag = (side > 0 ? "-l" : "-r") + (wi ? "-rear" : "-front");
      const frame: WindowSpec = { ...w, zRear: w.zRear - WINDOW_FRAME, zFront: w.zFront + WINDOW_FRAME, halfHeight: w.halfHeight + WINDOW_FRAME, offset: w.offset - 0.003 };
      body.add(mesh("side-window-frame" + tag, buildSideWindowGeometry(loft, side, frame), windowFrame));
      body.add(mesh("side-window" + tag, buildSideWindowGeometry(loft, side, w), glass));
    });
    const f = loft.frontFrame(side * TAILLIGHT.x, TAILLIGHT.y, -1);
    const tail = new THREE.Group();
    tail.name = side > 0 ? "taillight-l" : "taillight-r";
    tail.position.copy(f.point).addScaledVector(f.normal, -0.008);
    tail.quaternion.copy(surfaceQuaternion(f.normal));
    const lens = new THREE.Mesh(tailGeometry, tailLens);
    lens.name = tail.name + "-lens";
    // The amber end faces the plate: seen from behind, local +x is the car's -X.
    const amber = new THREE.Mesh(amberGeometry, tailAmber);
    amber.name = tail.name + "-amber";
    amber.position.set(side * TAILLIGHT.w * 0.3, 0, TAILLIGHT.depth);
    tail.add(lens, amber);
    body.add(tail);
    const hf = loft.sideFrame(HANDLE.z, HANDLE.y, side);
    const handle = mesh(side > 0 ? "door-handle-l" : "door-handle-r", handleGeometry, trimWhite);
    handle.position.copy(hf.point).addScaledVector(hf.normal, 0.008);
    body.add(handle);
  }
  for (const side of [1, -1] as const) {
    const f = loft.frontFrame(side * HEADLIGHT.x, HEADLIGHT.y);
    const group = new THREE.Group();
    group.name = side > 0 ? "headlight-l-mount" : "headlight-r-mount";
    group.position.copy(f.point).addScaledVector(f.normal, 0.004);
    group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), f.normal);
    const lens = new THREE.Mesh(lensGeometry, headlightMaterials[side > 0 ? 0 : 1]);
    lens.name = side > 0 ? "headlight-l" : "headlight-r";
    const bezel = new THREE.Mesh(bezelGeometry, lampRing);
    bezel.name = side > 0 ? "headlight-bezel-l" : "headlight-bezel-r";
    const halo = new THREE.Mesh(haloGeometry, haloMaterial);
    halo.name = side > 0 ? "headlight-glow-l" : "headlight-glow-r";
    halo.position.z = 0.03;
    halo.renderOrder = 3;
    group.add(lens, bezel, halo);
    body.add(group);
    headlights.push(lens);
  }

  // ---- cap
  const cap = new THREE.Group();
  cap.name = "cap";
  cap.position.set(CAP.position[0], CAP.position[1], CAP.position[2]);
  cap.rotation.set(CAP.rotation[0], CAP.rotation[1], CAP.rotation[2]);
  body.add(cap);
  const crown = mesh("cap-crown", buildCrownGeometry(), capBlue);
  cap.add(crown);
  const capFront = mesh("cap-front-panel", buildCapFrontPanelGeometry(), capWhite);
  crown.add(capFront);
  const button = mesh("cap-button", new THREE.SphereGeometry(0.035, 16, 8), capBlue);
  button.scale.set(1, 0.5, 1);
  button.position.set(0, CAP.crownRadii[1] - 0.004, 0);
  crown.add(button);
  cap.add(mesh("cap-brim", buildBrimGeometry(), capBlue));

  // ---- mirrors (left built, right reflected x -> -x)
  for (const side of [1, -1] as const) {
    const group = new THREE.Group();
    group.name = side > 0 ? "mirror-l" : "mirror-r";
    const rootP = loft.point(MIRROR.rootT, loft.sAtHeight(MIRROR.rootY));
    group.position.set(side * rootP.x, rootP.y, rootP.z);
    const rel = new THREE.Vector3(MIRROR.reach[0], MIRROR.reach[1], MIRROR.reach[2]);
    const stalkG = cylinderBetween(new THREE.Vector3(-0.03, -0.01, 0), rel, MIRROR.stalkRadius);
    // Housing and stripe are built at the origin, turned so the long axis points outward and a little forward, then moved out.
    const headG = new THREE.SphereGeometry(1, 32, 20);
    headG.scale(MIRROR.headRadii[0], MIRROR.headRadii[1], MIRROR.headRadii[2]);
    const u = new THREE.Vector3(STRIPE.dir[0], STRIPE.dir[1], STRIPE.dir[2]).normalize();
    const sp = ellipsoidPoint(new THREE.Vector3(), MIRROR.headRadii, u);
    const stripeG = new THREE.CapsuleGeometry(STRIPE.radius, STRIPE.length, 4, 12);
    stripeG.rotateZ(Math.PI / 2);
    stripeG.rotateY(-0.35);
    stripeG.translate(sp.x - u.x * 0.006, sp.y - u.y * 0.006, sp.z - u.z * 0.006);
    for (const g of [headG, stripeG]) {
      g.rotateY(-MIRROR.yaw);
      g.translate(rel.x + MIRROR.headRadii[0] * 0.55, rel.y, rel.z);
    }
    if (side < 0) {
      reflectGeometryX(stalkG);
      reflectGeometryX(headG);
      reflectGeometryX(stripeG);
    }
    group.add(mesh(side > 0 ? "mirror-stalk-l" : "mirror-stalk-r", stalkG, paint));
    group.add(mesh(side > 0 ? "mirror-head-l" : "mirror-head-r", headG, paint));
    group.add(mesh(side > 0 ? "mirror-stripe-l" : "mirror-stripe-r", stripeG, trimWhite));
    body.add(group);
  }

  // ---- wheels: steer mount at the axle -> spin group (origin ON the axle) -> tyre + hub + hub-n + tread
  const wheels: THREE.Group[] = [];
  const hubNMaterial = decalMaterial("decal-hub-n", texture(HUB_N.texture), 0.3, 0.6);
  const treadGeometry = geo(new THREE.BoxGeometry(TREAD.block[0], TREAD.block[1], TREAD.block[2]));
  const hubFaceX = WHEEL.hubOffset - 0.03 + WHEEL.hubProfile[WHEEL.hubProfile.length - 1][1];
  const xAxisUnit = new THREE.Vector3(1, 0, 0);
  for (const [id, sx, sz] of [["fl", 1, 1], ["fr", -1, 1], ["rl", 1, -1], ["rr", -1, -1]] as const) {
    const steer = new THREE.Group();
    steer.name = "wheel-" + id + "-steer";
    steer.position.set(sx * WHEEL.trackHalf, WHEEL.radius, sz * WHEEL.axleZ);
    steer.rotation.y = sz > 0 ? -sx * WHEEL.frontToeIn : 0;
    const wheel = new THREE.Group();
    wheel.name = "wheel-" + id;
    steer.add(wheel);
    wheel.add(mesh("tyre", latheX(WHEEL.tyreProfile, 48, sx), rubber));
    const hub = mesh("hub", latheX(WHEEL.hubProfile, 40, sx), paint);
    hub.position.x = sx * (WHEEL.hubOffset - 0.03);
    wheel.add(hub);
    const nG = new THREE.PlaneGeometry(HUB_N.width, HUB_N.width * HUB_N.aspect);
    nG.rotateY(Math.PI / 2);
    nG.translate(hubFaceX + HUB_N.lift, 0, 0);
    if (sx < 0) reflectGeometryX(nG, true); // U flipped so the N reads correctly on the -X side
    wheel.add(mesh("hub-n", nG, hubNMaterial));
    // directional chevron tread; the -X wheels carry the reflection so chevrons point the same way
    const tread = new THREE.InstancedMesh(treadGeometry, rubber, TREAD.count * 2);
    tread.name = "tread";
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const one = new THREE.Vector3(1, 1, 1);
    const r = WHEEL.radius + TREAD.block[1] * 0.1; // blocks sit proud of the 0.28 tread crown
    let k = 0;
    for (let i = 0; i < TREAD.count; i++) {
      const theta = (i / TREAD.count) * Math.PI * 2;
      for (const half of [1, -1]) {
        euler.set(theta, THREE.MathUtils.degToRad(TREAD.angleDeg) * half * sx, 0, "XYZ");
        q.setFromEuler(euler);
        const pos = new THREE.Vector3(half * TREAD.axial * sx, r, 0).applyAxisAngle(xAxisUnit, theta);
        m4.compose(pos, q, one);
        tread.setMatrixAt(k++, m4);
      }
    }
    tread.instanceMatrix.needsUpdate = true;
    wheel.add(tread);
    root.add(steer);
    wheels.push(wheel);

  }

  // ---- decals: project the PNG cuts onto their host meshes along the reference view direction
  root.updateMatrixWorld(true);
  const hosts: Record<DecalSpec["targets"][number], THREE.Mesh> = { "windscreen-face-panel": facePanel, "body-shell": body, "cap-front-panel": capFront, "cap-crown": crown };
  const raycaster = new THREE.Raycaster();
  const face = createMascotFace();
  const procedural: Record<string, THREE.Texture | null> = {
    "procedural:face": face?.texture ?? null,
    "procedural:plate": buildPlateTexture(),
    "procedural:cap-back": buildCapBackTexture(),
  };
  for (const t of Object.values(procedural)) {
    if (!t) continue;
    t.anisotropy = anisotropy;
    textures.add(t);
  }
  for (const d of DECALS) {
    const map = d.texture.startsWith("procedural:") ? procedural[d.texture] : texture(d.texture);
    if (!map) continue; // no 2D canvas here: that detail is simply left off
    const flat = d.name === "cap-logo" || d.name === "cap-back";
    // The face takes a light coat: a heavy clearcoat mirrored the room over the eyes and washed them out.
    const isFace = d.name === "face-decal";
    const material = decalMaterial("decal-" + d.name, map, d.name === "bonnet-badge-n" ? 0.22 : isFace ? 0.45 : 0.3, flat ? 0 : isFace ? 0.2 : 0.8);
    const zAxis = new THREE.Vector3(-d.dir[0], -d.dir[1], -d.dir[2]).normalize();
    const yAxis = new THREE.Vector3(0, 1, 0).addScaledVector(zAxis, -zAxis.y).normalize();
    const xAxis = new THREE.Vector3().crossVectors(yAxis, zAxis);
    const orientation = new THREE.Euler().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis));
    const center = new THREE.Vector3(d.center[0], d.center[1], d.center[2]);
    // Snap the projector onto its first host along the projection ray, so a reshaped surface keeps its decal.
    raycaster.set(center.clone().addScaledVector(zAxis, 3), zAxis.clone().negate());
    const hit = raycaster.intersectObject(hosts[d.targets[0]], false)[0];
    if (hit) center.copy(hit.point);
    d.targets.forEach((target, i) => {
      const host = hosts[target];
      const g = new DecalGeometry(host, center, orientation, new THREE.Vector3(d.size[0], d.size[1], d.depth));
      g.applyMatrix4(host.matrixWorld.clone().invert()); // into the host's local space so it rides the host
      const decal = mesh(d.targets.length > 1 ? d.name + (i ? "-bonnet" : "-panel") : d.name, g, material);
      decal.renderOrder = 2;
      host.add(decal);
    });
  }

  root.traverse((o) => {
    const meshObj = o as THREE.Mesh;
    if (meshObj.isMesh) {
      const m = meshObj.material as THREE.Material;
      meshObj.castShadow = !m.transparent;
      meshObj.receiveShadow = true;
    }
  });

  const ready = Promise.all(pending).then(() => undefined);
  ready.catch(() => undefined); // the caller decides what a failed decal means; no unhandled rejection
  const handles: NlexMascotHandles = {
    wheels,
    headlights,
    headlightMaterials,
    setHeadlights: (intensity01: number) => {
      const v = Math.max(0, intensity01) * HEADLIGHT.emissive;
      for (const m of headlightMaterials) m.emissiveIntensity = v;
      haloMaterial.opacity = Math.min(1, HEADLIGHT.haloOpacity * Math.max(0, intensity01));
    },
    face,
    ready,
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
      geometries.clear();
      materials.clear();
      textures.clear();
    },
  };
  root.userData.mascot = handles;
  return root;
}
