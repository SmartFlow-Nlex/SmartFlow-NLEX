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
  private cells = new Map<string, { solid: MeshBuilder; soft: MeshBuilder; x: number; z: number }>();
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

  cell(x: number, z: number): { solid: MeshBuilder; soft: MeshBuilder } {
    const cx = Math.floor(x / this.size);
    const cz = Math.floor(z / this.size);
    const key = `${cx},${cz}`;
    let c = this.cells.get(key);
    if (c === undefined) {
      c = { solid: new MeshBuilder(), soft: new MeshBuilder(), x: (cx + 0.5) * this.size, z: (cz + 0.5) * this.size };
      this.cells.set(key, c);
    }
    return c;
  }

  build(r: Renderer): ZoneGeometry['chunks'] {
    const out: ZoneGeometry['chunks'] = [];
    for (const c of this.cells.values()) {
      const solid = c.solid.indices.length > 0 ? r.mesh(c.solid, true) : null;
      const soft = c.soft.indices.length > 0 ? r.mesh(c.soft, false) : null;
      const center: Vec3 = solid?.center ?? soft?.center ?? [c.x, 0, c.z];
      out.push({ solid, soft, center, radius: Math.max(solid?.radius ?? 0, soft?.radius ?? 0) });
    }
    return out;
  }
}

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
  dirt: hex('#d2a667'),
  dirtDark: hex('#b58550'),
  sand: hex('#ecd597'),
  rock: hex('#a0a4a8'),
  mud: hex('#7c6547'),
  plaza: hex('#e6d9bd'),
};

/** Tall forest tree: a straight trunk and rounded crowns held high. */
export function tallTree(s: Scatter, x: number, y: number, z: number, scale: number, rand: () => number, crown = 0): void {
  const { solid } = s.cell(x, z);
  const greens = [
    ['#2f8f4d', '#46ad5c', '#6ecb6a'],
    ['#2a8a5c', '#3ea973', '#6fd089'],
    ['#3f9a3f', '#60b84a', '#8ed25a'],
  ][crown % 3];
  const yaw = rand() * 6.28;
  s.perches.push(Scatter.at(x, y, z, yaw, scale, 0.3, 8.5, 0.2), Scatter.at(x, y, z, yaw, scale, 1.6, 6.97, 0.4));
  solid.at(x, y, z, yaw, scale, () => {
    solid.sway = 0;
    solid.tube([0, -0.4, 0], [0, 5.4, 0], 0.5, 0.32, '#7d5a3c', 7, false);
    solid.tube([0, 3.4, 0], [1.7, 5.2, 0.3], 0.18, 0.1, '#7d5a3c', 5, false);
    solid.tube([0, 3.9, 0], [-1.5, 5.5, -0.5], 0.16, 0.09, '#7d5a3c', 5, false);
    solid.sway = 0.9;
    solid.ellipsoid(0, 6.6, 0, 3.0, 1.7, 3.0, greens[0], { rows: 6, cols: 9 });
    solid.ellipsoid(1.6, 5.8, 0.4, 1.9, 1.15, 1.9, greens[1], { rows: 5, cols: 8 });
    solid.ellipsoid(-1.5, 6, -0.6, 1.9, 1.2, 1.8, greens[1], { rows: 5, cols: 8 });
    solid.ellipsoid(0.3, 7.5, 0.2, 1.8, 1.0, 1.8, greens[2], { rows: 5, cols: 8 });
    solid.sway = 0;
  });
}

export function roundTree(s: Scatter, x: number, y: number, z: number, scale: number, rand: () => number): void {
  const { solid } = s.cell(x, z);
  const yaw = rand() * 6.28;
  s.perches.push(Scatter.at(x, y, z, yaw, scale, 0.5, 4.8, 0.2));
  solid.at(x, y, z, yaw, scale, () => {
    solid.tube([0, -0.3, 0], [0, 2.2, 0], 0.26, 0.2, '#86613f', 6, false);
    solid.sway = 0.6;
    solid.ellipsoid(0, 3.2, 0, 1.8, 1.5, 1.8, '#3fa24f', { rows: 6, cols: 8 });
    solid.ellipsoid(0.5, 3.9, 0.2, 1.1, 0.9, 1.1, '#74c95c', { rows: 5, cols: 7 });
    solid.sway = 0;
  });
}

export function palm(s: Scatter, x: number, y: number, z: number, scale: number, rand: () => number): void {
  const { solid } = s.cell(x, z);
  const yaw = rand() * 6.28;
  s.perches.push(Scatter.at(x, y, z, yaw, scale, 0.9, 5.12, 0));
  solid.at(x, y, z, yaw, scale, () => {
    solid.tube([0, -0.3, 0], [0.5, 3, 0], 0.2, 0.13, '#94744b', 6, false);
    solid.tube([0.5, 3, 0], [0.9, 5, 0], 0.13, 0.1, '#94744b', 6, false);
    solid.sway = 0.8;
    for (let i = 0; i < 7; i += 1) {
      const a = (i / 7) * 6.28;
      solid.ellipsoid(0.9 + Math.cos(a) * 1.3, 4.8, Math.sin(a) * 1.3, 1.4, 0.1, 0.34, i % 2 === 0 ? '#3fa24f' : '#62c05a', { rows: 3, cols: 6, yaw: -a, tiltZ: 0.35 });
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
    solid.sway = 0.8;
    solid.ellipsoid(x + dx + 0.2, y + h, z + dz + 0.1, 0.7, 0.3, 0.7, '#6fbf4a', { rows: 3, cols: 6 });
    solid.sway = 0;
  }
}

export function bush(s: Scatter, x: number, y: number, z: number, size: number, rand: () => number): void {
  const { solid } = s.cell(x, z);
  /* A low perch: small birds sit on bushes, where the camera can see them. */
  s.perches.push([x, y + size * 1.3, z]);
  solid.sway = 0.2;
  solid.ellipsoid(x, y + size * 0.55, z, size, size * 0.8, size, '#3f9f4d', { rows: 5, cols: 8 });
  solid.ellipsoid(x + size * 0.5, y + size * 0.42, z + size * 0.2, size * 0.65, size * 0.55, size * 0.65, '#5ebf56', { rows: 4, cols: 7 });
  if (rand() > 0.6) {
    solid.ball(x - size * 0.3, y + size * 1.15, z + size * 0.3, size * 0.14, '#f25e5e', 3, 5);
    solid.ball(x + size * 0.1, y + size * 1.2, z - size * 0.3, size * 0.12, '#ffd24a', 3, 5);
  }
  solid.sway = 0;
}

export function rock(s: Scatter, x: number, y: number, z: number, size: number, rand: () => number): void {
  const { solid } = s.cell(x, z);
  s.perches.push([x, y + size * 0.98, z]);
  solid.ellipsoid(x, y + size * 0.3, z, size, size * 0.72, size * 0.85, '#9aa1a8', { rows: 4, cols: 7, yaw: rand() * 6.28, tiltX: rand() * 0.3 });
  solid.ellipsoid(x + size * 0.2, y + size * 0.62, z, size * 0.55, size * 0.32, size * 0.5, '#bcc2c8', { rows: 3, cols: 6 });
}

export function fern(s: Scatter, x: number, y: number, z: number, rand: () => number): void {
  const { soft } = s.cell(x, z);
  const count = 4 + Math.floor(rand() * 3);
  soft.sway = 0.25;
  for (let i = 0; i < count; i += 1) {
    const a = rand() * 6.28;
    soft.ellipsoid(x + Math.cos(a) * 0.4, y + 0.28, z + Math.sin(a) * 0.4, 0.55, 0.06, 0.15, i % 2 === 0 ? '#3f9f4d' : '#5ebf56', { rows: 3, cols: 5, yaw: -a, tiltZ: 0.5 });
  }
  soft.sway = 0;
}

export function tuft(s: Scatter, x: number, y: number, z: number, rand: () => number): void {
  const { soft } = s.cell(x, z);
  soft.sway = 0.18;
  const tones = ['#5eb84e', '#7ccb56', '#9ad85e'];
  for (let i = 0; i < 3; i += 1) {
    soft.cone(x + (rand() - 0.5) * 0.4, y - 0.02, z + (rand() - 0.5) * 0.4, 0.09, 0.32 + rand() * 0.2, tones[i % 3], 4);
  }
  soft.sway = 0;
}

export function flower(s: Scatter, x: number, y: number, z: number, rand: () => number): void {
  const { soft } = s.cell(x, z);
  const colors = ['#ffd24a', '#ff8fb5', '#ffffff', '#ff9d3c', '#b98cff'];
  soft.sway = 0.14;
  s.flowers.push([x, y + 0.3, z]);
  soft.ball(x, y + 0.26, z, 0.09, colors[Math.floor(rand() * colors.length)], 3, 5);
  soft.cone(x, y - 0.02, z, 0.03, 0.24, '#4aa24c', 3);
  soft.sway = 0;
}

export function stump(s: Scatter, x: number, y: number, z: number, rand: () => number): void {
  const { solid } = s.cell(x, z);
  const r = 0.4 + rand() * 0.3;
  s.perches.push([x, y + 0.44, z]);
  solid.tube([x, y - 0.2, z], [x, y + 0.42, z], r, r * 0.9, '#7d5a3c', 8, false);
  solid.disc(x, y + 0.42, z, r * 0.9, '#d8b27a', 10);
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
  c = mix3(c, paint.rock, smooth(0.9, 1.25, slope));
  const p = smooth(2.5, 1.7, dist);
  return mix3(c, paint.dirt, p);
};
