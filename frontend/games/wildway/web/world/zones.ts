import { MeshBuilder } from '../gl/builder';
import { hex, seeded, smooth, type Vec3 } from '../gl/math';
import type { Environment, Mesh, Renderer } from '../gl/renderer';
import type { ZoneId } from '../../core/mission';
import { bamboo, buildTerrain, bush, clouds, distToPath, fern, flower, groundColor, mix3, nearLine, paint, palm, rock, roundTree, Scatter, stump, tallTree, tuft, type Collider, type ZoneGeometry } from './scenery';

/**
 * The two places in this slice: Malaya Ridge (a fictional forest in the Sierra Madre
 * foothills) and the Greenway Field Station. A zone is geometry plus the facts the game
 * needs about it: how high the ground is, what blocks walking, and where things are.
 */

/** A picture standing in the world, by texture name: Navie's screen, a painted sign. */
export interface ZoneImage {
  key: string;
  x: number;
  y: number;
  z: number;
  /** The picture faces this way: 0 is +z. */
  yaw: number;
  w: number;
  h: number;
}

/** A footbridge along z: walkable, with its deck height. */
export interface ZoneBridge {
  x: number;
  z: number;
  halfWidth: number;
  halfLength: number;
  deck: number;
}

export interface Zone {
  id: ZoneId;
  geometry: ZoneGeometry;
  cloudMesh: Mesh;
  env: Environment;
  height: (x: number, z: number) => number;
  /** Solid things to walk around. */
  colliders: Collider[];
  /** Can someone on foot stand here? */
  walkable: (x: number, z: number) => boolean;
  spots: Record<string, [number, number]>;
  /** Tree tops a bird can sit on, and flower heads for butterflies, recorded as the scenery was planted. */
  perches?: Vec3[];
  flowers?: Vec3[];
  waterY: number | null;
  /** Everything that must be freed when the zone is left. */
  meshes: Mesh[];
  images?: ZoneImage[];
  bridges?: ZoneBridge[];
  /** For a zone split by water: which side a point is on (the sign). Used to route the guide over the bridge. */
  side?: (x: number, z: number) => number;
}

export const DAY: Environment = {
  sun: normalize([0.45, 0.78, 0.42]),
  skyTop: hex('#3fa9f5'),
  skyBottom: hex('#d4f1ff'),
  fog: hex('#cfeeff'),
  fogNear: 55,
  fogFar: 175,
  shadowTint: [0.6, 0.66, 0.92],
  lightTint: [1.06, 1.03, 0.94],
};

function normalize(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
}

/* ---- Malaya Ridge ---- */

const FOREST_PATH: readonly (readonly [number, number])[] = [
  [3, -72],
  [4, -46],
  [-1, -26],
  [-1, -12],
  [0, 10],
  [6, 18],
  [4, 34],
  [-8, 40],
  [-22, 42],
];

/** Where the stream runs: its centre line at each x. */
export const creekZ = (x: number): number => 3 * Math.sin(x * 0.07);

export const BRIDGE = { halfWidth: 1.7, halfLength: 5.6, deck: 0.35 };

const FOREST_WATER_Y = -1;
const CREEK_BED = -2.2;

export const forestHeight = (x: number, z: number): number => {
  const base = 1.1 * Math.sin(x * 0.06 + 0.7) * Math.cos(z * 0.05) + 0.5 * Math.sin(x * 0.13 + z * 0.09) + 0.25 * Math.sin(z * 0.21);
  const edge = Math.max(Math.abs(x) / 64, Math.abs(z) / 76);
  const pd = distToPath(x, z, FOREST_PATH);
  let h = base * (0.25 + 0.75 * smooth(3, 9, pd));
  h += smooth(0.7, 1, edge) * 17;
  const d = Math.abs(z - creekZ(x));
  /* The creek has one bed depth all along, so high ground can never make a ford. */
  h += (CREEK_BED - h) * smooth(5.6, 2.2, d);
  const ledge = Math.hypot(x - 36, z - 34);
  h += smooth(8, 5.2, ledge) * 6.2;
  return h;
};

export function buildForest(r: Renderer): Zone {
  const rand = seeded(90210);
  const s = new Scatter();
  const colliders: Collider[] = [];
  const height = forestHeight;

  const spots: Record<string, [number, number]> = {
    spawn: [-1, -19],
    bank: [-1, -8.5],
    bird: [-11, 12],
    ranger: [5, -10],
    arrive: [1, -41],
    vehicle: [8, -46],
    log: [-1, -25],
    crossing: [0, -7],
    farPost: [0, 8],
    tent: [10, 17],
    signA: [-15, 21],
    signB: [20, 20],
    noiseSpot: [24, 9],
    vines: [31, 29],
    generator: [36, 34],
    stakeA: [-30, 31],
    stakeB: [-24, 26.5],
    stakeC: [-18, 31],
    stakeD: [-12, 26.5],
    roost: [-42, 46],
    watch: [-14, 37],
    wheel: [-22, 7.5],
    clueA: [-5, -11],
    clueB: [8, -16],
    clueC: [12, 9],
  };

  const gapBox = (x: number, z: number): boolean => x > -38 && x < -6 && z > 21 && z < 38;
  const channel: readonly (readonly [number, number])[] = [[-22, 6], [-26, 14], [-23, 22], [-21, 30]];
  const nearSpot = (x: number, z: number, keep: number): boolean => Object.values(spots).some(([sx, sz]) => Math.hypot(x - sx, z - sz) < keep);

  /* Tall forest, thick away from the path, thinning at the forest gap. */
  let placed = 0;
  for (let i = 0; i < 2400 && placed < 300; i += 1) {
    const x = -70 + rand() * 140;
    const z = -80 + rand() * 160;
    const pd = distToPath(x, z, FOREST_PATH);
    const y = height(x, z);
    if (pd < 6 || gapBox(x, z) || y < FOREST_WATER_Y + 0.6 || nearSpot(x, z, 6)) {
      continue;
    }
    if (Math.hypot(x - 36, z - 34) < 9 || distToPath(x, z, channel) < 3) {
      continue;
    }
    const scale = 0.85 + rand() * 0.55;
    const kind = rand();
    if (kind < 0.62) {
      tallTree(s, x, y, z, scale, rand, Math.floor(rand() * 3));
      colliders.push({ x, z, r: 0.7 * scale });
    } else if (kind < 0.8) {
      roundTree(s, x, y, z, scale * 1.2, rand);
      colliders.push({ x, z, r: 0.5 });
    } else if (kind < 0.9) {
      palm(s, x, y, z, scale * 1.1, rand);
      colliders.push({ x, z, r: 0.4 });
    } else {
      bamboo(s, x, y, z, rand);
      colliders.push({ x, z, r: 1 });
    }
    placed += 1;
  }
  /* Bushes, ferns, grass and flowers. */
  for (let i = 0; i < 900; i += 1) {
    const x = -62 + rand() * 124;
    const z = -74 + rand() * 148;
    const pd = distToPath(x, z, FOREST_PATH);
    const y = height(x, z);
    if (pd < 2.6 || y < FOREST_WATER_Y + 0.3 || Math.abs(y) > 8) {
      continue;
    }
    const k = rand();
    if (k < 0.12 && pd > 4 && !nearSpot(x, z, 3.5)) {
      const size = 0.7 + rand() * 0.8;
      bush(s, x, y, z, size, rand);
      colliders.push({ x, z, r: size * 0.8 });
    } else if (k < 0.2 && pd > 3.5 && !nearSpot(x, z, 3)) {
      const size = 0.5 + rand() * 0.9;
      rock(s, x, y, z, size, rand);
      colliders.push({ x, z, r: size * 0.8 });
    } else if (k < 0.45) {
      fern(s, x, y, z, rand);
    } else if (k < 0.82) {
      tuft(s, x, y, z, rand);
    } else {
      flower(s, x, y, z, rand);
    }
  }
  /* The gap the old road cut through the canopy: stumps and bare soil to replant. */
  for (const [x, z] of [[-33, 25], [-27, 34], [-20, 23], [-15, 35], [-9, 32], [-34, 35], [-11, 22]] as [number, number][]) {
    stump(s, x, height(x, z), z, rand);
    colliders.push({ x, z, r: 0.6 });
  }
  /* A thicket across the valley, so the fallen trunk really does close the track. */
  for (let x = -66; x <= 66; x += 3.2) {
    if (Math.abs(x - -1) < 5) {
      continue;
    }
    const z = -25 + Math.sin(x * 0.4) * 1.1;
    const y = height(x, z);
    bush(s, x, y, z, 1.6 + rand() * 0.5, rand);
    if (rand() < 0.5) {
      roundTree(s, x + 0.8, y, z + 1.2, 1.3, rand);
    }
    colliders.push({ x, z, r: 1.9 });
  }
  /* The hornbill's perch, the big roost tree and the ledge. */
  {
    const [bx, bz] = spots.bird;
    tallTree(s, bx - 1.3, height(bx - 1.3, bz), bz + 0.4, 1.1, rand, 0);
    colliders.push({ x: bx - 1.3, z: bz + 0.4, r: 0.8 });
    const { solid } = s.cell(bx, bz);
    solid.tube([bx - 1.3, height(bx, bz) + 2.6, bz + 0.4], [bx + 1.2, height(bx, bz) + 2.9, bz + 0.2], 0.14, 0.08, '#7d5a3c', 6, false);
  }
  {
    const [nx, nz] = spots.roost;
    const y = height(nx, nz);
    tallTree(s, nx, y, nz, 1.75, rand, 1);
    colliders.push({ x: nx, z: nz, r: 1.2 });
    const { solid } = s.cell(nx, nz);
    solid.tube([nx, y + 5.7, nz], [nx + 1.6, y + 6.05, nz - 2.1], 0.16, 0.08, '#7d5a3c', 6, false);
  }
  /* The access lay-by. */
  for (const [x, z] of [[14, -41], [15, -47], [-5, -44]] as [number, number][]) {
    rock(s, x, height(x, z), z, 0.9, rand);
    colliders.push({ x, z, r: 0.8 });
  }

  const terrain = buildTerrain(r, {
    minX: -72,
    maxX: 72,
    minZ: -84,
    maxZ: 84,
    step: 2,
    height,
    color: (x, z, h, slope) => {
      const patch = Math.sin(x * 0.23 + z * 0.1) * 0.2 + Math.sin(z * 0.31 - x * 0.09) * 0.2;
      let c = groundColor(distToPath(x, z, FOREST_PATH), patch, slope);
      const d = Math.abs(z - creekZ(x));
      c = mix3(c, paint.sand, smooth(6.2, 4.6, d));
      c = mix3(c, paint.mud, smooth(4.2, 3.4, d));
      if (gapBox(x, z)) {
        c = mix3(c, paint.dirtDark, 0.55 * smooth(0, 4, Math.min(x + 38, -6 - x, z - 21, 38 - z)));
      }
      c = mix3(c, paint.dirtDark, smooth(1.5, 0.9, distToPath(x, z, channel)) * 0.8);
      c = mix3(c, paint.rock, smooth(1.2, 3.2, h - 2) * smooth(0.4, 1, slope));
      const edge = Math.max(Math.abs(x) / 64, Math.abs(z) / 76);
      return mix3(c, mix3(paint.grassDeep, paint.grass, 0.3 + patch), smooth(0.64, 0.8, edge));
    },
  });

  /* The stream, as a strip whose vertex colour marks the foam along its banks. */
  const w = new MeshBuilder();
  const stepX = 3;
  const lanes = 8;
  let rows = 0;
  for (let x = -74; x <= 74; x += stepX) {
    for (let k = 0; k <= lanes; k += 1) {
      const t = k / lanes;
      const z = creekZ(x) - 5.5 + t * 11;
      const dist = Math.abs(z - creekZ(x));
      const shore = smooth(3.1, 4.3, dist);
      w.rawVertex(x, FOREST_WATER_Y, z, 0, 1, 0, [shore * 0.95, 0, 0]);
    }
    rows += 1;
  }
  for (let j = 0; j < rows - 1; j += 1) {
    for (let k = 0; k < lanes; k += 1) {
      const a = j * (lanes + 1) + k;
      const c = a + lanes + 1;
      w.indices.push(a, a + 1, c, a + 1, c + 1, c);
    }
  }
  const water = r.mesh(w, false);
  const chunks = s.build(r);
  const cloudMesh = clouds(r, 7, 150);
  return {
    id: 'forest',
    geometry: { terrain, chunks, water },
    cloudMesh,
    env: DAY,
    height,
    colliders,
    walkable: (x, z) => height(x, z) > FOREST_WATER_Y + 0.15 && height(x, z) < 5 && Math.abs(x) < 64 && Math.abs(z) < 76,
    spots,
    perches: s.perches,
    flowers: s.flowers,
    waterY: FOREST_WATER_Y,
    meshes: [terrain, water, cloudMesh, ...chunks.flatMap((c) => [c.solid, c.soft].filter((m): m is Mesh => m !== null))],
  };
}

/** Pieces of Malaya Ridge that change as the mission goes on. */
export function buildForestProps(r: Renderer): Record<string, Mesh> {
  const props: Record<string, Mesh> = {};
  const make = (name: string, fn: (b: MeshBuilder) => void, outline = true): void => {
    const b = new MeshBuilder();
    fn(b);
    props[name] = r.mesh(b, outline);
  };
  make('log', (b) => {
    b.tube([-5.2, 0.55, 0.2], [4.8, 0.62, -0.3], 0.62, 0.5, '#8a6341', 9, true);
    b.disc(-5.2, 0, 0, 0.01, '#000000');
    b.tube([-2, 0.9, 0.1], [-2.9, 1.9, 0.5], 0.12, 0.06, '#8a6341', 5, false);
    b.tube([1.4, 0.9, -0.2], [2.1, 1.7, -0.7], 0.1, 0.05, '#8a6341', 5, false);
    b.ellipsoid(-3, 2.05, 0.55, 0.5, 0.36, 0.5, '#4faf52', { rows: 4, cols: 7 });
    b.ellipsoid(2.2, 1.85, -0.75, 0.48, 0.34, 0.48, '#6fc95c', { rows: 4, cols: 7 });
  });
  make('vineBridge', (b) => {
    for (let i = 0; i <= 12; i += 1) {
      const t = i / 12;
      const z = -5.8 + t * 11.6;
      const y = 0.32 - Math.sin(t * Math.PI) * 0.1;
      b.rbox(0, y, z, 3, 0.2, 0.9, i % 2 === 0 ? '#6fcf4f' : '#3fa144', 0.5);
    }
    for (const side of [-1.6, 1.6]) {
      b.tube([side, 1.1, -5.8], [side, 1, 5.8], 0.07, 0.07, '#3fa144', 6, false);
      b.tube([side, 0.2, -5.8], [side, 1.1, -5.8], 0.09, 0.09, '#2f8a3c', 6, false);
      b.tube([side, 0.2, 5.8], [side, 1, 5.8], 0.09, 0.09, '#2f8a3c', 6, false);
      for (let i = 1; i < 6; i += 1) {
        b.ellipsoid(side, 1.05, -5.8 + i * 1.95, 0.2, 0.1, 0.3, '#8bdc5e', { rows: 3, cols: 5 });
      }
    }
  });
  make('ropeBridge', (b) => {
    for (let i = 0; i <= 14; i += 1) {
      const t = i / 14;
      b.rbox(0, 0.32 - Math.sin(t * Math.PI) * 0.12, -5.8 + t * 11.6, 3, 0.1, 0.55, i % 2 === 0 ? '#c79a5c' : '#b48648', 0.4);
    }
    for (const side of [-1.6, 1.6]) {
      b.tube([side, 1.15, -5.8], [side, 1.05, 5.8], 0.045, 0.045, '#e8dcb8', 5, false);
      b.tube([side, 0, -5.8], [side, 1.3, -5.8], 0.12, 0.12, '#8a6341', 6, true);
      b.tube([side, 0, 5.8], [side, 1.3, 5.8], 0.12, 0.12, '#8a6341', 6, true);
    }
  });
  make('brokenBridge', (b) => {
    b.rbox(-0.2, 0.15, -5.4, 3.2, 0.2, 1.6, '#a07a4c', 0.4, 0.15);
    b.rbox(0.3, -0.1, -3.6, 2.6, 0.18, 1.1, '#94704a', 0.4, -0.5);
    b.rbox(0.2, 0.1, 5.3, 3.2, 0.2, 1.8, '#a07a4c', 0.4, -0.2);
    b.tube([-1.7, 0, -6], [-1.7, 1.2, -6], 0.12, 0.12, '#8a6341', 6, true);
    b.tube([1.7, 0, -6], [1.7, 1.2, -6], 0.12, 0.12, '#8a6341', 6, true);
    b.tube([-1.7, 0, 6], [-1.7, 1.2, 6], 0.12, 0.12, '#8a6341', 6, true);
    b.tube([1.7, 0, 6], [1.7, 1.2, 6], 0.12, 0.12, '#8a6341', 6, true);
  });
  make('tent', (b) => {
    b.quad([-3, 0, 2.4], [3, 0, 2.4], [0, 3, 2.4], [-3, 0, 2.4], '#ffc32d');
    b.quad([-3, 0, -2.4], [0, 3, -2.4], [3, 0, -2.4], [-3, 0, -2.4], '#ffc32d');
    b.quad([-3, 0, 2.4], [0, 3, 2.4], [0, 3, -2.4], [-3, 0, -2.4], '#f2f5f8');
    b.quad([3, 0, -2.4], [0, 3, -2.4], [0, 3, 2.4], [3, 0, 2.4], '#e2e8ef');
    b.rbox(0, 0.5, 0, 2, 0.1, 1.2, '#c79a5c', 0.3);
    b.tube([-0.8, 0, -0.5], [-0.8, 0.5, -0.5], 0.04, 0.04, '#7d5a3c', 4, false);
    b.tube([0.8, 0, 0.5], [0.8, 0.5, 0.5], 0.04, 0.04, '#7d5a3c', 4, false);
  });
  make('sign', (b) => {
    b.tube([0, 0, 0], [0, 1.3, 0], 0.07, 0.07, '#8a6341', 6, true);
    b.rbox(0, 1.45, 0, 1.1, 0.72, 0.09, '#ffc32d', 0.35);
    b.rbox(0, 1.45, 0.06, 0.9, 0.52, 0.02, '#fff7e0', 0.3);
    b.ball(0, 1.45, 0.08, 0.13, '#e2452f', 3, 7);
  });
  make('stake', (b) => {
    b.tube([0, 0, 0], [0, 1, 0], 0.05, 0.04, '#c79a5c', 5, true);
    b.ellipsoid(0, 0.9, 0, 0.14, 0.08, 0.03, '#ff8a1f', { rows: 3, cols: 6 });
    b.disc(0, 0.05, 0, 0.8, '#b58550', 12);
  }, true);
  make('sapling', (b) => {
    b.sway = 0.15;
    b.tube([0, 0, 0], [0, 1.1, 0], 0.05, 0.03, '#7d5a3c', 5, false);
    b.ellipsoid(0, 1.25, 0, 0.42, 0.34, 0.42, '#5ebf56', { rows: 5, cols: 7 });
    b.ellipsoid(0.15, 1.45, 0.1, 0.25, 0.2, 0.25, '#8bdc5e', { rows: 4, cols: 6 });
    b.sway = 0;
    b.disc(0, 0.04, 0, 0.55, '#6b4f30', 10);
  });
  make('generator', (b) => {
    b.rbox(0, 0.6, 0, 1.5, 1, 1, '#c8452e', 0.42);
    b.rbox(0, 1.1, 0, 1.2, 0.2, 0.8, '#3a3f4a', 0.4);
    b.tube([0.5, 1.2, 0.2], [0.5, 1.7, 0.2], 0.08, 0.08, '#3a3f4a', 6, false);
    b.ball(-0.4, 0.75, 0.53, 0.14, '#ffc32d', 3, 6);
  });
  make('wheel', (b) => {
    b.tube([0, 0, 0], [0, 1.2, 0], 0.12, 0.12, '#7d5a3c', 6, true);
    b.ellipsoid(0, 1.35, 0.1, 0.5, 0.5, 0.08, '#c8452e', { rows: 5, cols: 10 });
    b.ellipsoid(0, 1.35, 0.16, 0.2, 0.2, 0.08, '#ffc32d', { rows: 4, cols: 8 });
    for (const [x, z] of [[0, -1.2], [1, -0.9], [-1, -0.9], [1.3, 0.2], [-1.3, 0.2]] as [number, number][]) {
      b.tube([x, 0, z], [x, 0.9 + Math.abs(x) * 0.6, z], 0.1, 0.09, '#9ccf54', 6, true);
    }
  });
  make('channel', (b) => {
    const pts: [number, number][] = [[-22, 6], [-26, 14], [-23, 22], [-21, 30]];
    for (let i = 0; i < pts.length - 1; i += 1) {
      const [x1, z1] = pts[i];
      const [x2, z2] = pts[i + 1];
      const dx = x2 - x1;
      const dz = z2 - z1;
      const l = Math.hypot(dx, dz);
      const px = (-dz / l) * 0.7;
      const pz = (dx / l) * 0.7;
      const y1 = forestHeight(x1, z1) + 0.08;
      const y2 = forestHeight(x2, z2) + 0.08;
      b.quad([x1 - px, y1, z1 - pz], [x1 + px, y1, z1 + pz], [x2 + px, y2, z2 + pz], [x2 - px, y2, z2 - pz], '#4ec2ee');
    }
  }, false);
  make('carrier', (b) => {
    b.rbox(0, 0.32, 0, 0.9, 0.62, 0.62, '#3fa7c4', 0.35);
    b.rbox(0, 0.36, 0.3, 0.64, 0.3, 0.05, '#17304d', 0.3);
    b.tube([-0.2, 0.68, 0], [0.2, 0.68, 0], 0.03, 0.03, '#f2f5f8', 5, true);
  });
  make('beacon', (b) => {
    b.ellipsoid(0, 0.45, 0, 0.24, 0.45, 0.24, '#ffc32d', { rows: 4, cols: 4 });
  });
  make('ring', (b) => {
    for (let i = 0; i < 16; i += 1) {
      const a = (i / 16) * Math.PI * 2;
      b.ellipsoid(Math.cos(a), 0.05, Math.sin(a), 0.12, 0.04, 0.12, '#ffc32d', { rows: 2, cols: 5 });
    }
  }, false);
  make('crateKit', (b) => {
    b.rbox(0, 0.3, 0, 0.72, 0.6, 0.72, '#3fa7c4', 0.28);
    b.rbox(0, 0.3, 0, 0.75, 0.14, 0.75, '#f2f5f8', 0.24);
  });
  make('crateGreen', (b) => {
    b.rbox(0, 0.28, 0, 0.8, 0.56, 0.6, '#c79a5c', 0.28);
    for (const [x, z] of [[-0.2, -0.12], [0.2, 0.12], [0, -0.05]] as [number, number][]) {
      b.ellipsoid(x, 0.72, z, 0.2, 0.24, 0.2, '#5ebf56', { rows: 4, cols: 6 });
    }
  });
  return props;
}

/* ---- The Greenway Field Station ---- */

/** The patrol car's loop round the Command Center, outside every building. */
export const PATROL_RADIUS = 29;
const RING: [number, number][] = Array.from({ length: 25 }, (_, i) => [Math.sin((i / 24) * Math.PI * 2) * PATROL_RADIUS, Math.cos((i / 24) * Math.PI * 2) * PATROL_RADIUS] as [number, number]);

const STATION_PATHS: readonly (readonly (readonly [number, number])[])[] = [
  ...RING.slice(0, 24).map((p, i) => [p, RING[i + 1]] as const),
  [[0, 0], [0, 22]],
  [[0, 0], [16, 13]],
  [[0, 0], [22, -2]],
  [[0, 0], [14, -16]],
  [[0, 0], [0, -22]],
  [[0, 0], [-16, -14]],
  [[0, 0], [-22, 2]],
  [[0, 0], [-16, 16]],
];

export const stationHeight = (x: number, z: number): number => {
  const d = Math.hypot(x, z);
  const roll = 0.5 * Math.sin(x * 0.09) * Math.cos(z * 0.08);
  return roll * smooth(30, 42, d) + smooth(38, 62, d) * 14;
};

const roof = (b: MeshBuilder, x: number, y: number, z: number, w: number, d: number, h: number, color: string, ridge: string): void => {
  b.quad([x - w, y, z + d], [x + w, y, z + d], [x, y + h, z + d * 0.4], [x - w, y, z + d], color);
  b.quad([x + w, y, z - d], [x - w, y, z - d], [x, y + h, z - d * 0.4], [x + w, y, z - d], color);
  b.quad([x - w, y, z - d], [x - w, y, z + d], [x, y + h, z + d * 0.4], [x, y + h, z - d * 0.4], ridge);
  b.quad([x + w, y, z + d], [x + w, y, z - d], [x, y + h, z - d * 0.4], [x, y + h, z + d * 0.4], ridge);
};

export function buildStation(r: Renderer, upgrades: readonly string[]): Zone {
  const rand = seeded(4711);
  const s = new Scatter();
  const colliders: Collider[] = [];
  const height = stationHeight;
  const spots: Record<string, [number, number]> = {
    spawn: [0, 4],
    briefing: [0, 18.5],
    board: [13.5, 10.5],
    atlas: [18, -1.5],
    care: [11, -12.5],
    garden: [0, -18],
    workshop: [-12.5, -11],
    community: [-18, 1.5],
    tower: [-12.5, 12.5],
    gallery: [-5, -5],
    map: [5.5, 5],
    gate: [0, -30],
    navie: [-5.2, 7.6],
    ops: [-8.6, 14.2],
    progress: [8.6, 14.2],
    /* Side quests and the living parts of the Command Center. */
    weather: [-23, -6.4],
    notice: [4, -4.4],
    recycle: [-9, -4.8],
    sensor1: [24, 8],
    sensor2: [-10, -20.6],
    sensor3: [8, 21.8],
    litter1: [12, 4],
    litter2: [-15, 9.5],
    litter3: [6, -12],
    litter4: [-3, 14],
    patch1: [-21.6, -12.6],
    patch2: [-9, -27],
    patch3: [-8.4, -12.6],
    critter1: [9, -21.2],
    trophies: [-5, -9.4],
    decPlaza: [-11.8, 7.2],
    decCreek: [-20, 8.6],
    decVan: [24, -12],
    decNest: [18.5, 4.5],
  };
  const solidAt = (x: number, z: number): MeshBuilder => s.cell(x, z).solid;

  /* Ranger briefing: an open pavilion. */
  {
    const b = solidAt(0, 22);
    b.rbox(0, 0.2, 22, 9, 0.4, 7, '#e8d6ae', 0.25);
    for (const [x, z] of [[-4, 19], [4, 19], [-4, 25], [4, 25]] as [number, number][]) {
      b.tube([x, 0.3, z], [x, 3.4, z], 0.17, 0.15, '#8a6341', 7, false);
      colliders.push({ x, z, r: 0.5 });
    }
    roof(b, 0, 3.4, 22, 5.4, 4.2, 2.1, '#1464e8', '#0f52c9');
    /* Two posts carry the Command Center's name above the roof. */
    for (const x of [-4.2, 4.2]) {
      b.tube([x, 3.3, 17.75], [x, 5.5, 17.7], 0.09, 0.09, '#0f2a5c', 6, false);
    }
    b.rbox(0, 1, 23.5, 3.6, 0.2, 1.2, '#c79a5c', 0.3);
    b.tube([-1.2, 0.4, 23.5], [-1.2, 1, 23.5], 0.06, 0.06, '#7d5a3c', 4, false);
    b.tube([1.2, 0.4, 23.5], [1.2, 1, 23.5], 0.06, 0.06, '#7d5a3c', 4, false);
  }
  /* Navie's Mission Station: a kiosk whose screen shows Navie. */
  {
    const b = solidAt(-6.6, 9.6);
    b.rbox(-6.6, 0.55, 9.6, 2.2, 1.1, 1.4, '#1e5bb8', 0.35, 2.6);
    b.rbox(-6.6, 1.3, 9.6, 0.45, 0.9, 0.36, '#d8dde5', 0.2, 2.6);
    b.rbox(-6.6, 3.05, 9.6, 3.2, 2.5, 0.3, '#17304d', 0.25, 2.6);
    b.rbox(-6.6, 4.45, 9.6, 3.3, 0.3, 0.4, '#ffc32d', 0.2, 2.6);
    colliders.push({ x: -6.6, z: 9.6, r: 1.5 });
  }
  /* The NLEX Operations Board and the Environmental Progress screen, either side of the pavilion. */
  for (const [x, yaw] of [[-9.6, 2.6], [9.6, -2.6]] as [number, number][]) {
    const b = solidAt(x, 16);
    const z = 16;
    const side = Math.sign(x);
    b.tube([x - 2.3 * Math.cos(yaw) * side, 0, z + 2.3 * Math.sin(yaw) * side], [x - 2.3 * Math.cos(yaw) * side, 4.6, z + 2.3 * Math.sin(yaw) * side], 0.15, 0.15, '#d8dde5', 6, false);
    b.tube([x + 2.3 * Math.cos(yaw) * side, 0, z - 2.3 * Math.sin(yaw) * side], [x + 2.3 * Math.cos(yaw) * side, 4.6, z - 2.3 * Math.sin(yaw) * side], 0.15, 0.15, '#d8dde5', 6, false);
    b.rbox(x, 3.1, z, 5.4, 3.1, 0.3, '#17304d', 0.25, yaw);
    b.rbox(x, 4.75, z, 5.6, 0.3, 0.45, side < 0 ? '#1464e8' : '#2fae6b', 0.2, yaw);
    colliders.push({ x, z, r: 2.6 });
  }
  if (upgrades.includes('lanes')) {
    /* A working model of the plaza's lane signals, beside the Operations Board. */
    const b = solidAt(-13.4, 12.6);
    b.tube([-13.4, 0, 12.6], [-13.4, 2.6, 12.6], 0.08, 0.08, '#8b98ad', 5, false);
    b.rbox(-13.4, 2.9, 12.6, 2.6, 0.7, 0.4, '#20252f', 0.2, 2.6);
    for (let k = 0; k < 6; k += 1) {
      const t = -1.05 + k * 0.42;
      b.rbox(-13.4 + Math.cos(2.6) * t, 2.9, 12.6 - Math.sin(2.6) * t, 0.3, 0.42, 0.5, k === 3 ? '#e2452f' : '#14c46b', 0.15, 2.6);
    }
    colliders.push({ x: -13.4, z: 12.6, r: 0.6 });
  }
  if (upgrades.includes('charger')) {
    const b = solidAt(5, -24);
    b.rbox(5, 0.9, -24, 0.9, 1.8, 0.6, '#2fae6b', 0.3);
    b.rbox(5, 1.3, -23.68, 0.5, 0.4, 0.06, '#eafff2', 0.15);
    colliders.push({ x: 5, z: -24, r: 0.7 });
  }
  /* The transport-planning board: the Eco Dispatch Station. */
  {
    const b = solidAt(16, 13);
    b.tube([14.4, 0, 12.2], [14.4, 3.6, 12.2], 0.14, 0.14, '#7d5a3c', 6, false);
    b.tube([17.6, 0, 14.8], [17.6, 3.6, 14.8], 0.14, 0.14, '#7d5a3c', 6, false);
    b.rbox(16, 2.5, 13.5, 4.4, 2.4, 0.2, '#17304d', 0.25, -0.68);
    b.rbox(15.95, 2.5, 13.42, 3.9, 1.9, 0.08, '#dfeefc', 0.2, -0.68);
    b.tube([14.5, 2, 12.15], [17.4, 3, 14.7], 0.05, 0.05, '#1464e8', 4, false);
    b.tube([14.6, 2.9, 12.2], [17.4, 2.3, 14.6], 0.05, 0.05, '#e2452f', 4, false);
    colliders.push({ x: 16, z: 13.5, r: 2.4 });
  }
  /* The Living Wildlife Atlas: a round hut with a globe. */
  {
    const b = solidAt(22, -2);
    b.tube([22, 0, -2], [22, 3, -2], 3.6, 3.4, '#fff0d4', 16, false);
    b.cone(22, 3, -2, 4.3, 2.4, '#2fae6b', 16, '#1f8a52');
    b.ball(22, 6.1, -2, 1, '#3fa9f5', 8, 12);
    b.ellipsoid(22.3, 6.3, -1.4, 0.5, 0.42, 0.3, '#6fcf4f', { rows: 4, cols: 6 });
    b.ellipsoid(21.6, 5.9, -2.6, 0.42, 0.36, 0.3, '#6fcf4f', { rows: 4, cols: 6 });
    b.rbox(18.6, 1, -1.8, 0.2, 2, 1.5, '#8a6341', 0.3);
    colliders.push({ x: 22, z: -2, r: 4 });
  }
  /* Temporary specialist care: a quiet white building with a paw sign. */
  {
    const b = solidAt(14, -16);
    b.rbox(14, 1.5, -16, 7, 3, 5.4, '#f7fafc', 0.32, 0.5);
    roof(b, 14, 2.9, -16, 3.9, 3.2, 1.3, '#3fa7c4', '#2a8aa6');
    b.ball(11.6, 2.2, -12.9, 0.42, '#e2452f', 4, 8);
    colliders.push({ x: 14, z: -16, r: 4.6 });
  }
  /* Native demonstration garden. */
  {
    const b = solidAt(0, -24);
    for (let i = 0; i < 4; i += 1) {
      const x = -6 + i * 4;
      b.rbox(x, 0.25, -24, 3, 0.5, 5, '#8a6341', 0.3);
      b.rbox(x, 0.5, -24, 2.7, 0.14, 4.7, '#5a3f28', 0.2);
      for (let k = 0; k < 4; k += 1) {
        const z = -26 + k * 1.3;
        b.sway = 0.1;
        b.ellipsoid(x + (k % 2 === 0 ? -0.5 : 0.5), 0.95, z, 0.5, 0.42, 0.5, k % 2 === 0 ? '#5ebf56' : '#3f9f4d', { rows: 4, cols: 6 });
        b.ball(x + (k % 2 === 0 ? -0.5 : 0.5), 1.4, z, 0.13, ['#ffd24a', '#ff8fb5', '#ff9d3c'][k % 3], 3, 5);
        s.flowers.push([x + (k % 2 === 0 ? -0.5 : 0.5), 1.5, z]);
        b.sway = 0;
      }
      colliders.push({ x, z: -24, r: 2.2 });
    }
    if (upgrades.includes('garden')) {
      for (let k = 0; k < 8; k += 1) {
        const x = -9 + k * 2.6;
        b.rbox(x, 0.15, -19.5, 1.8, 0.3, 1.1, '#8a6341', 0.3);
        b.ball(x, 0.6, -19.5, 0.32, ['#ffd24a', '#ff8fb5', '#b98cff'][k % 3], 4, 6);
      }
    }
  }
  /* Restoration workshop. */
  {
    const b = solidAt(-16, -14);
    b.rbox(-16, 1.7, -14, 7, 3.4, 5.4, '#f0a24a', 0.3, -0.6);
    roof(b, -16, 3.3, -14, 4, 3.3, 1.3, '#8a4a22', '#6f3a1a');
    b.rbox(-13.8, 1.2, -11.3, 2.2, 2.2, 0.1, '#5a3f28', 0.2, -0.6);
    for (const [x, z] of [[-11, -9], [-10, -11]] as [number, number][]) {
      b.rbox(x, 0.34, z, 0.8, 0.66, 0.8, '#c79a5c', 0.28);
      colliders.push({ x, z, r: 0.6 });
    }
    if (upgrades.includes('solar')) {
      b.rbox(-16, 4.7, -14, 3.8, 0.12, 2.6, '#2b6fd6', 0.2, -0.6);
    }
    colliders.push({ x: -16, z: -14, r: 4.8 });
  }
  /* Community meeting space. */
  {
    const b = solidAt(-22, 2);
    b.rbox(-22, 0.15, 2, 8, 0.3, 8, '#e8d6ae', 0.2);
    for (const [x, z] of [[-25, -1], [-19, -1], [-25, 5], [-19, 5]] as [number, number][]) {
      b.tube([x, 0.2, z], [x, 3, z], 0.15, 0.13, '#8a6341', 6, false);
      colliders.push({ x, z, r: 0.45 });
    }
    roof(b, -22, 3, 2, 4.6, 4.4, 2, '#c8452e', '#a83622');
    for (let i = 0; i < 3; i += 1) {
      b.rbox(-24 + i * 2, 0.55, 2, 0.5, 0.5, 2.4, '#c79a5c', 0.3);
    }
  }
  /* Observation tower. */
  {
    const b = solidAt(-16, 16);
    for (const [x, z] of [[-17.6, 14.4], [-14.4, 14.4], [-17.6, 17.6], [-14.4, 17.6]] as [number, number][]) {
      b.tube([x, 0, z], [x, 6.2, z], 0.16, 0.14, '#8a6341', 6, false);
      colliders.push({ x, z, r: 0.45 });
    }
    b.rbox(-16, 6.3, 16, 5, 0.3, 5, '#c79a5c', 0.25);
    roof(b, -16, 7.8, 16, 3, 3, 1.2, '#2fae6b', '#1f8a52');
    for (const [x, z] of [[-18.2, 13.8], [-13.8, 13.8], [-18.2, 18.2], [-13.8, 18.2]] as [number, number][]) {
      b.tube([x, 6.3, z], [x, 7.9, z], 0.06, 0.06, '#7d5a3c', 4, false);
    }
    if (upgrades.includes('scope')) {
      b.tube([-15, 7, 14.4], [-14, 7.4, 13.4], 0.13, 0.17, '#17304d', 7, true);
    }
  }
  /* The gallery of finished missions. */
  {
    const b = solidAt(-5, -7);
    b.tube([-7, 0, -7], [-7, 2.4, -7], 0.1, 0.1, '#7d5a3c', 5, false);
    b.tube([-3, 0, -7], [-3, 2.4, -7], 0.1, 0.1, '#7d5a3c', 5, false);
    b.rbox(-5, 1.7, -7, 4.4, 1.4, 0.16, '#fff0d4', 0.25);
    b.rbox(-6.1, 1.7, -6.9, 1.2, 0.9, 0.04, '#7fd0ff', 0.2);
    b.rbox(-3.9, 1.7, -6.9, 1.2, 0.9, 0.04, '#ffe07f', 0.2);
    colliders.push({ x: -5, z: -7, r: 2.2 });
  }
  /* The world map signpost. */
  {
    const b = solidAt(6, 7);
    b.tube([6, 0, 7], [6, 3, 7], 0.11, 0.1, '#7d5a3c', 5, false);
    b.rbox(6.5, 2.6, 7, 2, 0.5, 0.1, '#ffc32d', 0.3);
    b.rbox(5.5, 2, 7, 2, 0.5, 0.1, '#7fd0ff', 0.3);
    colliders.push({ x: 6, z: 7, r: 0.6 });
  }
  if (upgrades.includes('bunting')) {
    const b = solidAt(0, 0);
    b.tube([-10, 4, 8], [10, 4, 8], 0.02, 0.02, '#ffffff', 4, false);
    for (let i = 0; i < 11; i += 1) {
      const x = -10 + i * 2;
      b.quad([x - 0.4, 3.95, 8], [x, 3.25, 8], [x + 0.4, 3.95, 8], [x - 0.4, 3.95, 8], ['#e2452f', '#ffc32d', '#1464e8', '#2ead5b'][i % 4]);
      b.quad([x + 0.4, 3.95, 8], [x, 3.25, 8], [x - 0.4, 3.95, 8], [x + 0.4, 3.95, 8], ['#e2452f', '#ffc32d', '#1464e8', '#2ead5b'][i % 4]);
    }
    for (const x of [-10, 10]) {
      b.tube([x, 0, 8], [x, 4, 8], 0.07, 0.07, '#7d5a3c', 5, false);
      colliders.push({ x, z: 8, r: 0.3 });
    }
  }

  /* The weather station, the notice board, the recycling bin and the air-quality sensor posts. */
  {
    const b = solidAt(-25, -8);
    b.tube([-25, 0, -8], [-25, 4.2, -8], 0.1, 0.08, '#8b98ad', 6, false);
    b.rbox(-25, 1.2, -8, 0.9, 1, 0.6, '#f4f6f8', 0.2);
    b.rbox(-24.4, 2.2, -8, 1, 0.06, 0.7, '#2b4f9e', 0.05);
    b.tube([-25, 3.4, -8], [-24.1, 3.4, -8], 0.03, 0.03, '#8b98ad', 4, false);
    b.cone(-23.9, 3.25, -8, 0.12, 0.35, '#ffc32d', 6);
    colliders.push({ x: -25, z: -8, r: 0.7 });
    const n = solidAt(4, -7);
    n.tube([2.6, 0, -6.8], [2.6, 2.4, -6.8], 0.08, 0.08, '#7d5a3c', 5, false);
    n.tube([5.4, 0, -6.8], [5.4, 2.4, -6.8], 0.08, 0.08, '#7d5a3c', 5, false);
    n.rbox(4, 1.75, -6.8, 3.2, 1.3, 0.14, '#8a6341', 0.2);
    n.rbox(4, 1.75, -6.72, 2.9, 1.05, 0.04, '#f6ecd6', 0.1);
    for (const [x, y, c] of [[3, 1.95, '#ffd24a'], [4.1, 1.6, '#7fd0ff'], [5.1, 1.9, '#ff8fb5']] as [number, number, string][]) {
      n.rbox(x, y, -6.68, 0.7, 0.5, 0.02, c, 0.05);
    }
    colliders.push({ x: 4, z: -6.8, r: 1.4 });
    const bin = solidAt(-9, -6.6);
    bin.rbox(-9, 0.6, -6.6, 1.2, 1.2, 1, '#2b6fd6', 0.3);
    bin.rbox(-9, 1.26, -6.6, 1.3, 0.14, 1.1, '#1e5bb8', 0.2);
    colliders.push({ x: -9, z: -6.6, r: 0.7 });
    for (const [x, z] of [[25.2, 8.8], [-11, -21.6], [9, 22.8]] as [number, number][]) {
      const p = solidAt(x, z);
      p.tube([x, 0, z], [x, 1.4, z], 0.06, 0.06, '#8b98ad', 5, false);
      p.rbox(x, 1.45, z, 0.4, 0.3, 0.3, '#f4f6f8', 0.15);
      colliders.push({ x, z, r: 0.4 });
    }
  }

  /* The forest all round, and a fence at the station's edge. */
  const nearAnyPath = (x: number, z: number): number => Math.min(...STATION_PATHS.map((p) => nearLine(x, z, p[0], p[1])));
  for (let i = 0; i < 1100; i += 1) {
    const a = rand() * 6.28;
    const d = 31.5 + rand() * 45;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    /* Leave the gate and the parked maintenance vehicles clear. */
    if (Math.abs(x) < 11 && z < -27 && z > -42) {
      continue;
    }
    const y = height(x, z);
    const scale = 0.85 + rand() * 0.5;
    const k = rand();
    if (i > 230) {
      break;
    }
    if (k < 0.6) {
      tallTree(s, x, y, z, scale, rand, Math.floor(rand() * 3));
    } else if (k < 0.82) {
      roundTree(s, x, y, z, scale * 1.2, rand);
    } else {
      palm(s, x, y, z, scale, rand);
    }
    colliders.push({ x, z, r: 0.7 });
  }
  for (let i = 0; i < 520; i += 1) {
    const x = -38 + rand() * 76;
    const z = -38 + rand() * 76;
    if (nearAnyPath(x, z) < 2.4 || Math.hypot(x, z) < 6 || Math.hypot(x, z) > 38) {
      continue;
    }
    if (colliders.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + 1.2)) {
      continue;
    }
    const y = height(x, z);
    const k = rand();
    if (k < 0.06) {
      roundTree(s, x, y, z, 1.05, rand);
      colliders.push({ x, z, r: 0.5 });
    } else if (k < 0.15) {
      bush(s, x, y, z, 0.8, rand);
      colliders.push({ x, z, r: 0.7 });
    } else if (k < 0.6) {
      tuft(s, x, y, z, rand);
    } else {
      flower(s, x, y, z, rand);
    }
  }

  const terrain = buildTerrain(r, {
    minX: -80,
    maxX: 80,
    minZ: -80,
    maxZ: 80,
    step: 2,
    height,
    color: (x, z, _h, slope) => {
      const patch = Math.sin(x * 0.2 + z * 0.13) * 0.2 + Math.sin(z * 0.27 - x * 0.08) * 0.2;
      const d = Math.min(nearAnyPath(x, z), Math.hypot(x, z) < 7 ? 0 : 9);
      const c = groundColor(d, patch, slope);
      return mix3(c, paint.plaza, smooth(8, 5.5, Math.hypot(x, z)));
    },
  });
  const chunks = s.build(r);
  const cloudMesh = clouds(r, 21, 150);
  /* The pictures face out of the screens, towards the plaza. */
  const screen = (key: string, x: number, zz: number, yaw: number): ZoneImage => ({ key, x: x + Math.sin(yaw) * 0.17, y: 3.1, z: zz + Math.cos(yaw) * 0.17, yaw, w: 5, h: 2.75 });
  const images: ZoneImage[] = [
    { key: 'navieScreen', x: -6.6 + Math.sin(2.6) * 0.17, y: 3.05, z: 9.6 + Math.cos(2.6) * 0.17, yaw: 2.6, w: 2.95, h: 2.25 },
    screen('opsScreen', -9.6, 16, 2.6),
    screen('progressScreen', 9.6, 16, -2.6),
    { key: 'centerSign', x: 0, y: 5.9, z: 17.55, yaw: Math.PI, w: 9.4, h: 1.15 },
  ];
  return {
    id: 'station',
    images,
    geometry: { terrain, chunks, water: null },
    cloudMesh,
    env: DAY,
    height,
    colliders,
    walkable: (x, z) => Math.hypot(x, z) < 37,
    spots,
    perches: s.perches,
    flowers: s.flowers,
    waterY: null,
    meshes: [terrain, cloudMesh, ...chunks.flatMap((c) => [c.solid, c.soft].filter((m): m is Mesh => m !== null))],
  };
}
