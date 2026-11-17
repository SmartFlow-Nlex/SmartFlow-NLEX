import type { Color, MeshBuilder } from '../gl/builder';
import type { Vec3 } from '../gl/math';
import { flowerBed, planter, vary, type Collider, type Scatter } from './scenery';

/**
 * The kit for cute buildings: framed windows with sills and flower boxes, doors with a
 * knob and a step, awnings, lanterns, roofs with real eaves, and small houses in three
 * styles. Everything is placed through a Frame: a building's own position and turn, so
 * a window is put "on the front wall, left of the door" rather than in world numbers.
 */

/** A building's own frame: local +z is its front. */
export class Frame {
  private readonly c: number;
  private readonly n: number;

  constructor(
    readonly x: number,
    readonly y: number,
    readonly z: number,
    readonly yaw: number,
  ) {
    this.c = Math.cos(yaw);
    this.n = Math.sin(yaw);
  }

  /** A local point in the world. */
  p(lx: number, ly: number, lz: number): Vec3 {
    return [this.x + lx * this.c + lz * this.n, this.y + ly, this.z - lx * this.n + lz * this.c];
  }

  /** A frame on this one: at a local point, turned further by `turn`. */
  sub(lx: number, ly: number, lz: number, turn = 0): Frame {
    const [x, y, z] = this.p(lx, ly, lz);
    return new Frame(x, y, z, this.yaw + turn);
  }

  box(b: MeshBuilder, lx: number, ly: number, lz: number, sx: number, sy: number, sz: number, color: Color): void {
    const [x, y, z] = this.p(lx, ly, lz);
    b.box(x, y, z, sx, sy, sz, color, this.yaw);
  }

  rbox(b: MeshBuilder, lx: number, ly: number, lz: number, sx: number, sy: number, sz: number, color: Color, round = 0.2): void {
    const [x, y, z] = this.p(lx, ly, lz);
    b.rbox(x, y, z, sx, sy, sz, color, round, this.yaw);
  }

  quad(b: MeshBuilder, a: Vec3, c: Vec3, d: Vec3, e: Vec3, color: Color): void {
    b.quad(this.p(...a), this.p(...c), this.p(...d), this.p(...e), color);
  }
}

export interface Builders {
  solid: MeshBuilder;
  soft: MeshBuilder;
}

/**
 * Whether a decoration of radius r at (x, z) keeps clear of every interaction spot, every
 * collider and every path given: so dressing a place never blocks a button or a way.
 */
export const clearOf =
  (spots: Record<string, [number, number]>, colliders: readonly Collider[], paths: (x: number, z: number) => number = () => 99, keep = 2.6) =>
  (x: number, z: number, r: number, near = keep): boolean =>
    Object.values(spots).every(([sx, sz]) => Math.hypot(x - sx, z - sz) > near + r) && colliders.every((c) => Math.hypot(x - c.x, z - c.z) > c.r + r + 0.35) && paths(x, z) > 2.3 + r;

/* ---- Wall pieces: each drawn on a wall whose outer face is local z = 0, facing +z. ---- */

/** A framed window with a cross, a sill and a glint; optional shutters and a flower box. */
export function windowAt(c: Builders, f: Frame, w: number, h: number, frame: Color, opts: { shutters?: Color; flowers?: boolean; glass?: Color } = {}): void {
  const { solid, soft } = c;
  f.box(solid, 0, 0, 0.04, w + 0.18, h + 0.18, 0.08, frame);
  f.box(solid, 0, 0, 0.085, w, h, 0.04, opts.glass ?? '#a8dcf5');
  f.box(soft, -w * 0.22, h * 0.22, 0.11, w * 0.18, h * 0.12, 0.01, '#eaf8ff');
  f.box(solid, 0, 0, 0.115, 0.06, h, 0.03, frame);
  f.box(solid, 0, 0, 0.115, w, 0.06, 0.03, frame);
  f.box(solid, 0, -h / 2 - 0.1, 0.12, w + 0.34, 0.08, 0.24, frame);
  if (opts.shutters !== undefined) {
    for (const s of [-1, 1]) {
      f.box(solid, s * (w / 2 + 0.26), 0, 0.06, 0.32, h + 0.12, 0.06, opts.shutters);
    }
  }
  if (opts.flowers === true) {
    f.box(solid, 0, -h / 2 - 0.27, 0.22, w + 0.16, 0.22, 0.28, '#a8743f');
    soft.sway = 0.12;
    const n = Math.max(3, Math.round(w / 0.24));
    for (let i = 0; i < n; i += 1) {
      const lx = ((i + 0.5) / n - 0.5) * w;
      const [x, y, z] = f.p(lx, -h / 2 - 0.12, 0.22);
      const tint = ['#ff8fb5', '#ffd24a', '#ffffff', '#ff7a6b'][Math.floor(vary(x, z, 90) * 4)];
      soft.ellipsoid(x, y - 0.02, z, 0.11, 0.07, 0.11, '#4fae55', { rows: 3, cols: 5 });
      soft.ball(x, y + 0.06, z, 0.065, tint, 2, 5);
    }
    soft.sway = 0;
  }
}

/** A door with its frame, two raised panels, a knob and a step. */
export function doorAt(c: Builders, f: Frame, color: Color, frame: Color, w = 0.95, h = 1.95): void {
  const { solid } = c;
  f.box(solid, 0, h / 2 + 0.05, 0.03, w + 0.22, h + 0.14, 0.07, frame);
  f.box(solid, 0, h / 2, 0.07, w, h, 0.05, color);
  for (const ly of [h * 0.28, h * 0.68]) {
    f.box(solid, 0, ly, 0.1, w * 0.62, h * 0.26, 0.02, frame);
  }
  const [kx, ky, kz] = f.p(w * 0.32, h * 0.48, 0.12);
  solid.ball(kx, ky, kz, 0.05, '#ffd24a', 3, 5);
  f.box(solid, 0, 0.08, 0.32, w + 0.5, 0.16, 0.6, '#d8cfc0');
}

/** A small flat awning over a door or window, on two brackets. */
export function awningAt(c: Builders, f: Frame, w: number, y: number, color: Color, stripe?: Color): void {
  const { solid } = c;
  f.box(solid, 0, y, 0.42, w, 0.1, 0.84, color);
  if (stripe !== undefined) {
    f.box(solid, 0, y - 0.09, 0.82, w, 0.12, 0.06, stripe);
  }
  for (const s of [-1, 1]) {
    const a = f.p(s * (w / 2 - 0.1), y - 0.5, 0.02);
    const e = f.p(s * (w / 2 - 0.1), y - 0.04, 0.7);
    solid.tube(a, e, 0.03, 0.03, '#5a4a3e', 4, false);
  }
}

/** A wall lantern with a warm glow. */
export function lanternAt(c: Builders, f: Frame, lx: number, ly: number): void {
  const { solid } = c;
  f.box(solid, lx, ly + 0.2, 0.08, 0.06, 0.1, 0.16, '#2f3b52');
  const [x, y, z] = f.p(lx, ly, 0.18);
  solid.ball(x, y, z, 0.11, '#ffe9a8', 4, 6);
  const [tx, ty, tz] = f.p(lx, ly + 0.13, 0.18);
  solid.ellipsoid(tx, ty, tz, 0.13, 0.04, 0.13, '#2f3b52', { rows: 2, cols: 6 });
}

/* ---- Roofs ---- */

/**
 * A gable roof whose ridge runs front to back, so the triangle faces the front: the
 * picture-book house. Eaves hang over by `over`; the underside is painted too, so it
 * never shows a hole from below.
 */
export function gableRoof(b: MeshBuilder, f: Frame, hw: number, hd: number, y: number, h: number, over: number, color: Color, under: Color, gable: Color): void {
  const x0 = -(hw + over);
  const x1 = hw + over;
  const z0 = -(hd + over);
  const z1 = hd + over;
  const top = y + h + over * (h / hw);
  const eave = y - over * (h / hw);
  /* The two slopes, then their undersides. */
  f.quad(b, [x0, eave, z0], [x0, eave, z1], [0, top, z1], [0, top, z0], color);
  f.quad(b, [x1, eave, z1], [x1, eave, z0], [0, top, z0], [0, top, z1], color);
  f.quad(b, [x0, eave, z1], [x0, eave, z0], [0, top, z0], [0, top, z1], under);
  f.quad(b, [x1, eave, z0], [x1, eave, z1], [0, top, z1], [0, top, z0], under);
  /* The gable triangles in the wall colour, front and back. */
  f.quad(b, [-hw, y, hd], [hw, y, hd], [0.0001, y + h, hd], [-0.0001, y + h, hd], gable);
  f.quad(b, [hw, y, -hd], [-hw, y, -hd], [-0.0001, y + h, -hd], [0.0001, y + h, -hd], gable);
  /* A thick edge along the eaves, and a ridge cap. */
  for (const s of [-1, 1]) {
    const a = f.p(s * (hw + over), eave - 0.04, z0);
    const e = f.p(s * (hw + over), eave - 0.04, z1);
    b.tube(a, e, 0.07, 0.07, under, 5, false);
  }
  b.tube(f.p(0, top + 0.02, z0 - 0.05), f.p(0, top + 0.02, z1 + 0.05), 0.09, 0.09, under, 6, false);
}

/** A hip roof: four slopes up to a short ridge, with a thick fascia under the eaves. */
export function hipRoof(b: MeshBuilder, f: Frame, hw: number, hd: number, y: number, h: number, over: number, color: Color, ridge: Color, fascia: Color): void {
  const w = hw + over;
  const d = hd + over;
  const rz = Math.max(0.1, d - w) + d * 0.25;
  f.quad(b, [-w, y, d], [w, y, d], [0.0001, y + h, rz], [-0.0001, y + h, rz], color);
  f.quad(b, [w, y, -d], [-w, y, -d], [-0.0001, y + h, -rz], [0.0001, y + h, -rz], color);
  f.quad(b, [-w, y, -d], [-w, y, d], [-0.0001, y + h, rz], [-0.0001, y + h, -rz], ridge);
  f.quad(b, [w, y, d], [w, y, -d], [0.0001, y + h, -rz], [0.0001, y + h, rz], ridge);
  f.box(b, 0, y - 0.07, 0, w * 2 + 0.06, 0.16, d * 2 + 0.06, fascia);
  b.tube(f.p(0, y + h + 0.03, -rz), f.p(0, y + h + 0.03, rz), 0.08, 0.08, fascia, 6, true);
}

/* ---- Houses ---- */

export interface HouseLook {
  w: number;
  d: number;
  wall: Color;
  roof: Color;
  /** 0 a hip roof and chimney, 1 a front gable with a round attic window, 2 a nipa-hut style: thatch and woven walls. */
  style: 0 | 1 | 2;
  /** Which way the front door faces: +z (1) or -z (-1). */
  facing: 1 | -1;
}

const TRIMS = ['#ffffff', '#fff6e0', '#f2fbff'];
const DOORS = ['#d9632f', '#2b6fd6', '#2fae6b', '#c23f7a', '#8a5a2c'];
const SHUTTERS = ['#2fae6b', '#3fa7c4', '#e2a23f', '#c8645a'];

/** A small, cosy house on its own footprint (w by d), with a garden by the door. */
export function cuteHouse(s: Scatter, x: number, y: number, z: number, look: HouseLook): void {
  const c = s.cell(x, z);
  const { solid } = c;
  const f = new Frame(x, y, z, look.facing === 1 ? 0 : Math.PI);
  const hw = look.w / 2;
  const hd = look.d / 2;
  const H = 2.55;
  const v = vary(x, z, 100);
  const trim = TRIMS[Math.floor(v * 3) % 3];
  const kubo = look.style === 2;
  const wall = kubo ? '#e6c98f' : look.wall;
  const frameCol = kubo ? '#9a6a3a' : trim;
  /* Footing, walls, corner posts and a band under the roof. */
  f.box(solid, 0, 0.14, 0, look.w + 0.3, 0.28, look.d + 0.3, kubo ? '#9a7a52' : '#cdbfa6');
  f.rbox(solid, 0, 0.28 + H / 2, 0, look.w, H, look.d, wall, 0.1);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      f.box(solid, sx * hw, 0.28 + H / 2, sz * hd, 0.2, H, 0.2, frameCol);
    }
  }
  if (kubo) {
    /* Woven bamboo: darker slats across the walls. */
    for (const ly of [0.9, 1.5, 2.1]) {
      f.box(solid, 0, ly, hd + 0.01, look.w - 0.1, 0.07, 0.03, '#c9a565');
      f.box(solid, 0, ly, -hd - 0.01, look.w - 0.1, 0.07, 0.03, '#c9a565');
    }
  }
  const top = 0.28 + H;
  if (look.style === 0) {
    hipRoof(solid, f, hw, hd, top, 1.5, 0.55, look.roof, look.roof, trim);
    /* A brick chimney on half of them. */
    if (v > 0.5) {
      f.box(solid, hw * 0.45, top + 1.1, -hd * 0.35, 0.5, 1.3, 0.5, '#c8644a');
      f.box(solid, hw * 0.45, top + 1.8, -hd * 0.35, 0.62, 0.12, 0.62, '#9a4a3a');
    }
  } else if (look.style === 1) {
    gableRoof(solid, f, hw, hd, top, 1.6, 0.5, look.roof, '#6b4a2f', wall);
    /* A round attic window in the front gable. */
    const [ax, ay, az] = f.p(0, top + 0.62, hd + 0.04);
    solid.ellipsoid(ax, ay, az, 0.36, 0.36, 0.05, trim, { rows: 4, cols: 10, yaw: f.yaw });
    const [gx, gy, gz] = f.p(0, top + 0.62, hd + 0.07);
    solid.ellipsoid(gx, gy, gz, 0.26, 0.26, 0.04, '#a8dcf5', { rows: 4, cols: 10, yaw: f.yaw });
  } else {
    /* Thatch: a steep hip roof, with a ridge of darker grass. */
    hipRoof(solid, f, hw, hd, top, 2.1, 0.7, '#d4b06a', '#c9a35a', '#b8924c');
  }
  /* The front: a door off-centre, a window either side or one big one. */
  const front = f.sub(0, 0, hd);
  const doorX = (v < 0.5 ? -1 : 1) * hw * 0.3;
  const doorCol = DOORS[Math.floor(vary(x, z, 101) * DOORS.length)];
  doorAt(c, front.sub(doorX, 0.28, 0), kubo ? '#8a5a2c' : doorCol, frameCol);
  const winX = -doorX * 1.55;
  windowAt(c, front.sub(winX, 0.28 + 1.45, 0), 1.0, 0.8, frameCol, { shutters: kubo ? undefined : SHUTTERS[Math.floor(vary(x, z, 102) * SHUTTERS.length)], flowers: true });
  if (look.w > 5) {
    windowAt(c, front.sub(doorX + Math.sign(doorX) * 1.15, 0.28 + 1.5, 0), 0.55, 0.6, frameCol, {});
  }
  if (!kubo) {
    awningAt(c, front.sub(doorX, 0, 0), 1.5, 0.28 + 2.25, look.roof, trim);
  }
  lanternAt(c, front.sub(doorX + (doorX < 0 ? 0.78 : -0.78), 0, 0), 0, 0.28 + 1.75);
  /* Windows on both ends, so it looks lived-in from any side. */
  for (const s2 of [-1, 1]) {
    windowAt(c, f.sub(s2 * hw, 0.28 + 1.45, 0, (s2 * Math.PI) / 2), 0.9, 0.75, frameCol, { flowers: v > 0.4 });
  }
  /* The garden: pots by the door, a flower bed under the window. */
  const [p1x, , p1z] = f.p(doorX - 1.08, 0, hd + 0.5);
  const [p2x, , p2z] = f.p(doorX + 1.08, 0, hd + 0.5);
  planter(s, p1x, y, p1z, v > 0.3 ? 'flowers' : 'shrub', '#c9714a', 0.85);
  planter(s, p2x, y, p2z, v > 0.6 ? 'palm' : 'flowers', '#e09a4a', 0.75);
  const [bx, , bz] = f.p(winX, 0, hd + 0.45);
  flowerBed(s, bx, y, bz, 1.5, 0.5, f.yaw);
}
