/**
 * Km posts along the real NLEX alignment, both ways: a point on the map to its
 * km post, and a km post (or a stretch between two) back to the road.
 *
 * Built on the same centreline the map draws (corridorGuard over
 * nlex-geometry.json, never the dim_location chords), anchored on the twenty
 * exits' km posts from lib/nlex-exits.ts. Between two exits a km post is
 * interpolated by distance along the road, which is what a km post is.
 *
 * Used by the Live Map's new graphics only: the corridor strip, the strip/map
 * hover link, maintenance closures (stored as start/end km) and the jam
 * callouts. Read-only; nothing here changes what the map already draws.
 */
import nlexGeometry from "./nlex-geometry.json";
import { corridorGuard, type LngLat } from "../../lib/corridor-shape";
import { FALLBACK_EXITS } from "../../lib/nlex-exits";

const M_LON = 111320 * Math.cos((15 * Math.PI) / 180);
const M_LAT = 110574;

export type KmExit = { name: string; km: number; arc: number; lngLat: LngLat };

export type KmScale = {
  centreline: LngLat[];
  /** Exits south to north with their km post and distance along the line. */
  exits: KmExit[];
  kmStart: number;
  kmEnd: number;
  /** Km post of the nearest point on the corridor, and how far off it the point is. */
  locate: (p: number[]) => { km: number; metresOff: number; at: LngLat };
  pointAtKm: (km: number) => LngLat;
  /** The centreline between two km posts (either order), ends interpolated. */
  sliceKm: (a: number, b: number) => LngLat[];
};

let cached: KmScale | null = null;

export function corridorKm(): KmScale {
  if (cached) return cached;
  const byKm = [...FALLBACK_EXITS].sort((a, b) => a.km - b.km);
  const guard = corridorGuard(
    (nlexGeometry as unknown as { coordinates: LngLat[] }).coordinates,
    byKm.map((e) => [e.longitude, e.latitude] as LngLat),
  );
  const line = guard.centreline;
  const xy = line.map((c) => [c[0] * M_LON, c[1] * M_LAT] as const);
  const arc: number[] = [0];
  for (let i = 1; i < xy.length; i++) arc.push(arc[i - 1] + Math.hypot(xy[i][0] - xy[i - 1][0], xy[i][1] - xy[i - 1][1]));
  const lats = line.map((c) => c[1]);

  /* The line runs south to north, so latitude indexes it; a window around the
     matching latitude finds the nearest stretch without sweeping all of it. */
  const WINDOW = 60;
  const windowAround = (lat: number): [number, number] => {
    let lo = 0;
    let hi = lats.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (lats[mid] < lat) lo = mid + 1;
      else hi = mid;
    }
    return [Math.max(1, lo - WINDOW), Math.min(xy.length - 1, lo + WINDOW)];
  };

  const nearest = (p: number[]): { arc: number; d: number; at: LngLat } => {
    const qx = p[0] * M_LON;
    const qy = p[1] * M_LAT;
    let best = { arc: 0, d: Infinity, at: line[0] as LngLat };
    const [from, to] = windowAround(p[1]);
    for (let i = from; i <= to; i++) {
      const [ax, ay] = xy[i - 1];
      const vx = xy[i][0] - ax;
      const vy = xy[i][1] - ay;
      const len2 = vx * vx + vy * vy;
      let t = len2 ? ((qx - ax) * vx + (qy - ay) * vy) / len2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const d = Math.hypot(qx - ax - t * vx, qy - ay - t * vy);
      if (d < best.d) {
        best = {
          arc: arc[i - 1] + (arc[i] - arc[i - 1]) * t,
          d,
          at: [line[i - 1][0] + (line[i][0] - line[i - 1][0]) * t, line[i - 1][1] + (line[i][1] - line[i - 1][1]) * t],
        };
      }
    }
    return best;
  };

  const exits: KmExit[] = byKm.map((e) => {
    const n = nearest([e.longitude, e.latitude]);
    return { name: e.exit_name, km: e.km, arc: n.arc, lngLat: [e.longitude, e.latitude] };
  });

  const kmOfArc = (s: number): number => {
    if (s <= exits[0].arc) return exits[0].km;
    for (let i = 1; i < exits.length; i++) {
      if (s <= exits[i].arc) {
        const a = exits[i - 1];
        const b = exits[i];
        const span = b.arc - a.arc || 1;
        return a.km + ((s - a.arc) / span) * (b.km - a.km);
      }
    }
    return exits[exits.length - 1].km;
  };

  const arcOfKm = (km: number): number => {
    if (km <= exits[0].km) return exits[0].arc;
    for (let i = 1; i < exits.length; i++) {
      if (km <= exits[i].km) {
        const a = exits[i - 1];
        const b = exits[i];
        const span = b.km - a.km || 1;
        return a.arc + ((km - a.km) / span) * (b.arc - a.arc);
      }
    }
    return exits[exits.length - 1].arc;
  };

  const pointAtArc = (s: number): LngLat => {
    let lo = 1;
    let hi = arc.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (arc[mid] < s) lo = mid + 1;
      else hi = mid;
    }
    const i = Math.max(1, lo);
    const span = arc[i] - arc[i - 1] || 1;
    const t = Math.min(1, Math.max(0, (s - arc[i - 1]) / span));
    return [line[i - 1][0] + (line[i][0] - line[i - 1][0]) * t, line[i - 1][1] + (line[i][1] - line[i - 1][1]) * t];
  };

  cached = {
    centreline: line,
    exits,
    kmStart: exits[0].km,
    kmEnd: exits[exits.length - 1].km,
    locate: (p) => {
      const n = nearest(p);
      return { km: kmOfArc(n.arc), metresOff: n.d, at: n.at };
    },
    pointAtKm: (km) => pointAtArc(arcOfKm(km)),
    sliceKm: (a, b) => {
      const lo = arcOfKm(Math.min(a, b));
      const hi = arcOfKm(Math.max(a, b));
      const pts: LngLat[] = [pointAtArc(lo)];
      for (let i = 0; i < arc.length; i++) if (arc[i] > lo && arc[i] < hi) pts.push(line[i]);
      pts.push(pointAtArc(hi));
      return pts;
    },
  };
  return cached;
}
