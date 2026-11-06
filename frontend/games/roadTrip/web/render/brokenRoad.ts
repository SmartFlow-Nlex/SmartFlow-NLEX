import { shade } from '../art/kit';
import { laneAt, screenX, screenY, type Camera } from './camera';

type Ctx = CanvasRenderingContext2D;

/**
 * Broken road, drawn flat on the asphalt in the road's own perspective, so it lies on the road
 * rather than standing on it: potholes as real holes with broken edges, and road repairs as a
 * stretch where the top layer has torn away. Everything is laid out once per hole or patch, from
 * its id, in road units (lanes across, distance along), and only projected each frame. Nothing
 * here touches the game: what can hit you is still the hazard's own box.
 */

/** A point on the road, in a thing's own frame: lanes across from its middle, distance along from its start. */
type P = readonly [number, number];

function rng(seed: number): () => number {
  let s = (Math.imul(seed ^ 0x9e3779b9, 2654435761) >>> 0) || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/** A closed jagged ring round (cx, cz): `n` points, each at a random share of the radii. */
function jagged(r: () => number, cx: number, cz: number, rx: number, rz: number, n: number, rough: number): P[] {
  const out: P[] = [];
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2 + (r() - 0.5) * (Math.PI / n);
    const k = 1 - rough + r() * rough * 1.4;
    out.push([cx + Math.cos(a) * rx * k, cz + Math.sin(a) * rz * k]);
  }
  return out;
}

/** A crack: a wandering line from a point outward. */
function crack(r: () => number, x: number, z: number, dirX: number, dirZ: number, length: number, steps: number): P[] {
  const out: P[] = [[x, z]];
  let px = x;
  let pz = z;
  for (let i = 0; i < steps; i += 1) {
    const step = length / steps;
    px += dirX * step + (r() - 0.5) * step * 0.9;
    pz += dirZ * step + (r() - 0.5) * step * 0.9;
    out.push([px, pz]);
  }
  return out;
}

interface Pothole {
  rim: P[];
  hole: P[];
  halo: P[];
  cracks: P[][];
  chunks: P[][];
  gravel: P[];
}

interface Patch {
  /** Damp and dusty blotches in the exposed base. */
  blotches: { x: number; z: number; w: number; l: number; dark: boolean }[];
  /** The torn edge at the near end and the far end, across the road (x from -1.6 to 1.6). */
  near: P[];
  far: P[];
  /** What is left of the top layer: cracked slabs, each with its grain and the cracks across it. */
  slabs: { pts: P[]; grain: P[]; splits: P[][] }[];
  holes: { x: number; z: number; w: number }[];
  cracks: P[][];
  chunks: P[][];
  grit: P[];
}

const potholes = new Map<number, Pothole>();
const patches = new Map<number, Patch>();

function potholeShape(id: number, halfW: number, len: number): Pothole {
  const known = potholes.get(id);
  if (known !== undefined) {
    return known;
  }
  const r = rng(id * 7 + 3);
  // Drawn a little longer than its box along the road: seen this low, a hole is mostly foreshortened.
  const rx = halfW * 1.05;
  const rz = len * 0.85;
  const cz = len * 0.5;
  const rim = jagged(r, 0, cz, rx, rz, 18, 0.32);
  const hole = rim.map(([x, z]) => [x * (0.78 + r() * 0.08), cz + (z - cz) * (0.74 + r() * 0.08)] as P);
  const halo = jagged(r, 0, cz, rx * 1.5, rz * 1.55, 14, 0.25);
  const cracks: P[][] = [];
  const count = 4 + Math.floor(r() * 3);
  for (let i = 0; i < count; i += 1) {
    const a = r() * Math.PI * 2;
    const from = rim[Math.floor(r() * rim.length)];
    cracks.push(crack(r, from[0], from[1], Math.cos(a), Math.sin(a) * 1.6, halfW * (0.8 + r() * 0.9), 4));
  }
  const chunks: P[][] = [];
  for (let i = 0; i < 4; i += 1) {
    const a = r() * Math.PI * 2;
    const x = Math.cos(a) * rx * (1.15 + r() * 0.4);
    const z = cz + Math.sin(a) * rz * (1.2 + r() * 0.5);
    chunks.push(jagged(r, x, z, halfW * (0.08 + r() * 0.07), len * (0.08 + r() * 0.06), 5, 0.4));
  }
  const gravel: P[] = [];
  for (let i = 0; i < 9; i += 1) {
    gravel.push([(r() - 0.5) * rx * 1.1, cz + (r() * 0.7 - 0.1) * rz]);
  }
  const shape = { rim, hole, halo, cracks, chunks, gravel };
  potholes.set(id, shape);
  if (potholes.size > 64) {
    potholes.delete(potholes.keys().next().value!);
  }
  return shape;
}

function patchShape(id: number, len: number): Patch {
  const known = patches.get(id);
  if (known !== undefined) {
    return known;
  }
  const r = rng(id * 13 + 11);
  // Torn edges: the asphalt broke off unevenly, so each end of the patch is a jagged line across the road.
  const edge = (z: number, depth: number): P[] => {
    const out: P[] = [];
    for (let i = 0; i <= 16; i += 1) {
      out.push([-1.6 + (3.2 * i) / 16, z + (r() - 0.5) * depth + (i % 2 === 0 ? depth * 0.25 : -depth * 0.25)]);
    }
    return out;
  };
  const near = edge(0.4, 1.1);
  const far = edge(len - 0.4, 1.1);
  // Slabs of the old surface still in place: broken, tilted a little, with gaps between.
  const slabs: Patch['slabs'] = [];
  const rows = Math.max(3, Math.round(len / 4.2));
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      if (r() < 0.38) {
        continue;
      }
      const cx = -1 + col + (r() - 0.5) * 0.35;
      const cz = 1.6 + ((len - 3.2) * (row + 0.5)) / rows + (r() - 0.5) * 1.2;
      const rx = 0.24 + r() * 0.16;
      const rz = 0.9 + r() * 0.9;
      const grain: P[] = [];
      for (let i = 0; i < 14; i += 1) {
        grain.push([cx + (r() - 0.5) * rx * 1.6, cz + (r() - 0.5) * rz * 1.6]);
      }
      const splits = [crack(r, cx + (r() - 0.5) * rx, cz - rz * 0.9, (r() - 0.5) * 0.3, 1, rz * 1.7, 5)];
      if (r() < 0.5) {
        splits.push(crack(r, cx - rx, cz + (r() - 0.5) * rz, 1, (r() - 0.5) * 0.6, rx * 1.8, 3));
      }
      slabs.push({ pts: jagged(r, cx, cz, rx, rz, 10, 0.42), grain, splits });
    }
  }
  const holes: Patch['holes'] = [];
  for (let i = 0; i < 2 + Math.floor(r() * 2); i += 1) {
    holes.push({ x: (r() - 0.5) * 2.6, z: 1.5 + r() * (len - 3), w: 0.13 + r() * 0.08 });
  }
  // Cracks running on into the good road past both ends, and through the slabs.
  const cracks: P[][] = [];
  for (let i = 0; i < 10; i += 1) {
    const atNear = i % 2 === 0;
    const from = (atNear ? near : far)[1 + Math.floor(r() * 15)];
    cracks.push(crack(r, from[0], from[1], (r() - 0.5) * 0.4, atNear ? -1 : 1, 1.2 + r() * 2.2, 5));
  }
  const chunks: P[][] = [];
  for (let i = 0; i < 9; i += 1) {
    chunks.push(jagged(r, (r() - 0.5) * 3, r() * len, 0.04 + r() * 0.05, 0.12 + r() * 0.12, 5, 0.45));
  }
  const grit: P[] = [];
  for (let i = 0; i < Math.round(len * 5); i += 1) {
    grit.push([(r() - 0.5) * 3.1, r() * len]);
  }
  const blotches: Patch['blotches'] = [];
  for (let i = 0; i < 5; i += 1) {
    blotches.push({ x: (r() - 0.5) * 2.4, z: 1 + r() * (len - 2), w: 0.4 + r() * 0.5, l: 1.5 + r() * 2.5, dark: i % 2 === 0 });
  }
  const shape = { near, far, slabs, holes, cracks, chunks, grit, blotches };
  patches.set(id, shape);
  if (patches.size > 16) {
    patches.delete(patches.keys().next().value!);
  }
  return shape;
}

/** Projects a thing's own points onto the screen, from where it is on the road. Points nearer than the screen's bottom edge land below it, as they should; only what is behind the camera itself is held back. */
function projector(cam: Camera, x0: number, z0: number, nearZ: number): (p: P) => [number, number] {
  void nearZ;
  const behind = -cam.depth + 0.9;
  return ([x, z]) => {
    const wz = Math.max(behind, z0 + z);
    return [screenX(cam, x0 + x, wz), screenY(cam, wz)];
  };
}

function path(ctx: Ctx, pts: readonly P[], at: (p: P) => [number, number], close: boolean): void {
  ctx.beginPath();
  pts.forEach((p, i) => {
    const [x, y] = at(p);
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  if (close) {
    ctx.closePath();
  }
}

/** One pothole: a halo of crazed asphalt, cracks running out, a broken rim, the hole with its lit far wall, grit at the bottom. */
export function drawPothole(ctx: Ctx, cam: Camera, h: { id: number; x: number; z: number; halfW: number; len: number }, asphalt: string, wet: boolean, nearZ: number, outline: boolean): void {
  const shape = potholeShape(h.id, h.halfW, h.len);
  const at = projector(cam, h.x, h.z, nearZ);
  const lane = laneAt(cam, h.z + h.len / 2);
  const detail = lane > 60;
  // Crazed, sunken asphalt round the hole.
  path(ctx, shape.halo, at, true);
  ctx.fillStyle = shade(asphalt, -0.16);
  ctx.globalAlpha *= 0.55;
  ctx.fill();
  ctx.globalAlpha /= 0.55;
  if (detail) {
    ctx.strokeStyle = shade(asphalt, -0.45);
    ctx.lineWidth = Math.max(1, lane * 0.007);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const c of shape.cracks) {
      path(ctx, c, at, false);
      ctx.stroke();
    }
  }
  // The broken rim: the torn top layer catches the light along its edge.
  path(ctx, shape.rim, at, true);
  ctx.fillStyle = shade(asphalt, 0.12);
  ctx.fill();
  // The hole: a dark bottom, and the far wall facing us, lit.
  path(ctx, shape.hole, at, true);
  const [, farY] = at([0, h.len * 0.5 + h.len * 0.9]);
  const [, nearY] = at([0, h.len * 0.5 - h.len * 0.9]);
  // From the far wall, which faces us and takes the light, down to the dark bottom.
  const g = ctx.createLinearGradient(0, farY, 0, nearY);
  g.addColorStop(0, '#7A6E62');
  g.addColorStop(0.35, '#4A433E');
  g.addColorStop(0.7, '#2C292A');
  g.addColorStop(1, '#232123');
  ctx.fillStyle = g;
  ctx.fill();
  if (wet) {
    // Rainwater in the bottom, catching the sky.
    ctx.save();
    path(ctx, shape.hole, at, true);
    ctx.clip();
    const [wx, wy] = at([0, h.len * 0.35]);
    ctx.beginPath();
    ctx.ellipse(wx, wy, lane * h.halfW * 0.8, Math.max(2, lane * 0.02), 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(150,176,200,0.55)';
    ctx.fill();
    ctx.restore();
  }
  if (detail) {
    ctx.fillStyle = 'rgba(160,150,138,0.85)';
    const dot = Math.max(1, lane * 0.008);
    for (const p of shape.gravel) {
      const [x, y] = at(p);
      ctx.fillRect(x - dot / 2, y - dot / 2, dot, dot * 0.7);
    }
    // Loose bits of the broken surface lying about.
    for (const c of shape.chunks) {
      path(ctx, c, at, true);
      ctx.fillStyle = shade(asphalt, -0.25);
      ctx.fill();
      ctx.strokeStyle = shade(asphalt, 0.18);
      ctx.lineWidth = Math.max(0.75, lane * 0.004);
      ctx.stroke();
    }
  }
  if (outline) {
    path(ctx, shape.rim, at, true);
    ctx.strokeStyle = 'rgba(255,214,64,0.95)';
    ctx.lineWidth = Math.max(2, lane * 0.012);
    ctx.stroke();
  }
}

/** A stretch of road repairs: the top layer torn away across the road, cracked slabs of it left behind, a few holes, cracks running on. */
export function drawBrokenPatch(ctx: Ctx, cam: Camera, patch: { id: number; z: number; len: number }, asphalt: string, wet: boolean, nearZ: number, farZ: number): void {
  if (patch.z + patch.len < nearZ || patch.z > farZ) {
    return;
  }
  const shape = patchShape(patch.id, patch.len);
  const at = projector(cam, 0, patch.z, nearZ);
  const visible = (p: P): boolean => patch.z + p[1] > nearZ && patch.z + p[1] < farZ;
  // Loose detail fades as it passes under the car: right below the camera it would only be a smear.
  const under = (pts: readonly P[]): number => {
    const z = patch.z + Math.min(...pts.map((p) => p[1]));
    return Math.max(0, Math.min(1, (z - nearZ - 0.4) / 1.6));
  };
  const base = ctx.globalAlpha;
  // The exposed base: gravelly and dusty, between the two torn edges.
  // A torn edge already under the car is laid flat below the screen: right under the camera its zigzag would stand up as spikes.
  const flat = (p: P): P => (patch.z + p[1] < nearZ + 0.8 ? [p[0], nearZ - 1 - patch.z] : p);
  const outline: P[] = [...shape.near.map(flat), ...[...shape.far].reverse()].map(([x, z]) => [x, Math.min(z, farZ - patch.z)] as P);
  path(ctx, outline, at, true);
  ctx.fillStyle = wet ? '#6F6A62' : '#8E8574';
  ctx.fill();
  const near = laneAt(cam, Math.max(nearZ, patch.z));
  if (near < 10) {
    return;
  }
  // Damp and dusty blotches, so the base is not one flat colour.
  ctx.save();
  path(ctx, outline, at, true);
  ctx.clip();
  for (const b of shape.blotches) {
    if (!visible([b.x, b.z])) {
      continue;
    }
    const [bx, by] = at([b.x, b.z]);
    const [, by2] = at([b.x, b.z + b.l]);
    const w = laneAt(cam, patch.z + b.z) * b.w;
    ctx.beginPath();
    ctx.ellipse(bx, (by + by2) / 2, w, Math.max(2, Math.abs(by - by2) / 2), 0, 0, Math.PI * 2);
    ctx.fillStyle = b.dark ? 'rgba(70,62,54,0.22)' : 'rgba(196,186,166,0.2)';
    ctx.fill();
  }
  ctx.restore();
  // Grit in the base.
  const dot = Math.max(1, near * 0.006);
  ctx.fillStyle = wet ? 'rgba(70,66,60,0.6)' : 'rgba(96,88,74,0.65)';
  for (const p of shape.grit) {
    if (!visible(p)) {
      continue;
    }
    const [x, y] = at(p);
    const s = dot * Math.min(1.6, laneAt(cam, patch.z + p[1]) / near + 0.4);
    ctx.fillRect(x - s / 2, y - s / 2, s, s * 0.7);
  }
  // The torn edges: a thin dark shadow under each, then the lit lip of the old surface.
  for (const edge of [shape.near, shape.far]) {
    if (!edge.every((p) => patch.z + p[1] > nearZ + 0.8) || !edge.some(visible)) {
      continue;
    }
    path(ctx, edge, at, false);
    ctx.strokeStyle = 'rgba(40,36,34,0.7)';
    ctx.lineWidth = Math.max(1.5, near * 0.012);
    ctx.stroke();
    path(ctx, edge.map(([x, z]) => [x, z + (edge === shape.near ? -0.12 : 0.12)] as P), at, false);
    ctx.strokeStyle = shade(asphalt, 0.2);
    ctx.lineWidth = Math.max(1, near * 0.006);
    ctx.stroke();
  }
  // Slabs of old asphalt left in place: cracked at the edges, each lit along its near lip.
  for (const { pts: slab, grain, splits } of shape.slabs) {
    if (!slab.some(visible) || under(slab) <= 0) {
      continue;
    }
    const lane = laneAt(cam, patch.z + slab.reduce((sum, p) => sum + p[1], 0) / slab.length);
    const thick = Math.max(1.5, lane * 0.03);
    ctx.globalAlpha = base * under(slab);
    ctx.save();
    ctx.translate(0, thick);
    path(ctx, slab, at, true);
    ctx.fillStyle = 'rgba(34,30,28,0.72)';
    ctx.fill();
    ctx.restore();
    path(ctx, slab, at, true);
    ctx.fillStyle = shade(asphalt, -0.04);
    ctx.fill();
    // The asphalt's own grain, and the cracks running across what is left.
    const speck = Math.max(1, lane * 0.007);
    grain.forEach((p, i) => {
      const [gx, gy] = at(p);
      ctx.fillStyle = i % 2 === 0 ? shade(asphalt, 0.22) : shade(asphalt, -0.3);
      ctx.fillRect(gx - speck / 2, gy - speck / 2, speck, speck * 0.7);
    });
    ctx.save();
    path(ctx, slab, at, true);
    ctx.clip();
    ctx.strokeStyle = 'rgba(34,32,36,0.7)';
    ctx.lineWidth = Math.max(0.75, lane * 0.005);
    for (const split of splits) {
      path(ctx, split, at, false);
      ctx.stroke();
    }
    ctx.restore();
    path(ctx, slab, at, true);
    ctx.strokeStyle = shade(asphalt, 0.16);
    ctx.lineWidth = Math.max(0.75, lane * 0.005);
    ctx.stroke();
  }
  for (const hole of shape.holes) {
    if (!visible([hole.x, hole.z])) {
      continue;
    }
    drawPothole(ctx, cam, { id: patch.id * 31 + Math.round(hole.x * 100), x: hole.x, z: patch.z + hole.z, halfW: hole.w, len: 0.45 }, '#8E8574', wet, nearZ, false);
  }
  ctx.strokeStyle = shade(asphalt, -0.42);
  ctx.lineWidth = Math.max(1, near * 0.006);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const c of shape.cracks) {
    if (!c.some(visible) || c.some((p) => patch.z + p[1] < nearZ + 0.8)) {
      continue;
    }
    path(ctx, c.filter(visible).length > 1 ? c.filter(visible) : c, at, false);
    ctx.stroke();
  }
  ctx.globalAlpha = base;
  for (const c of shape.chunks) {
    if (!c.some(visible) || under(c) <= 0) {
      continue;
    }
    ctx.globalAlpha = base * under(c);
    path(ctx, c, at, true);
    ctx.fillStyle = shade(asphalt, -0.2);
    ctx.fill();
    ctx.strokeStyle = shade(asphalt, 0.2);
    ctx.lineWidth = Math.max(0.75, near * 0.004);
    ctx.stroke();
  }
  ctx.globalAlpha = base;
}
