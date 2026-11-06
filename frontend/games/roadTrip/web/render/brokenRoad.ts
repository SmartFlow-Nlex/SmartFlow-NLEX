import { makeCanvas, shade } from '../art/kit';
import { laneAt, screenX, screenY, zAtY, type Camera } from './camera';

type Ctx = CanvasRenderingContext2D;

/**
 * Broken road, drawn flat on the asphalt in the road's own perspective (Ysa's reference, 6 Nov):
 *
 * - A stretch of road repairs is old asphalt that has cracked all over: long dark cracks running
 *   across and along it, patches of fine crazed cells between them, worn spots, dust and grain.
 *   It is painted once per stretch into a texture in road units and laid on the road row by row,
 *   the way the road itself is, under the painted lines.
 * - A pothole is a shallow dark hole with a crumbling rim, mottled inside, cracks running out.
 *
 * Nothing here touches the game: what can hit you is still the hazard's own box, and a stretch
 * only slows the steering, as before.
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

/** Projects a thing's own points onto the screen, from where it is on the road. Only what is behind the camera itself is held back. */
function projector(cam: Camera, x0: number, z0: number): (p: P) => [number, number] {
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

// -- potholes ------------------------------------------------------------------------------------

interface Pothole {
  rim: P[];
  hole: P[];
  halo: P[];
  cracks: P[][];
  /** Dark blotches and light grit inside the hole. */
  mottle: { x: number; z: number; s: number; dark: boolean }[];
}

const potholes = new Map<number, Pothole>();

function potholeShape(id: number, halfW: number, len: number): Pothole {
  const known = potholes.get(id);
  if (known !== undefined) {
    return known;
  }
  const r = rng(id * 7 + 3);
  // Drawn a little longer than its box along the road: seen this low, a hole is mostly foreshortened.
  const rx = halfW * 1.08;
  const rz = len * 0.85;
  const cz = len * 0.5;
  const rim = jagged(r, 0, cz, rx, rz, 20, 0.3);
  const hole = rim.map(([x, z]) => [x * (0.8 + r() * 0.1), cz + (z - cz) * (0.76 + r() * 0.1)] as P);
  const halo = jagged(r, 0, cz, rx * 1.45, rz * 1.5, 14, 0.25);
  const cracks: P[][] = [];
  const count = 4 + Math.floor(r() * 3);
  for (let i = 0; i < count; i += 1) {
    const a = r() * Math.PI * 2;
    const from = rim[Math.floor(r() * rim.length)];
    cracks.push(crack(r, from[0], from[1], Math.cos(a), Math.sin(a) * 1.6, halfW * (0.8 + r() * 1.1), 5));
  }
  const mottle: Pothole['mottle'] = [];
  for (let i = 0; i < 26; i += 1) {
    const a = r() * Math.PI * 2;
    const k = Math.sqrt(r()) * 0.85;
    mottle.push({ x: Math.cos(a) * rx * 0.8 * k, z: cz + Math.sin(a) * rz * 0.76 * k, s: 0.6 + r() * 1.4, dark: i % 3 !== 0 });
  }
  const shape = { rim, hole, halo, cracks, mottle };
  potholes.set(id, shape);
  if (potholes.size > 64) {
    potholes.delete(potholes.keys().next().value!);
  }
  return shape;
}

/** One pothole: crazed asphalt round it, cracks running out, a crumbling rim, and a shallow mottled hole whose far wall catches the light. */
export function drawPothole(ctx: Ctx, cam: Camera, h: { id: number; x: number; z: number; halfW: number; len: number }, asphalt: string, wet: boolean, nearZ: number, outline: boolean): void {
  void nearZ;
  const shape = potholeShape(h.id, h.halfW, h.len);
  const at = projector(cam, h.x, h.z);
  const lane = laneAt(cam, h.z + h.len / 2);
  const detail = lane > 50;
  // Sunken, crazed asphalt round the hole.
  path(ctx, shape.halo, at, true);
  ctx.fillStyle = shade(asphalt, -0.14);
  const base = ctx.globalAlpha;
  ctx.globalAlpha = base * 0.45;
  ctx.fill();
  ctx.globalAlpha = base;
  if (detail) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const w = Math.max(1, lane * 0.008);
    // Each crack: a pale lip on the near side, then the dark gap.
    ctx.strokeStyle = shade(asphalt, 0.3);
    ctx.globalAlpha = base * 0.4;
    ctx.lineWidth = w;
    ctx.save();
    ctx.translate(0, Math.max(0.8, w * 0.7));
    for (const c of shape.cracks) {
      path(ctx, c, at, false);
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = base;
    ctx.strokeStyle = shade(asphalt, -0.62);
    for (const c of shape.cracks) {
      path(ctx, c, at, false);
      ctx.stroke();
    }
  }
  // The rim: the broken edge of the top layer, a little paler than the road.
  path(ctx, shape.rim, at, true);
  ctx.fillStyle = shade(asphalt, 0.08);
  ctx.fill();
  // The hole: shallow, grey and dark. The far wall faces us and takes the light; the near side is in shadow.
  path(ctx, shape.hole, at, true);
  const [, farY] = at([0, h.len * 0.5 + h.len * 0.66]);
  const [, nearY] = at([0, h.len * 0.5 - h.len * 0.66]);
  const g = ctx.createLinearGradient(0, farY, 0, nearY);
  g.addColorStop(0, shade(asphalt, -0.16));
  g.addColorStop(0.3, shade(asphalt, -0.4));
  g.addColorStop(0.75, shade(asphalt, -0.52));
  g.addColorStop(1, shade(asphalt, -0.64));
  ctx.fillStyle = g;
  ctx.fill();
  if (detail) {
    // Mottled inside: dark blotches and pale grit, as worn asphalt breaks up.
    ctx.save();
    path(ctx, shape.hole, at, true);
    ctx.clip();
    const dot = Math.max(1, lane * 0.012);
    for (const m of shape.mottle) {
      const [x, y] = at([m.x, m.z]);
      const s = dot * m.s;
      ctx.fillStyle = m.dark ? 'rgba(10,12,18,0.35)' : 'rgba(205,205,210,0.4)';
      ctx.fillRect(x - s / 2, y - s * 0.3, s, s * 0.6);
    }
    ctx.restore();
    // The near rim's broken edge, lit.
    path(ctx, shape.hole, at, true);
    ctx.strokeStyle = shade(asphalt, -0.7);
    ctx.lineWidth = Math.max(0.75, lane * 0.005);
    ctx.globalAlpha = base * 0.6;
    ctx.stroke();
    ctx.globalAlpha = base;
  }
  if (wet) {
    // Rainwater in the bottom, catching the sky.
    ctx.save();
    path(ctx, shape.hole, at, true);
    ctx.clip();
    const [wx, wy] = at([0, h.len * 0.38]);
    ctx.beginPath();
    ctx.ellipse(wx, wy, lane * h.halfW * 0.85, Math.max(2, lane * 0.03), 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(150,176,200,0.5)';
    ctx.fill();
    ctx.restore();
  }
  if (outline) {
    path(ctx, shape.rim, at, true);
    ctx.strokeStyle = 'rgba(255,214,64,0.95)';
    ctx.lineWidth = Math.max(2, lane * 0.012);
    ctx.stroke();
  }
}

// -- broken stretches ----------------------------------------------------------------------------

/** The texture's scale: finer than the road's own (150 x 36), so cracks stay sharp near the car; the grain is sized to match. */
const TEX_PX = 200;
const TEX_PY = 48;
/** The asphalt's half width in lanes: the painted edge lines sit just outside it. */
const HALF = 1.5;


/** Behind the car (z below 0) the damage fades out between these two distances. */
const FADE_FROM = -2.6;
const FADE_TO = -0.2;

/** Repeating tiles: the asphalt's grain, and the pale and dark flecks of worn asphalt. Made once per colour. */
const tiles = new Map<string, CanvasPattern | null>();

function tilePattern(onto: Ctx, key: string, size: number, paint: (c: Ctx, r: () => number) => void): CanvasPattern | null {
  if (!tiles.has(key)) {
    const { canvas, ctx } = makeCanvas(size, size, 1);
    paint(ctx, rng(size * 31 + key.length));
    tiles.set(key, onto.createPattern(canvas, 'repeat'));
  }
  return tiles.get(key) ?? null;
}

type Pt = [number, number];

/** The fine crazing tile's cells: columns and rows of sites, and their spacing in texture pixels. */
const CRAZE_COLS = 10;
const CRAZE_ROWS = 20;
const CRAZE_CW = 25;
const CRAZE_CH = 12;
let crazeTile: HTMLCanvasElement | null = null;

/**
 * Fine crazing, the road's "alligator" cracking, as one seamless tile in neutral colours (dark
 * walls, a pale lip) so it suits every time of day. Irregular cells: sites on a jittered grid,
 * each grid square split into two triangles along a random diagonal, and the cells' walls drawn
 * between the middles of neighbouring triangles. Everything repeats with the tile, so its edges
 * meet. Drawn once: stamping it is far cheaper than stroking thousands of tiny walls per stretch.
 */
function crazing(): HTMLCanvasElement {
  if (crazeTile !== null) {
    return crazeTile;
  }
  const TW = CRAZE_COLS * CRAZE_CW;
  const TH = CRAZE_ROWS * CRAZE_CH;
  const { canvas, ctx } = makeCanvas(TW, TH, 1);
  const r = rng(4242);
  const mod = (n: number, m: number): number => ((n % m) + m) % m;
  const jitter: Pt[][] = [];
  const diagonal: boolean[][] = [];
  for (let i = 0; i < CRAZE_COLS; i += 1) {
    jitter.push([]);
    diagonal.push([]);
    for (let j = 0; j < CRAZE_ROWS; j += 1) {
      jitter[i].push([(r() - 0.5) * 0.8, (r() - 0.5) * 0.8]);
      diagonal[i].push(r() < 0.5);
    }
  }
  const site = (i: number, j: number): Pt => {
    const [jx, jy] = jitter[mod(i, CRAZE_COLS)][mod(j, CRAZE_ROWS)];
    return [(i + jx) * CRAZE_CW, (j + jy) * CRAZE_CH];
  };
  /** A number from 0 to 1 fixed for one wall and every repeat of it. */
  const hash = (a: number, b: number, c: number): number => (Math.imul((a * 73856093) ^ (b * 19349663) ^ (c * 83492791), 2654435761) >>> 0) / 4294967296;
  const sides = new Map<string, { at: Pt; ends: [number, number, number, number] }[]>();
  for (let i = -2; i <= CRAZE_COLS + 1; i += 1) {
    for (let j = -2; j <= CRAZE_ROWS + 1; j += 1) {
      const A: [number, number] = [i, j];
      const B: [number, number] = [i + 1, j];
      const C: [number, number] = [i, j + 1];
      const D: [number, number] = [i + 1, j + 1];
      const triangles = diagonal[mod(i, CRAZE_COLS)][mod(j, CRAZE_ROWS)] ? [[A, B, D], [A, D, C]] : [[A, B, C], [B, D, C]];
      for (const t of triangles) {
        const pts = t.map(([x, y]) => site(x, y));
        const at: Pt = [(pts[0][0] + pts[1][0] + pts[2][0]) / 3, (pts[0][1] + pts[1][1] + pts[2][1]) / 3];
        for (let k = 0; k < 3; k += 1) {
          const p = t[k];
          const q = t[(k + 1) % 3];
          const [s, e] = p[0] < q[0] || (p[0] === q[0] && p[1] < q[1]) ? [p, q] : [q, p];
          const key = `${s[0]},${s[1]},${e[0]},${e[1]}`;
          const list = sides.get(key) ?? [];
          list.push({ at, ends: [s[0], s[1], e[0], e[1]] });
          sides.set(key, list);
        }
      }
    }
  }
  const walls = new Path2D();
  const lips = new Path2D();
  for (const list of sides.values()) {
    if (list.length !== 2) {
      continue;
    }
    const [i1, j1, i2, j2] = list[0].ends;
    const id = mod(i1, CRAZE_COLS) * 1000 + mod(j1, CRAZE_ROWS);
    const shape = (i2 - i1) * 3 + (j2 - j1);
    // A few walls are missing, so some cells run together, as real crazing does.
    if (hash(id, shape, 1) < 0.1) {
      continue;
    }
    const a = list[0].at;
    const b = list[1].at;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const span = Math.hypot(dx, dy) || 1;
    const off = (hash(id, shape, 2) - 0.5) * 0.36 * span;
    const mx = (a[0] + b[0]) / 2 - (dy / span) * off;
    const my = (a[1] + b[1]) / 2 + (dx / span) * off;
    walls.moveTo(a[0], a[1]);
    walls.lineTo(mx, my);
    walls.lineTo(b[0], b[1]);
    lips.moveTo(a[0], a[1] + 1.5);
    lips.lineTo(mx, my + 1.5);
    lips.lineTo(b[0], b[1] + 1.5);
  }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(234,238,244,0.3)';
  ctx.lineWidth = 1.2;
  ctx.stroke(lips);
  ctx.strokeStyle = 'rgba(14,17,24,0.62)';
  ctx.lineWidth = 1.4;
  ctx.stroke(walls);
  crazeTile = canvas;
  return canvas;
}

/** Makes the crazing tile ahead of time (when a level loads), so the first broken stretch costs no more than the rest. */
export function prepareBrokenRoad(): void {
  crazing();
}

/**
 * Canvas drawing is queued and done when the canvas is next used. Drawing a canvas into this
 * one-pixel sink makes it finish now, so each stage's work lands in its own frame.
 */
let sink: { canvas: HTMLCanvasElement; ctx: Ctx } | null = null;
function settle(canvas: HTMLCanvasElement): void {
  sink ??= makeCanvas(1, 1, 1);
  sink.ctx.drawImage(canvas, 0, 0, 1, 1);
}


/**
 * A crack net with irregular cells, like real crazing: sites on a jittered grid, each grid
 * square split into two triangles along a random diagonal, and the cells' walls drawn between
 * the middles of triangles that share a side. Each wall is handed to `wall`, which decides
 * whether to keep it.
 */
function crackNet(r: () => number, x0: number, y0: number, cols: number, rows: number, cw: number, ch: number, jitter: number, wall: (a: Pt, b: Pt) => void): void {
  const site: Pt[][] = [];
  for (let i = 0; i <= cols; i += 1) {
    const column: Pt[] = [];
    for (let j = 0; j <= rows; j += 1) {
      column.push([x0 + (i + (r() - 0.5) * jitter) * cw, y0 + (j + (r() - 0.5) * jitter) * ch]);
    }
    site.push(column);
  }
  const sides = new Map<number, Pt[]>();
  const index = (i: number, j: number): number => i * (rows + 1) + j;
  for (let i = 0; i < cols; i += 1) {
    for (let j = 0; j < rows; j += 1) {
      const A = index(i, j);
      const B = index(i + 1, j);
      const C = index(i, j + 1);
      const D = index(i + 1, j + 1);
      for (const t of r() < 0.5 ? [[A, B, D], [A, D, C]] : [[A, B, C], [B, D, C]]) {
        const pts = t.map((k) => site[Math.floor(k / (rows + 1))][k % (rows + 1)]);
        const at: Pt = [(pts[0][0] + pts[1][0] + pts[2][0]) / 3, (pts[0][1] + pts[1][1] + pts[2][1]) / 3];
        for (let k = 0; k < 3; k += 1) {
          const p = t[k];
          const q = t[(k + 1) % 3];
          const key = Math.min(p, q) * 1_000_003 + Math.max(p, q);
          const list = sides.get(key) ?? [];
          list.push(at);
          sides.set(key, list);
        }
      }
    }
  }
  for (const list of sides.values()) {
    if (list.length === 2) {
      wall(list[0], list[1]);
    }
  }
}

interface PaintJob {
  canvas: HTMLCanvasElement;
  /** What is left to paint, in order; empty when the texture is done. */
  steps: (() => void)[];
}

const jobs = new Map<string, PaintJob>();

/**
 * A stretch of cracked road as a picture, in road units: across is lanes, up the picture is
 * further along the road. Opaque, on the road's own asphalt, grain and wheel tracks, so where
 * the damage fades out at each end it meets the good road without a seam. Painted in five
 * stages, so it can be spread over frames while the stretch is still out of sight.
 */
function paintJob(id: number, len: number, asphalt: string, wet: boolean): PaintJob {
  const key = `${id}|${asphalt}|${wet ? 'w' : 'd'}`;
  const known = jobs.get(key);
  if (known !== undefined) {
    return known;
  }
  const W = Math.round(HALF * 2 * TEX_PX);
  const H = Math.max(2, Math.ceil(len * TEX_PY));
  const X = (lanes: number): number => (lanes + HALF) * TEX_PX;
  const Y = (z: number): number => H - z * TEX_PY;
  const r = rng(id * 13 + 11);
  const { canvas, ctx: c } = makeCanvas(W, H, 1);

  const steps: (() => void)[] = [];
  steps.push(() => {
    // The road under it, as roadscape paints it: asphalt, grain, two worn wheel tracks a lane.
    c.fillStyle = asphalt;
    c.fillRect(0, 0, W, H);
    const grain = tilePattern(c, `grain|${asphalt}`, 160, (t, tr) => {
      const shades = [-0.1, -0.06, -0.03, 0.03, 0.06, 0.1].map((k) => shade(asphalt, k));
      for (let i = 0; i < 420; i += 1) {
        t.fillStyle = shades[Math.floor(tr() * shades.length)];
        const s = 1.1 + tr() * 1.9;
        t.fillRect(tr() * 160, tr() * 160, s, s * 1.4);
      }
    });
    if (grain !== null) {
      c.fillStyle = grain;
      c.fillRect(0, 0, W, H);
    }
    for (const lane of [-1, 0, 1]) {
      for (const off of [-0.24, 0.24]) {
        const gx = X(lane + off);
        const g = c.createLinearGradient(gx - 21, 0, gx + 21, 0);
        g.addColorStop(0, 'rgba(30,36,48,0)');
        g.addColorStop(0.5, wet ? 'rgba(210,225,235,0.09)' : 'rgba(30,36,48,0.1)');
        g.addColorStop(1, 'rgba(30,36,48,0)');
        c.fillStyle = g;
        c.fillRect(gx - 21, 0, 42, H);
      }
    }
    settle(canvas);
  });

  // The damage, on a layer of its own so it can thin out at both ends.
  const { canvas: layer, ctx: d } = makeCanvas(W, H, 1);
  const dark = shade(asphalt, -0.62);
  const lip = shade(asphalt, 0.34);
  // Soft things are painted at a quarter of the size and scaled up: they have no detail to lose, and it is far quicker.
  const QW = Math.ceil(W / 4);
  const QH = Math.ceil(H / 4);
  const soft = (on: Ctx, x: number, y: number, rx: number, ry: number, rgb: string, alpha: number): void => {
    on.save();
    on.translate(x, y);
    on.scale(1, ry / rx);
    const g = on.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, `rgba(${rgb},${alpha})`);
    g.addColorStop(0.55, `rgba(${rgb},${alpha * 0.85})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    on.fillStyle = g;
    on.fillRect(-rx, -rx, rx * 2, rx * 2);
    on.restore();
  };
  /** How much of the damage is left this far along: thinning toward both ends. */
  const middle = (y: number): number => {
    const z = (H - y) / TEX_PY;
    return Math.max(0, Math.min(1, z / 3, (len - z) / 3));
  };

  const { canvas: quarter, ctx: q } = makeCanvas(QW, QH, 1);
  let crazeLayer: { canvas: HTMLCanvasElement; ctx: Ctx } | null = null;
  q.scale(QW / W, QH / H);
  steps.push(() => {
    // Weathering: old asphalt goes pale and dusty in places, dark and oily in others.
    for (let i = 0; i < 6 + len * 0.6; i += 1) {
      const pale = r() < 0.68;
      soft(q, X((r() - 0.5) * 2.8), Y(r() * len), (0.3 + r() * 0.55) * TEX_PX, (0.8 + r() * 2.4) * TEX_PY, pale ? '226,230,238' : '14,18,26', pale ? 0.12 + r() * 0.15 : 0.08 + r() * 0.1);
    }
    // Worn spots: shallow ravelled patches, darker and mottled, with no rim (only potholes have one).
    const worn: { x: number; y: number; rx: number; ry: number }[] = [];
    for (let i = 0; i < 1 + Math.floor(len / 9); i += 1) {
      const spot = { x: X((r() - 0.5) * 2.4), y: Y(1.5 + r() * (len - 3)), rx: (0.16 + r() * 0.14) * TEX_PX, ry: (0.5 + r() * 0.6) * TEX_PY };
      soft(q, spot.x, spot.y, spot.rx, spot.ry, '12,14,20', 0.45);
      worn.push(spot);
    }
    d.drawImage(quarter, 0, 0, QW, QH, 0, 0, W, H);
    for (const { x, y, rx, ry } of worn) {
      for (let k = 0; k < 40; k += 1) {
        const a = r() * Math.PI * 2;
        const m = Math.sqrt(r()) * 0.8;
        const s = 1.2 + r() * 2.4;
        d.fillStyle = k % 3 === 0 ? 'rgba(210,210,215,0.35)' : 'rgba(8,10,14,0.4)';
        d.fillRect(x + Math.cos(a) * rx * m, y + Math.sin(a) * ry * m, s, s * 0.8);
      }
    }
    settle(layer);
  });

  steps.push(() => {
    // Fine crazing: the tile laid over the whole stretch, then kept only in soft-edged patches.
    const tile = crazing();
    // Its own scratch canvas, let go once the crazing is in.
    crazeLayer = makeCanvas(W, H, 1);
    const cz = crazeLayer.ctx;
    const pattern = cz.createPattern(tile, 'repeat');
    if (pattern !== null) {
      cz.globalCompositeOperation = 'source-over';
      cz.clearRect(0, 0, W, H);
      cz.save();
      const ox = r() * tile.width;
      const oy = r() * tile.height;
      cz.translate(-ox, -oy);
      cz.fillStyle = pattern;
      cz.fillRect(ox, oy, W, H);
      cz.restore();
      settle(crazeLayer.canvas);
    }
  });

  steps.push(() => {
    if (crazeLayer !== null) {
      const cz = crazeLayer.ctx;
      // Where it stays: a few soft blobs to each patch, so each thins out unevenly.
      q.setTransform(1, 0, 0, 1, 0, 0);
      q.clearRect(0, 0, QW, QH);
      q.scale(QW / W, QH / H);
      for (let n = 0; n < 4 + Math.floor(len / 2.6); n += 1) {
        const px = X((r() - 0.5) * 2.4);
        const py = Y(1 + r() * (len - 2));
        const bw = (0.7 + r() * 1) * TEX_PX;
        const bh = (2.8 + r() * 5.2) * TEX_PY;
        const strength = Math.min(1, middle(py) + 0.2);
        for (let b = 0; b < 3; b += 1) {
          const rb = bw * (0.3 + r() * 0.18);
          soft(q, px + (r() - 0.5) * bw * 0.35, py + (r() - 0.5) * bh * 0.35, rb, rb * (bh / bw), '0,0,0', strength);
        }
      }
      cz.globalCompositeOperation = 'destination-in';
      cz.drawImage(quarter, 0, 0, QW, QH, 0, 0, W, H);
      cz.globalCompositeOperation = 'source-over';
      d.drawImage(crazeLayer.canvas, 0, 0, W, H, 0, 0, W, H);
      settle(layer);
      crazeLayer = null;
    }
  });

  let byWidth = new Map<number, { lipPath: Path2D; gap: Path2D }>();
  steps.push(() => {
    // The big cracks: broken blocks about a lane wide over the whole stretch, their walls wandering.
    const big: { a: Pt; b: Pt; w: number }[] = [];
    const blockW = (0.62 + r() * 0.16) * TEX_PX;
    const blockH = (2.1 + r() * 0.7) * TEX_PY * 0.5;
    crackNet(r, -blockW * 0.6, -blockH * 0.6, Math.ceil(W / blockW) + 2, Math.ceil(H / blockH) + 2, blockW, blockH, 0.7, (a, b) => {
      if (r() < 0.22 || r() > middle((a[1] + b[1]) / 2) + 0.15) {
        return;
      }
      big.push({ a, b, w: 3.6 + r() * 2 });
    });
    const lineWobbly = (a: Pt, b: Pt, parts: number, amount: number): Pt[] => {
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const span = Math.hypot(dx, dy) || 1;
      const out: Pt[] = [a];
      for (let k = 1; k < parts; k += 1) {
        const t = k / parts + (r() - 0.5) * (0.5 / parts);
        const off = (r() - 0.5) * 2 * amount * span;
        out.push([a[0] + dx * t - (dy / span) * off, a[1] + dy * t + (dx / span) * off]);
      }
      out.push(b);
      return out;
    };
    const bigPaths: { pts: Pt[]; w: number }[] = big.map(({ a, b, w }) => ({ pts: lineWobbly(a, b, 6, 0.08), w }));
    // Short spurs off the big cracks, into the blocks.
    for (const { pts, w } of [...bigPaths]) {
      if (r() < 0.3) {
        const from = pts[1 + Math.floor(r() * (pts.length - 2))];
        const a = r() * Math.PI * 2;
        const reachPx = (0.1 + r() * 0.2) * TEX_PX;
        bigPaths.push({ pts: lineWobbly(from, [from[0] + Math.cos(a) * reachPx, from[1] + Math.sin(a) * reachPx * 0.45], 3, 0.15), w: w * 0.55 });
      }
    }

    // Each big crack: a pale lip on its near side, the dark gap, and a darker core. Batched by width.
    byWidth = new Map<number, { lipPath: Path2D; gap: Path2D }>();
    for (const { pts, w } of bigPaths) {
      const bw = Math.round(w * 2) / 2;
      let entry = byWidth.get(bw);
      if (entry === undefined) {
        entry = { lipPath: new Path2D(), gap: new Path2D() };
        byWidth.set(bw, entry);
      }
      const { lipPath, gap } = entry;
      pts.forEach(([x, y], i) => (i === 0 ? lipPath.moveTo(x, y + bw * 0.6) : lipPath.lineTo(x, y + bw * 0.6)));
      pts.forEach(([x, y], i) => (i === 0 ? gap.moveTo(x, y) : gap.lineTo(x, y)));
    }
    d.lineCap = 'round';
    d.lineJoin = 'round';
    for (const [w, { lipPath }] of byWidth) {
      d.strokeStyle = lip;
      d.globalAlpha = 0.3;
      d.lineWidth = w * 0.7;
      d.stroke(lipPath);
    }
    d.globalAlpha = 1;
    settle(layer);
  });

  steps.push(() => {
    d.lineCap = 'round';
    d.lineJoin = 'round';
    for (const [w, { gap }] of byWidth) {
      d.strokeStyle = dark;
      d.globalAlpha = 0.88;
      d.lineWidth = w;
      d.stroke(gap);
    }
    settle(layer);
  });

  steps.push(() => {
    d.lineCap = 'round';
    d.lineJoin = 'round';
    for (const [w, { gap }] of byWidth) {
      d.strokeStyle = 'rgb(8,9,12)';
      d.globalAlpha = 0.45;
      d.lineWidth = w * 0.38;
      d.stroke(gap);
    }
    d.globalAlpha = 1;
    settle(layer);
  });

  steps.push(() => {
    // Pale and dark flecks: aggregate showing through the worn surface.
    const flecks = tilePattern(d, 'flecks', 128, (t, tr) => {
      for (let i = 0; i < 70; i += 1) {
        const pale = tr() < 0.55;
        t.fillStyle = pale ? 'rgba(228,230,236,0.32)' : 'rgba(10,12,18,0.3)';
        const s = 1 + tr() * 1.4;
        t.fillRect(tr() * 128, tr() * 128, s, s);
      }
    });
    if (flecks !== null) {
      d.fillStyle = flecks;
      d.fillRect(0, 0, W, H);
    }
    if (wet) {
      // Rain darkens the worn surface.
      d.fillStyle = 'rgba(16,24,36,0.12)';
      d.fillRect(0, 0, W, H);
    }
    settle(layer);
  });

  steps.push(() => {
    // Thin out at both ends, so the damage starts and stops gradually rather than at a line.
    const fade = Math.min(3, len * 0.18) * TEX_PY;
    d.globalCompositeOperation = 'destination-out';
    for (const [from, to] of [[H, H - fade], [0, fade]] as const) {
      const g = d.createLinearGradient(0, from, 0, to);
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      d.fillStyle = g;
      d.fillRect(0, Math.min(from, to), W, fade);
    }
    d.globalCompositeOperation = 'source-over';
    c.drawImage(layer, 0, 0);
    settle(canvas);
  });

  const job = { canvas, steps };
  jobs.set(key, job);
  if (jobs.size > 3) {
    jobs.delete(jobs.keys().next().value!);
  }
  return job;
}

/** The whole texture at once (development checks); `times`, if given, gets each stage's milliseconds. */
export function crackTexture(id: number, len: number, asphalt: string, wet: boolean, times?: number[]): HTMLCanvasElement {
  const job = paintJob(id, len, asphalt, wet);
  while (job.steps.length > 0) {
    const t = performance.now();
    job.steps.shift()!();
    times?.push(performance.now() - t);
  }
  return job.canvas;
}

/** One stage of the texture per call, so no single frame pays for all of it; null until it is done. */
function crackTextureSoon(id: number, len: number, asphalt: string, wet: boolean): HTMLCanvasElement | null {
  const job = paintJob(id, len, asphalt, wet);
  job.steps.shift()?.();
  return job.steps.length === 0 ? job.canvas : null;
}

/**
 * A stretch of road repairs: the cracked texture laid on the road row by row, in the same
 * perspective as the road (roadscape.ts), and drawn before the painted lines so they stay on top.
 */
export function drawBrokenPatch(ctx: Ctx, cam: Camera, patch: { id: number; z: number; len: number }, asphalt: string, wet: boolean, nearZ: number, farZ: number): void {
  void nearZ;
  const zFar = Math.min(patch.z + patch.len, farZ);
  const zNear = Math.max(patch.z, -cam.depth + 0.9);
  if (zFar <= zNear) {
    return;
  }
  // Painted a stage a frame as the stretch comes into view, fading in from the horizon, so nothing stutters.
  const tex = crackTextureSoon(patch.id, patch.len, asphalt, wet);
  if (tex === null) {
    return;
  }
  const W = tex.width;
  const H = tex.height;
  const bottom = Math.min(cam.height, screenY(cam, Math.max(zNear, FADE_FROM)));
  // Rows start and end on whole device pixels, so neighbouring rows meet exactly: fading rows that overlapped would show as stripes.
  const m = ctx.getTransform();
  const snap = (v: number): number => (Math.round(v * m.d + m.f) - m.f) / m.d;
  let y = snap(Math.max(cam.horizonY + 1, screenY(cam, zFar)));
  const base = ctx.globalAlpha;
  while (y < bottom) {
    // Each row is a flat rectangle, so a crack leaning toward the horizon steps sideways from row to row: short rows keep the steps too small to see.
    const step = Math.max(1.2, Math.min(2, (y - cam.horizonY) * 0.012));
    const next = Math.max(y + 1 / m.d, snap(Math.min(bottom, y + step)));
    const z1 = Math.min(zFar, zAtY(cam, y));
    const z0 = Math.max(zNear, zAtY(cam, next));
    if (z1 > z0) {
      const zm = (z0 + z1) / 2;
      const lane = laneAt(cam, zm);
      const sh = Math.max(1, (z1 - z0) * TEX_PY);
      const sy = Math.max(0, Math.min(H - sh, H - (z1 - patch.z) * TEX_PY));
      // Behind the car the view stretches the road out of shape, so the damage fades away there (the reference keeps it plain).
      const k = Math.max(0, Math.min(1, (zm - FADE_FROM) / (FADE_TO - FADE_FROM)));
      ctx.globalAlpha = base * k * k * (3 - 2 * k);
      ctx.drawImage(tex, 0, sy, W, sh, screenX(cam, -HALF, zm), y, HALF * 2 * lane, next - y);
    }
    y = next;
  }
  ctx.globalAlpha = base;
}
