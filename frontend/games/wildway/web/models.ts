import { MeshBuilder, STRIDE, type Color } from './gl/builder';
import { hex, type Vec3 } from './gl/math';
import type { Mesh, Renderer } from './gl/renderer';
import { Rig } from './gl/rig';

/**
 * Every character and vehicle, sculpted from simple rounded shapes in one design
 * language: soft, chubby silhouettes, big heads, flat colour and big shiny eyes. The four
 * heroes are original characters written for this game.
 *
 * Faces are on bones of their own, so they can blink, raise their brows and change mouth
 * without new meshes: a part that is not in use (the happy eyes, the open mouth) is shrunk
 * to a point inside the head, where nothing shows.
 */

export type HeroId = 'dayo' | 'baging' | 'sukat' | 'awit';

/** A small thing a character does now and then when standing about. */
export type Habit = 'none' | 'binoculars' | 'clipboard' | 'wrench' | 'radio' | 'wave' | 'stretch';

/** The bones of a face. */
export interface FaceRig {
  eyes: number;
  happy: number;
  browL: number;
  browR: number;
  smile: number;
  open: number;
}

export interface Character {
  mesh: Mesh;
  rig: Rig;
  face?: FaceRig;
  /** How high a carried crate sits. */
  carryTop?: number;
  habit?: Habit;
  /** The smile is a wide open grin (Navie's), so a happy face grows it instead of opening an O. */
  grin?: boolean;
  /** Bigger than 1 for a bigger head, scaled from the neck. */
  headScale?: number;
}

/** Bones shared by people-like characters. `bob` carries a springy hair ornament. */
export const B = { root: 0, torso: 1, head: 2, armL: 3, armR: 4, legL: 5, legR: 6, extra: 7, extra2: 8, eyes: 9, happy: 10, browL: 11, browR: 12, smile: 13, open: 14, bob: 15 };

const PEOPLE_FACE: FaceRig = { eyes: B.eyes, happy: B.happy, browL: B.browL, browR: B.browR, smile: B.smile, open: B.open };

/* ---- Faces ---- */

type Surface = (x: number, y: number) => number;

/** Marks fine detail for the renderer: no contour around it. */
const NO_LINE = -1;

/** The front of an egg-shaped head or body: its z at (x, y). */
const eggFront =
  (cy: number, cz: number, rx: number, ry: number, rz: number): Surface =>
  (x, y) =>
    cz + rz * Math.sqrt(Math.max(0.03, 1 - (x / rx) ** 2 - ((y - cy) / ry) ** 2));

const mixHex = (a: string, b: string, k: number): Vec3 => {
  const p = hex(a);
  const q = hex(b);
  return [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k, p[2] + (q[2] - p[2]) * k];
};

interface FaceSpec {
  surf: Surface;
  /** Half the width of the head, for turning features to follow its curve; 0 for a flat screen. */
  curve: number;
  eyeX: number;
  eyeY: number;
  eyeW: number;
  eyeH: number;
  eyeColor: Color;
  glint: Color;
  browY: number;
  browW: number;
  browColor: Color;
  mouthY: number;
  mouthW: number;
  mouthColor: Color;
  tongue: Color | null;
  cheekX: number;
  cheekY: number;
  cheekW: number;
  cheekColor: Color | null;
  /** How far behind the face the pivots of hidden parts sit. */
  pivotZ: number;
  bones: FaceRig;
  /** The bone the static parts (the cheeks) go on. */
  base: number;
  /** Coloured eyes: an iris inside the dark rim, a lighter crescent low in it, and a dark pupil. */
  iris?: Color;
  irisLight?: Color;
  pupil?: Color;
  /** Two little lashes flicking out from the top outer corner of each eye. */
  lashes?: boolean;
  /** The smile is a wide open grin with a tongue (Navie's), not a thin curve. */
  grin?: boolean;
  /** The smile is a little w, as on a pup's muzzle. */
  wMouth?: boolean;
  /** Two little teeth showing along the top of a grin. */
  teeth?: Color;
  /** How thick the brows are, as a share of their width (0.3 if not set). */
  browH?: number;
  /** Brows angled down towards the nose by this much: a sly, plotting look. Unset: the friendly default. */
  browTilt?: number;
  /** One corner of a grin higher than the other: a smirk. */
  smirk?: number;
  /** A paler halo round each cheek, so the blush fades softly into the face. */
  cheekSoft?: Color;
}

/** Points on a face or a garment, `lift` in front of it, with normals that follow its curve. */
function surfNormal(surf: Surface, x: number, y: number): Vec3 {
  const e = 0.004;
  const nx = -(surf(x + e, y) - surf(x - e, y)) / (2 * e);
  const ny = -(surf(x, y + e) - surf(x, y - e)) / (2 * e);
  const l = Math.hypot(nx, ny, 1);
  return [nx / l, ny / l, 1 / l];
}

/** A flat shape laid on a surface: a fan from `centre` round the rim, which must run anticlockwise. */
function fanOn(b: MeshBuilder, surf: Surface, centre: [number, number], rim: [number, number][], color: Color, lift: number): void {
  const c = typeof color === 'string' ? hex(color) : color;
  const put = (x: number, y: number): number => {
    const n = surfNormal(surf, x, y);
    return b.rawVertex(x, y, surf(x, y) + lift, n[0], n[1], n[2], c);
  };
  const mid = put(centre[0], centre[1]);
  const first = b.vertexCount;
  for (const [x, y] of rim) {
    put(x, y);
  }
  for (let i = 0; i < rim.length - 1; i += 1) {
    b.indices.push(mid, first + i, first + i + 1);
  }
}

/** A line of tubes laid along a surface: a badge's ring, a letter. */
function lineOn(b: MeshBuilder, surf: Surface, pts: [number, number][], r: number, color: string, lift = 0.006): void {
  let prev: Vec3 | null = null;
  for (const [x, y] of pts) {
    const p: Vec3 = [x, y, surf(x, y) + lift];
    if (prev !== null) {
      b.tube(prev, p, r, r, color, 5, false);
    }
    prev = p;
  }
}

/** Points from a to c, so a straight stroke can hug a curved surface. */
const stroke = (a: [number, number], c: [number, number], n = 4): [number, number][] =>
  Array.from({ length: n + 1 }, (_, i) => [a[0] + ((c[0] - a[0]) * i) / n, a[1] + ((c[1] - a[1]) * i) / n] as [number, number]);

/** Navie's N: up the left, down the diagonal, up the right. */
function letterN(b: MeshBuilder, surf: Surface, cx: number, cy: number, h: number, r: number, color: string): void {
  const w = h * 0.8;
  const l = cx - w / 2;
  const rt = cx + w / 2;
  const lo = cy - h / 2;
  const hi = cy + h / 2;
  lineOn(b, surf, [...stroke([l, lo], [l, hi], 3), ...stroke([l, hi], [rt, lo], 4).slice(1), ...stroke([rt, lo], [rt, hi], 3).slice(1)], r, color);
  for (const [x, y] of [
    [l, lo],
    [l, hi],
    [rt, lo],
    [rt, hi],
  ] as [number, number][]) {
    b.ball(x, y, surf(x, y) + 0.006, r, color, 3, 5);
  }
}

/** A ring laid on a surface. */
const ringOn = (b: MeshBuilder, surf: Surface, cx: number, cy: number, rad: number, r: number, color: string): void =>
  lineOn(
    b,
    surf,
    Array.from({ length: 21 }, (_, i) => [cx + Math.cos((i / 20) * Math.PI * 2) * rad, cy + Math.sin((i / 20) * Math.PI * 2) * rad] as [number, number]),
    r,
    color,
  );

/** A thin curved line along the face: a smile, or a closed happy eye. */
function arc(b: MeshBuilder, f: FaceSpec, cx: number, cy: number, w: number, h: number, r: number, color: Color): void {
  let prev: Vec3 | null = null;
  const n = 5;
  for (let i = 0; i <= n; i += 1) {
    const u = (i / n) * 2 - 1;
    const x = cx + u * w;
    const y = cy + h * u * u;
    const p: Vec3 = [x, y, f.surf(x, y) + r * 0.55];
    if (prev !== null) {
      b.tube(prev, p, r, r, color, 5, false);
    }
    b.ball(p[0], p[1], p[2], r, color, 3, 5);
    prev = p;
  }
}

const faceYaw = (f: FaceSpec, x: number): number => (f.curve > 0 ? Math.asin(Math.max(-0.9, Math.min(0.9, x / f.curve))) * 0.85 : 0);

/** Big shiny eyes, brows, a smile, an open mouth and rosy cheeks. Returns each face bone's pivot. */
function buildFace(b: MeshBuilder, f: FaceSpec): Record<number, Vec3> {
  const keep = b.bone;
  const d = f.eyeW * 0.62;
  b.bone = f.bones.eyes;
  b.sway = NO_LINE;
  for (const s of [-1, 1]) {
    const x = s * f.eyeX;
    const y = f.eyeY;
    const yaw = faceYaw(f, x);
    const cz = f.surf(x, y) - d * 0.3;
    b.ellipsoid(x, y, cz, f.eyeW, f.eyeH, d, f.eyeColor, { rows: 8, cols: 12, yaw });
    /* Coloured eyes sit a hair proud of the dark rim, layer on layer. */
    let depth = d;
    if (f.iris !== undefined) {
      depth = d * 1.05;
      b.ellipsoid(x, y - f.eyeH * 0.02, cz, f.eyeW * 0.8, f.eyeH * 0.8, depth, f.iris, { rows: 6, cols: 10, yaw });
      if (f.irisLight !== undefined) {
        depth = d * 1.09;
        b.ellipsoid(x, y - f.eyeH * 0.34, cz, f.eyeW * 0.58, f.eyeH * 0.34, depth, f.irisLight, { rows: 3, cols: 8, yaw });
      }
      depth = d * 1.13;
      b.ellipsoid(x, y + f.eyeH * 0.02, cz, f.eyeW * 0.44, f.eyeH * 0.48, depth, f.pupil ?? f.eyeColor, { rows: 4, cols: 8, yaw });
    }
    if (f.lashes === true) {
      /* Two little flicks from the top outer corner, curling up and out. */
      for (const [ang, len] of [
        [0.62, 0.042],
        [0.25, 0.036],
      ] as [number, number][]) {
        const ex = x + s * f.eyeW * Math.cos(ang) * 0.98;
        const ey = y + f.eyeH * Math.sin(ang) * 0.98;
        const p: Vec3 = [ex, ey, f.surf(ex, ey) + 0.002];
        const tx = ex + s * len * Math.cos(ang * 0.7);
        const ty = ey + len * Math.sin(ang * 0.7 + 0.35);
        const q: Vec3 = [tx, ty, f.surf(tx, ty) + 0.004];
        b.tube(p, q, f.eyeW * 0.16, f.eyeW * 0.07, f.eyeColor, 5, false);
      }
    }
    /* Two glints, both up and to the left, as if lit from the same side. */
    for (const [gx, gy, gr] of [
      [-0.3, 0.34, 0.36],
      [0.32, -0.36, 0.17],
    ] as [number, number, number][]) {
      const lx = gx * f.eyeW;
      const ly = gy * f.eyeH;
      const lz = depth * Math.sqrt(Math.max(0, 1 - gx * gx - gy * gy)) + 0.002;
      const ox = lx * Math.cos(yaw) + lz * Math.sin(yaw);
      const oz = -lx * Math.sin(yaw) + lz * Math.cos(yaw);
      const r = f.eyeW * gr;
      b.ellipsoid(x + ox, y + ly, cz + oz, r, r, r * 0.45, f.glint, { rows: 3, cols: 6, yaw });
    }
  }
  b.bone = f.bones.happy;
  for (const s of [-1, 1]) {
    arc(b, f, s * f.eyeX, f.eyeY + f.eyeH * 0.32, f.eyeW * 1.02, -f.eyeH * 0.62, f.eyeW * 0.26, f.eyeColor);
  }
  for (const [bone, s] of [
    [f.bones.browL, -1],
    [f.bones.browR, 1],
  ] as [number, number][]) {
    b.bone = bone;
    const x = s * f.eyeX;
    b.ellipsoid(x, f.browY, f.surf(x, f.browY) - f.browW * 0.12, f.browW, f.browW * (f.browH ?? 0.3), f.browW * 0.34, f.browColor, {
      rows: 4,
      cols: 8,
      yaw: faceYaw(f, x),
      tiltZ: f.browTilt !== undefined ? s * f.browTilt : -s * 0.14,
    });
  }
  b.bone = f.bones.smile;
  if (f.grin === true) {
    /* Navie's grin: a wide D, flat along the top with the corners turned up, a tongue in the bottom. */
    const w = f.mouthW;
    const hgt = w * 0.95;
    const top = f.mouthY + hgt * 0.45;
    /* A smirk lifts the right side of the whole mouth a little. */
    const lift = (x: number): number => (f.smirk ?? 0) * 0.22 * hgt * (x / w);
    const rim: [number, number][] = [];
    for (let i = 0; i <= 12; i += 1) {
      const a = Math.PI + (i / 12) * Math.PI;
      const x = Math.cos(a) * w;
      rim.push([x, top + Math.sin(a) * hgt + lift(x)]);
    }
    for (let i = 1; i < 6; i += 1) {
      const u = 1 - (i / 6) * 2;
      rim.push([u * w, top + (u * u - 0.35) * hgt * 0.16 + lift(u * w)]);
    }
    rim.push(rim[0]);
    fanOn(b, f.surf, [0, top - hgt * 0.45], rim, f.mouthColor, 0.003);
    if (f.tongue !== null) {
      const ty = top - hgt * 0.72;
      const tongue: [number, number][] = [];
      for (let i = 0; i <= 12; i += 1) {
        const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
        const x = Math.cos(a) * w * 0.52 * (Math.sin(a) < 0 ? 0.9 : 1);
        tongue.push([x, ty + Math.sin(a) * hgt * 0.26 + lift(x)]);
      }
      fanOn(b, f.surf, [0, ty], tongue, f.tongue, 0.0055);
    }
    if (f.teeth !== undefined) {
      for (const s of [-1, 1]) {
        const cx = s * w * 0.26;
        const tw = w * 0.2;
        const th = hgt * 0.3;
        const ty0 = top - hgt * 0.02 + lift(cx);
        const tooth: [number, number][] = [
          [cx + tw, ty0],
          [cx - tw, ty0],
          [cx - tw, ty0 - th * 0.75],
          [cx - tw * 0.6, ty0 - th],
          [cx + tw * 0.6, ty0 - th],
          [cx + tw, ty0 - th * 0.75],
          [cx + tw, ty0],
        ];
        /* Listed anticlockwise (along the top to the left, down, across, back up), as the fan needs. */
        fanOn(b, f.surf, [cx, ty0 - th * 0.5], tooth, f.teeth, 0.0065);
      }
    }
  } else if (f.wMouth === true) {
    /* Two small curves meeting under the nose. */
    for (const s of [-1, 1]) {
      arc(b, f, s * f.mouthW * 0.52, f.mouthY, f.mouthW * 0.55, f.mouthW * 0.42, f.mouthW * 0.2, f.mouthColor);
    }
  } else {
    arc(b, f, 0, f.mouthY, f.mouthW, f.mouthW * 0.5, f.mouthW * 0.27, f.mouthColor);
  }
  b.bone = f.bones.open;
  {
    const w = f.mouthW * 1.05;
    const y = f.mouthY - w * 0.05;
    const cz = f.surf(0, y) - w * 0.22;
    b.ellipsoid(0, y, cz, w, w * 0.72, w * 0.5, f.mouthColor, { rows: 6, cols: 10 });
    if (f.tongue !== null) {
      const ty = y - w * 0.32;
      const front = cz + w * 0.5 * Math.sqrt(1 - (0.32 / 0.72) ** 2);
      b.ellipsoid(0, ty, front - w * 0.2, w * 0.58, w * 0.3, w * 0.34, f.tongue, { rows: 4, cols: 7 });
    }
  }
  if (f.cheekColor !== null) {
    b.bone = f.base;
    for (const s of [-1, 1]) {
      const x = s * f.cheekX;
      b.ellipsoid(x, f.cheekY, f.surf(x, f.cheekY) - f.cheekW * 0.22, f.cheekW, f.cheekW * 0.58, f.cheekW * 0.34, f.cheekColor, { rows: 4, cols: 8, yaw: faceYaw(f, x) });
      if (f.cheekSoft !== undefined) {
        b.ellipsoid(x, f.cheekY, f.surf(x, f.cheekY) - f.cheekW * 0.27, f.cheekW * 1.45, f.cheekW * 0.84, f.cheekW * 0.3, f.cheekSoft, { rows: 4, cols: 9, yaw: faceYaw(f, x) });
      }
    }
  }
  b.bone = keep;
  b.sway = 0;
  return {
    [f.bones.eyes]: [0, f.eyeY, f.pivotZ],
    [f.bones.happy]: [0, f.eyeY, f.pivotZ - 0.04],
    [f.bones.browL]: [-f.eyeX, f.browY, f.pivotZ],
    [f.bones.browR]: [f.eyeX, f.browY, f.pivotZ],
    [f.bones.smile]: [0, f.mouthY, f.pivotZ],
    [f.bones.open]: [0, f.mouthY, f.pivotZ - 0.03],
  };
}

/* ---- People ---- */

/** The head every person shares: big, round and soft. */
const HEAD = { y: 1.17, z: 0.01, rx: 0.36, ry: 0.335, rz: 0.33 };
const headFront = eggFront(HEAD.y, HEAD.z, HEAD.rx, HEAD.ry, HEAD.rz);

type HairStyle = 'short' | 'spiky' | 'bob' | 'bun' | 'ponytail' | 'braid' | 'curly' | 'sidepart' | 'capfringe' | 'pigtails' | 'twintails' | 'none';

interface PersonLook {
  skin: string;
  shirt: string;
  shorts: string;
  boots: string;
  hair: string;
  style?: HairStyle;
  bottoms?: 'shorts' | 'skirt' | 'trousers';
  sleeves?: 'short' | 'long';
  /** Wider than 1 for a rounder body. */
  build?: number;
  glasses?: string;
  mustache?: boolean;
  /** On the head's own bone (`extra2`): a hat, or Awit's twin tails, which swing. */
  hat?: (b: MeshBuilder) => void;
  /** Where that bone pivots (the crown when not set). */
  hatAt?: Vec3;
  /** On the back: a backpack or a kite. */
  extra?: (b: MeshBuilder) => void;
  /** Over the shirt: a vest, a stethoscope, straps. */
  torso?: (b: MeshBuilder) => void;
  holdR?: (b: MeshBuilder) => void;
  holdL?: (b: MeshBuilder) => void;
  habit?: Habit;
  carryTop?: number;
  /** The heroes' extras: bigger hands and feet than 1, socks, shoe soles, a disc on each shoe like a wheel's hub. */
  hands?: number;
  feet?: number;
  socks?: string;
  sole?: string;
  hub?: string;
  /** A band round the hem of a skirt. */
  hem?: string;
  /** A skirt this much fuller than usual, and finely cut. */
  flare?: number;
  /** A frill of little scallops peeking out under the skirt. */
  ruffle?: string;
  /** Puffed sleeves, with a cuff of this colour. */
  puff?: string;
  /** A lighter band across the crown of smooth hair, where it catches the light. */
  shine?: string;
  /** The colour of the pigtails' bobbles. */
  accent?: string;
  /** Changes to the standard face. */
  face?: Partial<Pick<FaceSpec, 'eyeX' | 'eyeY' | 'eyeW' | 'eyeH' | 'eyeColor' | 'iris' | 'irisLight' | 'pupil' | 'lashes' | 'browY' | 'browW' | 'browColor' | 'mouthY' | 'mouthW' | 'mouthColor' | 'grin' | 'cheekX' | 'cheekY' | 'cheekW' | 'cheekColor' | 'cheekSoft'>>;
  /** How finely the big shapes are cut: the heroes are finer than passers-by. */
  detail?: number;
  /** A springy ornament on the head, on its own bone, and where that bone pivots. */
  bob?: (b: MeshBuilder) => void;
  bobAt?: Vec3;
  headScale?: number;
}

const PEOPLE_PARENTS = [-1, 0, 1, 1, 1, 0, 0, 1, 2, 2, 2, 2, 2, 2, 2, 2];

/** A ring of short tubes: glasses, a hat band. */
function ring(b: MeshBuilder, cx: number, cy: number, cz: number, rx: number, ry: number, r: number, color: string, n = 12, flatY = false): void {
  let prev: Vec3 | null = null;
  for (let i = 0; i <= n; i += 1) {
    const a = (i / n) * Math.PI * 2;
    const p: Vec3 = flatY ? [cx + Math.cos(a) * rx, cy, cz + Math.sin(a) * ry] : [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, cz];
    if (prev !== null) {
      b.tube(prev, p, r, r, color, 5, false);
    }
    prev = p;
  }
}

const smooth = (e0: number, e1: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Pushes a quad's two triangles (a, a1, c) and (a1, c1, c), turned to face the way `n` points. */
function facing(b: MeshBuilder, a: number, a1: number, c: number, c1: number, n: Vec3): void {
  const v = b.verts;
  const side = (p: number, q: number, o: number): number => {
    const ux = v[q * STRIDE] - v[p * STRIDE];
    const uy = v[q * STRIDE + 1] - v[p * STRIDE + 1];
    const uz = v[q * STRIDE + 2] - v[p * STRIDE + 2];
    const wx = v[o * STRIDE] - v[p * STRIDE];
    const wy = v[o * STRIDE + 1] - v[p * STRIDE + 1];
    const wz = v[o * STRIDE + 2] - v[p * STRIDE + 2];
    return (uy * wz - uz * wy) * n[0] + (uz * wx - ux * wz) * n[1] + (ux * wy - uy * wx) * n[2];
  };
  /* Both triangles vote, so a quad that pinches to a point (a pole, a closed tip) still turns the right way. */
  const d = side(a, a1, c) + side(a1, c1, c);
  if (d >= 0) {
    b.indices.push(a, a1, c, a1, c1, c);
  } else {
    b.indices.push(a, c, a1, a1, c, c1);
  }
}

/**
 * Smooth hair in one piece: a shell just outside the head, whose lower edge is drawn by `edge`
 * (the height of the hairline all the way round; 0 is the front, plus or minus pi the back). One
 * surface has no seams or lumps, so the hair reads as soft and clean. `shine` paints a lighter band
 * across the crown into the vertex colours.
 */
function hairShell(b: MeshBuilder, c: string, edge: (th: number) => number, shine?: string): void {
  const cy = 1.19;
  const cz = -0.02;
  const rx = 0.4;
  const ry = 0.345;
  const rz = 0.37;
  const cols = 64;
  const upper = 6;
  const lower = 6;
  const capLat = 0.9;
  const base = hex(c);
  const lit = shine === undefined ? base : hex(shine);
  const first = b.vertexCount;
  const normals: Vec3[] = [];
  for (let k = 0; k <= cols; k += 1) {
    /* Columns packed closer at the front, where the fringe's points need them. */
    const u = (k / cols) * 2 - 1;
    const th = Math.PI * (0.6 * u + 0.4 * u * u * u);
    const yEdge = edge(th);
    const latEdge = Math.acos(Math.max(-0.98, Math.min(0.98, (yEdge - cy) / ry)));
    for (let j = 0; j <= upper + lower; j += 1) {
      const lat = j <= upper ? (capLat * j) / upper : capLat + ((latEdge - capLat) * (j - upper)) / lower;
      const sl = Math.sin(lat);
      const x = rx * sl * Math.sin(th);
      const y = cy + ry * Math.cos(lat);
      const z = cz + rz * sl * Math.cos(th);
      let nx = (x / (rx * rx));
      let ny = ((y - cy) / (ry * ry));
      let nz = ((z - cz) / (rz * rz));
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l;
      ny /= l;
      nz /= l;
      /* The shine: a soft band two rows wide, round the crown. */
      const band = j === 3 || j === 4 ? 0.55 : 0;
      const col: Vec3 = [base[0] + (lit[0] - base[0]) * band, base[1] + (lit[1] - base[1]) * band, base[2] + (lit[2] - base[2]) * band];
      b.rawVertex(x, y, z, nx, ny, nz, col);
      normals.push([nx, ny, nz]);
    }
  }
  const rows = upper + lower;
  for (let k = 0; k < cols; k += 1) {
    for (let j = 0; j < rows; j += 1) {
      const a = first + k * (rows + 1) + j;
      const a1 = a + rows + 1;
      facing(b, a, a1, a + 1, a1 + 1, normals[a1 + 1 - first]);
    }
  }
}

/** A smooth tapering lock swept along a curve (a pigtail): rings round a cubic Bezier, radius r(t), a round closed tip. */
function sweep(b: MeshBuilder, p: [Vec3, Vec3, Vec3, Vec3], radius: (t: number) => number, color: string, rings = 12, sides = 12): void {
  const c = hex(color);
  const at = (t: number): Vec3 => {
    const u = 1 - t;
    const k0 = u * u * u;
    const k1 = 3 * u * u * t;
    const k2 = 3 * u * t * t;
    const k3 = t * t * t;
    return [0, 1, 2].map((i) => p[0][i] * k0 + p[1][i] * k1 + p[2][i] * k2 + p[3][i] * k3) as Vec3;
  };
  const pts: Vec3[] = [];
  for (let i = 0; i <= rings; i += 1) {
    pts.push(at(i / rings));
  }
  const tan = pts.map((_, i) => {
    const q = pts[Math.min(rings, i + 1)];
    const o = pts[Math.max(0, i - 1)];
    const d: Vec3 = [q[0] - o[0], q[1] - o[1], q[2] - o[2]];
    const l = Math.hypot(d[0], d[1], d[2]) || 1;
    return [d[0] / l, d[1] / l, d[2] / l] as Vec3;
  });
  /* A frame carried along the curve without twisting. */
  const t0 = tan[0];
  const ref: Vec3 = Math.abs(t0[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  let n: Vec3 = [t0[1] * ref[2] - t0[2] * ref[1], t0[2] * ref[0] - t0[0] * ref[2], t0[0] * ref[1] - t0[1] * ref[0]];
  const ring: Vec3[][] = [];
  for (let i = 0; i <= rings; i += 1) {
    const t = tan[i];
    const dot = n[0] * t[0] + n[1] * t[1] + n[2] * t[2];
    n = [n[0] - t[0] * dot, n[1] - t[1] * dot, n[2] - t[2] * dot];
    const nl = Math.hypot(n[0], n[1], n[2]) || 1;
    n = [n[0] / nl, n[1] / nl, n[2] / nl];
    const bn: Vec3 = [t[1] * n[2] - t[2] * n[1], t[2] * n[0] - t[0] * n[2], t[0] * n[1] - t[1] * n[0]];
    const r = radius(i / rings);
    const row: Vec3[] = [];
    for (let k = 0; k <= sides; k += 1) {
      const a = (k / sides) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      row.push([pts[i][0] + (n[0] * ca + bn[0] * sa) * r, pts[i][1] + (n[1] * ca + bn[1] * sa) * r, pts[i][2] + (n[2] * ca + bn[2] * sa) * r]);
    }
    ring.push(row);
  }
  const first = b.vertexCount;
  const normals: Vec3[] = [];
  for (let i = 0; i <= rings; i += 1) {
    for (let k = 0; k <= sides; k += 1) {
      const q = ring[i][k];
      const du = ring[i][(k + 1) % sides];
      const dd = ring[i][(k + sides - 1) % sides];
      const fw = ring[Math.min(rings, i + 1)][k];
      const bw = ring[Math.max(0, i - 1)][k];
      const u: Vec3 = [du[0] - dd[0], du[1] - dd[1], du[2] - dd[2]];
      const v: Vec3 = [fw[0] - bw[0], fw[1] - bw[1], fw[2] - bw[2]];
      let nn: Vec3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const out: Vec3 = [q[0] - pts[i][0], q[1] - pts[i][1], q[2] - pts[i][2]];
      let l = Math.hypot(nn[0], nn[1], nn[2]);
      if (l < 1e-9 || Math.hypot(out[0], out[1], out[2]) < 1e-6) {
        /* The closed tip, or the start: the normal runs along the curve. */
        nn = i === 0 ? [-tan[0][0], -tan[0][1], -tan[0][2]] : tan[i];
        l = 1;
      } else if (nn[0] * out[0] + nn[1] * out[1] + nn[2] * out[2] < 0) {
        nn = [-nn[0], -nn[1], -nn[2]];
      }
      const fn: Vec3 = [nn[0] / l, nn[1] / l, nn[2] / l];
      b.rawVertex(q[0], q[1], q[2], fn[0], fn[1], fn[2], c);
      normals.push(fn);
    }
  }
  for (let i = 0; i < rings; i += 1) {
    for (let k = 0; k < sides; k += 1) {
      const a = first + i * (sides + 1) + k;
      const a1 = a + 1;
      const c0 = a + sides + 1;
      const n0 = normals[a - first];
      const ok = Math.hypot(n0[0], n0[1], n0[2]) > 0 ? n0 : normals[c0 - first];
      facing(b, a, a1, c0, c0 + 1, ok);
    }
  }
}

/**
 * A surface of revolution round the upright axis: a ring of radius r and a colour at each height y (top first),
 * squeezed front to back by `depth`. Two rings at the same height in two colours make a crisp painted band.
 */
function lathe(b: MeshBuilder, prof: [number, number, string][], sides: number, depth = 1): void {
  const pos: Vec3[][] = prof.map(([y, r]) => Array.from({ length: sides + 1 }, (_, k) => {
    const a = (k / sides) * Math.PI * 2;
    return [Math.sin(a) * r, y, Math.cos(a) * r * depth] as Vec3;
  }));
  const first = b.vertexCount;
  const normals: Vec3[] = [];
  const n = prof.length;
  for (let i = 0; i < n; i += 1) {
    for (let k = 0; k <= sides; k += 1) {
      const q = pos[i][k];
      const du = pos[i][(k + 1) % sides];
      const dd = pos[i][(k + sides - 1) % sides];
      const fw = pos[Math.min(n - 1, i + 1)][k];
      const bw = pos[Math.max(0, i - 1)][k];
      const u: Vec3 = [du[0] - dd[0], du[1] - dd[1], du[2] - dd[2]];
      const v: Vec3 = [fw[0] - bw[0], fw[1] - bw[1], fw[2] - bw[2]];
      let nn: Vec3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      if (nn[0] * q[0] + nn[2] * q[2] < 0) {
        nn = [-nn[0], -nn[1], -nn[2]];
      }
      const l = Math.hypot(nn[0], nn[1], nn[2]) || 1;
      const fn: Vec3 = [nn[0] / l, nn[1] / l, nn[2] / l];
      b.rawVertex(q[0], q[1], q[2], fn[0], fn[1], fn[2], hex(prof[i][2]));
      normals.push(fn);
    }
  }
  for (let i = 0; i < n - 1; i += 1) {
    for (let k = 0; k < sides; k += 1) {
      const a = first + i * (sides + 1) + k;
      facing(b, a, a + 1, a + sides + 1, a + sides + 2, normals[a - first]);
    }
  }
}

/** A ribbon bow: two loops either side of a knot along the level direction (dx, dz), and two short tails. */
function bow(b: MeshBuilder, x: number, y: number, z: number, dx: number, dz: number, size: number, color: string): void {
  const yaw = Math.atan2(-dz, dx);
  for (const s of [-1, 1]) {
    b.ellipsoid(x + s * dx * size * 0.92, y + size * 0.14, z + s * dz * size * 0.92, size, size * 0.64, size * 0.34, color, { rows: 5, cols: size < 0.05 ? 8 : 10, tiltZ: s * 0.34, yaw });
    b.ellipsoid(x + s * dx * size * 0.42, y - size * 0.8, z + s * dz * size * 0.42, size * 0.3, size * 0.72, size * 0.16, color, { rows: 4, cols: 6, tiltZ: s * 0.38, yaw });
  }
  b.ball(x, y, z, size * 0.4, mixHex(color, '#000000', 0.08), 4, 8);
}

function hairDo(b: MeshBuilder, style: HairStyle, c: string, accent = '#ffc32d'): void {
  if (style === 'none' || style === 'twintails') {
    /* Twin tails are a smooth shell of their own (hairShell), with the tails on their own bone. */
    return;
  }
  /* A soft cap over the top and the back of the head. */
  b.ellipsoid(0, 1.215, -0.035, 0.378, 0.318, 0.345, c, { rows: 10, cols: 16 });
  const lock = (x: number, y: number, w: number, h: number, tilt = 0): void => {
    b.ellipsoid(x, y, headFront(x, y) - 0.035, w, h, 0.075, c, { rows: 6, cols: 9, yaw: Math.asin(Math.max(-0.9, Math.min(0.9, x / HEAD.rx))) * 0.9, tiltX: -0.3, tiltZ: tilt });
  };
  switch (style) {
    case 'short':
      lock(-0.17, 1.37, 0.12, 0.065, 0.25);
      lock(-0.03, 1.39, 0.13, 0.07, 0.1);
      lock(0.12, 1.385, 0.13, 0.068, -0.15);
      lock(0.24, 1.33, 0.09, 0.07, -0.5);
      break;
    case 'spiky':
      for (let i = 0; i < 6; i += 1) {
        const a = -1 + i * 0.4;
        b.at(Math.sin(a) * 0.2, 1.42 + Math.cos(a) * 0.06, -0.05, 0, 1, () => {
          b.cone(0, 0, 0, 0.1, 0.17, c, 7);
        });
      }
      lock(-0.12, 1.38, 0.14, 0.07, 0.2);
      lock(0.1, 1.385, 0.15, 0.07, -0.2);
      break;
    case 'curly':
      for (let i = 0; i < 9; i += 1) {
        const a = (i / 9) * Math.PI * 2;
        b.ball(Math.cos(a) * 0.27, 1.4 + Math.sin(a * 2) * 0.03, Math.sin(a) * 0.24 - 0.04, 0.11, c, 6, 8);
      }
      b.ball(0, 1.5, -0.04, 0.16, c, 7, 10);
      lock(-0.1, 1.38, 0.12, 0.07);
      lock(0.12, 1.38, 0.12, 0.07);
      break;
    case 'sidepart':
      lock(-0.2, 1.36, 0.1, 0.06, 0.3);
      b.ellipsoid(0.07, 1.385, headFront(0.07, 1.385) - 0.03, 0.24, 0.085, 0.08, c, { rows: 6, cols: 10, tiltZ: 0.28, tiltX: -0.3 });
      break;
    case 'bob':
      lock(-0.16, 1.36, 0.13, 0.07, 0.15);
      lock(0, 1.375, 0.14, 0.075);
      lock(0.16, 1.36, 0.13, 0.07, -0.15);
      for (const s of [-1, 1]) {
        b.ellipsoid(s * 0.29, 1.1, -0.06, 0.12, 0.22, 0.26, c, { rows: 8, cols: 10, tiltZ: s * 0.12 });
      }
      b.ellipsoid(0, 1.1, -0.18, 0.3, 0.22, 0.2, c, { rows: 8, cols: 12 });
      break;
    case 'bun':
      lock(-0.15, 1.36, 0.14, 0.07, 0.2);
      lock(0.14, 1.36, 0.14, 0.07, -0.2);
      b.ball(0, 1.47, -0.2, 0.13, c, 8, 12);
      break;
    case 'ponytail':
      lock(-0.15, 1.365, 0.14, 0.07, 0.2);
      lock(0.13, 1.37, 0.14, 0.07, -0.2);
      b.ball(0, 1.3, -0.33, 0.06, '#f2c760', 5, 8);
      b.ellipsoid(0, 1.13, -0.42, 0.085, 0.2, 0.085, c, { rows: 8, cols: 10, tiltX: 0.35 });
      break;
    case 'braid':
      lock(-0.15, 1.365, 0.14, 0.07, 0.2);
      lock(0.13, 1.37, 0.14, 0.07, -0.2);
      for (let i = 0; i < 6; i += 1) {
        b.ball(0, 1.12 - i * 0.1, -0.34 - i * 0.012, 0.075 - i * 0.006, i === 5 ? '#ffc32d' : c, 6, 9);
      }
      break;
    case 'capfringe':
      /* Soft bangs peeking out under a cap's brim, and tufts over the ears. */
      lock(-0.16, 1.31, 0.1, 0.06, 0.38);
      lock(-0.035, 1.318, 0.105, 0.064, 0.12);
      lock(0.1, 1.316, 0.1, 0.062, -0.18);
      lock(0.22, 1.29, 0.075, 0.055, -0.55);
      for (const s of [-1, 1]) {
        b.ellipsoid(s * 0.335, 1.235, -0.02, 0.075, 0.1, 0.12, c, { rows: 6, cols: 8, tiltZ: s * 0.25 });
      }
      break;
    case 'pigtails':
      /* Rounded bangs, a soft fall at the back, and two puffy pigtails tied with round bobbles. */
      lock(-0.19, 1.345, 0.11, 0.075, 0.42);
      lock(-0.065, 1.372, 0.12, 0.078, 0.16);
      lock(0.07, 1.372, 0.12, 0.078, -0.16);
      lock(0.195, 1.345, 0.11, 0.075, -0.42);
      b.ellipsoid(0, 1.1, -0.17, 0.31, 0.21, 0.2, c, { rows: 8, cols: 12 });
      for (const s of [-1, 1]) {
        b.ellipsoid(s * 0.3, 1.13, -0.04, 0.1, 0.18, 0.2, c, { rows: 7, cols: 9, tiltZ: s * 0.1 });
        b.ellipsoid(s * 0.47, 1.12, -0.07, 0.11, 0.13, 0.11, c, { rows: 8, cols: 10, tiltZ: -s * 0.5 });
        b.ellipsoid(s * 0.545, 1.04, -0.08, 0.075, 0.09, 0.08, c, { rows: 5, cols: 7, tiltZ: -s * 0.8 });
        b.ball(s * 0.385, 1.16, -0.02, 0.068, accent, 5, 8);
      }
      break;
    default:
      break;
  }
}

function person(r: Renderer, L: PersonLook): Character {
  const b = new MeshBuilder();
  b.detail = L.detail ?? 1.15;
  const w = L.build ?? 1;
  const bottoms = L.bottoms ?? 'shorts';
  const legColor = bottoms === 'trousers' ? L.shorts : L.skin;
  const ft = L.feet ?? 1;
  /* Legs: short and stubby, with big round shoes. */
  for (const [bone, s] of [
    [B.legL, -1],
    [B.legR, 1],
  ] as [number, number][]) {
    b.bone = bone;
    b.tube([s * 0.1, 0.44, 0], [s * 0.105, 0.12, 0.01], 0.074, 0.07, legColor, 9, true);
    if (L.socks !== undefined) {
      b.tube([s * 0.104, 0.25, 0.006], [s * 0.106, 0.11, 0.012], 0.078, 0.077, L.socks, 9, false);
    }
    b.ellipsoid(s * 0.107, 0.075 * ft, 0.045 + (ft - 1) * 0.06, 0.1 * ft, 0.078 * ft, 0.15 * ft, L.boots, { rows: 7, cols: 11 });
    if (L.sole !== undefined) {
      b.ellipsoid(s * 0.107, 0.03, 0.045 + (ft - 1) * 0.06, 0.104 * ft, 0.032, 0.155 * ft, L.sole, { rows: 4, cols: 11 });
    }
    if (L.hub !== undefined) {
      b.sway = NO_LINE;
      b.ellipsoid(s * (0.107 + 0.097 * ft), 0.08 * ft, 0.04, 0.012, 0.036 * ft, 0.036 * ft, L.hub, { rows: 4, cols: 8 });
      b.sway = 0;
    }
    if (bottoms === 'shorts') {
      b.tube([s * 0.1, 0.46, 0], [s * 0.104, 0.35, 0.005], 0.088, 0.086, L.shorts, 9, false);
    }
  }
  b.bone = B.root;
  if (bottoms === 'skirt' && L.flare !== undefined) {
    /* A fuller bell of a skirt, finely cut, that flares softly at the hem (and covers the tops of the legs),
       with a band at the hem and a frill of scallops peeking out under it. */
    const fr = 0.27 * w * L.flare;
    const dp = 0.94;
    const band = L.hem ?? L.shorts;
    lathe(
      b,
      (
        [
          [0.62, 0.5, L.shorts],
          [0.56, 0.54, L.shorts],
          [0.5, 0.605, L.shorts],
          [0.44, 0.7, L.shorts],
          [0.38, 0.81, L.shorts],
          [0.32, 0.92, L.shorts],
          [0.296, 0.955, L.shorts],
          [0.296, 0.955, band],
          [0.272, 0.995, band],
          [0.25, 1, band],
        ] as [number, number, string][]
      ).map(([y, k, c]) => [y, k * fr, c] as [number, number, string]),
      32,
      dp,
    );
    if (L.ruffle !== undefined) {
      for (let i = 0; i < 14; i += 1) {
        const a = (i / 14) * Math.PI * 2;
        b.ellipsoid(Math.sin(a) * fr, 0.236, Math.cos(a) * fr * dp, 0.066, 0.034, 0.024, L.ruffle, { rows: 4, cols: 6, yaw: a });
      }
    }
  } else if (bottoms === 'skirt') {
    b.cone(0, 0.27, 0, 0.27 * w, 0.4, L.shorts, 16, mixHex(L.shorts, '#000000', 0.15));
    if (L.hem !== undefined) {
      ring(b, 0, 0.29, 0, 0.262 * w, 0.262 * w, 0.024, L.hem, 18, true);
    }
  } else {
    b.ellipsoid(0, 0.46, 0, 0.2 * w, 0.12, 0.16 * w, L.shorts, { rows: 7, cols: 12 });
  }
  b.bone = B.torso;
  b.ellipsoid(0, 0.66, 0, 0.215 * w, 0.235, 0.178 * w, L.shirt, { rows: 10, cols: 14 });
  L.torso?.(b);
  const longSleeves = L.sleeves === 'long';
  for (const [bone, s] of [
    [B.armL, -1],
    [B.armR, 1],
  ] as [number, number][]) {
    b.bone = bone;
    b.tube([s * 0.2, 0.8, 0], [s * 0.255, 0.65, 0.01], 0.068, 0.062, L.shirt, 9, true);
    b.tube([s * 0.255, 0.65, 0.01], [s * 0.285, 0.54, 0.02], 0.054, 0.05, longSleeves ? L.shirt : L.skin, 8, false);
    if (L.puff !== undefined) {
      /* A puffed sleeve over the top of the arm, with a soft cuff. */
      b.ellipsoid(s * 0.222, 0.752, 0.004, 0.094, 0.09, 0.092, L.shirt, { rows: 7, cols: 10, tiltZ: s * 0.35 });
      b.ellipsoid(s * 0.243, 0.688, 0.008, 0.071, 0.022, 0.071, L.puff, { rows: 4, cols: 11, tiltZ: s * 0.35 });
    }
    const hand = L.hands ?? 1;
    b.ball(s * 0.29, 0.5, 0.025, 0.074 * hand, L.skin, 7, 10);
    /* A little thumb, so the mitten reads as a hand. */
    b.ball(s * (0.29 - 0.05 * hand), 0.525, 0.065, 0.03 * hand, L.skin, 4, 7);
  }
  b.bone = B.armR;
  L.holdR?.(b);
  b.bone = B.armL;
  L.holdL?.(b);
  b.bone = B.head;
  b.ellipsoid(0, HEAD.y, HEAD.z, HEAD.rx, HEAD.ry, HEAD.rz, L.skin, { rows: 14, cols: 18 });
  if (L.style !== 'twintails') {
    for (const s of [-1, 1]) {
      b.ellipsoid(s * 0.345, 1.13, 0.0, 0.05, 0.07, 0.045, L.skin, { rows: 6, cols: 8 });
    }
  }
  /* A tiny button nose. */
  b.ball(0, 1.085, headFront(0, 1.085) - 0.014, 0.03, mixHex(L.skin, '#000000', 0.06), 6, 8);
  hairDo(b, L.style ?? 'short', L.hair, L.accent);
  if (L.style === 'twintails') {
    hairShell(b, L.hair, twinEdge, L.shine);
  }
  b.sway = NO_LINE;
  if (L.mustache === true) {
    for (const s of [-1, 1]) {
      b.ellipsoid(s * 0.038, 1.062, headFront(s * 0.038, 1.062) - 0.004, 0.046, 0.019, 0.022, L.hair, { rows: 5, cols: 8, tiltZ: s * 0.25 });
    }
  }
  if (L.glasses !== undefined) {
    for (const s of [-1, 1]) {
      ring(b, s * 0.13, 1.135, headFront(s * 0.13, 1.135) + 0.024, 0.084, 0.082, 0.012, L.glasses, 16);
    }
    b.tube([-0.046, 1.15, headFront(0.05, 1.15) + 0.024], [0.046, 1.15, headFront(0.05, 1.15) + 0.024], 0.011, 0.011, L.glasses, 5, false);
  }
  b.sway = 0;
  const brows = mixHex(L.hair, '#000000', 0.25);
  const faceP = buildFace(b, {
    surf: headFront,
    curve: HEAD.rx,
    eyeX: 0.13,
    eyeY: 1.135,
    eyeW: 0.05,
    eyeH: 0.066,
    eyeColor: '#1c2035',
    glint: '#ffffff',
    browY: 1.235,
    browW: 0.043,
    browColor: brows,
    mouthY: 1.026,
    mouthW: 0.036,
    mouthColor: '#6b2a35',
    tongue: '#f27d8c',
    cheekX: 0.215,
    cheekY: 1.05,
    cheekW: 0.058,
    cheekColor: mixHex(L.skin, '#ff7b8a', 0.5),
    cheekSoft: mixHex(L.skin, '#ff7b8a', 0.22),
    pivotZ: 0.2,
    bones: PEOPLE_FACE,
    base: B.head,
    ...L.face,
  });
  b.bone = B.extra2;
  L.hat?.(b);
  b.bone = B.extra;
  L.extra?.(b);
  b.bone = B.bob;
  L.bob?.(b);
  const pivots: Vec3[] = [
    [0, 0.46, 0],
    [0, 0.5, 0],
    [0, 0.86, 0],
    [-0.2, 0.8, 0],
    [0.2, 0.8, 0],
    [-0.1, 0.44, 0],
    [0.1, 0.44, 0],
    [0, 0.75, -0.2],
    L.hatAt ?? [0, 1.42, 0],
  ];
  for (let i = B.eyes; i <= B.open; i += 1) {
    pivots.push(faceP[i]);
  }
  pivots.push(L.bobAt ?? [0, 1.5, 0]);
  return {
    mesh: r.mesh(b),
    rig: new Rig(pivots, PEOPLE_PARENTS),
    face: PEOPLE_FACE,
    carryTop: L.carryTop ?? (L.hat !== undefined ? 1.6 : 1.54),
    habit: L.habit ?? 'none',
    grin: L.face?.grin === true,
    headScale: L.headScale,
  };
}

/* ---- Hats and things to hold ---- */

const hardHat =
  (color: string) =>
  (b: MeshBuilder): void => {
    b.ellipsoid(0, 1.4, -0.02, 0.39, 0.22, 0.37, color, { rows: 10, cols: 16 });
    b.ellipsoid(0, 1.35, 0.03, 0.44, 0.04, 0.44, color, { rows: 4, cols: 16 });
    b.ellipsoid(0, 1.6, -0.02, 0.06, 0.04, 0.3, mixHex(color, '#000000', 0.12), { rows: 4, cols: 8 });
  };
const cap =
  (color: string) =>
  (b: MeshBuilder): void => {
    b.ellipsoid(0, 1.38, -0.03, 0.375, 0.2, 0.36, color, { rows: 10, cols: 16 });
    b.ellipsoid(0, 1.33, 0.28, 0.24, 0.03, 0.17, color, { rows: 4, cols: 10 });
    b.ball(0, 1.58, -0.03, 0.035, mixHex(color, '#ffffff', 0.3), 4, 6);
  };
const bushHat =
  (color: string) =>
  (b: MeshBuilder): void => {
    b.ellipsoid(0, 1.42, -0.02, 0.35, 0.17, 0.34, color, { rows: 9, cols: 14 });
    b.ellipsoid(0, 1.36, 0, 0.5, 0.032, 0.49, mixHex(color, '#000000', 0.12), { rows: 4, cols: 16 });
    ring(b, 0, 1.38, -0.02, 0.352, 0.342, 0.016, '#5e4a2c', 16, true);
  };
const bucketHat =
  (color: string) =>
  (b: MeshBuilder): void => {
    b.ellipsoid(0, 1.42, -0.02, 0.36, 0.16, 0.35, color, { rows: 9, cols: 14 });
    b.cone(0, 1.31, -0.01, 0.46, 0.09, mixHex(color, '#000000', 0.08), 16);
  };
const binoculars = (b: MeshBuilder): void => {
  for (const s of [-1, 1]) {
    b.tube([0.29 + s * 0.04, 0.5, 0.08], [0.29 + s * 0.04, 0.5, 0.2], 0.032, 0.036, '#2a2f3a', 8, true);
    b.ball(0.29 + s * 0.04, 0.5, 0.215, 0.026, '#7fb6ff', 4, 6);
  }
};
const clipboard = (b: MeshBuilder): void => {
  b.rbox(-0.31, 0.52, 0.11, 0.05, 0.24, 0.18, '#a8743f', 0.2);
  b.rbox(-0.285, 0.51, 0.11, 0.02, 0.2, 0.15, '#f6f4ee', 0.2);
  b.rbox(-0.29, 0.635, 0.11, 0.04, 0.03, 0.07, '#9aa6b8', 0.3);
};
const wrench = (b: MeshBuilder): void => {
  b.tube([0.29, 0.5, 0.03], [0.3, 0.5, 0.3], 0.022, 0.02, '#9aa6b8', 6, true);
  b.ellipsoid(0.3, 0.5, 0.34, 0.06, 0.03, 0.05, '#9aa6b8', { rows: 4, cols: 8 });
};
const radio = (b: MeshBuilder): void => {
  b.rbox(0.31, 0.53, 0.06, 0.08, 0.15, 0.06, '#2a2f3a', 0.4);
  b.tube([0.29, 0.6, 0.05], [0.29, 0.72, 0.05], 0.009, 0.009, '#2a2f3a', 4, true);
  b.ball(0.31, 0.56, 0.095, 0.014, '#7df0b0', 3, 5);
};

/* ---- The heroes ---- */

/* The heroes are human counterparts of two Tollbound Heroes: Dayo of Navie, Awit of Amihan. */
const NAVIE_BLUE = '#3a82ee';
const NAVIE_DEEP = '#2a62c4';
const NAVIE_WHITE = '#fbfcff';
const HEADLIGHT = '#fff3cf';
/* Amihan, the kite coupe: pale sky-blue paint, a cream bubble, a mint bumper, coral sails and a kite in four panes. */
const AMIHAN_SKY = '#a6d6ea';
const AMIHAN_CREAM = '#fff7e9';
const AMIHAN_MINT = '#7fc8b9';
const AMIHAN_CORAL = '#ef917d';
const AMIHAN_JADE = '#6fbcae';
const AMIHAN_WOOD = '#8c6e46';
const AMIHAN_NAVY = '#36405e';
const WHEEL_NAVY = '#2c2c3e';

/** The front of a person's shirt, for things laid on it. */
const chestFront = eggFront(0.66, 0, 0.215, 0.235, 0.178);

/** Navie's cap: a blue crown, a white front with the circled blue N, a wide blue brim and a white button. */
const navieCap = (b: MeshBuilder): void => {
  /* Snug blue crown; the white front panel pokes out ahead of it and over the top, so the sides and back stay blue. */
  b.ellipsoid(0, 1.36, -0.035, 0.376, 0.215, 0.364, NAVIE_BLUE, { rows: 10, cols: 16 });
  b.ellipsoid(0, 1.37, 0.045, 0.346, 0.195, 0.318, NAVIE_WHITE, { rows: 10, cols: 16 });
  b.ellipsoid(0, 1.318, 0.33, 0.285, 0.028, 0.225, NAVIE_BLUE, { rows: 4, cols: 12, tiltX: 0.12 });
  b.ball(0, 1.588, -0.01, 0.04, NAVIE_WHITE, 4, 8);
  const front = eggFront(1.37, 0.045, 0.346, 0.195, 0.318);
  b.sway = NO_LINE;
  ringOn(b, front, 0, 1.452, 0.07, 0.011, NAVIE_BLUE);
  letterN(b, front, 0, 1.452, 0.068, 0.011, NAVIE_BLUE);
  b.sway = 0;
};

/** Dayo, Field Guardian: Navie as a boy. Navie's cap and blue, big blue eyes, the open grin, a white N. */
export function makeDayo(r: Renderer): Character {
  const skin = '#c98a5c';
  return person(r, {
    skin,
    shirt: NAVIE_BLUE,
    shorts: '#26386e',
    boots: WHEEL_NAVY,
    sole: '#eef2fa',
    hub: '#c3cede',
    socks: NAVIE_WHITE,
    hair: '#3b2417',
    style: 'capfringe',
    hands: 1.16,
    feet: 1.12,
    headScale: 1.06,
    detail: 1.3,
    carryTop: 1.7,
    face: {
      eyeX: 0.138,
      eyeY: 1.128,
      eyeW: 0.062,
      eyeH: 0.08,
      eyeColor: '#1b2c5c',
      iris: '#3b7fe0',
      irisLight: '#92c8ff',
      pupil: '#13204a',
      browY: 1.248,
      browW: 0.046,
      browColor: '#6a4026',
      mouthY: 1.0,
      mouthW: 0.062,
      mouthColor: '#5a1a2a',
      grin: true,
      cheekX: 0.226,
      cheekY: 1.04,
      cheekW: 0.07,
      cheekColor: mixHex(skin, '#ff6f88', 0.6),
      cheekSoft: mixHex(skin, '#ff6f88', 0.26),
    },
    hat: navieCap,
    torso: (b) => {
      /* A white collar, Navie's white N on the chest, and two round buttons like headlights. */
      ring(b, 0, 0.872, 0, 0.125, 0.105, 0.022, NAVIE_WHITE, 14, true);
      b.sway = NO_LINE;
      letterN(b, chestFront, 0, 0.705, 0.088, 0.013, NAVIE_WHITE);
      b.sway = 0;
      for (const s of [-1, 1]) {
        b.ball(s * 0.105, 0.52, chestFront(s * 0.105, 0.52) - 0.012, 0.032, HEADLIGHT, 5, 8);
        b.tube([s * 0.12, 0.84, -0.1], [s * 0.12, 0.868, 0.06], 0.018, 0.018, NAVIE_WHITE, 5, true);
        b.tube([s * 0.12, 0.868, 0.06], [s * 0.125, 0.62, 0.15], 0.018, 0.018, NAVIE_WHITE, 5, true);
      }
    },
    extra: (b) => {
      /* The field pack in Navie's colours, with round reflectors like headlights. */
      b.rbox(0, 0.68, -0.26, 0.34, 0.37, 0.2, NAVIE_BLUE, 0.62);
      b.rbox(0, 0.59, -0.365, 0.21, 0.13, 0.07, NAVIE_WHITE, 0.6);
      b.rbox(0, 0.86, -0.25, 0.3, 0.06, 0.16, NAVIE_DEEP, 0.6);
      for (const s of [-1, 1]) {
        b.ball(s * 0.128, 0.73, -0.362, 0.032, HEADLIGHT, 4, 8);
      }
    },
  });
}

/**
 * Amihan's kite in four panes: cream at the top and the bottom, coral on the left and jade on the right
 * (as seen from the front), split where the lines between the edges' midpoints cross. `at` maps the
 * kite's flat (u, v) onto the model; both faces are drawn.
 */
function amihanKite(b: MeshBuilder, at: (u: number, v: number) => Vec3, w: number, up: number, down: number, spar: number): void {
  const T = at(0, up);
  const L = at(-w, 0);
  const R = at(w, 0);
  const D = at(0, -down);
  const tl = at(-w / 2, up / 2);
  const tr = at(w / 2, up / 2);
  const bl = at(-w / 2, -down / 2);
  const br = at(w / 2, -down / 2);
  const x = at(0, (up - down) / 4);
  const panes: [Vec3, Vec3, Vec3, Vec3, string][] = [
    [T, tl, x, tr, AMIHAN_CREAM],
    [tl, L, bl, x, AMIHAN_CORAL],
    [tr, x, br, R, AMIHAN_JADE],
    [x, bl, D, br, AMIHAN_CREAM],
  ];
  for (const [a, p, c, d, col] of panes) {
    b.quad(a, p, c, d, col);
    b.quad(d, c, p, a, col);
  }
  b.tube(T, D, spar, spar, AMIHAN_WOOD, 4, false);
  b.tube(L, R, spar, spar, AMIHAN_WOOD, 4, false);
}

/** Awit's hairline: a rounded fringe of three soft points swept a little to one side, side hair down to the jaw with tips that curl in, a low nape. */
const twinEdge = (th: number): number => {
  const a = Math.abs(th);
  const top = 1.306 - 0.012 * th;
  let fringe = top;
  for (const [p, wd, d] of [
    [-0.58, 0.3, 0.055],
    [-0.03, 0.32, 0.066],
    [0.52, 0.3, 0.058],
  ] as [number, number, number][]) {
    const q = (th - p) / wd;
    if (Math.abs(q) < 1) {
      fringe = Math.min(fringe, top - d * Math.sqrt(1 - q * q));
    }
  }
  const q = (a - 1.06) / 0.2;
  const side = 0.965 - (Math.abs(q) < 1 ? 0.035 * (1 - q * q) : 0);
  const nape = 0.935;
  let y = fringe + (side - fringe) * smooth(0.92, 1.2, a);
  y += (nape - side) * smooth(1.6, 2.5, a);
  return y;
};

/** Where Awit's twin tails swing from: between the two ties. */
const TAILS_AT: Vec3 = [0, 1.37, -0.2];

/** Twin tails tied with coral bows: each sweeps out and down to a soft tip that curls in. */
const twinTails =
  (hair: string) =>
  (b: MeshBuilder): void => {
    for (const s of [-1, 1]) {
      sweep(
        b,
        [
          [s * 0.3, 1.37, -0.2],
          [s * 0.5, 1.44, -0.25],
          [s * 0.63, 1.2, -0.25],
          [s * 0.56, 1.0, -0.17],
        ],
        (t) => (t < 0.4 ? 0.055 + 0.06 * Math.sin((t / 0.4) * Math.PI * 0.5) : 0.115 * Math.sqrt(Math.max(0, 1 - ((t - 0.4) / 0.6) ** 2))),
        hair,
        12,
        12,
      );
      bow(b, s * 0.315, 1.39, -0.2, s * 0.6, 0.8, 0.062, AMIHAN_CORAL);
    }
  };

/** Awit, Aerial Scout: Amihan as a girl. A sky-blue dress with a cream collar, mint trim and coral bows; twin tails; kite and flute. */
export function makeAwit(r: Renderer): Character {
  const skin = '#b8794e';
  const hair = '#4a2c25';
  return person(r, {
    skin,
    shirt: AMIHAN_SKY,
    shorts: AMIHAN_SKY,
    hem: AMIHAN_MINT,
    flare: 1.12,
    ruffle: AMIHAN_CREAM,
    puff: AMIHAN_CREAM,
    socks: AMIHAN_CREAM,
    boots: AMIHAN_NAVY,
    sole: AMIHAN_CREAM,
    hub: AMIHAN_CREAM,
    hair,
    shine: '#7d5444',
    style: 'twintails',
    bottoms: 'skirt',
    hands: 1.1,
    feet: 1.06,
    headScale: 1.1,
    detail: 1.3,
    carryTop: 1.64,
    face: {
      eyeX: 0.14,
      eyeY: 1.118,
      eyeW: 0.06,
      eyeH: 0.082,
      eyeColor: '#223a4c',
      iris: '#3b6d8f',
      irisLight: '#9ad3e8',
      pupil: '#16263a',
      lashes: true,
      browY: 1.246,
      browW: 0.038,
      browColor: '#4a2c25',
      mouthY: 1.02,
      mouthW: 0.03,
      mouthColor: '#8e3c4c',
      cheekX: 0.196,
      cheekY: 1.038,
      cheekW: 0.054,
      cheekColor: mixHex(skin, '#ff8fa3', 0.6),
      cheekSoft: mixHex(skin, '#ff8fa3', 0.26),
    },
    hat: twinTails(hair),
    hatAt: TAILS_AT,
    torso: (b) => {
      /* Amihan's cream bubble becomes a round collar with a coral bow, her headlights two cream buttons,
         her mint bumper a sash, and her coral sails a big bow at the back. */
      for (const s of [-1, 1]) {
        b.ellipsoid(s * 0.074, 0.846, 0.094, 0.104, 0.04, 0.078, AMIHAN_CREAM, { rows: 5, cols: 12, tiltZ: s * 0.3, yaw: s * 0.35 });
        b.ball(s * 0.068, 0.655, chestFront(s * 0.068, 0.655) - 0.006, 0.024, AMIHAN_CREAM, 4, 8);
      }
      bow(b, 0, 0.8, chestFront(0, 0.8) + 0.012, 1, 0, 0.036, AMIHAN_CORAL);
      b.ellipsoid(0, 0.52, 0, 0.186, 0.04, 0.176, AMIHAN_MINT, { rows: 4, cols: 16 });
      bow(b, 0, 0.545, -0.19, 1, 0, 0.075, AMIHAN_CORAL);
    },
    holdR: (b) => {
      /* The bamboo flute, with a little mint tassel. */
      b.tube([0.29, 0.5, 0.03], [0.3, 0.5, 0.38], 0.02, 0.02, '#d9b45a', 6, true);
      for (const z of [0.15, 0.27]) {
        b.tube([0.29, 0.5, z], [0.29, 0.5, z + 0.012], 0.024, 0.024, '#b08a3a', 6, false);
      }
      b.ellipsoid(0.3, 0.45, 0.36, 0.014, 0.034, 0.014, AMIHAN_MINT, { rows: 4, cols: 6 });
    },
    extra: (b) => {
      const k = 1.72;
      const back = -0.75;
      b.tube([0, 0.8, -0.18], [0, k, back + 0.05], 0.011, 0.011, '#f4f0e6', 4, false);
      /* Amihan's kite: four panes on wooden spars, and a ribbon tail of three bows. */
      amihanKite(b, (u, v) => [u, k + 0.13 + v, back - 0.085 * v], 0.58, 0.53, 0.59, 0.014);
      /* The tail's string, so the bows hang from the kite instead of floating. */
      let prev: Vec3 = [0, k - 0.46, back + 0.05];
      for (let i = 0; i < 3; i += 1) {
        const next: Vec3 = [Math.sin(i * 1.7) * 0.06, k - 0.6 - i * 0.16, back + 0.06];
        b.tube(prev, next, 0.007, 0.007, AMIHAN_CREAM, 4, false);
        prev = next;
      }
      for (let i = 0; i < 3; i += 1) {
        b.ellipsoid(Math.sin(i * 1.7) * 0.06, k - 0.6 - i * 0.16, back + 0.06, 0.07, 0.03, 0.02, [AMIHAN_CORAL, AMIHAN_JADE, AMIHAN_CREAM][i], { rows: 3, cols: 6 });
      }
    },
  });
}

/* ---- People at the plaza, the station and in the field ---- */

/** Ranger Ligaya: a bush hat, and a radio to check in with the station. */
export const makeRanger = (r: Renderer): Character =>
  person(r, { skin: '#a56e45', shirt: '#5e7d3a', shorts: '#4a4a3a', bottoms: 'trousers', boots: '#3a2a1c', hair: '#1a1412', style: 'ponytail', hat: bushHat('#7a8f45'), holdR: radio, habit: 'radio' });

/** Dr. Mayumi, the vet: a bun, round glasses, a stethoscope and the day's notes. */
export const makeVet = (r: Renderer): Character =>
  person(r, {
    skin: '#d5a077',
    shirt: '#3fa7c4',
    shorts: '#2a6f86',
    bottoms: 'trousers',
    boots: '#f0f4f8',
    hair: '#2b1a2e',
    style: 'bun',
    glasses: '#3a2f45',
    holdL: clipboard,
    habit: 'clipboard',
    torso: (b) => {
      for (const s of [-1, 1]) {
        b.tube([s * 0.1, 0.87, 0.02], [s * 0.1, 0.72, 0.17], 0.014, 0.014, '#5a6478', 5, true);
      }
      b.tube([-0.1, 0.72, 0.17], [0.03, 0.62, 0.18], 0.014, 0.014, '#5a6478', 5, true);
      b.ellipsoid(0.04, 0.6, 0.18, 0.035, 0.035, 0.015, '#c9d3e0', { rows: 4, cols: 8 });
    },
  });

/** Kagawad Paz, of the fictional barangay by the creek: a council vest and a neat bob. */
export const makeOfficer = (r: Renderer): Character =>
  person(r, {
    skin: '#a8714a',
    shirt: '#f6ecd6',
    shorts: '#2c3b55',
    bottoms: 'trousers',
    boots: '#3a2a1c',
    hair: '#1f1a17',
    style: 'bob',
    holdL: clipboard,
    habit: 'clipboard',
    torso: (b) => {
      b.ellipsoid(0, 0.665, 0.012, 0.225, 0.225, 0.185, '#1e5bb8', { rows: 9, cols: 14 });
      b.ellipsoid(0, 0.7, 0.16, 0.07, 0.15, 0.04, '#f6ecd6', { rows: 5, cols: 6 });
    },
  });
/** Engr. Bautista, a hazardous-waste specialist: high-visibility kit, a hard hat and safety glasses. */
export const makeSpecialist = (r: Renderer): Character =>
  person(r, {
    skin: '#8d5a3b',
    shirt: '#ff7a1a',
    shorts: '#2c3b55',
    bottoms: 'trousers',
    boots: '#2a2f3a',
    hair: '#1f1a17',
    style: 'short',
    glasses: '#2b6fd6',
    hat: hardHat('#f4f6f8'),
    holdR: radio,
    habit: 'radio',
    torso: (b) => {
      b.ellipsoid(0, 0.6, 0.02, 0.222, 0.03, 0.182, '#f4f6f8', { rows: 3, cols: 14 });
      b.ellipsoid(0, 0.7, 0.02, 0.222, 0.03, 0.182, '#f4f6f8', { rows: 3, cols: 14 });
    },
  });
/** Chief Ramos, who runs the depot. */
export const makeChief = (r: Renderer): Character =>
  person(r, { skin: '#b97d52', shirt: '#3fa7c4', shorts: '#3a4a7a', bottoms: 'trousers', boots: '#3a2a1c', hair: '#2d2420', style: 'short', mustache: true, build: 1.14, hat: hardHat('#ffc32d'), habit: 'wave' });

/** Drivers and crew: the shirt picks the person, so every one looks a little different. */
const DRIVERS: Record<string, Partial<PersonLook>> = {
  '#e2452f': { style: 'spiky', habit: 'stretch' },
  '#2fae6b': { style: 'curly', skin: '#8d5a3b', habit: 'wave', hat: undefined },
  '#7d5cff': { style: 'short', skin: '#c98a5c', build: 1.1, habit: 'stretch' },
  '#ffc32d': { style: 'curly', skin: '#b97d52', habit: 'wave' },
  '#14995c': { style: 'sidepart', holdR: wrench, habit: 'wrench', bottoms: 'trousers', shorts: '#2c3b55' },
};
export const makeDriver = (r: Renderer, shirt: string): Character => {
  const more = DRIVERS[shirt] ?? {};
  return person(r, { skin: '#a06a42', shirt, shorts: '#33405a', boots: '#2a2f3a', hair: '#1f1a17', hat: 'hat' in more ? more.hat : cap('#1e5bb8'), ...more });
};

/** Townsfolk: the shirt picks the person. */
const RESIDENTS: Record<string, Partial<PersonLook>> = {
  /* Ate Joy. */
  '#ef6c8f': { style: 'ponytail', bottoms: 'skirt', habit: 'wave' },
  /* Mang Ernesto, out bird-watching in the garden. */
  '#f0a24a': { style: 'short', hair: '#c9c4bb', mustache: true, build: 1.12, hat: bucketHat('#d8c9a2'), holdR: binoculars, habit: 'binoculars' },
  /* Station staff. */
  '#1e5bb8': { style: 'sidepart', glasses: '#2a2f3a', holdL: clipboard, habit: 'clipboard', bottoms: 'trousers' },
};
export const makeResident = (r: Renderer, shirt: string, shorts: string, skin = '#b97d52'): Character =>
  person(r, { skin, shirt, shorts, boots: '#3a2a1c', hair: '#1f1712', ...(RESIDENTS[shirt] ?? {}) });

/* ---- Baging and Sukat ---- */

/**
 * Baging, Rescue Partner: a cute little elf helper, an original design on the classic helper-elf
 * archetype, dressed as one costume: an orange stocking cap with a fluffy cream trim, a floppy tip
 * and a fluffy pom-pom, and a matching soft-orange tunic with a cream petal collar and hem, a brown
 * belt with a gold buckle, cream cuffs and little brown boots with curled toes. A big round head on
 * a small round body, soft pointed ears, light-brown hair, big shiny eyes, a tiny nose, rosy cheeks
 * and a wide sweet smile; a little leaf pinned to the cap (*baging* is a vine). Its arms still stretch
 * to reach across gaps.
 * Bones: 0 root, 1 body, 2 head, 3 armL, 4 armR, 5 legL, 6 legR, 7 to 12 the face, 13 the cap's tip, 14 earL, 15 earR.
 */
export function makeBaging(r: Renderer): Character {
  const face: FaceRig = { eyes: 7, happy: 8, browL: 9, browR: 10, smile: 11, open: 12 };
  const b = new MeshBuilder();
  b.detail = 1.3;
  /* One costume: cap and tunic in two shades of the same orange, cream trim, warm browns. */
  const skin = '#f4c49c';
  const hair = '#a8703f';
  const capC = '#f0832c';
  const tunic = '#f59b47';
  const trim = '#fff3df';
  const belt = '#6e4226';
  const buckle = '#f2c94c';
  const tights = '#8a5a34';
  const boot = '#5e3a22';
  /* Tiny legs and little boots with curled-up toes and cream cuffs. */
  for (const [bone, s2] of [
    [5, -1],
    [6, 1],
  ] as [number, number][]) {
    b.bone = bone;
    b.tube([s2 * 0.095, 0.24, 0], [s2 * 0.105, 0.09, 0.01], 0.05, 0.048, tights, 9, false);
    b.ellipsoid(s2 * 0.11, 0.054, 0.048, 0.08, 0.056, 0.118, boot, { rows: 7, cols: 10 });
    b.tube([s2 * 0.11, 0.068, 0.14], [s2 * 0.11, 0.112, 0.19], 0.028, 0.016, boot, 7, true);
    b.ellipsoid(s2 * 0.107, 0.106, 0.005, 0.066, 0.022, 0.062, trim, { rows: 4, cols: 9 });
  }
  /* A small round body in the soft-orange tunic, flaring a little at the cream-trimmed hem. */
  b.bone = 1;
  b.ellipsoid(0, 0.45, 0, 0.24, 0.25, 0.215, tunic, { rows: 12, cols: 16 });
  b.ellipsoid(0, 0.29, 0, 0.265, 0.082, 0.236, tunic, { rows: 7, cols: 16 });
  ring(b, 0, 0.225, 0, 0.258, 0.23, 0.025, trim, 20, true);
  /* A brown belt with a gold buckle. */
  b.ellipsoid(0, 0.39, 0, 0.247, 0.036, 0.222, belt, { rows: 4, cols: 16 });
  b.rbox(0, 0.39, 0.217, 0.078, 0.058, 0.024, buckle, 0.45);
  b.rbox(0, 0.39, 0.227, 0.038, 0.024, 0.012, belt, 0.45);
  /* A cream petal collar lying on the shoulders, eight soft points all the way round. */
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    b.at(Math.sin(a) * 0.17, 0.64, Math.cos(a) * 0.152, a, 1, () => {
      b.ellipsoid(0, 0, 0, 0.074, 0.02, 0.09, trim, { rows: 5, cols: 10, tiltX: 0.66 });
    });
  }
  /* The head: big and round on the small body. */
  b.bone = 2;
  const HY = 1.0;
  b.ellipsoid(0, HY, 0.02, 0.35, 0.32, 0.315, skin, { rows: 14, cols: 18 });
  const headFront = eggFront(HY, 0.02, 0.35, 0.32, 0.315);
  /* A light-brown fringe peeking out under the cap, tufts over the ears, and hair round the back. */
  for (const [x, w, tilt] of [
    [-0.135, 0.1, 0.35],
    [0, 0.11, 0],
    [0.135, 0.1, -0.35],
  ] as [number, number, number][]) {
    b.ellipsoid(x, 1.16, headFront(x, 1.16) - 0.035, w, 0.058, 0.07, hair, { rows: 6, cols: 9, yaw: Math.asin(x / 0.35) * 0.9, tiltX: -0.3, tiltZ: tilt });
  }
  for (const s2 of [-1, 1]) {
    b.ellipsoid(s2 * 0.31, 1.08, -0.04, 0.07, 0.1, 0.12, hair, { rows: 6, cols: 8, tiltZ: s2 * 0.2 });
  }
  b.ellipsoid(0, 1.07, -0.09, 0.335, 0.17, 0.265, hair, { rows: 8, cols: 14 });
  /* The cap: a crown over the head, a fat fluffy trim, and a cone rising to where the tip flops over. */
  b.ellipsoid(0, 1.275, -0.015, 0.345, 0.205, 0.33, capC, { rows: 10, cols: 16 });
  b.ellipsoid(0, 1.2, 0.0, 0.385, 0.085, 0.365, trim, { rows: 8, cols: 20 });
  b.tube([0, 1.38, -0.02], [0.015, 1.53, -0.035], 0.25, 0.17, capC, 12, false);
  b.ball(0.015, 1.53, -0.035, 0.17, capC, 8, 12);
  /* A little leaf pinned to the trim. */
  b.ellipsoid(-0.22, 1.215, 0.3, 0.03, 0.052, 0.014, '#6aa84f', { rows: 4, cols: 7, tiltZ: 0.6 });
  /* A tiny rosy button nose, then the face: big shiny eyes, soft brows, rosy cheeks, a wide sweet smile. */
  b.ellipsoid(0, 0.928, headFront(0, 0.928) - 0.004, 0.034, 0.029, 0.03, mixHex(skin, '#ff8a80', 0.3), { rows: 6, cols: 9 });
  const faceP = buildFace(b, {
    surf: headFront,
    curve: 0.35,
    eyeX: 0.135,
    eyeY: 0.998,
    eyeW: 0.072,
    eyeH: 0.09,
    eyeColor: '#1f1d2e',
    glint: '#ffffff',
    browY: 1.104,
    browW: 0.042,
    browColor: mixHex(hair, '#000000', 0.25),
    mouthY: 0.856,
    mouthW: 0.056,
    mouthColor: '#6b2a35',
    tongue: '#f27d8c',
    cheekX: 0.215,
    cheekY: 0.888,
    cheekW: 0.075,
    cheekColor: mixHex(skin, '#ff6f7a', 0.6),
    cheekSoft: mixHex(skin, '#ff6f7a', 0.27),
    pivotZ: 0.12,
    bones: face,
    base: 2,
  });
  /* The cap's floppy tip, curving softly over to one side, and a fluffy pom-pom: on its own bone, so it bobs. */
  b.bone = 13;
  {
    const pts: [Vec3, number][] = [
      [[0.015, 1.53, -0.035], 0.17],
      [[0.07, 1.64, -0.05], 0.122],
      [[0.16, 1.71, -0.06], 0.086],
      [[0.27, 1.73, -0.065], 0.062],
      [[0.36, 1.69, -0.06], 0.046],
      [[0.41, 1.62, -0.055], 0.036],
    ];
    for (let i = 0; i < pts.length - 1; i += 1) {
      b.tube(pts[i][0], pts[i + 1][0], pts[i][1], pts[i + 1][1], capC, 10, false);
      b.ball(pts[i + 1][0][0], pts[i + 1][0][1], pts[i + 1][0][2], pts[i + 1][1], capC, 6, 10);
    }
    const pom: Vec3 = [0.43, 1.555, -0.05];
    b.ball(pom[0], pom[1], pom[2], 0.074, trim, 8, 10);
    for (let i = 0; i < 9; i += 1) {
      const t = i * 2.4;
      const up = (i / 8) * 2 - 1;
      const rr = Math.sqrt(1 - up * up);
      b.ball(pom[0] + Math.cos(t) * rr * 0.066, pom[1] + up * 0.066, pom[2] + Math.sin(t) * rr * 0.066, 0.03, trim, 4, 6);
    }
  }
  /* Soft pointed ears, out to the sides and a little up. */
  for (const [bone, s2] of [
    [14, -1],
    [15, 1],
  ] as [number, number][]) {
    b.bone = bone;
    b.ellipsoid(s2 * 0.36, 0.99, -0.01, 0.085, 0.058, 0.03, skin, { rows: 7, cols: 9, tiltZ: s2 * 0.32 });
    b.ellipsoid(s2 * 0.445, 1.034, -0.015, 0.064, 0.028, 0.022, skin, { rows: 5, cols: 8, tiltZ: s2 * 0.48 });
    b.ellipsoid(s2 * 0.375, 0.995, 0.014, 0.056, 0.032, 0.01, '#f0a29a', { rows: 4, cols: 8, tiltZ: s2 * 0.34 });
  }
  /* Short arms in orange sleeves with cream cuffs, and tiny hands with a thumb. */
  for (const [bone, s2] of [
    [3, -1],
    [4, 1],
  ] as [number, number][]) {
    b.bone = bone;
    b.ball(s2 * 0.215, 0.59, 0, 0.064, tunic, 7, 10);
    b.tube([s2 * 0.215, 0.59, 0], [s2 * 0.295, 0.385, 0.03], 0.05, 0.046, tunic, 9, false);
    b.ellipsoid(s2 * 0.3, 0.375, 0.032, 0.055, 0.025, 0.053, trim, { rows: 5, cols: 10 });
    b.ball(s2 * 0.31, 0.33, 0.04, 0.05, skin, 7, 10);
    b.ball(s2 * 0.278, 0.348, 0.075, 0.022, skin, 4, 7);
  }
  const pivots: Vec3[] = [
    [0, 0.3, 0],
    [0, 0.3, 0],
    [0, 0.71, 0],
    [-0.215, 0.59, 0],
    [0.215, 0.59, 0],
    [-0.095, 0.24, 0],
    [0.095, 0.24, 0],
  ];
  for (let i = face.eyes; i <= face.open; i += 1) {
    pivots.push(faceP[i]);
  }
  pivots.push([0.015, 1.53, -0.035], [-0.3, 0.99, -0.01], [0.3, 0.99, -0.01]);
  return { mesh: r.mesh(b), rig: new Rig(pivots, [-1, 0, 1, 1, 1, 0, 0, 2, 2, 2, 2, 2, 2, 2, 2, 2]), face, carryTop: 1.7, habit: 'stretch' };
}

/**
 * Sukat, Eco Analyst: a pocket field console that walks, an original design. A softly boxy cream body
 * with an orange base, a big dark screen for a face, a round weather dial and two buttons below it,
 * short arms and legs, and its anemometer cups on a springy antenna. A scan line sweeps the screen
 * while it scans.
 * Bones: 0 root, 1 body, 2 antenna, 3 armL, 4 armR, 5 legL, 6 cups, 7 to 12 the face, 13 legR, 14 scan line.
 */
export function makeSukat(r: Renderer): Character {
  const face: FaceRig = { eyes: 7, happy: 8, browL: 9, browR: 10, smile: 11, open: 12 };
  const b = new MeshBuilder();
  b.detail = 1.3;
  const cream = '#fff0d4';
  const orange = '#f08a3c';
  const steel = '#7a8aa3';
  const screen = '#17304d';
  const glow = '#7df0b0';
  /* Short legs with round orange feet. */
  for (const [bone, s] of [
    [5, -1],
    [13, 1],
  ] as [number, number][]) {
    b.bone = bone;
    b.tube([s * 0.12, 0.26, 0], [s * 0.125, 0.09, 0.01], 0.048, 0.045, steel, 8, true);
    b.ellipsoid(s * 0.13, 0.055, 0.04, 0.085, 0.055, 0.11, orange, { rows: 6, cols: 9 });
  }
  /* The body: a soft box, cream over an orange base. */
  b.bone = 1;
  const BW = 0.56;
  const BH = 0.62;
  const BY = 0.6;
  const front = 0.175;
  b.rbox(0, BY, 0, BW, BH, 0.35, cream, 0.4);
  b.rbox(0, 0.35, 0, BW + 0.012, 0.13, 0.362, orange, 0.55);
  /* A screen with a soft bezel, set into the front. */
  b.rbox(0, 0.705, front - 0.01, 0.44, 0.31, 0.06, '#e9dcc0', 0.45);
  b.rbox(0, 0.705, front, 0.4, 0.27, 0.05, screen, 0.42);
  /* Below the screen: a round weather dial, two buttons and a speaker. */
  b.sway = NO_LINE;
  b.ellipsoid(-0.12, 0.455, front + 0.012, 0.062, 0.062, 0.02, orange, { rows: 5, cols: 12 });
  b.ellipsoid(-0.12, 0.455, front + 0.028, 0.03, 0.03, 0.012, '#ffe0b8', { rows: 4, cols: 8 });
  b.tube([-0.12, 0.455, front + 0.04], [-0.095, 0.48, front + 0.04], 0.007, 0.007, screen, 4, false);
  b.ellipsoid(0.085, 0.475, front + 0.012, 0.032, 0.032, 0.016, '#ffc32d', { rows: 4, cols: 8 });
  b.ellipsoid(0.165, 0.435, front + 0.012, 0.032, 0.032, 0.016, '#3f8fe8', { rows: 4, cols: 8 });
  for (const y of [0.395, 0.375]) {
    b.tube([0.06, y, front + 0.008], [0.12, y, front + 0.008], 0.006, 0.006, '#c9b48e', 4, false);
  }
  b.sway = 0;
  /* Little ear lights, and on the back a battery hatch with a sun sticker. */
  for (const sx of [-1, 1]) {
    b.ellipsoid(sx * (BW / 2 + 0.005), 0.7, 0, 0.03, 0.06, 0.06, '#ffc32d', { rows: 5, cols: 8 });
  }
  b.rbox(0, 0.62, -0.175, 0.3, 0.26, 0.03, orange, 0.4);
  b.sway = NO_LINE;
  b.ellipsoid(0, 0.65, -0.195, 0.055, 0.055, 0.012, '#ffc32d', { rows: 4, cols: 10 });
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    b.ball(Math.cos(a) * 0.085, 0.65 + Math.sin(a) * 0.085, -0.192, 0.012, '#ffc32d', 3, 5);
  }
  for (const sx of [-1, 1]) {
    b.ball(sx * 0.12, 0.52, -0.19, 0.012, steel, 3, 5);
  }
  b.sway = 0;
  const faceP = buildFace(b, {
    surf: () => front + 0.027,
    curve: 0,
    eyeX: 0.095,
    eyeY: 0.725,
    eyeW: 0.045,
    eyeH: 0.068,
    eyeColor: glow,
    glint: '#eafff5',
    browY: 0.815,
    browW: 0.034,
    browColor: glow,
    mouthY: 0.635,
    mouthW: 0.036,
    mouthColor: glow,
    tongue: null,
    cheekX: 0.155,
    cheekY: 0.655,
    cheekW: 0.026,
    cheekColor: '#ff8fb1',
    pivotZ: 0.12,
    bones: face,
    base: 1,
  });
  /* The scan line, folded away until Sukat scans. */
  b.bone = 14;
  b.sway = NO_LINE;
  b.rbox(0, 0.705, front + 0.031, 0.37, 0.016, 0.004, '#c8ffe4', 0.5);
  b.sway = 0;
  /* A springy antenna with the weather cups on top. */
  b.bone = 2;
  b.tube([0, BY + BH / 2 - 0.02, 0], [0, 1.04, 0], 0.02, 0.018, steel, 6, false);
  b.ball(0, 1.04, 0, 0.026, steel, 4, 6);
  b.bone = 6;
  for (let i = 0; i < 3; i += 1) {
    const a = (i / 3) * Math.PI * 2;
    b.tube([0, 1.07, 0], [Math.cos(a) * 0.13, 1.07, Math.sin(a) * 0.13], 0.01, 0.01, steel, 5, false);
    b.ball(Math.cos(a) * 0.15, 1.07, Math.sin(a) * 0.15, 0.045, '#e2452f', 6, 8);
  }
  b.ball(0, 1.08, 0, 0.03, '#ffc32d', 4, 6);
  /* Short arms with round hands. */
  for (const [bone, s] of [
    [3, -1],
    [4, 1],
  ] as [number, number][]) {
    b.bone = bone;
    b.ball(s * 0.27, 0.6, 0, 0.042, steel, 6, 9);
    b.tube([s * 0.27, 0.6, 0], [s * 0.37, 0.4, 0.04], 0.03, 0.028, steel, 7, true);
    b.ball(s * 0.385, 0.37, 0.045, 0.062, orange, 7, 10);
  }
  const pivots: Vec3[] = [
    [0, 0.3, 0],
    [0, 0.32, 0],
    [0, BY + BH / 2 - 0.02, 0],
    [-0.27, 0.6, 0],
    [0.27, 0.6, 0],
    [-0.12, 0.27, 0],
    [0, 1.07, 0],
  ];
  for (let i = face.eyes; i <= face.open; i += 1) {
    pivots.push(faceP[i]);
  }
  pivots.push([0.12, 0.27, 0], [0, 0.705, front]);
  return { mesh: r.mesh(b), rig: new Rig(pivots, [-1, 0, 1, 1, 1, 0, 2, 1, 1, 1, 1, 1, 1, 0, 1]), face, carryTop: 1.22, habit: 'none' };
}

/**
 * The rufous hornbill. Bones: 0 root, 1 neck and head, 2 wingL, 3 wingR, 4 tail, 5 legs, 6 eyes.
 * Colours from the verified description: see core/content.ts.
 */
export function makeHornbill(r: Renderer): Character {
  const pivots: Vec3[] = [
    [0, 0.5, 0],
    [0, 0.72, 0.2],
    [-0.2, 0.68, 0.06],
    [0.2, 0.68, 0.06],
    [0, 0.5, -0.32],
    [0, 0.34, 0],
  ];
  const parents = [-1, 0, 0, 0, 0, 0];
  const b = new MeshBuilder();
  /*
   * Luzon form, per the IUCN Hornbill Specialist Group page and Wikipedia: dark rufous head
   * and neck, red bill with black at its base running into the face, black underparts,
   * brown back and wings, all-white tail. Sources disagree on eye colour, so the eye is
   * a plain stylised one and makes no claim. This models an adult male: the larger casque.
   */
  const black = '#22222c';
  const brown = '#5e3f2b';
  const wingEdge = '#49301f';
  const white = '#f6f1e6';
  const rufous = '#a9481f';
  const bill = '#d6372a';
  const billBase = black;
  const leg = '#3f3a36';
  b.bone = 5;
  b.tube([-0.09, 0.36, 0.04], [-0.1, 0.14, 0.08], 0.032, 0.026, leg, 5, true);
  b.tube([0.09, 0.36, 0.04], [0.1, 0.14, 0.08], 0.032, 0.026, leg, 5, true);
  b.ellipsoid(-0.1, 0.12, 0.13, 0.05, 0.025, 0.09, leg, { rows: 3, cols: 6 });
  b.ellipsoid(0.1, 0.12, 0.13, 0.05, 0.025, 0.09, leg, { rows: 3, cols: 6 });
  b.bone = 0;
  b.ellipsoid(0, 0.56, -0.03, 0.22, 0.23, 0.4, brown, { rows: 8, cols: 12, tiltX: 0.2 });
  b.ellipsoid(0, 0.44, 0.03, 0.185, 0.155, 0.31, black, { rows: 6, cols: 10, tiltX: 0.2 });
  b.bone = 4;
  /* A long, narrow, all-white tail. */
  b.ellipsoid(0, 0.47, -0.74, 0.115, 0.04, 0.46, white, { rows: 5, cols: 9, tiltX: 0.2 });
  b.ellipsoid(-0.05, 0.46, -0.74, 0.07, 0.035, 0.44, white, { rows: 4, cols: 7, tiltX: 0.2 });
  b.ellipsoid(0.05, 0.46, -0.74, 0.07, 0.035, 0.44, white, { rows: 4, cols: 7, tiltX: 0.2 });
  b.bone = 2;
  b.ellipsoid(-0.225, 0.6, -0.12, 0.045, 0.145, 0.4, brown, { rows: 6, cols: 9, tiltZ: -0.12 });
  b.ellipsoid(-0.24, 0.51, -0.3, 0.036, 0.075, 0.28, wingEdge, { rows: 4, cols: 7, tiltZ: -0.12 });
  b.bone = 3;
  b.ellipsoid(0.225, 0.6, -0.12, 0.045, 0.145, 0.4, brown, { rows: 6, cols: 9, tiltZ: 0.12 });
  b.ellipsoid(0.24, 0.51, -0.3, 0.036, 0.075, 0.28, wingEdge, { rows: 4, cols: 7, tiltZ: 0.12 });
  b.bone = 1;
  /* Neck and head, dark rufous. */
  b.tube([0, 0.62, 0.22], [0, 0.86, 0.33], 0.115, 0.08, rufous, 9, true);
  b.ellipsoid(0, 0.91, 0.37, 0.105, 0.105, 0.125, rufous, { rows: 7, cols: 10 });
  /* Black at the bill's base, running into the face. */
  b.ellipsoid(0, 0.905, 0.46, 0.082, 0.078, 0.07, billBase, { rows: 5, cols: 8 });
  /* The bill: long, tapering, curving down. */
  b.tube([0, 0.9, 0.48], [0, 0.865, 0.69], 0.066, 0.05, bill, 8, true);
  b.tube([0, 0.865, 0.69], [0, 0.79, 0.85], 0.05, 0.03, bill, 8, true);
  b.tube([0, 0.79, 0.85], [0, 0.7, 0.93], 0.03, 0.01, bill, 7, true);
  /* The casque sits along the top of the bill, lifting up towards the front. */
  b.ellipsoid(0, 0.985, 0.56, 0.052, 0.05, 0.135, bill, { rows: 5, cols: 8, tiltX: -0.08 });
  b.ellipsoid(0, 1.005, 0.67, 0.042, 0.04, 0.075, bill, { rows: 5, cols: 7, tiltX: -0.45 });
  /* A plain stylised eye: sources disagree on the true colours. On its own bone, to blink. */
  b.bone = 6;
  for (const s of [-1, 1]) {
    b.ellipsoid(s * 0.096, 0.937, 0.41, 0.02, 0.03, 0.03, '#f7f1e0', { rows: 6, cols: 8 });
    b.ellipsoid(s * 0.11, 0.936, 0.415, 0.012, 0.019, 0.019, '#15192a', { rows: 6, cols: 8 });
    b.ellipsoid(s * 0.118, 0.944, 0.421, 0.004, 0.0065, 0.0065, '#ffffff', { rows: 3, cols: 5 });
  }
  return { mesh: r.mesh(b), rig: new Rig([...pivots, [0, 0.937, 0.41]], [...parents, 1]) };
}

export type VehicleKind = 'sedan' | 'van' | 'pickup' | 'truck' | 'evan' | 'segtruck' | 'etrike';

export function makeVehicle(r: Renderer, kind: VehicleKind): Mesh {
  const b = new MeshBuilder();
  const wheel = (x: number, z: number, size = 0.3): void => {
    b.ellipsoid(x, size, z, 0.12, size, size, '#20242f', { rows: 6, cols: 10 });
    b.ellipsoid(x + Math.sign(x) * 0.08, size, z, 0.05, size * 0.5, size * 0.5, '#c9d3e0', { rows: 4, cols: 8 });
  };
  const glass = '#9fd6f2';
  if (kind === 'sedan') {
    b.rbox(0, 0.62, 0, 1.5, 0.55, 3.2, '#e8eef6', 0.5);
    b.rbox(0, 1.04, -0.15, 1.28, 0.55, 1.7, glass, 0.55);
    b.rbox(0, 1.3, -0.15, 1.2, 0.1, 1.5, '#e8eef6', 0.5);
  } else if (kind === 'van' || kind === 'evan') {
    const body = kind === 'van' ? '#f2f5f8' : '#7fe3b4';
    b.rbox(0, 1.05, -0.1, 1.7, 1.5, 3.7, body, 0.42);
    b.rbox(0, 1.4, 1.2, 1.5, 0.6, 1, glass, 0.5);
    b.rbox(-0.86, 1.4, -0.3, 0.04, 0.5, 1.6, glass, 0.3);
    b.rbox(0.86, 1.4, -0.3, 0.04, 0.5, 1.6, glass, 0.3);
    b.rbox(0, 0.72, -0.1, 1.74, 0.16, 3.72, kind === 'van' ? '#1464e8' : '#14995c', 0.3);
    if (kind === 'evan') {
      b.rbox(0, 1.86, -0.4, 1.2, 0.08, 1.8, '#2b6fd6', 0.3);
    }
  } else if (kind === 'pickup') {
    b.rbox(0, 0.72, 0, 1.6, 0.6, 3.9, '#d9632f', 0.42);
    b.rbox(0, 1.2, 0.72, 1.46, 0.7, 1.5, '#d9632f', 0.5);
    b.rbox(0, 1.3, 1.1, 1.3, 0.42, 0.7, glass, 0.5);
    b.rbox(0, 0.98, -0.95, 1.36, 0.2, 1.6, '#8a4a22', 0.3);
  } else if (kind === 'etrike') {
    /* A small electric tricycle with a covered cargo box. */
    b.rbox(0, 0.95, 0.75, 1.05, 1.1, 1.1, '#2fae6b', 0.45);
    b.rbox(0, 1.15, 1.2, 0.95, 0.5, 0.2, glass, 0.4);
    b.rbox(0, 1.62, 0.6, 1.15, 0.1, 1.5, '#1f8a52', 0.4);
    b.rbox(0, 0.8, -0.75, 1.25, 0.9, 1.4, '#f2f5f8', 0.35);
    b.ellipsoid(0, 0.3, 1.25, 0.1, 0.3, 0.3, '#20242f', { rows: 6, cols: 10 });
    wheel(-0.62, -0.75, 0.28);
    wheel(0.62, -0.75, 0.28);
    return r.mesh(b);
  } else {
    b.rbox(0, 1.25, 1.55, 1.9, 1.7, 1.5, kind === 'segtruck' ? '#2fae6b' : '#ffc32d', 0.45);
    b.rbox(0, 1.55, 2.05, 1.7, 0.6, 0.55, glass, 0.5);
    if (kind === 'segtruck') {
      /* Three separate bins: biodegradable, recyclable, residual. */
      ['#3f9b4a', '#2b6fd6', '#6b7488'].forEach((c, i) => b.rbox(0, 1.45, -2.05 + i * 1.12, 2.05, 1.75, 1.04, c, 0.3));
    } else {
      b.rbox(0, 1.5, -0.95, 2.1, 1.9, 3.5, '#8b98ad', 0.32);
    }
    b.rbox(0, 0.62, -0.1, 1.8, 0.24, 5.2, '#2c3b55', 0.3);
  }
  const big = kind === 'truck' || kind === 'segtruck';
  const front = big ? 1.55 : 1.15;
  const backZ = big ? -1.8 : -1.15;
  const size = big ? 0.42 : 0.3;
  const half = big ? 0.95 : 0.78;
  wheel(-half, front, size);
  wheel(half, front, size);
  wheel(-half, backZ, size);
  wheel(half, backZ, size);
  return r.mesh(b);
}

/** A crate of gear, carried and delivered. */
export function makeCrate(r: Renderer, color: string, band: string): Mesh {
  const b = new MeshBuilder();
  b.rbox(0, 0.3, 0, 0.72, 0.6, 0.72, color, 0.28);
  b.rbox(0, 0.3, 0, 0.75, 0.14, 0.75, band, 0.24);
  return r.mesh(b);
}

/** One heap of props for the plaza that appear as the mission moves along. */
export interface Portraits {
  [id: string]: string;
}
