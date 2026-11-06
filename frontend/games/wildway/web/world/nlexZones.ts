import { MeshBuilder } from '../gl/builder';
import { hex, seeded, smooth } from '../gl/math';
import type { Mesh, Renderer } from '../gl/renderer';
import { buildTerrain, bush, clouds, flower, groundColor, mix3, palm, paint, roundTree, Scatter, tallTree, tuft, type Collider } from './scenery';
import { DAY, type Zone, type ZoneImage } from './zones';

/**
 * The three NLEX mission places. All three are made-up versions: a toll plaza, a
 * barangay creek and a maintenance depot. They are built from the same kit as Malaya
 * Ridge, so they share its look. Heroes never walk on the toll lanes: they use the
 * service walkways and a staff tunnel.
 */

const asphalt = hex('#5d6473');
const asphaltDark = hex('#4b5160');
const concrete = hex('#c9ccd2');
const yardPaint = hex('#b9bdc4');

/** Rows of circles along a rectangle, so buildings block like boxes. */
function boxColliders(colliders: Collider[], x0: number, z0: number, x1: number, z1: number, r = 1.3): void {
  const nx = Math.max(1, Math.ceil((x1 - x0) / (r * 1.4)));
  const nz = Math.max(1, Math.ceil((z1 - z0) / (r * 1.4)));
  for (let i = 0; i <= nx; i += 1) {
    for (let j = 0; j <= nz; j += 1) {
      colliders.push({ x: x0 + ((x1 - x0) * i) / nx, z: z0 + ((z1 - z0) * j) / nz, r });
    }
  }
}

const roofPitched = (b: MeshBuilder, x: number, y: number, z: number, w: number, d: number, h: number, color: string, ridge: string): void => {
  b.quad([x - w, y, z + d], [x + w, y, z + d], [x, y + h, z + d * 0.4], [x - w, y, z + d], color);
  b.quad([x + w, y, z - d], [x - w, y, z - d], [x, y + h, z - d * 0.4], [x + w, y, z - d], color);
  b.quad([x - w, y, z - d], [x - w, y, z + d], [x, y + h, z + d * 0.4], [x, y + h, z - d * 0.4], ridge);
  b.quad([x + w, y, z + d], [x + w, y, z - d], [x, y + h, z - d * 0.4], [x, y + h, z + d * 0.4], ridge);
};

function house(b: MeshBuilder, x: number, z: number, w: number, d: number, wall: string, roofColor: string, facing: 1 | -1): void {
  b.rbox(x, 1.4, z, w, 2.8, d, wall, 0.25);
  roofPitched(b, x, 2.7, z, w / 2 + 0.4, d / 2 + 0.4, 1.4, roofColor, roofColor);
  b.rbox(x, 0.95, z + (facing * d) / 2, 0.9, 1.7, 0.08, '#6b4a2f', 0.2);
  b.rbox(x - w / 4, 1.7, z + (facing * d) / 2, 0.9, 0.7, 0.08, '#9fd6f2', 0.2);
}

/* ---- The Great NLEX Gridlock: a toll plaza ---- */

export const PLAZA_LANE_X: readonly number[] = [-12.5, -7.5, -2.5, 2.5, 7.5, 12.5];
const PLAZA_ISLANDS = [-15, -10, -5, 0, 5, 10, 15];

export function buildPlaza(r: Renderer): Zone {
  const rand = seeded(3301);
  const s = new Scatter();
  const colliders: Collider[] = [];
  const height = (x: number, z: number): number => {
    const ax = Math.abs(x);
    return smooth(36, 52, ax) * 6 + smooth(62, 80, Math.abs(z)) * 4 + 0.15 * Math.sin(x * 0.2) * smooth(18, 24, ax) * (1 - smooth(30, 36, ax));
  };
  const spots: Record<string, [number, number]> = {
    spawn: [26, -26],
    overlook: [25.5, -9.5],
    console: [21.6, 9],
    signal: [-19.6, -4],
    cable: [19.6, 3.2],
    jammer: [19.6, -2.2],
    tunnelW: [-19.8, 19],
    tunnelE: [19.8, 19],
    faults: [19.6, 0],
    /* The toll sensor at lane 1's entry, reached from the west walkway. */
    sensor: [-19.6, -8.6],
    /* The service shed with the spare power cells, and the control-room door. */
    cell: [28, 2.6],
    door: [21.4, 9],
    clueTyres: [27, -21],
    clueFlyer: [-24.5, 11],
    patch1: [-20.6, 3.2],
    patch2: [21.2, -15],
    patch3: [-21.4, -17],
    critter1: [25.5, 14.2],
    staff: [23.5, -13.5],
  };
  /* Islands and booths between the lanes. */
  for (const x of PLAZA_ISLANDS) {
    const b = s.cell(x, 0).solid;
    b.rbox(x, 0.18, 0, 1.6, 0.36, 10, '#ffd54a', 0.25);
    b.rbox(x, 0.2, 0, 1.2, 0.42, 9.6, '#e8eaee', 0.3);
    if (Math.abs(x) < 15.5) {
      b.rbox(x, 1.45, -1.2, 1.25, 2.3, 2.2, '#f4f6f8', 0.3);
      b.rbox(x, 1.75, -1.2, 1.32, 0.8, 1.9, '#9fd6f2', 0.25);
      b.rbox(x, 2.7, -1.2, 1.5, 0.22, 2.5, '#1e5bb8', 0.25);
    }
    for (const z of [-3.6, 3.6]) {
      b.tube([x, 0.3, z], [x, 6.4, z], 0.28, 0.26, '#d8dde5', 8, false);
    }
  }
  /* The canopy, with its signal housings over each lane. */
  {
    const b = s.cell(0, 0).solid;
    b.rbox(0, 6.85, 0, 36, 0.9, 9.4, '#1e5bb8', 0.25);
    b.rbox(0, 6.45, -4.75, 36, 0.4, 0.14, '#ffc32d', 0.15);
    b.rbox(0, 6.45, 4.75, 36, 0.4, 0.14, '#ffc32d', 0.15);
    for (const x of PLAZA_LANE_X) {
      b.rbox(x, 5.85, -4.75, 1.3, 0.75, 0.4, '#20252f', 0.2);
    }
    /* A service ladder up the outer west pillar. */
    for (const dx of [-0.35, 0.35]) {
      b.tube([-17.4 + dx, 0, -3.6], [-17.4 + dx, 6.3, -3.6], 0.06, 0.06, '#8b98ad', 5, false);
    }
    for (let i = 0; i < 12; i += 1) {
      b.tube([-17.75, 0.4 + i * 0.5, -3.6], [-17.05, 0.4 + i * 0.5, -3.6], 0.04, 0.04, '#8b98ad', 4, false);
    }
  }
  /* Lane markings: soft, so they stay crisp without outlines. */
  {
    for (let z = -78; z < 78; z += 6) {
      if (Math.abs(z) < 7) {
        continue;
      }
      for (const x of [-10, -5, 0, 5, 10]) {
        s.cell(x, z).soft.rbox(x, 0.03, z, 0.22, 0.04, 3, '#f2f2ee', 0.1);
      }
      for (const x of [-16.6, 16.6]) {
        s.cell(x, z).soft.rbox(x, 0.03, z, 0.22, 0.04, 6, '#ffd54a', 0.1);
      }
    }
  }
  /* Concrete barriers between the lanes and the service areas, with the tunnel doors in them. */
  for (const side of [-1, 1]) {
    const b = s.cell(side * 17.4, 0).solid;
    for (let z = -60; z <= 60; z += 4) {
      if (Math.abs(z) < 6) {
        continue;
      }
      b.rbox(side * 17.4, 0.45, z, 0.6, 0.9, 3.8, '#d2d6dc', 0.3);
    }
    /* Well north of the control room, so there is a wide path between them. */
    const tb = s.cell(side * 21, 19).solid;
    tb.rbox(side * 21.3, 1.3, 19, 3.4, 2.6, 3, '#aeb4bd', 0.25);
    tb.rbox(side * 19.55, 1.05, 19, 0.08, 2, 1.5, '#2b303a', 0.15);
    tb.rbox(side * 21.3, 2.75, 19, 3.6, 0.3, 3.2, '#1e5bb8', 0.2);
    colliders.push({ x: side * 21.6, z: 19, r: 1.6 });
  }
  /* Control room. */
  {
    const b = s.cell(25, 9).solid;
    b.rbox(25.5, 2, 9, 7, 4, 6, '#f2f5f8', 0.3);
    b.rbox(25.5, 4.2, 9, 7.6, 0.4, 6.6, '#1e5bb8', 0.25);
    b.rbox(21.95, 1.15, 9, 0.08, 2.1, 1.3, '#3d5a80', 0.15);
    b.rbox(21.95, 2.6, 7, 0.08, 1, 2.4, '#9fd6f2', 0.15);
    b.rbox(21.95, 2.6, 11, 0.08, 1, 2.4, '#9fd6f2', 0.15);
    b.tube([27, 4.4, 10], [27, 6.4, 10], 0.05, 0.05, '#8b98ad', 4, false);
    boxColliders(colliders, 22.5, 6.4, 28.5, 11.6);
  }
  /* Overlook tower. */
  {
    const b = s.cell(27, -9).solid;
    for (const [x, z] of [[26, -11], [29, -11], [26, -8], [29, -8]] as [number, number][]) {
      b.tube([x, 0, z], [x, 5.4, z], 0.14, 0.13, '#8b98ad', 6, false);
      colliders.push({ x, z, r: 0.45 });
    }
    b.rbox(27.5, 5.5, -9.5, 4, 0.25, 4, '#d8dde5', 0.2);
    b.rbox(27.5, 6.1, -11.4, 4, 0.9, 0.1, '#ffc32d', 0.15);
    for (let i = 0; i < 9; i += 1) {
      b.rbox(26.6 - 0.05 * i, 0.3 + i * 0.6, -7.2 + i * 0.12, 0.9, 0.12, 0.45, '#aeb4bd', 0.1);
    }
  }
  /* The junction box, by the east side of the booths. */
  {
    const b = s.cell(20, 3).solid;
    b.rbox(20.6, 0.85, 3.2, 0.9, 1.7, 0.7, '#8b98ad', 0.2);
    b.rbox(20.6, 1.5, 2.83, 0.6, 0.3, 0.05, '#ffc32d', 0.1);
    colliders.push({ x: 20.6, z: 3.2, r: 0.7 });
  }
  /* The service shed, east, with spare power cells. */
  {
    const b = s.cell(30, 3).solid;
    b.rbox(30.6, 1.3, 2.6, 2.6, 2.6, 3, '#aeb4bd', 0.25);
    b.rbox(30.6, 2.75, 2.6, 2.9, 0.25, 3.3, '#1e5bb8', 0.2);
    b.rbox(29.28, 1.05, 2.6, 0.08, 2, 1.5, '#2b303a', 0.15);
    colliders.push({ x: 30.6, z: 2.6, r: 1.6 });
  }
  /* A traffic counter cabinet on the west walkway, and a drain grate on the east. */
  {
    const b = s.cell(-22, -17).solid;
    b.rbox(-22.6, 0.75, -17, 0.8, 1.5, 0.6, '#d8dde5', 0.2);
    b.rbox(-22.18, 1.1, -17, 0.05, 0.4, 0.4, '#20252f', 0.1);
    colliders.push({ x: -22.6, z: -17, r: 0.6 });
    s.cell(22, -15).soft.rbox(22.4, 0.03, -15, 1.2, 0.04, 0.8, '#3d4350', 0.05);
    /* The toll sensor post on the barrier at lane 1. */
    const p = s.cell(-17.4, -8.6).solid;
    p.tube([-17.6, 0.9, -8.6], [-17.6, 2.2, -8.6], 0.07, 0.07, '#8b98ad', 5, false);
  }
  /* A service road, palms and the embankments beyond. */
  for (let i = 0; i < 260; i += 1) {
    const side = rand() < 0.5 ? -1 : 1;
    const x = side * (31 + rand() * 26);
    const z = -78 + rand() * 156;
    const y = height(x, z);
    const k = rand();
    if (k < 0.35) {
      tallTree(s, x, y, z, 0.8 + rand() * 0.5, rand, Math.floor(rand() * 3));
    } else if (k < 0.55) {
      roundTree(s, x, y, z, 1 + rand() * 0.4, rand);
    } else if (k < 0.7) {
      palm(s, x, y, z, 0.9 + rand() * 0.3, rand);
    } else if (k < 0.85) {
      bush(s, x, y, z, 0.9, rand);
    } else {
      tuft(s, x, y, z, rand);
    }
  }
  for (const [x, z] of [[-24, -20], [-26, 4], [-24, 26], [30, -2], [30, 22], [-30, -36]] as [number, number][]) {
    palm(s, x, height(x, z), z, 0.95, rand);
    colliders.push({ x, z, r: 0.5 });
  }
  for (let i = 0; i < 160; i += 1) {
    const side = rand() < 0.5 ? -1 : 1;
    const x = side * (18.5 + rand() * 13);
    const z = -58 + rand() * 116;
    if (Math.abs(x - 25) < 5 && Math.abs(z) < 14) {
      continue;
    }
    if (rand() < 0.6) {
      tuft(s, x, height(x, z), z, rand);
    } else {
      flower(s, x, height(x, z), z, rand);
    }
  }
  const terrain = buildTerrain(r, {
    minX: -64,
    maxX: 64,
    minZ: -84,
    maxZ: 84,
    step: 2,
    height,
    color: (x, z, _h, slope) => {
      const ax = Math.abs(x);
      if (ax < 16.8) {
        return Math.abs(z) < 5.2 ? concrete : (Math.floor(z / 9) & 1) === 0 ? asphalt : asphaltDark;
      }
      if (ax < 18.2) {
        return concrete;
      }
      const patch = Math.sin(x * 0.2 + z * 0.13) * 0.2 + Math.sin(z * 0.27 - x * 0.08) * 0.2;
      const road = Math.abs(ax - 24) < 2.4 ? 0 : 9;
      return groundColor(road, patch, slope);
    },
  });
  const chunks = s.build(r);
  const cloudMesh = clouds(r, 33, 150);
  const images: ZoneImage[] = [{ key: 'plazaSign', x: 0, y: 7.05, z: -4.85, yaw: Math.PI, w: 9, h: 0.9 }];
  return {
    id: 'plaza',
    geometry: { terrain, chunks, water: null },
    cloudMesh,
    env: DAY,
    height,
    colliders,
    walkable: (x, z) => Math.abs(x) > 17.9 && Math.abs(x) < 33 && Math.abs(z) < 58,
    spots,
    waterY: null,
    images,
    meshes: [terrain, cloudMesh, ...chunks.flatMap((c) => [c.solid, c.soft].filter((m): m is Mesh => m !== null))],
  };
}

/* ---- River Rescue: a barangay creek ---- */

export const riverZ = (x: number): number => 1.6 * Math.sin(x * 0.06);
const RIVER_WATER_Y = -0.9;
export const RIVER_BRIDGE = { x: 4, halfWidth: 1.4, halfLength: 5.4, deck: 0.45 };

export const riverHeight = (x: number, z: number): number => {
  const d = Math.abs(z - riverZ(x));
  let h = 0.35 + 0.15 * Math.sin(x * 0.11) * Math.cos(z * 0.09);
  h += (-2 - h) * smooth(4.8, 2.6, d);
  h += smooth(28, 40, Math.abs(z)) * 5 + smooth(46, 58, Math.abs(x)) * 5;
  /* The road embankment over the culvert. */
  h += smooth(4.5, 2.5, Math.abs(x - 35)) * 1.4 * smooth(3.2, 4.6, d);
  return h;
};

export function buildRiver(r: Renderer): Zone {
  const rand = seeded(5150);
  const s = new Scatter();
  const colliders: Collider[] = [];
  const height = riverHeight;
  const spots: Record<string, [number, number]> = {
    spawn: [-26, 10],
    officer: [-11, 10.5],
    footbridge: [4, 5.6],
    drum: [26, -5],
    hazardTalk: [21.5, -8.5],
    bins: [-14, 8],
    binBio: [-17, 8],
    binRecycle: [-14, 8],
    binResidual: [-11, 8],
    rack: [30.5, 4.6],
    gate: [27.5, 6.6],
    dispatch: [19, 12],
    litter: [0, 6],
    /* Firm ground on the north bank, near the culvert: where a resumed run starts. */
    bankEast: [24.5, 9.5],
    /* The oil trail on the south bank, leading east to the culvert. */
    trace1: [9, -6.6],
    trace2: [15.5, -7.2],
    trace3: [22.6, -7],
    trace: [15.5, -7.2],
    /* Native grass to replant the bare bank. */
    seedTray: [16.4, 10],
    reed1: [11.6, 6.8],
    reed2: [15.6, 7.1],
    reed3: [20.8, 6.9],
    reeds: [15.6, 7.1],
    patch1: [-20, 4],
    patch2: [-31, 11.4],
    patch3: [-29, -8.4],
    critter1: [7, 5.9],
    critter2: [-9, 6],
  };
  /* The barangay hall, with the sorting bins out front. */
  {
    const b = s.cell(-14, 13).solid;
    b.rbox(-14, 1.8, 14, 11, 3.6, 6, '#f6ecd6', 0.3);
    roofPitched(b, -14, 3.5, 14, 6.2, 3.6, 1.6, '#c8452e', '#a83622');
    b.rbox(-14, 1.1, 10.95, 1.4, 2.2, 0.08, '#6b4a2f', 0.2);
    b.rbox(-14, 3.05, 10.92, 4.6, 0.55, 0.06, '#1e5bb8', 0.15);
    boxColliders(colliders, -19, 11.4, -9, 16.6);
    const bin = (x: number, color: string): void => {
      b.rbox(x, 0.7, 8, 1.4, 1.4, 1.2, color, 0.3);
      b.rbox(x, 1.48, 8, 1.5, 0.16, 1.3, color, 0.25);
      colliders.push({ x, z: 8.2, r: 0.65 });
    };
    bin(-17, '#3f9b4a');
    bin(-14, '#2b6fd6');
    bin(-11, '#6b7488');
  }
  /* Houses on both banks. */
  const walls = ['#ffd9a8', '#cfe8ff', '#ffe3ec', '#e0f5d8', '#fff2b8', '#e9dcff'];
  const roofs = ['#c8452e', '#2b6fd6', '#2fae6b', '#8a4a22'];
  for (let x = -40; x <= 40; x += 8.5) {
    if (Math.abs(x + 14) < 7) {
      continue;
    }
    const zN = 19 + rand() * 2;
    house(s.cell(x, zN).solid, x, zN, 6, 4.5, walls[Math.floor(rand() * walls.length)], roofs[Math.floor(rand() * roofs.length)], -1);
    boxColliders(colliders, x - 3, zN - 2.3, x + 3, zN + 2.3);
    if (Math.abs(x - 28) < 6) {
      continue;
    }
    const zS = -17 - rand() * 2;
    house(s.cell(x, zS).solid, x, zS, 6, 4.5, walls[Math.floor(rand() * walls.length)], roofs[Math.floor(rand() * roofs.length)], 1);
    boxColliders(colliders, x - 3, zS - 2.3, x + 3, zS + 2.3);
  }
  /* The footbridge. */
  {
    const b = s.cell(4, 0).solid;
    const zc = riverZ(4);
    b.rbox(4, RIVER_BRIDGE.deck - 0.1, zc, 2.6, 0.2, 11, '#c79a5c', 0.25);
    for (const side of [-1.25, 1.25]) {
      b.tube([4 + side, 1.25, zc - 5.4], [4 + side, 1.25, zc + 5.4], 0.06, 0.06, '#7d5a3c', 5, false);
      for (const dz of [-5.4, -2.7, 0, 2.7, 5.4]) {
        b.tube([4 + side, 0.2, zc + dz], [4 + side, 1.25, zc + dz], 0.07, 0.07, '#7d5a3c', 5, false);
      }
    }
  }
  /* The road on its embankment, the culvert and the floodgate. */
  {
    const b = s.cell(34, 0).solid;
    b.rbox(35, 1.3, 0, 5, 0.3, 64, '#5d6473', 0.2);
    b.rbox(32.4, 0.1, riverZ(32.4), 0.4, 1.9, 4.6, '#9aa0aa', 0.2);
    b.rbox(32.2, -0.3, riverZ(32.4), 0.2, 1.5, 3, '#1c2129', 0.1);
    for (let i = -4; i <= 4; i += 1) {
      b.tube([31.8, -1.2, riverZ(31.8) + i * 0.38], [31.8, 0.7, riverZ(31.8) + i * 0.38], 0.04, 0.04, '#6b7488', 4, false);
    }
    b.tube([27.5, 0.3, 7.4], [27.5, 1.1, 7.4], 0.1, 0.1, '#6b7488', 5, false);
    b.ellipsoid(27.5, 1.25, 7.4, 0.55, 0.08, 0.55, '#d9632f', { rows: 3, cols: 12 });
    colliders.push({ x: 27.5, z: 7.4, r: 0.5 });
  }
  /* The dispatch post. */
  {
    const b = s.cell(20, 13).solid;
    b.tube([18.6, 0, 13.3], [18.6, 2.6, 13.3], 0.1, 0.1, '#7d5a3c', 5, false);
    b.tube([20.6, 0, 13.3], [20.6, 2.6, 13.3], 0.1, 0.1, '#7d5a3c', 5, false);
    b.rbox(19.6, 2, 13.3, 2.6, 1.4, 0.16, '#17304d', 0.2);
    b.rbox(19.6, 2, 13.22, 2.2, 1.05, 0.06, '#dfeefc', 0.15);
    colliders.push({ x: 19.6, z: 13.3, r: 1.4 });
  }
  /* A mango tree for Awit, and a big stone for Dayo. */
  roundTree(s, -33, height(-33, 13), 13, 1.35, rand);
  colliders.push({ x: -33, z: 13, r: 0.9 });
  s.cell(-30, -9.6).solid.ellipsoid(-30, height(-30, -9.6) + 0.35, -9.6, 0.9, 0.55, 0.75, '#9aa0aa', { rows: 4, cols: 8 });
  colliders.push({ x: -30, z: -9.6, r: 0.9 });
  /* Bushes and trees between the houses; reeds come later, after the clean-up. */
  for (let i = 0; i < 220; i += 1) {
    const x = -44 + rand() * 88;
    const z = -26 + rand() * 52;
    const d = Math.abs(z - riverZ(x));
    if (d < 5.5 || colliders.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + 1)) {
      continue;
    }
    const y = height(x, z);
    const k = rand();
    if (Math.abs(z) > 23) {
      if (k < 0.5) {
        tallTree(s, x, y, z, 0.9, rand, Math.floor(rand() * 3));
      } else {
        roundTree(s, x, y, z, 1.1, rand);
      }
    } else if (k < 0.05 && (d > 9 || Math.abs(z) > 10)) {
      palm(s, x, y, z, 0.85, rand);
      colliders.push({ x, z, r: 0.45 });
    } else if (k < 0.14 && d > 7) {
      bush(s, x, y, z, 0.7, rand);
      colliders.push({ x, z, r: 0.55 });
    } else if (k < 0.6) {
      tuft(s, x, y, z, rand);
    } else {
      flower(s, x, y, z, rand);
    }
  }
  const terrain = buildTerrain(r, {
    minX: -60,
    maxX: 60,
    minZ: -36,
    maxZ: 36,
    step: 2,
    height,
    color: (x, z, h, slope) => {
      const patch = Math.sin(x * 0.2 + z * 0.13) * 0.2 + Math.sin(z * 0.27 - x * 0.08) * 0.2;
      const d = Math.abs(z - riverZ(x));
      const path = Math.min(Math.abs(d - 6.4), Math.abs(x + 14) < 7 && z > 6 && z < 11 ? 0 : 9);
      let c = groundColor(path, patch, slope);
      c = mix3(c, paint.mud, smooth(5.2, 3.8, d));
      if (Math.abs(x - 35) < 3) {
        c = mix3(c, concrete, 0.8);
      }
      return h < RIVER_WATER_Y - 0.4 ? paint.mud : c;
    },
  });
  /* The creek itself. */
  const w = new MeshBuilder();
  const stepX = 3;
  let rows = 0;
  for (let x = -62; x <= 62; x += stepX) {
    for (let k = 0; k <= 6; k += 1) {
      const zz = riverZ(x) - 4.2 + (k / 6) * 8.4;
      const shore = smooth(2.4, 3.8, Math.abs(zz - riverZ(x)));
      w.rawVertex(x, RIVER_WATER_Y, zz, 0, 1, 0, [shore * 0.95, 0, 0]);
    }
    rows += 1;
  }
  /* Wound like the forest stream's, so it faces up and is seen from above. */
  for (let i = 0; i < rows - 1; i += 1) {
    for (let k = 0; k < 6; k += 1) {
      const a = i * 7 + k;
      const c = a + 7;
      w.indices.push(a, a + 1, c, a + 1, c + 1, c);
    }
  }
  const water = r.mesh(w, false);
  const chunks = s.build(r);
  const cloudMesh = clouds(r, 41, 150);
  const images: ZoneImage[] = [
    { key: 'binBio', x: -17, y: 2.3, z: 7.38, yaw: Math.PI, w: 1.9, h: 0.42 },
    { key: 'binRecycle', x: -14, y: 2.3, z: 7.38, yaw: Math.PI, w: 1.9, h: 0.42 },
    { key: 'binResidual', x: -11, y: 2.3, z: 7.38, yaw: Math.PI, w: 1.9, h: 0.42 },
    { key: 'hallSign', x: -14, y: 3.05, z: 10.86, yaw: Math.PI, w: 4.3, h: 0.5 },
  ];
  return {
    id: 'river',
    geometry: { terrain, chunks, water },
    cloudMesh,
    env: DAY,
    height,
    colliders,
    walkable: (x, z) => height(x, z) > RIVER_WATER_Y + 0.15 && Math.abs(x) < 42 && Math.abs(z) < 25 && !(Math.abs(x - 35) < 3.2),
    spots,
    waterY: RIVER_WATER_Y,
    side: (x, z) => z - riverZ(x),
    bridges: [{ x: RIVER_BRIDGE.x, z: riverZ(RIVER_BRIDGE.x), halfWidth: RIVER_BRIDGE.halfWidth, halfLength: RIVER_BRIDGE.halfLength, deck: RIVER_BRIDGE.deck }],
    images,
    meshes: [terrain, water, cloudMesh, ...chunks.flatMap((c) => [c.solid, c.soft].filter((m): m is Mesh => m !== null))],
  };
}

/* ---- The Eco Expressway: a maintenance depot ---- */

export const DEPOT_POLES: readonly [number, number][] = [
  [-28, -22],
  [28, -22],
  [-28, 23],
  [28, 23],
  [6, 23],
  [6, -22],
];

export function buildDepot(r: Renderer): Zone {
  const rand = seeded(7720);
  const s = new Scatter();
  const colliders: Collider[] = [];
  const inYard = (x: number, z: number): boolean => Math.abs(x) < 34 && Math.abs(z) < 28;
  const height = (x: number, z: number): number => (inYard(x, z) || (Math.abs(x) < 5 && z < 0) ? 0 : smooth(36, 60, Math.max(Math.abs(x), Math.abs(z) + 6)) * 7);
  const spots: Record<string, [number, number]> = {
    spawn: [0, -36],
    chief: [12, 8],
    meter: [2.6, 9.6],
    office: [16, 10.4],
    sensor: [-26.4, -22],
    leak: [-22.6, 1.5],
    driver1: [7.6, -11.4],
    driver2: [13.6, -11.4],
    driver3: [19.6, -11.4],
    dispatch: [-2.4, -25],
    installFloods: [26.4, -20.4],
    installTubes: [-10, 6.4],
    installSolar: [-21.6, 13],
    installSign: [10, -14],
    faults: [0, 0],
    install: [0, 0],
    /* The roof junction box, up the west ladder, and the inverter by the switchboard. */
    wiring: [-22.4, 10.4],
    inverter: [2.6, 13.4],
    patch1: [-4, 6.4],
    patch2: [30, 10],
    patch3: [-31.4, 5.6],
    critter1: [23.4, 15.4],
  };
  /* Workshop with a flat roof, for the panels later. */
  {
    const b = s.cell(-10, 13).solid;
    b.rbox(-10, 3, 13, 20, 6, 10, '#c3cfdc', 0.25);
    b.rbox(-10, 6.15, 13, 20.6, 0.3, 10.6, '#5e6b7c', 0.2);
    b.rbox(-10, 2.3, 7.96, 6, 4.4, 0.08, '#3d4756', 0.15);
    b.rbox(-10, 4.9, 7.94, 6.2, 0.3, 0.08, '#ffc32d', 0.15);
    for (const dx of [-0.35, 0.35]) {
      b.tube([-20.3, 0, 13 + dx], [-20.3, 6.4, 13 + dx], 0.06, 0.06, '#8b98ad', 5, false);
    }
    for (let i = 0; i < 12; i += 1) {
      b.tube([-20.3, 0.45 + i * 0.5, 12.65], [-20.3, 0.45 + i * 0.5, 13.35], 0.04, 0.04, '#8b98ad', 4, false);
    }
    /* Main switchboard and meter on the east wall. */
    b.rbox(0.1, 1.6, 10.2, 0.4, 2, 1.6, '#e8ecf1', 0.2);
    b.rbox(0.33, 2, 10.2, 0.06, 0.6, 0.9, '#20252f', 0.1);
    boxColliders(colliders, -20, 8, 0, 18);
  }
  /* Office. */
  {
    const b = s.cell(16, 15).solid;
    b.rbox(16, 1.9, 15, 10, 3.8, 7, '#f7fafc', 0.3);
    b.rbox(16, 3.55, 11.45, 10.2, 0.5, 0.1, '#1e5bb8', 0.15);
    b.rbox(16, 1.1, 11.46, 1.2, 2.2, 0.08, '#3d5a80', 0.15);
    b.rbox(13, 2.2, 11.46, 2, 1, 0.08, '#9fd6f2', 0.15);
    b.rbox(19, 2.2, 11.46, 2, 1, 0.08, '#9fd6f2', 0.15);
    boxColliders(colliders, 11, 11.6, 21, 18.4);
  }
  /* Compressor shed. */
  {
    const b = s.cell(-26, 2).solid;
    b.rbox(-26, 0.12, 2, 6, 0.24, 5, '#9aa0aa', 0.2);
    b.tube([-29, 0, -0.4], [-29, 3.2, -0.4], 0.1, 0.1, '#6b7488', 5, false);
    b.tube([-23, 0, -0.4], [-23, 3.2, -0.4], 0.1, 0.1, '#6b7488', 5, false);
    b.rbox(-26, 3.3, 2, 6.6, 0.25, 5.6, '#5e6b7c', 0.2);
    b.rbox(-26, 3.3 - 1.6, 4.4, 6, 3.2, 0.2, '#c3cfdc', 0.2);
    b.tube([-27.5, 0.9, 2.3], [-24.3, 0.9, 2.3], 0.75, 0.75, '#2fae6b', 12, true);
    b.rbox(-24, 1.5, 2.3, 1, 1, 1, '#4a5568', 0.2);
    boxColliders(colliders, -29, 1, -23, 4.4, 1);
  }
  /* Floodlight poles. */
  for (const [x, z] of DEPOT_POLES) {
    const b = s.cell(x, z).solid;
    b.tube([x, 0, z], [x, 9, z], 0.22, 0.16, '#8b98ad', 7, false);
    b.rbox(x, 9.1, z, 1.6, 0.25, 0.9, '#5e6b7c', 0.15);
    colliders.push({ x, z, r: 0.5 });
  }
  /* The roof junction box by the ladder, the inverter, and the old meter log. */
  {
    const b = s.cell(-20, 10).solid;
    b.rbox(-20.5, 5.6, 10.4, 0.4, 0.9, 0.9, '#e8ecf1', 0.2);
    b.rbox(0.33, 2.2, 13.4, 0.12, 1.2, 0.9, '#f4f6f8', 0.2);
    b.rbox(0.42, 2.4, 13.4, 0.04, 0.4, 0.6, '#20252f', 0.1);
    const p = s.cell(31, 11).solid;
    p.tube([31.2, 0, 11], [31.2, 1.2, 11], 0.06, 0.06, '#7d5a3c', 4, false);
    p.rbox(31.2, 1.3, 11, 0.6, 0.15, 0.45, '#c79a5c', 0.15);
    colliders.push({ x: 31.2, z: 11, r: 0.4 });
  }
  /* The daylight sensor on the first pole. */
  s.cell(-28, -22).solid.rbox(-27.6, 7.4, -22, 0.4, 0.4, 0.4, '#e8ecf1', 0.2);
  /* Perimeter fence, open at the gate. */
  {
    const fence = (x0: number, z0: number, x1: number, z1: number): void => {
      const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 4);
      for (let i = 0; i <= n; i += 1) {
        const x = x0 + ((x1 - x0) * i) / n;
        const z = z0 + ((z1 - z0) * i) / n;
        s.cell(x, z).solid.tube([x, 0, z], [x, 1.8, z], 0.06, 0.06, '#6b7488', 4, false);
        colliders.push({ x, z, r: 0.35 });
      }
      for (const y of [0.6, 1.6]) {
        s.cell((x0 + x1) / 2, (z0 + z1) / 2).soft.tube([x0, y, z0], [x1, y, z1], 0.03, 0.03, '#8b98ad', 4, false);
      }
    };
    fence(-34, -28, -5, -28);
    fence(5, -28, 34, -28);
    fence(-34, 28, 34, 28);
    fence(-34, -28, -34, 28);
    fence(34, -28, 34, 28);
  }
  /* Parking lines and the dispatch post by the gate. */
  for (let i = 0; i < 4; i += 1) {
    s.cell(4 + i * 6, -8).soft.rbox(3 + i * 6, 0.03, -8, 0.18, 0.04, 6, '#f2f2ee', 0.1);
  }
  {
    const b = s.cell(-3, -25).solid;
    b.tube([-4.2, 0, -25.6], [-4.2, 2.6, -25.6], 0.1, 0.1, '#7d5a3c', 5, false);
    b.tube([-2.2, 0, -25.6], [-2.2, 2.6, -25.6], 0.1, 0.1, '#7d5a3c', 5, false);
    b.rbox(-3.2, 2, -25.6, 2.6, 1.4, 0.16, '#17304d', 0.2);
    b.rbox(-3.2, 2, -25.52, 2.2, 1.05, 0.06, '#dfeefc', 0.15);
    colliders.push({ x: -3.2, z: -25.6, r: 1.3 });
  }
  /* Trees outside the fence. */
  for (let i = 0; i < 240; i += 1) {
    const x = -70 + rand() * 140;
    const z = -70 + rand() * 140;
    if (Math.abs(x) < 38 && Math.abs(z) < 32) {
      continue;
    }
    if (Math.abs(x) < 7 && z < 0) {
      continue;
    }
    const y = height(x, z);
    const k = rand();
    if (k < 0.45) {
      tallTree(s, x, y, z, 0.85 + rand() * 0.4, rand, Math.floor(rand() * 3));
    } else if (k < 0.7) {
      roundTree(s, x, y, z, 1.1, rand);
    } else if (k < 0.82) {
      palm(s, x, y, z, 0.9, rand);
    } else {
      bush(s, x, y, z, 0.9, rand);
    }
  }
  const terrain = buildTerrain(r, {
    minX: -76,
    maxX: 76,
    minZ: -76,
    maxZ: 76,
    step: 2,
    height,
    color: (x, z, _h, slope) => {
      if (inYard(x, z)) {
        return (Math.floor(x / 8) + Math.floor(z / 8)) & 1 ? yardPaint : mix3(yardPaint, concrete, 0.5);
      }
      if (Math.abs(x) < 4.5 && z < 0) {
        return asphalt;
      }
      const patch = Math.sin(x * 0.2 + z * 0.13) * 0.2 + Math.sin(z * 0.27 - x * 0.08) * 0.2;
      return groundColor(9, patch, slope);
    },
  });
  const chunks = s.build(r);
  const cloudMesh = clouds(r, 57, 150);
  const images: ZoneImage[] = [
    { key: 'depotSign', x: -10, y: 5.4, z: 7.86, yaw: Math.PI, w: 7, h: 0.75 },
    { key: 'officeSign', x: 16, y: 3.55, z: 11.36, yaw: Math.PI, w: 4, h: 0.45 },
  ];
  return {
    id: 'depot',
    geometry: { terrain, chunks, water: null },
    cloudMesh,
    env: DAY,
    height,
    colliders,
    walkable: (x, z) => (Math.abs(x) < 33.3 && Math.abs(z) < 27.3) || (Math.abs(x) < 4.2 && z < 0 && z > -44),
    spots,
    waterY: null,
    images,
    meshes: [terrain, cloudMesh, ...chunks.flatMap((c) => [c.solid, c.soft].filter((m): m is Mesh => m !== null))],
  };
}

/** Pieces of the NLEX places that change as missions go on. */
export function buildNlexProps(r: Renderer): Record<string, Mesh> {
  const props: Record<string, Mesh> = {};
  const make = (name: string, fn: (b: MeshBuilder) => void, outline = true): void => {
    const b = new MeshBuilder();
    fn(b);
    props[name] = r.mesh(b, outline);
  };
  /* Lane signals. */
  make('sigGo', (b) => {
    b.rbox(0, 0, 0, 1, 0.55, 0.12, '#14c46b', 0.2);
    b.rbox(0, -0.05, -0.08, 0.16, 0.38, 0.06, '#eafff2', 0.1);
    b.cone(0, 0.12, -0.08, 0.2, 0.2, '#eafff2', 3);
  });
  make('sigStop', (b) => {
    b.rbox(0, 0, 0, 1, 0.55, 0.12, '#e2452f', 0.2);
    b.rbox(0, 0, -0.08, 0.5, 0.1, 0.06, '#fff0ec', 0.1, 0.78);
    b.rbox(0, 0, -0.08, 0.5, 0.1, 0.06, '#fff0ec', 0.1, -0.78);
  });
  make('sigDark', (b) => b.rbox(0, 0, 0, 1, 0.55, 0.12, '#3d4350', 0.2));
  make('jammer', (b) => {
    b.rbox(0, 0.35, 0, 0.9, 0.7, 0.6, '#5a5f6b', 0.25);
    b.tube([0.3, 0.7, 0], [0.3, 1.4, 0], 0.03, 0.02, '#20252f', 4, false);
    b.ball(0.3, 1.45, 0, 0.08, '#e2452f', 4, 6);
    b.ellipsoid(-0.1, 0.45, -0.31, 0.22, 0.16, 0.03, '#8bdc5e', { rows: 3, cols: 6 });
    b.ellipsoid(-0.1, 0.45, -0.33, 0.12, 0.08, 0.02, '#3d4350', { rows: 3, cols: 6 });
  });
  make('cableCut', (b) => {
    b.tube([0, 0.05, 0], [-0.9, 0.05, -0.5], 0.06, 0.06, '#20252f', 5, true);
    b.tube([0, 0.05, 0], [0.5, 0.25, -1.2], 0.06, 0.06, '#20252f', 5, true);
    b.ball(-0.9, 0.08, -0.5, 0.1, '#ffc32d', 3, 5);
    b.ball(0.5, 0.28, -1.2, 0.1, '#ffc32d', 3, 5);
  });
  make('cableFixed', (b) => {
    b.tube([0, 0.05, 0], [-1.6, 0.05, -1.2], 0.06, 0.06, '#20252f', 5, true);
    b.rbox(-0.8, 0.08, -0.6, 0.3, 0.16, 0.2, '#14c46b', 0.15);
  });
  make('cone', (b) => {
    b.cone(0, 0, 0, 0.32, 0.8, '#ff7a1a', 10, '#fff4ec');
    b.rbox(0, 0.03, 0, 0.7, 0.06, 0.7, '#ff7a1a', 0.2);
  });
  /* The creek. */
  make('bottle', (b) => {
    b.tube([0, 0.12, -0.25], [0, 0.12, 0.25], 0.1, 0.1, '#bfe9ff', 8, true);
    b.tube([0, 0.12, 0.25], [0, 0.12, 0.38], 0.05, 0.05, '#2b6fd6', 6, true);
  });
  make('can', (b) => b.tube([0, 0, 0], [0, 0.3, 0], 0.09, 0.09, '#e2452f', 8, true));
  make('jar', (b) => {
    b.tube([0, 0, 0], [0, 0.3, 0], 0.13, 0.12, '#cfe9e0', 8, true);
    b.tube([0, 0.3, 0], [0, 0.36, 0], 0.11, 0.11, '#c79a5c', 8, true);
  });
  make('leaves', (b) => {
    b.ellipsoid(0, 0.05, 0, 0.5, 0.04, 0.18, '#5ebf56', { rows: 3, cols: 7, yaw: 0.4 });
    b.ellipsoid(0.1, 0.08, 0.1, 0.45, 0.04, 0.16, '#7fd06a', { rows: 3, cols: 7, yaw: -0.5 });
  });
  make('peels', (b) => {
    b.ellipsoid(0, 0.06, 0, 0.2, 0.06, 0.12, '#ffd24a', { rows: 3, cols: 6 });
    b.ellipsoid(0.18, 0.05, 0.08, 0.15, 0.05, 0.1, '#ff9a3c', { rows: 3, cols: 6 });
  });
  make('husk', (b) => b.ellipsoid(0, 0.16, 0, 0.26, 0.2, 0.22, '#8a6341', { rows: 5, cols: 8 }));
  make('wrappers', (b) => {
    b.rbox(0, 0.03, 0, 0.36, 0.04, 0.22, '#ff4fa3', 0.2, 0.3);
    b.rbox(0.12, 0.06, 0.1, 0.3, 0.04, 0.2, '#7d5cff', 0.2, -0.5);
  });
  make('slipper', (b) => {
    b.ellipsoid(0, 0.04, 0, 0.12, 0.04, 0.28, '#3fa9f5', { rows: 3, cols: 8 });
    b.tube([-0.08, 0.06, 0.08], [0.08, 0.06, 0.08], 0.02, 0.02, '#ffffff', 4, false);
  });
  make('drum', (b) => {
    b.tube([0, 0, 0], [0, 1, 0], 0.32, 0.32, '#2c3b55', 10, true);
    b.tube([0, 0.33, 0], [0, 0.37, 0], 0.33, 0.33, '#ffc32d', 10, false);
  });
  make('oilSheen', (b) => b.ellipsoid(0, 0, 0, 2.2, 0.02, 1.2, '#2a2433', { rows: 2, cols: 12 }), false);
  make('rackJunk', (b) => {
    for (let i = 0; i < 9; i += 1) {
      b.ellipsoid(-0.2 + (i % 3) * 0.1, -0.6 + Math.floor(i / 3) * 0.32, -1.4 + i * 0.34, 0.32, 0.22, 0.3, ['#7c6547', '#5ebf56', '#e9e4d8', '#ff4fa3', '#3fa9f5'][i % 5], { rows: 3, cols: 6 });
    }
  });
  make('reeds', (b) => {
    for (let i = 0; i < 7; i += 1) {
      const x = -0.6 + i * 0.2;
      b.tube([x, 0, 0], [x + 0.05, 1 + (i % 3) * 0.25, 0.05 * (i % 2)], 0.035, 0.02, '#4aa24c', 4, false);
    }
    b.ellipsoid(0, 0.15, 0, 0.6, 0.2, 0.3, '#6cc152', { rows: 3, cols: 7 });
  });
  /* The depot. */
  make('lampOn', (b) => b.rbox(0, 0, 0, 1.5, 0.22, 0.8, '#fff3a6', 0.15), false);
  make('lampOff', (b) => b.rbox(0, 0, 0, 1.5, 0.22, 0.8, '#d4d8de', 0.15), false);
  make('lampLed', (b) => {
    b.rbox(0, 0, 0, 1.5, 0.22, 0.8, '#eaf7ff', 0.15);
    b.rbox(0, 0.05, 0, 1.2, 0.08, 0.6, '#9fd6f2', 0.1);
  }, false);
  make('puff', (b) => {
    b.ball(0, 0, 0, 0.32, '#d5d9df', 4, 6);
    b.ball(0.3, 0.2, 0.1, 0.24, '#e5e8ec', 4, 6);
    b.ball(-0.25, 0.3, -0.1, 0.2, '#c7ccd3', 4, 6);
  }, false);
  make('panels', (b) => {
    for (let i = 0; i < 6; i += 1) {
      for (let j = 0; j < 2; j += 1) {
        b.rbox(-7.5 + i * 3, 0.35, -2 + j * 4, 2.8, 0.12, 3.4, '#2b4f9e', 0.1);
        b.rbox(-7.5 + i * 3, 0.42, -2 + j * 4, 2.6, 0.04, 3.1, '#3f6fd0', 0.08);
      }
    }
  });
  make('tubesLit', (b) => b.rbox(0, 0, 0, 5.4, 0.15, 0.1, '#eaf7ff', 0.1), false);
  make('noIdleSign', (b) => {
    b.tube([0, 0, 0], [0, 2.2, 0], 0.06, 0.06, '#6b7488', 5, false);
    b.rbox(0, 2.2, 0, 1.3, 0.9, 0.08, '#14995c', 0.2);
    b.rbox(0, 2.2, -0.05, 1.1, 0.7, 0.04, '#ffffff', 0.15);
  });
  make('stakeMark', (b) => {
    b.cone(0, 0, 0, 0.28, 0.7, '#ffc32d', 8, '#ffffff');
  });
  /* Guardian patches: a round badge that spins slowly where it is hidden. */
  make('patch', (b) => {
    b.ellipsoid(0, 0, 0, 0.34, 0.34, 0.07, '#ffc32d', { rows: 3, cols: 12 });
    b.ellipsoid(0, 0, 0.05, 0.25, 0.25, 0.04, '#1464e8', { rows: 3, cols: 12 });
    b.ellipsoid(0, 0.02, 0.09, 0.12, 0.07, 0.03, '#5ebf56', { rows: 2, cols: 8, yaw: 0.5 });
  });
  /* The Gridlock. */
  make('sensorBad', (b) => {
    b.rbox(0, 0, 0, 0.5, 0.42, 0.42, '#e8ecf1', 0.15);
    b.ball(0, 0.05, -0.22, 0.09, '#e2452f', 3, 6);
  });
  make('sensorGood', (b) => {
    b.rbox(0, 0, 0, 0.5, 0.42, 0.42, '#e8ecf1', 0.15);
    b.ball(0, 0.05, -0.22, 0.09, '#14c46b', 3, 6);
  });
  make('powerCell', (b) => {
    b.rbox(0, 0.28, 0, 0.62, 0.56, 0.42, '#ffc32d', 0.2);
    b.rbox(0, 0.28, 0, 0.64, 0.14, 0.44, '#20252f', 0.1);
    b.rbox(0.16, 0.6, 0, 0.12, 0.08, 0.12, '#8b98ad', 0.05);
  });
  make('tyreMarks', (b) => {
    for (const dx of [-0.8, 0.8]) {
      b.rbox(dx, 0.02, 0, 0.32, 0.03, 3.2, '#2b303a', 0.05);
    }
  }, false);
  make('flyer', (b) => {
    b.rbox(0, 0.02, 0, 0.42, 0.02, 0.56, '#8bdc5e', 0.05, 0.4);
    b.rbox(0, 0.035, 0, 0.3, 0.01, 0.16, '#3d4350', 0.02, 0.4);
  }, false);
  /* The creek. */
  make('traceMark', (b) => {
    b.ellipsoid(0, 0.12, 0, 0.5, 0.18, 0.4, '#8d929b', { rows: 3, cols: 7 });
    b.ellipsoid(0.1, 0.27, 0.05, 0.3, 0.03, 0.22, '#2a2433', { rows: 2, cols: 7 });
    b.ellipsoid(0.16, 0.29, 0.08, 0.12, 0.02, 0.08, '#7d5cff', { rows: 2, cols: 6 });
  });
  make('seedTray', (b) => {
    b.rbox(0, 0.4, 0, 1.6, 0.2, 0.9, '#8a6341', 0.15);
    b.tube([-0.7, 0, -0.35], [-0.7, 0.4, -0.35], 0.05, 0.05, '#7d5a3c', 4, false);
    b.tube([0.7, 0, 0.35], [0.7, 0.4, 0.35], 0.05, 0.05, '#7d5a3c', 4, false);
    for (let i = 0; i < 6; i += 1) {
      b.ellipsoid(-0.55 + (i % 3) * 0.55, 0.62, -0.2 + Math.floor(i / 3) * 0.4, 0.18, 0.2, 0.18, '#4aa24c', { rows: 3, cols: 6 });
    }
  });
  make('grassPlug', (b) => {
    b.ellipsoid(0, 0.08, 0, 0.3, 0.1, 0.3, '#6b4a2f', { rows: 2, cols: 7 });
    for (let i = 0; i < 6; i += 1) {
      const a = i * 1.05;
      b.tube([Math.cos(a) * 0.08, 0.1, Math.sin(a) * 0.08], [Math.cos(a) * 0.3, 0.9 + (i % 2) * 0.3, Math.sin(a) * 0.3], 0.04, 0.015, '#5ebf56', 4, false);
    }
  });
  make('dragonfly', (b) => {
    b.tube([0, 0, -0.3], [0, 0, 0.25], 0.035, 0.02, '#1e88e5', 5, true);
    b.ball(0, 0, 0.28, 0.06, '#1565c0', 3, 5);
    for (const z of [0.1, -0.05]) {
      b.ellipsoid(0.22, 0.02, z, 0.22, 0.01, 0.05, '#dff3ff', { rows: 2, cols: 6 });
      b.ellipsoid(-0.22, 0.02, z, 0.22, 0.01, 0.05, '#dff3ff', { rows: 2, cols: 6 });
    }
  });
  make('frog', (b) => {
    b.ellipsoid(0, 0.14, 0, 0.2, 0.14, 0.24, '#5ebf56', { rows: 4, cols: 8 });
    for (const x of [-0.09, 0.09]) {
      b.ball(x, 0.27, 0.12, 0.06, '#e8f5c8', 3, 5);
      b.ball(x, 0.28, 0.16, 0.03, '#1f1a17', 3, 4);
    }
    b.ellipsoid(0, 0.05, -0.12, 0.24, 0.05, 0.12, '#3f9f4d', { rows: 2, cols: 6 });
  });
  make('butterfly', (b) => {
    b.tube([0, 0, -0.08], [0, 0, 0.08], 0.02, 0.02, '#3a2a1c', 4, true);
    b.ellipsoid(0.11, 0.02, 0.02, 0.11, 0.01, 0.09, '#ff9a3c', { rows: 2, cols: 6 });
    b.ellipsoid(-0.11, 0.02, 0.02, 0.11, 0.01, 0.09, '#ff9a3c', { rows: 2, cols: 6 });
    b.ellipsoid(0.08, 0.02, -0.07, 0.07, 0.01, 0.06, '#ffd24a', { rows: 2, cols: 6 });
    b.ellipsoid(-0.08, 0.02, -0.07, 0.07, 0.01, 0.06, '#ffd24a', { rows: 2, cols: 6 });
  }, false);
  make('swallow', (b) => {
    b.ellipsoid(0, 0, 0, 0.09, 0.07, 0.16, '#1d2a52', { rows: 3, cols: 6 });
    b.ellipsoid(0, -0.03, 0.03, 0.07, 0.04, 0.1, '#f2efe6', { rows: 2, cols: 6 });
    b.ellipsoid(0.16, 0.02, 0, 0.17, 0.015, 0.05, '#1d2a52', { rows: 2, cols: 5, yaw: -0.3 });
    b.ellipsoid(-0.16, 0.02, 0, 0.17, 0.015, 0.05, '#1d2a52', { rows: 2, cols: 5, yaw: 0.3 });
    b.ellipsoid(0, 0, -0.2, 0.05, 0.01, 0.1, '#1d2a52', { rows: 2, cols: 5 });
  });
  make('sparrow', (b) => {
    b.ellipsoid(0, 0.12, 0, 0.1, 0.09, 0.14, '#9a6b42', { rows: 3, cols: 6 });
    b.ball(0, 0.22, 0.1, 0.07, '#7a4a2a', 3, 6);
    b.ball(0.04, 0.21, 0.16, 0.025, '#f2efe6', 2, 4);
    b.ellipsoid(0, 0.12, -0.16, 0.05, 0.02, 0.08, '#6b4a2f', { rows: 2, cols: 5 });
  });
  make('gecko', (b) => {
    b.ellipsoid(0, 0, 0, 0.06, 0.03, 0.16, '#c8b89a', { rows: 3, cols: 6 });
    b.ball(0, 0.01, 0.17, 0.05, '#c8b89a', 3, 5);
    b.tube([0, 0, -0.14], [0, 0, -0.36], 0.03, 0.01, '#c8b89a', 4, false);
  });
  /* The depot. */
  make('junctionBad', (b) => {
    for (let i = 0; i < 5; i += 1) {
      b.tube([-0.25, 0.4 - i * 0.12, -0.2], [-0.25 + Math.sin(i) * 0.5, 0.1 + i * 0.1, 0.25], 0.03, 0.03, ['#e2452f', '#ffc32d', '#1464e8', '#2ead5b', '#20252f'][i], 4, false);
    }
  }, false);
  make('inverterOn', (b) => {
    b.rbox(0, 0, 0, 0.05, 0.3, 0.5, '#14c46b', 0.05);
  }, false);
  /* Eco Delivery Rush: the six supplies, a decoy, and what they look like carried. */
  make('itemSeedlings', (b) => {
    b.rbox(0, 0.1, 0, 0.9, 0.2, 0.6, '#3d4756', 0.1);
    for (let i = 0; i < 6; i += 1) {
      b.ellipsoid(-0.3 + (i % 3) * 0.3, 0.32, -0.15 + Math.floor(i / 3) * 0.3, 0.12, 0.14, 0.12, '#4aa24c', { rows: 3, cols: 6 });
    }
  });
  make('itemTents', (b) => {
    b.tube([-0.45, 0.22, 0], [0.45, 0.22, 0], 0.2, 0.2, '#2ead5b', 8, true);
    b.tube([-0.2, 0.22, 0], [-0.15, 0.22, 0], 0.21, 0.21, '#ffc32d', 8, false);
    b.tube([0.15, 0.22, 0], [0.2, 0.22, 0], 0.21, 0.21, '#ffc32d', 8, false);
  });
  make('itemTraps', (b) => {
    b.rbox(0, 0.3, 0, 0.72, 0.6, 0.72, '#6b7488', 0.25);
    b.rbox(0, 0.35, 0.37, 0.3, 0.3, 0.05, '#20252f', 0.1);
    b.ball(0, 0.38, 0.4, 0.07, '#3fa9f5', 3, 6);
  });
  make('itemDecoy', (b) => {
    b.rbox(0, 0.3, 0, 0.72, 0.6, 0.72, '#6b7488', 0.25);
    b.rbox(0, 0.35, 0.37, 0.3, 0.3, 0.05, '#20252f', 0.1);
  });
  make('itemMedkit', (b) => {
    b.rbox(0, 0.25, 0, 0.7, 0.5, 0.45, '#f4f6f8', 0.2);
    b.rbox(0, 0.3, 0.23, 0.32, 0.1, 0.03, '#e2452f', 0.03);
    b.rbox(0, 0.3, 0.23, 0.1, 0.32, 0.03, '#e2452f', 0.03);
  });
  make('itemRope', (b) => {
    b.tube([0, 0.05, 0], [0, 0.32, 0], 0.32, 0.3, '#c79a5c', 10, true);
    b.tube([0, 0.32, 0], [0, 0.34, 0], 0.14, 0.14, '#8a6341', 8, true);
  });
  make('itemWater', (b) => {
    for (const x of [-0.2, 0.2]) {
      b.tube([x, 0, 0], [x, 0.5, 0], 0.17, 0.15, '#7fd0ff', 8, true);
      b.tube([x, 0.5, 0], [x, 0.58, 0], 0.07, 0.07, '#1464e8', 6, true);
    }
  });
  make('generator', (b) => {
    b.rbox(0, 0.4, 0, 1.3, 0.8, 0.8, '#e2452f', 0.2);
    b.tube([-0.65, 0.85, -0.4], [0.65, 0.85, -0.4], 0.04, 0.04, '#20252f', 4, false);
  });
  /* The Command Center: things that change as the team plays. */
  make('pedestal', (b) => {
    b.rbox(0, 0.08, 0, 0.9, 0.16, 0.9, '#8b98ad', 0.1);
    b.tube([0, 0.16, 0], [0, 0.8, 0], 0.3, 0.26, '#f4f6f8', 10, false);
    b.rbox(0, 0.86, 0, 0.72, 0.12, 0.72, '#1464e8', 0.1);
    b.rbox(0, 0.86, 0, 0.76, 0.05, 0.76, '#ffc32d', 0.05);
  });
  make('trophy', (b) => {
    b.rbox(0, 0.06, 0, 0.5, 0.12, 0.5, '#8a6341', 0.1);
    b.tube([0, 0.12, 0], [0, 0.42, 0], 0.06, 0.08, '#ffc32d', 6, false);
    b.tube([0, 0.42, 0], [0, 0.78, 0], 0.12, 0.26, '#ffc32d', 10, true);
    b.ball(0, 0.92, 0, 0.1, '#fff6c2', 3, 6);
  });
  make('airLightBad', (b) => b.ball(0, 0, 0, 0.13, '#e2452f', 3, 6), false);
  make('airLightOk', (b) => b.ball(0, 0, 0, 0.13, '#14c46b', 3, 6), false);
  make('anemometer', (b) => {
    for (let i = 0; i < 3; i += 1) {
      const a = (i / 3) * Math.PI * 2;
      b.tube([0, 0, 0], [Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5], 0.03, 0.03, '#8b98ad', 4, false);
      b.ball(Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5, 0.11, '#ffc32d', 3, 6);
    }
  });
  make('solarLamp', (b) => {
    b.tube([0, 0, 0], [0, 2.6, 0], 0.06, 0.05, '#4a5568', 5, false);
    b.rbox(0, 2.75, 0, 0.7, 0.06, 0.45, '#2b4f9e', 0.05);
    b.ball(0, 2.45, 0.18, 0.16, '#fff3a6', 3, 6);
  });
  make('tollModel', (b) => {
    b.rbox(0, 0.4, 0, 0.6, 0.8, 0.6, '#f4f6f8', 0.2);
    b.tube([0.3, 0.75, 0], [2.4, 0.75, 0], 0.05, 0.05, '#ffffff', 4, false);
    for (let i = 0; i < 4; i += 1) {
      b.rbox(0.7 + i * 0.5, 0.75, 0, 0.18, 0.12, 0.12, '#e2452f', 0.02);
    }
    b.ball(0, 0.95, 0, 0.12, '#14c46b', 3, 6);
  });
  make('creekDisplay', (b) => {
    b.rbox(0, 0.1, 0, 3.6, 0.2, 1.2, '#c79a5c', 0.1);
    for (const [x, c] of [[-1.2, '#3f9b4a'], [0, '#2b6fd6'], [1.2, '#6b7488']] as [number, string][]) {
      b.rbox(x, 0.6, 0, 0.8, 0.8, 0.7, c, 0.25);
    }
    b.tube([1.9, 0.2, 0], [1.9, 0.9, 0], 0.26, 0.26, '#2c3b55', 8, true);
  });
  make('nestBox', (b) => {
    b.tube([0, 0, 0], [0, 2.2, 0], 0.07, 0.07, '#7d5a3c', 5, false);
    b.rbox(0, 2.55, 0, 0.6, 0.7, 0.6, '#8a6341', 0.15);
    b.ball(0, 2.6, 0.31, 0.12, '#3a2a1c', 3, 6);
    b.rbox(0, 2.95, 0, 0.75, 0.1, 0.75, '#2fae6b', 0.1);
  });
  make('seedlingRack', (b) => {
    b.rbox(0, 0.4, 0, 1.6, 0.1, 0.7, '#8a6341', 0.05);
    for (let i = 0; i < 4; i += 1) {
      b.ellipsoid(-0.6 + i * 0.4, 0.58, 0, 0.16, 0.16, 0.16, '#4aa24c', { rows: 3, cols: 6 });
    }
  });
  return props;
}

/* ---- Eco Delivery Rush: a supply yard at Balintawak ---- */

/** Where the van stands, and where the team piles what it finds. */
export const YARD_VAN: [number, number] = [6, -14];
export const YARD_STAGE: [number, number] = [2.4, -11.6];

export function buildYard(r: Renderer): Zone {
  const rand = seeded(9101);
  const s = new Scatter();
  const colliders: Collider[] = [];
  const inYard = (x: number, z: number): boolean => Math.abs(x) < 30 && Math.abs(z) < 24;
  const height = (x: number, z: number): number => (inYard(x, z) || (Math.abs(x) < 5 && z < 0) ? 0 : smooth(32, 56, Math.max(Math.abs(x), Math.abs(z) + 4)) * 6);
  const spots: Record<string, [number, number]> = {
    spawn: [0, -33],
    supervisor: [21, 5.2],
    items: [0, 0],
    itemSeedlings: [14, -2.4],
    itemTents: [9, 14.2],
    itemTraps: [-4, -3.6],
    itemMedkit: [-19.4, -6],
    itemRope: [-6, 7.6],
    itemWater: [-14, -11.8],
    stage: [2.4, -10.2],
    van: [6.4, -10],
    desk: [-6, -17.6],
    patch1: [14.2, 14.2],
    patch2: [-18, 3.8],
    patch3: [-20.4, 7.6],
    critter1: [23.6, -13.6],
  };
  /* The warehouse, with a gutter along the front. */
  {
    const b = s.cell(-12, 15).solid;
    b.rbox(-12, 3, 15, 24, 6, 10, '#d9c9a8', 0.25);
    b.rbox(-12, 6.15, 15, 24.6, 0.3, 10.6, '#8a4a22', 0.2);
    b.tube([-24.2, 5.95, 9.75], [0.2, 5.95, 9.75], 0.12, 0.12, '#8b98ad', 6, false);
    b.rbox(-12, 2.2, 9.96, 6, 4.4, 0.08, '#5a3f28', 0.15);
    boxColliders(colliders, -24, 10, 0, 20);
  }
  /* Tall storage racks: tents on the top shelf. */
  {
    const b = s.cell(10, 17).solid;
    for (const x of [5, 10, 15]) {
      for (const z of [16, 18]) {
        b.tube([x, 0, z], [x, 5, z], 0.08, 0.08, '#ff7a1a', 5, false);
      }
    }
    for (const y of [1.2, 2.6, 4.2]) {
      b.rbox(10, y, 17, 10.4, 0.12, 2.2, '#4a5568', 0.05);
    }
    for (const [x, y] of [[6.5, 1.5], [12, 1.5], [7.5, 2.9], [13.5, 2.9]] as [number, number][]) {
      b.rbox(x, y + 0.3, 17, 1.4, 0.6, 1.4, ['#c79a5c', '#8a6341'][Math.floor(x) % 2], 0.2);
    }
    boxColliders(colliders, 5, 16, 15, 18, 1.1);
  }
  /* The yard office. */
  {
    const b = s.cell(22, 12).solid;
    b.rbox(22.5, 1.8, 12, 9, 3.6, 8, '#f7fafc', 0.3);
    b.rbox(22.5, 3.75, 12, 9.4, 0.3, 8.4, '#1e5bb8', 0.2);
    b.rbox(22.5, 1.1, 7.96, 1.2, 2.2, 0.08, '#3d5a80', 0.15);
    b.rbox(19.8, 2.2, 7.96, 2, 1, 0.08, '#9fd6f2', 0.15);
    boxColliders(colliders, 18, 8, 27, 16);
  }
  /* A locked cage: the specialist kit inside, reachable through the mesh. */
  {
    const b = s.cell(-24, -6).solid;
    for (let x = -28; x <= -21; x += 1.75) {
      for (const z of [-10, -2]) {
        b.tube([x, 0, z], [x, 2.4, z], 0.05, 0.05, '#8b98ad', 4, false);
        colliders.push({ x, z, r: 0.4 });
      }
    }
    for (let z = -10; z <= -2; z += 2) {
      for (const x of [-28, -21]) {
        b.tube([x, 0, z], [x, 2.4, z], 0.05, 0.05, '#8b98ad', 4, false);
        colliders.push({ x, z, r: 0.4 });
      }
    }
    for (const y of [0.3, 1.2, 2.3]) {
      s.cell(-24, -6).soft.tube([-28, y, -10], [-21, y, -10], 0.025, 0.025, '#aeb4bd', 3, false);
      s.cell(-24, -6).soft.tube([-28, y, -2], [-21, y, -2], 0.025, 0.025, '#aeb4bd', 3, false);
      s.cell(-24, -6).soft.tube([-21, y, -10], [-21, y, -2], 0.025, 0.025, '#aeb4bd', 3, false);
      s.cell(-24, -6).soft.tube([-28, y, -10], [-28, y, -2], 0.025, 0.025, '#aeb4bd', 3, false);
    }
  }
  /* The nursery bench, the tap stand and the dispatch desk. */
  {
    const b = s.cell(14, -4).solid;
    b.rbox(14, 0.45, -4.4, 3, 0.12, 1.2, '#8a6341', 0.05);
    for (const x of [12.7, 15.3]) {
      b.tube([x, 0, -4.4], [x, 0.45, -4.4], 0.06, 0.06, '#7d5a3c', 4, false);
    }
    colliders.push({ x: 14, z: -4.4, r: 1.1 });
    const t = s.cell(-14, -14).solid;
    t.tube([-14, 0, -14], [-14, 1.1, -14], 0.08, 0.08, '#8b98ad', 5, false);
    t.tube([-14, 1.05, -14], [-14, 1.05, -13.6], 0.04, 0.04, '#8b98ad', 4, false);
    colliders.push({ x: -14, z: -14, r: 0.5 });
    const d = s.cell(-6, -20).solid;
    d.rbox(-6, 0.5, -19.6, 2.4, 1, 1, '#17304d', 0.2);
    d.rbox(-6, 1.05, -19.6, 2.2, 0.08, 0.9, '#dfeefc', 0.05);
    colliders.push({ x: -6, z: -19.6, r: 1.2 });
    /* A tree in the corner, where the sparrows are. */
    roundTree(s, 26, 0, -19, 1.1, rand);
    colliders.push({ x: 26, z: -19, r: 0.8 });
  }
  /* The fence, open at the gate. */
  {
    const fence = (x0: number, z0: number, x1: number, z1: number): void => {
      const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 4);
      for (let i = 0; i <= n; i += 1) {
        const x = x0 + ((x1 - x0) * i) / n;
        const z = z0 + ((z1 - z0) * i) / n;
        s.cell(x, z).solid.tube([x, 0, z], [x, 1.8, z], 0.06, 0.06, '#6b7488', 4, false);
        colliders.push({ x, z, r: 0.35 });
      }
      for (const y of [0.6, 1.6]) {
        s.cell((x0 + x1) / 2, (z0 + z1) / 2).soft.tube([x0, y, z0], [x1, y, z1], 0.03, 0.03, '#8b98ad', 4, false);
      }
    };
    fence(-30, -24, -5, -24);
    fence(5, -24, 30, -24);
    fence(-30, 24, 30, 24);
    fence(-30, -24, -30, 24);
    fence(30, -24, 30, 24);
  }
  for (let i = 0; i < 4; i += 1) {
    s.cell(0 + i * 4, -14).soft.rbox(1 + i * 4, 0.03, -14, 0.18, 0.04, 6, '#f2f2ee', 0.1);
  }
  /* Trees and houses outside. */
  for (let i = 0; i < 200; i += 1) {
    const x = -66 + rand() * 132;
    const z = -66 + rand() * 132;
    if ((Math.abs(x) < 34 && Math.abs(z) < 28) || (Math.abs(x) < 7 && z < 0)) {
      continue;
    }
    const y = height(x, z);
    const k = rand();
    if (k < 0.4) {
      tallTree(s, x, y, z, 0.85 + rand() * 0.4, rand, Math.floor(rand() * 3));
    } else if (k < 0.65) {
      roundTree(s, x, y, z, 1.1, rand);
    } else if (k < 0.8) {
      palm(s, x, y, z, 0.9, rand);
    } else {
      bush(s, x, y, z, 0.9, rand);
    }
  }
  const terrain = buildTerrain(r, {
    minX: -72,
    maxX: 72,
    minZ: -72,
    maxZ: 72,
    step: 2,
    height,
    color: (x, z, _h, slope) => {
      if (inYard(x, z)) {
        return (Math.floor(x / 8) + Math.floor(z / 8)) & 1 ? yardPaint : mix3(yardPaint, concrete, 0.5);
      }
      if (Math.abs(x) < 4.5 && z < 0) {
        return asphalt;
      }
      const patch = Math.sin(x * 0.2 + z * 0.13) * 0.2 + Math.sin(z * 0.27 - x * 0.08) * 0.2;
      return groundColor(9, patch, slope);
    },
  });
  const chunks = s.build(r);
  const cloudMesh = clouds(r, 63, 150);
  const images: ZoneImage[] = [
    { key: 'yardSign', x: -12, y: 5, z: 9.86, yaw: Math.PI, w: 8, h: 0.8 },
    { key: 'yardOffice', x: 22.5, y: 3.2, z: 7.88, yaw: Math.PI, w: 4, h: 0.45 },
  ];
  return {
    id: 'yard',
    geometry: { terrain, chunks, water: null },
    cloudMesh,
    env: DAY,
    height,
    colliders,
    walkable: (x, z) => (Math.abs(x) < 29.4 && Math.abs(z) < 23.4) || (Math.abs(x) < 4.2 && z < 0 && z > -44),
    spots,
    waterY: null,
    images,
    meshes: [terrain, cloudMesh, ...chunks.flatMap((c) => [c.solid, c.soft].filter((m): m is Mesh => m !== null))],
  };
}
