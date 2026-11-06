/**
 * The heroes as clay models. Silhouette first: each must read at driving size and in
 * grayscale, and what makes it Filipino (or what it is) is in its shape, not only its
 * paint. Nose points at +z. Faces are sculpted on by scenes/sculpt.js from the `sculpt`
 * spec at the end of this file; rear views use the plain parts.
 */
const { sphere, ell, box, cyl, cap, cone, tor, sub, paint } = require('../sdf');
const { wheels, arches, headlights, tailLights, mirrors, windowPaint, wheel, CREAM, GLASS } = require('./polish');
const { navie } = require('./navie');
const { chibify, remapSpec } = require('./chibi');

// -- Kuya Jepoy: the red jeepney. Long body, flat overhanging roof, a gold dome on top. --------------
function jepoy() {
  const RED = '#BE4B3F';
  const DEEP = '#8E362E';
  const GOLD = '#E9B54C';
  const STEEL = '#C9C2B2';
  return [
    box(1.46, 0.9, 2.5, 0.42, { at: [0, 1.5, -0.46], color: RED, mat: 'paint', g: 'body', k: 0.06 }),
    box(1.3, 0.5, 0.9, 0.3, { at: [0, 1.22, 1.96], color: RED, mat: 'paint', g: 'body', k: 0.26 }),
    ...arches('body', 1.46, 1.74, -1.7, 0.8),
    ...wheels(1.3, 1.74, -1.7, 0.6, 0.3, '#D9CFB8'),
    // The roof: a broad flat plate with a little crown of chrome along its edge.
    box(1.72, 0.14, 2.86, 0.12, { at: [0, 3.02, -0.34], color: '#F2E6CE', mat: 'clay', g: 'roof', k: 0 }),
    box(1.5, 0.2, 2.5, 0.14, { at: [0, 3.2, -0.38], color: '#A9434F', mat: 'paint', g: 'rack', k: 0 }),
    ...[-1.38, 1.38].flatMap((x) => [1.3, -0.1, -1.5, -2.76].map((z) => cap([x, 2.3, z], [x, 3.0, z], 0.08, { color: STEEL, mat: 'metal', g: `pil${x}${z}`, k: 0 }))),
    // The windscreen is the pale face: flush with the body, between hood and roof.
    box(1.16, 0.5, 0.08, 0.14, { at: [0, 2.32, 2.02], color: CREAM, mat: 'clay', g: 'screen', k: 0 }),
    // The open sides and back: a dark cabin you can look into, benches inside.
    box(1.3, 0.56, 2.2, 0.1, { at: [0, 2.42, -0.72], color: '#3A3530', mat: 'clay', g: 'cabin', k: 0 }),
    // Stripes down the side.
    paint(box(1.6, 0.11, 3.0, 0.02, { at: [0, 1.82, -0.5], color: GOLD, mat: 'paint', soft: 0.012 })),
    paint(box(1.6, 0.07, 3.0, 0.02, { at: [0, 1.56, -0.5], color: '#3E74B9', mat: 'paint', soft: 0.012 })),
    // Grille: pale slats and a big warm bumper.
    box(0.82, 0.3, 0.08, 0.06, { at: [0, 1.28, 2.84], color: STEEL, mat: 'metal', g: 'grille', k: 0 }),
    ...[-0.48, -0.24, 0, 0.24, 0.48].map((x) => box(0.035, 0.24, 0.05, 0.02, { at: [x, 1.28, 2.92], color: DEEP, g: `sl${x}`, k: 0 })),
    box(1.5, 0.17, 0.2, 0.15, { at: [0, 0.74, 2.86], color: STEEL, mat: 'metal', g: 'fb', k: 0 }),
    ...headlights(1.02, 1.32, 2.72, 0.27),
    // A small star ornament where the old horse used to stand.
    cap([0, 1.72, 2.5], [0, 1.96, 2.56], 0.05, { color: STEEL, mat: 'metal', g: 'orn', k: 0 }),
    sphere(0.13, { at: [0, 2.02, 2.58], color: GOLD, mat: 'paint', g: 'orn2', k: 0 }),
    // Back: a step, mud flaps, lights and a little sign.
    box(1.1, 0.08, 0.28, 0.06, { at: [0, 0.84, -3.0], color: STEEL, mat: 'metal', g: 'step', k: 0 }),
    ...tailLights(1.12, 1.56, -2.96),
    box(0.26, 0.28, 0.03, 0.02, { at: [1.12, 0.62, -2.5], color: '#3A3530', mat: 'rubber', g: 'flapA', k: 0 }),
    box(0.26, 0.28, 0.03, 0.02, { at: [-1.12, 0.62, -2.5], color: '#3A3530', mat: 'rubber', g: 'flapB', k: 0 }),
    ...mirrors(1.62, 2.1, 1.3, RED, RED),
    // The gold dome on the roof, on a small flat base.
    cyl(0.46, 0.05, 0.04, { at: [0, 3.42, 0.5], color: GOLD, mat: 'paint', g: 'domeB', k: 0 }),
    ell(0.34, 0.32, 0.34, { at: [0, 3.5, 0.5], color: '#F1B93E', mat: 'paint', g: 'dome', k: 0 }),
    sub(box(0.6, 0.3, 0.6, 0.02, { at: [0, 3.18, 0.5], g: 'dome', k: 0 })),
  ];
}

// -- Kiko: the mint student multicab, notebook-sided, a pencil on the rack, an antenna with a star. ---------
function kiko() {
  const MINT = '#69AFA4';
  const DEEP = '#3F7F76';
  const WHITE = '#F8F1E2';
  const GOLD = '#E9B54C';
  return [
    box(1.36, 0.6, 1.9, 0.42, { at: [0, 1.06, 0], color: MINT, mat: 'paint', g: 'body', k: 0.1 }),
    box(1.32, 0.84, 1.84, 0.46, { at: [0, 2.2, -0.06], color: WHITE, mat: 'paint', g: 'body', k: 0.1, taper: 0.06 }),
    paint(box(1.7, 0.2, 2.3, 0.02, { at: [0, 1.62, -0.06], color: MINT, mat: 'paint', soft: 0.02, on: 'body' })),
    ...arches('body', 1.36, 1.2, -1.2, 0.76),
    ...wheels(1.2, 1.2, -1.2, 0.56, 0.28, '#E7D9BB'),
    // Face panel and the back window; a notebook's ruled lines on each flank.
    paint(ell(1.0, 0.68, 0.5, { at: [0, 2.24, 1.7], color: '#FBF6EA', mat: 'clay', soft: 0.018 })),
    windowPaint(0.9, 0.46, 0.4, [0, 2.36, -1.86]),
    ...[2.0, 2.28, 2.56].flatMap((y) => [paint(box(0.3, 0.018, 1.2, 0.01, { at: [1.28, y, -0.2], color: '#8FB6D6', mat: 'paper', soft: 0.008 })), paint(box(0.3, 0.018, 1.2, 0.01, { at: [-1.28, y, -0.2], color: '#8FB6D6', mat: 'paper', soft: 0.008 }))]),
    paint(box(0.3, 0.72, 0.03, 0.01, { at: [1.28, 2.26, -1.1], color: '#D7A9A2', mat: 'paper', soft: 0.008 })),
    paint(box(0.3, 0.72, 0.03, 0.01, { at: [-1.28, 2.26, -1.1], color: '#D7A9A2', mat: 'paper', soft: 0.008 })),
    box(1.2, 0.16, 0.2, 0.14, { at: [0, 0.68, 1.92], color: DEEP, g: 'fb', k: 0 }),
    box(1.2, 0.16, 0.2, 0.14, { at: [0, 0.68, -1.92], color: DEEP, g: 'rb', k: 0 }),
    ...headlights(0.8, 1.16, 1.92, 0.3),
    ...tailLights(0.86, 1.2, -1.96),
    ...mirrors(1.6, 2.0, 1.1, MINT, DEEP),
    // Roof rack with the pencil lying on it.
    ...[-1, 1].map((s) => box(0.05, 0.05, 1.2, 0.03, { at: [s * 0.86, 3.08, -0.1], color: DEEP, g: `rail${s}`, k: 0 })),
    cap([-0.1, 3.24, 0.84], [-0.1, 3.24, -0.9], 0.13, { color: GOLD, mat: 'paint', g: 'pencil', k: 0 }),
    cone(0.13, 0.02, 0.16, { at: [-0.1, 3.24, 1.06], rot: [90, 0, 0], color: CREAM, g: 'tip', k: 0 }),
    sphere(0.13, { at: [-0.1, 3.24, -0.98], color: '#D7A9A2', g: 'eraser', k: 0 }),
    // Antenna with a star on it.
    cap([0.72, 3.0, -0.8], [0.72, 4.1, -0.8], 0.03, { color: DEEP, g: 'ant', k: 0 }),
    sphere(0.17, { at: [0.72, 4.18, -0.8], color: GOLD, mat: 'glow', g: 'antTip', k: 0 }),
  ];
}

// -- Berto: the carabao pickup. Low nose, horn fenders, a salakot for a roof, a farm's load in the bed. --------
function berto() {
  const HIDE = '#5F6670';
  const DEEP = '#454B55';
  const STRAW = '#F0BE55';
  const MUZZLE = '#EBE0CC';
  return [
    box(1.56, 0.62, 2.3, 0.44, { at: [0, 1.32, -0.1], color: HIDE, mat: 'clay', g: 'body', k: 0.1 }),
    ell(1.28, 0.72, 0.96, { at: [0, 1.36, 2.0], color: HIDE, mat: 'clay', g: 'body', k: 0.46 }),
    ...arches('body', 1.56, 1.46, -1.5, 0.98),
    ...wheels(1.42, 1.46, -1.5, 0.76, 0.36, '#C9B38A'),
    // A pale muzzle with nostril lamps.
    paint(ell(0.92, 0.46, 0.5, { at: [0, 1.14, 2.72], color: MUZZLE, mat: 'clay', soft: 0.04 })),
    ...headlights(0.46, 1.2, 2.88, 0.2, '#F0E5C8'),
    box(1.32, 0.15, 0.2, 0.12, { at: [0, 0.7, 2.66], color: DEEP, g: 'fb', k: 0 }),
    // Cabin under the salakot.
    box(1.24, 0.72, 0.92, 0.4, { at: [0, 2.3, 0.4], color: HIDE, mat: 'clay', g: 'cabin', k: 0.2, taper: 0.06 }),
    paint(ell(0.96, 0.54, 0.4, { at: [0, 2.34, 1.2], color: '#F2E8D4', mat: 'clay', soft: 0.02 })),
    windowPaint(0.84, 0.36, 0.3, [0, 2.42, -0.5]),
    ell(2.2, 0.15, 1.9, { at: [0, 3.14, 0.16], bend: 0.05, rot: [-9, 0, 0], color: STRAW, mat: 'painted', g: 'salakot', k: 0.3 }),
    ell(1.2, 0.56, 1.1, { at: [0, 3.36, 0.1], rot: [-9, 0, 0], color: STRAW, mat: 'painted', g: 'salakot', k: 0.3 }),
    sphere(0.16, { at: [0, 3.96, 0.0], color: '#E6AE45', mat: 'painted', g: 'salakotTop', k: 0 }),
    // Curved horn fenders sweeping out from the cab.
    cap([1.04, 2.32, 0.7], [1.6, 2.5, 0.8], 0.15, { color: MUZZLE, mat: 'clay', g: 'hornA', k: 0.1 }),
    cap([-1.04, 2.32, 0.7], [-1.6, 2.5, 0.8], 0.15, { color: MUZZLE, mat: 'clay', g: 'hornB', k: 0.1 }),
    // The bed: crate, sacks, a bunch of something green.
    box(1.3, 0.12, 1.2, 0.06, { at: [0, 2.0, -1.5], color: '#7E5F3E', mat: 'wood', g: 'bed', k: 0 }),
    box(0.62, 0.42, 0.56, 0.08, { at: [0.5, 2.44, -1.4], color: '#A97F52', mat: 'wood', g: 'crate', k: 0 }),
    ell(0.5, 0.4, 0.42, { at: [-0.56, 2.38, -1.72], color: '#CDB68C', mat: 'fabric', g: 'sack', k: 0 }),
    ell(0.42, 0.34, 0.38, { at: [-0.5, 2.36, -0.98], color: '#BFA87C', mat: 'fabric', g: 'sack2', k: 0 }),
    ell(0.3, 0.3, 0.3, { at: [0.5, 3.0, -1.42], color: '#78A464', mat: 'leaf', g: 'greens', k: 0 }),
    ...tailLights(1.08, 1.5, -2.4),
    box(1.32, 0.15, 0.18, 0.12, { at: [0, 0.82, -2.44], color: DEEP, g: 'rb', k: 0 }),
  ];
}

// -- Ligaya: the fiesta microbus. Tall and round, bunting on every edge, a great brass bell on the roof. --------
function ligaya() {
  const GUAVA = '#E2686F';
  const SUN = '#E9B54C';
  const CREAMY = '#F8EDD8';
  const PLUM = '#7D4F68';
  return [
    box(1.44, 1.36, 2.32, 0.78, { at: [0, 2.06, -0.1], color: GUAVA, mat: 'paint', g: 'body', k: 0.1 }),
    ...arches('body', 1.44, 1.42, -1.42, 0.78),
    ...wheels(1.26, 1.42, -1.42, 0.58, 0.28, SUN),
    paint(box(1.6, 0.4, 2.6, 0.1, { at: [0, 1.02, -0.1], color: CREAMY, mat: 'paint', soft: 0.014 })),
    paint(ell(1.04, 0.74, 0.6, { at: [0, 2.46, 2.0], color: CREAMY, mat: 'clay', soft: 0.018 })),
    windowPaint(0.92, 0.6, 0.4, [0, 2.5, -2.3], GLASS, 0.34),
    ...[0.9, -0.1, -1.1].flatMap((z) => [windowPaint(0.4, 0.36, 0.34, [1.36, 2.5, z], GLASS, 0.18), windowPaint(0.4, 0.36, 0.34, [-1.36, 2.5, z], GLASS, 0.18)]),
    box(1.3, 0.16, 0.2, 0.14, { at: [0, 0.72, 2.24], color: PLUM, g: 'fb', k: 0 }),
    box(1.3, 0.16, 0.2, 0.14, { at: [0, 0.72, -2.44], color: PLUM, g: 'rb', k: 0 }),
    ...headlights(0.88, 1.34, 2.2, 0.28),
    ...tailLights(0.96, 1.42, -2.42),
    ...mirrors(1.66, 2.26, 1.5, GUAVA, PLUM),
    // The brass bell of a tuba rising from the roof: the bus's whole personality.
    cap([0, 3.42, -0.7], [0, 3.82, -0.7], 0.14, { color: SUN, mat: 'metal', g: 'tuba', k: 0.1 }),
    cap([0, 3.82, -0.7], [0, 4.0, -0.2], 0.14, { color: SUN, mat: 'metal', g: 'tuba', k: 0.1 }),
    cone(0.14, 0.5, 0.28, { at: [0, 4.0, 0.14], rot: [78, 0, 0], color: SUN, mat: 'metal', g: 'tuba', k: 0.06 }),
    sub(cone(0.08, 0.42, 0.25, { at: [0, 4.05, 0.26], rot: [78, 0, 0], g: 'tuba', k: 0.02 })),
  ];
}

// -- Hiraya (the proposal's "Tala": that name already belongs to a sidekick). The starlit roadster. ------------
function hiraya() {
  const INDIGO = '#3F4A86';
  const NIGHT = '#2B3264';
  const GOLD = '#E9B54C';
  const PALE = '#F4E8CC';
  const star = (at, r) => paint(sphere(r, { at, color: PALE, mat: 'glow', soft: 0.018 }));
  return [
    box(1.5, 0.52, 2.36, 0.44, { at: [0, 1.0, -0.1], color: INDIGO, mat: 'paint', g: 'body', k: 0.1 }),
    ell(1.3, 0.5, 1.1, { at: [0, 1.14, 1.34], color: INDIGO, mat: 'paint', g: 'body', k: 0.5 }),
    ell(1.42, 0.5, 0.8, { at: [0, 1.28, -1.86], color: INDIGO, mat: 'paint', g: 'body', k: 0.4 }),
    ...arches('body', 1.5, 1.48, -1.48, 0.8),
    ...wheels(1.32, 1.48, -1.48, 0.6, 0.32, GOLD),
    // A small rounded bubble cabin with the pale face.
    ell(1.1, 0.76, 1.02, { at: [0, 1.72, -0.28], color: NIGHT, mat: 'glass', g: 'bubble', k: 0.06 }),
    paint(ell(0.82, 0.5, 0.4, { at: [0, 1.82, 0.56], color: PALE, mat: 'clay', soft: 0.018 })),
    // A curve of gold over the hood and tail fins.
    box(1.3, 0.13, 0.16, 0.1, { at: [0, 0.62, 2.28], color: GOLD, mat: 'metal', g: 'fb', k: 0 }),
    ...[-1, 1].map((s) => cap([s * 1.2, 1.5, -1.9], [s * 1.5, 2.2, -2.5], 0.13, { color: INDIGO, mat: 'paint', g: `fin${s}`, k: 0 })),
    ...[-1, 1].map((s) => sphere(0.13, { at: [s * 1.5, 2.26, -2.54], color: GOLD, mat: 'glow', g: `finT${s}`, k: 0 })),
    ...headlights(0.76, 1.08, 2.26, 0.25, '#FFF1C6'),
    ...tailLights(0.9, 1.14, -2.52, '#D88A5C', 0.3, 0.13),
    // The roof ornament: a crescent and a star on a slim stalk.
    cap([0, 2.42, -0.28], [0, 2.86, -0.28], 0.05, { color: GOLD, mat: 'metal', g: 'stalk', k: 0 }),
    tor(0.34, 0.08, { at: [0, 3.12, -0.28], rot: [90, 0, 0], color: GOLD, mat: 'metal', g: 'moon', k: 0.02 }),
    sub(sphere(0.3, { at: [0.2, 3.2, -0.28], g: 'moon', k: 0.02 })),
    sphere(0.14, { at: [0.14, 3.2, -0.28], color: PALE, mat: 'glow', g: 'moonStar', k: 0 }),
    // Painted stars on the flanks.
    star([1.46, 1.12, 0.3], 0.07), star([1.46, 0.92, -0.5], 0.05), star([1.46, 1.26, -1.1], 0.06),
    star([-1.46, 1.12, 0.3], 0.07), star([-1.46, 0.92, -0.5], 0.05), star([-1.46, 1.26, -1.1], 0.06),
    star([0.7, 1.46, -2.12], 0.05), star([-0.5, 1.5, -2.2], 0.06), star([0.1, 1.2, -2.48], 0.05),
  ];
}

// -- Sinta: the amber repair van. Square shoulders, capiz-paned windows, tool boxes, a ladder on the roof. --------
function sinta() {
  const AMBER = '#D49A4A';
  const DEEP = '#9C6C2E';
  const CAPIZ = '#F2E8D4';
  const LEAD = '#8C6E46';
  const panes = (x, zs, ys) => zs.flatMap((z) => ys.map((y) => paint(box(0.4, 0.11, 0.11, 0.03, { at: [x, y, z], color: CAPIZ, mat: 'paper', soft: 0.008 }))));
  return [
    box(1.5, 1.28, 2.2, 0.56, { at: [0, 1.98, -0.1], color: AMBER, mat: 'paint', g: 'body', k: 0.1 }),
    ...arches('body', 1.5, 1.36, -1.36, 0.8),
    ...wheels(1.32, 1.36, -1.36, 0.6, 0.3, CAPIZ),
    paint(ell(1.1, 0.72, 0.6, { at: [0, 2.28, 1.9], color: '#FAF2E2', mat: 'clay', soft: 0.018 })),
    // Capiz-lattice side windows: a dark frame with pale panes.
    paint(box(0.4, 0.5, 0.82, 0.08, { at: [1.42, 2.46, -0.46], color: LEAD, mat: 'wood', soft: 0.012 })),
    paint(box(0.4, 0.5, 0.82, 0.08, { at: [-1.42, 2.46, -0.46], color: LEAD, mat: 'wood', soft: 0.012 })),
    ...panes(1.42, [-1.0, -0.73, -0.46, -0.19, 0.08], [2.16, 2.46, 2.76]),
    ...panes(-1.42, [-1.0, -0.73, -0.46, -0.19, 0.08], [2.16, 2.46, 2.76]),
    // Back doors, split, with a capiz window each.
    paint(box(0.04, 1.0, 0.4, 0.01, { at: [0, 2.0, -2.26], color: DEEP, mat: 'paint', soft: 0.012 })),
    paint(box(0.42, 0.4, 0.4, 0.08, { at: [0.62, 2.5, -2.26], color: LEAD, mat: 'wood', soft: 0.012 })),
    paint(box(0.42, 0.4, 0.4, 0.08, { at: [-0.62, 2.5, -2.26], color: LEAD, mat: 'wood', soft: 0.012 })),
    ...[-0.8, -0.44, 0.44, 0.8].flatMap((x) => [2.32, 2.68].map((y) => paint(box(0.13, 0.13, 0.4, 0.03, { at: [x, y, -2.26], color: CAPIZ, mat: 'paper', soft: 0.008 })))),
    box(1.34, 0.17, 0.2, 0.14, { at: [0, 0.72, 2.12], color: DEEP, g: 'fb', k: 0 }),
    box(1.34, 0.17, 0.2, 0.14, { at: [0, 0.72, -2.34], color: DEEP, g: 'rb', k: 0 }),
    ...headlights(0.92, 1.24, 2.1, 0.28),
    ...tailLights(1.1, 1.3, -2.32),
    ...mirrors(1.72, 2.2, 1.2, AMBER, DEEP),
    // Side toolboxes.
    box(0.14, 0.26, 0.6, 0.06, { at: [1.56, 1.26, 0], color: '#69AFA4', mat: 'paint', g: 'toolA', k: 0 }),
    box(0.14, 0.26, 0.6, 0.06, { at: [-1.56, 1.26, 0], color: '#69AFA4', mat: 'paint', g: 'toolB', k: 0 }),
    // Roof: ladder and a large wrench.
    ...[-0.5, 0.5].map((x) => box(0.05, 0.05, 1.8, 0.03, { at: [x, 3.4, -0.1], color: '#C9B38A', mat: 'wood', g: `lad${x}`, k: 0 })),
    ...[-1.3, -0.65, 0, 0.65, 1.3].map((z) => box(0.5, 0.03, 0.04, 0.02, { at: [0, 3.42, -0.1 + z], color: '#C9B38A', mat: 'wood', g: `rung${z}`, k: 0 })),
    cap([1.0, 3.42, 0.8], [1.0, 3.42, -0.4], 0.09, { color: '#9AA6A8', mat: 'metal', g: 'wr', k: 0.04 }),
    tor(0.22, 0.07, { at: [1.0, 3.42, 0.96], color: '#9AA6A8', mat: 'metal', g: 'wr', k: 0.04 }),
  ];
}

// -- Amihan: the kite coupe. Light and low, sail fins, a kite frame for a spoiler, a long ribbon tail. -------------
function amihan() {
  const SKY = '#9CC7D6';
  const CREAMY = '#F8F0DE';
  const CORAL = '#D88C78';
  const JADE = '#69AFA4';
  const tail = (x, z, y) => ell(0.13, 0.05, 0.2, { at: [x, y, z], rot: [18, 0, 0], color: [CORAL, JADE, CREAMY][Math.abs(Math.round(z * 2)) % 3], mat: 'fabric', g: `rib${z}`, k: 0 });
  return [
    box(1.36, 0.46, 2.14, 0.4, { at: [0, 0.96, -0.04], color: SKY, mat: 'paint', g: 'body', k: 0.1 }),
    ell(1.2, 0.5, 1.1, { at: [0, 1.04, 1.2], color: SKY, mat: 'paint', g: 'body', k: 0.5 }),
    ...arches('body', 1.36, 1.3, -1.3, 0.7),
    ...wheels(1.18, 1.3, -1.3, 0.52, 0.24, CREAMY),
    ell(1.04, 0.72, 1.12, { at: [0, 1.66, -0.4], color: CREAMY, mat: 'paint', g: 'bubble', k: 0.06 }),
    paint(ell(0.84, 0.5, 0.4, { at: [0, 1.78, 0.5], color: '#FFF9EC', mat: 'clay', soft: 0.018 })),
    windowPaint(0.78, 0.32, 0.3, [0, 1.86, -1.38], GLASS, 0.14),
    // Sail fins off both sides: thin triangles of fabric stretched over a rib.
    ...[-1, 1].flatMap((s) => [
      box(0.42, 0.04, 0.72, 0.03, { at: [s * 1.5, 1.18, -0.36], rot: [0, s * 8, s * 14], color: CORAL, mat: 'fabric', g: `sail${s}`, k: 0 }),
      cap([s * 1.14, 1.08, 0.3], [s * 1.86, 1.28, -0.6], 0.04, { color: '#8C6E46', mat: 'wood', g: `rib${s}`, k: 0 }),
    ]),
    // The diamond kite frame that stands over the tail.
    box(0.8, 0.8, 0.03, 0.02, { at: [0, 2.5, -1.9], rot: [-10, 0, 45], color: CREAMY, mat: 'paper', g: 'kite', k: 0 }),
    paint(box(0.4, 0.4, 0.2, 0.02, { at: [0.57, 2.5, -1.9], rot: [-10, 0, 45], color: CORAL, mat: 'paper', soft: 0.01 })),
    paint(box(0.4, 0.4, 0.2, 0.02, { at: [-0.57, 2.5, -1.9], rot: [-10, 0, 45], color: JADE, mat: 'paper', soft: 0.01 })),
    cap([0, 1.5, -1.8], [0, 3.6, -1.96], 0.035, { color: '#8C6E46', mat: 'wood', g: 'kiteA', k: 0 }),
    cap([-1.05, 2.5, -1.92], [1.05, 2.5, -1.92], 0.035, { color: '#8C6E46', mat: 'wood', g: 'kiteB', k: 0 }),
    // Ribbon tail.
    tail(0.1, -2.26, 1.32), tail(-0.1, -2.62, 1.16), tail(0.14, -2.98, 1.02), tail(-0.12, -3.3, 0.9),
    box(1.2, 0.12, 0.16, 0.1, { at: [0, 0.6, 2.12], color: JADE, g: 'fb', k: 0 }),
    ...headlights(0.74, 1.04, 2.14, 0.24),
    ...tailLights(0.86, 1.1, -2.12, '#D88A5C', 0.26, 0.12),
  ];
}

// -- Kidlat: the storm-tech hatch. Compact, big wheels, one great capacitor standing on the roof. ---------------------
function kidlat() {
  const SLATE = '#3C5258';
  const DEEP = '#2B3B40';
  const YELLOW = '#E9C44C';
  const PALE = '#EFF3E2';
  const zig = (s) => [
    paint(box(0.3, 0.09, 0.4, 0.02, { at: [s * 1.4, 1.6, 0.34], rot: [38, 0, 0], color: YELLOW, mat: 'paint', soft: 0.01 })),
    paint(box(0.3, 0.09, 0.4, 0.02, { at: [s * 1.4, 1.36, 0.0], rot: [0, 0, 0], color: YELLOW, mat: 'paint', soft: 0.01 })),
    paint(box(0.3, 0.09, 0.4, 0.02, { at: [s * 1.4, 1.14, -0.32], rot: [38, 0, 0], color: YELLOW, mat: 'paint', soft: 0.01 })),
  ];
  return [
    box(1.46, 0.8, 1.86, 0.5, { at: [0, 1.32, 0], color: SLATE, mat: 'paint', g: 'body', k: 0.1 }),
    ell(1.3, 0.52, 0.86, { at: [0, 1.42, 1.1], color: SLATE, mat: 'paint', g: 'body', k: 0.36 }),
    ...arches('body', 1.46, 1.16, -1.16, 0.94),
    ...wheels(1.34, 1.16, -1.16, 0.72, 0.36, YELLOW),
    box(1.22, 0.74, 1.08, 0.42, { at: [0, 2.46, -0.26], color: DEEP, mat: 'paint', g: 'cabin', k: 0.16, taper: 0.1 }),
    paint(ell(0.92, 0.56, 0.4, { at: [0, 2.46, 0.66], color: PALE, mat: 'clay', soft: 0.018 })),
    windowPaint(0.86, 0.4, 0.3, [0, 2.56, -1.3], '#2F4A52', 0.14),
    ...zig(1), ...zig(-1),
    box(1.3, 0.17, 0.2, 0.14, { at: [0, 0.8, 1.84], color: DEEP, g: 'fb', k: 0 }),
    box(1.3, 0.17, 0.2, 0.14, { at: [0, 0.8, -1.84], color: DEEP, g: 'rb', k: 0 }),
    ...headlights(0.84, 1.34, 1.86, 0.27, '#F4EDB5'),
    ...tailLights(0.92, 1.5, -1.88, '#E0B24C', 0.28, 0.14),
    // The capacitor: copper rings round a jar, a bright cap, two leads to the roof.
    cyl(0.5, 0.56, 0.1, { at: [0, 3.82, -0.4], color: '#5B7C84', mat: 'glass', g: 'cap', k: 0 }),
    ...[3.52, 3.82, 4.12].map((y) => tor(0.5, 0.05, { at: [0, y, -0.4], color: '#C9884E', mat: 'metal', g: `ring${y}`, k: 0 })),
    sphere(0.22, { at: [0, 4.46, -0.4], color: YELLOW, mat: 'glow', g: 'capTop', k: 0 }),
    cap([-0.4, 3.2, -0.4], [-0.3, 3.34, -0.4], 0.07, { color: '#C9884E', mat: 'metal', g: 'leadA', k: 0 }),
    cap([0.4, 3.2, -0.4], [0.3, 3.34, -0.4], 0.07, { color: '#C9884E', mat: 'metal', g: 'leadB', k: 0 }),
  ];
}

// -- Nico: the detective wagon. A long wagon in cream and teal under a raincoat-hood canopy, with a searchlight. --------
function nico() {
  const CREAMY = '#EEE2C8';
  const TEAL = '#3F8A88';
  const COAT = '#B79A66';
  const DEEP = '#2F6B6A';
  return [
    box(1.44, 0.62, 2.56, 0.46, { at: [0, 1.14, -0.3], color: CREAMY, mat: 'paint', g: 'body', k: 0.1 }),
    ell(1.28, 0.5, 0.96, { at: [0, 1.24, 1.66], color: CREAMY, mat: 'paint', g: 'body', k: 0.5 }),
    ...arches('body', 1.44, 1.46, -1.72, 0.8),
    ...wheels(1.28, 1.46, -1.72, 0.6, 0.3, TEAL),
    paint(box(1.6, 0.2, 3.2, 0.02, { at: [0, 0.9, -0.3], color: TEAL, mat: 'paint', soft: 0.012 })),
    // Cabin up front.
    box(1.22, 0.7, 0.88, 0.4, { at: [0, 2.14, 0.42], color: CREAMY, mat: 'paint', g: 'cabin', k: 0.2, taper: 0.06 }),
    paint(ell(0.94, 0.52, 0.4, { at: [0, 2.16, 1.22], color: '#FBF5E6', mat: 'clay', soft: 0.018 })),
    // The canopy: a long raincoat hood over the wagon's back, belted.
    ell(1.36, 1.12, 1.9, { at: [0, 1.76, -1.3], color: COAT, mat: 'fabric', g: 'hood', k: 0.05 }),
    sub(box(2.4, 1.2, 3, 0.05, { at: [0, 0.54, -1.3], g: 'hood', k: 0.04 })),
    paint(box(1.6, 0.11, 2.4, 0.02, { at: [0, 2.05, -1.3], color: '#6E5A3C', mat: 'fabric', soft: 0.012 })),
    paint(box(0.2, 0.14, 2.4, 0.02, { at: [0, 2.05, -1.3], color: '#E9B54C', mat: 'metal', soft: 0.012 })),
    windowPaint(0.74, 0.34, 0.3, [0, 2.0, -3.06], GLASS, 0.16),
    box(1.28, 0.16, 0.2, 0.14, { at: [0, 0.72, 2.38], color: DEEP, g: 'fb', k: 0 }),
    box(1.28, 0.16, 0.2, 0.14, { at: [0, 0.72, -2.92], color: DEEP, g: 'rb', k: 0 }),
    ...headlights(0.8, 1.22, 2.36, 0.25),
    ...tailLights(0.96, 1.36, -2.9, '#CF5B4C', 0.22, 0.14),
    ...mirrors(1.56, 2.06, 0.9, CREAMY, DEEP),
    // Searchlight on a yoke.
    cap([0, 2.8, 0.4], [0, 3.1, 0.4], 0.07, { color: DEEP, mat: 'metal', g: 'yoke', k: 0 }),
    cyl(0.32, 0.26, 0.08, { at: [0, 3.34, 0.46], rot: [66, 0, 0], color: DEEP, mat: 'metal', g: 'lamp', k: 0.02 }),
    ell(0.24, 0.24, 0.06, { at: [0, 3.46, 0.74], rot: [-24, 0, 0], color: '#FFF3C4', mat: 'glow', g: 'lampGlass', k: 0 }),
    // A magnifier hanging at the side, as a badge.
    tor(0.24, 0.05, { at: [1.5, 1.42, -0.4], rot: [0, 0, 90], color: '#9AA6A8', mat: 'metal', g: 'mag', k: 0.02 }),
    cap([1.5, 1.2, -0.56], [1.5, 0.96, -0.76], 0.05, { color: '#6E5A3C', mat: 'wood', g: 'magH', k: 0 }),
  ];
}

// -- Alon: the nautical courier van. Wave-cut bodywork, portholes, rope trim, a life ring and a pennant. ---------------
function alon() {
  const SEA = '#3C6E9A';
  const FOAM = '#F4EEDF';
  const ROPE = '#C9A772';
  const CORAL = '#D88C78';
  const wave = (x, z) => paint(ell(0.5, 0.42, 0.6, { at: [x, 1.7, z], color: SEA, mat: 'paint', soft: 0.014 }));
  return [
    box(1.46, 1.3, 2.24, 0.68, { at: [0, 2.0, -0.1], color: FOAM, mat: 'paint', g: 'body', k: 0.1 }),
    ...arches('body', 1.46, 1.38, -1.38, 0.8),
    ...wheels(1.28, 1.38, -1.38, 0.6, 0.3, FOAM),
    // The lower hull in sea blue, its top edge cut into waves.
    paint(box(1.6, 0.44, 2.6, 0.04, { at: [0, 1.14, -0.1], color: SEA, mat: 'paint', soft: 0.014 })),
    ...[1.2, 0.5, -0.2, -0.9, -1.6].flatMap((z) => [wave(1.3, z), wave(-1.3, z)]),
    ...[-0.9, -0.1, 0.7].map((x) => paint(ell(0.42, 0.34, 0.4, { at: [x, 1.66, -2.24], color: SEA, mat: 'paint', soft: 0.014 }))),
    paint(ell(1.02, 0.66, 0.6, { at: [0, 2.46, 1.96], color: '#FBF6E8', mat: 'clay', soft: 0.018 })),
    // Portholes and rope along the shoulders.
    ...[0.5, -0.5, -1.5].flatMap((z) => [1, -1].flatMap((s) => [paint(sphere(0.33, { at: [s * 1.46, 2.5, z], color: ROPE, mat: 'wood', soft: 0.012 })), paint(sphere(0.25, { at: [s * 1.46, 2.5, z], color: GLASS, mat: 'glass', soft: 0.012 }))])),
    paint(sphere(0.48, { at: [0, 2.56, -2.34], color: ROPE, mat: 'wood', soft: 0.012 })),
    paint(sphere(0.38, { at: [0, 2.56, -2.34], color: GLASS, mat: 'glass', soft: 0.012 })),
    box(1.32, 0.16, 0.2, 0.14, { at: [0, 0.72, 2.2], color: ROPE, mat: 'wood', g: 'fb', k: 0 }),
    box(1.32, 0.16, 0.2, 0.14, { at: [0, 0.72, -2.4], color: ROPE, mat: 'wood', g: 'rb', k: 0 }),
    ...headlights(0.88, 1.3, 2.18, 0.27),
    ...tailLights(0.98, 1.34, -2.38),
    ...mirrors(1.68, 2.24, 1.36, FOAM, SEA),
    // A life ring on the flank, parcels on the roof, a mast and pennant.
    tor(0.36, 0.11, { at: [1.5, 1.86, -0.6], rot: [0, 0, 90], color: CORAL, mat: 'clay', g: 'lifeA', k: 0 }),
    tor(0.36, 0.11, { at: [-1.5, 1.86, -0.6], rot: [0, 0, 90], color: CORAL, mat: 'clay', g: 'lifeB', k: 0 }),
    box(0.46, 0.26, 0.54, 0.06, { at: [0.5, 3.52, -0.5], color: '#C9A772', mat: 'paper', g: 'parcelA', k: 0 }),
    box(0.36, 0.2, 0.4, 0.05, { at: [-0.44, 3.46, -0.9], color: '#E3CFA4', mat: 'paper', g: 'parcelB', k: 0 }),
    cap([-0.5, 3.28, 0.2], [-0.5, 4.6, 0.2], 0.04, { color: '#8C6E46', mat: 'wood', g: 'mast', k: 0 }),
    box(0.03, 0.2, 0.36, 0.02, { at: [-0.5, 4.42, -0.14], color: CORAL, mat: 'fabric', g: 'pennant', k: 0 }),
  ];
}

// -- Tiko: the horse-spirited buggy. A long canopy like a neck, ears on top, a mane down its spine, a swishing tail. -----
function tiko() {
  const CHESTNUT = '#9C6240';
  const DEEP = '#6F4228';
  const MANE = '#3C6E6A';
  const PALE = '#F4E6CE';
  const mane = (z, y) => ell(0.16, 0.26, 0.22, { at: [0, y, z], rot: [-20, 0, 0], color: MANE, mat: 'fabric', g: `mane${z}`, k: 0 });
  return [
    box(1.34, 0.46, 2.1, 0.4, { at: [0, 1.04, -0.2], color: CHESTNUT, mat: 'wood', g: 'body', k: 0.1 }),
    ell(1.1, 0.5, 0.86, { at: [0, 1.14, 1.3], color: CHESTNUT, mat: 'wood', g: 'body', k: 0.4 }),
    ...arches('body', 1.34, 1.3, -1.46, 0.82),
    ...wheels(1.24, 1.3, -1.46, 0.64, 0.26, PALE),
    // The long canopy rising forward like a neck, the head high and proud.
    box(1.0, 0.82, 1.26, 0.48, { at: [0, 2.44, 0.5], rot: [14, 0, 0], color: CHESTNUT, mat: 'wood', g: 'neck', k: 0.3 }),
    box(1.08, 0.5, 1.8, 0.42, { at: [0, 2.08, -0.86], color: CHESTNUT, mat: 'wood', g: 'neck', k: 0.5 }),
    paint(ell(0.84, 0.86, 0.6, { at: [0, 2.6, 1.42], color: PALE, mat: 'clay', soft: 0.02 })),
    windowPaint(0.72, 0.28, 0.26, [0, 2.16, -2.6], GLASS, 0.12),
    windowPaint(0.4, 0.28, 0.5, [0.98, 2.28, -0.6], GLASS, 0.12),
    windowPaint(0.4, 0.28, 0.5, [-0.98, 2.28, -0.6], GLASS, 0.12),
    // Ears.
    ...[-1, 1].map((s) => cone(0.2, 0.04, 0.36, { at: [s * 0.62, 3.62, 0.84], rot: [-8, 0, s * 12], color: CHESTNUT, mat: 'wood', g: `ear${s}`, k: 0 })),
    ...[-1, 1].map((s) => cone(0.09, 0.02, 0.2, { at: [s * 0.62, 3.6, 0.92], rot: [-8, 0, s * 12], color: PALE, mat: 'clay', g: `earI${s}`, k: 0 })),
    // The mane down its spine; a forelock over the brow.
    mane(0.8, 3.46), mane(0.34, 3.34), mane(-0.14, 3.0), mane(-0.6, 2.78), mane(-1.06, 2.72), mane(-1.52, 2.68), mane(-1.98, 2.56),
    // The tail: a swish of the same teal.
    cap([0, 1.5, -2.32], [0.1, 1.24, -2.86], 0.14, { color: MANE, mat: 'fabric', g: 'tail', k: 0.14 }),
    cap([0.1, 1.24, -2.86], [0.34, 0.84, -3.06], 0.17, { color: MANE, mat: 'fabric', g: 'tail', k: 0.14 }),
    // A muzzle bumper with nostrils, and lamps.
    box(1.08, 0.2, 0.2, 0.16, { at: [0, 0.74, 2.0], color: PALE, mat: 'clay', g: 'fb', k: 0 }),
    ...headlights(0.62, 1.16, 2.06, 0.22, '#FFF1C6'),
    ...tailLights(0.88, 1.2, -2.34, '#D88A5C', 0.22, 0.12),
    // A trickster's little bridle of tassels.
    ...[-1, 1].map((s) => sphere(0.09, { at: [s * 0.98, 2.1, 1.36], color: '#E9B54C', mat: 'paint', g: `tas${s}`, k: 0 })),
  ];
}

// -- The four who joined the collection. Soft and round like the rest, each with one thing to remember them by. ---------

/** A soft star, in the plane facing front and back. */
function softStar(x, y, z, R, r, color, mat, g) {
  const out = [];
  for (let i = 0; i < 5; i += 1) {
    const a = (i / 5) * Math.PI * 2;
    out.push(cap([x, y, z], [x + Math.sin(a) * R, y + Math.cos(a) * R, z], r, { color, mat, g, k: 0.08 }));
  }
  out.push(ell(R * 0.46, R * 0.46, r * 1.2, { at: [x, y, z], color, mat, g, k: 0.08 }));
  return out;
}

/** A heart painted on a flat-ish surface. */
function heartPaint(x, y, z, size, color, on, sideways = false) {
  const lobe = sideways ? [0, 0, size * 0.52] : [size * 0.52, 0, 0];
  return [
    paint(sphere(size * 0.6, { at: [x + lobe[0], y + size * 0.2, z + lobe[2]], color, mat: 'paint', soft: 0.02, on })),
    paint(sphere(size * 0.6, { at: [x - lobe[0], y + size * 0.2, z - lobe[2]], color, mat: 'paint', soft: 0.02, on })),
    paint(sphere(size * 0.5, { at: [x, y - size * 0.34, z], color, mat: 'paint', soft: 0.02, on })),
  ];
}

// -- Ningning: the star driver. A short lavender hatchback with a tiny gold star on a springy stalk. ---------------------
function ningning() {
  const LAV = '#B7A3E6';
  const DEEP = '#8D78CC';
  const GOLD = '#F4C552';
  const GLASSY = '#4E4480';
  return [
    box(1.34, 0.66, 1.62, 0.6, { at: [0, 1.14, -0.04], color: LAV, mat: 'paint', g: 'body', k: 0.1 }),
    ell(1.18, 0.56, 0.86, { at: [0, 1.2, 1.16], color: LAV, mat: 'paint', g: 'body', k: 0.44 }),
    ell(1.2, 0.66, 0.7, { at: [0, 1.32, -1.2], color: LAV, mat: 'paint', g: 'body', k: 0.42 }),
    ...arches('body', 1.34, 1.06, -1.06, 0.78),
    ...wheels(1.2, 1.06, -1.06, 0.56, 0.3, GOLD),
    box(1.12, 0.72, 1.02, 0.62, { at: [0, 2.2, -0.18], color: LAV, mat: 'paint', g: 'body', k: 0.26, taper: 0.1 }),
    paint(ell(0.92, 0.56, 0.5, { at: [0, 2.22, 0.74], color: '#F6EFFA', mat: 'clay', soft: 0.03 })),
    windowPaint(0.8, 0.38, 0.4, [0, 2.26, -1.18], GLASSY, 0.24),
    windowPaint(0.42, 0.32, 0.46, [1.08, 2.3, -0.2], GLASSY, 0.2),
    windowPaint(0.42, 0.32, 0.46, [-1.08, 2.3, -0.2], GLASSY, 0.2),
    box(1.16, 0.17, 0.2, 0.15, { at: [0, 0.74, 1.92], color: DEEP, g: 'fb', k: 0 }),
    box(1.16, 0.17, 0.2, 0.15, { at: [0, 0.74, -1.86], color: DEEP, g: 'rb', k: 0 }),
    ...headlights(0.7, 1.12, 1.92, 0.2, '#FFF3C4'),
    ...tailLights(0.8, 1.34, -1.86, '#F08A6A', 0.22, 0.15),
    ...mirrors(1.42, 2.0, 0.7, LAV, DEEP),
    // Little painted stars along each flank and on the hatch.
    ...[[0.46, 1.3, 0.09], [-0.28, 1.08, 0.07], [-0.92, 1.36, 0.06]].flatMap(([z, y, r]) => [1, -1].map((s) => paint(sphere(r, { at: [s * 1.34, y, z], color: GOLD, mat: 'paint', soft: 0.015 })))),
    // The star, on a short stalk.
    cap([0, 2.86, -0.26], [0, 3.22, -0.26], 0.055, { color: DEEP, mat: 'paint', g: 'stalk', k: 0 }),
    ...softStar(0, 3.5, -0.26, 0.3, 0.11, GOLD, 'paint', 'star'),
  ];
}

// -- Simoy: the breeze scout. A mint compact with a pinwheel on the roof and wind drawn down its sides. ---------------------
function simoy() {
  const MINT = '#A6DCC4';
  const DEEP = '#6FB79E';
  const PALE = '#FAF4E4';
  const CORAL = '#F0A58E';
  const SKY = '#9CCBE0';
  const blade = (a, color) => ell(0.31, 0.13, 0.045, { at: [Math.cos(a) * 0.3, 3.32 + Math.sin(a) * 0.3, -0.12], rot: [0, 0, (a * 180) / Math.PI + 18], color, mat: 'paper', g: `bl${color}`, k: 0 });
  return [
    box(1.32, 0.6, 1.72, 0.54, { at: [0, 1.06, -0.02], color: MINT, mat: 'paint', g: 'body', k: 0.1 }),
    ell(1.16, 0.52, 0.86, { at: [0, 1.1, 1.24], color: MINT, mat: 'paint', g: 'body', k: 0.46 }),
    ell(1.18, 0.56, 0.66, { at: [0, 1.2, -1.3], color: MINT, mat: 'paint', g: 'body', k: 0.4 }),
    ...arches('body', 1.32, 1.14, -1.14, 0.74),
    ...wheels(1.18, 1.14, -1.14, 0.54, 0.28, PALE),
    ell(1.02, 0.76, 1.08, { at: [0, 1.9, -0.24], color: MINT, mat: 'paint', g: 'body', k: 0.3 }),
    paint(ell(0.84, 0.54, 0.46, { at: [0, 1.94, 0.66], color: PALE, mat: 'clay', soft: 0.03 })),
    windowPaint(0.74, 0.34, 0.36, [0, 2.0, -1.22], '#3F7F7A', 0.2),
    windowPaint(0.36, 0.3, 0.44, [0.96, 2.02, -0.3], '#3F7F7A', 0.18),
    windowPaint(0.36, 0.3, 0.44, [-0.96, 2.02, -0.3], '#3F7F7A', 0.18),
    // Wind along the flanks: three pale streaks.
    ...[[1.28, 0.3, 0.5], [1.06, -0.1, 0.62], [1.34, -0.46, 0.4]].flatMap(([y, z, l]) => [1, -1].map((s) => paint(box(0.3, 0.035, l, 0.03, { at: [s * 1.28, y, z], color: PALE, mat: 'paint', soft: 0.014 })))),
    box(1.12, 0.14, 0.18, 0.13, { at: [0, 0.66, 2.0], color: DEEP, g: 'fb', k: 0 }),
    box(1.12, 0.14, 0.18, 0.13, { at: [0, 0.68, -1.94], color: DEEP, g: 'rb', k: 0 }),
    ...headlights(0.7, 1.06, 2.0, 0.2, '#FFF3C4'),
    ...tailLights(0.8, 1.2, -1.94, '#F0A58E', 0.22, 0.13),
    // The pinwheel on a thin stalk, its four blades turning in the wind.
    cap([0, 2.58, -0.2], [0, 3.3, -0.14], 0.04, { color: '#A98A5E', mat: 'wood', g: 'stick', k: 0 }),
    blade(0, CORAL), blade(Math.PI / 2, SKY), blade(Math.PI, PALE), blade(Math.PI * 1.5, '#F4C552'),
    sphere(0.07, { at: [0, 3.32, -0.08], color: DEEP, mat: 'paint', g: 'hub', k: 0 }),
  ];
}

// -- Sikat: the sunshine protector. A chunky rescue buggy, roll bar behind, a little sun for a visor. ----------------------
function sikat() {
  const SUN = '#F6B840';
  const ORANGE = '#EE8A38';
  const PALE = '#FFF4DC';
  const ray = (a) => cone(0.1, 0.012, 0.15, { at: [Math.sin(a) * 0.72, 2.92 + Math.cos(a) * 0.3, 0.86 - Math.abs(Math.sin(a)) * 0.2], rot: [0, 0, (-a * 180) / Math.PI], color: ORANGE, mat: 'paint', g: `ray${a}`, k: 0 });
  return [
    box(1.4, 0.5, 1.84, 0.46, { at: [0, 1.04, 0], color: SUN, mat: 'paint', g: 'body', k: 0.1 }),
    ell(1.22, 0.5, 0.86, { at: [0, 1.14, 1.22], color: SUN, mat: 'paint', g: 'body', k: 0.42 }),
    ell(1.22, 0.52, 0.62, { at: [0, 1.22, -1.32], color: SUN, mat: 'paint', g: 'body', k: 0.36 }),
    ...arches('body', 1.4, 1.2, -1.2, 0.92),
    ...wheels(1.34, 1.2, -1.2, 0.72, 0.4, PALE),
    paint(box(1.6, 0.13, 2.2, 0.03, { at: [0, 0.98, -0.1], color: ORANGE, mat: 'paint', soft: 0.014 })),
    // The tub: a rounded cream front the face sits on, open behind it.
    box(1.02, 0.66, 0.74, 0.54, { at: [0, 2.06, -0.02], color: PALE, mat: 'paint', g: 'tub', k: 0.1 }),
    // The roll bar behind the seats, and a rescue kit strapped on.
    tor(0.98, 0.09, { at: [0, 1.84, -0.82], rot: [90, 0, 0], color: ORANGE, mat: 'paint', g: 'roll', k: 0 }),
    box(0.46, 0.26, 0.26, 0.1, { at: [0, 1.82, -1.2], color: PALE, mat: 'paint', g: 'kit', k: 0 }),
    paint(box(0.2, 0.06, 0.4, 0.02, { at: [0, 1.82, -1.34], color: '#D95B4C', mat: 'paint', soft: 0.01, on: 'kit' })),
    paint(box(0.06, 0.2, 0.4, 0.02, { at: [0, 1.82, -1.34], color: '#D95B4C', mat: 'paint', soft: 0.01, on: 'kit' })),
    // The sun visor: a soft half-disc over the face, with little rays.
    ell(0.92, 0.17, 0.62, { at: [0, 2.78, 0.3], rot: [-8, 0, 0], color: ORANGE, mat: 'paint', g: 'visor', k: 0.04 }),
    ...[-1.15, -0.58, 0, 0.58, 1.15].map(ray),
    // A chunky bumper, a beacon on the back.
    box(1.24, 0.2, 0.22, 0.18, { at: [0, 0.82, 2.0], color: ORANGE, g: 'fb', k: 0 }),
    box(1.24, 0.2, 0.22, 0.18, { at: [0, 0.84, -1.9], color: ORANGE, g: 'rb', k: 0 }),
    ...headlights(0.78, 1.16, 1.96, 0.21, '#FFF6D0'),
    ...tailLights(0.9, 1.26, -1.92, '#E8473C', 0.2, 0.14),
    sphere(0.14, { at: [0.74, 2.86, -0.82], color: '#FFD86A', mat: 'lens', g: 'beacon', k: 0 }),
    cap([0.74, 2.5, -0.82], [0.74, 2.76, -0.82], 0.05, { color: ORANGE, mat: 'paint', g: 'beaconS', k: 0 }),
  ];
}

// -- Tali: the team captain. A round coral van with hearts on it and a rope of friendship round its roof. ------------------
function tali() {
  const CORAL = '#EC7B6C';
  const DEEP = '#C2564E';
  const PALE = '#FFF1E0';
  const ROSE = '#FFC9BE';
  const ROPE = '#E8C48E';
  return [
    box(1.4, 1.26, 2.0, 0.78, { at: [0, 2.0, -0.06], color: CORAL, mat: 'paint', g: 'body', k: 0.1 }),
    ...arches('body', 1.4, 1.26, -1.26, 0.78),
    ...wheels(1.24, 1.26, -1.26, 0.58, 0.3, PALE),
    paint(box(1.6, 0.34, 2.4, 0.08, { at: [0, 1.0, -0.06], color: ROSE, mat: 'paint', soft: 0.016 })),
    paint(ell(1.0, 0.72, 0.6, { at: [0, 2.42, 1.74], color: PALE, mat: 'clay', soft: 0.03 })),
    windowPaint(0.84, 0.48, 0.4, [0, 2.54, -2.04], '#6E3A42', 0.3),
    ...[0.46, -0.72].flatMap((z) => [windowPaint(0.4, 0.34, 0.42, [1.32, 2.56, z], '#6E3A42', 0.22), windowPaint(0.4, 0.34, 0.42, [-1.32, 2.56, z], '#6E3A42', 0.22)]),
    ...heartPaint(1.4, 1.62, -0.12, 0.24, ROSE, 'body', true),
    ...heartPaint(-1.4, 1.62, -0.12, 0.24, ROSE, 'body', true),
    ...heartPaint(0, 1.6, -2.06, 0.26, ROSE, 'body'),
    box(1.2, 0.16, 0.2, 0.14, { at: [0, 0.72, 2.04], color: DEEP, g: 'fb', k: 0 }),
    box(1.2, 0.16, 0.2, 0.14, { at: [0, 0.72, -2.14], color: '#D2675C', g: 'rb', k: 0 }),
    ...headlights(0.84, 1.3, 2.0, 0.22, '#FFF3C4'),
    ...tailLights(0.94, 1.36, -2.12, '#FFD86A', 0.2, 0.14),
    ...mirrors(1.62, 2.18, 1.1, CORAL, DEEP),
    // A rope round the roof, tied in a bow at the back; a soft heart standing on top.
    tor(1.24, 0.06, { at: [0, 3.14, -0.06], color: ROPE, mat: 'fabric', g: 'rope', k: 0 }),
    ell(0.2, 0.12, 0.06, { at: [-0.2, 3.1, -1.3], rot: [0, 0, 18], color: ROPE, mat: 'fabric', g: 'bow', k: 0.02 }),
    ell(0.2, 0.12, 0.06, { at: [0.2, 3.1, -1.3], rot: [0, 0, -18], color: ROPE, mat: 'fabric', g: 'bow', k: 0.02 }),
    cap([0, 3.26, -0.2], [0, 3.56, -0.2], 0.05, { color: DEEP, mat: 'paint', g: 'heartS', k: 0 }),
    sphere(0.2, { at: [-0.13, 3.82, -0.2], color: ROSE, mat: 'paint', g: 'heart', k: 0.06 }),
    sphere(0.2, { at: [0.13, 3.82, -0.2], color: ROSE, mat: 'paint', g: 'heart', k: 0.06 }),
    cone(0.29, 0.015, 0.2, { at: [0, 3.62, -0.2], rot: [180, 0, 0], color: ROSE, mat: 'paint', g: 'heart', k: 0.06 }),
  ];
}

/**
 * name -> parts, and the sculpted face its front views are made from. Every face its own: eye shape, spacing and tilt,
 * one eye a touch different where that is charming, a mouth with some personality. Lids and quirks are in clayFaces.ts.
 * All of this is written in the model's own coordinates; SHAPE below then makes each one short and round.
 */
const HEROES = {
  navie: navie,
  jepoy: {
    parts: jepoy,
    face: { eyes: [[-0.52, 2.4, 2.12], [0.52, 2.4, 2.12]], mouth: [0, 2.02, 2.12], eye: 0.22 },
    wide: 3.7,
    palette: ['#BE4B3F', '#E9B54C', '#F2E6CE'],
    sculpt: {
      parts: jepoy,
      // The grille is the smile: its slats hang deepest in the middle, so their bottom edge curves up at both ends.
      drop: /^(grille|sl-?[0-9.]+|orn2?)$/,
      extra: [
        box(0.8, 0.31, 0.08, 0.14, { at: [0, 1.28, 2.84], color: '#E9E0CA', mat: 'paint', g: 'grille', k: 0 }),
        ...[-0.56, -0.28, 0, 0.28, 0.56].map((x) => {
          const reach = 0.13 + 0.09 * (1 - (x / 0.62) ** 2);
          return box(0.05, reach, 0.05, 0.04, { at: [x, 1.46 - reach, 2.92], color: '#A8483E', mat: 'paint', g: `sl${x}`, k: 0 });
        }),
      ],
      eyes: [[-0.46, 2.4, 2.1], [0.46, 2.4, 2.1]],
      eye: 0.16,
      eyeSizes: [1, 0.97],
      wide: 0.8,
      roll: 0,
      eyeColor: '#1E2438',
      mouth: [0, 2.12, 2.12],
      smile: { w: 0.11, sag: 0.05, depth: 0.026, color: '#3A2A22' },
      cheek: { color: '#F29A80', r: 0.14, dx: 0.2, dy: -0.2 },
      bumper: { w: 1.42, y: 0.74, z: 2.92, r: 0.2, color: '#EDE4CE', mat: 'soft' },
      lamps: { x: 1.0, y: 1.32, z: 2.6, r: 0.13, color: '#F6C544', hot: '#FBDD78' },
    },
  },
  kiko: {
    parts: kiko,
    face: { eyes: [[-0.46, 2.32, 1.78], [0.46, 2.32, 1.78]], mouth: [0, 1.82, 1.82], eye: 0.26 },
    wide: 3.3,
    sculpt: {
      parts: kiko,
      dropPaint: [[0, 2.24, 1.7]],
      pane: { at: [0, 2.36, 1.5], hw: 0.98, hh: 0.56, r: 0.36, color: '#FDF9EE', seal: '#69AFA4', seam: 0.07, on: 'body' },
      // Shy: small round eyes close together, a very small smile, and a great deal of blush.
      eyes: [[-0.38, 2.4, 1.8], [0.38, 2.4, 1.8]],
      eye: 0.16,
      eyeSizes: [1, 0.97],
      wide: 0.76,
      roll: 1,
      eyeColor: '#1C2A3C',
      mouth: [0.01, 2.14, 1.9],
      smile: { w: 0.09, sag: 0.04, depth: 0.026, color: '#2C4A52' },
      cheek: { color: '#F79A92', r: 0.15, dx: 0.17, dy: -0.19 },
      bumper: { w: 1.14, y: 0.68, z: 1.98, r: 0.19, color: '#4F9186' },
      lamps: { x: 0.8, y: 1.18, z: 1.9, r: 0.12, color: '#FFF6D2' },
    },
  },
  berto: {
    parts: berto,
    face: { eyes: [[-0.42, 2.44, 1.26], [0.42, 2.44, 1.26]], mouth: [0, 1.04, 2.94], eye: 0.2 },
    wide: 4.5,
    sculpt: {
      parts: berto,
      // In no hurry: round eyes under heavy lids, and a long slow smile on the muzzle.
      eyes: [[-0.38, 2.4, 1.3], [0.38, 2.4, 1.3]],
      eye: 0.15,
      eyeSizes: [1, 0.98],
      wide: 0.76,
      roll: 1,
      eyeColor: '#1E2438',
      mouth: [0, 2.14, 1.38],
      smile: { w: 0.1, sag: 0.04, depth: 0.024, color: '#3A3A44' },
      cheek: { color: '#EFA48E', r: 0.13, dx: 0.19, dy: -0.16 },
      bumper: { w: 1.22, y: 0.68, z: 2.72, r: 0.17, color: '#E6DCC6', mat: 'soft' },
      lamps: { x: 0.5, y: 1.2, z: 2.84, r: 0.07, color: '#D9B26A', hot: '#E8CB8C', seat: '#C9A65E' },
    },
  },
  ligaya: {
    parts: ligaya,
    face: { eyes: [[-0.48, 2.64, 2.14], [0.48, 2.64, 2.14]], mouth: [0, 2.0, 2.18], eye: 0.3 },
    wide: 3.4,
    sculpt: {
      parts: ligaya,
      dropPaint: [[0, 2.46, 2.0]],
      pane: { at: [0, 2.56, 1.9], hw: 1.1, hh: 0.82, r: 0.6, color: '#FCEFDC', seal: '#EDB6AC', on: 'body' },
      // Mid-song: tall bright ovals and a wide, happy mouth.
      eyes: [[-0.4, 2.68, 2.14], [0.4, 2.66, 2.14]],
      eye: 0.17,
      eyeSizes: [1, 0.97],
      wide: 0.74,
      roll: 0,
      eyeColor: '#1E2438',
      mouth: [0, 2.34, 2.2],
      smile: { w: 0.11, sag: 0.05, depth: 0.026, color: '#6A3040' },
      cheek: { color: '#F58C86', r: 0.16, dx: 0.2, dy: -0.25 },
      bumper: { w: 1.24, y: 0.72, z: 2.3, r: 0.2, color: '#F3E6D2', mat: 'soft' },
      lamps: { x: 0.9, y: 1.28, z: 2.2, r: 0.13, color: '#FFF0C8' },
    },
  },
  hiraya: {
    parts: hiraya,
    face: { eyes: [[-0.38, 1.92, 0.68], [0.38, 1.92, 0.68]], mouth: [0, 1.5, 0.78], eye: 0.2 },
    wide: 3.1,
    sculpt: {
      parts: hiraya,
      // Dreamy: wide ovals under low lids, and a small cat's smile.
      eyes: [[-0.34, 1.92, 0.7], [0.34, 1.92, 0.7]],
      eye: 0.15,
      eyeSizes: [1, 0.93],
      wide: 0.96,
      roll: 5,
      eyeColor: '#1F2350',
      mouth: [0, 1.66, 0.84],
      smile: { w: 0.11, sag: 0.05, depth: 0.026, kind: 'cat', color: '#2B3264' },
      cheek: { color: '#F0A4BE', r: 0.11, dx: 0.14, dy: -0.15 },
      bumper: { w: 1.2, y: 0.62, z: 2.32, r: 0.16, color: '#F0C15C', mat: 'soft' },
      lamps: { x: 0.74, y: 1.06, z: 2.2, r: 0.11, wide: 1.16, tall: 0.86, color: '#FFF3CE' },
    },
  },
  sinta: {
    parts: sinta,
    face: { eyes: [[-0.5, 2.46, 2.02], [0.5, 2.46, 2.02]], mouth: [0, 1.82, 2.08], eye: 0.28 },
    wide: 3.5,
    sculpt: {
      parts: sinta,
      dropPaint: [[0, 2.28, 1.9]],
      pane: { at: [0, 2.44, 1.9], hw: 1.14, hh: 0.7, r: 0.54, color: '#FDF5E4', seal: '#F0CC94', on: 'body' },
      // An answer for everything: level eyes and a sideways smile.
      eyes: [[-0.46, 2.52, 2.06], [0.46, 2.54, 2.06]],
      eye: 0.17,
      eyeSizes: [0.96, 1],
      wide: 0.82,
      roll: 0,
      eyeColor: '#2E2218',
      mouth: [0.05, 2.22, 2.1],
      smile: { w: 0.15, sag: 0.05, depth: 0.03, kind: 'smirk', skew: 0.035, color: '#6E4A1C' },
      cheek: { color: '#F2A474', r: 0.14, dx: 0.2, dy: -0.23 },
      bumper: { w: 1.26, y: 0.72, z: 2.16, r: 0.2, color: '#B07C38' },
      lamps: { x: 0.94, y: 1.24, z: 2.06, r: 0.13, color: '#FFF0C8' },
    },
  },
  amihan: {
    parts: amihan,
    face: { eyes: [[-0.38, 1.88, 0.62], [0.38, 1.88, 0.62]], mouth: [0, 1.46, 0.72], eye: 0.2 },
    wide: 3.8,
    sculpt: {
      parts: amihan,
      // Light on its wheels: slim ovals tipped upward, as if looking at the sky.
      eyes: [[-0.31, 1.98, 0.62], [0.31, 1.98, 0.62]],
      eye: 0.14,
      eyeSizes: [1, 0.94],
      wide: 0.7,
      roll: -6,
      eyeColor: '#223A4C',
      mouth: [0, 1.78, 0.72],
      smile: { w: 0.07, sag: 0.04, depth: 0.024, color: '#3F5E74' },
      cheek: { color: '#F79A92', r: 0.11, dx: 0.14, dy: -0.18 },
      bumper: { w: 1.12, y: 0.6, z: 2.14, r: 0.15, color: '#7FC0B4' },
      lamps: { x: 0.72, y: 1.04, z: 2.04, r: 0.105, color: '#FFF8DC' },
    },
  },
  kidlat: {
    parts: kidlat,
    face: { eyes: [[-0.42, 2.56, 0.76], [0.42, 2.56, 0.76]], mouth: [0, 2.22, 0.84], eye: 0.22 },
    wide: 3.1,
    sculpt: {
      parts: kidlat,
      // All charged up: small round eyes, keen lids, a crackle of a mouth and one tiny fang.
      eyes: [[-0.36, 2.56, 0.74], [0.36, 2.56, 0.74]],
      eye: 0.135,
      eyeSizes: [0.95, 1],
      wide: 0.98,
      roll: -2,
      eyeColor: '#16262C',
      mouth: [0, 2.28, 0.84],
      smile: { w: 0.13, sag: 0.05, depth: 0.026, kind: 'wave', color: '#2B3B40' },
      cheek: { color: '#EFAB90', r: 0.1, dx: 0.14, dy: -0.15 },
      bumper: { w: 1.2, y: 0.8, z: 1.88, r: 0.19, color: '#4A5E66' },
      lamps: { x: 0.84, y: 1.34, z: 1.8, r: 0.125, wide: 1.14, tall: 0.88, color: '#FBF1B4' },
    },
  },
  nico: {
    parts: nico,
    face: { eyes: [[-0.42, 2.26, 1.3], [0.42, 2.26, 1.3]], mouth: [0, 1.8, 1.32], eye: 0.22 },
    wide: 3.2,
    sculpt: {
      parts: nico,
      // A theory about everything: one eye narrower (see clayFaces.ts), and a knowing smile.
      eyes: [[-0.35, 2.26, 1.3], [0.36, 2.26, 1.3]],
      eye: 0.145,
      eyeSizes: [1, 0.96],
      wide: 0.92,
      roll: 0,
      eyeColor: '#252A28',
      mouth: [0.04, 1.98, 1.4],
      smile: { w: 0.1, sag: 0.04, depth: 0.026, kind: 'smirk', skew: 0.028, color: '#4A5A52' },
      cheek: { color: '#EFB49C', r: 0.11, dx: 0.15, dy: -0.16 },
      bumper: { w: 1.2, y: 0.72, z: 2.42, r: 0.19, color: '#3F8280' },
      lamps: { x: 0.8, y: 1.22, z: 2.3, r: 0.11, color: '#FFF7E0' },
    },
  },
  alon: {
    parts: alon,
    face: { eyes: [[-0.46, 2.6, 2.08], [0.46, 2.6, 2.08]], mouth: [0, 2.02, 2.12], eye: 0.26 },
    wide: 3.4,
    sculpt: {
      parts: alon,
      dropPaint: [[0, 2.46, 1.96]],
      pane: { at: [0, 2.54, 1.9], hw: 1.1, hh: 0.7, r: 0.54, color: '#FDFAEF', seal: '#C2D8E8', on: 'body' },
      // Easygoing: wide-set eyes and a little wave for a smile.
      eyes: [[-0.5, 2.58, 2.08], [0.5, 2.56, 2.08]],
      eye: 0.16,
      eyeSizes: [1, 0.95],
      wide: 0.86,
      roll: 3,
      eyeColor: '#1C3048',
      mouth: [0, 2.26, 2.16],
      smile: { w: 0.17, sag: 0.06, depth: 0.028, kind: 'wave', color: '#2F5A82' },
      cheek: { color: '#F4A89A', r: 0.14, dx: 0.19, dy: -0.22 },
      bumper: { w: 1.24, y: 0.72, z: 2.24, r: 0.18, color: '#D4B47E', mat: 'soft' },
      lamps: { x: 0.92, y: 1.26, z: 2.1, r: 0.125, color: '#FFF6DC' },
    },
  },
  tiko: {
    parts: tiko,
    face: { eyes: [[-0.36, 2.86, 1.5], [0.36, 2.86, 1.5]], mouth: [0, 2.34, 1.6], eye: 0.22 },
    wide: 3.0,
    sculpt: {
      parts: tiko,
      // Up to something: slanted ovals, a smirk and a bit of tongue.
      eyes: [[-0.32, 2.9, 1.5], [0.33, 2.86, 1.5]],
      eye: 0.165,
      eyeSizes: [1, 0.94],
      wide: 0.76,
      roll: -7,
      eyeColor: '#2A1810',
      mouth: [0.03, 2.54, 1.7],
      smile: { w: 0.12, sag: 0.045, depth: 0.028, kind: 'smirk', skew: 0.04, color: '#6F4228' },
      cheek: { color: '#EFA48A', r: 0.11, dx: 0.14, dy: -0.2 },
      bumper: { w: 1.02, y: 0.74, z: 2.04, r: 0.2, color: '#F6E9D4', mat: 'soft' },
      lamps: { x: 0.62, y: 1.14, z: 2.0, r: 0.105, color: '#FFF3CE' },
    },
  },
  ningning: {
    parts: ningning,
    face: { eyes: [[-0.4, 2.26, 1.0], [0.4, 2.26, 1.0]], mouth: [0, 2.0, 1.1], eye: 0.15 },
    wide: 3.0,
    sculpt: {
      parts: ningning,
      // Bright and pleased about it: neat ovals, a small cheerful smile.
      eyes: [[-0.37, 2.28, 1.0], [0.37, 2.26, 1.0]],
      eye: 0.165,
      eyeSizes: [1, 0.94],
      wide: 0.74,
      roll: 2,
      eyeColor: '#2A2348',
      mouth: [0.02, 1.98, 1.1],
      smile: { w: 0.11, sag: 0.055, depth: 0.028, color: '#5B4A94' },
      cheek: { color: '#F88FB4', r: 0.13, dx: 0.16, dy: -0.21 },
      bumper: { w: 1.06, y: 0.74, z: 1.96, r: 0.18, color: '#A08CDC' },
      lamps: { x: 0.68, y: 1.12, z: 1.86, r: 0.105, color: '#FFF6D6' },
    },
  },
  simoy: {
    parts: simoy,
    face: { eyes: [[-0.34, 1.98, 0.9], [0.34, 1.98, 0.9]], mouth: [0, 1.72, 1.0], eye: 0.13 },
    wide: 2.9,
    sculpt: {
      parts: simoy,
      // Gently curious: small soft eyes tipped up, and a tiny smile.
      eyes: [[-0.31, 2.04, 0.9], [0.31, 2.04, 0.9]],
      eye: 0.145,
      eyeSizes: [0.95, 1],
      wide: 0.8,
      roll: -4,
      eyeColor: '#1F3A3A',
      mouth: [0, 1.84, 1.0],
      smile: { w: 0.07, sag: 0.04, depth: 0.024, color: '#3F7F6E' },
      cheek: { color: '#F4A898', r: 0.11, dx: 0.14, dy: -0.18 },
      bumper: { w: 1.02, y: 0.66, z: 2.04, r: 0.16, color: '#7FC4AC' },
      lamps: { x: 0.68, y: 1.06, z: 1.96, r: 0.1, color: '#FFF8DE' },
    },
  },
  sikat: {
    parts: sikat,
    face: { eyes: [[-0.36, 2.2, 0.74], [0.36, 2.2, 0.74]], mouth: [0, 1.92, 0.76], eye: 0.15 },
    wide: 3.5,
    sculpt: {
      parts: sikat,
      // Confident and cheerful: level, bright eyes under the sun visor, and a broad smile.
      eyes: [[-0.36, 2.2, 0.74], [0.36, 2.2, 0.74]],
      eye: 0.165,
      eyeSizes: [1, 0.96],
      wide: 0.84,
      roll: 0,
      eyeColor: '#2E2014',
      mouth: [0.02, 1.9, 0.78],
      smile: { w: 0.16, sag: 0.07, depth: 0.03, color: '#A85A1E' },
      cheek: { color: '#F6946A', r: 0.13, dx: 0.18, dy: -0.2 },
      bumper: { w: 1.1, y: 0.82, z: 2.04, r: 0.2, color: '#F29A48' },
      lamps: { x: 0.76, y: 1.16, z: 1.96, r: 0.115, color: '#FFF6D0' },
    },
  },
  tali: {
    parts: tali,
    face: { eyes: [[-0.44, 2.44, 1.9], [0.44, 2.44, 1.9]], mouth: [0, 2.1, 1.92], eye: 0.16 },
    wide: 3.2,
    sculpt: {
      parts: tali,
      // Everyone's friend: big kind ovals wide apart and an open, ready smile.
      eyes: [[-0.44, 2.48, 1.9], [0.44, 2.46, 1.9]],
      eye: 0.18,
      eyeSizes: [1, 0.95],
      wide: 0.78,
      roll: 2,
      eyeColor: '#3A1C1C',
      mouth: [0, 2.12, 1.94],
      smile: { w: 0.16, sag: 0.075, depth: 0.03, color: '#A8483E' },
      cheek: { color: '#F48C82', r: 0.15, dx: 0.19, dy: -0.23 },
      bumper: { w: 1.14, y: 0.72, z: 2.1, r: 0.18, color: '#D2675C' },
      lamps: { x: 0.82, y: 1.3, z: 2.0, r: 0.115, color: '#FFF3D0' },
    },
  },
};
HEROES.navie.wide = 3.9;
// Navie wears letters, which a mirrored sprite would turn backwards.
HEROES.navie.lettered = true;

/**
 * How each one gets short, round and small-wheeled (scenes/chibi.js). Navie is left out: that model is built to the approved reference directly.
 * Long ones shrink most, so a jeepney is still the longest and a coupe still the lowest: they stay themselves.
 */
const SHAPE = {
  jepoy: { z: 0.68, belt: 1.7, low: 0.88, up: 0.94, wheel: 0.8, round: 0.5, k: 1.5 },
  kiko: { z: 0.78, belt: 1.6, low: 0.84, up: 1, wheel: 0.78, round: 0.72, k: 1.5 },
  berto: { z: 0.72, belt: 2.0, low: 0.82, up: 1, wheel: 0.76, head: 1.05, round: 0.62, k: 1.5 },
  ligaya: { z: 0.76, belt: 1.2, low: 0.82, up: 0.98, wheel: 0.76, round: 0.84, k: 1.5 },
  hiraya: { z: 0.72, belt: 1.5, low: 0.84, up: 1.1, wheel: 0.8, head: 1.1, round: 0.7, k: 1.6 },
  sinta: { z: 0.78, belt: 1.2, low: 0.82, up: 1, wheel: 0.76, round: 0.8, k: 1.5 },
  amihan: { z: 0.74, belt: 1.4, low: 0.88, up: 1.12, wheel: 0.8, head: 1.12, round: 0.7, k: 1.6 },
  kidlat: { z: 0.76, belt: 1.9, low: 0.82, up: 1, wheel: 0.78, head: 1.05, round: 0.74, k: 1.5 },
  nico: { z: 0.68, belt: 1.6, low: 0.84, up: 1.06, wheel: 0.78, head: 1.06, round: 0.74, k: 1.5 },
  alon: { z: 0.78, belt: 1.2, low: 0.82, up: 1, wheel: 0.76, round: 0.84, k: 1.5 },
  tiko: { z: 0.74, belt: 1.7, low: 0.84, up: 1, wheel: 0.78, head: 1.06, round: 0.7, k: 1.5 },
  ningning: { z: 0.92, belt: 1.7, low: 0.88, up: 1.02, wheel: 0.82, head: 1.04, round: 0.76, k: 1.4 },
  simoy: { z: 0.92, belt: 1.5, low: 0.88, up: 1.04, wheel: 0.82, head: 1.05, round: 0.76, k: 1.4 },
  sikat: { z: 0.9, belt: 1.5, low: 0.9, up: 1.04, wheel: 0.84, head: 1.08, round: 0.76, k: 1.4 },
  tali: { z: 0.9, belt: 1.2, low: 0.84, up: 1, wheel: 0.78, round: 0.84, k: 1.4 },
};
for (const [id, c] of Object.entries(SHAPE)) {
  const def = HEROES[id];
  const rearParts = def.parts;
  const frontParts = def.sculpt.parts;
  def.parts = () => chibify(rearParts(), c);
  const mapped = remapSpec(def.sculpt, c);
  // The approved art direction: bigger soft eyes, flat cream lamps with a pale ring.
  def.sculpt = {
    ...mapped,
    eye: mapped.eye * 1.18,
    dimple: 0.1,
    lamps: mapped.lamps && { hot: '#FCF6DC', seat: '#FBFAF8', ...mapped.lamps, color: mapped.lamps.hot ? mapped.lamps.color : '#F4E7BC', ring: 1.3, r: mapped.lamps.r * 1.5 },
    parts: () => chibify(frontParts(), c),
  };
}

void wheel;
void cyl;
module.exports = { HEROES };
