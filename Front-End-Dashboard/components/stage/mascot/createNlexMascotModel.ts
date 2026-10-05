import * as THREE from "three";
import { DecalGeometry } from "three/examples/jsm/geometries/DecalGeometry.js";
import { createMascotFace, type MascotFace } from "./face";

/**
 * NLEX mascot car: procedural Three.js model built with the img2threejs pipeline.
 * v8 (7 Oct 2026): rebuilt to the user's two reference sheets ("3D template / reference" and
 * "3D model reference, three.js / img2threejs ready"): a longer, lower hatchback body; straight,
 * chunky wheels at the corners; big chrome-ringed headlights; a thick full-width bumper; big round
 * mirrors at eye height; and the cap sitting level on the roof with its visor forward. The face is
 * drawn and animated (./face.ts). Mesh names and handles are unchanged, so the animation code in
 * ../mascot3d.ts drives it as before.
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
 * tuck behind, a bonnet that rolls into a raked windscreen (about 25°), and a rounded roof and
 * tail, so the car reads as a car from the side instead of a box.
 */
const BODY_KEYS: readonly BodyKey[] = [
  // v8: proportions measured off the reference sheet (length about 1.5x the body height, width
  // about 1.2x): a low skirt, a tall upright front fascia, a short rounded bonnet rolling into a
  // steep windscreen, and a cabin that runs back to a rounded hatch.
  [0.15, 0.5, 0.78, 0.0, 3.0],
  // The lower body has full, squarish corners (higher exponents), so from the front the blue
  // fascia covers the tyres' inner shoulders beside the headlights (user request: no black there).
  [0.2, 0.62, 0.93, 0.0, 4.6],
  [0.27, 0.668, 0.97, 0.0, 6.0],
  [0.36, 0.678, 0.985, 0.0, 6.5],
  [0.46, 0.676, 0.985, 0.0, 6.2],
  [0.56, 0.67, 0.975, -0.005, 5.4],
  [0.66, 0.66, 0.95, -0.015, 4.4],
  [0.74, 0.648, 0.875, -0.06, 3.5],
  [0.8, 0.636, 0.76, -0.12, 3.3],
  [0.88, 0.624, 0.71, -0.15, 3.2],
  [0.98, 0.612, 0.68, -0.165, 3.1],
  [1.08, 0.596, 0.65, -0.175, 3.0],
  [1.16, 0.572, 0.615, -0.185, 2.9],
  [1.23, 0.53, 0.56, -0.195, 2.75],
  [1.285, 0.45, 0.475, -0.2, 2.55],
  [1.32, 0.32, 0.335, -0.2, 2.35],
  [1.34, 0.004, 0.004, -0.2, 2.2],
];
// The body mesh: columns round the body and rings up it, spent where the surface turns sharply (the
// fender flares rolling into the wheel wells) rather than evenly, so those edges stay smooth and the
// flat front and back faces do not cost the same density.
const BODY_SEGMENTS = 440;
const BODY_RINGS = 210;

const WHEEL = {
  // v8: straight (no toe-in), chunky, at the corners, standing a little proud of the body sides.
  radius: 0.26,
  width: 0.3,
  trackHalf: 0.605,
  axleZ: 0.62,
  frontToeIn: 0,
  hubOffset: 0.135,
  tyreProfile: [
    [0.163, -0.136], [0.206, -0.15], [0.238, -0.145], [0.254, -0.122], [0.259, -0.073], [0.26, 0.0],
    [0.259, 0.073], [0.254, 0.122], [0.238, 0.145], [0.206, 0.15], [0.163, 0.136], [0.158, 0.064], [0.158, -0.064], [0.163, -0.136],
  ] as const,
  hubProfile: [[0.17, 0.0], [0.164, 0.04], [0.152, 0.056], [0.132, 0.052], [0.122, 0.032], [0.104, 0.036], [0.0, 0.04]] as const,
};
// The well: fully cut (to the wall at innerWallX, just inside the tyres' inner faces at 0.455) wherever
// the tyre is, and curving smoothly out to the body over `blend` above it.
const WELLS = { pad: 0.075, blend: 0.08, innerWallX: 0.44 };
/** Fender flares (user request, 7 Oct 2026, after a photo of a flared arch): round each well the body
 *  swells out by `out`, fading over `width`, and rolls in over the well's edge; side walls only. */
const FLARE = { out: 0.05, hold: 0.025, width: 0.17 };

const FACE_PANEL = {
  // v8: wide (nearly the whole cabin, as on the sheet), the two brow humps with the blue dip between.
  halfWidth: 0.51, yBottom: 0.83, yTopCentre: 1.235, humpX: 0.23, humpRise: 0.035, humpWidth: 0.13,
  topCornerRx: 0.2, topCornerRy: 0.24, bottomCornerRadius: 0.07, offset: 0.006, columns: 64, rows: 24,
};

/** Mirrors: rooted on the A-pillar (polar angle `rootT` on the loft at `rootY`), an egg-shaped
 *  housing a short stalk away, long axis outward and a little forward. */
const MIRROR = { rootY: 0.93, rootT: 0.62, reach: [0.06, 0.0, 0.02], headRadii: [0.165, 0.145, 0.135], yaw: 0.2, stalkRadius: 0.05 } as const;
type WindowSpec = {
  zRear: number;
  zFront: number;
  yBottom: number;
  yTop: number;
  /** How far back the top of the front edge sits (a raked A- or C-pillar line). */
  rake: number;
  /** Corner radius; the top-rear corner takes `rearTop`. */
  radius: number;
  rearTop: number;
  offset: number;
  columns: number;
  rows: number;
};
/** Side glass, as on the reference sheet's side view: a big front pane with its front edge raked
 *  along the A-pillar, and a rear quarter pane rounded at the back, on one straight belt line; the
 *  B-pillar between them is little more than their two seals. */
const SIDE_WINDOWS: readonly WindowSpec[] = [
  { zRear: -0.1, zFront: 0.36, yBottom: 0.85, yTop: 1.15, rake: 0.17, radius: 0.045, rearTop: 0.05, offset: 0.007, columns: 40, rows: 14 },
  { zRear: -0.66, zFront: -0.16, yBottom: 0.85, yTop: 1.14, rake: 0.0, radius: 0.045, rearTop: 0.12, offset: 0.007, columns: 40, rows: 14 },
];
/** The dark-blue seal round each pane: the same shape, this much bigger, just behind it. */
const WINDOW_FRAME = 0.02;
/** Door panel lines (z, y points), thin dark grooves under the windows. */
const DOOR_SEAMS: readonly (readonly [number, number])[][] = [
  [[0.36, 0.83], [0.365, 0.74], [0.37, 0.67]],
  [[-0.13, 0.83], [-0.13, 0.55], [-0.12, 0.25]],
];
/** The bumpers are a soft swell of the body itself (not a separate tube), so they blend into the
 *  paint with no crease: a band `half` high either side of `y`, rounded over `soft`, standing `out`
 *  proud on the front and back faces and fading out toward the wheel arches. */
const BUMPER = { y: 0.27, half: 0.045, soft: 0.07, outFront: 0.042, outRear: 0.034 };
/** Rounded-rectangle taillights, red with an amber inner end; the rear window; the door handles. */
const TAILLIGHT = { x: 0.46, y: 0.58, w: 0.23, h: 0.115, r: 0.05, depth: 0.028 } as const;
const REAR_WINDOW = { halfWidth: 0.42, yBottom: 0.8, yTop: 1.13, corner: 0.1, offset: 0.006, columns: 40, rows: 14 };
const HANDLE = { z: -0.02, y: 0.76, radius: 0.014, length: 0.085 };

const CAP = {
  // v8: level on the roof, the crown standing well above the face, the visor straight out over the windscreen.
  position: [0.0, 1.28, -0.19], rotation: [-0.15, 0.0, 0.0], crownRadii: [0.58, 0.56, 0.64],
  brim: { halfWidth: 0.52, reach: 0.34, droop: 0.9, tilt: 0.3, thickness: 0.08, sweepDeg: 20 },
} as const;

const PAINT_HEX = 0x1280ee; // median of 392k saturated paint pixels in the PNG
/** Built to these numbers, then widened this much: chubby, as on the reference sheet. Decals project
 *  after the widening, so the face, the logo and the plate keep their own proportions. */
const WIDTH_SCALE = 1.1;
const CAP_BLUE_HEX = 0x1560d6;

const CAP_FRONT_PANEL = { halfSpan: 0.78, elevationTop: 1.08, offset: 0.006 };
const HEADLIGHT = { x: 0.39, y: 0.54, lensRadius: 0.122, domeDepth: 0.034, bezelRadius: 0.129, bezelTube: 0.016, emissive: 0.5, halo: 2.2, haloOpacity: 0.28 };
const STRIPE = { dir: [0.5, -0.32, 0.8], radius: 0.018, length: 0.085 } as const;
/** Chevron tread pressed into the tyre's crown (a normal map: the tyre's outline stays smooth). */
const TREAD = { count: 24, slant: 0.55, groove: 0.24 } as const;
const LOOK = { faceEmissive: 0.22, capWhiteEmissive: 0.12, decalEmissive: 0.38 };

/**
 * Decal projectors (model space). Each projects a cut of the PNG along `dir` (into the surface)
 * with the texture's up axis aligned to model +Y. Centres and sizes were solved by ray-casting the
 * crop boxes of the levelled PNG from the fitted reference camera (see README).
 */
interface DecalSpec {
  name: string;
  texture: string;
  targets: readonly ("windscreen-face-panel" | "body-shell" | "cap-front-panel" | "cap-crown")[];
  center: readonly [number, number, number];
  dir: readonly [number, number, number];
  size: readonly [number, number];
  depth: number;
}
const DECALS: readonly DecalSpec[] = [
  // The drawn face: eyes and brows on the white windscreen, cheeks at its lower corners, the smile on
  // the bonnet below it. Drawn big, as on the reference sheet (canvas 1024x800 at 0.00115 / px).
  { name: "face-decal", texture: "procedural:face", targets: ["windscreen-face-panel", "body-shell"], center: [0.0, 0.95, 0.5], dir: [0.0, 0.06, -0.998], size: [1.26, 0.984], depth: 0.9 },
  // The cap badge: a blue ring round a bold blue "N" on the white front panel (user request,
  // 7 Oct 2026, replacing the NLEX wordmark). Projected along the usual viewing direction through a
  // square box, so it reads as a perfect circle from the front; the box is deep enough that the
  // curving crown never clips the ring.
  { name: "cap-logo", texture: "procedural:cap-n", targets: ["cap-front-panel"], center: [0.0, 1.6, 0.4], dir: [0.0, 0.14, -0.99], size: [0.29, 0.29], depth: 1.2 }, // centred on the white panel, clear of the visor
  // Rear: the "N" plate between the taillights, and the strap opening at the back of the cap.
  { name: "rear-plate", texture: "procedural:plate", targets: ["body-shell"], center: [0.0, 0.56, -1.0], dir: [0.0, 0.0, 1.0], size: [0.3, 0.14], depth: 0.25 },
  { name: "cap-back", texture: "procedural:cap-back", targets: ["cap-crown"], center: [0.0, 1.4, -0.9], dir: [0.0, -0.1, 0.995], size: [0.44, 0.28], depth: 0.35 },
  { name: "bonnet-badge-n", texture: "decal-badge-n.png", targets: ["body-shell"], center: [0.0, 0.52, 1.0], dir: [0.0, -0.03, -0.9996], size: [0.14, 0.117], depth: 0.2 },
];
const HUB_N = { texture: "decal-hub-n.png", width: 0.135, aspect: 368 / 508, lift: 0.003 };

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
    let r = Math.pow(Math.pow(Math.abs(c / a), n) + Math.pow(Math.abs(si / b), n), -1 / n);
    // the bumper swell, front and back
    const zb = Math.abs(this.CZ(s) + r * si);
    const band = smoothstep(BUMPER.y - BUMPER.half - BUMPER.soft, BUMPER.y - BUMPER.half, y) * (1 - smoothstep(BUMPER.y + BUMPER.half, BUMPER.y + BUMPER.half + BUMPER.soft, y));
    if (band > 0) {
      const clear = WHEEL.axleZ + WHEEL.radius + WELLS.pad;
      const reach = smoothstep(clear - 0.04, clear + 0.06, zb);
      r += band * reach * (si > 0 ? BUMPER.outFront : BUMPER.outRear);
    }
    let x = r * c;
    const z = this.CZ(s) + r * si;
    // wheel wells: a flared fender round each wheel, rolling in to the well wall inside its radius
    const sideness = smoothstep(0.25, 0.6, Math.abs(c)); // flares belong to the side walls, not the front face
    for (const az of [WHEEL.axleZ, -WHEEL.axleZ]) {
      const d = Math.hypot(z - az, y - WHEEL.radius);
      const r = WHEEL.radius + WELLS.pad;
      if (d > r + FLARE.width) continue;
      // the swell, strongest at the arch's edge and fading smoothly into the body
      let ax = Math.abs(x) + FLARE.out * sideness * (1 - smoothstep(r + FLARE.hold, r + FLARE.width, d));
      if (d < r) {
        const k = Math.min(1, Math.max(0, (r - d) / WELLS.blend));
        const w = k * k * k * (k * (k * 6 - 15) + 10); // smootherstep: the edge rolls over with no crease
        if (ax > WELLS.innerWallX) ax -= w * (ax - WELLS.innerWallX);
      }
      x = Math.sign(x) * ax;
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
/** n + 1 parameter values from x0 to x1, spaced so each step holds an equal share of `weight`. */
function warpedSamples(n: number, x0: number, x1: number, weight: (x: number) => number): number[] {
  const M = 4096;
  const cum = [0];
  for (let k = 1; k <= M; k++) {
    const xa = x0 + ((x1 - x0) * (k - 1)) / M;
    const xb = x0 + ((x1 - x0) * k) / M;
    cum.push(cum[k - 1] + (weight(xa) + weight(xb)) / 2);
  }
  const total = cum[M];
  const out: number[] = [];
  let k = 1;
  for (let i = 0; i <= n; i++) {
    const target = (i / n) * total;
    while (k < M && cum[k] < target) k++;
    const f = (target - cum[k - 1]) / Math.max(1e-12, cum[k] - cum[k - 1]);
    out.push(x0 + ((x1 - x0) * (k - 1 + Math.min(1, Math.max(0, f)))) / M);
  }
  out[0] = x0;
  out[n] = x1;
  return out;
}

function buildBodyGeometry(loft: BodyLoft): THREE.BufferGeometry {
  const ringCount = BODY_RINGS + 1;
  const cols = BODY_SEGMENTS;
  // Rings: about 2.5x as dense from the sills to the top of the arches.
  const sOf = warpedSamples(BODY_RINGS, 0, loft.sMax, (sv) => {
    const yv = loft.point(0, sv).y;
    return 1 + 1.5 * Math.exp(-Math.pow((yv - 0.32) / 0.36, 4));
  });
  // Columns: about 3x as dense along the side walls where the wheels are, sparser across the faces.
  const sRef = loft.sAtHeight(0.4);
  const ref = new THREE.Vector3();
  const tOf = warpedSamples(cols, 0, Math.PI * 2, (tv) => {
    loft.point(tv, sRef, ref);
    const side = smoothstep(0.35, 0.75, Math.abs(Math.cos(tv)));
    const zone = Math.exp(-Math.pow((Math.abs(ref.z) - WHEEL.axleZ) / 0.38, 4));
    return 0.65 + 3.2 * side * zone;
  });
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const index: number[] = [];
  const p = new THREE.Vector3();
  for (let j = 0; j < ringCount; j++) {
    const s = sOf[j];
    for (let i = 0; i <= cols; i++) {
      loft.point(tOf[i], s, p);
      positions.push(p.x, p.y, p.z);
      uvs.push(i / cols, j / (ringCount - 1));
    }
  }
  // Normals from the grid's own neighbours (central differences, wrapping round the body), the
  // same cross product loft.normal takes but without four extra loft evaluations per vertex: the
  // build was the Overview's main-thread freeze on load (7 Oct 2026).
  const row = cols + 1;
  const P = (j: number, i: number, k: number) => positions[(j * row + i) * 3 + k];
  for (let j = 0; j < ringCount; j++) {
    const j0 = Math.max(0, j - 1);
    const j1 = Math.min(ringCount - 1, j + 1);
    for (let i = 0; i <= cols; i++) {
      const ic = i === cols ? 0 : i; // the seam column repeats column 0
      const i0 = (ic - 1 + cols) % cols;
      const i1 = (ic + 1) % cols;
      const dsx = P(j1, ic, 0) - P(j0, ic, 0), dsy = P(j1, ic, 1) - P(j0, ic, 1), dsz = P(j1, ic, 2) - P(j0, ic, 2);
      const dtx = P(j, i1, 0) - P(j, i0, 0), dty = P(j, i1, 1) - P(j, i0, 1), dtz = P(j, i1, 2) - P(j, i0, 2);
      let nx = dsy * dtz - dsz * dty;
      let ny = dsz * dtx - dsx * dtz;
      let nz = dsx * dty - dsy * dtx;
      const len = Math.hypot(nx, ny, nz);
      if (len < 1e-12) {
        nx = 0;
        ny = j > ringCount / 2 ? 1 : -1;
        nz = 0;
      } else {
        nx /= len;
        ny /= len;
        nz /= len;
      }
      normals.push(nx, ny, nz);
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
  uvs.push(0.5, 0);
  for (let i = 0; i < cols; i++) index.push(bottom, i, i + 1);
  const top = positions.length / 3;
  const lastRing = (ringCount - 1) * (cols + 1);
  const t0 = loft.point(Math.PI / 2, loft.sMax);
  positions.push(0, t0.y + 0.002, BODY_KEYS[BODY_KEYS.length - 1][3]);
  normals.push(0, 1, 0);
  uvs.push(0.5, 1);
  for (let i = 0; i < cols; i++) index.push(top, lastRing + i + 1, lastRing + i);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
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

/** A side pane lying on the cabin wall: a rounded rectangle in (z, y) with a straight belt line, its
 *  front edge sheared back by `rake`; u runs rear to front, v bottom to top. */
function buildSideWindowGeometry(loft: BodyLoft, side: 1 | -1, W: WindowSpec): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const index: number[] = [];
  const inset = (z: number, rRear: number, rFront: number) => {
    if (z < W.zRear + rRear) {
      const d = W.zRear + rRear - z;
      return rRear - Math.sqrt(Math.max(0, rRear * rRear - d * d));
    }
    if (z > W.zFront - rFront) {
      const d = z - (W.zFront - rFront);
      return rFront - Math.sqrt(Math.max(0, rFront * rFront - d * d));
    }
    return 0;
  };
  for (let i = 0; i <= W.columns; i++) {
    const u = (1 - Math.cos((Math.PI * i) / W.columns)) / 2; // denser toward the rounded ends
    const z0 = W.zRear + (W.zFront - W.zRear) * u;
    const yb = W.yBottom + inset(z0, W.radius, W.radius);
    const yt = W.yTop - inset(z0, W.rearTop, W.radius);
    for (let j = 0; j <= W.rows; j++) {
      const v = j / W.rows;
      const y = yb + (yt - yb) * v;
      const z = z0 - W.rake * ((y - W.yBottom) / (W.yTop - W.yBottom)) * u;
      const f = loft.sideFrame(z, y, side);
      const pt = f.point.addScaledVector(f.normal, W.offset);
      positions.push(pt.x, pt.y, pt.z);
      normals.push(f.normal.x, f.normal.y, f.normal.z);
      uvs.push(u, v);
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
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(index);
  return g;
}

/** A thin strip lying on the side wall along a (z, y) polyline: a door panel line. */
function buildSideStripGeometry(loft: BodyLoft, side: 1 | -1, pts: readonly (readonly [number, number])[], width: number): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(pts.map(([z, y]) => new THREE.Vector3(0, y, z)));
  const N = 24;
  const positions: number[] = [];
  const normals: number[] = [];
  const index: number[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const c = curve.getPoint(t);
    const tan = curve.getTangent(t);
    // perpendicular in the (z, y) plane
    const pz = -tan.y;
    const py = tan.z;
    const len = Math.hypot(pz, py) || 1;
    for (const k of [-1, 1]) {
      const z = c.z + (pz / len) * (width / 2) * k;
      const y = c.y + (py / len) * (width / 2) * k;
      const f = loft.sideFrame(z, y, side);
      const pt = f.point.addScaledVector(f.normal, 0.004);
      positions.push(pt.x, pt.y, pt.z);
      normals.push(f.normal.x, f.normal.y, f.normal.z);
    }
  }
  for (let i = 0; i < N; i++) {
    const a = i * 2;
    if (side > 0) index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    else index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  g.setIndex(index);
  return g;
}

/** The side glass's look: a soft sky gradient (lighter where it faces the sky), a pale highlight band
 *  across it and a slightly darker lower edge, so it reads as glass rather than a dark blob. */
function buildGlassTexture(): THREE.Texture | null {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  const g = c.getContext("2d");
  if (!g) return null;
  const bg = g.createLinearGradient(0, 0, 0, 128);
  bg.addColorStop(0, "#6c9ce0");
  bg.addColorStop(0.45, "#3a6fc4");
  bg.addColorStop(1, "#22509f");
  g.fillStyle = bg;
  g.fillRect(0, 0, 256, 128);
  g.save();
  g.translate(150, 0);
  g.rotate(0.55);
  const band = g.createLinearGradient(-40, 0, 40, 0);
  band.addColorStop(0, "rgba(255,255,255,0)");
  band.addColorStop(0.5, "rgba(255,255,255,0.22)");
  band.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = band;
  g.fillRect(-40, -80, 80, 320);
  g.fillStyle = "rgba(255,255,255,0.1)";
  g.fillRect(52, -80, 16, 320);
  g.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
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

/** The rear window: a rounded rectangle lying on the back of the body, under the cap. `grow` builds
 *  its seal (the same shape, that much bigger, `lift` closer to the paint). */
function buildRearWindowGeometry(loft: BodyLoft, grow = 0, lift = 0): THREE.BufferGeometry {
  const R = { ...REAR_WINDOW, halfWidth: REAR_WINDOW.halfWidth + grow, yBottom: REAR_WINDOW.yBottom - grow, yTop: REAR_WINDOW.yTop + grow, corner: REAR_WINDOW.corner + grow, offset: REAR_WINDOW.offset + lift };
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
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
      uvs.push(1 - i / R.columns, j / R.rows); // the glass map reads the same way round as the side panes
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
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
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

/** The cap badge: a thick blue ring round a bold blue "N" with softly rounded corners, crisp at
 *  1024 px, on transparency (user request, 7 Oct 2026). */
function buildCapNTexture(): THREE.Texture | null {
  if (typeof document === "undefined") return null;
  const S = 1024;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d");
  if (!g) return null;
  const blue = "#0a39ad";
  g.strokeStyle = blue;
  g.lineWidth = 82;
  g.beginPath();
  g.arc(S / 2, S / 2, S / 2 - 70, 0, Math.PI * 2);
  g.stroke();
  // The N: two upright stems joined by a thick diagonal, its outer corners softly rounded.
  const L = 318;
  const R = 706;
  const T = 286;
  const B = 738;
  const stem = 124;
  g.fillStyle = blue;
  g.strokeStyle = blue;
  g.lineJoin = "round";
  g.lineWidth = 30;
  g.beginPath();
  g.moveTo(L, B);
  g.lineTo(L, T);
  g.lineTo(L + stem, T);
  g.lineTo(R - stem, B - 210);
  g.lineTo(R - stem, T);
  g.lineTo(R, T);
  g.lineTo(R, B);
  g.lineTo(R - stem, B);
  g.lineTo(L + stem, T + 210);
  g.lineTo(L + stem, B);
  g.closePath();
  g.fill();
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ------------------------------------------------------------------ surface texture
   Fine, tileable relief so the toy does not read as plainly smooth (user request, 7 Oct 2026):
   a soft orange-peel on the paint, a woven fabric on the cap, a rubber grain on the tyres. Shapes
   and colours are unchanged; these only perturb the lighting a little. */

/** Periodic value noise on a size x size tile: `cells` lattice cells per side, summed octaves. */
function tileNoise(size: number, cells: number, octaves: number, seed: number): Float32Array {
  const out = new Float32Array(size * size);
  let amp = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    const cn = cells << o;
    const lat = new Float32Array(cn * cn);
    let a = (seed + o * 1013) >>> 0;
    for (let k = 0; k < lat.length; k++) {
      a = (Math.imul(a, 1664525) + 1013904223) >>> 0;
      lat[k] = a / 4294967296;
    }
    for (let y = 0; y < size; y++) {
      const fy = (y / size) * cn;
      const y0 = Math.floor(fy);
      const ty = fy - y0;
      const sy = ty * ty * (3 - 2 * ty);
      const y1 = (y0 + 1) % cn;
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * cn;
        const x0 = Math.floor(fx);
        const tx = fx - x0;
        const sx = tx * tx * (3 - 2 * tx);
        const x1 = (x0 + 1) % cn;
        const top = lat[y0 * cn + x0] * (1 - sx) + lat[y0 * cn + x1] * sx;
        const bot = lat[y1 * cn + x0] * (1 - sx) + lat[y1 * cn + x1] * sx;
        out[y * size + x] += (top * (1 - sy) + bot * sy) * amp;
      }
    }
    norm += amp;
    amp *= 0.5;
  }
  for (let k = 0; k < out.length; k++) out[k] /= norm;
  return out;
}

/** A plain basket weave: threads alternate over and under, each a rounded ridge. */
function weaveHeight(size: number, threads: number): Float32Array {
  const out = new Float32Array(size * size);
  const fuzz = tileNoise(size, 32, 2, 77);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * threads;
      const v = (y / size) * threads;
      const iu = Math.floor(u);
      const iv = Math.floor(v);
      const fu = u - iu;
      const fv = v - iv;
      const alongU = (iu + iv) % 2 === 0;
      const h = alongU ? Math.sin(Math.PI * fv) * (0.75 + 0.25 * Math.sin(Math.PI * fu)) : Math.sin(Math.PI * fu) * (0.75 + 0.25 * Math.sin(Math.PI * fv));
      out[y * size + x] = h * 0.85 + fuzz[y * size + x] * 0.15;
    }
  }
  return out;
}

/** A tangent-space normal map from a periodic height field (wraps seamlessly). */
function normalMapFromHeight(h: Float32Array, size: number, strength: number): THREE.Texture | null {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  if (!g) return null;
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const hl = h[y * size + ((x - 1 + size) % size)];
      const hr = h[y * size + ((x + 1) % size)];
      const hu = h[((y - 1 + size) % size) * size + x];
      const hd = h[((y + 1) % size) * size + x];
      let nx = (hl - hr) * strength;
      let ny = (hd - hu) * strength;
      let nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l;
      ny /= l;
      nz /= l;
      const k = (y * size + x) * 4;
      img.data[k] = (nx * 0.5 + 0.5) * 255;
      img.data[k + 1] = (ny * 0.5 + 0.5) * 255;
      img.data[k + 2] = (nz * 0.5 + 0.5) * 255;
      img.data[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

/** The tyre's tread: chevron grooves round the crown, on fine rubber grain, as a normal map laid on
 *  the tyre's lathe UVs (u round the tyre, v along its profile; the crown is v 0.23..0.54). */
function buildTreadNormal(): THREE.Texture | null {
  if (typeof document === "undefined") return null;
  const W = 1024;
  const H = 128;
  const grain = tileNoise(128, 24, 2, 1313);
  const h = new Float32Array(W * H);
  const v0 = 0.23 * H;
  const v1 = 0.54 * H;
  const vc = (v0 + v1) / 2;
  const half = (v1 - v0) / 2;
  const period = W / TREAD.count;
  for (let y = 0; y < H; y++) {
    const a = (y - vc) / half; // -1..1 across the crown
    const inBand = Math.abs(a) < 1;
    for (let x = 0; x < W; x++) {
      let v = 1;
      if (inBand) {
        const phase = (((x / period + Math.abs(a) * TREAD.slant) % 1) + 1) % 1;
        // a groove with softly rounded walls
        const e = Math.min(phase, TREAD.groove) / TREAD.groove;
        v = phase < TREAD.groove ? 1 - Math.sin(Math.PI * e) : 1;
        // a centre rib
        if (Math.abs(a) < 0.08) v = 1;
      }
      h[y * W + x] = v * 0.85 + grain[(y % 128) * 128 + (x % 128)] * 0.15;
    }
  }
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d");
  if (!g) return null;
  const img = g.createImageData(W, H);
  const strength = 3.5;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const hl = h[y * W + ((x - 1 + W) % W)];
      const hr = h[y * W + ((x + 1) % W)];
      const hu = h[Math.max(0, y - 1) * W + x];
      const hd = h[Math.min(H - 1, y + 1) * W + x];
      let nx = (hl - hr) * strength;
      let ny = (hd - hu) * strength;
      let nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l;
      ny /= l;
      nz /= l;
      const k = (y * W + x) * 4;
      img.data[k] = (nx * 0.5 + 0.5) * 255;
      img.data[k + 1] = (ny * 0.5 + 0.5) * 255;
      img.data[k + 2] = (nz * 0.5 + 0.5) * 255;
      img.data[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

/** A greyscale map (for roughness) from a height field, mapped into [lo, hi]. */
function greyMapFromHeight(h: Float32Array, size: number, lo: number, hi: number): THREE.Texture | null {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  if (!g) return null;
  const img = g.createImageData(size, size);
  for (let k = 0; k < h.length; k++) {
    const v = (lo + (hi - lo) * h[k]) * 255;
    img.data[k * 4] = img.data[k * 4 + 1] = img.data[k * 4 + 2] = v;
    img.data[k * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
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
  // A hemisphere carried a little below its equator (a short band), so the crown meets the visor
  // and the roof without a gap.
  const g = new THREE.SphereGeometry(1, 56, 20, 0, Math.PI * 2, 0, Math.PI / 2 + 0.12);
  g.scale(CAP.crownRadii[0], CAP.crownRadii[1], CAP.crownRadii[2]);
  return g;
}

/** Curved visor. Its inner edge runs along the crown's base ring, tucked just inside it and level
 *  with it, so the visor is one piece with the cap; the sides bend down only as they reach out,
 *  and the whole visor angles down a little. Closed all round (top, bottom, outer rim, inner rim). */
function buildBrimGeometry(): THREE.BufferGeometry {
  const B = CAP.brim;
  const [rx, , rz] = CAP.crownRadii;
  const cols = 56;
  const rows = 10;
  const phi0 = THREE.MathUtils.degToRad(B.sweepDeg);
  const positions: number[] = [];
  const brimUvs: number[] = [];
  const index: number[] = [];
  const point = (i: number, v: number) => {
    const phi = phi0 + (Math.PI - 2 * phi0) * (i / cols);
    const ix = Math.cos(phi) * rx * 0.94;
    const iz = Math.sin(phi) * rz * 0.94;
    const ext = (B.reach * Math.pow(Math.sin(phi), 1.4) + 0.05) * v;
    const dirX = Math.cos(phi) * 0.35;
    const dirZ = Math.sin(phi);
    const len = Math.hypot(dirX, dirZ);
    const x = ix + (dirX / len) * ext;
    const z = iz + (dirZ / len) * ext;
    const side = Math.pow(Math.min(1, Math.abs(Math.cos(phi)) / Math.cos(phi0)), 2);
    // Bend down toward the sides and along the reach, never at the inner edge.
    const y = -(B.droop * 0.3 * side + Math.tan(B.tilt)) * ext * (0.6 + 0.4 * v);
    return [x, y, z] as const;
  };
  const grid = (sideSign: number) => {
    const base = positions.length / 3;
    for (let i = 0; i <= cols; i++) {
      for (let j = 0; j <= rows; j++) {
        const v = j / rows;
        const [x, y, z] = point(i, v);
        // Rounded edge: thinner toward the rim.
        const th = B.thickness * (0.55 + 0.45 * Math.sqrt(1 - v * v * 0.85));
        positions.push(x, y + (sideSign * th) / 2, z);
        brimUvs.push((i / cols) * 3, v * 0.6);
      }
    }
    const stride = rows + 1;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const a = base + i * stride + j;
        const b = a + 1;
        const c = a + stride;
        const d = c + 1;
        if (sideSign > 0) index.push(a, b, c, b, d, c);
        else index.push(a, c, b, b, c, d);
      }
    }
    return base;
  };
  const top = grid(1);
  const bottom = grid(-1);
  const stride = rows + 1;
  for (let i = 0; i < cols; i++) {
    // outer rim
    const ta = top + i * stride + rows;
    const tb = top + (i + 1) * stride + rows;
    const ba = bottom + i * stride + rows;
    const bb = bottom + (i + 1) * stride + rows;
    index.push(ta, bb, tb, ta, ba, bb);
    // inner rim (inside the crown)
    const ti = top + i * stride;
    const tj = top + (i + 1) * stride;
    const bi = bottom + i * stride;
    const bj = bottom + (i + 1) * stride;
    index.push(ti, tj, bj, ti, bj, bi);
  }
  // the two ends
  for (const i of [0, cols]) {
    for (let j = 0; j < rows; j++) {
      const a = top + i * stride + j;
      const b = bottom + i * stride + j;
      if (i === 0) index.push(a, b, a + 1, a + 1, b, b + 1);
      else index.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(brimUvs, 2));
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
  const panelUvs: number[] = [];
  const index: number[] = [];
  for (let j = 0; j <= rows; j++) {
    const e = 0.02 + (P.elevationTop - 0.02) * (j / rows);
    // A wide front panel (a trucker cap's), so the badge sits wholly on white.
    const span = P.halfSpan * Math.pow(1 - (j / rows) * 0.7, 0.45);
    for (let i = 0; i <= cols; i++) {
      const a = -span + 2 * span * (i / cols);
      const ux = Math.cos(e) * Math.sin(a);
      const uy = Math.sin(e);
      const uz = Math.cos(e) * Math.cos(a);
      const n = new THREE.Vector3(ux / rx, uy / ry, uz / rz).normalize();
      positions.push(rx * ux + n.x * P.offset, ry * uy + n.y * P.offset, rz * uz + n.z * P.offset);
      normals.push(n.x, n.y, n.z);
      panelUvs.push((i / cols) * 3, (j / rows) * 2);
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
  g.setAttribute("uv", new THREE.Float32BufferAttribute(panelUvs, 2));
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

/** A stand-in for `host` holding only the triangles near a decal projector box, so DecalGeometry
 *  clips a few thousand triangles instead of the whole 250k-triangle body (it was ~250 ms of the
 *  build). Shares the host's attributes; DecalGeometry reads only geometry and matrixWorld. */
function decalHostNear(host: THREE.Mesh, center: THREE.Vector3, orientation: THREE.Euler, size: THREE.Vector3): { mesh: THREE.Mesh; dispose(): void } {
  const g = host.geometry;
  const pos = g.getAttribute("position");
  const idx = g.getIndex();
  if (!idx) return { mesh: host, dispose: () => undefined };
  const toBox = new THREE.Matrix4().makeRotationFromEuler(orientation).setPosition(center).invert().multiply(host.matrixWorld);
  const m = 1.2; // margin, so a triangle straddling the box edge is never dropped
  const hx = (size.x / 2) * m;
  const hy = (size.y / 2) * m;
  const hz = (size.z / 2) * m;
  const inside = new Uint8Array(pos.count);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(toBox);
    inside[i] = Math.abs(v.x) <= hx && Math.abs(v.y) <= hy && Math.abs(v.z) <= hz ? 1 : 0;
  }
  const keep: number[] = [];
  for (let t = 0; t < idx.count; t += 3) {
    const a = idx.getX(t);
    const b = idx.getX(t + 1);
    const c = idx.getX(t + 2);
    if (inside[a] || inside[b] || inside[c]) keep.push(a, b, c);
  }
  const sub = new THREE.BufferGeometry();
  sub.setAttribute("position", pos);
  const n = g.getAttribute("normal");
  if (n) sub.setAttribute("normal", n);
  sub.setIndex(keep);
  const mesh = new THREE.Mesh(sub);
  mesh.matrixWorld.copy(host.matrixWorld);
  return { mesh, dispose: () => sub.dispose() };
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

  // ---- surface texture maps (shared; tiled by each mesh's UVs)
  const peelH = tileNoise(256, 28, 2, 4242);
  const peelNormal = normalMapFromHeight(peelH, 256, 2.6);
  const paintRough = greyMapFromHeight(tileNoise(256, 6, 2, 99), 256, 0.7, 1);
  const weaveNormal = normalMapFromHeight(weaveHeight(256, 32), 256, 2.4);
  const treadNormal = buildTreadNormal();
  for (const [tx, rx, ry] of [[peelNormal, 12, 6], [paintRough, 4, 2], [weaveNormal, 10, 5], [treadNormal, 1, 1]] as const) {
    if (!tx) continue;
    tx.repeat.set(rx, ry);
    tx.anisotropy = anisotropy;
    textures.add(tx);
  }

  // ---- materials
  const paint = mat(new THREE.MeshPhysicalMaterial({ name: "body-paint", color: PAINT_HEX, roughness: 0.28, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.32 }));
  const faceWhite = mat(
    new THREE.MeshPhysicalMaterial({ name: "face-white", color: 0xf6f8fc, roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.2, emissive: 0xffffff, emissiveIntensity: LOOK.faceEmissive }),
  );
  const capBlue = mat(new THREE.MeshStandardMaterial({ name: "cap-fabric-blue", color: CAP_BLUE_HEX, roughness: 0.82, side: THREE.DoubleSide }));
  const capWhite = mat(new THREE.MeshStandardMaterial({ name: "cap-fabric-white", color: 0xf4f6f9, roughness: 0.8, emissive: 0xffffff, emissiveIntensity: LOOK.capWhiteEmissive }));
  const rubber = mat(new THREE.MeshStandardMaterial({ name: "tyre-rubber", color: 0x16171b, roughness: 0.9 }));
  // Relief: an orange-peel on the paint (and a faint one in its clear coat), woven fabric on the
  // cap, a fine grain on the rubber. Kept subtle: the toy stays glossy.
  if (peelNormal) {
    paint.normalMap = peelNormal;
    paint.normalScale.set(0.1, 0.1);
    paint.clearcoatNormalMap = peelNormal;
    paint.clearcoatNormalScale.set(0.1, 0.1);
  }
  if (paintRough) paint.roughnessMap = paintRough;
  if (weaveNormal) {
    for (const m of [capBlue, capWhite]) {
      m.normalMap = weaveNormal;
      m.normalScale.set(0.55, 0.55);
    }
  }
  if (treadNormal) {
    rubber.normalMap = treadNormal;
    rubber.normalScale.set(1, 1);
  }
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
  // Light-blue glass, as on the sheet, lit a little from within so it stays light.
  const glassMap = buildGlassTexture();
  if (glassMap) {
    glassMap.anisotropy = anisotropy;
    textures.add(glassMap);
  }
  // Glass that reads as glass: the sky gradient, lit a little from within so it never goes black,
  // glossy but without the soft white blob the rough coat used to smear across it.
  const glass = mat(
    new THREE.MeshPhysicalMaterial({ name: "window-glass", color: 0xffffff, map: glassMap, roughness: 0.2, metalness: 0, clearcoat: 0.55, clearcoatRoughness: 0.18, emissive: 0xffffff, emissiveMap: glassMap, emissiveIntensity: 0.08 }),
  );
  const windowFrame = mat(new THREE.MeshPhysicalMaterial({ name: "window-frame", color: 0x0a3a9c, roughness: 0.4, clearcoat: 0.4, clearcoatRoughness: 0.3 }));
  const tailAmber = mat(new THREE.MeshPhysicalMaterial({ name: "taillight-amber", color: 0xffa23a, roughness: 0.12, clearcoat: 1, emissive: 0xff8a1a, emissiveIntensity: 0.6 }));
  const tailLens = mat(new THREE.MeshPhysicalMaterial({ name: "taillight-lens", color: 0xd8262e, roughness: 0.12, clearcoat: 1, emissive: 0xff2a2a, emissiveIntensity: 0.55 }));

  const root = new THREE.Group();
  root.name = "nlex-mascot";
  const loft = new BodyLoft();

  // ---- body + face plate
  const body = mesh("body-shell", buildBodyGeometry(loft), paint);
  const shape = new THREE.Group();
  shape.name = "nlex-mascot-shape";
  shape.scale.x = WIDTH_SCALE;
  root.add(shape);
  shape.add(body);
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
  // The sheet's sides and back: framed front and rear side windows, door handles, a rear window,
  // rounded red-and-amber taillights (the plate is a decal, below).
  // The rear window, framed and glazed like the side panes.
  body.add(mesh("rear-window-frame", buildRearWindowGeometry(loft, WINDOW_FRAME, -0.003), windowFrame));
  body.add(mesh("rear-window", buildRearWindowGeometry(loft), glass));
  const tailGeometry = geo(buildRoundedSlab(TAILLIGHT.w, TAILLIGHT.h, TAILLIGHT.r, TAILLIGHT.depth));
  const amberGeometry = geo(buildRoundedSlab(TAILLIGHT.w * 0.26, TAILLIGHT.h * 0.56, TAILLIGHT.r * 0.5, 0.006));
  const handleGeometry = geo(new THREE.CapsuleGeometry(HANDLE.radius, HANDLE.length, 4, 10).rotateX(Math.PI / 2));
  for (const side of [1, -1] as const) {
    SIDE_WINDOWS.forEach((w, wi) => {
      const tag = (side > 0 ? "-l" : "-r") + (wi ? "-rear" : "-front");
      const F = WINDOW_FRAME;
      const frame: WindowSpec = { ...w, zRear: w.zRear - F, zFront: w.zFront + F, yBottom: w.yBottom - F, yTop: w.yTop + F, radius: w.radius + F, rearTop: w.rearTop + F, offset: w.offset - 0.003 };
      body.add(mesh("side-window-frame" + tag, buildSideWindowGeometry(loft, side, frame), windowFrame));
      body.add(mesh("side-window" + tag, buildSideWindowGeometry(loft, side, w), glass));
    });
    DOOR_SEAMS.forEach((pts, si) => body.add(mesh(`door-seam-${side > 0 ? "l" : "r"}-${si}`, buildSideStripGeometry(loft, side, pts, 0.007), windowFrame)));
    const f = loft.frontFrame(side * TAILLIGHT.x, TAILLIGHT.y, -1);
    const tail = new THREE.Group();
    tail.name = side > 0 ? "taillight-l" : "taillight-r";
    tail.position.copy(f.point).addScaledVector(f.normal, -0.008);
    tail.quaternion.copy(surfaceQuaternion(f.normal));
    tail.scale.x = 1 / WIDTH_SCALE;
    const lens = new THREE.Mesh(tailGeometry, tailLens);
    lens.name = tail.name + "-lens";
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
    group.scale.x = 1 / WIDTH_SCALE; // round lamps on the widened body
    group.position.copy(f.point).addScaledVector(f.normal, 0.004);
    group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), f.normal);
    const lens = new THREE.Mesh(lensGeometry, headlightMaterials[side > 0 ? 0 : 1]);
    lens.name = side > 0 ? "headlight-l" : "headlight-r";
    const bezel = new THREE.Mesh(bezelGeometry, chrome);
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

  // ---- wheels: steer mount at the axle -> spin group (origin ON the axle) -> tyre (tread pressed in) + hub + hub-n
  const wheels: THREE.Group[] = [];
  const hubNMaterial = decalMaterial("decal-hub-n", texture(HUB_N.texture), 0.3, 0.6);
  const hubFaceX = WHEEL.hubOffset - 0.03 + WHEEL.hubProfile[WHEEL.hubProfile.length - 1][1];
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
    shape.add(steer);
    wheels.push(wheel);
  }

  // ---- decals: project the PNG cuts onto their host meshes along the reference view direction
  root.updateMatrixWorld(true);
  const hosts: Record<DecalSpec["targets"][number], THREE.Mesh> = { "windscreen-face-panel": facePanel, "body-shell": body, "cap-front-panel": capFront, "cap-crown": crown };
  const raycaster = new THREE.Raycaster();
  const face = createMascotFace();
  if (face) {
    face.texture.anisotropy = anisotropy;
    textures.add(face.texture);
  }
  const procedural: Record<string, THREE.Texture | null> = {
    "procedural:plate": buildPlateTexture(),
    "procedural:cap-back": buildCapBackTexture(),
    "procedural:cap-n": buildCapNTexture(),
  };
  for (const t of Object.values(procedural)) {
    if (!t) continue;
    t.anisotropy = anisotropy;
    textures.add(t);
  }
  for (const d of DECALS) {
    const isFace = d.texture === "procedural:face";
    const map = isFace ? face?.texture ?? null : d.texture.startsWith("procedural:") ? procedural[d.texture] ?? null : texture(d.texture);
    if (!map) continue; // no 2D canvas here: the face is simply left off
    // The face takes a light coat and little self-glow, so its eyes stay a deep blue.
    const material = decalMaterial("decal-" + d.name, map, d.name === "bonnet-badge-n" ? 0.22 : isFace ? 0.55 : 0.3, d.name === "cap-logo" || d.name === "cap-back" || isFace ? 0 : 0.8);
    if (isFace) material.emissiveIntensity = 0.1;
    if (d.name === "cap-logo") {
      material.emissiveIntensity = 0.04;
      material.roughness = 0.6;
    }
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
      const box = new THREE.Vector3(d.size[0], d.size[1], d.depth);
      const near = decalHostNear(host, center, orientation, box);
      const g = new DecalGeometry(near.mesh, center, orientation, box);
      near.dispose();
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
