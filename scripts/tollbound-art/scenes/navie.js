/**
 * Navie: the road-trip lead, built to the approved reference (Team screen, 5 Nov). A compact,
 * rounded blue car wearing the cap. Top to bottom on the front: cap with the blue N, white
 * windscreen with the eyes, open smile on the blue hood between the lamps, white N below it.
 * From behind the cap shows panel seams, the white-edged opening, the strap and a small badge,
 * so it reads as a cap on the road and not a dome.
 */
const { sphere, ell, box, cyl, cap, slant, sub, paint } = require('../sdf');
const { windowPaint, windowGlint, CREAM } = require('./polish');

const BLUE = '#2B6CDB';
const BLUE_DEEP = '#2257BC';
const TYRE = '#2E2B42';
const HUB = '#C3CCE8';
const CAP_BLUE = '#2A66D4';
const SEAM = '#2254B4';
const WHITE = '#FAF7F0';
const BODY = { color: BLUE, mat: 'painted', g: 'body' };

/** The letter N painted across a surface, as seen from the front (+z) or the back (-z). h and w: half its height and width; t: half a stroke. */
function letterN(x, y, z, h, w, t, color, mat, viewedFromBehind, on) {
  const slope = (w - t) / h;
  return [
    paint(box(t, h, 0.6, t * 0.3, { at: [x - w + t, y, z], color, mat, soft: 0.012, on })),
    paint(box(t, h, 0.6, t * 0.3, { at: [x + w - t, y, z], color, mat, soft: 0.012, on })),
    // Level ends, flush with the tops and bottoms of the stems: no spurs and no notches.
    paint(slant(t * 1.3, h, viewedFromBehind ? -slope : slope, 0.6, { at: [x, y, z], color, mat, soft: 0.012, on })),
  ];
}

/** A chunky tyre with a plain soft hub. */
function chunky(x, z, r, width) {
  const id = `w${x}${z}`;
  return [
    cyl(r, width, r * 0.34, { at: [x, r, z], rot: [0, 0, 90], color: TYRE, mat: 'tread', g: id, k: 0 }),
    cyl(r * 0.46, width + 0.03, r * 0.14, { at: [x, r, z], rot: [0, 0, 90], color: HUB, mat: 'painted', g: `${id}h`, k: 0 }),
  ];
}

/** Round blue ball mirrors on short stalks, with a little pale glass facing back at the road behind. */
function ballMirrors() {
  const out = [];
  for (const s of [-1, 1]) {
    out.push(sphere(0.31, { at: [s * 1.62, 2.04, 0.96], color: BLUE, mat: 'painted', g: `mir${s}`, k: 0 }));
    out.push(ell(0.2, 0.2, 0.05, { at: [s * 1.62, 2.04, 0.68], color: '#CFDDEE', mat: 'pane', g: `mirG${s}`, k: 0 }));
    out.push(cap([s * 1.2, 1.98, 0.92], [s * 1.5, 2.02, 0.96], 0.12, { color: BLUE, mat: 'painted', g: `mirS${s}`, k: 0 }));
  }
  return out;
}

/** The whole car, front and back. `front` adds what only the front shows: the pale screen. Its face is sculpted on from the spec below. */
function navie(front = false) {
  return [
    // The loaf of the body: soft, wide at the hips, a short bulb of a hood.
    box(1.66, 0.5, 1.9, 0.46, { ...BODY, at: [0, 1.2, 0], k: 0.1 }),
    ell(1.62, 0.66, 1.0, { ...BODY, at: [0, 1.24, 1.18], k: 0.5 }),
    ell(1.5, 0.8, 0.92, { ...BODY, at: [0, 1.24, -1.28], k: 0.4 }),
    ...[-1, 1].flatMap((s) => [
      ell(0.62, 0.56, 0.96, { ...BODY, at: [s * 1.1, 1.2, 1.16], k: 0.34 }),
      ell(0.62, 0.56, 0.96, { ...BODY, at: [s * 1.1, 1.2, -1.2], k: 0.34 }),
    ]),
    // The cabin, close over the hood: compact, not stretched.
    box(1.42, 0.92, 1.42, 0.62, { ...BODY, at: [0, 2.36, 0.16], k: 0.3, taper: 0.1 }),
    // Arches that leave the nose whole: the hood wraps down to the bumper in front of each wheel.
    ...[-1, 1].flatMap((s) => [0.92, -1.2].map((z) => sub(cyl(0.94, 0.6, 0.12, { at: [s * 1.72, 0.68, z], rot: [0, 0, 90], g: 'body', k: 0.1 })))),
    ...[-1, 1].flatMap((s) => [...chunky(s * 1.36, 0.92, 0.74, 0.4), ...chunky(s * 1.36, -1.2, 0.74, 0.4)]),
    // One plump bumper wrapping the nose, in the body's own blue; a deeper one at the back.
    cap([-0.92, 0.74, 2.08], [0.92, 0.74, 2.08], 0.15, { ...BODY, k: 0.06 }),
    cap([0.92, 0.74, 2.08], [1.26, 0.76, 1.74], 0.14, { ...BODY, k: 0.06 }),
    cap([-0.92, 0.74, 2.08], [-1.26, 0.76, 1.74], 0.14, { ...BODY, k: 0.06 }),
    box(1.34, 0.2, 0.24, 0.19, { at: [0, 0.7, -2.12], color: BLUE_DEEP, mat: 'painted', g: 'rb', k: 0 }),
    // The white windscreen is the face: broad and rounded, a little narrower at the top. Rear views see only the frame.
    ...(front ? [paint(box(1.18, 0.54, 1.3, 0.32, { at: [0, 2.38, 0.8], color: WHITE, mat: 'soft', soft: 0.028, on: 'body', taper: 0.1 }))] : []),
    windowPaint(0.9, 0.46, 0.5, [0, 2.32, -1.2], '#1E3F7C', 0.3, 'body'),
    ...windowGlint(-0.42, 2.34, -1.2, 0.4, 'body'),
    windowPaint(0.56, 0.38, 0.62, [1.38, 2.34, -0.1], '#2152AE', 0.26, 'body'),
    windowPaint(0.56, 0.38, 0.62, [-1.38, 2.34, -0.1], '#2152AE', 0.26, 'body'),
    // The back: candy tail lights, a small cream plate with the N, and two soft reflectors.
    ...[-1, 1].flatMap((s) => [paint(sphere(0.27, { at: [s * 0.84, 1.42, -2.16], color: '#8E2A34', mat: 'painted', soft: 0.014, on: 'body' })), ell(0.225, 0.215, 0.1, { at: [s * 0.84, 1.42, -2.2], rot: [0, s * 22, 0], color: '#F04B3F', mat: 'lamp', g: `tl${s}`, k: 0, solo: true })]),
    box(0.46, 0.18, 0.06, 0.08, { at: [0, 1.12, -2.28], color: CREAM, mat: 'soft', g: 'plate', k: 0 }),
    ...letterN(0, 1.12, -2.38, 0.1, 0.13, 0.034, BLUE_DEEP, 'soft', true, 'plate'),
    ...ballMirrors(),
    // The white N on the nose, below the mouth, thick and plain.
    ...letterN(0, 1.03, 1.9, 0.13, 0.18, 0.05, '#FFFFFF', 'soft', false, 'body'),
    // The cap: a full crown cut at its band, sitting snugly on the cabin.
    ell(1.5, 1.0, 1.56, { at: [0, 3.16, 0.08], color: CAP_BLUE, mat: 'felt', g: 'cap', k: 0.08 }),
    sub(box(2.6, 0.9, 2.6, 0.05, { at: [0, 2.04, 0.08], g: 'cap', k: 0.04 })),
    // Its opening at the back: a small half-moon with a white edge and a dark inside, and the strap across.
    sub(ell(0.32, 0.29, 0.5, { at: [0, 3.24, -1.46], g: 'cap', k: 0.03 })),
    cap([-0.32, 3.28, -1.2], [0.32, 3.28, -1.2], 0.06, { color: WHITE, mat: 'felt', g: 'strap', k: 0 }),
    // Six panels: seams running down from the button.
    ...[0, 60, 120].map((a) => paint(box(0.028, 1.6, 1.86, 0.01, { at: [0, 3.7, 0.08], rot: [0, a, 0], color: SEAM, mat: 'felt', soft: 0.018, on: 'cap' }))),
    paint(ell(0.4, 0.37, 0.62, { at: [0, 3.24, -1.46], color: WHITE, mat: 'felt', soft: 0.012, on: 'cap' })),
    paint(ell(0.33, 0.3, 0.52, { at: [0, 3.24, -1.46], color: '#1E3F73', mat: 'felt', soft: 0.012, on: 'cap' })),
    // Its big white front panel, then the ring and the thick blue N.
    paint(ell(1.24, 1.02, 1.2, { at: [0, 3.56, 1.0], color: WHITE, mat: 'felt', soft: 0.022, on: 'cap' })),
    paint(sphere(0.54, { at: [0, 3.64, 1.36], color: CAP_BLUE, mat: 'felt', soft: 0.014, on: 'cap' })),
    paint(sphere(0.43, { at: [0, 3.64, 1.36], color: WHITE, mat: 'felt', soft: 0.014, on: 'cap' })),
    ...letterN(0, 3.64, 1.36, 0.215, 0.27, 0.078, CAP_BLUE, 'felt', false, 'cap'),
    // A small badge over the opening at the back: the same mark, so the cap is Navie's from behind too.
    paint(sphere(0.25, { at: [0, 3.84, -1.08], color: WHITE, mat: 'felt', soft: 0.015, on: 'cap' })),
    ...letterN(0, 3.84, -1.12, 0.115, 0.145, 0.038, CAP_BLUE, 'felt', true, 'cap'),
    // The wide curved visor, one smooth arc lower at its edges than in the middle, wider than the crown.
    ell(1.68, 0.16, 1.26, { at: [0, 3.12, 1.36], bend: 0.14, color: CAP_BLUE, mat: 'felt', g: 'visor', k: 0 }),
    sphere(0.18, { at: [0, 4.19, 0.02], color: WHITE, mat: 'felt', g: 'btn', k: 0 }),
    paint(box(2, 0.045, 2, 0.01, { at: [0, 3.05, 0.08], color: SEAM, mat: 'felt', soft: 0.014, on: 'cap' })),
  ];
}

module.exports = {
  navie: {
    parts: () => navie(false),
    face: { eyes: [[-0.54, 2.32, 1.58], [0.54, 2.32, 1.58]], mouth: [0, 1.4, 2.1], eye: 0.33 },
    sculpt: {
      parts: () => navie(true),
      eyes: [[-0.54, 2.32, 1.58], [0.54, 2.32, 1.58]],
      eye: 0.33,
      wide: 0.82,
      roll: 0,
      dimple: 0,
      eyeDepth: 0.2,
      eyeColor: '#14213F',
      iris: { color: '#2E78DA', deep: '#17478F', light: '#79BDF2', pupil: '#0E1C3C' },
      openMouth: { y: 1.64, z: 2.1, w: 0.45, h: 0.39, lift: 0.07, depth: 0.2, on: 'body' },
      cheek: { color: '#F69CA2', r: 0.22, dx: 0.42, dy: -0.56, soft: 0.022 },
      lamps: { x: 1.06, y: 1.2, z: 1.92, r: 0.2, ring: 1.34, color: '#F4E7BC', hot: '#FCF6DC', seat: '#FBFAF8' },
    },
  },
};
