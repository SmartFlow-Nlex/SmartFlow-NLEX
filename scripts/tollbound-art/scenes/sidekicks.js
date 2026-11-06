/**
 * The sidekicks as clay models: twelve the game already had, in their own
 * identities, and the new companions. They are not miniature cars: tiny animals,
 * crafted objects, friendly beings and odd little machines, each with its own
 * silhouette. Front (+z) carries the face; `evo` adds what an evolved form earns.
 */
const { sphere, ell, box, cyl, cap, cone, tor, sub, paint } = require('../sdf');

const GOLD = '#E9B54C';
const INK = '#354844';
const RUBBER = '#2F3A40';
const CREAM = '#F8EDD8';

/** Whatever evolves wears the same mark: a little gold star riding above it, and a gold band. */
const evolved = (top, band) => {
  const out = [sphere(0.15, { at: [0, top + 0.2, 0], color: GOLD, mat: 'glow', g: 'evoStar', k: 0 })];
  for (let i = 0; i < 5; i += 1) {
    const a = (i / 5) * Math.PI * 2;
    out.push(cone(0.09, 0.015, 0.14, { at: [Math.sin(a) * 0.19, top + 0.2 + Math.cos(a) * 0.19, 0], rot: [0, 0, (-a * 180) / Math.PI], color: GOLD, mat: 'glow', g: 'evoStar', k: 0.02 }));
  }
  if (band) {
    out.push(tor(band[0], 0.05, { at: [0, band[1], band[2] || 0], color: GOLD, mat: 'metal', g: 'evoBand', k: 0 }));
  }
  return out;
};

const tyre = (x, y, z, r, w = 0.14, hub = CREAM) => [
  cyl(r, w, 0.08, { at: [x, y, z], rot: [0, 0, 90], color: RUBBER, mat: 'rubber', g: `ty${x}${z}`, k: 0 }),
  cyl(r * 0.45, w + 0.02, 0.03, { at: [x, y, z], rot: [0, 0, 90], color: hub, mat: 'paint', g: `tyh${x}${z}`, k: 0 }),
];

// ---- the twelve the game already has --------------------------------------------

/** Pip: the tricycle that learned to fly. A round blue tub, a sunny striped parasol, a little thruster. */
function pip(evo) {
  const BLUE = '#4A95E2';
  const SUN = '#F9C53E';
  return [
    ell(0.94, 0.6, 0.94, { at: [0, 0.84, 0], color: BLUE, mat: 'painted', g: 'body', k: 0.1 }),
    paint(ell(0.72, 0.42, 0.26, { at: [0, 0.9, 0.82], color: CREAM, mat: 'soft', soft: 0.015, on: 'body' })),
    tor(0.82, 0.055, { at: [0, 1.16, 0], color: '#FBF2DC', mat: 'painted', g: 'rim', k: 0 }),
    // The parasol: a soft dome with one cream stripe, so it reads from behind.
    ell(0.98, 0.3, 0.98, { at: [0, 1.64, -0.04], color: SUN, mat: 'painted', g: 'top', k: 0.03 }),
    sub(ell(0.9, 0.24, 0.9, { at: [0, 1.46, -0.04], g: 'top', k: 0.02 })),
    paint(box(0.2, 0.5, 1.2, 0.02, { at: [0, 1.74, -0.04], color: '#FFF6DF', mat: 'painted', soft: 0.02, on: 'top' })),
    sphere(0.085, { at: [0, 1.96, -0.04], color: '#FBF2DC', mat: 'painted', g: 'topB', k: 0 }),
    ...[-0.6, 0.6].flatMap((x) => [0.52, -0.58].map((z) => cap([x, 1.2, z], [x * 1.04, 1.56, z * 1.04], 0.04, { color: '#A9CBEC', mat: 'painted', g: `st${x}${z}`, k: 0 }))),
    ...tyre(0.92, 0.42, -0.34, 0.28), ...tyre(-0.92, 0.42, -0.34, 0.28),
    cyl(0.26, 0.11, 0.05, { at: [0, 0.36, 0.72], rot: [0, 0, 90], color: RUBBER, mat: 'rubber', g: 'fw', k: 0 }),
    cone(0.2, 0.32, 0.2, { at: [0, 0.86, -1.0], rot: [90, 0, 0], color: '#A7B2BC', mat: 'metal', g: 'thr', k: 0 }),
    sphere(0.17, { at: [0, 0.86, -1.18], color: '#FFC97A', mat: 'glow', g: 'thrG', k: 0 }),
    ...(evo ? [...evolved(2.04, [0.94, 0.72]), ...[-1, 1].map((s) => cap([s * 0.86, 0.9, -0.3], [s * 1.34, 1.12, -0.74], 0.09, { color: SUN, mat: 'paint', g: `wg${s}`, k: 0 }))] : []),
  ];
}

/** Bumbo: a round orange body with a cream face, pale spots and a purple band, on small wheels, with a yellow propeller on top. */
function bumbo(evo) {
  const ORANGE = '#F2843A';
  const SPOT = '#FBD3A4';
  const PLUM = '#7A4DA0';
  const STEM = '#A85F60';
  const YELLOW = '#FFCB47';
  const HUB = '#C9C2E2';
  const AT = [0, 2.92, 0];
  const TURN = 24;
  const reach = (d) => [AT[0] + d * Math.cos((TURN * Math.PI) / 180), AT[1], AT[2] - d * Math.sin((TURN * Math.PI) / 180)];
  return [
    // Nearly a ball, a touch wider low down.
    ell(1.14, 0.98, 1.08, { at: [0, 1.22, 0], color: ORANGE, mat: 'painted', g: 'body', k: 0.1 }),
    // The cream face, domed on top, stopping just short of the band.
    paint(ell(0.74, 0.46, 0.6, { at: [0, 1.42, 0.86], color: '#FFEFD6', mat: 'soft', soft: 0.02, on: 'body' })),
    paint(box(1.4, 0.12, 1.4, 0.02, { at: [0, 0.8, 0], color: PLUM, mat: 'painted', soft: 0.012, on: 'body' })),
    // Pale spots over the crown and the left side.
    paint(sphere(0.25, { at: [-0.72, 1.8, 0.4], color: SPOT, mat: 'soft', soft: 0.02, on: 'body' })),
    paint(sphere(0.16, { at: [-1.0, 1.26, 0.42], color: SPOT, mat: 'soft', soft: 0.02, on: 'body' })),
    paint(sphere(0.2, { at: [0.74, 1.84, 0.38], color: SPOT, mat: 'soft', soft: 0.02, on: 'body' })),
    paint(sphere(0.12, { at: [-0.14, 2.06, 0.36], color: '#F8AE70', mat: 'soft', soft: 0.02, on: 'body' })),
    paint(sphere(0.2, { at: [0.72, 1.5, -0.6], color: SPOT, mat: 'soft', soft: 0.02, on: 'body' })),
    paint(sphere(0.16, { at: [-0.6, 1.62, -0.66], color: SPOT, mat: 'soft', soft: 0.02, on: 'body' })),
    // The back: a pale patch, so it stays friendly from behind.
    paint(ell(0.46, 0.3, 0.5, { at: [0, 1.36, -1.0], color: '#FFEBC8', mat: 'soft', soft: 0.02, on: 'body' })),
    ...[-1, 1].map((s) => ell(0.1, 0.085, 0.05, { at: [s * 0.64, 1.02, -0.98], color: '#F04B3F', mat: 'lamp', g: `bl${s}`, k: 0 })),
    ...tyre(0.76, 0.31, 0.56, 0.31, 0.15, HUB), ...tyre(-0.76, 0.31, 0.56, 0.31, 0.15, HUB), ...tyre(0.76, 0.31, -0.56, 0.31, 0.15, HUB), ...tyre(-0.76, 0.31, -0.56, 0.31, 0.15, HUB),
    // The propeller: a plum collar, a short stem, a plum ring, and two fat yellow blades, a little twisted.
    cyl(0.23, 0.07, 0.05, { at: [0, 2.2, 0], color: PLUM, mat: 'painted', g: 'collar', k: 0 }),
    cap([0, 2.22, 0], [0, 2.84, 0], 0.06, { color: STEM, mat: 'painted', g: 'stem', k: 0 }),
    cyl(0.12, 0.045, 0.03, { at: [0, 2.74, 0], color: PLUM, mat: 'painted', g: 'stemR', k: 0 }),
    // Two fat blades, each twisted about its own length so its broad side shows.
    ell(0.5, 0.08, 0.31, { at: reach(0.5), rot: [44, TURN, 3], color: YELLOW, mat: 'painted', g: 'prop', k: 0.08 }),
    ell(0.5, 0.08, 0.31, { at: reach(-0.5), rot: [-44, TURN, -3], color: YELLOW, mat: 'painted', g: 'prop', k: 0.08 }),
    ell(0.17, 0.13, 0.17, { at: AT, color: '#FFC23C', mat: 'painted', g: 'prop', k: 0.1 }),
    ...(evo ? [...evolved(3.2), ...[-1, 1].map((s) => cone(0.05, 0.2, 0.11, { at: [s * 0.86, 2.02, 0], rot: [0, 0, -s * 40], color: GOLD, mat: 'metal', g: `dishE${s}`, k: 0 }))] : []),
  ];
}

/** Mila: a round pink body with a cream face and pale spots, mint U-shaped antennae with yellow bands and white tips, on a mint floating base and one small wheel. */
function mila(evo) {
  const PINK = '#F085B2';
  const SPOT = '#F9BFD2';
  const MINT = '#5CCDB2';
  // A smooth half circle, from the top of the head out and up.
  const ARC = [0, 22, 44, 66, 88, 104].map((d) => [Math.round(Math.sin((d * Math.PI) / 180) * 78) / 100, Math.round((2.64 - Math.cos((d * Math.PI) / 180) * 0.78) * 100) / 100]);
  const arm = (s, points, tip) => {
    const parts = [];
    for (let i = 0; i < points.length - 1; i += 1) {
      parts.push(cap(points[i], points[i + 1], 0.15, { color: MINT, mat: 'painted', g: 'crown', k: 0.12 }));
    }
    parts.push(sphere(0.19, { at: tip, color: '#FFF7E6', mat: 'painted', g: `anT${s}`, k: 0 }));
    const end = points[points.length - 1];
    parts.push(tor(0.15, 0.045, { at: [end[0], end[1] + 0.03, end[2]], color: '#F7C24A', mat: 'painted', g: `anB${s}`, k: 0 }));
    return parts;
  };
  return [
    ell(1.06, 0.76, 0.96, { at: [0, 1.16, 0], color: PINK, mat: 'painted', g: 'body', k: 0.1 }),
    paint(ell(0.72, 0.5, 0.5, { at: [0, 1.14, 0.7], color: '#FFF0DC', mat: 'soft', soft: 0.02, on: 'body' })),
    // Pale spots on the sides and crown.
    paint(sphere(0.15, { at: [0.82, 1.34, 0.44], color: SPOT, mat: 'soft', soft: 0.018, on: 'body' })),
    paint(sphere(0.11, { at: [0.88, 1.0, 0.44], color: SPOT, mat: 'soft', soft: 0.018, on: 'body' })),
    paint(sphere(0.15, { at: [-0.82, 1.34, 0.44], color: SPOT, mat: 'soft', soft: 0.018, on: 'body' })),
    paint(sphere(0.11, { at: [-0.88, 1.0, 0.44], color: SPOT, mat: 'soft', soft: 0.018, on: 'body' })),
    paint(sphere(0.1, { at: [-0.4, 1.74, 0.42], color: SPOT, mat: 'soft', soft: 0.018, on: 'body' })),
    // A pale patch and a round tail, so the back is friendly too.
    paint(ell(0.36, 0.3, 0.2, { at: [0, 1.0, -0.86], color: SPOT, mat: 'painted', soft: 0.05, on: 'body' })),
    sphere(0.13, { at: [0, 1.0, -0.94], color: '#FFF4DC', mat: 'soft', g: 'tail', k: 0 }),
    // The floating base, and one small wheel under it.
    ell(0.84, 0.15, 0.78, { at: [0, 0.38, 0], color: MINT, mat: 'painted', g: 'deck', k: 0 }),
    ...tyre(0, 0.2, 0, 0.2, 0.15, '#6F8FA0'),
    // The base of the U melts out of the head, then one arm goes each way, almost level with each other.
    ell(0.3, 0.13, 0.26, { at: [0, 1.88, 0], color: MINT, mat: 'painted', g: 'crown', k: 0.12 }),
    ...arm(1, ARC.map(([x, y]) => [x, y + 0.06, 0]), [0.8, 3.0, 0]),
    ...arm(-1, ARC.map(([x, y]) => [-x, y, 0]), [-0.8, 2.94, 0]),
    ...(evo ? [...evolved(3.26), ...[-1, 1].map((s) => sphere(0.06, { at: [s * 0.8, s > 0 ? 3.24 : 3.18, 0], color: GOLD, mat: 'metal', g: `tipG${s}`, k: 0 }))] : []),
  ];
}

/** Kumpuni: the fussy repair kart, all toolbox and spanner arm. */
function kumpuni(evo) {
  const GREEN = '#6E9E5E';
  const STEEL = '#9AA6A8';
  return [
    box(0.92, 0.5, 1.0, 0.3, { at: [0, 0.72, 0], color: GREEN, mat: 'paint', g: 'body', k: 0.08 }),
    box(0.74, 0.46, 0.5, 0.24, { at: [0, 1.4, 0.2], color: GREEN, mat: 'paint', g: 'cab', k: 0.14 }),
    paint(ell(0.56, 0.32, 0.2, { at: [0, 1.46, 0.64], color: CREAM, mat: 'clay', soft: 0.015 })),
    box(0.62, 0.24, 0.3, 0.05, { at: [0, 1.34, -0.66], color: '#C9704C', mat: 'paint', g: 'tool', k: 0 }),
    paint(box(0.7, 0.03, 0.34, 0.01, { at: [0, 1.36, -0.66], color: INK, mat: 'paint', soft: 0.008 })),
    cap([-0.2, 1.62, -0.66], [0.2, 1.62, -0.66], 0.04, { color: STEEL, mat: 'metal', g: 'toolH', k: 0 }),
    ...tyre(0.84, 0.26, 0.56, 0.26), ...tyre(-0.84, 0.26, 0.56, 0.26), ...tyre(0.84, 0.26, -0.56, 0.26), ...tyre(-0.84, 0.26, -0.56, 0.26),
    cap([0.72, 1.4, 0.1], [1.2, 1.9, 0.2], 0.07, { color: STEEL, mat: 'metal', g: 'arm', k: 0.04 }),
    tor(0.17, 0.06, { at: [1.3, 2.04, 0.2], rot: [90, 0, 0], color: STEEL, mat: 'metal', g: 'arm', k: 0.04 }),
    sub(box(0.1, 0.16, 0.2, 0.01, { at: [1.34, 2.2, 0.2], g: 'arm', k: 0 })),
    ...(evo ? evolved(1.96, [0.8, 1.06]) : []),
  ];
}

/** Bantay: a friendly aspin with an improvised travel scarf. (Same sidekick, same guard job; now a real dog.) */
function bantay(evo) {
  const FUR = '#C99E6C';
  const PALE = '#EBD9BC';
  const SCARF = '#C65B50';
  return [
    ell(0.62, 0.56, 0.86, { at: [0, 0.86, -0.22], color: FUR, mat: 'clay', g: 'body', k: 0.16 }),
    ell(0.58, 0.54, 0.54, { at: [0, 1.5, 0.48], color: FUR, mat: 'clay', g: 'body', k: 0.2 }),
    paint(ell(0.38, 0.36, 0.3, { at: [0, 1.34, 0.9], color: PALE, mat: 'clay', soft: 0.05 })),
    ell(0.24, 0.17, 0.2, { at: [0, 1.28, 0.98], color: PALE, mat: 'clay', g: 'snout', k: 0 }),
    sphere(0.075, { at: [0, 1.36, 1.17], color: INK, mat: 'paint', g: 'nose', k: 0 }),
    ...[-1, 1].map((s) => ell(0.15, 0.32, 0.1, { at: [s * 0.52, 1.92, 0.4], rot: [12, 0, s * 26], color: '#8E6A44', mat: 'clay', g: `ear${s}`, k: 0 })),
    ...[-1, 1].flatMap((s) => [0.28, -0.72].map((z) => cap([s * 0.34, 0.6, z], [s * 0.36, 0.14, z + 0.06], 0.14, { color: FUR, mat: 'clay', g: `leg${s}${z}`, k: 0 }))),
    cap([0, 1.1, -1.0], [0.2, 1.62, -1.3], 0.1, { color: FUR, mat: 'clay', g: 'tail', k: 0 }),
    tor(0.5, 0.13, { at: [0, 1.14, 0.3], rot: [-14, 0, 0], color: SCARF, mat: 'fabric', g: 'scarf', k: 0.06 }),
    ell(0.2, 0.3, 0.08, { at: [0.3, 0.8, 0.72], rot: [10, 0, -12], color: SCARF, mat: 'fabric', g: 'scarf', k: 0.04 }),
    ...(evo ? evolved(2.2) : []),
  ];
}

/** Silip: the curious camera drone; one great lens, four little rotors. */
function silip(evo) {
  const TEAL = '#5B9E9C';
  const NAVY = '#2F4A5C';
  return [
    ell(0.84, 0.58, 0.76, { at: [0, 1.02, 0], color: TEAL, mat: 'paint', g: 'body', k: 0.1 }),
    cyl(0.42, 0.16, 0.06, { at: [0, 1.0, 0.76], rot: [90, 0, 0], color: NAVY, mat: 'paint', g: 'lensA', k: 0 }),
    ell(0.3, 0.3, 0.1, { at: [0, 1.0, 0.94], color: '#7FB6D0', mat: 'glass', g: 'lensB', k: 0 }),
    ...[-1, 1].flatMap((sx) => [-1, 1].flatMap((sz) => [
      cap([sx * 0.46, 1.3, sz * 0.4], [sx * 0.92, 1.46, sz * 0.72], 0.05, { color: NAVY, g: `ar${sx}${sz}`, k: 0 }),
      cyl(0.32, 0.03, 0.02, { at: [sx * 0.92, 1.54, sz * 0.72], color: '#C9D8D6', mat: 'fabric', g: `ro${sx}${sz}`, k: 0 }),
    ])),
    ...[-1, 1].map((s) => cap([s * 0.36, 0.56, 0], [s * 0.42, 0.14, 0], 0.05, { color: NAVY, g: `sk${s}`, k: 0 })),
    box(0.1, 0.03, 0.6, 0.02, { at: [0.42, 0.11, 0], color: NAVY, g: 'skidA', k: 0 }),
    box(0.1, 0.03, 0.6, 0.02, { at: [-0.42, 0.11, 0], color: NAVY, g: 'skidB', k: 0 }),
    ...(evo ? [...evolved(1.74), tor(0.42, 0.05, { at: [0, 1.0, 0.9], rot: [90, 0, 0], color: GOLD, mat: 'metal', g: 'lensG', k: 0 })] : []),
  ];
}

/** Walis: the tidy street sweeper, brush bristling at the front. */
function walis(evo) {
  const MINT = '#8FC6AE';
  const STRAW = '#D8B878';
  return [
    box(0.86, 0.66, 0.94, 0.42, { at: [0, 0.96, -0.1], color: MINT, mat: 'paint', g: 'body', k: 0.1 }),
    paint(ell(0.62, 0.38, 0.24, { at: [0, 1.14, 0.78], color: CREAM, mat: 'clay', soft: 0.015 })),
    ...tyre(0.78, 0.24, -0.5, 0.24), ...tyre(-0.78, 0.24, -0.5, 0.24),
    cyl(0.32, 0.92, 0.1, { at: [0, 0.32, 0.92], rot: [0, 0, 90], color: STRAW, mat: 'fabric', g: 'brush', k: 0 }),
    cyl(0.14, 0.96, 0.04, { at: [0, 0.32, 0.92], rot: [0, 0, 90], color: '#8C6E46', mat: 'wood', g: 'brushC', k: 0 }),
    // The little broom it holds aloft.
    cap([0.54, 1.5, -0.3], [0.86, 2.3, -0.3], 0.05, { color: '#8C6E46', mat: 'wood', g: 'broom', k: 0 }),
    cone(0.2, 0.05, 0.22, { at: [0.94, 2.52, -0.3], rot: [0, 0, -22], color: STRAW, mat: 'fabric', g: 'bristle', k: 0 }),
    ...(evo ? evolved(1.86, [0.78, 0.66, -0.1]) : []),
  ];
}

/** Barya: a flying toll coin who counts everything twice. */
function barya(evo) {
  const COIN = '#E3B24C';
  const DEEP = '#B98A2E';
  return [
    cyl(0.92, 0.17, 0.09, { at: [0, 1.12, 0], rot: [90, 0, 0], color: COIN, mat: 'metal', g: 'coin', k: 0 }),
    tor(0.86, 0.07, { at: [0, 1.12, 0], rot: [90, 0, 0], color: DEEP, mat: 'metal', g: 'rim', k: 0 }),
    paint(ell(0.6, 0.42, 0.3, { at: [0, 1.2, 0.17], color: '#F4DE9C', mat: 'clay', soft: 0.02 })),
    paint(box(0.32, 0.05, 0.4, 0.01, { at: [0, 1.12, -0.17], color: DEEP, mat: 'metal', soft: 0.01 })),
    ...[-1, 1].map((s) => ell(0.4, 0.17, 0.05, { at: [s * 1.12, 1.26, -0.06], rot: [0, 0, s * 22], color: CREAM, mat: 'fabric', g: `wing${s}`, k: 0 })),
    ...(evo ? evolved(2.06) : []),
  ];
}

/** Sibat: a thin little dart of a jet, serious, never misses a line. */
function sibat(evo) {
  const RED = '#C65B50';
  const PALE = '#EFE4CF';
  return [
    ell(0.42, 0.42, 1.1, { at: [0, 0.96, 0], color: PALE, mat: 'paint', g: 'body', k: 0.1 }),
    cone(0.38, 0.02, 0.56, { at: [0, 0.96, 1.36], rot: [90, 0, 0], color: RED, mat: 'paint', g: 'nose', k: 0.05 }),
    paint(ell(0.3, 0.26, 0.26, { at: [0, 1.06, 0.72], color: CREAM, mat: 'clay', soft: 0.015 })),
    ...[-1, 1].map((s) => box(0.6, 0.04, 0.34, 0.03, { at: [s * 0.74, 0.86, -0.28], rot: [0, s * 18, s * 8], color: RED, mat: 'paint', g: `wing${s}`, k: 0 })),
    box(0.04, 0.36, 0.26, 0.03, { at: [0, 1.42, -0.86], rot: [14, 0, 0], color: RED, mat: 'paint', g: 'tail', k: 0 }),
    sphere(0.17, { at: [0, 0.96, -1.14], color: '#F2C879', mat: 'glow', g: 'jet', k: 0 }),
    ...(evo ? [...evolved(1.8), ...[-1, 1].map((s) => sphere(0.09, { at: [s * 1.3, 0.92, -0.34], color: GOLD, mat: 'glow', g: `wt${s}`, k: 0 }))] : []),
  ];
}

const starParts = (cx, cy, cz, R, r, color, mat, g, depth = 0.26) => {
  const out = [];
  for (let i = 0; i < 5; i += 1) {
    const a = (i / 5) * Math.PI * 2;
    out.push(cap([cx, cy, cz], [cx + Math.sin(a) * R, cy + Math.cos(a) * R, cz], r, { color, mat, g, k: 0.1 }));
  }
  out.push(ell(R * 0.5, R * 0.5, depth, { at: [cx, cy, cz], color, mat, g, k: 0.1 }));
  return out;
};

/** Tala: the tiny star that never went out. Plain, warm and calm. (Parolito below is the crafted lantern.) */
function tala(evo) {
  return [
    ...starParts(0, 1.16, 0, 0.82, 0.2, '#EFC665', 'glow', 'star'),
    ...(evo ? [tor(0.98, 0.04, { at: [0, 1.16, 0], rot: [90, 0, 0], color: GOLD, mat: 'metal', g: 'halo', k: 0 }), sphere(0.13, { at: [0, 2.42, 0], color: GOLD, mat: 'glow', g: 'evoS', k: 0 })] : []),
  ];
}

/** Ilaw: a pocket traffic light. Strict, kind, three lamps on a little post. */
function ilaw(evo) {
  const CASE = '#3F5058';
  return [
    box(0.52, 0.94, 0.44, 0.3, { at: [0, 1.26, 0], color: CASE, mat: 'paint', g: 'body', k: 0.06 }),
    ...[[1.86, '#CF5B4C'], [1.28, '#E9B54C'], [0.7, '#69AF7C']].flatMap(([y, c]) => [
      ell(0.27, 0.27, 0.1, { at: [0, y, 0.42], color: c, mat: 'glow', g: `lamp${y}`, k: 0 }),
      ell(0.27, 0.27, 0.1, { at: [0, y, -0.42], color: c, mat: 'glass', g: `lampB${y}`, k: 0 }),
      box(0.3, 0.03, 0.14, 0.02, { at: [0, y + 0.3, 0.46], color: CASE, mat: 'paint', g: `hood${y}`, k: 0 }),
    ]),
    cap([0, 0.32, 0], [0, 0.1, 0], 0.09, { color: CASE, g: 'post', k: 0 }),
    cyl(0.32, 0.05, 0.03, { at: [0, 0.06, 0], color: CASE, mat: 'paint', g: 'base', k: 0 }),
    ...(evo ? evolved(2.36, [0.56, 0.32]) : []),
  ];
}

/** Maso: a small mallet with a big swing. A head that fills the frame, a stubby handle. */
function maso(evo) {
  const WOOD = '#B58A58';
  const STEEL = '#8D97A0';
  return [
    cyl(0.62, 0.72, 0.14, { at: [0, 1.56, 0], rot: [0, 0, 90], color: WOOD, mat: 'wood', g: 'head', k: 0 }),
    ...[-1, 1].map((s) => cyl(0.66, 0.1, 0.04, { at: [s * 0.74, 1.56, 0], rot: [0, 0, 90], color: STEEL, mat: 'metal', g: `band${s}`, k: 0 })),
    paint(ell(0.5, 0.34, 0.2, { at: [0, 1.62, 0.54], color: CREAM, mat: 'clay', soft: 0.015 })),
    cap([0, 0.88, 0], [0, 0.22, 0], 0.14, { color: '#8C6E46', mat: 'wood', g: 'handle', k: 0 }),
    sphere(0.17, { at: [0, 0.18, 0], color: '#6E5A3C', mat: 'wood', g: 'knob', k: 0 }),
    ...(evo ? [...evolved(2.36), ...[-1, 1].map((s) => cyl(0.68, 0.05, 0.02, { at: [s * 0.54, 1.56, 0], rot: [0, 0, 90], color: GOLD, mat: 'metal', g: `gb${s}`, k: 0 }))] : []),
  ];
}

// ---- the new companions --------------------------------------------------------------

/** Parolito: a little woven parol lantern: bamboo star frame, paper between, tassels below. */
function parolito(evo) {
  const FRAME = '#A9845A';
  return [
    ell(0.62, 0.62, 0.3, { at: [0, 1.36, 0], color: '#F2C879', mat: 'glow', g: 'paper', k: 0 }),
    ...starParts(0, 1.36, 0, 0.9, 0.05, FRAME, 'wood', 'frame', 0.04),
    tor(0.9, 0.04, { at: [0, 1.36, 0], rot: [90, 0, 0], color: FRAME, mat: 'wood', g: 'hoop', k: 0 }),
    ...[-0.32, 0, 0.32].map((x) => ell(0.08, 0.26, 0.04, { at: [x, 0.3 + Math.abs(x) * 0.5, 0], color: ['#C65B50', '#69AFA4', '#C65B50'][Math.round(x / 0.32) + 1], mat: 'fabric', g: `tass${x}`, k: 0 })),
    cap([0, 0.48, 0], [0, 0.72, 0], 0.03, { color: FRAME, g: 'cord', k: 0 }),
    ...(evo ? evolved(2.4) : []),
  ];
}

/** Bibing: a round bibingka buddy on a banana-leaf base, steam curling from the top. */
function bibing(evo) {
  const CAKE = '#E3B878';
  const TOP = '#B97B3E';
  return [
    cyl(1.06, 0.1, 0.05, { at: [0, 0.14, 0], color: '#6E9E5E', mat: 'leaf', g: 'leaf', k: 0 }),
    ell(0.94, 0.56, 0.94, { at: [0, 0.74, 0], color: CAKE, mat: 'clay', g: 'cake', k: 0.1 }),
    paint(ell(0.82, 0.3, 0.82, { at: [0, 1.22, 0], color: TOP, mat: 'clay', soft: 0.06 })),
    paint(ell(0.66, 0.38, 0.26, { at: [0, 0.74, 0.82], color: '#F2DDB4', mat: 'clay', soft: 0.02 })),
    ...[[0.32, 1.34, 0.2], [-0.3, 1.34, -0.22], [0.1, 1.34, -0.4]].map(([x, y, z]) => cap([x, y, z], [x + 0.03, y + 0.02, z], 0.08, { color: '#F4EAD2', g: `salt${x}`, k: 0 })),
    // Steam: three soft curls.
    ...[[-0.3, 0], [0.34, 0.1]].flatMap(([x, z]) => [ell(0.1, 0.17, 0.08, { at: [x, 1.66, z], color: '#F8F4EC', mat: 'fabric', g: `st${x}`, k: 0.08 }), ell(0.08, 0.14, 0.07, { at: [x + 0.08, 1.92, z], color: '#F8F4EC', mat: 'fabric', g: `st${x}`, k: 0.08 })]),
    ...(evo ? evolved(2.1) : []),
  ];
}

/** Kape: an expressive coffee cup, handle for an ear, steam for a thought. */
function kape(evo) {
  const CUP = '#EFE3CC';
  const COFFEE = '#5E3F2C';
  return [
    cone(0.74, 0.9, 0.72, { at: [0, 0.8, 0], color: CUP, mat: 'clay', g: 'cup', k: 0.06 }),
    sub(cone(0.66, 0.82, 0.6, { at: [0, 1.0, 0], g: 'cup', k: 0.02 })),
    cyl(0.78, 0.04, 0.02, { at: [0, 1.32, 0], color: COFFEE, mat: 'paint', g: 'coffee', k: 0 }),
    tor(0.34, 0.09, { at: [0.98, 0.84, 0], rot: [90, 0, 0], color: CUP, mat: 'clay', g: 'handle', k: 0 }),
    cyl(0.92, 0.05, 0.03, { at: [0, 0.09, 0], color: '#B98A5E', mat: 'clay', g: 'saucer', k: 0 }),
    paint(box(0.96, 0.08, 0.96, 0.02, { at: [0, 0.54, 0], color: '#69AFA4', mat: 'paint', soft: 0.012 })),
    ell(0.1, 0.2, 0.07, { at: [-0.14, 1.62, 0], color: '#F8F4EC', mat: 'fabric', g: 'steam', k: 0.08 }),
    ell(0.08, 0.17, 0.06, { at: [0, 1.9, 0], color: '#F8F4EC', mat: 'fabric', g: 'steam', k: 0.08 }),
    ...(evo ? evolved(2.14, [0.86, 1.28]) : []),
  ];
}

/** Sago: a bouncy jelly, tapioca dots suspended inside. */
function sago(evo) {
  const JELLY = '#C97FBC';
  return [
    ell(0.96, 0.82, 0.96, { at: [0, 0.82, 0], color: JELLY, mat: 'jelly', g: 'jelly', k: 0.1 }),
    sub(box(1.4, 0.2, 1.4, 0.05, { at: [0, -0.2, 0], g: 'jelly', k: 0.1 })),
    // Tapioca pearls showing through: soft dark dots painted through the whole jelly.
    ...[[0.62, 1.2, 0], [-0.62, 1.2, 0], [0.86, 0.62, 0], [-0.86, 0.62, 0], [0, 1.52, 0], [0.34, 1.5, -0.3], [-0.36, 1.46, 0.3], [0.34, 0.3, 0.6], [-0.42, 0.3, 0.6], [0.5, 1.0, -0.74], [-0.5, 1.0, -0.74], [0, 0.56, -0.9], [0, 1.2, -0.76]].map(([x, y, z]) => paint(sphere(0.13, { at: [x, y, z * 1.0 + (z === 0 ? 0 : 0)], color: '#4A3656', mat: 'jelly', soft: 0.04 }))),
    ...[[0.56, 1.02, 0.76], [-0.6, 1.0, 0.72], [0.42, 0.42, 0.78], [-0.3, 0.4, 0.86]].map(([x, y, z]) => paint(sphere(0.12, { at: [x, y, z], color: '#4A3656', mat: 'jelly', soft: 0.04 }))),
    ...(evo ? evolved(1.76) : []),
  ];
}

/** Sampy: a sampaguita blossom: a round bud of soft white petals, leaves for hands. */
function sampy(evo) {
  const PETAL = '#F7F1E4';
  const petals = [];
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    petals.push(ell(0.46, 0.17, 0.3, { at: [Math.sin(a) * 0.54, 1.02, Math.cos(a) * 0.54], rot: [0, (a * 180) / Math.PI + 90, -22], color: PETAL, mat: 'paper', g: `pet${i}`, k: 0 }));
  }
  return [
    ell(0.5, 0.56, 0.5, { at: [0, 1.28, 0], color: '#FBF7EC', mat: 'paper', g: 'bud', k: 0.08 }),
    ...petals,
    cap([0, 0.8, 0], [0, 0.22, 0], 0.09, { color: '#7BA464', g: 'stem', k: 0 }),
    ...[-1, 1].map((s) => ell(0.34, 0.07, 0.15, { at: [s * 0.38, 0.42, 0], rot: [0, 0, s * 20], color: '#6E9E5E', mat: 'leaf', g: `lf${s}`, k: 0 })),
    ...(evo ? evolved(1.96) : []),
  ];
}

/** Kawayan: a tiny guardian of bamboo sections, jointed, a leaf for a cap. */
function kawayan(evo) {
  const BAMBOO = '#A6B568';
  const NODE = '#7E8E48';
  return [
    cyl(0.5, 0.42, 0.1, { at: [0, 0.5, 0], color: BAMBOO, mat: 'wood', g: 'a', k: 0 }),
    cyl(0.44, 0.38, 0.1, { at: [0, 1.28, 0], color: BAMBOO, mat: 'wood', g: 'b', k: 0 }),
    ...[0.08, 0.92, 1.68].map((y) => tor(0.48, 0.07, { at: [0, y, 0], color: NODE, mat: 'wood', g: `n${y}`, k: 0 })),
    paint(ell(0.34, 0.26, 0.2, { at: [0, 1.32, 0.4], color: '#EEE7C2', mat: 'clay', soft: 0.02 })),
    ...[-1, 1].flatMap((s) => [cap([s * 0.5, 0.9, 0], [s * 0.86, 0.66, 0], 0.08, { color: NODE, mat: 'wood', g: `arm${s}`, k: 0 }), sphere(0.11, { at: [s * 0.88, 0.62, 0], color: BAMBOO, mat: 'wood', g: `hand${s}`, k: 0 })]),
    ell(0.5, 0.06, 0.2, { at: [0.2, 1.92, 0], rot: [0, 30, 22], color: '#7BA464', mat: 'leaf', g: 'leafA', k: 0 }),
    ell(0.4, 0.06, 0.16, { at: [-0.2, 1.92, 0.1], rot: [0, -30, -26], color: '#6E9E5E', mat: 'leaf', g: 'leafB', k: 0 }),
    ...(evo ? evolved(2.1, [0.5, 0.92]) : []),
  ];
}

/** Kalaw: a broad-beaked hornbill: a great curved beak with a casque on top. */
function kalaw(evo) {
  const FEATHER = '#3F4A52';
  const BEAK = '#E0A84C';
  const PALE = '#EFE4CF';
  return [
    ell(0.62, 0.74, 0.8, { at: [0, 1.04, -0.2], color: FEATHER, mat: 'fabric', g: 'body', k: 0.16 }),
    ell(0.5, 0.48, 0.48, { at: [0, 1.72, 0.3], color: FEATHER, mat: 'fabric', g: 'body', k: 0.22 }),
    paint(ell(0.42, 0.34, 0.32, { at: [0, 1.74, 0.62], color: PALE, mat: 'clay', soft: 0.03 })),
    paint(ell(0.46, 0.42, 0.46, { at: [0, 0.82, 0.42], color: PALE, mat: 'fabric', soft: 0.05 })),
    // Beak and casque: the silhouette.
    cone(0.27, 0.05, 0.42, { at: [0, 1.56, 1.06], rot: [100, 0, 0], color: BEAK, mat: 'paint', g: 'beak', k: 0.06 }),
    ell(0.2, 0.15, 0.42, { at: [0, 1.98, 0.76], rot: [14, 0, 0], color: '#CF7C4C', mat: 'paint', g: 'casque', k: 0.02 }),
    ...[-1, 1].map((s) => ell(0.14, 0.56, 0.5, { at: [s * 0.64, 1.0, -0.4], rot: [20, 0, s * 12], color: '#2F383E', mat: 'fabric', g: `wing${s}`, k: 0 })),
    ell(0.17, 0.08, 0.54, { at: [0, 0.54, -1.08], rot: [22, 0, 0], color: PALE, mat: 'fabric', g: 'tail', k: 0 }),
    ...[-1, 1].map((s) => cap([s * 0.24, 0.42, 0], [s * 0.26, 0.08, 0.08], 0.05, { color: BEAK, g: `lg${s}`, k: 0 })),
    ...(evo ? evolved(2.3) : []),
  ];
}

/** Tarsi: a small tarsier lookout: all eyes and ears, long curled tail, gripping fingers. */
function tarsi(evo) {
  const FUR = '#A98A68';
  const PALE = '#D9C4A4';
  return [
    ell(0.5, 0.62, 0.48, { at: [0, 0.74, -0.06], color: FUR, mat: 'fabric', g: 'body', k: 0.14 }),
    ell(0.68, 0.58, 0.56, { at: [0, 1.56, 0.12], color: FUR, mat: 'fabric', g: 'body', k: 0.18 }),
    paint(ell(0.54, 0.42, 0.26, { at: [0, 1.5, 0.6], color: PALE, mat: 'clay', soft: 0.03 })),
    ...[-1, 1].map((s) => ell(0.32, 0.42, 0.08, { at: [s * 0.76, 2.0, 0], rot: [0, s * 20, s * 16], color: '#C9A98A', mat: 'clay', g: `ear${s}`, k: 0 })),
    ...[-1, 1].flatMap((s) => [cap([s * 0.3, 0.34, 0.16], [s * 0.42, 0.1, 0.36], 0.1, { color: FUR, g: `ft${s}`, k: 0 }), cap([s * 0.42, 0.86, 0.26], [s * 0.3, 0.6, 0.5], 0.07, { color: FUR, g: `hn${s}`, k: 0 })]),
    // The curled tail.
    cap([0, 0.5, -0.46], [0, 0.26, -1.02], 0.05, { color: FUR, g: 'tail', k: 0.04 }),
    tor(0.22, 0.05, { at: [0, 0.48, -1.2], rot: [0, 0, 90], color: FUR, g: 'tail', k: 0.04 }),
    ...(evo ? evolved(2.4) : []),
  ];
}

/** Piko: a hopping chalk-and-stone playmate: a flat pebble body on chalk legs, hopscotch squares on it. */
function piko(evo) {
  const STONE = '#8F928A';
  const CHALK = '#FBF7EC';
  return [
    ell(0.96, 0.56, 0.78, { at: [0, 1.08, 0], color: STONE, mat: 'clay', g: 'stone', k: 0.1 }),
    paint(ell(0.66, 0.34, 0.22, { at: [0, 1.14, 0.66], color: '#E2E2D4', mat: 'clay', soft: 0.02 })),
    ...[[-0.2, 0.6], [0.2, 0.6], [0, 0.2], [0, -0.2], [-0.2, -0.6], [0.2, -0.6]].map(([x, z], i) => paint(box(0.15, 0.3, 0.15, 0.01, { at: [x, 1.6, z], color: CHALK, mat: 'paper', soft: 0.012 }))),
    ...[-1, 1].flatMap((s) => [cap([s * 0.44, 0.66, 0.1], [s * 0.54, 0.24, 0.1], 0.11, { color: CHALK, mat: 'paper', g: `lg${s}`, k: 0 }), ell(0.24, 0.1, 0.32, { at: [s * 0.56, 0.11, 0.2], color: CHALK, mat: 'paper', g: `fo${s}`, k: 0 })]),
    ...(evo ? evolved(1.84) : []),
  ];
}

/** Saranggola: a little kite creature: a paper diamond with a bow-tie tail. */
function saranggola(evo) {
  const PAPER = '#D97C6C';
  const STICK = '#8C6E46';
  return [
    box(0.86, 0.86, 0.04, 0.03, { at: [0, 1.56, 0], rot: [0, 0, 45], color: PAPER, mat: 'paper', g: 'kite', k: 0 }),
    paint(box(0.44, 0.44, 0.1, 0.02, { at: [0.61, 1.56, 0], rot: [0, 0, 45], color: '#E9B54C', mat: 'paper', soft: 0.01 })),
    paint(box(0.44, 0.44, 0.1, 0.02, { at: [-0.61, 1.56, 0], rot: [0, 0, 45], color: '#69AFA4', mat: 'paper', soft: 0.01 })),
    paint(ell(0.5, 0.34, 0.1, { at: [0, 1.64, 0.02], color: CREAM, mat: 'paper', soft: 0.02 })),
    cap([0, 0.36, -0.05], [0, 2.76, -0.05], 0.03, { color: STICK, mat: 'wood', g: 'stA', k: 0 }),
    cap([-1.2, 1.56, -0.05], [1.2, 1.56, -0.05], 0.03, { color: STICK, mat: 'wood', g: 'stB', k: 0 }),
    ...[[0.1, 0.24], [-0.04, 0.02]].flatMap(([x, y], i) => [-1, 1].map((s) => cone(0.11, 0.015, 0.11, { at: [x + s * 0.11, y + 0.1, -0.05], rot: [0, 0, s * 90], color: i ? '#69AFA4' : '#E9B54C', mat: 'fabric', g: `bow${i}${s}`, k: 0 }))),
    ...(evo ? evolved(2.86) : []),
  ];
}

/** Duwi: a tiny fictional tinkerer in earthy clothes, a cap like a mushroom, an oversized spanner over the shoulder. */
function duwi(evo) {
  const CLOTH = '#8C6E46';
  const SKIN = '#D9B68C';
  const HAT = '#A85C3C';
  const STEEL = '#9AA6A8';
  return [
    cone(0.56, 0.32, 0.46, { at: [0, 0.62, 0], color: CLOTH, mat: 'fabric', g: 'body', k: 0.08 }),
    ell(0.46, 0.42, 0.42, { at: [0, 1.32, 0.04], color: SKIN, mat: 'clay', g: 'head', k: 0.04 }),
    ell(0.8, 0.34, 0.8, { at: [0, 1.72, 0], color: HAT, mat: 'fabric', g: 'hat', k: 0.02 }),
    sub(box(1, 0.3, 1, 0.02, { at: [0, 1.38, 0], g: 'hat', k: 0.02 })),
    ...[[0.3, 0.42], [-0.36, 0.3], [0, 0.56], [0.1, -0.5]].map(([x, z], i) => paint(sphere(0.1, { at: [x, 1.86, z], color: '#EFE4CF', mat: 'clay', soft: 0.015 }))),
    ...[-1, 1].map((s) => ell(0.2, 0.1, 0.24, { at: [s * 0.3, 0.14, 0.14], color: '#5A4632', mat: 'clay', g: `sh${s}`, k: 0 })),
    cap([0.34, 0.92, 0.1], [0.62, 0.78, 0.2], 0.08, { color: CLOTH, g: 'armR', k: 0 }),
    cap([-0.34, 0.92, 0.1], [-0.58, 0.72, 0.2], 0.08, { color: CLOTH, g: 'armL', k: 0 }),
    // The spanner, larger than its owner's patience.
    cap([0.66, 0.16, 0.2], [0.82, 1.7, 0.1], 0.08, { color: STEEL, mat: 'metal', g: 'sp', k: 0.05 }),
    tor(0.24, 0.09, { at: [0.86, 1.94, 0.1], rot: [90, 0, 0], color: STEEL, mat: 'metal', g: 'sp', k: 0.05 }),
    sub(box(0.14, 0.22, 0.3, 0.01, { at: [0.9, 2.18, 0.1], g: 'sp', k: 0 })),
    ...(evo ? evolved(2.14) : []),
  ];
}

/** Silaw: a warm firefly, a soft lantern for a belly. */
function silaw(evo) {
  const SHELL = '#55655C';
  return [
    ell(0.5, 0.48, 0.66, { at: [0, 1.36, 0.12], color: SHELL, mat: 'paint', g: 'top', k: 0.1 }),
    ell(0.54, 0.54, 0.54, { at: [0, 0.8, -0.28], color: '#F2CE6E', mat: 'glow', g: 'belly', k: 0 }),
    paint(ell(0.36, 0.28, 0.2, { at: [0, 1.4, 0.68], color: '#E5E0C8', mat: 'clay', soft: 0.02 })),
    ...[-1, 1].map((s) => ell(0.5, 0.05, 0.28, { at: [s * 0.62, 1.74, -0.14], rot: [0, s * 16, s * 28], color: '#DCEBE0', mat: 'glass', g: `wing${s}`, k: 0 })),
    ...[-1, 1].map((s) => cap([s * 0.16, 1.76, 0.5], [s * 0.34, 2.14, 0.66], 0.025, { color: SHELL, g: `an${s}`, k: 0 })),
    ...[-1, 1].map((s) => sphere(0.06, { at: [s * 0.35, 2.17, 0.67], color: '#F2CE6E', mat: 'glow', g: `anT${s}`, k: 0 })),
    ...(evo ? evolved(2.2) : []),
  ];
}

/** Bitu: a small meteor-pebble mechanic: a rough rock with a goggle band, its own little stones orbiting. */
function bitu(evo) {
  const ROCK = '#6A5E58';
  const EMBER = '#E08A4C';
  return [
    ell(0.76, 0.68, 0.72, { at: [0, 1.06, 0], color: ROCK, mat: 'clay', g: 'rock', k: 0.14 }),
    sphere(0.3, { at: [0.5, 1.46, 0.2], color: ROCK, mat: 'clay', g: 'rock', k: 0.2 }),
    sphere(0.26, { at: [-0.5, 0.74, -0.2], color: ROCK, mat: 'clay', g: 'rock', k: 0.2 }),
    paint(ell(0.5, 0.32, 0.26, { at: [0, 1.1, 0.6], color: '#C9B8A4', mat: 'clay', soft: 0.03 })),
    paint(ell(0.28, 0.2, 0.3, { at: [-0.34, 1.54, 0.44], color: EMBER, mat: 'glow', soft: 0.05 })),
    paint(ell(0.22, 0.16, 0.3, { at: [0.42, 0.68, 0.46], color: EMBER, mat: 'glow', soft: 0.05 })),
    ell(0.17, 0.14, 0.15, { at: [1.04, 1.5, -0.14], color: '#7E726A', mat: 'clay', g: 'stA', k: 0 }),
    ell(0.13, 0.11, 0.12, { at: [-1.02, 1.26, 0.2], color: '#7E726A', mat: 'clay', g: 'stB', k: 0 }),
    ell(0.1, 0.09, 0.09, { at: [0.84, 0.52, 0.34], color: '#7E726A', mat: 'clay', g: 'stC', k: 0 }),
    ...(evo ? evolved(1.98) : []),
  ];
}

/** Gearo: a wind-up mechanical beetle: a domed shell, a big crank key on its back. */
function gearo(evo) {
  const SHELL = '#3F7F76';
  const BRASS = '#C9A04C';
  return [
    ell(0.86, 0.6, 1.0, { at: [0, 0.78, -0.08], color: SHELL, mat: 'metal', g: 'shell', k: 0.04 }),
    paint(box(0.03, 0.8, 1.2, 0.01, { at: [0, 0.9, -0.1], color: BRASS, mat: 'metal', soft: 0.01 })),
    ell(0.52, 0.42, 0.42, { at: [0, 0.64, 0.84], color: BRASS, mat: 'metal', g: 'head', k: 0.06 }),
    paint(ell(0.4, 0.26, 0.2, { at: [0, 0.68, 1.16], color: '#F2E8D0', mat: 'clay', soft: 0.02 })),
    ...[-1, 1].flatMap((s) => [0.4, -0.1, -0.6].map((z) => cap([s * 0.72, 0.42, z], [s * 1.04, 0.12, z + 0.08], 0.05, { color: BRASS, mat: 'metal', g: `l${s}${z}`, k: 0 }))),
    ...[-1, 1].map((s) => cap([s * 0.2, 0.96, 1.06], [s * 0.42, 1.32, 1.24], 0.03, { color: BRASS, mat: 'metal', g: `an${s}`, k: 0 })),
    // The crank.
    cap([0, 1.3, -0.26], [0, 1.78, -0.26], 0.07, { color: BRASS, mat: 'metal', g: 'crank', k: 0.03 }),
    cap([-0.42, 1.92, -0.26], [0.42, 1.92, -0.26], 0.07, { color: BRASS, mat: 'metal', g: 'crank', k: 0.03 }),
    ...[-1, 1].map((s) => ell(0.2, 0.17, 0.07, { at: [s * 0.46, 1.92, -0.26], color: BRASS, mat: 'metal', g: 'crank', k: 0.04 })),
    ...(evo ? evolved(2.14) : []),
  ];
}

/** Ulap: a plump cloud with a tiny rain-tail. */
function ulap(evo) {
  const CLOUD = '#F2F4F0';
  return [
    sphere(0.66, { at: [0, 1.32, 0], color: CLOUD, mat: 'fabric', g: 'cloud', k: 0.2 }),
    sphere(0.48, { at: [0.72, 1.14, 0], color: CLOUD, mat: 'fabric', g: 'cloud', k: 0.2 }),
    sphere(0.5, { at: [-0.72, 1.14, 0.04], color: CLOUD, mat: 'fabric', g: 'cloud', k: 0.2 }),
    sphere(0.4, { at: [0.3, 1.72, -0.1], color: CLOUD, mat: 'fabric', g: 'cloud', k: 0.2 }),
    sphere(0.42, { at: [0, 1.1, -0.5], color: CLOUD, mat: 'fabric', g: 'cloud', k: 0.2 }),
    paint(ell(0.46, 0.3, 0.2, { at: [0, 1.22, 0.58], color: '#FDFDF8', mat: 'clay', soft: 0.03 })),
    ...[[-0.36, 0.5], [0, 0.32], [0.36, 0.5]].map(([x, y], i) => ell(0.07, 0.16, 0.07, { at: [x, y, 0], color: '#7FB0D0', mat: 'glass', g: `dr${i}`, k: 0 })),
    ...(evo ? evolved(2.14) : []),
  ];
}

// ---- the six newest ---------------------------------------------------------------------

/** Kono: a small lilac traffic cone that has come alive and is a little embarrassed about it. */
function kono(evo) {
  const LILAC = '#C4A8E8';
  const DEEP = '#9A7FC8';
  return [
    cone(0.68, 0.16, 0.86, { at: [0, 1.08, 0], color: LILAC, mat: 'clay', g: 'body', k: 0.06 }),
    sphere(0.2, { at: [0, 1.96, 0], color: LILAC, mat: 'clay', g: 'body', k: 0.2 }),
    paint(box(1.2, 0.085, 1.2, 0.02, { at: [0, 1.62, 0], color: '#F8F1FC', mat: 'clay', soft: 0.014 })),
    box(0.84, 0.1, 0.84, 0.1, { at: [0, 0.26, 0], color: DEEP, mat: 'clay', g: 'body', k: 0.12 }),
    ...tyre(0.62, 0.16, 0.42, 0.16, 0.08), ...tyre(-0.62, 0.16, 0.42, 0.16, 0.08), ...tyre(0.62, 0.16, -0.42, 0.16, 0.08), ...tyre(-0.62, 0.16, -0.42, 0.16, 0.08),
    ...(evo ? evolved(2.14) : []),
  ];
}

/** Kislap: a tiny glowing firefly: one round body, two short antennae, the smallest wings it could get away with. */
function kislap(evo) {
  const GLOW = '#F7D860';
  return [
    sphere(0.62, { at: [0, 1.12, 0], color: GLOW, mat: 'lens', g: 'body', k: 0.1 }),
    paint(ell(0.42, 0.34, 0.3, { at: [0, 0.84, 0.46], color: '#FFF1B4', mat: 'lens', soft: 0.1 })),
    ...[-1, 1].map((s) => ell(0.3, 0.05, 0.2, { at: [s * 0.62, 1.48, -0.26], rot: [0, s * 16, s * 30], color: '#EEF4E6', mat: 'paper', g: `wing${s}`, k: 0 })),
    ...[-1, 1].flatMap((s) => [
      cap([s * 0.2, 1.66, 0.1], [s * 0.34, 2.0, 0.2], 0.03, { color: '#8A6E3C', mat: 'clay', g: `an${s}`, k: 0 }),
      sphere(0.07, { at: [s * 0.35, 2.04, 0.21], color: '#FFE78A', mat: 'lens', g: `anT${s}`, k: 0 }),
    ]),
    ...(evo ? evolved(2.2) : []),
  ];
}

/** Dahon: a mint bean who sprouted, two small leaves on top, always about to fall asleep. */
function dahon(evo) {
  const MINT = '#A8DDB8';
  const LEAF = '#6FB26E';
  return [
    ell(0.66, 0.68, 0.58, { at: [0, 0.84, 0], color: MINT, mat: 'clay', g: 'body', k: 0.1 }),
    ell(0.52, 0.5, 0.46, { at: [0, 1.34, 0], color: MINT, mat: 'clay', g: 'body', k: 0.26 }),
    cap([0, 1.8, 0], [0, 2.02, 0], 0.04, { color: LEAF, mat: 'clay', g: 'stem', k: 0 }),
    ...[-1, 1].map((s) => ell(0.26, 0.055, 0.13, { at: [s * 0.22, 2.1, 0], rot: [0, 0, s * 24], color: LEAF, mat: 'leaf', g: `lf${s}`, k: 0 })),
    ...[-1, 1].map((s) => ell(0.18, 0.11, 0.24, { at: [s * 0.3, 0.13, 0.1], color: '#8CC49C', mat: 'clay', g: 'body', k: 0.08 })),
    ...(evo ? evolved(2.26) : []),
  ];
}

/** Radyo: a tiny teal transistor radio, rounded by years of being carried about. It always heard it first. */
function radyo(evo) {
  const TEAL = '#4FA7A0';
  const DEEP = '#357A76';
  const PALE = '#E4F1E8';
  return [
    box(0.74, 0.6, 0.44, 0.38, { at: [0, 0.8, 0], color: TEAL, mat: 'paint', g: 'body', k: 0.1 }),
    // The speaker: three soft slots below the face.
    ...[0.42, 0.53, 0.64].map((y) => paint(box(0.3, 0.022, 0.2, 0.01, { at: [0, y, 0.44], color: DEEP, mat: 'paint', soft: 0.012 }))),
    sphere(0.1, { at: [0.54, 0.52, 0.42], color: PALE, mat: 'paint', g: 'dial', k: 0 }),
    cap([-0.42, 1.28, -0.1], [-0.56, 1.84, -0.1], 0.03, { color: '#8FA8A4', mat: 'metal', g: 'ant', k: 0 }),
    sphere(0.075, { at: [-0.57, 1.89, -0.1], color: '#F2C879', mat: 'paint', g: 'antT', k: 0 }),
    ...[-1, 1].map((s) => ell(0.18, 0.1, 0.22, { at: [s * 0.36, 0.14, 0.02], color: DEEP, mat: 'paint', g: 'body', k: 0.06 })),
    ...(evo ? evolved(1.9) : []),
  ];
}

/** Ginto: a golden beetle on tiny wheels, very pleased with itself and already counting. */
function ginto(evo) {
  const GOLDEN = '#E8BC44';
  const LIGHT = '#F4D872';
  const DEEP = '#B58A2A';
  return [
    ell(0.82, 0.62, 0.88, { at: [0, 0.86, -0.08], color: GOLDEN, mat: 'paint', g: 'body', k: 0.1 }),
    ell(0.54, 0.44, 0.4, { at: [0, 0.76, 0.72], color: LIGHT, mat: 'paint', g: 'body', k: 0.2 }),
    paint(box(0.03, 0.8, 0.9, 0.01, { at: [0, 1.0, -0.42], color: DEEP, mat: 'paint', soft: 0.012 })),
    ...[[0.42, 1.2, -0.3], [-0.42, 1.2, -0.3], [0.34, 1.26, -0.72], [-0.34, 1.26, -0.72]].map(([x, y, z]) => paint(sphere(0.09, { at: [x, y, z], color: LIGHT, mat: 'paint', soft: 0.02 }))),
    ...[-1, 1].map((s) => cap([s * 0.18, 1.1, 0.84], [s * 0.34, 1.42, 0.98], 0.024, { color: DEEP, mat: 'paint', g: `an${s}`, k: 0 })),
    ...[-1, 1].map((s) => sphere(0.055, { at: [s * 0.35, 1.46, 0.99], color: LIGHT, mat: 'paint', g: `anT${s}`, k: 0 })),
    ...tyre(0.5, 0.2, 0.36, 0.2, 0.09), ...tyre(-0.5, 0.2, 0.36, 0.2, 0.09), ...tyre(0.5, 0.2, -0.5, 0.2, 0.09), ...tyre(-0.5, 0.2, -0.5, 0.2, 0.09),
    ...(evo ? evolved(1.66) : []),
  ];
}

/** Hamog: a pastel-blue puff of morning mist: rounder than a cloud, and in no hurry to be anywhere. */
function hamog(evo) {
  const MIST = '#BFDAF2';
  const PALE = '#DCECF8';
  return [
    sphere(0.7, { at: [0, 1.2, 0], color: MIST, mat: 'fabric', g: 'puff', k: 0.2 }),
    sphere(0.4, { at: [0.62, 1.0, 0], color: MIST, mat: 'fabric', g: 'puff', k: 0.24 }),
    sphere(0.4, { at: [-0.62, 1.0, 0], color: MIST, mat: 'fabric', g: 'puff', k: 0.24 }),
    sphere(0.3, { at: [0.3, 1.78, -0.1], color: MIST, mat: 'fabric', g: 'puff', k: 0.2 }),
    // The wisps it trails: not rain, only the idea of it.
    ell(0.24, 0.08, 0.18, { at: [-0.26, 0.36, 0], rot: [0, 0, 8], color: PALE, mat: 'fabric', g: 'wispA', k: 0 }),
    ell(0.17, 0.065, 0.14, { at: [0.26, 0.26, 0.04], rot: [0, 0, -8], color: PALE, mat: 'fabric', g: 'wispB', k: 0 }),
    ...(evo ? evolved(2.14) : []),
  ];
}

/**
 * What each face is sculpted from. `face` holds where it goes on the model; these tune it, and between them
 * they are most of a sidekick's personality. eye: height of the oval. wide: its width against its height.
 * roll: tilt, outer corners down. w and sag: the smile's half-width and depth. smile: its shape. none: no smile (a beak does that job).
 * cheek: blush colour. eyes, mouth: where they go, when not where the old face had them.
 */
const FACE_TUNING = {
  pip: { eye: 0.125, wide: 0.86, cheek: '#F4B8AE', eyeColor: '#1C2A48', w: 0.11, sag: 0.05, eyes: [[-0.27, 1.04, 0.9], [0.27, 1.04, 0.9]], mouth: [0, 0.84, 0.92] },
  bumbo: { eye: 0.15, wide: 0.72, roll: 0, cheek: '#F8A98C', cheekR: 0.13, cheekX: 0.14, cheekY: -0.16, eyeColor: '#2A1F3A', eyes: [[-0.32, 1.46, 1.02], [0.32, 1.46, 1.02]], openMouth: { y: 1.4, z: 1.02, w: 0.16, h: 0.15, lift: 0.028, depth: 0.09, tongueTop: 0.5, tongueWide: 0.68 } },
  mila: { eye: 0.17, wide: 0.72, roll: 0, cheek: '#F8A0A8', cheekR: 0.13, cheekX: 0.15, cheekY: -0.17, eyeColor: '#2A1F3A', eyes: [[-0.36, 1.2, 0.9], [0.36, 1.2, 0.9]], mouth: [0, 1.05, 0.92], w: 0.11, sag: 0.05 },
  kumpuni: { eye: 0.09, wide: 0.92, roll: 0, cheek: '#F0B99C', eyeColor: '#26321E', eyes: [[-0.22, 1.54, 0.72], [0.22, 1.54, 0.72]], mouth: [0, 1.37, 0.72], w: 0.07, sag: 0.02, smile: 'flat' },
  bantay: { eye: 0.095, wide: 0.98, roll: 0, eyeColor: '#241A12', eyes: [[-0.24, 1.66, 0.94], [0.24, 1.66, 0.94]], w: 0.09, sag: 0.03 },
  silip: { eye: 0.13, wide: 0.92, roll: 0, cheek: '#8FC4C0', eyeColor: '#16262C', eyes: [[-0.38, 1.25, 0.7], [0.38, 1.25, 0.7]], mouth: [0, 0.63, 0.62], w: 0.08, sag: 0.03 },
  walis: { eye: 0.105, wide: 0.84, cheek: '#F2B8A4', eyeColor: '#1E3028', w: 0.08, sag: 0.03 },
  barya: { eye: 0.11, wide: 0.92, roll: 0, cheek: '#F2A97E', eyeColor: '#4A3410', dropPaint: [[0, 1.12, -0.17]], w: 0.1, sag: 0.04 },
  sibat: { eye: 0.1, wide: 0.86, roll: -2, cheek: '#F2A79A', eyeColor: '#2A1C1C', eyes: [[-0.16, 1.04, 1.34], [0.16, 1.04, 1.34]], mouth: [0, 0.87, 1.34], w: 0.06, sag: 0.016, smile: 'flat' },
  tala: { eye: 0.085, wide: 0.86, cheek: '#F2A27C', eyeColor: '#4A3410', w: 0.06, sag: 0.03 },
  ilaw: { eye: 0.095, wide: 0.86, roll: 0, w: 0.065, sag: 0.018, smile: 'flat', cheek: '#EFA052', eyeColor: '#2E2410', eyes: [[-0.13, 1.38, 0.56], [0.13, 1.38, 0.56]], mouth: [0, 1.19, 0.56] },
  maso: { eye: 0.105, wide: 0.92, roll: 0, cheek: '#EFB08E', eyeColor: '#2A1E14', w: 0.08, sag: 0.018, smile: 'flat' },
  parolito: { eye: 0.085, wide: 0.9, cheek: '#F2A27C', eyeColor: '#4A3410', w: 0.06, sag: 0.03 },
  bibing: { eye: 0.1, wide: 0.9, cheek: '#EC9A70', eyeColor: '#3A2412', w: 0.09, sag: 0.04 },
  kape: { eye: 0.1, wide: 0.92, roll: 3, cheek: '#E9B79A', eyeColor: '#2A1C14', w: 0.08, sag: 0.03, smile: 'wave' },
  // The pearls beside the face move out to the flanks, so none of them crowds the eyes or the smile.
  sago: {
    eye: 0.105,
    wide: 0.84,
    cheek: '#F2A6D0',
    eyeColor: '#2E1E3A',
    w: 0.09,
    sag: 0.045,
    dropPaint: [[0.56, 1.02, 0.76], [-0.6, 1.0, 0.72], [0.42, 0.42, 0.78], [-0.3, 0.4, 0.86]],
    extra: [[0.84, 1.0, 0.36], [-0.84, 1.0, 0.36]].map(([x, y, z]) => paint(sphere(0.12, { at: [x, y, z], color: '#4A3656', mat: 'jelly', soft: 0.04 }))),
  },
  sampy: { eye: 0.07, wide: 0.8, cheek: '#F6C8C8', eyeColor: '#2E3A28', w: 0.05, sag: 0.02, smile: 'cat' },
  kawayan: { eye: 0.07, wide: 0.9, roll: 0, cheek: '#D9CF8E', eyeColor: '#26301A', w: 0.05, sag: 0.012, smile: 'flat' },
  kalaw: { eye: 0.11, wide: 0.9, none: true, eyeColor: '#1E1E22', roll: -3, eyes: [[-0.27, 1.82, 0.72], [0.27, 1.82, 0.72]] },
  // Enormous eyes are the whole point of a tarsier: still round and dark, but kept from being googly.
  tarsi: { eye: 0.15, wide: 0.98, roll: 0, eyeColor: '#1E140E', w: 0.06, sag: 0.02 },
  piko: { eye: 0.1, wide: 0.82, cheek: '#EEC4BC', eyeColor: '#26282A', w: 0.1, sag: 0.035, smile: 'smirk', skew: 0.022 },
  // Paper thin, so a little pad behind the face keeps the eyes from showing through.
  saranggola: { eye: 0.085, wide: 0.84, cheek: '#F2B6B0', eyeColor: '#2E1E18', w: 0.08, sag: 0.035, smile: 'wave', extra: [ell(0.42, 0.26, 0.11, { at: [0, 1.72, -0.06], color: '#D97C6C', mat: 'paper', g: 'kite', k: 0.02 })] },
  duwi: { eye: 0.075, wide: 0.92, roll: 0, cheek: '#EFA88A', eyeColor: '#2A1C12', w: 0.05, sag: 0.018 },
  silaw: { eye: 0.075, wide: 0.84, cheek: '#EFD08E', eyeColor: '#26302A', w: 0.05, sag: 0.018 },
  bitu: { eye: 0.09, wide: 0.92, roll: 0, cheek: '#EFB08E', eyeColor: '#1E1612', w: 0.08, sag: 0.016, smile: 'flat' },
  gearo: { eye: 0.075, wide: 0.96, roll: 0, cheek: '#EFC48E', eyeColor: '#2E2410', w: 0.05, sag: 0.014, smile: 'flat' },
  // The cloud's lumps are uneven: a smooth, level mound of face sits over them.
  ulap: { eye: 0.08, wide: 0.86, cheek: '#F2C4D0', eyeColor: '#2E3A4A', w: 0.05, sag: 0.02, extra: [ell(0.6, 0.42, 0.34, { at: [0, 1.22, 0.42], color: '#F2F4F0', mat: 'fabric', g: 'cloud', k: 0.2 })] },
  // The newest.
  kono: { eye: 0.1, wide: 0.72, roll: 2, cheek: '#F2A8C4', eyeColor: '#18141E', eyes: [[-0.19, 1.04, 0.52], [0.19, 1.04, 0.52]], mouth: [0, 0.86, 0.6], w: 0.05, sag: 0.018 },
  kislap: { eye: 0.095, wide: 0.82, roll: -2, cheek: '#F6B36A', eyeColor: '#3A2A10', eyes: [[-0.22, 1.24, 0.56], [0.22, 1.24, 0.56]], mouth: [0, 1.05, 0.6], w: 0.05, sag: 0.024 },
  dahon: { eye: 0.085, wide: 0.92, roll: 3, cheek: '#F2B4A0', eyeColor: '#1E3224', eyes: [[-0.21, 1.32, 0.44], [0.21, 1.32, 0.44]], mouth: [0, 1.14, 0.5], w: 0.06, sag: 0.024 },
  radyo: { eye: 0.1, wide: 0.94, roll: 0, cheek: '#8FD0C4', eyeColor: '#0E2422', eyes: [[-0.27, 1.06, 0.44], [0.27, 1.06, 0.44]], mouth: [0, 0.84, 0.44], w: 0.07, sag: 0.026 },
  ginto: { eye: 0.09, wide: 0.86, roll: -3, cheek: '#F2A868', eyeColor: '#2E1E08', eyes: [[-0.2, 0.84, 1.08], [0.2, 0.84, 1.08]], mouth: [0, 0.66, 1.12], w: 0.09, sag: 0.03, smile: 'smirk', skew: 0.026 },
  hamog: { eye: 0.075, wide: 0.92, roll: 2, cheek: '#F4C4D4', eyeColor: '#26364A', eyes: [[-0.2, 1.26, 0.66], [0.2, 1.26, 0.66]], mouth: [0, 1.08, 0.66], w: 0.05, sag: 0.018 },
};

function faceSculpt(id, face) {
  const t = FACE_TUNING[id] || {};
  const r = t.eye || face.eye * 0.75;
  const spacing = Math.abs(face.eyes[1][0] - face.eyes[0][0]);
  return {
    eyes: t.eyes || face.eyes,
    dropPaint: t.dropPaint,
    extra: t.extra,
    eye: r,
    wide: t.wide || 0.76,
    roll: t.roll === undefined ? 2 : t.roll,
    eyeColor: t.eyeColor,
    openMouth: t.openMouth,
    dimple: t.dimple === undefined ? 0.1 : t.dimple,
    mouth: t.none || t.openMouth ? null : (t.mouth || [face.mouth[0], face.mouth[1] + (t.smileY || 0), face.mouth[2]]),
    smile: t.none || t.openMouth ? null : { w: t.w || spacing * 0.26, sag: t.sag || Math.max(0.026, r * 0.32), depth: Math.max(0.014, r * 0.15), kind: t.smile, skew: t.skew },
    cheek: t.cheek ? { color: t.cheek, r: t.cheekR || r * 0.78, dx: t.cheekX === undefined ? r * 0.95 : t.cheekX, dy: t.cheekY === undefined ? -r * 1.15 : t.cheekY } : undefined,
  };
}

const SIDEKICKS = {
  pip: { make: pip, face: { eyes: [[-0.3, 1.02, 0.9], [0.3, 1.02, 0.9]], mouth: [0, 0.74, 0.92], eye: 0.17 } },
  bumbo: { make: bumbo, face: { eyes: [[-0.32, 1.46, 1.02], [0.32, 1.46, 1.02]], mouth: [0, 1.3, 1.04], eye: 0.15 } },
  mila: { make: mila, face: { eyes: [[-0.36, 1.2, 0.9], [0.36, 1.2, 0.9]], mouth: [0, 1.05, 0.92], eye: 0.17 } },
  kumpuni: { make: kumpuni, face: { eyes: [[-0.24, 1.52, 0.72], [0.24, 1.52, 0.72]], mouth: [0, 1.28, 0.72], eye: 0.13 } },
  bantay: { make: bantay, face: { eyes: [[-0.26, 1.62, 0.94], [0.26, 1.62, 0.94]], mouth: [0, 1.12, 1.12], eye: 0.11 } },
  silip: { make: silip, face: { eyes: [[-0.44, 1.32, 0.56], [0.44, 1.32, 0.56]], mouth: [0, 0.66, 0.68], eye: 0.09 } },
  walis: { make: walis, face: { eyes: [[-0.28, 1.24, 0.88], [0.28, 1.24, 0.88]], mouth: [0, 0.98, 0.9], eye: 0.15 } },
  barya: { make: barya, face: { eyes: [[-0.26, 1.28, 0.2], [0.26, 1.28, 0.2]], mouth: [0, 1.02, 0.2], eye: 0.13 } },
  sibat: { make: sibat, face: { eyes: [[-0.14, 1.12, 0.92], [0.14, 1.12, 0.92]], mouth: [0, 0.96, 0.98], eye: 0.08 } },
  tala: { make: tala, face: { eyes: [[-0.2, 1.24, 0.27], [0.2, 1.24, 0.27]], mouth: [0, 1.04, 0.28], eye: 0.12 } },
  ilaw: { make: ilaw, face: { eyes: [[-0.14, 1.32, 0.54], [0.14, 1.32, 0.54]], mouth: [0, 1.06, 0.54], eye: 0.06 } },
  maso: { make: maso, face: { eyes: [[-0.24, 1.7, 0.62], [0.24, 1.7, 0.62]], mouth: [0, 1.46, 0.62], eye: 0.14 } },
  parolito: { make: parolito, face: { eyes: [[-0.2, 1.46, 0.32], [0.2, 1.46, 0.32]], mouth: [0, 1.22, 0.32], eye: 0.12 } },
  bibing: { make: bibing, face: { eyes: [[-0.28, 0.84, 0.96], [0.28, 0.84, 0.96]], mouth: [0, 0.58, 0.96], eye: 0.13 } },
  kape: { make: kape, face: { eyes: [[-0.26, 0.92, 0.84], [0.26, 0.92, 0.84]], mouth: [0, 0.66, 0.8], eye: 0.13 } },
  sago: { make: sago, face: { eyes: [[-0.3, 0.92, 0.86], [0.3, 0.92, 0.86]], mouth: [0, 0.64, 0.86], eye: 0.13 } },
  sampy: { make: sampy, face: { eyes: [[-0.17, 1.36, 0.5], [0.17, 1.36, 0.5]], mouth: [0, 1.16, 0.5], eye: 0.09 } },
  kawayan: { make: kawayan, face: { eyes: [[-0.16, 1.38, 0.46], [0.16, 1.38, 0.46]], mouth: [0, 1.18, 0.46], eye: 0.09 } },
  kalaw: { make: kalaw, face: { eyes: [[-0.24, 1.82, 0.72], [0.24, 1.82, 0.72]], mouth: [0, 1.5, 1.42], eye: 0.1, noMouth: true } },
  tarsi: { make: tarsi, face: { eyes: [[-0.26, 1.62, 0.66], [0.26, 1.62, 0.66]], mouth: [0, 1.3, 0.66], eye: 0.21 } },
  piko: { make: piko, face: { eyes: [[-0.26, 1.22, 0.74], [0.26, 1.22, 0.74]], mouth: [0, 0.98, 0.76], eye: 0.13 } },
  saranggola: { make: saranggola, face: { eyes: [[-0.2, 1.72, 0.05], [0.2, 1.72, 0.05]], mouth: [0, 1.46, 0.05], eye: 0.11 } },
  duwi: { make: duwi, face: { eyes: [[-0.17, 1.34, 0.45], [0.17, 1.34, 0.45]], mouth: [0, 1.1, 0.42], eye: 0.08 } },
  silaw: { make: silaw, face: { eyes: [[-0.16, 1.46, 0.7], [0.16, 1.46, 0.7]], mouth: [0, 1.28, 0.72], eye: 0.09 } },
  bitu: { make: bitu, face: { eyes: [[-0.22, 1.18, 0.66], [0.22, 1.18, 0.66]], mouth: [0, 0.96, 0.68], eye: 0.12 } },
  gearo: { make: gearo, face: { eyes: [[-0.17, 0.76, 1.16], [0.17, 0.76, 1.16]], mouth: [0, 0.58, 1.18], eye: 0.09 } },
  ulap: { make: ulap, face: { eyes: [[-0.2, 1.3, 0.66], [0.2, 1.3, 0.66]], mouth: [0, 1.06, 0.66], eye: 0.11 } },
  kono: { make: kono, face: { eyes: [[-0.19, 1.04, 0.52], [0.19, 1.04, 0.52]], mouth: [0, 0.86, 0.6], eye: 0.1 } },
  kislap: { make: kislap, face: { eyes: [[-0.22, 1.24, 0.56], [0.22, 1.24, 0.56]], mouth: [0, 1.05, 0.6], eye: 0.095 } },
  dahon: { make: dahon, face: { eyes: [[-0.21, 1.32, 0.44], [0.21, 1.32, 0.44]], mouth: [0, 1.14, 0.5], eye: 0.085 } },
  radyo: { make: radyo, face: { eyes: [[-0.27, 1.06, 0.44], [0.27, 1.06, 0.44]], mouth: [0, 0.84, 0.44], eye: 0.1 } },
  ginto: { make: ginto, face: { eyes: [[-0.2, 0.84, 1.08], [0.2, 0.84, 1.08]], mouth: [0, 0.66, 1.12], eye: 0.09 } },
  hamog: { make: hamog, face: { eyes: [[-0.2, 1.26, 0.66], [0.2, 1.26, 0.66]], mouth: [0, 1.08, 0.66], eye: 0.075 } },
};

for (const [id, def] of Object.entries(SIDEKICKS)) {
  def.sculpt = faceSculpt(id, def.face);
}

/**
 * Four whose fronts needed more than a face: the same characters and accessories, reshaped where the face goes.
 * Their rear views still come from `make`, and show none of this.
 */
const without = (parts, pattern) => parts.filter((p) => typeof p.g !== 'string' || !pattern.test(p.g));

// Silip: the lens was as wide as the whole face. A smaller one sits as a round nose between the eyes.
SIDEKICKS.silip.frontParts = (evo) => [
  ...without(silip(evo), /^lens/),
  cyl(0.2, 0.1, 0.05, { at: [0, 0.94, 0.68], rot: [90, 0, 0], color: '#2F4A5C', mat: 'paint', g: 'lensA', k: 0 }),
  ell(0.15, 0.15, 0.08, { at: [0, 0.94, 0.78], color: '#7FB6D0', mat: 'glass', g: 'lensB', k: 0 }),
  ...(evo ? [tor(0.2, 0.035, { at: [0, 0.94, 0.78], rot: [90, 0, 0], color: GOLD, mat: 'metal', g: 'lensG', k: 0 })] : []),
];

// Sibat: a rounded nose, all in its own red, in place of a point aimed between the eyes.
SIDEKICKS.sibat.frontParts = (evo) => [
  ...without(sibat(evo), /^nose$/),
  ell(0.42, 0.42, 0.44, { at: [0, 0.96, 1.0], color: '#C65B50', mat: 'paint', g: 'nose', k: 0.05 }),
  paint(ell(0.33, 0.28, 0.2, { at: [0, 0.97, 1.36], color: CREAM, mat: 'clay', soft: 0.02 })),
];

// Ilaw: the amber lamp is the face, so it is the big one, with red and green smaller above and below.
SIDEKICKS.ilaw.frontParts = (evo) => {
  const CASE = '#3F5058';
  const lamp = (y, r, color, mat) => ell(r, r, 0.16, { at: [0, y, 0.42], color, mat, g: `lamp${y}`, k: 0 });
  const hood = (y) => box(0.3, 0.03, 0.14, 0.02, { at: [0, y, 0.46], color: CASE, mat: 'paint', g: `hood${y}`, k: 0 });
  return [
    ...without(ilaw(evo), /^(lamp[0-9]|hood)/),
    lamp(1.32, 0.33, '#F0BE52', 'clay'),
    lamp(1.95, 0.19, '#CF5B4C', 'glow'),
    lamp(0.72, 0.19, '#69AF7C', 'glow'),
    hood(2.17),
    hood(1.68),
    hood(0.95),
  ];
};

// Kalaw: beak and casque stay the silhouette, smaller and clear of the eyes: the beak below them, the casque on top of the head.
SIDEKICKS.kalaw.frontParts = (evo) => [
  ...without(kalaw(evo), /^(beak|casque)$/),
  paint(ell(0.47, 0.38, 0.32, { at: [0, 1.76, 0.62], color: '#EFE4CF', mat: 'clay', soft: 0.03 })),
  cone(0.2, 0.04, 0.34, { at: [0, 1.48, 0.98], rot: [100, 0, 0], color: '#E0A84C', mat: 'paint', g: 'beak', k: 0.06 }),
  ell(0.16, 0.11, 0.32, { at: [0, 2.14, 0.5], rot: [14, 0, 0], color: '#CF7C4C', mat: 'paint', g: 'casque', k: 0.02 }),
];

module.exports = { SIDEKICKS };
