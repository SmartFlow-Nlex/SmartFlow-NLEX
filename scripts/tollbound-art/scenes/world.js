/**
 * The world kit: traffic, hazards, Barrikada's gang, pick-ups, scenery, the hills
 * and the boss machines. Four things must never be confused on the road, and are
 * told apart by shape first: ordinary traffic (plain, no faces), road hazards
 * (orange and striped, low), the gang's bots (violet, on legs, with eyes, facing
 * you) and pick-ups (small, floating, gold or bright).
 */
const { sphere, ell, box, cyl, cap, cone, tor, sub, paint } = require('../sdf');
const { wheels, arches, tailLights, windowPaint, RUBBER, GLASS, CREAM } = require('./kit');

const GOLD = '#E9B54C';

// ---- traffic: plain, polite and faceless ------------------------------------------

function carBody(color, shape) {
  const deep = '#3A3F44';
  const parts = [
    ...wheels(1.2, 1.4, -1.4, 0.54, 0.26, '#B9C0C0'),
    box(0.9 + 0.3, 0.16, 0.2, 0.13, { at: [0, 0.68, -2.26], color: deep, g: 'rb', k: 0 }),
    ...tailLights(0.92, 1.26, -2.3, '#C9503F', 0.28, 0.13),
    box(0.42, 0.11, 0.03, 0.02, { at: [0, 0.98, -2.32], color: '#EDE7D8', mat: 'paper', g: 'plate', k: 0 }),
  ];
  if (shape === 'sedan') {
    parts.push(
      box(1.36, 0.56, 2.26, 0.44, { at: [0, 1.04, 0], color, mat: 'paint', g: 'body', k: 0.08 }),
      ...arches('body', 1.36, 1.4, -1.4, 0.72),
      box(1.14, 0.56, 1.14, 0.44, { at: [0, 2.0, -0.18], color, mat: 'paint', g: 'cab', k: 0.16, taper: 0.14 }),
      windowPaint(0.92, 0.34, 0.3, [0, 2.0, -1.2]),
      windowPaint(0.4, 0.3, 0.76, [1.1, 2.04, -0.18]),
      windowPaint(0.4, 0.3, 0.76, [-1.1, 2.04, -0.18]),
    );
  } else if (shape === 'hatch') {
    parts.push(
      box(1.34, 0.62, 2.1, 0.5, { at: [0, 1.1, 0], color, mat: 'paint', g: 'body', k: 0.08 }),
      ...arches('body', 1.34, 1.4, -1.4, 0.72),
      box(1.2, 0.72, 1.42, 0.5, { at: [0, 2.14, -0.42], color, mat: 'paint', g: 'cab', k: 0.16, taper: 0.1 }),
      windowPaint(0.94, 0.42, 0.3, [0, 2.2, -1.76]),
      windowPaint(0.4, 0.34, 0.9, [1.14, 2.22, -0.4]),
      windowPaint(0.4, 0.34, 0.9, [-1.14, 2.22, -0.4]),
    );
  } else {
    // A boxy service van.
    parts.push(
      box(1.36, 1.1, 2.24, 0.42, { at: [0, 1.64, 0], color, mat: 'paint', g: 'body', k: 0.08 }),
      ...arches('body', 1.36, 1.4, -1.4, 0.72),
      windowPaint(0.84, 0.34, 0.3, [0, 2.2, -2.2]),
      paint(box(0.03, 0.9, 0.4, 0.01, { at: [0, 1.6, -2.22], color: deep, mat: 'paint', soft: 0.01 })),
    );
  }
  return parts;
}

function truck() {
  const CAB = '#6F8FA8';
  const LOAD = '#E7DCC4';
  return [
    box(1.46, 1.74, 2.7, 0.2, { at: [0, 2.44, -0.2], color: LOAD, mat: 'paint', g: 'box', k: 0 }),
    paint(box(1.6, 0.17, 2.9, 0.02, { at: [0, 1.2, -0.2], color: '#C9704C', mat: 'paint', soft: 0.012 })),
    paint(box(0.03, 1.7, 0.3, 0.01, { at: [0, 2.44, -2.9], color: '#B7A98C', mat: 'paint', soft: 0.01 })),
    ...[-0.7, 0.7].map((x) => cap([x, 1.1, -2.94], [x, 3.8, -2.94], 0.03, { color: '#8C8270', mat: 'metal', g: `bar${x}`, k: 0 })),
    box(1.3, 0.2, 3.1, 0.1, { at: [0, 0.74, -0.2], color: '#44494E', g: 'frame', k: 0 }),
    box(1.32, 0.9, 0.7, 0.3, { at: [0, 1.7, 3.1], color: CAB, mat: 'paint', g: 'cab', k: 0 }),
    ...wheels(1.26, 2.2, -1.9, 0.6, 0.32, '#B9C0C0'),
    box(1.2, 0.13, 0.13, 0.08, { at: [0, 0.82, -3.02], color: '#C9503F', g: 'rb', k: 0 }),
    ...tailLights(0.96, 0.9, -3.0, '#C9503F', 0.22, 0.1),
  ];
}

function bus() {
  const BODY = '#D9C080';
  const STRIPE = '#3E74B9';
  return [
    box(1.5, 1.86, 3.1, 0.5, { at: [0, 2.3, 0], color: BODY, mat: 'paint', g: 'body', k: 0 }),
    paint(box(1.7, 0.2, 3.3, 0.02, { at: [0, 1.46, 0], color: STRIPE, mat: 'paint', soft: 0.012 })),
    windowPaint(1.14, 0.6, 0.3, [0, 3.0, -3.06], GLASS, 0.2),
    ...[-2, -0.8, 0.4, 1.6].flatMap((z) => [windowPaint(0.4, 0.5, 0.5, [1.46, 3.0, z], GLASS, 0.12), windowPaint(0.4, 0.5, 0.5, [-1.46, 3.0, z], GLASS, 0.12)]),
    ...wheels(1.34, 1.9, -1.9, 0.62, 0.3, '#B9C0C0'),
    ...tailLights(1.12, 1.2, -3.12, '#C9503F', 0.2, 0.2),
    box(1.36, 0.16, 0.16, 0.12, { at: [0, 0.72, -3.14], color: '#4A4F54', g: 'rb', k: 0 }),
  ];
}

// ---- road hazards: low, orange, striped ---------------------------------------------

function roadCone() {
  return [
    box(0.62, 0.05, 0.62, 0.05, { at: [0, 0.05, 0], color: '#42484E', mat: 'rubber', g: 'base', k: 0 }),
    cone(0.5, 0.09, 0.94, { at: [0, 1.02, 0], color: '#E07B3A', mat: 'paint', g: 'cone', k: 0 }),
    paint(cone(0.4, 0.3, 0.17, { at: [0, 1.14, 0], color: '#F8F2E4', mat: 'paint', soft: 0.01 })),
    sphere(0.1, { at: [0, 1.96, 0], color: '#E07B3A', mat: 'paint', g: 'tip', k: 0 }),
  ];
}

function barrier(colorA = '#E07B3A') {
  const stripes = [];
  for (let i = -3; i <= 3; i += 1) {
    stripes.push(paint(box(0.17, 0.7, 0.4, 0.01, { at: [i * 0.52, 1.14, 0], rot: [0, 0, 28], color: i % 2 === 0 ? colorA : '#F8F2E4', mat: 'paint', soft: 0.01 })));
  }
  return [
    box(1.84, 0.34, 0.2, 0.14, { at: [0, 1.14, 0], color: '#F8F2E4', mat: 'paint', g: 'board', k: 0 }),
    ...stripes,
    ...[-1.36, 1.36].flatMap((x) => [
      cap([x, 0.84, 0], [x, 0.16, 0], 0.08, { color: '#5B6168', mat: 'metal', g: `leg${x}`, k: 0 }),
      box(0.17, 0.08, 0.4, 0.05, { at: [x, 0.08, 0], color: '#42484E', mat: 'rubber', g: `foot${x}`, k: 0 }),
    ]),
    sphere(0.14, { at: [-1.36, 1.6, 0], color: '#E9B54C', mat: 'glow', g: 'lampA', k: 0 }),
    sphere(0.14, { at: [1.36, 1.6, 0], color: '#E9B54C', mat: 'glow', g: 'lampB', k: 0 }),
  ];
}

// ---- Barrikada's gang: violet, on legs, with bright eyes, always facing you --------------

const VIOLET = '#7B59B8';
const VIOLET_DEEP = '#54397F';
const MAGENTA = '#C65B9A';
const EYE = '#F4C25A';

function botEyes(y, z, gap = 0.3, r = 0.14) {
  return [
    ell(r, r * 1.15, 0.05, { at: [gap, y, z], color: EYE, mat: 'glow', g: 'eyeA', k: 0 }),
    ell(r, r * 1.15, 0.05, { at: [-gap, y, z], color: EYE, mat: 'glow', g: 'eyeB', k: 0 }),
    box(r * 1.5, 0.05, 0.05, 0.03, { at: [gap, y + r * 1.5, z + 0.02], rot: [0, 0, -14], color: MAGENTA, mat: 'paint', g: 'brA', k: 0 }),
    box(r * 1.5, 0.05, 0.05, 0.03, { at: [-gap, y + r * 1.5, z + 0.02], rot: [0, 0, 14], color: MAGENTA, mat: 'paint', g: 'brB', k: 0 }),
  ];
}

const legs = (x, z, top) => [
  cap([x, top, z], [x, 0.14, z], 0.09, { color: VIOLET_DEEP, g: `lg${x}${z}`, k: 0 }),
  ell(0.17, 0.08, 0.24, { at: [x, 0.08, z + 0.06], color: VIOLET_DEEP, mat: 'rubber', g: `ft${x}${z}`, k: 0 }),
];

function conebot() {
  return [
    ...legs(0.32, 0, 0.6), ...legs(-0.32, 0, 0.6),
    cone(0.62, 0.17, 0.86, { at: [0, 1.32, 0], color: VIOLET, mat: 'paint', g: 'body', k: 0.06 }),
    paint(cone(0.5, 0.42, 0.14, { at: [0, 1.0, 0], color: MAGENTA, mat: 'paint', soft: 0.01 })),
    ...botEyes(1.42, 0.3, 0.17, 0.1),
    cap([0, 2.18, 0], [0, 2.44, 0], 0.03, { color: VIOLET_DEEP, g: 'ant', k: 0 }),
    sphere(0.08, { at: [0, 2.5, 0], color: MAGENTA, mat: 'glow', g: 'antT', k: 0 }),
  ];
}

function drumbot() {
  return [
    ...legs(0.46, 0.1, 0.6), ...legs(-0.46, 0.1, 0.6),
    cyl(0.8, 0.8, 0.12, { at: [0, 1.46, 0], color: VIOLET, mat: 'metal', g: 'body', k: 0 }),
    ...[0.96, 1.96].map((y) => tor(0.8, 0.06, { at: [0, y, 0], color: MAGENTA, mat: 'paint', g: `ring${y}`, k: 0 })),
    ...botEyes(1.56, 0.78, 0.3, 0.15),
    cyl(0.55, 0.06, 0.04, { at: [0, 2.3, 0], color: VIOLET_DEEP, mat: 'metal', g: 'lid', k: 0 }),
    cap([0, 2.36, 0], [0, 2.6, 0], 0.03, { color: VIOLET_DEEP, g: 'ant', k: 0 }),
    sphere(0.09, { at: [0, 2.66, 0], color: MAGENTA, mat: 'glow', g: 'antT', k: 0 }),
  ];
}

function signbot() {
  return [
    ...legs(0.5, 0, 0.5), ...legs(-0.5, 0, 0.5),
    box(0.62, 0.3, 0.3, 0.16, { at: [0, 0.82, 0], color: VIOLET_DEEP, mat: 'paint', g: 'hip', k: 0 }),
    box(0.98, 0.84, 0.13, 0.12, { at: [0, 1.86, 0], rot: [-4, 0, 0], color: VIOLET, mat: 'paint', g: 'board', k: 0 }),
    box(0.84, 0.7, 0.03, 0.08, { at: [0, 1.86, 0.13], rot: [-4, 0, 0], color: '#9A7BD0', mat: 'paint', g: 'panel', k: 0 }),
    ...botEyes(1.96, 0.19, 0.34, 0.15),
    box(0.44, 0.05, 0.05, 0.03, { at: [0, 1.5, 0.2], color: MAGENTA, mat: 'paint', g: 'mouth', k: 0 }),
    ...[-1, 1].map((s) => cap([s * 0.98, 1.6, 0], [s * 1.24, 1.0, 0.12], 0.06, { color: VIOLET_DEEP, g: `arm${s}`, k: 0 })),
  ];
}

// ---- pick-ups: small, floating, bright ---------------------------------------------------

function bolt() {
  const parts = [];
  for (let i = 0; i < 3; i += 1) {
    parts.push(box(0.56, 0.33, 0.19, 0.05, { at: [0, 0.7, 0], rot: [0, 0, i * 60], color: GOLD, mat: 'metal', g: 'nut', k: 0.02 }));
  }
  parts.push(sub(cyl(0.25, 0.5, 0.02, { at: [0, 0.7, 0], rot: [90, 0, 0], g: 'nut', k: 0.02 })));
  return parts;
}

function wrench() {
  const S = '#8FA8A4';
  return [
    cap([-0.04, 0.5, 0], [0.04, 1.34, 0], 0.13, { color: S, mat: 'metal', g: 'w', k: 0.05 }),
    tor(0.26, 0.1, { at: [0.06, 1.54, 0], rot: [90, 0, 0], color: S, mat: 'metal', g: 'w', k: 0.05 }),
    sub(box(0.15, 0.28, 0.3, 0.02, { at: [0.08, 1.8, 0], g: 'w', k: 0.01 })),
    sphere(0.17, { at: [-0.05, 0.45, 0], color: '#69AF7C', mat: 'paint', g: 'g', k: 0 }),
  ];
}

function postcard() {
  return [
    box(0.92, 0.62, 0.03, 0.03, { at: [0, 1.0, 0], rot: [0, 12, -6], color: '#FBF4E2', mat: 'paper', g: 'c', k: 0 }),
    paint(box(0.3, 0.36, 0.2, 0.02, { at: [-0.4, 1.0, 0], rot: [0, 12, -6], color: '#69AFA4', mat: 'paper', soft: 0.01 })),
    paint(box(0.2, 0.24, 0.2, 0.02, { at: [0.58, 1.18, 0], rot: [0, 12, -6], color: '#CF7C74', mat: 'paper', soft: 0.01 })),
    ...[0.88, 1.02].map((y) => paint(box(0.42, 0.02, 0.2, 0.01, { at: [0.2, y - 0.1, 0], rot: [0, 12, -6], color: '#8C97A0', mat: 'paper', soft: 0.008 }))),
  ];
}

function gearPart() {
  const C = '#4DB0A0';
  const teeth = [];
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    teeth.push(box(0.11, 0.14, 0.13, 0.03, { at: [Math.sin(a) * 0.64, 0.95 + Math.cos(a) * 0.64, 0], rot: [0, 0, (-a * 180) / Math.PI], color: C, mat: 'metal', g: 'g', k: 0.03 }));
  }
  return [
    cyl(0.58, 0.13, 0.05, { at: [0, 0.95, 0], rot: [90, 0, 0], color: C, mat: 'metal', g: 'g', k: 0.03 }),
    sub(cyl(0.22, 0.3, 0.02, { at: [0, 0.95, 0], rot: [90, 0, 0], g: 'g', k: 0.02 })),
    ...teeth,
  ];
}

function spark() {
  return [
    ell(0.34, 0.68, 0.34, { at: [0, 1.0, 0], color: '#8FDCE8', mat: 'glow', g: 'cr', k: 0.1 }),
    ell(0.68, 0.17, 0.17, { at: [0, 1.0, 0], color: '#CFF2F4', mat: 'glow', g: 'cr', k: 0.1 }),
  ];
}

function capsule(color, inner) {
  return [
    sphere(0.76, { at: [0, 0.95, 0], color, mat: 'paint', g: 'orb', k: 0 }),
    paint(ell(0.66, 0.5, 0.2, { at: [0, 0.95, 0.68], color: '#FBF4E2', mat: 'clay', soft: 0.02 })),
    tor(0.76, 0.05, { at: [0, 0.95, 0], rot: [90, 0, 0], color: '#FBF4E2', mat: 'clay', g: 'rim', k: 0 }),
    ...inner,
  ];
}

const POWERS = {
  // Spread: three pulses fanning out. Magnet: a U. Bubble: a dome on a car. Rally: two sidekick stars.
  spread: () => capsule('#D9704C', [-30, 0, 30].map((a) => cap([0, 0.72, 0.8], [Math.sin((a * Math.PI) / 180) * 0.45, 0.72 + Math.cos((a * Math.PI) / 180) * 0.5, 0.8], 0.07, { color: '#C9503F', g: `s${a}`, k: 0 }))),
  magnet: () => capsule('#C96C9A', [
    tor(0.26, 0.09, { at: [0, 0.98, 0.82], rot: [90, 0, 0], color: '#C9503F', mat: 'paint', g: 'mg', k: 0.02 }),
    sub(box(0.42, 0.16, 0.3, 0.01, { at: [0, 1.17, 0.82], g: 'mg', k: 0 })),
  ]),
  bubble: () => capsule('#4D8CCB', [
    sphere(0.3, { at: [0, 0.98, 0.72], color: '#A8D4EA', mat: 'glass', g: 'bb', k: 0 }),
  ]),
  rally: () => capsule('#5FA56C', [
    sphere(0.16, { at: [-0.2, 0.86, 0.84], color: GOLD, mat: 'glow', g: 'sA', k: 0 }),
    sphere(0.19, { at: [0.18, 1.08, 0.82], color: GOLD, mat: 'glow', g: 'sB', k: 0 }),
  ]),
};

// ---- scenery ----------------------------------------------------------------------------

const TRUNK = '#7A5C43';
const LEAF_A = '#6E9A58';
const LEAF_B = '#5D8A52';
const LEAF_C = '#86AC62';

function blobs(list, color, g = 'leaf', k = 0.3) {
  return list.map(([x, y, z, r], i) => sphere(r, { at: [x, y, z], color: Array.isArray(color) ? color[i % color.length] : color, mat: 'leaf', g, k }));
}

const mango = () => [
  cone(0.34, 0.2, 1.1, { at: [0, 1.1, 0], color: TRUNK, mat: 'wood', g: 't', k: 0 }),
  ...blobs([[0, 3.3, 0, 1.5], [1.1, 2.9, 0.2, 1.05], [-1.1, 2.9, 0.1, 1.1], [0.5, 4.1, -0.1, 0.95], [-0.5, 3.9, 0.4, 0.9], [0, 2.7, 0.9, 0.9]], [LEAF_A, LEAF_B, LEAF_C]),
];
const acacia = () => [
  cap([0, 0, 0], [0.1, 2.5, 0], 0.26, { color: TRUNK, mat: 'wood', g: 't', k: 0.1 }),
  cap([0.1, 2.3, 0], [1.3, 3.4, 0.1], 0.14, { color: TRUNK, mat: 'wood', g: 't', k: 0.1 }),
  cap([0.1, 2.3, 0], [-1.3, 3.3, -0.1], 0.14, { color: TRUNK, mat: 'wood', g: 't', k: 0.1 }),
  ...blobs([[0, 3.76, 0, 1.2], [1.7, 3.56, 0, 0.9], [-1.7, 3.5, 0, 0.92], [0.8, 3.8, 0.8, 0.8], [-0.8, 3.8, -0.8, 0.8]].map(([x, y, z, r]) => [x, y, z, r]), ['#79A35A', '#6B9654']).map((p) => ({ ...p, args: [p.args[0]] })),
  sub(box(4, 0.6, 4, 0.2, { at: [0, 2.7, 0], g: 'leaf', k: 0.3 })),
];
function palm() {
  const out = [cap([0, 0, 0], [0.34, 2.4, 0], 0.2, { color: '#8E7458', mat: 'wood', g: 't', k: 0.3 }), cap([0.34, 2.4, 0], [0.2, 4.4, 0], 0.15, { color: '#8E7458', mat: 'wood', g: 't', k: 0.3 })];
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    const dx = Math.sin(a);
    const dz = Math.cos(a);
    out.push(cap([0.2, 4.5, 0], [0.2 + dx * 1.0, 4.9, dz * 1.0], 0.15, { color: i % 2 ? LEAF_A : LEAF_C, mat: 'leaf', g: `f${i}`, k: 0.1 }));
    out.push(cap([0.2 + dx * 1.0, 4.9, dz * 1.0], [0.2 + dx * 1.9, 4.2, dz * 1.9], 0.08, { color: i % 2 ? LEAF_A : LEAF_C, mat: 'leaf', g: `f${i}`, k: 0.1 }));
  }
  out.push(sphere(0.17, { at: [0.36, 4.3, 0.16], color: '#7A6240', mat: 'wood', g: 'cA', k: 0 }), sphere(0.17, { at: [0.04, 4.3, 0.2], color: '#7A6240', mat: 'wood', g: 'cB', k: 0 }));
  return out;
}
function banana() {
  const out = [cone(0.28, 0.19, 0.9, { at: [0, 0.9, 0], color: '#8FA05E', mat: 'wood', g: 't', k: 0 })];
  for (let i = 0; i < 7; i += 1) {
    const a = (i / 7) * Math.PI * 2 + 0.3;
    const dx = Math.sin(a);
    const dz = Math.cos(a);
    out.push(ell(0.3, 0.05, 0.86, { at: [dx * 0.72, 2.2 + (i % 2) * 0.2, dz * 0.72], rot: [32 * -dz, (a * 180) / Math.PI, 32 * dx], color: i % 2 ? '#7FA85C' : '#92B868', mat: 'leaf', g: `l${i}`, k: 0 }));
  }
  return out;
}
function bamboo() {
  const out = [];
  [[-0.46, 0, -0.2], [-0.16, 0.26, -0.06], [0.16, -0.16, 0.06], [0.44, 0.12, 0.2], [0, -0.34, 0.02]].forEach(([x, z, lean], i) => {
    const top = 4.8 + (i % 3) * 0.5;
    out.push(cap([x, 0, z], [x + lean * 3, top, z], 0.08, { color: i % 2 ? '#A6B568' : '#94A65C', mat: 'wood', g: `b${i}`, k: 0 }));
    for (let k = 0; k < 4; k += 1) {
      const y = 2.0 + k * 0.85;
      const t = y / top;
      const s = k % 2 ? 1 : -1;
      out.push(ell(0.62, 0.13, 0.26, { at: [x + lean * 3 * t + s * 0.42, y, z], rot: [0, 0, s * -14], color: k % 2 ? '#8FB068' : '#7FA25C', mat: 'leaf', g: `t${i}${k}`, k: 0 }));
    }
  });
  return out;
}
const narra = () => [
  cone(0.44, 0.28, 1.2, { at: [0, 1.2, 0], color: '#6E5240', mat: 'wood', g: 't', k: 0 }),
  ...blobs([[0, 3.9, 0, 1.9], [1.5, 3.4, 0.2, 1.3], [-1.5, 3.4, -0.1, 1.3], [0.8, 4.7, 0.3, 1.1], [-0.8, 4.6, -0.3, 1.1]], ['#5D8A52', '#6E9A58', '#527E4C']),
];
const hedge = () => blobs([[-1, 0.5, 0, 0.62], [-0.2, 0.6, 0.1, 0.72], [0.7, 0.54, 0, 0.66], [1.4, 0.4, 0, 0.5]], [LEAF_B, LEAF_A]);
function flowers() {
  const out = [...blobs([[-0.6, 0.3, 0, 0.42], [0.1, 0.34, 0.1, 0.46], [0.7, 0.28, 0, 0.38]], LEAF_A)];
  [[-0.7, 0.68, 0.1], [-0.3, 0.72, 0.3], [0.1, 0.8, 0.2], [0.5, 0.64, 0.3], [0.8, 0.56, 0.1], [0, 0.6, 0.5]].forEach(([x, y, z], i) => out.push(sphere(0.11, { at: [x, y, z], color: ['#E8A0B0', '#F2DFA0', '#F8F2E4'][i % 3], mat: 'clay', g: `fl${i}`, k: 0 })));
  return out;
}
function grass() {
  const out = [];
  [[-0.5, 0.1], [-0.2, -0.1], [0.1, 0.1], [0.4, 0], [0.7, -0.1], [-0.8, 0]].forEach(([x, z], i) => out.push(cone(0.08, 0.01, 0.4 + (i % 3) * 0.1, { at: [x, 0.4, z], rot: [0, 0, (i - 2.5) * 6], color: i % 2 ? '#86AC62' : '#6E9A58', mat: 'leaf', g: `g${i}`, k: 0 })));
  return out;
}

function nipa() {
  const THATCH = '#C9A86A';
  const BAMBOO = '#B79B62';
  return [
    ...[-1, 1].flatMap((x) => [-1, 1].map((z) => cap([x * 1.05, 0, z * 0.85], [x * 1.05, 1.2, z * 0.85], 0.09, { color: TRUNK, mat: 'wood', g: `p${x}${z}`, k: 0 }))),
    box(1.3, 0.72, 1.0, 0.06, { at: [0, 1.82, 0], color: BAMBOO, mat: 'wood', g: 'walls', k: 0 }),
    paint(box(0.3, 0.42, 1.2, 0.02, { at: [-0.5, 1.82, 0], color: '#4A3A2A', mat: 'wood', soft: 0.01 })),
    box(1.5, 0.05, 1.2, 0.03, { at: [0, 1.14, 0], color: TRUNK, mat: 'wood', g: 'floor', k: 0 }),
    box(1.64, 0.56, 1.36, 0.1, { at: [0, 2.96, 0], rot: [0, 0, 0], color: THATCH, mat: 'fabric', g: 'roof', k: 0 , taper: 0.86 }),
    cap([0.4, 1.1, 1.0], [0.4, 0.1, 1.5], 0.04, { color: TRUNK, mat: 'wood', g: 'lad', k: 0 }),
    cap([0.8, 1.1, 1.0], [0.8, 0.1, 1.5], 0.04, { color: TRUNK, mat: 'wood', g: 'lad2', k: 0 }),
  ];
}
function house(wall = '#E8D8B8', roof = '#B36A4E') {
  return [
    box(1.7, 1.1, 1.4, 0.1, { at: [0, 1.1, 0], color: wall, mat: 'clay', g: 'w', k: 0 }),
    box(1.96, 0.5, 1.66, 0.1, { at: [0, 2.68, 0], color: roof, mat: 'clay', g: 'r', k: 0, taper: 0.7 }),
    box(0.34, 0.6, 0.05, 0.03, { at: [-0.6, 0.6, 1.4], color: '#7A5C43', mat: 'wood', g: 'door', k: 0 }),
    box(0.46, 0.36, 0.05, 0.05, { at: [0.6, 1.26, 1.4], color: GLASS, mat: 'glass', g: 'win', k: 0 }),
    box(0.05, 0.36, 0.42, 0.05, { at: [1.7, 1.26, 0.2], color: GLASS, mat: 'glass', g: 'win2', k: 0 }),
    box(0.05, 0.36, 0.42, 0.05, { at: [-1.7, 1.26, 0.2], color: GLASS, mat: 'glass', g: 'win3', k: 0 }),
  ];
}
function sari() {
  const WALL = '#CFE0C8';
  const AWN = '#D9704C';
  const out = [
    box(1.7, 1.16, 1.2, 0.1, { at: [0, 1.16, 0], color: WALL, mat: 'clay', g: 'w', k: 0 }),
    box(1.82, 0.14, 1.34, 0.06, { at: [0, 2.46, 0], color: '#9AA8A0', mat: 'metal', g: 'r', k: 0 }),
    // A hatch counter with its awning propped open, and shelves of colour.
    box(1.3, 0.46, 0.08, 0.05, { at: [0, 1.5, 1.2], color: '#3C3F3C', mat: 'clay', g: 'hatch', k: 0 }),
    ...[-0.9, -0.5, -0.1, 0.3, 0.7, 1.0].map((x, i) => box(0.13, 0.17, 0.03, 0.02, { at: [x, 1.66 - (i % 2) * 0.26, 1.28], color: ['#E9B54C', '#C65B50', '#69AFA4', '#F8F2E4'][i % 4], mat: 'paper', g: `sh${i}`, k: 0 })),
    box(1.5, 0.05, 0.6, 0.03, { at: [0, 2.1, 1.66], rot: [20, 0, 0], color: AWN, mat: 'fabric', g: 'aw', k: 0 }),
    ...[-0.75, 0, 0.75].map((x) => paint(box(0.18, 0.2, 0.7, 0.01, { at: [x, 2.1, 1.66], rot: [20, 0, 0], color: '#F8F2E4', mat: 'fabric', soft: 0.01 }))),
    box(1.5, 0.06, 0.3, 0.03, { at: [0, 0.96, 1.42], color: '#A97F52', mat: 'wood', g: 'counter', k: 0 }),
  ];
  return out;
}
function stall() {
  return [
    ...[-1, 1].flatMap((x) => [-1, 1].map((z) => cap([x * 1.1, 0, z * 0.6], [x * 1.1, 2.0, z * 0.6], 0.05, { color: '#8C6E46', mat: 'wood', g: `p${x}${z}`, k: 0 }))),
    box(1.3, 0.08, 0.8, 0.05, { at: [0, 2.08, 0], rot: [12, 0, 0], color: '#E9B54C', mat: 'fabric', g: 'roof', k: 0 }),
    box(1.2, 0.34, 0.6, 0.06, { at: [0, 0.82, 0], color: '#C9A772', mat: 'wood', g: 'table', k: 0 }),
    ...[-0.7, 0, 0.7].map((x, i) => ell(0.3, 0.17, 0.26, { at: [x, 1.24, 0.1], color: ['#E08A4C', '#8FB068', '#CF7C74'][i], mat: 'clay', g: `food${i}`, k: 0 })),
  ];
}
function shophouse(wall = '#D9B99A') {
  return [
    box(1.6, 2.2, 1.3, 0.12, { at: [0, 2.2, 0], color: wall, mat: 'clay', g: 'w', k: 0 }),
    box(1.76, 0.12, 1.46, 0.05, { at: [0, 4.44, 0], color: '#9AA8A0', mat: 'metal', g: 'r', k: 0 }),
    box(1.34, 0.7, 0.05, 0.06, { at: [0, 0.8, 1.3], color: GLASS, mat: 'glass', g: 'front', k: 0 }),
    box(1.5, 0.05, 0.42, 0.03, { at: [0, 1.66, 1.5], rot: [14, 0, 0], color: '#69AFA4', mat: 'fabric', g: 'aw', k: 0 }),
    ...[-0.72, 0.72].flatMap((x) => [2.5, 3.5].map((y) => box(0.4, 0.34, 0.05, 0.05, { at: [x, y, 1.3], color: GLASS, mat: 'glass', g: `win${x}${y}`, k: 0 }))),
    box(1.3, 0.2, 0.05, 0.03, { at: [0, 1.92, 1.36], color: '#F8F2E4', mat: 'paper', g: 'sign', k: 0 }),
    ...[-0.72, 0.72].flatMap((x) => [2.5, 3.5].map((y) => box(0.04, 0.34, 0.42, 0.03, { at: [1.6, y, x], color: GLASS, mat: 'glass', g: `side${x}${y}`, k: 0 }))),
  ];
}
function tower() {
  return [
    ...[-1, 1].flatMap((x) => [-1, 1].map((z) => cap([x * 0.7, 0, z * 0.7], [x * 0.5, 3.6, z * 0.5], 0.05, { color: '#7E8A8C', mat: 'metal', g: `l${x}${z}`, k: 0 }))),
    ...[1.2, 2.4].flatMap((y) => [cap([-0.6, y, 0.6], [0.6, y, 0.6], 0.03, { color: '#7E8A8C', mat: 'metal', g: `b${y}a`, k: 0 }), cap([0.6, y, -0.6], [0.6, y, 0.6], 0.03, { color: '#7E8A8C', mat: 'metal', g: `b${y}b`, k: 0 })]),
    cyl(1.0, 0.72, 0.2, { at: [0, 4.3, 0], color: '#CFE0D8', mat: 'clay', g: 'tank', k: 0 }),
    cone(1.04, 0.1, 0.3, { at: [0, 5.3, 0], color: '#B7C8C0', mat: 'clay', g: 'lid', k: 0 }),
  ];
}
function pole() {
  return [
    cap([0, 0, 0], [0, 5.4, 0], 0.09, { color: '#8E7458', mat: 'wood', g: 'p', k: 0 }),
    box(0.9, 0.05, 0.05, 0.03, { at: [0, 5.0, 0], color: '#6E5A44', mat: 'wood', g: 'x', k: 0 }),
    box(0.6, 0.04, 0.05, 0.03, { at: [0, 4.6, 0], color: '#6E5A44', mat: 'wood', g: 'x2', k: 0 }),
    cyl(0.2, 0.26, 0.05, { at: [0.28, 4.0, 0.1], color: '#8A9498', mat: 'metal', g: 'tf', k: 0 }),
    ...[-0.8, 0, 0.8].map((x) => sphere(0.05, { at: [x, 5.1, 0], color: '#BFD0C8', mat: 'clay', g: `i${x}`, k: 0 })),
  ];
}
function pylon() {
  return [
    ...[-1, 1].flatMap((x) => [cap([x * 1.0, 0, 0.7], [x * 0.22, 6, 0.2], 0.06, { color: '#9AA4A8', mat: 'metal', g: `l${x}a`, k: 0 }), cap([x * 1.0, 0, -0.7], [x * 0.22, 6, -0.2], 0.06, { color: '#9AA4A8', mat: 'metal', g: `l${x}b`, k: 0 })]),
    ...[1.5, 3, 4.5].map((y) => cap([-(1 - y / 7.6) * 1.0, y, 0.5], [(1 - y / 7.6) * 1.0, y, 0.5], 0.03, { color: '#9AA4A8', mat: 'metal', g: `h${y}`, k: 0 })),
    cap([-0.26, 6, 0], [0.26, 8, 0], 0.04, { color: '#9AA4A8', mat: 'metal', g: 'tA', k: 0 }),
    cap([0.26, 6, 0], [-0.26, 8, 0], 0.04, { color: '#9AA4A8', mat: 'metal', g: 'tB', k: 0 }),
    ...[6.4, 7.4].map((y) => box(1.8 - (y - 6.4) * 0.5, 0.05, 0.06, 0.03, { at: [0, y, 0], color: '#9AA4A8', mat: 'metal', g: `arm${y}`, k: 0 })),
  ];
}
function lamp() {
  return [
    cap([0, 0, 0], [0, 4.4, 0], 0.08, { color: '#6E7A80', mat: 'metal', g: 'p', k: 0.05 }),
    cap([0, 4.4, 0], [-1.1, 4.8, 0], 0.06, { color: '#6E7A80', mat: 'metal', g: 'p', k: 0.05 }),
    ell(0.34, 0.1, 0.2, { at: [-1.26, 4.78, 0], color: '#7E8A90', mat: 'metal', g: 'h', k: 0 }),
    ell(0.22, 0.05, 0.13, { at: [-1.26, 4.7, 0], color: '#F4E6B8', mat: 'glow', g: 'l', k: 0 }),
  ];
}
function billboard(colorA = '#69AFA4') {
  return [
    ...[-1.4, 1.4].map((x) => cap([x, 0, 0], [x, 2.6, 0], 0.09, { color: '#7E8A8C', mat: 'metal', g: `p${x}`, k: 0 })),
    box(2.3, 1.1, 0.1, 0.08, { at: [0, 3.3, 0], color: '#EFE6D2', mat: 'paper', g: 'b', k: 0 }),
    paint(box(2.1, 0.9, 0.3, 0.06, { at: [0, 3.3, 0], color: colorA, mat: 'paper', soft: 0.012 })),
    paint(ell(0.8, 0.52, 0.3, { at: [-0.9, 3.3, 0.1], color: '#F8EDD8', mat: 'paper', soft: 0.015 })),
    paint(box(0.86, 0.11, 0.3, 0.04, { at: [0.8, 3.56, 0.1], color: '#F8EDD8', mat: 'paper', soft: 0.01 })),
    paint(box(0.62, 0.08, 0.3, 0.03, { at: [0.8, 3.26, 0.1], color: '#F8EDD8', mat: 'paper', soft: 0.01 })),
  ];
}
function kmpost() {
  return [
    box(0.2, 0.5, 0.08, 0.05, { at: [0, 0.5, 0], color: '#F4EEDF', mat: 'paint', g: 'k', k: 0 }),
    paint(box(0.3, 0.16, 0.2, 0.02, { at: [0, 0.82, 0], color: '#3E74B9', mat: 'paint', soft: 0.008 })),
  ];
}
function sos() {
  return [
    cap([0, 0, 0], [0, 1.0, 0], 0.07, { color: '#6E7A80', mat: 'metal', g: 'p', k: 0 }),
    box(0.3, 0.38, 0.18, 0.06, { at: [0, 1.26, 0], color: '#D9704C', mat: 'paint', g: 'b', k: 0 }),
    box(0.2, 0.2, 0.03, 0.03, { at: [0, 1.28, 0.18], color: '#F8F2E4', mat: 'paper', g: 'f', k: 0 }),
  ];
}
function sign(kind) {
  const color = kind === 'exit' ? '#3F7F66' : '#E9B54C';
  return [
    ...[-0.6, 0.6].map((x) => cap([x, 0, 0], [x, 1.7, 0], 0.05, { color: '#7E8A8C', mat: 'metal', g: `p${x}`, k: 0 })),
    box(1.0, 0.6, 0.05, 0.08, { at: [0, 2.2, 0], color, mat: 'paint', g: 'b', k: 0 }),
    paint(box(0.9, 0.5, 0.2, 0.06, { at: [0, 2.2, 0.0], color, mat: 'paint', soft: 0.01 })),
    box(0.6, 0.05, 0.03, 0.02, { at: [0, 2.36, 0.06], color: '#F8F2E4', mat: 'paper', g: 'tA', k: 0 }),
    box(0.4, 0.05, 0.03, 0.02, { at: [-0.2, 2.14, 0.06], color: '#F8F2E4', mat: 'paper', g: 'tB', k: 0 }),
    cone(0.13, 0.01, 0.15, { at: [0.5, 2.14, 0.06], rot: [0, 0, -90], color: '#F8F2E4', mat: 'paper', g: 'arr', k: 0 }),
  ];
}
function carabao() {
  const HIDE = '#5F6670';
  const MUZ = '#D2C3B0';
  return [
    ell(0.62, 0.56, 1.1, { at: [0, 1.0, 0], color: HIDE, mat: 'clay', g: 'b', k: 0.2 }),
    ell(0.42, 0.42, 0.5, { at: [0, 1.24, 1.14], color: HIDE, mat: 'clay', g: 'b', k: 0.2 }),
    ell(0.27, 0.22, 0.24, { at: [0, 1.06, 1.56], color: MUZ, mat: 'clay', g: 'muz', k: 0 }),
    ...[-1, 1].map((s) => cap([s * 0.3, 1.56, 1.16], [s * 0.9, 1.64, 1.12], 0.08, { color: MUZ, mat: 'clay', g: `hA${s}`, k: 0.05 })),
    ...[-1, 1].map((s) => cap([s * 0.9, 1.64, 1.12], [s * 1.05, 1.98, 1.06], 0.05, { color: MUZ, mat: 'clay', g: `hA${s}`, k: 0.05 })),
    ...[-1, 1].flatMap((s) => [0.6, -0.6].map((z) => cap([s * 0.38, 0.6, z], [s * 0.4, 0.05, z], 0.13, { color: HIDE, mat: 'clay', g: `l${s}${z}`, k: 0 }))),
    cap([0, 1.3, -1.1], [0, 0.6, -1.3], 0.04, { color: HIDE, g: 't', k: 0 }),
  ];
}
const haystack = () => [
  ell(1.06, 1.3, 1.06, { at: [0, 1.0, 0], color: '#D8B878', mat: 'fabric', g: 'h', k: 0 }),
  sub(box(1.4, 0.4, 1.4, 0.05, { at: [0, -0.4, 0], g: 'h', k: 0 })),
  cap([0, 2.0, 0], [0, 2.7, 0], 0.04, { color: '#8C6E46', mat: 'wood', g: 'p', k: 0 }),
];
function parolPost() {
  const out = [cap([0, 0, 0], [0, 3.6, 0], 0.07, { color: '#6E7A80', mat: 'metal', g: 'p', k: 0 }), cap([-1.2, 3.5, 0], [1.2, 3.5, 0], 0.04, { color: '#6E7A80', mat: 'metal', g: 'x', k: 0 })];
  [-1.1, 1.1].forEach((x, i) => {
    out.push(cap([x, 3.5, 0], [x, 3.2, 0], 0.02, { color: '#6E7A80', g: `h${i}`, k: 0 }));
    for (let k = 0; k < 5; k += 1) {
      const a = (k / 5) * Math.PI * 2;
      out.push(cap([x, 2.7, 0], [x + Math.sin(a) * 0.56, 2.7 + Math.cos(a) * 0.56, 0], 0.12, { color: ['#F2C879', '#E79A7A'][i], mat: 'glow', g: `st${i}`, k: 0.08 }));
    }
    out.push(ell(0.08, 0.26, 0.04, { at: [x, 1.96, 0], color: '#C65B50', mat: 'fabric', g: `tas${i}`, k: 0 }));
  });
  return out;
}
function overpass() {
  const out = [
    box(9.4, 0.32, 1.2, 0.08, { at: [0, 5.2, 0], color: '#BDBAA8', mat: 'clay', g: 'deck', k: 0 }),
    box(9.4, 0.26, 0.09, 0.05, { at: [0, 5.76, 1.1], color: '#D0CCBA', mat: 'clay', g: 'rail', k: 0 }),
    ...[-8.4, 8.4].map((x) => box(0.5, 2.5, 0.7, 0.1, { at: [x, 2.5, 0], color: '#AEAB9A', mat: 'clay', g: `pier${x}`, k: 0 })),
    paint(box(9.6, 0.05, 1.3, 0.01, { at: [0, 4.98, 0], color: '#E0B24C', mat: 'paint', soft: 0.01 })),
  ];
  return out;
}
const cloud = (seed) => {
  const shapes = [
    [[0, 0.8, 0, 1.0], [1.3, 0.6, 0, 0.78], [-1.3, 0.54, 0, 0.8], [0.5, 1.3, 0, 0.66], [-2.2, 0.3, 0, 0.44], [2.2, 0.3, 0, 0.5]],
    [[0, 0.7, 0, 0.8], [1.0, 0.5, 0, 0.62], [-1.0, 0.56, 0, 0.66]],
    [[0, 0.6, 0, 0.7], [1.4, 0.5, 0, 0.6], [-1.3, 0.46, 0, 0.54], [2.6, 0.3, 0, 0.36], [-2.4, 0.3, 0, 0.32]],
  ][seed];
  return [...shapes.map(([x, y, z, r]) => sphere(r, { at: [x, y, z], color: '#FBF8F0', mat: 'fabric', g: 'c', k: 0.3 })), sub(box(5, 0.5, 2, 0.05, { at: [0, -0.34, 0], g: 'c', k: 0.2 }))];
};

// ---- hills: far washes tinted at run time ------------------------------------------------------

function hills(list) {
  return list.map(([x, h, w], i) => ell(w, h, 2.4, { at: [x, 0, -1], color: '#F4F4EC', mat: 'clay', g: 'h', k: 0.8 })).concat([sub(box(50, 4, 6, 0.1, { at: [0, -4, 0], g: 'h', k: 0 }))]);
}
const hillsFar = () => hills([[-13, 1.5, 5], [-7, 2.1, 5], [-1, 1.5, 4], [5, 2.4, 6], [11, 1.8, 5], [16, 1.2, 4]]);
const hillsNear = () => hills([[-14, 0.9, 4], [-8, 1.3, 4.2], [-3, 0.9, 3.2], [3, 1.2, 4], [9, 1.5, 4.6], [14, 0.9, 3.4]]);
const arayat = () => [ell(6, 5.0, 3, { at: [0, 0, -1], color: '#F4F4EC', mat: 'clay', g: 'a', k: 0 }), sphere(1.4, { at: [1, 4.3, -1], color: '#F4F4EC', mat: 'clay', g: 'a', k: 0.8 }), sub(box(9, 3, 5, 0.1, { at: [0, -3, 0], g: 'a', k: 0 }))];
const pinatubo = () => hills([[-5, 2.8, 5], [0, 3.4, 5.4], [5, 2.4, 4.6]]);
function skyline() {
  const heights = [[-9, 1.3, 0.8], [-7.4, 2.1, 0.7], [-6, 1.5, 0.9], [-4.4, 2.8, 0.7], [-3, 1.7, 0.8], [-1.4, 3.2, 0.9], [0.4, 2.1, 0.7], [1.8, 2.6, 0.8], [3.4, 1.5, 0.9], [5, 2.3, 0.7], [6.6, 1.3, 0.9], [8.2, 1.8, 0.7]];
  return heights.map(([x, h, w], i) => box(w, h, 0.5, 0.08, { at: [x, h, 0], color: '#F4F4EC', mat: 'clay', g: `b${i}`, k: 0 }));
}

// ---- the road machines. Chest gears sit one lane apart: x = -1.5, 0, 1.5 at y = 2.16. --------------

function machine(skin) {
  const { panel, stripe, boom, crown } = skin;
  const stripes = [];
  for (let i = -5; i <= 5; i += 1) {
    stripes.push(paint(box(0.2, 0.58, 0.5, 0.01, { at: [i * 0.56, 3.26, 0.7], rot: [0, 0, 30], color: i % 2 === 0 ? stripe : panel, mat: 'paint', soft: 0.012 })));
  }
  const gear = (x) => [
    tor(0.54, 0.09, { at: [x, 2.16, 0.74], rot: [90, 0, 0], color: stripe, mat: 'metal', g: `gr${x}`, k: 0 }),
    cyl(0.5, 0.07, 0.04, { at: [x, 2.16, 0.68], rot: [90, 0, 0], color: '#5A6168', mat: 'metal', g: `gi${x}`, k: 0 }),
  ];
  return [
    // Wide chest of barrier panels on a low tread.
    box(2.9, 1.3, 0.72, 0.28, { at: [0, 2.4, 0], color: panel, mat: 'paint', g: 'chest', k: 0.06 }),
    ...stripes,
    box(3.1, 0.34, 0.9, 0.24, { at: [0, 0.74, 0], color: '#3F454C', mat: 'rubber', g: 'tread', k: 0 }),
    ...[-2.4, -1.2, 0, 1.2, 2.4].map((x) => cyl(0.3, 0.86, 0.06, { at: [x, 0.42, 0], rot: [90, 0, 0], color: '#2F3A40', mat: 'rubber', g: `wh${x}`, k: 0 })),
    box(2.2, 0.26, 0.5, 0.1, { at: [0, 1.22, 0], color: '#5A6168', mat: 'metal', g: 'hip', k: 0 }),
    ...gear(-1.5), ...gear(0), ...gear(1.5),
    // Toll-booth head with one great lens.
    box(1.3, 0.92, 0.72, 0.26, { at: [0, 4.6, 0], color: '#F2E8D4', mat: 'clay', g: 'head', k: 0.06 }),
    box(1.5, 0.1, 0.9, 0.08, { at: [0, 5.52, 0], color: panel, mat: 'paint', g: 'lid', k: 0 }),
    // Crown of soft cones.
    ...[-0.9, -0.3, 0.3, 0.9].map((x, i) => cone(0.26, 0.05, 0.4, { at: [x, 6.04 + (i === 1 || i === 2 ? 0.14 : 0), 0], color: crown, mat: 'paint', g: `cr${x}`, k: 0 })),
    // Toll-gate boom arms held high.
    ...[-1, 1].flatMap((s) => [
      cap([s * 2.86, 3.3, 0], [s * 3.6, 4.1, 0], 0.17, { color: boom, mat: 'paint', g: `bm${s}`, k: 0.06 }),
      cap([s * 3.6, 4.1, 0], [s * 3.9, 5.5, 0], 0.13, { color: boom, mat: 'paint', g: `bm${s}`, k: 0.06 }),
      ...[4.4, 4.9, 5.3].map((y) => paint(box(0.3, 0.09, 0.3, 0.01, { at: [s * (3.6 + (y - 4.1) * 0.21), y, 0], color: '#F8F2E4', mat: 'paint', soft: 0.01 }))),
    ]),
  ];
}

const MACHINE_SKINS = {
  barrikada: { panel: '#E0B24C', stripe: '#3F454C', boom: '#C65B50', crown: '#E07B3A' },
  prinsipe: { panel: '#7FB0D8', stripe: '#2C5A9C', boom: '#3E74B9', crown: '#BFDDEF' },
  reyna: { panel: '#D88CA8', stripe: '#6E3A68', boom: '#8F5AA8', crown: '#E9B54C' },
};

/** Small things for the garage wall and the Team stage. */
function charm(kind) {
  if (kind === 'parol') {
    const out = [cap([0, 1.5, 0], [0, 1.1, 0], 0.03, { color: '#8C6E46', g: 'c', k: 0 })];
    for (let k = 0; k < 5; k += 1) {
      const a = (k / 5) * Math.PI * 2;
      out.push(cap([0, 0.6, 0], [Math.sin(a) * 0.46, 0.6 + Math.cos(a) * 0.46, 0], 0.11, { color: '#E79A7A', mat: 'clay', g: 's', k: 0.08 }));
    }
    return out;
  }
  if (kind === 'sampaguita') {
    const out = [sphere(0.17, { at: [0, 0.6, 0.1], color: '#FBF7EC', mat: 'paper', g: 'b', k: 0 })];
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2;
      out.push(ell(0.17, 0.27, 0.07, { at: [Math.sin(a) * 0.3, 0.6 + Math.cos(a) * 0.3, 0], rot: [0, 0, (-a * 180) / Math.PI], color: '#F7F1E4', mat: 'paper', g: `p${i}`, k: 0 }));
    }
    return out;
  }
  // A brass road token.
  return [cyl(0.5, 0.08, 0.04, { at: [0, 0.6, 0], rot: [90, 0, 0], color: GOLD, mat: 'metal', g: 't', k: 0 }), tor(0.46, 0.04, { at: [0, 0.6, 0.06], rot: [90, 0, 0], color: '#B98A2E', mat: 'metal', g: 'r', k: 0 })];
}

/** The little radio that speaks in the story: a transistor set with a dial and antenna. */
function radio() {
  return [
    box(1.0, 0.68, 0.34, 0.2, { at: [0, 0.74, 0], color: '#C65B50', mat: 'paint', g: 'b', k: 0 }),
    cyl(0.42, 0.05, 0.03, { at: [-0.36, 0.74, 0.34], rot: [90, 0, 0], color: '#F8EDD8', mat: 'clay', g: 'sp', k: 0 }),
    ...[-0.2, 0, 0.2].map((y) => box(0.3, 0.02, 0.02, 0.01, { at: [-0.36, 0.74 + y, 0.4], color: '#6E5A44', g: `gr${y}`, k: 0 })),
    cyl(0.17, 0.06, 0.03, { at: [0.5, 0.92, 0.34], rot: [90, 0, 0], color: GOLD, mat: 'metal', g: 'dA', k: 0 }),
    cyl(0.12, 0.06, 0.03, { at: [0.5, 0.5, 0.34], rot: [90, 0, 0], color: '#F8EDD8', mat: 'clay', g: 'dB', k: 0 }),
    cap([0.6, 1.36, 0], [0.86, 2.2, 0], 0.03, { color: '#8D97A0', mat: 'metal', g: 'a', k: 0 }),
    sphere(0.07, { at: [0.88, 2.24, 0], color: '#E9B54C', mat: 'glow', g: 'aT', k: 0 }),
  ];
}

module.exports = { carBody, truck, bus, roadCone, barrier, conebot, drumbot, signbot, bolt, wrench, postcard, gearPart, spark, POWERS, mango, acacia, palm, banana, bamboo, narra, hedge, flowers, grass, nipa, house, sari, stall, shophouse, tower, pole, pylon, lamp, billboard, kmpost, sos, sign, carabao, haystack, parolPost, overpass, cloud, hillsFar, hillsNear, arayat, pinatubo, skyline, machine, MACHINE_SKINS, charm, radio };
void RUBBER;
void CREAM;
