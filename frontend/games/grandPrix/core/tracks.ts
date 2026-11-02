import type { TrackId } from './types';

/**
 * The three circuits of the Fiesta Grand Prix. Closed race tracks - not NLEX
 * - drawn in Filipino places: rice fields, a parol-lit night circuit in the
 * lantern capital, a ridge road in the Sierra Madre. A track is a loop of
 * segments; each has a length and a bend (-1 hard left .. +1 hard right),
 * eased in and out so bends never start with a jolt.
 */

export interface Segment {
  length: number;
  curve: number;
}

export type ItemKind = 'pad' | 'turbo' | 'bolts';

export interface TrackItem {
  /** Distance into the lap. */
  at: number;
  x: number;
  kind: ItemKind;
}

export interface TrackDef {
  id: TrackId;
  name: string;
  place: string;
  blurb: string;
  time: 'morning' | 'night' | 'sunset';
  props: ('palm' | 'acacia' | 'lamp' | 'banderitas' | 'bush' | 'billboard' | 'house')[];
  segments: Segment[];
  items: TrackItem[];
  /** Difficulty label shown on the menu. */
  rating: 1 | 2 | 3;
}

const straight = (length: number): Segment => ({ length, curve: 0 });
const bend = (length: number, curve: number): Segment => ({ length, curve });

export const TRACKS: Record<TrackId, TrackDef> = {
  palayan: {
    id: 'palayan',
    name: 'Palayan Circuit',
    place: 'Rice fields, Bulacan',
    blurb: 'Wide, flowing bends between green paddies. A good first race.',
    time: 'morning',
    props: ['palm', 'acacia', 'bush', 'house', 'billboard'],
    rating: 1,
    segments: [straight(130), bend(130, 0.35), straight(80), bend(150, -0.42), straight(100), bend(90, 0.5), bend(90, -0.5), straight(180)],
    items: [
      { at: 60, x: 0, kind: 'pad' },
      { at: 210, x: 0.9, kind: 'bolts' },
      { at: 330, x: -0.6, kind: 'turbo' },
      { at: 520, x: -1.0, kind: 'bolts' },
      { at: 600, x: 0.6, kind: 'pad' },
      { at: 700, x: 0.5, kind: 'turbo' },
      { at: 820, x: -0.5, kind: 'bolts' },
    ],
  },
  parol: {
    id: 'parol',
    name: 'Parol Night Circuit',
    place: 'San Fernando, Pampanga',
    blurb: 'Under giant lanterns. Tighter bends and a long back straight.',
    time: 'night',
    props: ['banderitas', 'lamp', 'palm', 'billboard'],
    rating: 2,
    segments: [straight(110), bend(120, 0.6), straight(60), bend(110, 0.55), straight(220), bend(130, -0.7), straight(70), bend(80, 0.6), bend(80, -0.6), straight(140)],
    items: [
      { at: 50, x: 0, kind: 'pad' },
      { at: 180, x: 1.0, kind: 'bolts' },
      { at: 320, x: -0.8, kind: 'turbo' },
      { at: 420, x: 0, kind: 'pad' },
      { at: 520, x: 0.8, kind: 'bolts' },
      { at: 690, x: -1.0, kind: 'turbo' },
      { at: 860, x: 0.4, kind: 'bolts' },
      { at: 980, x: 0, kind: 'pad' },
    ],
  },
  sierra: {
    id: 'sierra',
    name: 'Sierra Madre Ridge',
    place: 'Mountain road (closed for the race)',
    blurb: 'Hairpins and switchbacks at sunset. Brake-free - steer early!',
    time: 'sunset',
    props: ['acacia', 'bush', 'lamp', 'palm'],
    rating: 3,
    segments: [straight(100), bend(110, 0.85), straight(50), bend(100, -0.9), bend(90, 0.75), straight(120), bend(140, 1.0), straight(60), bend(90, -0.8), bend(90, 0.8), straight(160)],
    items: [
      { at: 40, x: 0, kind: 'pad' },
      { at: 160, x: -1.0, kind: 'bolts' },
      { at: 280, x: 0.9, kind: 'turbo' },
      { at: 470, x: 0, kind: 'pad' },
      { at: 560, x: -0.9, kind: 'turbo' },
      { at: 760, x: 1.0, kind: 'bolts' },
      { at: 950, x: 0, kind: 'turbo' },
      { at: 1040, x: -0.4, kind: 'bolts' },
    ],
  },
};

export function lapLength(track: TrackDef): number {
  return track.segments.reduce((sum, seg) => sum + seg.length, 0);
}

const EASE = 0.3;

/** The bend at a distance along the lap (any distance; wraps around). */
export function curveAt(track: TrackDef, distance: number, length = lapLength(track)): number {
  let d = ((distance % length) + length) % length;
  for (const seg of track.segments) {
    if (d < seg.length) {
      if (seg.curve === 0) {
        return 0;
      }
      const u = d / seg.length;
      // Ease in over the first 30%, out over the last 30%.
      const k = u < EASE ? u / EASE : u > 1 - EASE ? (1 - u) / EASE : 1;
      const smooth = k * k * (3 - 2 * k);
      return seg.curve * smooth;
    }
    d -= seg.length;
  }
  return 0;
}

/** The fast line: toward the inside of the bend ahead, centred on straights. */
export function idealLine(track: TrackDef, distance: number, length = lapLength(track)): number {
  let sum = 0;
  const samples = 6;
  for (let i = 0; i < samples; i += 1) {
    sum += curveAt(track, distance + 4 + i * 6, length);
  }
  const ahead = sum / samples;
  return Math.max(-1.2, Math.min(1.2, ahead * 1.6));
}

/**
 * Item boxes: rows of four across the track, at these distances into the lap
 * (on straights or gentle stretches, away from the start line and the pads).
 */
export const BOX_ROWS: Record<TrackId, number[]> = {
  palayan: [100, 455, 760],
  parol: [80, 470, 900],
  sierra: [70, 380, 680],
};
export const BOX_XS = [-1.2, -0.4, 0.4, 1.2];

/**
 * A schematic, closed outline of a track for the mini map. The race itself is
 * pseudo-3D (bends only bend the view), so there is no real map: this one
 * turns only in bends - sharper bends turn more, opposite bends turn the other
 * way - scaled so the loop closes, then fitted into a unit square. `points`
 * has one point per 1/MAP_SAMPLES of the lap, starting at the start line.
 */
export const MAP_SAMPLES = 240;

export interface TrackMap {
  points: [number, number][];
  /** Width / height of the outline (the unit square holds the longer side). */
  aspect: number;
}

const maps = new Map<TrackId, TrackMap>();

export function trackMap(track: TrackDef): TrackMap {
  const known = maps.get(track.id);
  if (known !== undefined) {
    return known;
  }
  const length = lapLength(track);
  const ds = length / MAP_SAMPLES;
  const curves: number[] = [];
  for (let i = 0; i < MAP_SAMPLES; i += 1) {
    curves.push(curveAt(track, (i + 0.5) * ds, length));
  }
  // Turn rate = b|c| + 0.5bc: every bend turns the same way (a simple loop), right-handers more.
  let sum = curves.reduce((acc, c) => acc + (Math.abs(c) + 0.5 * c) * ds, 0);
  let sign = 1;
  if (sum <= 0) {
    // A left-handed circuit: mirror, so the loop still closes.
    sign = -1;
    sum = curves.reduce((acc, c) => acc + (Math.abs(c) - 0.5 * c) * ds, 0);
  }
  const b = (Math.PI * 2) / sum;
  let heading = -Math.PI / 2;
  let x = 0;
  let y = 0;
  const raw: [number, number][] = [[0, 0]];
  for (let i = 0; i < MAP_SAMPLES; i += 1) {
    const c = curves[i] * sign;
    heading += b * (Math.abs(c) + 0.5 * c) * ds * 0.5;
    x += Math.cos(heading) * ds;
    y += Math.sin(heading) * ds;
    heading += b * (Math.abs(c) + 0.5 * c) * ds * 0.5;
    raw.push([x, y]);
  }
  // Close the loop: spread the leftover gap along the lap.
  const [ex, ey] = raw[MAP_SAMPLES];
  const closed = raw.slice(0, MAP_SAMPLES).map(([px, py], i): [number, number] => [px - (ex * i) / MAP_SAMPLES, py - (ey * i) / MAP_SAMPLES]);
  const xs = closed.map((p) => p[0]);
  const ys = closed.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const w = Math.max(...xs) - minX;
  const h = Math.max(...ys) - minY;
  const size = Math.max(w, h) || 1;
  const map: TrackMap = {
    points: closed.map(([px, py]) => [(px - minX + (size - w) / 2) / size, (py - minY + (size - h) / 2) / size]),
    aspect: h > 0 ? w / h : 1,
  };
  maps.set(track.id, map);
  return map;
}

/** Where a race distance lies on the mini map (0-1 in both axes). */
export function mapPoint(map: TrackMap, distance: number, length: number): [number, number] {
  const u = ((((distance % length) + length) % length) / length) * MAP_SAMPLES;
  const i = Math.floor(u) % MAP_SAMPLES;
  const j = (i + 1) % MAP_SAMPLES;
  const k = u - Math.floor(u);
  const a = map.points[i];
  const c = map.points[j];
  return [a[0] + (c[0] - a[0]) * k, a[1] + (c[1] - a[1]) * k];
}
