import { MeshBuilder } from '../gl/builder';
import { hex, seeded, smooth, type Vec3 } from '../gl/math';
import type { Mesh, Renderer } from '../gl/renderer';

/**
 * Painted-looking outdoor pieces: terrain, trees, bushes and the rest. Scenery is
 * collected into chunks so far-off pieces can be skipped, and split between things with
 * a contour (solid) and small things without one (soft).
 */

export interface Collider {
  x: number;
  z: number;
  r: number;
}

export interface ZoneGeometry {
  terrain: Mesh;
  chunks: { solid: Mesh | null; soft: Mesh | null; center: Vec3; radius: number }[];
  water: Mesh | null;
}

export class Scatter {
  private cells = new Map<string, { solid: MeshBuilder[]; soft: MeshBuilder[]; x: number; z: number }>();
  private readonly size = 26;
  /** Where a bird can sit: the tops of tree crowns and palms, as they are planted. */
  readonly perches: Vec3[] = [];
  /** Flower heads, for butterflies to visit. */
  readonly flowers: Vec3[] = [];

  /** A point given in a planted piece's own frame, in the world. */
  static at(x: number, y: number, z: number, yaw: number, scale: number, lx: number, ly: number, lz: number): Vec3 {
    const c = Math.cos(yaw);
    const n = Math.sin(yaw);
    return [x + (c * lx + n * lz) * scale, y + ly * scale, z + (-n * lx + c * lz) * scale];
  }

  /**
   * The builders for the patch of ground at (x, z). A patch that is filling up gets a fresh
   * builder, so no mesh passes the 16-bit index limit however much is planted in one place.
   */
  cell(x: number, z: number): { solid: MeshBuilder; soft: MeshBuilder } {
    const cx = Math.floor(x / this.size);
    const cz = Math.floor(z / this.size);
    const key = `${cx},${cz}`;
    let c = this.cells.get(key);
    if (c === undefined) {
      c = { solid: [new MeshBuilder()], soft: [new MeshBuilder()], x: (cx + 0.5) * this.size, z: (cz + 0.5) * this.size };
      this.cells.set(key, c);
    }
    if (c.solid[c.solid.length - 1].vertexCount > CELL_FULL) {
      c.solid.push(new MeshBuilder());
    }
    if (c.soft[c.soft.length - 1].vertexCount > CELL_FULL) {
      c.soft.push(new MeshBuilder());
    }
    return { solid: c.solid[c.solid.length - 1], soft: c.soft[c.soft.length - 1] };
  }

  build(r: Renderer): ZoneGeometry['chunks'] {
    const out: ZoneGeometry['chunks'] = [];
    for (const c of this.cells.values()) {
      const n = Math.max(c.solid.length, c.soft.length);
      for (let i = 0; i < n; i += 1) {
        const sb = c.solid[i];
        const fb = c.soft[i];
        for (const b of [sb, fb]) {
          if (b !== undefined && b.vertexCount > 65535) {
            throw new Error(`A scenery patch has ${b.vertexCount} vertices: more than one mesh can index`);
          }
        }
        const solid = sb !== undefined && sb.indices.length > 0 ? r.mesh(sb, true) : null;
        const soft = fb !== undefined && fb.indices.length > 0 ? r.mesh(fb, false) : null;
        if (solid === null && soft === null) {
          continue;
        }
        const center: Vec3 = solid?.center ?? soft?.center ?? [c.x, 0, c.z];
        out.push({ solid, soft, center, radius: Math.max(solid?.radius ?? 0, soft?.radius ?? 0) });
      }
    }
    return out;
  }
}

/** A patch's builder takes a fresh one past this many vertices, leaving room for one more big building. */
const CELL_FULL = 46000;

/**
 * A steady random number from a position: variety for decoration (a blossom, a mushroom, a
 * palette) that never draws from a zone's own random sequence, so layouts stay exactly as
 * they were and nothing moves onto a path.
 */
export const vary = (x: number, z: number, k = 0): number => {
  const v = Math.sin(x * 12.9898 + z * 78.233 + k * 37.719) * 43758.5453;
  return v - Math.floor(v);
};

/** A height map turned into a smooth, vertex-painted ground. */
export function buildTerrain(r: Renderer, opts: { minX: number; maxX: number; minZ: number; maxZ: number; step: number; height: (x: number, z: number) => number; color: (x: number, z: number, h: number, slope: number) => Vec3 }): Mesh {
  const b = new MeshBuilder();
  const cols = Math.ceil((opts.maxX - opts.minX) / opts.step);
  const rows = Math.ceil((opts.maxZ - opts.minZ) / opts.step);
  for (let j = 0; j <= rows; j += 1) {
    for (let i = 0; i <= cols; i += 1) {
      const x = opts.minX + i * opts.step;
      const z = opts.minZ + j * opts.step;
      const h = opts.height(x, z);
      const hx = opts.height(x + 0.5, z) - opts.height(x - 0.5, z);
      const hz = opts.height(x, z + 0.5) - opts.height(x, z - 0.5);
      const l = Math.hypot(hx, 1, hz);
      b.rawVertex(x, h, z, -hx / l, 1 / l, -hz / l, opts.color(x, z, h, Math.hypot(hx, hz)));
    }
  }
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      const a = j * (cols + 1) + i;
      const c = a + cols + 1;
      b.indices.push(a, c, a + 1, a + 1, c, c + 1);
    }
  }
  return r.mesh(b, false);
}

export const mix3 = (a: Vec3, c: Vec3, k: number): Vec3 => [a[0] + (c[0] - a[0]) * k, a[1] + (c[1] - a[1]) * k, a[2] + (c[2] - a[2]) * k];

export const paint = {
  grass: hex('#6cc152'),
  grassDeep: hex('#4aa24c'),
  grassLight: hex('#92d65e'),
  grassSun: hex('#a8dc68'),
  dirt: hex('#d9b072'),
  dirtDark: hex('#b58550'),
  dirtEdge: hex('#e6c98f'),
  sand: hex('#ecd597'),
  rock: hex('#a0a4a8'),
  mud: hex('#7c6547'),
  plaza: hex('#e9dcc0'),
};

/* ---- Plants ---- */

/** Leafy greens: dark, mid and light, for layered crowns. */
const CROWNS = [
  ['#2f8f4d', '#46ad5c', '#6ecb6a'],
  ['#2a8a5c', '#3ea973', '#6fd089'],
  ['#3f9a3f', '#60b84a', '#8ed25a'],
  ['#2e9468', '#4cb67a', '#86d98e'],
];
const BLOSSOMS = ['#ff8fb5', '#ffd24a', '#ffffff', '#ff7a6b', '#c9a0ff'];
const TRUNK = '#7d5a3c';
const TRUNK_DARK = '#6a4a30';

/** A soft round clump of leaves with a lighter cap: the one leaf shape every crown and bush is made from. */
function clump(b: MeshBuilder, x: number, y: number, z: number, rx: number, ry: number, base: string, light: string, rows = 5, cols = 8): void {
  b.ellipsoid(x, y, z, rx, ry, rx, base, { rows, cols });
  b.ellipsoid(x + rx * 0.12, y + ry * 0.42, z + rx * 0.1, rx * 0.72, ry * 0.62, rx * 0.72, light, { rows: Math.max(3, rows - 2), cols: Math.max(6, cols - 2) });
}

/** Tall forest tree: a straight trunk with flared roots, and layered round crowns held high. */
export function tallTree(s: Scatter, x: number, y: number, z: number, scale: number, rand: () => number, crown = 0): void {
  const { solid } = s.cell(x, z);
  const greens = CROWNS[(crown + (vary(x, z, 1) < 0.25 ? 3 : 0)) % 4];
  const yaw = rand() * 6.28;
  const extra = vary(x, z, 2);
  s.perches.push(Scatter.at(x, y, z, yaw, scale, 0.3, 8.5, 0.2), Scatter.at(x, y, z, yaw, scale, 1.6, 6.97, 0.4));
  solid.at(x, y, z, yaw, scale, () => {
    solid.sway = 0;
    solid.tube([0, -0.4, 0], [0, 5.4, 0], 0.5, 0.3, TRUNK, 8, false);
    /* Roots flaring into the ground. */
    for (let i = 0; i < 3; i += 1) {
      const a = i * 2.1 + extra;
      solid.tube([Math.cos(a) * 0.3, 0.5, Math.sin(a) * 0.3], [Math.cos(a) * 0.95, -0.1, Math.sin(a) * 0.95], 0.2, 0.1, TRUNK_DARK, 4, false);
    }
    solid.tube([0, 3.4, 0], [1.7, 5.2, 0.3], 0.18, 0.1, TRUNK, 5, false);
    solid.tube([0, 3.9, 0], [-1.5, 5.5, -0.5], 0.16, 0.09, TRUNK, 5, false);
    solid.sway = 0.9;
    clump(solid, 0, 6.6, 0, 3.0, 1.7, greens[0], greens[1], 6, 10);
    solid.ellipsoid(1.6, 5.8, 0.4, 1.9, 1.15, 1.9, greens[1], { rows: 5, cols: 8 });
    solid.ellipsoid(-1.5, 6, -0.6, 1.9, 1.2, 1.8, greens[1], { rows: 5, cols: 8 });
    solid.ellipsoid(0.3, 7.5, 0.2, 1.8, 1.0, 1.8, greens[2], { rows: 5, cols: 8 });
    /* One more clump on some trees, so no two silhouettes match. */
    if (extra > 0.45) {
      const a = extra * 6.28;
      solid.ellipsoid(Math.cos(a) * 1.9, 6.9, Math.sin(a) * 1.9, 1.3, 0.9, 1.3, greens[1], { rows: 4, cols: 7 });
    }
    solid.sway = 0;
  });
}

/** A round garden tree; one in three is in flower or fruit. */
export function roundTree(s: Scatter, x: number, y: number, z: number, scale: number, rand: () => number): void {
  const { solid, soft } = s.cell(x, z);
  const yaw = rand() * 6.28;
  const v = vary(x, z, 3);
  const greens = CROWNS[Math.floor(v * 4) % 4];
  s.perches.push(Scatter.at(x, y, z, yaw, scale, 0.5, 4.8, 0.2));
  solid.at(x, y, z, yaw, scale, () => {
    solid.tube([0, -0.3, 0], [0, 2.2, 0], 0.27, 0.19, '#86613f', 7, false);
    solid.tube([0, 1.6, 0], [0.7, 2.6, 0.2], 0.1, 0.07, '#86613f', 5, false);
    solid.sway = 0.6;
    clump(solid, 0, 3.2, 0, 1.8, 1.5, greens[0], greens[1], 7, 9);
    solid.ellipsoid(-1.0, 2.75, 0.5, 1.0, 0.85, 1.0, greens[1], { rows: 5, cols: 7 });
    solid.ellipsoid(0.5, 3.9, 0.2, 1.1, 0.9, 1.1, greens[2], { rows: 5, cols: 7 });
    solid.sway = 0;
  });
  if (v < 0.34) {
    /* Blossom or fruit dotted over the crown: no outline, swaying with the leaves. */
    const tint = BLOSSOMS[Math.floor(vary(x, z, 4) * BLOSSOMS.length)];
    soft.sway = 0.6;
    for (let i = 0; i < 8; i += 1) {
      const a = i * 2.4;
      const up = 0.25 + (i % 3) * 0.28;
      const rr = Math.sqrt(1 - up * up);
      const p = Scatter.at(x, y, z, yaw, scale, Math.cos(a) * 1.78 * rr, 3.2 + up * 1.47, Math.sin(a) * 1.78 * rr);
      soft.ball(p[0], p[1], p[2], 0.19 * scale, tint, 2, 5);
    }
    soft.sway = 0;
  }
}

/** A coconut palm: a gently curved, ringed trunk, arching fronds and a few coconuts. */
export function palm(s: Scatter, x: number, y: number, z: number, scale: number, rand: () => number): void {
  const { solid } = s.cell(x, z);
  const yaw = rand() * 6.28;
  s.perches.push(Scatter.at(x, y, z, yaw, scale, 0.9, 5.12, 0));
  solid.at(x, y, z, yaw, scale, () => {
    solid.tube([0, -0.3, 0], [0.5, 3, 0], 0.21, 0.14, '#94744b', 7, false);
    solid.tube([0.5, 3, 0], [0.9, 5, 0], 0.14, 0.11, '#94744b', 7, false);
    for (const k of [0.25, 0.5, 0.75]) {
      solid.tube([0.5 * k * 1.2, 3 * k * 1.2 - 0.3, 0], [0.5 * k * 1.2 + 0.01, 3 * k * 1.2 - 0.22, 0], 0.2 - k * 0.06, 0.2 - k * 0.06, '#a8865a', 7, false);
    }
    for (let i = 0; i < 3; i += 1) {
      const a = i * 2.1;
      solid.ball(0.9 + Math.cos(a) * 0.2, 4.78, Math.sin(a) * 0.2, 0.17, '#7a5a2c', 4, 6);
    }
    solid.sway = 0.8;
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * 6.28;
      const c = Math.cos(a);
      const n = Math.sin(a);
      const tone = i % 2 === 0 ? '#3fa24f' : '#62c05a';
      /* Each frond rises, then droops at the tip. */
      solid.ellipsoid(0.9 + c * 0.95, 5.12, n * 0.95, 1.0, 0.09, 0.3, tone, { rows: 3, cols: 7, yaw: -a, tiltZ: -0.25 });
      solid.ellipsoid(0.9 + c * 2.0, 4.72, n * 2.0, 0.85, 0.08, 0.26, tone, { rows: 3, cols: 7, yaw: -a, tiltZ: 0.55 });
    }
    solid.sway = 0;
  });
}

export function bamboo(s: Scatter, x: number, y: number, z: number, rand: () => number): void {
  const { solid } = s.cell(x, z);
  for (let i = 0; i < 6; i += 1) {
    const dx = (rand() - 0.5) * 1.6;
    const dz = (rand() - 0.5) * 1.6;
    const h = 4 + rand() * 2.5;
    solid.sway = 0.25;
    solid.tube([x + dx, y - 0.2, z + dz], [x + dx + 0.2, y + h, z + dz + 0.1], 0.08, 0.06, '#9ccf54', 5, false);
    /* Knots up the cane. */
    for (const k of [0.3, 0.6]) {
      solid.tube([x + dx + 0.2 * k, y + h * k, z + dz + 0.1 * k], [x + dx + 0.2 * k, y + h * k + 0.06, z + dz + 0.1 * k], 0.095, 0.095, '#86b84a', 5, false);
    }
    solid.sway = 0.8;
    solid.ellipsoid(x + dx + 0.2, y + h, z + dz + 0.1, 0.75, 0.32, 0.75, '#6fbf4a', { rows: 4, cols: 7 });
    solid.ellipsoid(x + dx + 0.12, y + h * 0.72, z + dz + 0.06, 0.5, 0.2, 0.5, '#86cf56', { rows: 3, cols: 6 });
    solid.sway = 0;
  }
}

/** Bush palettes: two greens; some bushes flower. */
const BUSHES = [
  ['#3f9f4d', '#5ebf56', '#7fd368'],
  ['#2f8f55', '#4cb66b', '#78d38a'],
  ['#4a9f3a', '#6cc04a', '#98d860'],
];

export function bush(s: Scatter, x: number, y: number, z: number, size: number, rand: () => number): void {
  const { solid, soft } = s.cell(x, z);
  /* A low perch: small birds sit on bushes, where the camera can see them. */
  s.perches.push([x, y + size * 1.3, z]);
  const pal = BUSHES[Math.floor(vary(x, z, 5) * 3) % 3];
  const bloom = rand() > 0.6;
  const a0 = vary(x, z, 6) * 6.28;
  solid.sway = 0.2;
  solid.ellipsoid(x, y + size * 0.55, z, size, size * 0.8, size, pal[0], { rows: 5, cols: 8 });
  solid.ellipsoid(x + Math.cos(a0) * size * 0.55, y + size * 0.42, z + Math.sin(a0) * size * 0.55, size * 0.68, size * 0.56, size * 0.68, pal[1], { rows: 4, cols: 7 });
  solid.ellipsoid(x - Math.cos(a0) * size * 0.5, y + size * 0.38, z - Math.sin(a0) * size * 0.45, size * 0.55, size * 0.45, size * 0.55, pal[1], { rows: 4, cols: 6 });
  solid.ellipsoid(x + size * 0.1, y + size * 0.95, z + size * 0.05, size * 0.6, size * 0.38, size * 0.6, pal[2], { rows: 3, cols: 6 });
  solid.sway = 0;
  if (bloom) {
    const tint = BLOSSOMS[Math.floor(vary(x, z, 7) * BLOSSOMS.length)];
    soft.sway = 0.2;
    for (let i = 0; i < 5; i += 1) {
      const a = a0 + i * 1.26;
      const up = 0.35 + (i % 2) * 0.35;
      soft.ball(x + Math.cos(a) * size * 0.88 * Math.sqrt(1 - up * up), y + size * 0.55 + up * size * 0.82, z + Math.sin(a) * size * 0.88 * Math.sqrt(1 - up * up), size * 0.13, tint, 2, 5);
    }
    soft.ball(x - size * 0.3, y + size * 1.17, z + size * 0.3, size * 0.14, tint, 2, 5);
    soft.sway = 0;
  }
}

export function rock(s: Scatter, x: number, y: number, z: number, size: number, rand: () => number): void {
  const { solid, soft } = s.cell(x, z);
  s.perches.push([x, y + size * 0.98, z]);
  solid.ellipsoid(x, y + size * 0.3, z, size, size * 0.72, size * 0.85, '#9aa1a8', { rows: 5, cols: 8, yaw: rand() * 6.28, tiltX: rand() * 0.3 });
  solid.ellipsoid(x + size * 0.2, y + size * 0.62, z, size * 0.55, size * 0.32, size * 0.5, '#bcc2c8', { rows: 4, cols: 7 });
  const v = vary(x, z, 8);
  if (v < 0.45) {
    /* A soft cap of moss. */
    solid.sway = 0.06;
    solid.ellipsoid(x - size * 0.1, y + size * 0.78, z + size * 0.05, size * 0.6, size * 0.16, size * 0.55, '#6cbf55', { rows: 4, cols: 8 });
    solid.sway = 0;
  }
  /* Pebbles at its foot. */
  for (let i = 0; i < 2; i += 1) {
    const a = v * 6.28 + i * 2.5;
    soft.ellipsoid(x + Math.cos(a) * size * 1.15, y + 0.04, z + Math.sin(a) * size * 1.1, size * 0.18, size * 0.1, size * 0.15, '#b4bac0', { rows: 3, cols: 5 });
  }
}

export function fern(s: Scatter, x: number, y: number, z: number, rand: () => number): void {
  const { soft } = s.cell(x, z);
  const count = 4 + Math.floor(rand() * 3);
  soft.sway = 0.25;
  for (let i = 0; i < count; i += 1) {
    const a = rand() * 6.28;
    const c = Math.cos(a);
    const n = Math.sin(a);
    const tone = i % 2 === 0 ? '#3f9f4d' : '#5ebf56';
    /* Each frond arches up and out, then down. */
    soft.ellipsoid(x + c * 0.3, y + 0.32, z + n * 0.3, 0.38, 0.06, 0.15, tone, { rows: 2, cols: 5, yaw: -a, tiltZ: -0.35 });
    soft.ellipsoid(x + c * 0.72, y + 0.3, z + n * 0.72, 0.34, 0.05, 0.13, tone, { rows: 2, cols: 5, yaw: -a, tiltZ: 0.45 });
  }
  soft.sway = 0;
}

/** A clump of grass: five blades, dark at the root and sunny at the tip. */
export function tuft(s: Scatter, x: number, y: number, z: number, rand: () => number): void {
  const { soft } = s.cell(x, z);
  soft.sway = 0.18;
  const tones: [string, string][] = [
    ['#4aa24c', '#7ccb56'],
    ['#5eb84e', '#9ad85e'],
    ['#4fae55', '#a8dc68'],
  ];
  for (let i = 0; i < 3; i += 1) {
    const [base, tip] = tones[i % 3];
    soft.cone(x + (rand() - 0.5) * 0.4, y - 0.02, z + (rand() - 0.5) * 0.4, 0.09, 0.32 + rand() * 0.2, base, 4, tip);
  }
  /* Two shorter blades from the same root, for a fuller clump. */
  for (let i = 0; i < 2; i += 1) {
    const a = vary(x, z, 9 + i) * 6.28;
    soft.cone(x + Math.cos(a) * 0.16, y - 0.02, z + Math.sin(a) * 0.16, 0.07, 0.22 + vary(x, z, 11 + i) * 0.1, '#5eb84e', 3, '#a8dc68');
  }
  soft.sway = 0;
}

/** A small cluster of cheerful flowers: five-petal faces with a yellow eye, on stems with a leaf. */
export function flower(s: Scatter, x: number, y: number, z: number, rand: () => number): void {
  const { soft } = s.cell(x, z);
  const colors = ['#ffd24a', '#ff8fb5', '#ffffff', '#ff9d3c', '#b98cff'];
  const main = colors[Math.floor(rand() * colors.length)];
  const second = colors[Math.floor(vary(x, z, 12) * colors.length)];
  const n = 2 + Math.floor(vary(x, z, 13) * 2);
  soft.sway = 0.14;
  for (let i = 0; i < n; i += 1) {
    const a = vary(x, z, 14 + i) * 6.28;
    const d = i === 0 ? 0 : 0.18;
    const fx = x + Math.cos(a) * d;
    const fz = z + Math.sin(a) * d;
    const h = 0.26 + (i === 0 ? 0.06 : vary(x, z, 17 + i) * 0.08);
    const tint = i === 0 ? main : second;
    s.flowers.push([fx, y + h + 0.04, fz]);
    soft.cone(fx, y - 0.02, fz, 0.025, h, '#4aa24c', 3);
    soft.petals(fx, y + h, fz, 0.11, 5, tint, a);
    soft.ball(fx, y + h + 0.012, fz, 0.035, tint === '#ffd24a' ? '#ff9d3c' : '#ffd24a', 2, 4);
  }
  soft.ellipsoid(x + 0.08, y + 0.05, z, 0.12, 0.025, 0.05, '#5eb84e', { rows: 2, cols: 5, yaw: vary(x, z, 20) * 6.28, tiltZ: 0.3 });
  soft.sway = 0;
}

export function stump(s: Scatter, x: number, y: number, z: number, rand: () => number): void {
  const { solid, soft } = s.cell(x, z);
  const r = 0.4 + rand() * 0.3;
  s.perches.push([x, y + 0.44, z]);
  solid.tube([x, y - 0.2, z], [x, y + 0.42, z], r, r * 0.9, TRUNK, 9, false);
  solid.disc(x, y + 0.42, z, r * 0.9, '#d8b27a', 12);
  soft.disc(x, y + 0.425, z, r * 0.55, '#c49a62', 12);
  soft.disc(x, y + 0.43, z, r * 0.22, '#d8b27a', 10);
  if (vary(x, z, 21) < 0.5) {
    mushroom(s, x + r * 0.95, y, z + r * 0.3, 1);
    mushroom(s, x + r * 0.8, y, z + r * 0.75, 0.7);
  }
}

/* ---- Small details ---- */

/** A little red-capped mushroom with white dots. */
export function mushroom(s: Scatter, x: number, y: number, z: number, size = 1): void {
  const { soft } = s.cell(x, z);
  soft.tube([x, y - 0.02, z], [x, y + 0.14 * size, z], 0.04 * size, 0.035 * size, '#f6efe0', 5, false);
  soft.ellipsoid(x, y + 0.15 * size, z, 0.1 * size, 0.06 * size, 0.1 * size, '#e2452f', { rows: 3, cols: 6 });
  for (let i = 0; i < 2; i += 1) {
    const a = i * 3.1 + 0.6;
    soft.ball(x + Math.cos(a) * 0.055 * size, y + 0.195 * size, z + Math.sin(a) * 0.055 * size, 0.018 * size, '#ffffff', 2, 4);
  }
}

/** Reeds by the water: slim leaves and a few brown cattails. */
export function reeds(s: Scatter, x: number, y: number, z: number, k = 0): void {
  const { soft } = s.cell(x, z);
  soft.sway = 0.3;
  for (let i = 0; i < 6; i += 1) {
    const a = vary(x, z, 30 + i + k) * 6.28;
    const d = vary(x, z, 40 + i + k) * 0.35;
    const h = 0.7 + vary(x, z, 50 + i + k) * 0.6;
    const px = x + Math.cos(a) * d;
    const pz = z + Math.sin(a) * d;
    soft.cone(px, y - 0.05, pz, 0.05, h, '#4f9a45', 3, '#8fcf5a');
    if (i % 3 === 0) {
      soft.tube([px, y + h * 0.7, pz], [px, y + h * 1.05, pz], 0.035, 0.03, '#8a5a2c', 4, false);
    }
  }
  soft.sway = 0;
}

/** A clipped hedge between two points, as a row of soft round lobes. Colliders are the caller's. */
export function hedge(s: Scatter, x0: number, z0: number, x1: number, z1: number, y: number, h = 0.9, tone = 0): void {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.max(1, Math.round(len / 0.9));
  const pal = BUSHES[tone % 3];
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    const x = x0 + (x1 - x0) * t;
    const z = z0 + (z1 - z0) * t;
    const { solid } = s.cell(x, z);
    solid.sway = 0.08;
    solid.ellipsoid(x, y + h * 0.5, z, 0.62, h * 0.58, 0.62, i % 2 === 0 ? pal[0] : pal[1], { rows: 5, cols: 8 });
    solid.sway = 0;
  }
  s.perches.push([(x0 + x1) / 2, y + h * 1.05, (z0 + z1) / 2]);
}

/** A round pot: with flowers, a little round shrub, or a small palm. */
export function planter(s: Scatter, x: number, y: number, z: number, kind: 'flowers' | 'shrub' | 'palm' = 'flowers', pot = '#c9714a', size = 1): void {
  const { solid, soft } = s.cell(x, z);
  const r = 0.38 * size;
  solid.tube([x, y, z], [x, y + 0.55 * size, z], r * 0.78, r, pot, 10, false);
  solid.tube([x, y + 0.52 * size, z], [x, y + 0.62 * size, z], r * 1.08, r * 1.08, pot, 10, false);
  solid.disc(x, y + 0.6 * size, z, r, '#6b4a2f', 10);
  if (kind === 'shrub') {
    solid.sway = 0.15;
    clump(solid, x, y + 0.98 * size, z, 0.5 * size, 0.45 * size, '#3f9f4d', '#6cc04a', 6, 8);
    solid.sway = 0;
  } else if (kind === 'palm') {
    solid.tube([x, y + 0.6 * size, z], [x, y + 1.3 * size, z], 0.05 * size, 0.04 * size, '#94744b', 5, false);
    solid.sway = 0.4;
    for (let i = 0; i < 5; i += 1) {
      const a = i * 1.26;
      solid.ellipsoid(x + Math.cos(a) * 0.32 * size, y + 1.28 * size, z + Math.sin(a) * 0.32 * size, 0.36 * size, 0.04 * size, 0.1 * size, '#4cb65a', { rows: 3, cols: 6, yaw: -a, tiltZ: 0.4 });
    }
    solid.sway = 0;
  } else {
    soft.sway = 0.12;
    soft.ellipsoid(x, y + 0.72 * size, z, r * 0.95, 0.16 * size, r * 0.95, '#4fae55', { rows: 4, cols: 8 });
    for (let i = 0; i < 5; i += 1) {
      const a = vary(x, z, 60 + i) * 6.28;
      const d = i === 0 ? 0 : r * 0.55;
      const fx = x + Math.cos(a) * d;
      const fz = z + Math.sin(a) * d;
      const tint = BLOSSOMS[Math.floor(vary(x, z, 70 + i) * BLOSSOMS.length)];
      soft.petals(fx, y + 0.88 * size, fz, 0.1 * size, 5, tint, a);
      soft.ball(fx, y + 0.895 * size, fz, 0.032 * size, '#ffd24a', 2, 4);
      s.flowers.push([fx, y + 0.92 * size, fz]);
    }
    soft.sway = 0;
  }
}

/** A raised bed of flowers with a timber edge. */
export function flowerBed(s: Scatter, x: number, y: number, z: number, w: number, d: number, yaw = 0): void {
  const { solid, soft } = s.cell(x, z);
  solid.box(x, y + 0.12, z, w, 0.24, d, '#a8743f', yaw);
  soft.box(x, y + 0.245, z, w - 0.16, 0.02, d - 0.16, '#6b4a2f', yaw);
  const c = Math.cos(yaw);
  const n = Math.sin(yaw);
  const nx = Math.max(1, Math.round(w / 0.42));
  const nz = Math.max(1, Math.round(d / 0.42));
  soft.sway = 0.12;
  for (let i = 0; i < nx; i += 1) {
    for (let j = 0; j < nz; j += 1) {
      const lx = (i + 0.5) / nx - 0.5;
      const lz = (j + 0.5) / nz - 0.5;
      const px = x + (lx * (w - 0.3)) * c + (lz * (d - 0.3)) * n;
      const pz = z - (lx * (w - 0.3)) * n + (lz * (d - 0.3)) * c;
      const tint = BLOSSOMS[Math.floor(vary(px, pz, 80) * BLOSSOMS.length)];
      const h = y + 0.38 + vary(px, pz, 81) * 0.12;
      soft.ellipsoid(px, h - 0.1, pz, 0.16, 0.1, 0.16, '#4fae55', { rows: 3, cols: 6 });
      soft.petals(px, h, pz, 0.1, 5, tint, vary(px, pz, 82) * 6);
      soft.ball(px, h + 0.012, pz, 0.03, '#ffd24a', 2, 4);
      s.flowers.push([px, h + 0.04, pz]);
    }
  }
  soft.sway = 0;
}

/** A wooden park bench, its seat facing `yaw`. */
export function bench(s: Scatter, x: number, y: number, z: number, yaw: number): void {
  const { solid } = s.cell(x, z);
  solid.at(x, y, z, yaw, 1, () => {
    for (const lx of [-0.75, 0.75]) {
      solid.box(lx, 0.22, 0, 0.12, 0.44, 0.5, '#5a4a3e');
      solid.box(lx, 0.62, -0.24, 0.1, 0.5, 0.08, '#5a4a3e');
    }
    for (const lz of [-0.15, 0.08]) {
      solid.box(0, 0.47, lz, 1.8, 0.07, 0.2, '#c98a4a');
    }
    for (const ly of [0.66, 0.84]) {
      solid.box(0, ly, -0.27, 1.8, 0.12, 0.06, '#c98a4a');
    }
  });
  s.perches.push([x, y + 0.92, z]);
}

/** A friendly garden lamp: a slim post and a warm round lantern. */
export function lamp(s: Scatter, x: number, y: number, z: number, h = 2.6): void {
  const { solid } = s.cell(x, z);
  solid.tube([x, y, z], [x, y + h, z], 0.07, 0.055, '#2f3b52', 6, false);
  solid.tube([x, y, z], [x, y + 0.25, z], 0.13, 0.11, '#2f3b52', 6, false);
  solid.ball(x, y + h + 0.18, z, 0.22, '#ffe9a8', 6, 9);
  solid.ellipsoid(x, y + h + 0.42, z, 0.26, 0.08, 0.26, '#2f3b52', { rows: 3, cols: 9 });
}

/** Leafy vines climbing from a to b: small leaf clumps along the way. */
export function vine(s: Scatter, a: Vec3, b: Vec3, k = 0): void {
  const { soft } = s.cell(a[0], a[2]);
  const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const n = Math.max(2, Math.round(len / 0.35));
  soft.sway = 0.1;
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    const w = Math.sin(t * 9 + k) * 0.08;
    const p: Vec3 = [a[0] + (b[0] - a[0]) * t + w, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t + w];
    soft.ellipsoid(p[0], p[1], p[2], 0.17, 0.12, 0.17, i % 2 === 0 ? '#4fae55' : '#6cc04a', { rows: 3, cols: 6 });
    if (i % 4 === 2) {
      soft.ball(p[0] + 0.1, p[1] + 0.06, p[2] + 0.08, 0.05, '#ff8fb5', 2, 4);
    }
  }
  soft.sway = 0;
}

/** A short picket fence between two points, white with rounded tops. Colliders are the caller's. */
export function picket(s: Scatter, x0: number, z0: number, x1: number, z1: number, y: number, color = '#f7f3ea'): void {
  const { solid } = s.cell(x0, z0);
  const len = Math.hypot(x1 - x0, z1 - z0);
  const yaw = Math.atan2(x1 - x0, z1 - z0) - Math.PI / 2;
  const n = Math.max(2, Math.round(len / 0.32));
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    const px = x0 + (x1 - x0) * t;
    const pz = z0 + (z1 - z0) * t;
    solid.box(px, y + 0.32, pz, 0.12, 0.64, 0.05, color, yaw);
  }
  for (const h of [0.22, 0.5]) {
    solid.box((x0 + x1) / 2, y + h, (z0 + z1) / 2, len, 0.07, 0.04, color, yaw);
  }
}

/** Puffy painted clouds, far off. */
export function clouds(r: Renderer, seed: number, spread: number): Mesh {
  const rand = seeded(seed);
  const b = new MeshBuilder();
  for (let i = 0; i < 14; i += 1) {
    const a = rand() * 6.28;
    const d = spread * (0.75 + rand() * 0.5);
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    const y = 55 + rand() * 40;
    const s = 8 + rand() * 12;
    b.ellipsoid(x, y, z, s * 1.6, s * 0.55, s, '#ffffff', { rows: 5, cols: 9 });
    b.ellipsoid(x + s * 0.8, y - s * 0.1, z + s * 0.1, s * 0.9, s * 0.42, s * 0.7, '#f5fbff', { rows: 4, cols: 7 });
    b.ellipsoid(x - s * 0.8, y - s * 0.12, z, s, s * 0.45, s * 0.75, '#f5fbff', { rows: 4, cols: 7 });
  }
  return r.mesh(b, false);
}

export const nearLine = (px: number, pz: number, a: readonly [number, number], c: readonly [number, number]): number => {
  const dx = c[0] - a[0];
  const dz = c[1] - a[1];
  const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(px - (a[0] + dx * t), pz - (a[1] + dz * t));
};

export const distToPath = (x: number, z: number, path: readonly (readonly [number, number])[]): number => {
  let best = Infinity;
  for (let i = 0; i < path.length - 1; i += 1) {
    best = Math.min(best, nearLine(x, z, path[i], path[i + 1]));
  }
  return best;
};

export const groundColor = (dist: number, patch: number, slope: number): Vec3 => {
  let c = mix3(paint.grass, paint.grassLight, smooth(0.15, 0.2, patch));
  c = mix3(c, paint.grassDeep, smooth(-0.22, -0.28, patch));
  /* Sunny patches, so a lawn is never one flat green. */
  c = mix3(c, paint.grassSun, smooth(0.3, 0.38, patch) * 0.55);
  c = mix3(c, paint.rock, smooth(0.9, 1.25, slope));
  /* A deeper green rim along each path, so the way reads at a glance. */
  c = mix3(c, paint.grassDeep, smooth(4.2, 2.6, dist) * smooth(1.6, 2.4, dist) * 0.45);
  const p = smooth(2.5, 1.7, dist);
  return mix3(c, paint.dirt, p);
};
