/** Shared pieces for the vehicle and creature models, so the whole roster is built the same way. */
const { sphere, ell, box, cyl, cap, sub, paint, tor } = require('../sdf');

const INK = '#354844';
const RUBBER = '#2F3A40';
const GLASS = '#2B3F57';
const CREAM = '#F8EDD8';

/** One chunky wheel on the side given by the sign of x. */
function wheel(x, z, r = 0.62, width = 0.3, hub = '#C9D2CC', g = null) {
  const id = g || `w${x}${z}`;
  return [
    cyl(r, width, 0.15, { at: [x, r, z], rot: [0, 0, 90], color: RUBBER, mat: 'rubber', g: id, k: 0 }),
    cyl(r * 0.5, width + 0.03, 0.08, { at: [x, r, z], rot: [0, 0, 90], color: hub, mat: 'paint', g: `${id}h`, k: 0 }),
  ];
}

/** Four wheels. */
function wheels(track, front, rear, r, width, hub) {
  return [
    ...wheel(track, front, r, width, hub),
    ...wheel(-track, front, r, width, hub),
    ...wheel(track, rear, r, width, hub),
    ...wheel(-track, rear, r, width, hub),
  ];
}

/** Cuts the four wheel arches out of a body group. */
function arches(group, x, front, rear, r) {
  const a = [];
  for (const z of [front, rear]) {
    for (const s of [-1, 1]) {
      a.push(sub(cyl(r, 0.8, 0.12, { at: [s * x, r * 0.72, z], rot: [0, 0, 90], g: group, k: 0.08 })));
    }
  }
  return a;
}

/** A pair of round headlights on the nose. */
function headlights(x, y, z, r = 0.32, color = '#EEF5F2') {
  return [
    ell(r, r, 0.13, { at: [x, y, z], color, mat: 'glass', g: `hlA${x}`, k: 0 }),
    ell(r, r, 0.13, { at: [-x, y, z], color, mat: 'glass', g: `hlB${x}`, k: 0 }),
  ];
}

/** A pair of tail lights on the back, as chunky blocks. */
function tailLights(x, y, z, color = '#CF5B4C', hx = 0.28, hy = 0.16) {
  return [
    box(hx, hy, 0.08, 0.06, { at: [x, y, z], color, mat: 'paint', g: `tlA${x}`, k: 0 }),
    box(hx, hy, 0.08, 0.06, { at: [-x, y, z], color, mat: 'paint', g: `tlB${x}`, k: 0 }),
  ];
}

/** A side mirror pair: stalk and a rounded ear. */
function mirrors(x, y, z, color, stalk = '#57707A') {
  const out = [];
  for (const s of [-1, 1]) {
    out.push(ell(0.27, 0.19, 0.14, { at: [s * x, y, z], color, mat: 'paint', g: `mir${s}`, k: 0 }));
    out.push(cap([s * (x - 0.5), y - 0.04, z], [s * (x - 0.18), y, z], 0.06, { color: stalk, g: `mirS${s}`, k: 0 }));
  }
  return out;
}

/** A painted window panel on a body group (colour only; the shape stays). */
function windowPaint(hx, hy, hz, at, color = GLASS, r = 0.14) {
  return paint(box(hx, hy, hz, r, { at, color, mat: 'glass', soft: 0.014 }));
}

/** Two soft cheek marks. */
function cheeks(x, y, z, color = '#E5A49A', r = 0.17) {
  return [paint(sphere(r, { at: [x, y, z], color, mat: 'clay', soft: 0.06 })), paint(sphere(r, { at: [-x, y, z], color, mat: 'clay', soft: 0.06 }))];
}

/** A little hover cushion for a flying companion: a soft shadowy pad of air, never a ring. */
function puff(at, r, color = '#FFFFFF') {
  return [ell(r, r * 0.45, r, { at, color, mat: 'fabric', g: `pf${at[0]}`, k: 0 })];
}

/**
 * The camera angles every character is baked from. Rear matches the road camera's
 * height (about 25 degrees over the car at the hero's distance); the turned rear
 * is mirrored at run time for the other side.
 */
const VIEWS = {
  rear: { yaw: 0, pitch: 24 },
  rearMid: { yaw: 7.5, pitch: 24 },
  rearTurn: { yaw: 15, pitch: 24 },
  front: { yaw: 162, pitch: 9 },
};

void tor;
module.exports = { INK, RUBBER, GLASS, CREAM, wheel, wheels, arches, headlights, tailLights, mirrors, windowPaint, cheeks, puff, VIEWS };
