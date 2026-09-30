/**
 * Vehicle paint for the corridor diagram.
 *
 * Ported from the dashboard's traffic canvas
 * (`Front-End-Dashboard/app/dashboard/ai-sandbox/vehiclePaint.ts` on the
 * Main-Dashboard branch) so the two products draw the same road. The colours
 * and the weighting are taken from there verbatim; what differs is how they
 * are applied - the dashboard paints a real canvas gradient, and this has to
 * build the same shading out of flat views.
 *
 * The mix follows what is actually on a road: mostly white, silver, grey and
 * black cars, then blues and reds, and a few greens, beiges, yellows and
 * oranges. Buses and truck cabs wear liveries; trailers are mostly white or
 * silver.
 */

export interface Paint {
  /** Highlight side of the body shading. */
  hi: string;
  /** Shadow side of the body shading. */
  lo: string;
  /** A lighter rim, for dark paint that would otherwise vanish into asphalt. */
  edge?: string;
  /** Glass tint, for the same reason. */
  glass?: string;
}

const RIM = 'rgba(210,220,235,0.5)';
const PALE_GLASS = 'rgba(140,158,186,0.85)';

export const PAINT_WHITE: Paint = { hi: '#ffffff', lo: '#c9d1dc' };
export const PAINT_SILVER: Paint = { hi: '#f1f5f9', lo: '#a7b2c1' };
export const PAINT_GREY: Paint = { hi: '#d3dae4', lo: '#7d8999' };
export const PAINT_CHARCOAL: Paint = {
  hi: '#7a8595',
  lo: '#2a323f',
  edge: RIM,
  glass: PALE_GLASS,
};
export const PAINT_BLACK: Paint = { hi: '#5e6877', lo: '#171d29', edge: RIM, glass: PALE_GLASS };
export const PAINT_NAVY: Paint = { hi: '#4c6db8', lo: '#1b2a5e', edge: RIM, glass: PALE_GLASS };
export const PAINT_BLUE: Paint = { hi: '#7db2ff', lo: '#1d4fd8' };
export const PAINT_RED: Paint = { hi: '#ff8a8a', lo: '#b91c1c' };
export const PAINT_GREEN: Paint = { hi: '#7ee2a8', lo: '#15803d' };
export const PAINT_BEIGE: Paint = { hi: '#f7ead0', lo: '#bfa77a' };
export const PAINT_YELLOW: Paint = { hi: '#fff08a', lo: '#d19a06' };
export const PAINT_ORANGE: Paint = { hi: '#ffc08a', lo: '#c2410c' };

/** Dark glass on light paint; the paint's own paler tint on dark paint. */
export const DEFAULT_GLASS = 'rgba(20,28,44,0.95)';
export const OUTLINE = 'rgba(9,14,28,0.8)';
export const HEADLIGHT = '#fff6bf';
/** Unlit tail lamps. Nothing on this diagram brakes, so they never light. */
export const TAILLIGHT = '#8f1d1d';

export function glassOf(paint: Paint): string {
  return paint.glass ?? DEFAULT_GLASS;
}

export function edgeOf(paint: Paint): string {
  return paint.edge ?? OUTLINE;
}

function channel(hex: string, at: number): number {
  return parseInt(hex.slice(at, at + 2), 16);
}

/**
 * A colour `t` of the way from `a` to `b`.
 *
 * The dashboard hands the canvas two stops and lets it interpolate. React
 * Native has no gradient here, so the shading is built from a few flat bands
 * and this is what fills them in - the same trick the flow sheen in
 * `CorridorRoad` already uses to look poured rather than drawn.
 */
export function mixHex(a: string, b: string, t: number): string {
  const r = Math.round(channel(a, 1) + (channel(b, 1) - channel(a, 1)) * t);
  const g = Math.round(channel(a, 3) + (channel(b, 3) - channel(a, 3)) * t);
  const bl = Math.round(channel(a, 5) + (channel(b, 5) - channel(a, 5)) * t);
  return `rgb(${r},${g},${bl})`;
}

/**
 * How many strips a shaded body is built from.
 *
 * Four is the point where the steps stop reading as stripes at these sizes,
 * and it keeps the view count sane: every extra band is another view on every
 * vehicle on screen.
 */
export const SHADE_BANDS = 4;

/** The band colours for one paint, highlight edge first. */
export function bandsFor(paint: Paint): string[] {
  return Array.from({ length: SHADE_BANDS }, (_, index) =>
    mixHex(paint.hi, paint.lo, index / (SHADE_BANDS - 1)),
  );
}
