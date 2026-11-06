import type { Mood } from '../../core/moods';
import { art, blitClay, preload, softShadow, tinted, type ClaySprite } from '../art/clay';
import { makeCanvas, shade, type Ctx } from '../art/kit';
import { bendAt, laneAt, screenX, screenY, zAtY, type Camera } from './camera';

/**
 * The world around the road, drawn from baked clay sprites and two procedural
 * textures: a road surface with wear, patches and repaired seams, and a patchwork
 * of fields, both projected row by row so they move with the road. Scenery comes
 * in authored clusters (a farm with a carabao, a town block, a rest stop) rather
 * than one tree repeated, and each mood has its own kit. None of it can touch the
 * car: everything stands past the guardrails.
 */

export type Landmark = 'none' | 'city' | 'arena' | 'plaza' | 'lanterns' | 'arayat' | 'pinatubo';

interface MoodLook {
  skyTop: string;
  skyBottom: string;
  /** Warm or cool light low in the sky. */
  glow: string;
  hillFar: string;
  hillNear: string;
  treeLine: string;
  fields: string[];
  verge: string;
  shoulder: string;
  asphalt: string;
  laneLine: string;
  edgeLeft: string;
  haze: string;
  /** Multiplied over every sprite. Null in daylight. */
  tint: string | null;
  /** What the cloud sprites are washed with. */
  cloud: string | null;
  wet: boolean;
  /** Concrete and rail colours. */
  median: string;
  medianTop: string;
  rail: string;
  railTop: string;
}

export const MOODS: Record<Mood, MoodLook> = {
  morning: {
    skyTop: '#A9D3E2',
    skyBottom: '#F6EBD3',
    glow: 'rgba(255,233,190,0.65)',
    hillFar: '#B6CFCB',
    hillNear: '#9DBE9F',
    treeLine: '#7DA57A',
    fields: ['#A5C37E', '#94B873', '#B4CC87', '#A0BE76', '#BFD08C', '#8DB06E'],
    verge: '#8DAE6C',
    shoulder: '#C9C1AE',
    asphalt: '#7A8499',
    laneLine: '#F4EBD7',
    edgeLeft: '#E3BE62',
    haze: 'rgba(246,235,211,',
    tint: null,
    cloud: null,
    wet: false,
    median: '#CFC8B6',
    medianTop: '#EDE5D2',
    rail: '#B7BDB8',
    railTop: '#E7E8DE',
  },
  town: {
    skyTop: '#B5D4DC',
    skyBottom: '#F4E5CF',
    glow: 'rgba(255,224,180,0.55)',
    hillFar: '#C4CFC9',
    hillNear: '#AEBFA8',
    treeLine: '#8FA98A',
    fields: ['#B3BC8F', '#C2BE97', '#A7B487', '#CBBE9C', '#AEB98A', '#B9B98F'],
    verge: '#9CAE7A',
    shoulder: '#CFC6B2',
    asphalt: '#778094',
    laneLine: '#F4EBD7',
    edgeLeft: '#E3BE62',
    haze: 'rgba(244,229,207,',
    tint: '#FFF6E8',
    cloud: null,
    wet: false,
    median: '#CDC6B4',
    medianTop: '#EAE2CF',
    rail: '#B4BAB5',
    railTop: '#E4E5DB',
  },
  lantern: {
    skyTop: '#4F5288',
    skyBottom: '#EFAE85',
    glow: 'rgba(255,190,130,0.75)',
    hillFar: '#8B7BA0',
    hillNear: '#6E6A8E',
    treeLine: '#4F5A70',
    fields: ['#6E8560', '#7C8E62', '#667C5C', '#88935F', '#73875F', '#607655'],
    verge: '#5F7656',
    shoulder: '#9B9390',
    asphalt: '#565D78',
    laneLine: '#E9D9BE',
    edgeLeft: '#D9AE5E',
    haze: 'rgba(239,174,133,',
    tint: '#C9B4BE',
    cloud: '#E7B8A8',
    wet: false,
    median: '#A49CA0',
    medianTop: '#C9BEB8',
    rail: '#8E8C96',
    railTop: '#B9B3B4',
  },
  rain: {
    skyTop: '#8B9BAA',
    skyBottom: '#C9D2D1',
    glow: 'rgba(220,228,226,0.55)',
    hillFar: '#A4B2B4',
    hillNear: '#8DA29C',
    treeLine: '#6E8A80',
    fields: ['#7F9E78', '#769672', '#88A47E', '#6F906E', '#8BA681', '#7A9875'],
    verge: '#6E8F6A',
    shoulder: '#A8ABA4',
    asphalt: '#5E687C',
    laneLine: '#E3E0D2',
    edgeLeft: '#CDB46A',
    haze: 'rgba(201,210,209,',
    tint: '#BCC8CC',
    cloud: '#AEB9BE',
    wet: true,
    median: '#ABAEA8',
    medianTop: '#CBCDC6',
    rail: '#969C9C',
    railTop: '#C0C4C0',
  },
};

// -- authored clusters -----------------------------------------------------------------

/** [sprite, offset out from the road edge, offset along the road, size]. */
type Piece = [string, number, number, number];

const FARM: Piece[] = [['nipa', 1.6, 0, 1.12], ['banana', 0.5, 1.6, 1.0], ['hedge', 0.15, -1.2, 0.9], ['haystack', 2.9, 1.3, 0.72]];
const PADDY: Piece[] = [['carabao', 1.2, 0, 0.6], ['grass', 0.3, -1.6, 0.8], ['palm', 2.8, 2, 1.1]];
const MANGO_GROVE: Piece[] = [['mango', 1.2, 0, 1.25], ['mango', 2.9, 1.5, 1.05], ['flowers', 0.1, -1.4, 0.8], ['grass', 0.2, 1.2, 0.8]];
const BAMBOO_BEND: Piece[] = [['bamboo', 0.8, 0, 1.05], ['bamboo', 1.5, 1.1, 0.9], ['hedge', 0.2, -1.2, 0.8]];
const PALM_ROW: Piece[] = [['palm', 0.8, 0, 1.2], ['palm', 1.6, 2.3, 1.1], ['palm', 0.7, 4.4, 1.25], ['grass', 0.1, 1.1, 0.8]];
const SHADE_TREE: Piece[] = [['narra', 1.4, 0, 1.2], ['hedge', 0.2, 1.4, 0.8], ['grass', 0.1, -1, 0.8]];
const ACACIA_FIELD: Piece[] = [['acacia', 1.6, 0, 1.25], ['grass', 0.2, 1.4, 0.8], ['flowers', 0.2, -1.2, 0.8]];
const UTILITY: Piece[] = [['pole', 0.2, 0, 1.0], ['hedge', 0.5, 1.4, 0.7]];
const HOME: Piece[] = [['house', 1.5, 0, 1.0], ['banana', 0.5, 1.5, 0.9], ['flowers', 0.2, -1.3, 0.7]];
const HOME2: Piece[] = [['house2', 1.5, 0, 1.0], ['mango', 2.9, 1.0, 0.9], ['hedge', 0.3, -1.2, 0.8]];
const SARI: Piece[] = [['sari', 1.3, 0, 1.0], ['pole', 0.2, 1.6, 0.95], ['stall', 2.5, -1.1, 0.74]];
const TOWN_BLOCK: Piece[] = [['shop', 1.5, 0, 1.0], ['shop2', 2.3, 2.5, 1.0], ['lamp', 0.1, 1.1, 1.0], ['sari', 0.9, -2.2, 0.82]];
const TANK: Piece[] = [['tower', 2.2, 0, 1.1], ['shop2', 1.1, -2.4, 0.86], ['hedge', 0.2, 1.3, 0.8]];
const BOARD: Piece[] = [['billboard', 0.8, 0, 1.15], ['grass', 0.2, 1, 0.8]];
const BOARD2: Piece[] = [['billboard2', 0.9, 0, 1.15], ['flowers', 0.2, 1, 0.7]];
const LANTERN_POST: Piece[] = [['parolPost', 0.5, 0, 1.05], ['stall', 1.6, 1.1, 0.8], ['flowers', 0.2, -1, 0.7]];
const LANTERN_TOWN: Piece[] = [['shop', 1.6, 0, 1.0], ['parolPost', 0.4, 1.7, 1.05], ['stall', 1.2, -1.8, 0.84]];
const LANTERN_SHED: Piece[] = [['nipa', 1.5, 0, 1.05], ['parolPost', 0.4, -1.5, 1.0], ['banana', 2.6, 1.2, 0.9]];

const KITS: Record<Mood, Piece[][]> = {
  morning: [FARM, MANGO_GROVE, PADDY, BAMBOO_BEND, PALM_ROW, SHADE_TREE, ACACIA_FIELD, UTILITY, HOME, BOARD],
  town: [TOWN_BLOCK, SARI, HOME2, UTILITY, TANK, BOARD, BOARD2, SHADE_TREE, HOME],
  lantern: [LANTERN_POST, LANTERN_TOWN, LANTERN_SHED, PALM_ROW, SHADE_TREE, UTILITY, HOME],
  rain: [BAMBOO_BEND, FARM, MANGO_GROVE, UTILITY, HOME2, PADDY, SHADE_TREE],
};

/** The far layer across the fields. */
const FAR: Record<Mood, [string, number][]> = {
  morning: [['pylon', 1.2], ['mango', 1.15], ['acacia', 1.1], ['nipa', 1.0], ['palm', 1.05], ['narra', 1.1]],
  town: [['shop', 1.05], ['shop2', 1.05], ['pylon', 1.2], ['tower', 1.1], ['narra', 1.1], ['house2', 1.0]],
  lantern: [['palm', 1.05], ['mango', 1.1], ['shop', 1.0], ['pylon', 1.2], ['narra', 1.1]],
  rain: [['pylon', 1.2], ['narra', 1.1], ['mango', 1.1], ['palm', 1.05], ['nipa', 1.0]],
};

function hash(n: number): number {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

export interface Drawable {
  z: number;
  draw: () => void;
}

const SLOT = 12;
const FAR_SLOT = 29;
/** Texture scale: pixels per lane across, pixels per unit along. Lane dashes repeat every 7, so 28 tiles. */
const ROAD_PX = 150;
const ROAD_HALF = 2.8;
const ROAD_LEN = 28;
const ROAD_PY = 36;
const FIELD_PX = 12;
const FIELD_HALF = 22;
const FIELD_LEN = 88;

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Everything repeats along the road, so whatever crosses the seam is drawn at both ends. */
function wrapY(c: CanvasRenderingContext2D, h: number, draw: (dy: number) => void): void {
  draw(0);
  draw(-h);
  draw(h);
  void c;
}

function buildRoadTexture(look: MoodLook): HTMLCanvasElement {
  const W = Math.round(ROAD_HALF * 2 * ROAD_PX);
  const H = ROAD_LEN * ROAD_PY;
  const { canvas, ctx: c } = makeCanvas(W, H, 1);
  const X = (lanes: number): number => (lanes + ROAD_HALF) * ROAD_PX;
  const r = rng(77);
  // Verge, shoulder, asphalt.
  c.fillStyle = look.verge;
  c.fillRect(0, 0, W, H);
  for (let i = 0; i < 700; i += 1) {
    const side = r() < 0.5 ? -1 : 1;
    const x = X(side * (2.3 + r() * 0.5));
    c.fillStyle = shade(look.verge, (r() - 0.5) * 0.25);
    c.beginPath();
    c.ellipse(x, r() * H, 1 + r() * 2, 2 + r() * 4, 0, 0, Math.PI * 2);
    c.fill();
  }
  c.fillStyle = look.shoulder;
  c.fillRect(X(-2.3), 0, X(2.3) - X(-2.3), H);
  for (let i = 0; i < 1400; i += 1) {
    const side = r() < 0.5 ? -1 : 1;
    c.fillStyle = shade(look.shoulder, (r() - 0.5) * 0.3);
    const size = 0.5 + r() * 1.5;
    c.beginPath();
    c.ellipse(X(side * (1.5 + r() * 0.8)), r() * H, size, size * 1.6, 0, 0, Math.PI * 2);
    c.fill();
  }
  c.fillStyle = look.asphalt;
  c.fillRect(X(-1.5), 0, X(1.5) - X(-1.5), H);
  // Grain.
  for (let i = 0; i < 6000; i += 1) {
    c.fillStyle = shade(look.asphalt, (r() - 0.5) * 0.2);
    const size = 0.5 + r() * 1.1;
    c.beginPath();
    c.ellipse(X(-1.5) + r() * (X(1.5) - X(-1.5)), r() * H, size, size * 1.6, 0, 0, Math.PI * 2);
    c.fill();
  }
  // Worn wheel tracks: two soft bands in each lane, the road's real pattern.
  for (const lane of [-1, 0, 1]) {
    for (const off of [-0.24, 0.24]) {
      const gx = X(lane + off);
      const g = c.createLinearGradient(gx - 16, 0, gx + 16, 0);
      g.addColorStop(0, 'rgba(30,36,48,0)');
      g.addColorStop(0.5, look.wet ? 'rgba(210,225,235,0.09)' : 'rgba(30,36,48,0.1)');
      g.addColorStop(1, 'rgba(30,36,48,0)');
      c.fillStyle = g;
      c.fillRect(gx - 16, 0, 32, H);
    }
  }
  // Repaired patches and stains.
  for (let i = 0; i < 7; i += 1) {
    const lane = [-1, 0, 1][Math.floor(r() * 3)];
    const w = ROAD_PX * (0.34 + r() * 0.36);
    const len = ROAD_PY * (1.4 + r() * 3);
    const px = X(lane) - w / 2 + (r() - 0.5) * 30;
    const py = r() * H;
    wrapY(c, H, (dy) => {
      c.fillStyle = shade(look.asphalt, -0.05 - r() * 0.03);
      c.fillRect(px, py + dy, w, len);
      c.strokeStyle = shade(look.asphalt, -0.14);
      c.lineWidth = 1.5;
      c.strokeRect(px, py + dy, w, len);
    });
  }
  for (let i = 0; i < 9; i += 1) {
    const px = X(-1.3) + r() * ROAD_PX * 2.6;
    const py = r() * H;
    const rad = 10 + r() * 22;
    wrapY(c, H, (dy) => {
      const g = c.createRadialGradient(px, py + dy, 0, px, py + dy, rad);
      g.addColorStop(0, 'rgba(26,30,40,0.2)');
      g.addColorStop(1, 'rgba(26,30,40,0)');
      c.fillStyle = g;
      c.beginPath();
      c.ellipse(px, py + dy, rad, rad * 1.8, 0, 0, Math.PI * 2);
      c.fill();
    });
  }
  // Fine cracks.
  c.strokeStyle = shade(look.asphalt, -0.3);
  c.lineWidth = 1;
  for (let i = 0; i < 14; i += 1) {
    let px = X(-1.4) + r() * ROAD_PX * 2.8;
    let py = r() * H;
    c.beginPath();
    c.moveTo(px, py);
    for (let k = 0; k < 5; k += 1) {
      px += (r() - 0.5) * 22;
      py += r() * 22;
      c.lineTo(px, py);
    }
    c.stroke();
  }
  // Expansion seams crossing the road, every 7 units.
  c.fillStyle = shade(look.asphalt, -0.22);
  for (let k = 0; k < 4; k += 1) {
    c.fillRect(X(-1.5), k * 7 * ROAD_PY + 40, X(1.5) - X(-1.5), 2);
  }
  // Wet: long soft reflections of the sky.
  if (look.wet) {
    for (let i = 0; i < 16; i += 1) {
      const px = X(-1.4) + r() * ROAD_PX * 2.8;
      const py = r() * H;
      const len = 60 + r() * 200;
      wrapY(c, H, (dy) => {
        const g = c.createLinearGradient(0, py + dy, 0, py + dy + len);
        g.addColorStop(0, 'rgba(214,226,232,0)');
        g.addColorStop(0.5, 'rgba(214,226,232,0.2)');
        g.addColorStop(1, 'rgba(214,226,232,0)');
        c.fillStyle = g;
        c.fillRect(px, py + dy, 14 + r() * 26, len);
      });
    }
  }
  // Rumble dots along the edges, then the painted lines with a little wear.
  for (let k = 0; k < H / 18; k += 1) {
    for (const x of [-1.6, 1.6]) {
      c.fillStyle = shade(look.shoulder, -0.16);
      c.beginPath();
      c.ellipse(X(x), k * 18 + 3, 5, 3, 0, 0, Math.PI * 2);
      c.fill();
    }
  }
  // The verge melts into the fields, so its edge never shows as steps.
  c.globalCompositeOperation = 'destination-out';
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? 0 : W;
    const x1 = X(side * 2.42);
    const g = c.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.fillRect(Math.min(x0, x1), 0, Math.abs(x1 - x0), H);
  }
  c.globalCompositeOperation = 'source-over';
  return canvas;
}

function buildFieldTexture(look: MoodLook): HTMLCanvasElement {
  const W = FIELD_HALF * 2 * FIELD_PX;
  const H = FIELD_LEN * FIELD_PX;
  const { canvas, ctx: c } = makeCanvas(W, H, 1);
  const r = rng(419);
  c.fillStyle = look.fields[0];
  c.fillRect(0, 0, W, H);
  // A patchwork: plots of different greens and golds, with dikes between them.
  let y = 0;
  while (y < H) {
    const rowH = 44 + r() * 90;
    let x = 0;
    while (x < W) {
      const w = 46 + r() * 120;
      const color = look.fields[Math.floor(r() * look.fields.length)];
      c.fillStyle = color;
      c.fillRect(x, y, w, rowH);
      // Furrows run with the road in some plots, across in others.
      const along = r() < 0.5;
      c.fillStyle = shade(color, -0.035);
      if (along) {
        for (let fx = x + 4; fx < x + w; fx += 7 + r() * 5) {
          c.fillRect(fx, y, 2, rowH);
        }
      } else {
        for (let fy = y + 4; fy < y + rowH; fy += 7 + r() * 5) {
          c.fillRect(x, fy, w, 2);
        }
      }
      // A dike round the plot.
      c.strokeStyle = shade(color, -0.12);
      c.lineWidth = 2;
      c.strokeRect(x + 1, y + 1, w - 2, rowH - 2);
      x += w;
    }
    y += rowH;
  }
  // Soft clumps, so it is not all ruled lines.
  for (let i = 0; i < 300; i += 1) {
    const px = r() * W;
    const py = r() * H;
    const rad = 3 + r() * 11;
    c.fillStyle = shade(look.fields[Math.floor(r() * look.fields.length)], -0.14 - r() * 0.1);
    c.beginPath();
    c.ellipse(px, py, rad, rad * 0.6, 0, 0, Math.PI * 2);
    c.fill();
  }
  return canvas;
}

const SPRITES_BY_MOOD = (mood: Mood): string[] => {
  const names = new Set<string>(['c.cloud0', 'c.cloud1', 'c.cloud2', 'b.hillsFar', 'b.hillsNear', 'w.kmpost', 'w.sos', 'w.signYellow', 'w.signExit', 'w.overpass', 'z.gravel']);
  for (const cluster of KITS[mood]) {
    for (const [kind] of cluster) {
      names.add(`w.${kind}`);
    }
  }
  for (const [kind] of FAR[mood]) {
    names.add(`w.${kind}`);
  }
  return [...names];
};

export class Roadscape {
  private mood: Mood = 'morning';
  private road: HTMLCanvasElement | null = null;
  private fields: HTMLCanvasElement | null = null;
  private background: HTMLCanvasElement | null = null;
  private landmark: Landmark = 'none';
  private dpr = 1;
  private key = '';
  /** Lower: fewer rows and less scenery (set by the renderer when frames run long). */
  quality: 1 | 2 = 1;
  ready = false;
  private readonly rain: { x: number; y: number; v: number; len: number }[] = [];

  get look(): MoodLook {
    return MOODS[this.mood];
  }

  get currentMood(): Mood {
    return this.mood;
  }

  setMood(mood: Mood, landmark: Landmark): void {
    if (mood === this.mood && landmark === this.landmark && this.road !== null) {
      return;
    }
    this.mood = mood;
    this.landmark = landmark;
    this.road = null;
    this.fields = null;
    this.background = null;
    this.ready = false;
    // The mood's whole kit is decoded before the first frame needs it.
    void preload(SPRITES_BY_MOOD(mood)).then(() => {
      if (this.mood === mood) {
        this.ready = true;
        this.background = null;
      }
    });
  }

  resize(dpr: number): void {
    this.dpr = dpr;
    this.background = null;
  }

  /** The sky, hills and clouds, drawn once per size. */
  private ensureBackground(cam: Camera): HTMLCanvasElement {
    const key = `${cam.width}x${cam.height}|${Math.round(cam.horizonY)}|${this.mood}|${this.landmark}`;
    if (this.background !== null && this.key === key) {
      return this.background;
    }
    this.key = key;
    const look = this.look;
    const pad = 44;
    const W = cam.width + pad * 2;
    const H = cam.horizonY + 4;
    const { canvas, ctx } = makeCanvas(W, H, Math.min(2, this.dpr));
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, look.skyTop);
    sky.addColorStop(1, look.skyBottom);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    // A soft light low in the sky.
    const glow = ctx.createRadialGradient(W * 0.72, H * 0.88, 0, W * 0.72, H * 0.88, W * 0.62);
    glow.addColorStop(0, look.glow);
    glow.addColorStop(1, look.glow.replace(/[\d.]+\)$/, '0)'));
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
    // Clouds, layered.
    const r = rng(this.mood.length * 97 + 5);
    for (let i = 0; i < 6; i += 1) {
      const c = art(`c.cloud${i % 3}`);
      if (c !== null) {
        const k = (W / 760) * (0.5 + r() * 0.65);
        ctx.globalAlpha = 0.75 + r() * 0.25;
        const x = r() * W;
        const y = H * (0.1 + r() * 0.5);
        ctx.drawImage(tinted(c, look.cloud), x - c.w * k * 0.5, y - c.h * k * 0.5, c.w * k, c.h * k);
      }
    }
    ctx.globalAlpha = 1;
    // Landmark, then two ranges of hills washed with the mood's colour.
    const hills = (name: string, colour: string, baseline: number, scale: number, x: number): void => {
      const s = art(name);
      if (s !== null) {
        const k = (W / s.w) * scale;
        const c = tinted(s, colour);
        ctx.drawImage(c, x - s.w * k * 0.5, baseline - s.h * k, s.w * k, s.h * k);
      }
    };
    if (this.landmark === 'arayat') {
      hills('b.arayat', look.hillFar, H, 0.44, W * 0.3);
    } else if (this.landmark === 'pinatubo') {
      hills('b.pinatubo', look.hillFar, H, 0.62, W * 0.68);
    }
    hills('b.hillsFar', look.hillFar, H, 1.3, W * 0.5);
    if (this.landmark === 'city' || this.landmark === 'arena' || this.landmark === 'plaza' || this.landmark === 'lanterns') {
      hills('b.skyline', look.hillFar, H, 0.46, W * 0.64);
    }
    hills('b.hillsNear', look.hillNear, H, 1.3, W * 0.42);
    // A line of far trees where the fields meet the hills.
    ctx.fillStyle = look.treeLine;
    for (let x = -10; x < W + 10; x += 7) {
      const rad = 4 + r() * 6;
      ctx.beginPath();
      ctx.ellipse(x, H - 1, rad * 1.1, rad, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Haze at the seam.
    const haze = ctx.createLinearGradient(0, H - 24, 0, H);
    haze.addColorStop(0, `${look.haze}0)`);
    haze.addColorStop(1, `${look.haze}0.55)`);
    ctx.fillStyle = haze;
    ctx.fillRect(0, H - 24, W, 24);
    this.background = canvas;
    return canvas;
  }

  drawSky(ctx: Ctx, cam: Camera, shift: number): void {
    const bg = this.ensureBackground(cam);
    const pad = 44;
    ctx.drawImage(bg, -pad + shift, 0, cam.width + pad * 2, cam.horizonY + 4);
  }

  /** Fields, then the road, row by row: each row samples the textures at its own distance. */
  /** `beforeLines` draws on the road surface itself, under the painted lines (broken road). */
  drawGround(ctx: Ctx, cam: Camera, distance: number, nearZ: number, beforeLines?: () => void): void {
    const look = this.look;
    if (this.road === null) {
      this.road = buildRoadTexture(look);
      this.fields = buildFieldTexture(look);
    }
    const top = cam.horizonY;
    const bottom = cam.height;
    ctx.fillStyle = look.fields[0];
    ctx.fillRect(0, top, cam.width, bottom - top);
    const field = this.fields!;
    const road = this.road;
    const fw = field.width;
    const fh = field.height;
    const rw = road.width;
    const rh = road.height;
    const coarse = this.quality === 2;
    // Fields: bands get taller toward the camera.
    let y = top;
    while (y < bottom) {
      const dy = y - top;
      const step = Math.max(2, Math.min(coarse ? 10 : 5, dy * (coarse ? 0.08 : 0.05)));
      const z0 = zAtY(cam, y + step + 0.01);
      const z1 = zAtY(cam, y + 0.01);
      const zm = Math.min(600, (z0 + Math.min(z1, 900)) / 2);
      const lane = laneAt(cam, zm);
      const cx = screenX(cam, 0, zm);
      const wx0 = Math.max(-FIELD_HALF, (0 - cx) / lane);
      const wx1 = Math.min(FIELD_HALF, (cam.width - cx) / lane);
      if (wx1 > wx0) {
        const sx = (wx0 + FIELD_HALF) * FIELD_PX;
        const sw = (wx1 - wx0) * FIELD_PX;
        const texZ = ((distance + zm) * FIELD_PX) % fh;
        const sy = fh - 1 - texZ;
        const sh = Math.max(1, Math.min(60, (Math.min(z1, 400) - z0) * FIELD_PX));
        const s0 = sy < 0 ? sy + fh : sy;
        ctx.drawImage(field, Math.max(0, sx), Math.max(0, Math.min(fh - sh, s0)), Math.min(fw, sw), sh, cx + wx0 * lane, y, (wx1 - wx0) * lane, step + 1);
      }
      y += step;
    }
    // The road and its verges.
    y = screenY(cam, 180);
    // Beyond the last textured row: a plain sliver running to the horizon.
    ctx.fillStyle = look.asphalt;
    ctx.beginPath();
    const farZs = [180, 240, 320, 460, 900];
    farZs.forEach((z, i) => {
      const sx = screenX(cam, -1.5, z);
      const sy = screenY(cam, z);
      if (i === 0) {
        ctx.moveTo(sx, sy);
      } else {
        ctx.lineTo(sx, sy);
      }
    });
    for (let i = farZs.length - 1; i >= 0; i -= 1) {
      ctx.lineTo(screenX(cam, 1.5, farZs[i]), screenY(cam, farZs[i]));
    }
    ctx.closePath();
    ctx.fill();
    while (y < bottom) {
      const dy = y - top;
      // Fine enough that edges stay clean right down to the camera; a slow device gets coarser rows.
      const step = coarse ? Math.max(2.5, Math.min(6, dy * 0.03)) : Math.max(1.6, Math.min(3.2, dy * 0.018));
      const z0 = zAtY(cam, y + step);
      const z1 = zAtY(cam, y);
      const zm = (z0 + z1) / 2;
      const lane = laneAt(cam, zm);
      const cx = screenX(cam, 0, zm);
      const wx0 = Math.max(-ROAD_HALF, (0 - cx) / lane);
      const wx1 = Math.min(ROAD_HALF, (cam.width - cx) / lane);
      if (wx1 > wx0) {
        const sx = (wx0 + ROAD_HALF) * ROAD_PX;
        const sw = (wx1 - wx0) * ROAD_PX;
        const texZ = (((distance + zm) * ROAD_PY) % rh + rh) % rh;
        // Texture y runs the other way: further up the road is higher up the picture.
        const sy = rh - texZ;
        const sh = Math.max(1, Math.min(rh * 0.4, (z1 - z0) * ROAD_PY));
        const clampedY = Math.max(0, Math.min(rh - sh, sy));
        ctx.drawImage(road, sx, clampedY, Math.min(rw - sx, sw), sh, cx + wx0 * lane, y, (wx1 - wx0) * lane, step + 0.6);
      }
      y += step;
    }
    beforeLines?.();
    this.drawLines(ctx, cam, distance, nearZ);
  }

  /** Painted lines as vector shapes: crisp however coarse the road's rows are. */
  private drawLines(ctx: Ctx, cam: Camera, distance: number, nearZ: number): void {
    const look = this.look;
    const far = 150;
    const quad = (xa: number, xb: number, za: number, zb: number): void => {
      ctx.moveTo(screenX(cam, xa, za), screenY(cam, za));
      ctx.lineTo(screenX(cam, xb, za), screenY(cam, za));
      ctx.lineTo(screenX(cam, xb, zb), screenY(cam, zb));
      ctx.lineTo(screenX(cam, xa, zb), screenY(cam, zb));
      ctx.closePath();
    };
    // Edge lines follow the road's bend, so they are cut into short pieces, denser up close.
    const pieces = (x: number, half: number, color: string): void => {
      ctx.fillStyle = color;
      ctx.beginPath();
      let z = Math.max(nearZ, -8);
      while (z < far) {
        const next = z + Math.max(1.5, (z + 8) * 0.32);
        quad(x - half, x + half, z, Math.min(far, next));
        z = next;
      }
      ctx.fill();
    };
    pieces(-1.5, 0.032, look.edgeLeft);
    pieces(1.5, 0.032, look.laneLine);
    // Lane dashes, every 7 units, with a sliver of wear out of each.
    const period = 7;
    const dash = 3.4;
    const phase = distance % period;
    ctx.fillStyle = look.laneLine;
    ctx.beginPath();
    for (let k = Math.floor(nearZ / period) - 1; k < 110 / period; k += 1) {
      const za = k * period - phase;
      const zb = za + dash;
      if (zb < nearZ) {
        continue;
      }
      const a = Math.max(za, nearZ);
      for (const x of [-0.5, 0.5]) {
        const mid = (a + zb) / 2;
        quad(x - 0.028, x + 0.028, a, mid);
        quad(x - 0.028, x + 0.028, mid, zb);
      }
    }
    ctx.fill();
  }

  /** Scenery beyond the guardrails: slots along the road, a cluster or a quiet gap in each, the same for the same road. */
  collect(ctx: Ctx, cam: Camera, distance: number, seed: number, minZ: number, items: Drawable[], signAt: (z: number) => number): void {
    const look = this.look;
    const kit = KITS[this.mood];
    const fade = (z: number): number => Math.max(0, Math.min(1, (170 - z) / 60));
    const piece = (name: string, side: number, x: number, z: number, size: number, shadow: number): void => {
      if (z < minZ || z > 170) {
        return;
      }
      items.push({
        z,
        draw: () => {
          const sprite = art(`w.${name}`);
          if (sprite === null) {
            return;
          }
          const lane = laneAt(cam, z);
          // 3 model units to a lane, so a tree is about two lanes tall.
          const k = ((lane / 3) * size) / sprite.ppu;
          const sx = screenX(cam, x, z);
          const sy = screenY(cam, z);
          const alpha = fade(z);
          ctx.globalAlpha = alpha;
          if (shadow > 0 && lane > 7) {
            const rx = Math.min(sprite.w * k * 0.56, lane * 0.9);
            softShadow(ctx, sx, sy, rx, Math.max(1.5, rx * 0.2), 0.2 * alpha);
            ctx.globalAlpha = alpha;
          }
          // Things on the left are the mirror image, so their fronts still face the road.
          const source = tinted(sprite, look.tint);
          if (side > 0) {
            ctx.save();
            ctx.translate(sx, sy);
            ctx.scale(-1, 1);
            ctx.drawImage(source, -sprite.ax * k, -sprite.ay * k, sprite.w * k, sprite.h * k);
            ctx.restore();
          } else {
            ctx.drawImage(source, sx - sprite.ax * k, sy - sprite.ay * k, sprite.w * k, sprite.h * k);
          }
          ctx.globalAlpha = 1;
        },
      });
    };

    const base = Math.floor(distance / SLOT);
    const count = this.quality === 2 ? 9 : 13;
    for (let k = -1; k < count; k += 1) {
      const index = base + k;
      const z = index * SLOT - distance;
      for (const side of [-1, 1]) {
        const r = hash(index * 2 + (side > 0 ? 1 : 0) + seed);
        // Pacing: some slots are left open, so the clusters read as places.
        if (r < 0.2) {
          continue;
        }
        const cluster = kit[Math.floor(hash(index * 5 + side + seed) * kit.length)];
        for (const [name, out, along, size] of cluster) {
          piece(name, side, side * (2.9 + out), z + along, size * (0.92 + r * 0.16), 1);
        }
      }
    }
    // Far layer: single silhouettes out across the fields.
    const far = FAR[this.mood];
    const farBase = Math.floor(distance / FAR_SLOT);
    const farCount = this.quality === 2 ? 4 : 6;
    for (let k = 0; k < farCount; k += 1) {
      const index = farBase + k;
      const z = index * FAR_SLOT - distance + 8;
      for (const side of [-1, 1]) {
        const r = hash(index * 7 + (side > 0 ? 3 : 0) + seed + 77);
        if (r < 0.14) {
          continue;
        }
        const [name, size] = far[Math.floor(r * 4111) % far.length];
        piece(name, side, side * (6.6 + r * 5.5), z, size * (0.9 + r * 0.25), 0.5);
      }
    }
    // An overpass now and then near town: it crosses high over the road, like the gantries.
    if (this.mood === 'town') {
      const spanEvery = 340;
      const n = Math.floor(distance / spanEvery) + 1;
      const z = n * spanEvery - distance - 40;
      if (z > 2 && z < 150) {
        items.push({
          z,
          draw: () => {
            const sprite = art('w.overpass');
            if (sprite === null) {
              return;
            }
            const lane = laneAt(cam, z);
            const k = ((lane * 8) / 19) / sprite.ppu;
            ctx.globalAlpha = Math.max(0, Math.min(1, (150 - z) / 40)) * (z < 12 ? z / 12 : 1);
            ctx.drawImage(tinted(sprite, look.tint), screenX(cam, 0, z) - sprite.ax * k, screenY(cam, z) - sprite.ay * k, sprite.w * k, sprite.h * k);
            ctx.globalAlpha = 1;
          },
        });
      }
    }
    // A sign or km post on the right, every so often.
    const signSpacing = 97;
    const signBase = Math.floor(distance / signSpacing);
    const signs: [string, number][] = [['kmpost', 0.9], ['signYellow', 1.0], ['kmpost', 0.9], ['sos', 1.0], ['signExit', 1.1]];
    for (let k = 0; k < 2; k += 1) {
      const index = signBase + k;
      const z = index * signSpacing - distance + 40;
      const [name, size] = signs[index % signs.length];
      piece(name, -1, signAt(z), z, size, 0.5);
    }
  }

  /** Rain: short slanted streaks, one batched path. Hazards stay readable: thin, pale, never across the near road in a sheet. */
  drawRain(ctx: Ctx, cam: Camera, dt: number, strength: number, reduceMotion: boolean): void {
    if (strength <= 0) {
      return;
    }
    const n = reduceMotion ? 16 : 46;
    while (this.rain.length < n) {
      this.rain.push({ x: Math.random() * (cam.width + 40), y: Math.random() * cam.height, v: 520 + Math.random() * 280, len: 10 + Math.random() * 14 });
    }
    ctx.strokeStyle = `rgba(226,236,240,${0.34 * strength})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < n; i += 1) {
      const d = this.rain[i];
      d.y += d.v * dt;
      d.x -= d.v * dt * 0.14;
      if (d.y > cam.height) {
        d.y = -10;
        d.x = Math.random() * (cam.width + 40);
      }
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x + d.len * 0.14, d.y - d.len);
    }
    ctx.stroke();
  }

  dispose(): void {
    this.road = null;
    this.fields = null;
    this.background = null;
  }
}

export { blitClay };
export type { ClaySprite };
void bendAt;
