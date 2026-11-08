import type { FaunaKind } from '../core/progression';
import { MeshBuilder } from './gl/builder';
import { angleTo, ease, mat4, placement, type Vec3 } from './gl/math';
import type { Mesh, Renderer } from './gl/renderer';
import { Rig } from './gl/rig';

/**
 * The animals that live in the world: cute, chunky and moving all the time. Each kind has
 * one shared mesh on a small skeleton, and every animal has its own pose, so a flock never
 * moves in step. Behaviour is a short loop per kind (perch, hop, peck, fly, swim, hide),
 * and animals react to the team: small birds fly off, frogs hop into the water, macaques
 * keep their distance. Nothing here is handled or fed, and nothing goes on a traffic lane.
 */

interface Model {
  mesh: Mesh;
  pivots: Vec3[];
  parents: number[];
}

type Mode = 'ground' | 'perch' | 'fly' | 'hop' | 'loop' | 'soar' | 'wade' | 'hover' | 'dart' | 'swim' | 'leap' | 'sit' | 'walk' | 'hide' | 'flutter' | 'land';

export interface Agent {
  id: number;
  kind: FaunaKind;
  model: Model;
  rig: Rig;
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale: number;
  /** Where it lives, and how far it wanders. */
  hx: number;
  hz: number;
  range: number;
  mode: Mode;
  /** What it does when the current move ends. */
  after: Mode;
  t: number;
  dur: number;
  /** A per-animal offset, so no two move together. */
  k: number;
  sx: number;
  sy: number;
  sz: number;
  tx: number;
  ty: number;
  tz: number;
  arc: number;
  flap: number;
  peck: number;
  look: number;
  lookTo: number;
  flick: number;
  squash: number;
  /** Seconds of reacting to a photo: a look, a hop, a flutter. */
  noticed: number;
  /** Seconds of holding still for the camera: no wandering, no flying off. */
  still: number;
  shown: boolean;
  when: (() => boolean) | null;
  tag: string;
  /** Kept for animals that sit in one tree, like the owl. */
  perch: Vec3 | null;
}

export interface FaunaSpawn {
  kind: FaunaKind;
  n: number;
  at: [number, number];
  r: number;
  /** Shown only while this is true: wildlife that returns once a creek runs clean. */
  when?: () => boolean;
  tag?: string;
  /** Height for flyers that loop or soar. */
  height?: number;
}

/** What the animals need to know about the place. */
export interface FaunaWorld {
  height: (x: number, z: number) => number;
  waterY: number | null;
  /** Deep enough for a fish. */
  water: (x: number, z: number) => boolean;
  /** Fine for an animal on foot: not water, not inside anything, not a traffic lane. */
  land: (x: number, z: number) => boolean;
  perches: readonly Vec3[];
  flowers: readonly Vec3[];
  burst: (kind: 'splash' | 'sparkle' | 'leaf', x: number, y: number, z: number, n: number) => void;
}

/* Cartoon sizes: bigger than life, so the animals read from the play camera. */
const SIZE: Record<FaunaKind, number> = {
  sparrow: 2.2,
  bulbul: 2.2,
  fantail: 2.2,
  kingfisher: 2.1,
  swallow: 2.2,
  butterfly: 2.5,
  dragonfly: 2.2,
  frog: 2.1,
  fish: 2.2,
  gecko: 2.3,
  egret: 1.55,
  macaque: 1.6,
  eagle: 1.9,
  owl: 1.7,
};

/* ---- Models ---- */

/** A big, friendly cartoon eye: white, a dark pupil looking forward, and a glint. */
function eye(b: MeshBuilder, x: number, y: number, z: number, r: number): void {
  const side = Math.sign(x) || 1;
  b.ball(x, y, z, r, '#ffffff', 4, 7);
  b.ball(x + side * r * 0.32, y + r * 0.05, z + r * 0.62, r * 0.6, '#1f1a17', 4, 6);
  b.ball(x + side * r * 0.45, y + r * 0.42, z + r * 0.92, r * 0.2, '#ffffff', 2, 4);
}

interface BirdLook {
  back: string;
  belly: string;
  head: string;
  wing: string;
  tail: string;
  bill: string;
  legs: string;
  billLen: number;
  headR: number;
  tailLen: number;
  tailFan?: boolean;
  tailFork?: boolean;
  crest?: string;
  cheek?: boolean;
  brow?: string;
  collar?: string;
  vent?: string;
  throat?: string;
  tailEdge?: string;
  /** Swallows fly with their wings held out. */
  spread?: boolean;
}

const BIRD_PIVOTS: Vec3[] = [
  [0, 0.17, 0],
  [0, 0.25, 0.06],
  [-0.06, 0.2, 0.02],
  [0.06, 0.2, 0.02],
  [0, 0.16, -0.08],
  [0, 0.1, 0.01],
];

function songbird(r: Renderer, L: BirdLook): Model {
  const b = new MeshBuilder();
  b.bone = 5;
  for (const sx of [-1, 1]) {
    b.tube([sx * 0.03, 0.11, 0.01], [sx * 0.033, 0.012, 0.025], 0.01, 0.008, L.legs, 4, false);
    b.ellipsoid(sx * 0.033, 0.01, 0.042, 0.017, 0.008, 0.03, L.legs, { rows: 2, cols: 5 });
  }
  b.bone = 0;
  b.ellipsoid(0, 0.17, -0.005, 0.08, 0.078, 0.105, L.back, { rows: 6, cols: 10 });
  b.ellipsoid(0, 0.15, 0.025, 0.066, 0.064, 0.08, L.belly, { rows: 5, cols: 8 });
  if (L.vent !== undefined) {
    b.ellipsoid(0, 0.125, -0.07, 0.045, 0.032, 0.045, L.vent, { rows: 3, cols: 6 });
  }
  b.bone = 1;
  const hr = L.headR;
  const hy = 0.27;
  const hz = 0.07;
  b.ball(0, hy, hz, hr, L.head, 6, 10);
  eye(b, -hr * 0.6, hy + hr * 0.18, hz + hr * 0.62, hr * 0.36);
  eye(b, hr * 0.6, hy + hr * 0.18, hz + hr * 0.62, hr * 0.36);
  b.tube([0, hy - hr * 0.1, hz + hr * 0.85], [0, hy - hr * 0.22, hz + hr * 0.85 + L.billLen], hr * 0.3, 0.004, L.bill, 6, true);
  if (L.crest !== undefined) {
    b.tube([0, hy + hr * 0.8, hz - hr * 0.1], [0, hy + hr * 1.55, hz - hr * 0.55], hr * 0.42, 0.005, L.crest, 6, true);
  }
  if (L.cheek === true) {
    for (const sx of [-1, 1]) {
      b.ellipsoid(sx * hr * 0.86, hy - hr * 0.2, hz + hr * 0.1, hr * 0.18, hr * 0.42, hr * 0.48, '#f4efe4', { rows: 3, cols: 6 });
      b.ball(sx * hr * 0.96, hy - hr * 0.22, hz + hr * 0.08, hr * 0.17, '#1f1a17', 3, 5);
    }
  }
  if (L.brow !== undefined) {
    for (const sx of [-1, 1]) {
      b.ellipsoid(sx * hr * 0.55, hy + hr * 0.62, hz + hr * 0.5, hr * 0.16, hr * 0.1, hr * 0.42, L.brow, { rows: 2, cols: 5 });
    }
  }
  if (L.collar !== undefined) {
    b.ellipsoid(0, hy - hr * 0.78, hz - hr * 0.1, hr * 1.02, hr * 0.26, hr * 0.92, L.collar, { rows: 3, cols: 8 });
  }
  if (L.throat !== undefined) {
    b.ellipsoid(0, hy - hr * 0.45, hz + hr * 0.62, hr * 0.55, hr * 0.42, hr * 0.38, L.throat, { rows: 3, cols: 6 });
  }
  for (const [bone, sx] of [[2, -1], [3, 1]] as [number, number][]) {
    b.bone = bone;
    if (L.spread === true) {
      b.ellipsoid(sx * 0.17, 0.2, -0.01, 0.16, 0.014, 0.05, L.wing, { rows: 3, cols: 8, yaw: sx * 0.35 });
    } else {
      b.ellipsoid(sx * 0.072, 0.19, -0.02, 0.024, 0.07, 0.085, L.wing, { rows: 4, cols: 7 });
    }
  }
  b.bone = 4;
  const tz = -0.09 - L.tailLen * 0.5;
  if (L.tailFork === true) {
    for (const sx of [-1, 1]) {
      b.ellipsoid(sx * 0.02, 0.165, tz, 0.016, 0.009, L.tailLen * 0.6, L.tail, { rows: 2, cols: 5, yaw: sx * 0.2 });
    }
  } else if (L.tailFan === true) {
    b.ellipsoid(0, 0.165, tz, 0.055, 0.011, L.tailLen * 0.55, L.tail, { rows: 3, cols: 7 });
    if (L.tailEdge !== undefined) {
      for (const sx of [-1, 1]) {
        b.ellipsoid(sx * 0.05, 0.166, tz - 0.01, 0.012, 0.012, L.tailLen * 0.5, L.tailEdge, { rows: 2, cols: 5 });
      }
    }
  } else {
    b.ellipsoid(0, 0.165, tz, 0.034, 0.011, L.tailLen * 0.5, L.tail, { rows: 3, cols: 6 });
  }
  return { mesh: r.mesh(b, true), pivots: BIRD_PIVOTS, parents: [-1, 0, 0, 0, 0, -1] };
}

function egretModel(r: Renderer): Model {
  const b = new MeshBuilder();
  const white = '#f7f7f2';
  b.bone = 5;
  for (const sx of [-1, 1]) {
    b.tube([sx * 0.05, 0.47, 0], [sx * 0.055, 0.02, 0.02], 0.018, 0.015, '#2b2b30', 5, false);
    b.ellipsoid(sx * 0.055, 0.012, 0.06, 0.03, 0.01, 0.07, '#e8c440', { rows: 2, cols: 5 });
  }
  b.bone = 0;
  b.ellipsoid(0, 0.57, -0.02, 0.13, 0.12, 0.22, white, { rows: 7, cols: 10 });
  b.bone = 1;
  b.tube([0, 0.62, 0.12], [0, 0.78, 0.16], 0.048, 0.042, white, 7, false);
  b.tube([0, 0.78, 0.16], [0, 0.9, 0.13], 0.042, 0.04, white, 7, false);
  b.ball(0, 0.93, 0.15, 0.07, white, 6, 9);
  eye(b, -0.042, 0.95, 0.19, 0.024);
  eye(b, 0.042, 0.95, 0.19, 0.024);
  b.tube([0, 0.925, 0.2], [0, 0.912, 0.37], 0.022, 0.004, '#f2b632', 6, true);
  for (const [bone, sx] of [[2, -1], [3, 1]] as [number, number][]) {
    b.bone = bone;
    b.ellipsoid(sx * 0.12, 0.59, -0.04, 0.03, 0.1, 0.2, '#efefe8', { rows: 4, cols: 8 });
  }
  b.bone = 4;
  b.ellipsoid(0, 0.55, -0.25, 0.07, 0.02, 0.09, white, { rows: 3, cols: 6 });
  return {
    mesh: r.mesh(b, true),
    pivots: [
      [0, 0.56, 0],
      [0, 0.62, 0.12],
      [-0.12, 0.6, 0.02],
      [0.12, 0.6, 0.02],
      [0, 0.55, -0.2],
      [0, 0.47, 0],
    ],
    parents: [-1, 0, 0, 0, 0, -1],
  };
}

/** A Philippine eagle, soaring: shaggy crest, pale underparts, a big blue-grey bill. */
function eagleModel(r: Renderer): Model {
  const b = new MeshBuilder();
  const brown = '#6b4a2e';
  b.bone = 5;
  b.ellipsoid(0, -0.14, -0.06, 0.07, 0.04, 0.08, '#e8c440', { rows: 2, cols: 5 });
  b.bone = 0;
  b.ellipsoid(0, 0, 0, 0.18, 0.16, 0.42, brown, { rows: 7, cols: 10 });
  b.ellipsoid(0, -0.05, 0.06, 0.15, 0.12, 0.33, '#efe4cf', { rows: 6, cols: 9 });
  b.bone = 1;
  b.ball(0, 0.07, 0.42, 0.15, '#caa36d', 6, 10);
  for (let i = 0; i < 5; i += 1) {
    const a = -0.6 + i * 0.3;
    b.tube([Math.sin(a) * 0.08, 0.16, 0.36], [Math.sin(a) * 0.16, 0.27, 0.22], 0.04, 0.006, '#b88a52', 5, true);
  }
  eye(b, -0.085, 0.1, 0.5, 0.035);
  eye(b, 0.085, 0.1, 0.5, 0.035);
  b.tube([0, 0.06, 0.55], [0, 0.0, 0.7], 0.065, 0.014, '#8796a8', 7, true);
  for (const [bone, sx] of [[2, -1], [3, 1]] as [number, number][]) {
    b.bone = bone;
    b.ellipsoid(sx * 0.72, 0.02, 0.0, 0.6, 0.035, 0.24, '#5e3f26', { rows: 4, cols: 10 });
    b.ellipsoid(sx * 1.28, 0.02, -0.05, 0.2, 0.03, 0.17, '#3f2a1a', { rows: 3, cols: 7 });
    b.ellipsoid(sx * 0.6, -0.02, 0.03, 0.45, 0.02, 0.15, '#efe4cf', { rows: 3, cols: 8 });
  }
  b.bone = 4;
  b.ellipsoid(0, 0, -0.58, 0.13, 0.03, 0.24, '#5e3f26', { rows: 3, cols: 7 });
  return {
    mesh: r.mesh(b, true),
    pivots: [
      [0, 0, 0],
      [0, 0.06, 0.34],
      [-0.16, 0.02, 0.04],
      [0.16, 0.02, 0.04],
      [0, 0, -0.32],
      [0, -0.1, 0],
    ],
    parents: [-1, 0, 0, 0, 0, 0],
  };
}

/** A Philippine eagle-owl, roosting: ear tufts and a round face. */
function owlModel(r: Renderer): Model {
  const b = new MeshBuilder();
  const brown = '#8a6340';
  b.bone = 5;
  for (const sx of [-1, 1]) {
    b.ellipsoid(sx * 0.055, 0.07, 0.07, 0.045, 0.03, 0.055, '#9a8a6a', { rows: 3, cols: 5 });
  }
  b.bone = 0;
  b.ellipsoid(0, 0.3, 0, 0.17, 0.2, 0.15, brown, { rows: 7, cols: 10 });
  b.ellipsoid(0, 0.27, 0.06, 0.13, 0.16, 0.1, '#c9a77c', { rows: 6, cols: 9 });
  b.bone = 1;
  b.ball(0, 0.56, 0.02, 0.15, brown, 7, 10);
  b.ellipsoid(0, 0.55, 0.11, 0.12, 0.1, 0.05, '#dcc39c', { rows: 4, cols: 8 });
  for (const sx of [-1, 1]) {
    b.tube([sx * 0.07, 0.66, 0], [sx * 0.12, 0.79, -0.03], 0.038, 0.006, '#6f4d30', 5, true);
  }
  eye(b, -0.055, 0.57, 0.13, 0.044);
  eye(b, 0.055, 0.57, 0.13, 0.044);
  b.tube([0, 0.53, 0.15], [0, 0.49, 0.185], 0.022, 0.004, '#3a3330', 5, true);
  for (const [bone, sx] of [[2, -1], [3, 1]] as [number, number][]) {
    b.bone = bone;
    b.ellipsoid(sx * 0.16, 0.3, -0.02, 0.045, 0.16, 0.13, '#6f4d30', { rows: 4, cols: 8 });
  }
  b.bone = 4;
  b.ellipsoid(0, 0.14, -0.13, 0.08, 0.03, 0.09, '#6f4d30', { rows: 3, cols: 6 });
  return {
    mesh: r.mesh(b, true),
    pivots: [
      [0, 0.28, 0],
      [0, 0.48, 0.02],
      [-0.15, 0.38, 0],
      [0.15, 0.38, 0],
      [0, 0.16, -0.1],
      [0, 0.08, 0.04],
    ],
    parents: [-1, 0, 0, 0, 0, -1],
  };
}

function butterflyModel(r: Renderer, fore: string, hind: string, spot: string): Model {
  const b = new MeshBuilder();
  b.bone = 0;
  b.tube([0, 0, -0.075], [0, 0, 0.07], 0.02, 0.014, '#3a2a1c', 5, true);
  b.ball(0, 0.006, 0.085, 0.024, '#3a2a1c', 4, 6);
  for (const sx of [-1, 1]) {
    b.tube([sx * 0.006, 0.014, 0.095], [sx * 0.035, 0.05, 0.16], 0.004, 0.003, '#3a2a1c', 3, false);
    b.ball(sx * 0.035, 0.05, 0.16, 0.01, '#3a2a1c', 2, 4);
  }
  for (const [bone, sx] of [[1, -1], [2, 1]] as [number, number][]) {
    b.bone = bone;
    b.ellipsoid(sx * 0.105, 0, 0.035, 0.105, 0.007, 0.08, fore, { rows: 3, cols: 8, yaw: sx * 0.35 });
    b.ellipsoid(sx * 0.08, -0.002, -0.05, 0.075, 0.007, 0.058, hind, { rows: 3, cols: 7, yaw: -sx * 0.3 });
    b.ellipsoid(sx * 0.13, 0.005, 0.05, 0.028, 0.008, 0.022, spot, { rows: 2, cols: 5 });
  }
  return {
    mesh: r.mesh(b, false),
    pivots: [
      [0, 0, 0],
      [-0.012, 0, 0],
      [0.012, 0, 0],
    ],
    parents: [-1, 0, 0],
  };
}

function dragonflyModel(r: Renderer, body: string): Model {
  const b = new MeshBuilder();
  b.bone = 0;
  b.tube([0, 0, -0.3], [0, 0, 0.04], 0.016, 0.022, body, 5, true);
  b.ellipsoid(0, 0, 0.07, 0.032, 0.032, 0.05, body, { rows: 4, cols: 6 });
  b.ball(0, 0.008, 0.125, 0.034, body, 4, 6);
  for (const sx of [-1, 1]) {
    b.ball(sx * 0.026, 0.02, 0.14, 0.026, '#16233f', 3, 6);
    b.ball(sx * 0.032, 0.03, 0.155, 0.008, '#ffffff', 2, 4);
  }
  for (const [bone, sx] of [[1, -1], [2, 1]] as [number, number][]) {
    b.bone = bone;
    b.ellipsoid(sx * 0.14, 0.012, 0.07, 0.14, 0.004, 0.028, '#e3f5ff', { rows: 2, cols: 7 });
    b.ellipsoid(sx * 0.13, 0.012, 0.01, 0.13, 0.004, 0.028, '#d4efff', { rows: 2, cols: 7 });
  }
  return {
    mesh: r.mesh(b, false),
    pivots: [
      [0, 0, 0],
      [-0.01, 0.012, 0.04],
      [0.01, 0.012, 0.04],
    ],
    parents: [-1, 0, 0],
  };
}

function frogModel(r: Renderer): Model {
  const b = new MeshBuilder();
  const green = '#5ebf56';
  const dark = '#3f9f4d';
  b.bone = 2;
  for (const sx of [-1, 1]) {
    b.ellipsoid(sx * 0.095, 0.055, -0.05, 0.045, 0.04, 0.085, green, { rows: 4, cols: 6 });
    b.ellipsoid(sx * 0.11, 0.012, 0.03, 0.04, 0.012, 0.06, dark, { rows: 2, cols: 5 });
  }
  b.bone = 3;
  for (const sx of [-1, 1]) {
    b.tube([sx * 0.055, 0.075, 0.08], [sx * 0.065, 0.008, 0.115], 0.016, 0.014, green, 4, false);
    b.ellipsoid(sx * 0.068, 0.006, 0.13, 0.025, 0.008, 0.025, dark, { rows: 2, cols: 5 });
  }
  b.bone = 0;
  b.ellipsoid(0, 0.1, 0, 0.115, 0.085, 0.13, green, { rows: 6, cols: 9 });
  b.ellipsoid(0, 0.075, 0.03, 0.085, 0.055, 0.09, '#e8f5c8', { rows: 4, cols: 7 });
  b.bone = 1;
  b.ellipsoid(0, 0.135, 0.1, 0.1, 0.065, 0.075, green, { rows: 5, cols: 8 });
  eye(b, -0.055, 0.19, 0.1, 0.038);
  eye(b, 0.055, 0.19, 0.1, 0.038);
  b.ellipsoid(0, 0.122, 0.168, 0.05, 0.006, 0.012, '#2f7a3a', { rows: 2, cols: 5 });
  b.bone = 4;
  b.ellipsoid(0, 0.095, 0.13, 0.055, 0.035, 0.04, '#f2f8d8', { rows: 3, cols: 6 });
  return {
    mesh: r.mesh(b, true),
    pivots: [
      [0, 0.1, 0],
      [0, 0.13, 0.06],
      [0, 0.07, -0.06],
      [0, 0.07, 0.07],
      [0, 0.1, 0.12],
    ],
    parents: [-1, 0, 0, 0, 0],
  };
}

function fishModel(r: Renderer): Model {
  const b = new MeshBuilder();
  b.bone = 0;
  b.ellipsoid(0, 0, 0, 0.05, 0.065, 0.135, '#9cc0cf', { rows: 6, cols: 9 });
  b.ellipsoid(0, 0.025, -0.005, 0.042, 0.045, 0.12, '#5d8fa6', { rows: 5, cols: 8 });
  b.ellipsoid(0, 0.075, -0.015, 0.009, 0.04, 0.055, '#4b7c94', { rows: 3, cols: 5 });
  eye(b, -0.034, 0.012, 0.075, 0.019);
  eye(b, 0.034, 0.012, 0.075, 0.019);
  b.bone = 1;
  b.ellipsoid(0, 0.02, -0.185, 0.009, 0.045, 0.04, '#4b7c94', { rows: 3, cols: 5, tiltX: 0.5 });
  b.ellipsoid(0, -0.02, -0.185, 0.009, 0.045, 0.04, '#4b7c94', { rows: 3, cols: 5, tiltX: -0.5 });
  return {
    mesh: r.mesh(b, true),
    pivots: [
      [0, 0, 0],
      [0, 0, -0.11],
    ],
    parents: [-1, 0],
  };
}

function geckoModel(r: Renderer): Model {
  const b = new MeshBuilder();
  const skin = '#dccba6';
  b.bone = 2;
  for (const [sx, z] of [[-1, 0.05], [1, 0.05], [-1, -0.05], [1, -0.05]] as [number, number][]) {
    b.tube([sx * 0.03, 0.02, z], [sx * 0.065, 0.004, z + 0.015], 0.01, 0.008, skin, 4, false);
    b.ball(sx * 0.068, 0.004, z + 0.018, 0.012, '#c9b88f', 2, 4);
  }
  b.bone = 0;
  b.ellipsoid(0, 0.025, 0, 0.04, 0.024, 0.085, skin, { rows: 4, cols: 7 });
  b.ellipsoid(0, 0.03, 0.1, 0.034, 0.024, 0.04, skin, { rows: 4, cols: 6 });
  eye(b, -0.026, 0.042, 0.11, 0.014);
  eye(b, 0.026, 0.042, 0.11, 0.014);
  b.bone = 1;
  b.tube([0, 0.025, -0.07], [0, 0.02, -0.22], 0.022, 0.004, skin, 5, true);
  return {
    mesh: r.mesh(b, true),
    pivots: [
      [0, 0.025, 0],
      [0, 0.025, -0.07],
      [0, 0.02, 0],
    ],
    parents: [-1, 0, 0],
  };
}

function macaqueModel(r: Renderer): Model {
  const b = new MeshBuilder();
  const fur = '#a08c6c';
  const face = '#e6b8a0';
  const dark = '#5a4a3a';
  b.bone = 7;
  b.tube([0, 0.18, -0.12], [0, 0.06, -0.34], 0.026, 0.014, fur, 5, false);
  b.tube([0, 0.06, -0.34], [0.06, 0.03, -0.55], 0.014, 0.008, fur, 5, true);
  for (const [bone, sx] of [[5, -1], [6, 1]] as [number, number][]) {
    b.bone = bone;
    b.tube([sx * 0.08, 0.2, 0.02], [sx * 0.1, 0.09, 0.14], 0.045, 0.035, fur, 6, false);
    b.ellipsoid(sx * 0.1, 0.035, 0.16, 0.034, 0.028, 0.055, dark, { rows: 3, cols: 5 });
  }
  b.bone = 0;
  b.ellipsoid(0, 0.2, -0.02, 0.12, 0.1, 0.12, fur, { rows: 5, cols: 8 });
  b.bone = 1;
  b.ellipsoid(0, 0.36, 0, 0.11, 0.15, 0.1, fur, { rows: 6, cols: 8 });
  b.ellipsoid(0, 0.35, 0.05, 0.08, 0.11, 0.06, '#c4b08e', { rows: 4, cols: 7 });
  for (const [bone, sx] of [[3, -1], [4, 1]] as [number, number][]) {
    b.bone = bone;
    b.tube([sx * 0.1, 0.45, 0.03], [sx * 0.12, 0.25, 0.08], 0.032, 0.026, fur, 5, false);
    b.ball(sx * 0.12, 0.23, 0.09, 0.032, dark, 3, 5);
  }
  b.bone = 2;
  b.ball(0, 0.56, 0.04, 0.1, fur, 6, 9);
  b.ellipsoid(0, 0.54, 0.11, 0.075, 0.07, 0.04, face, { rows: 4, cols: 7 });
  b.ellipsoid(0, 0.51, 0.14, 0.042, 0.032, 0.03, face, { rows: 3, cols: 6 });
  for (const sx of [-1, 1]) {
    b.ball(sx * 0.03, 0.565, 0.145, 0.017, '#2a1f18', 3, 5);
    b.ball(sx * 0.034, 0.572, 0.158, 0.005, '#ffffff', 2, 3);
    b.ball(sx * 0.092, 0.565, 0.03, 0.026, face, 3, 5);
  }
  b.ellipsoid(0, 0.64, 0.02, 0.06, 0.028, 0.06, '#7a6a50', { rows: 3, cols: 6 });
  return {
    mesh: r.mesh(b, true),
    pivots: [
      [0, 0.2, 0],
      [0, 0.24, 0],
      [0, 0.5, 0.04],
      [-0.1, 0.45, 0.03],
      [0.1, 0.45, 0.03],
      [-0.08, 0.2, 0.02],
      [0.08, 0.2, 0.02],
      [0, 0.18, -0.1],
    ],
    parents: [-1, 0, 1, 1, 1, 0, 0, 0],
  };
}

function buildModels(r: Renderer): Record<string, Model> {
  const m: Record<string, Model> = {};
  m.sparrow = songbird(r, { back: '#9a6b42', belly: '#ecdfc8', head: '#7a4024', wing: '#7d5534', tail: '#6b4a2f', bill: '#3a2a1c', legs: '#c9906a', billLen: 0.03, headR: 0.064, tailLen: 0.1, cheek: true });
  m.bulbul = songbird(r, { back: '#8a7a58', belly: '#f1ead6', head: '#4f4232', wing: '#7a6a4a', tail: '#6a5a40', bill: '#2a241e', legs: '#5a4a3a', billLen: 0.032, headR: 0.062, tailLen: 0.13, crest: '#3d3226', vent: '#ffd23a' });
  m.fantail = songbird(r, { back: '#26282f', belly: '#f6f3ec', head: '#1f2128', wing: '#2c2f38', tail: '#22242b', bill: '#1a1a1e', legs: '#2a2a30', billLen: 0.024, headR: 0.06, tailLen: 0.17, tailFan: true, tailEdge: '#f6f3ec', brow: '#f6f3ec' });
  m.kingfisher = songbird(r, { back: '#1aa3c8', belly: '#ffffff', head: '#1b8fc2', wing: '#178ac0', tail: '#1478b0', bill: '#2a2a30', legs: '#3a3a40', billLen: 0.11, headR: 0.075, tailLen: 0.09, collar: '#ffffff' });
  m.swallow = songbird(r, { back: '#1d2a52', belly: '#f2efe6', head: '#1d2a52', wing: '#1a2448', tail: '#1a2448', bill: '#1a1a1e', legs: '#2a2a30', billLen: 0.016, headR: 0.058, tailLen: 0.16, tailFork: true, throat: '#c0462a', spread: true });
  m.egret = egretModel(r);
  m.eagle = eagleModel(r);
  m.owl = owlModel(r);
  m.butterfly0 = butterflyModel(r, '#ff9a3c', '#ffd24a', '#3a2a1c');
  m.butterfly1 = butterflyModel(r, '#3d8bff', '#9fd0ff', '#ffffff');
  m.butterfly2 = butterflyModel(r, '#ffe14a', '#fff3a6', '#ff9a3c');
  m.butterfly3 = butterflyModel(r, '#ffffff', '#f2f2f2', '#2a2a30');
  m.butterfly4 = butterflyModel(r, '#ff6fae', '#ffc2dc', '#ffffff');
  m.dragonfly0 = dragonflyModel(r, '#1e88e5');
  m.dragonfly1 = dragonflyModel(r, '#e2452f');
  m.frog = frogModel(r);
  m.fish = fishModel(r);
  m.gecko = geckoModel(r);
  m.macaque = macaqueModel(r);
  return m;
}

/* ---- The animals ---- */

const rand = (a: number, b: number): number => a + Math.random() * (b - a);
const smoothStep = (k: number): number => k * k * (3 - 2 * k);

const SONGBIRDS: readonly FaunaKind[] = ['sparrow', 'bulbul', 'fantail', 'kingfisher'];
/** How much each songbird likes a tree over the ground. */
const PERCHY: Partial<Record<FaunaKind, number>> = { sparrow: 0.25, bulbul: 0.7, fantail: 0.15, kingfisher: 0.85 };
/** How close the team may come before an animal moves off. */
const SHY: Partial<Record<FaunaKind, number>> = { sparrow: 3.4, bulbul: 3.6, fantail: 2.8, kingfisher: 4.5, egret: 4.6, frog: 2.6, macaque: 5.2, gecko: 1.8, butterfly: 1.4 };

export class Fauna {
  agents: Agent[] = [];
  private models: Record<string, Model> | null = null;
  private readonly m = mat4();
  private world: FaunaWorld | null = null;
  private next = 0;
  /** Off for a gentle, slower world. */
  reduceMotion = false;

  constructor(private readonly r: Renderer) {}

  private model(kind: FaunaKind, i: number): Model {
    if (this.models === null) {
      this.models = buildModels(this.r);
    }
    if (kind === 'butterfly') {
      return this.models[`butterfly${i % 5}`];
    }
    if (kind === 'dragonfly') {
      return this.models[`dragonfly${i % 2}`];
    }
    return this.models[kind];
  }

  clear(world: FaunaWorld | null = null): void {
    this.agents = [];
    this.world = world;
  }

  /** Adds animals near a spot, each starting somewhere that suits it. */
  spawn(s: FaunaSpawn): Agent[] {
    const w = this.world;
    if (w === null) {
      return [];
    }
    const out: Agent[] = [];
    for (let i = 0; i < s.n; i += 1) {
      const model = this.model(s.kind, this.next + i);
      const a: Agent = {
        id: this.next,
        kind: s.kind,
        model,
        rig: new Rig(model.pivots, model.parents),
        x: s.at[0],
        y: 0,
        z: s.at[1],
        yaw: Math.random() * 6.28,
        scale: SIZE[s.kind] * rand(0.92, 1.08),
        hx: s.at[0],
        hz: s.at[1],
        range: s.r,
        mode: 'ground',
        after: 'ground',
        t: 0,
        dur: rand(0.5, 2.5),
        k: Math.random() * 100,
        sx: 0,
        sy: 0,
        sz: 0,
        tx: 0,
        ty: s.height ?? 0,
        tz: 0,
        arc: 0,
        flap: 0,
        peck: 0,
        look: 0,
        lookTo: 0,
        flick: 0,
        squash: 0,
        noticed: 0,
        still: 0,
        shown: true,
        when: s.when ?? null,
        tag: s.tag ?? '',
        perch: null,
      };
      this.next += 1;
      this.place(a, s.height);
      a.shown = a.when === null || a.when();
      this.agents.push(a);
      out.push(a);
    }
    return out;
  }

  /** A random point near home that passes a test, or null. */
  private pick(a: Agent, test: (x: number, z: number) => boolean, r = a.range, cx = a.hx, cz = a.hz): [number, number] | null {
    for (let i = 0; i < 30; i += 1) {
      const ang = Math.random() * 6.283;
      const d = Math.sqrt(Math.random()) * r;
      const x = cx + Math.cos(ang) * d;
      const z = cz + Math.sin(ang) * d;
      if (test(x, z)) {
        return [x, z];
      }
    }
    return null;
  }

  private perchesNear(a: Agent): Vec3[] {
    const w = this.world as FaunaWorld;
    return w.perches.filter((p) => Math.hypot(p[0] - a.hx, p[2] - a.hz) < a.range + 2);
  }

  /** A perch for a small bird: a low one (a bush, a rock, a stump) most of the time, so it stays in view. */
  private pickPerch(a: Agent, list: readonly Vec3[]): Vec3 {
    const low = list.filter((p) => p[1] - this.ground(p[0], p[2]) < 3.2);
    const from = low.length > 0 && (Math.random() < 0.8 || low.length === list.length) ? low : list;
    return from[Math.floor(Math.random() * from.length)];
  }

  private flowersNear(a: Agent): Vec3[] {
    const w = this.world as FaunaWorld;
    return w.flowers.filter((p) => Math.hypot(p[0] - a.hx, p[2] - a.hz) < a.range + 1);
  }

  private ground(x: number, z: number): number {
    return (this.world as FaunaWorld).height(x, z);
  }

  /** Near water but on dry land: a bank, for frogs and wading birds. */
  private bank(x: number, z: number): boolean {
    const w = this.world as FaunaWorld;
    if (!w.land(x, z) || w.waterY === null) {
      return w.land(x, z);
    }
    return w.height(x, z) < w.waterY + 0.9;
  }

  private place(a: Agent, height?: number): void {
    const w = this.world as FaunaWorld;
    const at = (p: [number, number] | null): void => {
      /* Nothing suitable near home: look further out rather than start somewhere wrong, like the creek bed. */
      const q = p ?? this.pick(a, w.land, a.range * 3 + 6);
      if (q !== null) {
        a.x = q[0];
        a.z = q[1];
      }
      a.y = this.ground(a.x, a.z);
    };
    switch (a.kind) {
      case 'swallow':
        a.mode = 'loop';
        a.ty = height ?? 6;
        break;
      case 'eagle':
        a.mode = 'soar';
        a.ty = height ?? 16;
        break;
      case 'owl': {
        /* The nearest tree-top to its home, however far: an owl roosts in a tree, never on the ground. A tree
           with open space round it, so it can be seen and photographed rather than buried in other crowns. */
        const high = w.perches.filter((q) => q[1] - this.ground(q[0], q[2]) > 3.5);
        const open = high.filter((q) => !high.some((o) => { const d = Math.hypot(o[0] - q[0], o[2] - q[2]); return (d > 2.9 && d < 6) || (d <= 2.9 && o[1] > q[1] + 0.2); }));
        const ps = open.length > 0 ? open : high;
        const p = ps.length === 0 ? null : ps.reduce((best, q) => (Math.hypot(q[0] - a.hx, q[2] - a.hz) < Math.hypot(best[0] - a.hx, best[2] - a.hz) ? q : best));
        a.perch = p;
        a.mode = 'perch';
        if (p !== null) {
          [a.x, a.y, a.z] = p;
          a.y -= 0.35;
        } else {
          at(null);
        }
        break;
      }
      case 'butterfly': {
        const fl = this.flowersNear(a);
        const f = fl.length > 0 ? fl[Math.floor(Math.random() * fl.length)] : null;
        if (f !== null) {
          [a.x, a.y, a.z] = f;
          a.y += 0.6;
        } else {
          at(this.pick(a, w.land));
          a.y += 1;
        }
        a.mode = 'flutter';
        this.flutterTo(a);
        break;
      }
      case 'dragonfly': {
        at(this.pick(a, w.waterY !== null ? w.water : w.land));
        a.y = (w.waterY ?? a.y) + rand(0.5, 1.1);
        a.mode = 'hover';
        break;
      }
      case 'fish':
        at(this.pick(a, w.water));
        a.mode = 'swim';
        a.y = (w.waterY ?? 0) - 0.05;
        this.swimTo(a);
        break;
      case 'frog':
        at(this.pick(a, (x, z) => this.bank(x, z)));
        a.mode = 'sit';
        break;
      case 'egret':
        at(this.pick(a, (x, z) => this.bank(x, z)));
        a.mode = 'wade';
        break;
      case 'macaque':
      case 'gecko':
        at(this.pick(a, w.land));
        a.mode = 'sit';
        break;
      default: {
        /* Songbirds: in a tree, or on the ground. */
        const ps = this.perchesNear(a);
        if (ps.length > 0 && Math.random() < (PERCHY[a.kind] ?? 0.3)) {
          const p = this.pickPerch(a, ps);
          [a.x, a.y, a.z] = p;
          a.mode = 'perch';
        } else {
          at(this.pick(a, w.land));
          a.mode = 'ground';
        }
        break;
      }
    }
  }

  /* ---- Moving ---- */

  /** Starts a hop or a flight to a point, with an arc. */
  private go(a: Agent, x: number, y: number, z: number, speed: number, arc: number, mode: Mode, after: Mode): void {
    a.sx = a.x;
    a.sy = a.y;
    a.sz = a.z;
    a.tx = x;
    a.ty = y;
    a.tz = z;
    a.arc = arc;
    a.mode = mode;
    a.after = after;
    a.t = 0;
    a.dur = Math.max(0.25, Math.hypot(x - a.x, y - a.y, z - a.z) / speed);
    a.yaw = Math.atan2(x - a.x, z - a.z);
  }

  private flyAway(a: Agent, from: { x: number; z: number } | null): void {
    const w = this.world as FaunaWorld;
    const ps = this.perchesNear(a);
    const away = (x: number, z: number): boolean => from === null || Math.hypot(x - from.x, z - from.z) > 6;
    const usePerch = ps.length > 0 && Math.random() < 0.6 + (PERCHY[a.kind] ?? 0) * 0.3;
    if (usePerch) {
      const choices = ps.filter((p) => away(p[0], p[2]));
      const p = this.pickPerch(a, choices.length > 0 ? choices : ps);
      this.go(a, p[0], p[1], p[2], 6, 1.6, 'fly', 'perch');
      return;
    }
    const g = this.pick(a, (x, z) => w.land(x, z) && away(x, z));
    if (g !== null) {
      this.go(a, g[0], this.ground(g[0], g[1]), g[1], 5.5, 2.2, 'fly', 'ground');
    }
  }

  private flutterTo(a: Agent): void {
    const fl = this.flowersNear(a);
    const w = this.world as FaunaWorld;
    let tx: number;
    let ty: number;
    let tz: number;
    if (fl.length > 0 && Math.random() < 0.75) {
      const f = fl[Math.floor(Math.random() * fl.length)];
      [tx, ty, tz] = f;
      ty += 0.12;
      a.after = 'land';
    } else {
      const p = this.pick(a, w.land) ?? [a.hx, a.hz];
      tx = p[0];
      tz = p[1];
      ty = this.ground(tx, tz) + rand(0.6, 1.6);
      a.after = 'flutter';
    }
    a.sx = a.x;
    a.sy = a.y;
    a.sz = a.z;
    a.tx = tx;
    a.ty = ty;
    a.tz = tz;
    a.t = 0;
    a.dur = Math.max(1.2, Math.hypot(tx - a.x, tz - a.z) / 1.1);
    a.mode = 'flutter';
  }

  private swimTo(a: Agent): void {
    const w = this.world as FaunaWorld;
    const p = this.pick(a, w.water) ?? [a.hx, a.hz];
    a.sx = a.x;
    a.sz = a.z;
    a.tx = p[0];
    a.tz = p[1];
    a.t = 0;
    a.dur = Math.max(1.5, Math.hypot(p[0] - a.x, p[1] - a.z) / rand(0.9, 1.5));
  }

  /** Every frame. `team` is where the heroes are. */
  update(dt: number, team: readonly { x: number; z: number }[]): void {
    const w = this.world;
    if (w === null) {
      return;
    }
    const calm = this.reduceMotion ? 0.6 : 1;
    for (const a of this.agents) {
      const was = a.shown;
      a.shown = a.when === null || a.when();
      if (!a.shown) {
        continue;
      }
      if (!was) {
        /* Back again, now the place suits it: a little sparkle as it appears. */
        w.burst('sparkle', a.x, a.y + 0.3, a.z, 4);
      }
      const t = dt * calm;
      a.t += t;
      a.k += t;
      a.noticed = Math.max(0, a.noticed - dt);
      a.squash *= 1 - ease(9, dt);
      let near: { x: number; z: number } | null = null;
      let nearD = Infinity;
      for (const h of team) {
        const d = Math.hypot(h.x - a.x, h.z - a.z);
        if (d < nearD) {
          nearD = d;
          near = h;
        }
      }
      /* Turn to look at the team when they are close, but not too close. */
      a.lookTo = near !== null && nearD < 7 ? angleTo(a.yaw, Math.atan2(near.x - a.x, near.z - a.z)) : Math.sin(a.k * 0.7) * 0.6 + Math.sin(a.k * 1.9) * 0.3;
      a.look += (Math.max(-1.1, Math.min(1.1, a.lookTo)) - a.look) * ease(5, dt);
      const shy = SHY[a.kind] ?? 0;
      const scared = shy > 0 && nearD < shy;
      /* Holding still for a photo: it keeps breathing and looking, but stays where it is. */
      if (a.still > 0) {
        a.still -= dt;
        continue;
      }
      this.step(a, t, w, scared, near);
    }
  }

  private step(a: Agent, dt: number, w: FaunaWorld, scared: boolean, near: { x: number; z: number } | null): void {
    const k = Math.min(1, a.t / a.dur);
    switch (a.mode) {
      case 'fly':
      case 'hop': {
        const e = a.mode === 'hop' ? k : smoothStep(k);
        a.x = a.sx + (a.tx - a.sx) * e;
        a.z = a.sz + (a.tz - a.sz) * e;
        a.y = a.sy + (a.ty - a.sy) * e + Math.sin(k * Math.PI) * a.arc;
        a.flap += ((a.mode === 'fly' ? 1 : 0.3) - a.flap) * ease(10, dt);
        if (k >= 1) {
          a.mode = a.after;
          a.t = 0;
          a.dur = a.after === 'perch' ? rand(4, 12) : rand(0.6, 1.8);
          a.squash = 1;
          /* A kingfisher at the water has just dived: a splash, and straight back up. */
          if (a.kind === 'kingfisher' && a.perch !== null && w.waterY !== null && Math.abs(a.y - w.waterY) < 0.3) {
            a.dur = 0.35;
            w.burst('splash', a.x, a.y + 0.1, a.z, 8);
          }
        }
        break;
      }
      case 'ground': {
        a.flap += (0 - a.flap) * ease(10, dt);
        if (scared) {
          this.flyAway(a, near);
          break;
        }
        /* Little busy actions: pecking, looking about, a hop now and then. */
        a.peck = Math.max(0, Math.sin(a.k * (a.kind === 'sparrow' ? 7 : 5))) * (Math.sin(a.k * 0.9) > 0.2 ? 1 : 0);
        a.flick = a.kind === 'fantail' ? Math.max(0, Math.sin(a.k * 2.4)) : Math.max(0, Math.sin(a.k * 3.1)) * 0.5;
        if (a.t > a.dur) {
          const roll = Math.random();
          const ps = this.perchesNear(a);
          if (roll < 0.12 * (PERCHY[a.kind] ?? 0.3) * 3 && ps.length > 0) {
            const p = this.pickPerch(a, ps);
            this.go(a, p[0], p[1], p[2], 5.5, 1.4, 'fly', 'perch');
          } else {
            const g = this.pick(a, w.land, 1.2, a.x, a.z);
            const home = Math.hypot(a.x - a.hx, a.z - a.hz) > a.range ? this.pick(a, w.land) : g;
            if (home !== null) {
              this.go(a, home[0], this.ground(home[0], home[1]), home[1], 2.2, 0.18, 'hop', 'ground');
              a.dur = Math.max(a.dur, 0.28);
            } else {
              a.t = 0;
              a.dur = rand(0.6, 1.6);
            }
          }
        }
        break;
      }
      case 'perch': {
        a.flap += (0 - a.flap) * ease(10, dt);
        a.flick = Math.max(0, Math.sin(a.k * 2)) * 0.4;
        a.peck = a.kind === 'owl' ? 0 : Math.max(0, Math.sin(a.k * 0.8) - 0.85) * 4;
        if (a.kind === 'owl') {
          break;
        }
        if (scared && a.y - this.ground(a.x, a.z) < 2.5) {
          this.flyAway(a, near);
          break;
        }
        if (a.t > a.dur) {
          if (a.kind === 'kingfisher' && w.waterY !== null) {
            const p = this.pick(a, w.water, 6, a.x, a.z);
            if (p !== null) {
              /* A dive: down to the water and straight back to the perch. */
              this.go(a, p[0], w.waterY, p[1], 7, 0.6, 'fly', 'perch');
              a.perch = [a.x, a.y, a.z];
              break;
            }
          }
          if (a.perch !== null && a.kind === 'kingfisher') {
            this.go(a, a.perch[0], a.perch[1], a.perch[2], 6, 1, 'fly', 'perch');
            a.perch = null;
            break;
          }
          this.flyAway(a, null);
        }
        break;
      }
      case 'loop': {
        /* Swallows: long swooping loops, flapping and gliding by turns. */
        const s = a.k * 0.55;
        const px = a.hx + Math.sin(s) * a.range;
        const pz = a.hz + Math.sin(s * 2 + 1) * a.range * 0.55;
        const py = a.ty + Math.sin(s * 3) * 0.9;
        const vx = px - a.x;
        const vz = pz - a.z;
        if (Math.hypot(vx, vz) > 0.001) {
          a.yaw = Math.atan2(vx, vz);
        }
        a.x = px;
        a.z = pz;
        a.y = this.ground(px, pz) * 0.3 + py;
        a.flap = Math.sin(a.k * 0.9) > -0.2 ? 1 : 0;
        break;
      }
      case 'soar': {
        const s = a.k * 0.09;
        const px = a.hx + Math.sin(s) * a.range;
        const pz = a.hz + Math.cos(s) * a.range;
        a.yaw = Math.atan2(px - a.x, pz - a.z);
        a.x = px;
        a.z = pz;
        a.y = a.ty + Math.sin(a.k * 0.2) * 1.2;
        a.flap = Math.sin(a.k * 0.13) > 0.97 ? 1 : 0;
        break;
      }
      case 'flutter': {
        const e = smoothStep(k);
        a.x = a.sx + (a.tx - a.sx) * e + Math.sin(a.k * 2.3) * 0.25;
        a.z = a.sz + (a.tz - a.sz) * e + Math.cos(a.k * 1.9) * 0.25;
        a.y = a.sy + (a.ty - a.sy) * e + Math.abs(Math.sin(a.k * 4.5)) * 0.22;
        a.yaw = Math.atan2(a.tx - a.sx, a.tz - a.sz) + Math.sin(a.k * 3) * 0.5;
        a.flap = 1;
        if (k >= 1) {
          a.t = 0;
          if (a.after === 'land') {
            a.mode = 'land';
            a.dur = rand(2, 5);
          } else {
            this.flutterTo(a);
          }
        }
        break;
      }
      case 'land': {
        a.flap = 0;
        if (a.t > a.dur || scared) {
          this.flutterTo(a);
        }
        break;
      }
      case 'hover': {
        a.flap = 1;
        a.y += Math.sin(a.k * 3) * dt * 0.3;
        if (a.t > a.dur) {
          const p = this.pick(a, w.waterY !== null ? w.water : w.land, 3, a.x, a.z) ?? this.pick(a, w.waterY !== null ? w.water : w.land);
          if (p !== null) {
            this.go(a, p[0], (w.waterY ?? this.ground(p[0], p[1])) + rand(0.5, 1.2), p[1], 6, 0.1, 'dart', 'hover');
          } else {
            a.t = 0;
          }
        }
        break;
      }
      case 'dart': {
        const e = smoothStep(k);
        a.x = a.sx + (a.tx - a.sx) * e;
        a.z = a.sz + (a.tz - a.sz) * e;
        a.y = a.sy + (a.ty - a.sy) * e;
        if (k >= 1) {
          a.mode = 'hover';
          a.t = 0;
          a.dur = rand(0.6, 2);
        }
        break;
      }
      case 'swim': {
        const e = smoothStep(k);
        const px = a.sx + (a.tx - a.sx) * e;
        const pz = a.sz + (a.tz - a.sz) * e;
        if (Math.hypot(px - a.x, pz - a.z) > 0.0005) {
          a.yaw = Math.atan2(px - a.x, pz - a.z);
        }
        a.x = px;
        a.z = pz;
        /* Back and fin just breaking the surface: the water is opaque, so a fish shows itself this way, and by leaping. */
        a.y = (w.waterY ?? 0) - 0.03 + Math.sin(a.k * 2) * 0.012;
        a.flap = 1;
        if (k >= 1) {
          if (!this.reduceMotion && Math.random() < 0.35) {
            /* A leap, with a splash going in and coming out. */
            const yaw = a.yaw;
            const lx = a.x + Math.sin(yaw) * 1.2;
            const lz = a.z + Math.cos(yaw) * 1.2;
            if (w.water(lx, lz)) {
              w.burst('splash', a.x, a.y + 0.1, a.z, 6);
              this.go(a, lx, a.y, lz, 1.8, 0.75, 'leap', 'swim');
              a.yaw = yaw;
              break;
            }
          }
          this.swimTo(a);
        }
        break;
      }
      case 'leap': {
        a.x = a.sx + (a.tx - a.sx) * k;
        a.z = a.sz + (a.tz - a.sz) * k;
        a.y = a.sy + Math.sin(k * Math.PI) * a.arc;
        if (k >= 1) {
          w.burst('splash', a.x, a.y + 0.1, a.z, 8);
          a.mode = 'swim';
          this.swimTo(a);
        }
        break;
      }
      case 'sit': {
        if (a.kind === 'frog') {
          if (scared) {
            /* Hops away, towards the water if there is any, and hides for a moment. */
            const p = this.pick(a, w.waterY !== null ? w.water : w.land, 2.5, a.x, a.z) ?? this.pick(a, w.land, 2.5, a.x, a.z);
            if (p !== null) {
              const wet = w.waterY !== null && w.water(p[0], p[1]);
              this.go(a, p[0], wet ? (w.waterY as number) - 0.25 : this.ground(p[0], p[1]), p[1], 3.2, 0.5, 'hop', wet ? 'hide' : 'sit');
            }
            break;
          }
          if (a.t > a.dur) {
            const p = this.pick(a, (x, z) => this.bank(x, z), 1.6, a.x, a.z);
            if (p !== null && Math.hypot(p[0] - a.hx, p[1] - a.hz) < a.range + 1) {
              this.go(a, p[0], this.ground(p[0], p[1]), p[1], 2.6, 0.38, 'hop', 'sit');
              a.dur = Math.max(a.dur, 0.4);
            } else {
              a.t = 0;
              a.dur = rand(1.5, 4);
            }
          }
        } else if (a.kind === 'macaque' || a.kind === 'gecko') {
          if (scared && near !== null) {
            const away = Math.atan2(a.x - near.x, a.z - near.z);
            const dist = a.kind === 'gecko' ? 1 : 3;
            const tx = a.x + Math.sin(away) * dist;
            const tz = a.z + Math.cos(away) * dist;
            if (w.land(tx, tz)) {
              this.go(a, tx, this.ground(tx, tz), tz, a.kind === 'gecko' ? 2.4 : 1.6, 0, 'walk', 'sit');
              break;
            }
          }
          if (a.t > a.dur) {
            const p = this.pick(a, w.land, a.kind === 'gecko' ? 0.8 : 3, a.x, a.z);
            if (p !== null && Math.hypot(p[0] - a.hx, p[1] - a.hz) < a.range) {
              this.go(a, p[0], this.ground(p[0], p[1]), p[1], a.kind === 'gecko' ? 1.6 : 0.9, 0, 'walk', 'sit');
            } else {
              a.t = 0;
              a.dur = rand(2, 6);
            }
          }
        }
        break;
      }
      case 'walk': {
        a.x = a.sx + (a.tx - a.sx) * k;
        a.z = a.sz + (a.tz - a.sz) * k;
        a.y = this.ground(a.x, a.z);
        if (k >= 1) {
          a.mode = a.after === 'wade' ? 'wade' : 'sit';
          a.t = 0;
          a.dur = a.kind === 'gecko' ? rand(0.8, 3) : a.kind === 'egret' ? rand(4, 9) : rand(3, 8);
        }
        break;
      }
      case 'hide': {
        /* Under the water a while, then back up on the bank. */
        if (a.t > 3.5) {
          const p = this.pick(a, (x, z) => this.bank(x, z));
          if (p !== null) {
            a.x = p[0];
            a.z = p[1];
            a.y = this.ground(p[0], p[1]);
            w.burst('splash', a.x, a.y + 0.1, a.z, 4);
          }
          a.mode = 'sit';
          a.t = 0;
          a.dur = rand(2, 5);
        }
        break;
      }
      case 'wade': {
        a.flap += (0 - a.flap) * ease(6, dt);
        if (scared && near !== null) {
          const away = Math.atan2(a.x - near.x, a.z - near.z);
          const tx = a.x + Math.sin(away) * 7;
          const tz = a.z + Math.cos(away) * 7;
          const ok = this.bank(tx, tz) || w.land(tx, tz);
          const p = ok ? ([tx, tz] as [number, number]) : this.pick(a, (x, z) => this.bank(x, z));
          if (p !== null) {
            this.go(a, p[0], this.ground(p[0], p[1]), p[1], 4.5, 2.2, 'fly', 'wade');
            break;
          }
        }
        /* Slow steps, a long still look into the water, then a quick strike. */
        a.peck = a.t % 5 > 4.4 ? Math.sin(((a.t % 5) - 4.4) / 0.6 * Math.PI) : 0;
        if (a.t > a.dur) {
          const p = this.pick(a, (x, z) => this.bank(x, z), 1.5, a.x, a.z);
          if (p !== null && Math.hypot(p[0] - a.hx, p[1] - a.hz) < a.range + 1) {
            this.go(a, p[0], this.ground(p[0], p[1]), p[1], 0.45, 0, 'walk', 'wade');
            a.after = 'wade';
          }
          a.dur = rand(4, 9);
          a.t = 0;
        }
        break;
      }
      default:
        break;
    }
  }

  /** A photo was taken: the animal notices, in its own way. */
  notice(a: Agent, from?: { x: number; z: number }): void {
    a.noticed = 1.4;
    a.squash = 1;
    /* Walking off: it stops. Then an animal on the ground or a perch turns to look at whoever is taking its picture. */
    if (a.mode === 'walk') {
      a.mode = a.after === 'wade' ? 'wade' : 'sit';
      a.t = 0;
    }
    const settled = a.mode === 'ground' || a.mode === 'perch' || a.mode === 'sit' || a.mode === 'wade' || a.mode === 'land';
    /* Only a settled animal holds still: one mid-hop or in flight carries on. */
    a.still = settled ? 2 : 0;
    if (from !== undefined && settled) {
      a.yaw = Math.atan2(from.x - a.x, from.z - a.z);
      a.look = 0;
    }
    if (a.mode === 'swim') {
      a.t = a.dur;
    }
  }

  /** The nearest animal of a kind that is out and about. */
  nearest(kind: FaunaKind, x: number, z: number, tag?: string): Agent | null {
    let best: Agent | null = null;
    let d = Infinity;
    for (const a of this.agents) {
      if (a.kind !== kind || !a.shown || a.mode === 'hide' || (tag !== undefined && a.tag !== tag)) {
        continue;
      }
      const dd = Math.hypot(a.x - x, a.z - z);
      if (dd < d) {
        d = dd;
        best = a;
      }
    }
    return best;
  }

  /* ---- Drawing ---- */

  private pose(a: Agent): void {
    const r = a.rig;
    r.reset();
    const t = a.k;
    const breathe = Math.sin(t * 2.4) * 0.01;
    const sq = a.squash;
    const noticed = a.noticed > 0 ? Math.sin((1.4 - a.noticed) * 9) * Math.min(1, a.noticed) : 0;
    switch (a.kind) {
      case 'butterfly': {
        const beat = a.mode === 'land' ? (Math.sin(t * 2.2) * 0.5 + 0.5) * 0.9 + 0.4 : Math.abs(Math.sin(t * 16)) * 1.25 + 0.1;
        r.turn(1, 0, 0, -beat);
        r.turn(2, 0, 0, beat);
        r.turn(0, a.mode === 'land' ? 0 : -0.25, 0, 0);
        break;
      }
      case 'dragonfly': {
        const v = Math.sin(t * 46) * 0.35;
        r.turn(1, 0, 0, -0.1 - v);
        r.turn(2, 0, 0, 0.1 + v);
        r.turn(0, Math.sin(t * 1.3) * 0.08, 0, 0);
        break;
      }
      case 'fish': {
        r.turn(1, 0, Math.sin(t * (a.mode === 'leap' ? 18 : 7)) * 0.45, 0);
        r.turn(0, 0, Math.sin(t * 7 + 1) * 0.08, 0);
        if (a.mode === 'leap') {
          r.turn(0, -Math.cos(Math.min(1, a.t / a.dur) * Math.PI) * 0.7, 0, 0);
        }
        break;
      }
      case 'frog': {
        const air = a.mode === 'hop' ? Math.sin(Math.min(1, a.t / a.dur) * Math.PI) : 0;
        r.turn(2, -1.1 * air, 0, 0);
        r.move(2, 0, -0.03 * air, -0.05 * air);
        r.turn(3, 0.6 * air, 0, 0);
        r.turn(0, -0.35 * air, 0, 0);
        const puff = a.mode === 'sit' ? Math.max(0, Math.sin(t * 2.2)) ** 3 + Math.max(0, noticed) : 0;
        r.size(4, 1 + puff * 0.9, 1 + puff * 0.9, 1 + puff * 0.7);
        r.size(0, 1 + sq * 0.12, 1 - sq * 0.15 + breathe, 1 + sq * 0.08);
        r.turn(1, 0, a.look * 0.3, 0);
        break;
      }
      case 'gecko': {
        const walk = a.mode === 'walk' ? Math.sin(t * 22) : 0;
        r.turn(1, 0, Math.sin(t * 3) * 0.3 + walk * 0.4, 0);
        r.turn(2, 0, walk * 0.3, 0);
        r.turn(0, 0, walk * 0.12 + a.look * 0.2, 0);
        break;
      }
      case 'macaque': {
        const walking = a.mode === 'walk' ? 1 : 0;
        const swing = Math.sin(t * 9) * walking;
        r.turn(1, 1.05 * walking, 0, 0);
        r.move(0, 0, 0.06 * walking, 0);
        r.turn(3, -1.05 * walking + swing * 0.5, 0, 0);
        r.turn(4, -1.05 * walking - swing * 0.5, 0, 0);
        r.turn(5, -0.7 * walking - swing * 0.4, 0, 0);
        r.turn(6, -0.7 * walking + swing * 0.4, 0, 0);
        r.turn(7, Math.sin(t * 1.3) * 0.25, Math.sin(t * 0.8) * 0.4, 0);
        /* Sitting: now and then a scratch behind the ear. */
        const groom = walking === 0 ? Math.max(0, Math.sin(t * 0.5) - 0.6) * 2.5 : 0;
        r.turn(4, -2.2 * groom, 0, -0.4 * groom);
        r.turn(2, 0.1 * groom - noticed * 0.2, a.look * (1 - walking), 0);
        r.size(1, 1, 1 + breathe, 1);
        break;
      }
      case 'egret': {
        const strike = a.peck;
        r.turn(1, 0.9 * strike + noticed * -0.2, a.look * 0.5 * (1 - strike), 0);
        const walking = a.mode === 'walk' ? Math.sin(t * 4.5) : 0;
        r.turn(5, walking * 0.2, 0, 0);
        const flap = a.flap;
        const beat = Math.sin(t * 8);
        r.turn(2, 0, 0, -(0.2 + (0.6 + 0.6 * beat) * 1.3) * flap);
        r.turn(3, 0, 0, (0.2 + (0.6 + 0.6 * beat) * 1.3) * flap);
        r.turn(5, 1.1 * flap, 0, 0);
        r.size(0, 1, 1 + breathe, 1);
        break;
      }
      case 'eagle': {
        const beat = Math.sin(t * 5) * a.flap;
        r.turn(2, 0, 0, -beat * 0.35);
        r.turn(3, 0, 0, beat * 0.35);
        /* Banking into the circle. */
        r.turn(0, 0, 0, 0.28);
        r.turn(1, 0, Math.sin(t * 0.6) * 0.3, 0);
        break;
      }
      case 'owl': {
        r.turn(1, noticed * 0.2, a.look * 1.2, Math.sin(t * 0.37) * 0.12);
        const blink = Math.sin(t * 1.7) > 0.985 ? 0.6 : 1;
        r.size(1, 1, blink * 0.12 + 0.88, 1);
        r.size(0, 1 + breathe * 2, 1 + breathe * 2, 1);
        break;
      }
      default: {
        /* Songbirds and swallows. */
        const flying = a.flap;
        const beat = Math.sin(t * (a.kind === 'swallow' ? 14 : 22));
        if (a.kind === 'swallow') {
          r.turn(2, 0, 0, -beat * 0.55 * flying);
          r.turn(3, 0, 0, beat * 0.55 * flying);
        } else {
          const up = (0.35 + (0.5 + 0.5 * beat) * 1.3) * flying;
          r.turn(2, 0, 0, -up);
          r.turn(3, 0, 0, up);
          r.turn(5, 1.2 * flying, 0, 0);
          r.size(5, 1, 1 - 0.5 * flying, 1);
        }
        r.turn(0, 0.55 * a.peck - 0.1 * flying, 0, 0);
        r.turn(1, 0.5 * a.peck - noticed * 0.25, a.look * (1 - flying), 0);
        r.turn(4, 0.5 * a.flick, 0, 0);
        if (a.kind === 'fantail') {
          r.size(4, 1 + a.flick * 0.8, 1, 1);
        }
        r.size(0, 1 + sq * 0.15, 1 - sq * 0.18 + breathe, 1 + sq * 0.1);
        break;
      }
    }
  }

  /** Draws what the camera can see: near animals with outlines, far ones without. */
  draw(eye: Vec3, blob: (x: number, y: number, z: number, r: number) => void): void {
    const r = this.r;
    for (const a of this.agents) {
      if (!a.shown || a.mode === 'hide') {
        continue;
      }
      const d = Math.hypot(a.x - eye[0], a.y - eye[1], a.z - eye[2]);
      const big = a.kind === 'eagle' ? 3 : a.kind === 'egret' || a.kind === 'macaque' || a.kind === 'owl' ? 1.2 : 0.6;
      if (d > (a.kind === 'eagle' ? 120 : 64) || !r.visible([a.x, a.y + 0.2 * a.scale, a.z], big * a.scale)) {
        continue;
      }
      this.pose(a);
      const bones = a.rig.update();
      r.draw(a.model.mesh, { model: placement(this.m, a.x, a.y, a.z, a.yaw, a.scale), bones, noOutline: d > 24 });
      const onGround = a.mode === 'ground' || a.mode === 'sit' || a.mode === 'wade' || (a.mode === 'walk' && a.kind !== 'gecko') || a.mode === 'hop';
      if (onGround && d < 22) {
        blob(a.x, this.ground(a.x, a.z) + 0.04, a.z, (a.kind === 'egret' || a.kind === 'macaque' ? 0.32 : 0.16) * a.scale);
      }
    }
  }

  /** How many animals are out right now, for the performance check. */
  get count(): number {
    return this.agents.filter((a) => a.shown).length;
  }
}

export const isSongbird = (k: FaunaKind): boolean => SONGBIRDS.includes(k);
