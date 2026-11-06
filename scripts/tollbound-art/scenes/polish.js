/**
 * The character finish. Heroes and sidekicks get soft, slightly hand-painted materials,
 * chubby tyres and painted glass; traffic and scenery keep the plain kit
 * in kit.js, so nothing about the road changes when a character does.
 */
const { sphere, ell, box, cyl, cap, paint } = require('../sdf');
const kit = require('./kit');

const { RUBBER, GLASS } = kit;

const luminance = (hex) => {
  const n = parseInt(hex.replace('#', ''), 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
};

/** Moves a model's plain materials onto the character finish. A part may name a character material itself. */
function polish(parts) {
  return parts.map((p) => {
    // Tyres: a dark plum-charcoal, on everyone.
    if (p.mat === 'tread' || p.mat === 'rubber') {
      p = { ...p, color: '#322E44' };
    }
    switch (p.mat) {
      case 'paint':
        return { ...p, mat: 'painted' };
      case 'clay':
        return { ...p, mat: 'soft' };
      case 'fabric':
        return { ...p, mat: 'felt' };
      case 'metal':
        return { ...p, mat: 'tin' };
      case 'rubber':
        return { ...p, mat: p.type === 'cyl' ? 'tread' : 'soft' };
      case 'glass':
        return { ...p, mat: luminance(p.color) > 0.55 ? 'lens' : 'pane' };
      default:
        return p;
    }
  });
}

/** The light every character is baked under: softer and fuller than the road's, with warm bounce. `finish` names the materials, so changing them redraws characters and nothing else. */
const CHARACTER_LIGHT = { warp: 0.004, keyPower: 1.14, skyPower: 0.92, bouncePower: 0.52, bounceColor: [1.0, 0.84, 0.74], finish: 'approved-2' };

/** A chubby wheel: ribbed tyre, a dished hub in the car's colour, a little cap in the middle. */
function wheel(x, z, r = 0.62, width = 0.3, hub = '#C9D2CC', g = null) {
  const id = g || `w${x}${z}`;
  const R = r * 1.05;
  const W = width * 1.14;
  return [
    cyl(R, W, Math.min(R * 0.46, W * 0.92), { at: [x, R, z], rot: [0, 0, 90], color: RUBBER, mat: 'tread', g: id, k: 0 }),
    cyl(R * 0.48, W + 0.015, R * 0.2, { at: [x, R, z], rot: [0, 0, 90], color: hub, mat: 'painted', g: `${id}h`, k: 0 }),
  ];
}

function wheels(track, front, rear, r, width, hub) {
  return [...wheel(track, front, r, width, hub), ...wheel(-track, front, r, width, hub), ...wheel(track, rear, r, width, hub), ...wheel(-track, rear, r, width, hub)];
}

/** Headlights as soft glass domes: a pale rim, then the lens. */
function headlights(x, y, z, r = 0.32, color = '#A9D0F2') {
  const out = [];
  for (const s of [-1, 1]) {
    // The rim stands proud of the paint all the way round, so its outline stays a clean circle on a curved body.
    out.push(ell(r * 1.13, r * 1.13, 0.2, { at: [s * x, y, z - 0.02], color: '#F7F5EE', mat: 'painted', g: `hlR${s}${x}`, k: 0 }));
    out.push(ell(r, r, 0.24, { at: [s * x, y, z], color, mat: 'lens', g: `hl${s}${x}`, k: 0 }));
  }
  return out;
}

/** Tail lights as jelly-candy lenses with a dark painted rim, so they read on any paint. On the back of the car (z < 0). */
function tailLights(x, y, z, color = '#E8473C', hx = 0.28, hy = 0.16, on = 'body') {
  const out = [];
  for (const s of [-1, 1]) {
    out.push(paint(ell(hx * 1.12, hy * 1.18, 0.5, { at: [s * x, y, z + 0.1], color: '#4A2A36', mat: 'painted', soft: 0.018, on })));
    out.push(ell(hx, hy, 0.17, { at: [s * x, y, z], color, mat: 'lamp', g: `tl${s}${x}`, k: 0 }));
  }
  return out;
}

/** Rounded ear mirrors with a pale glass facing back at the driver. */
function mirrors(x, y, z, color, stalk = '#57707A') {
  const out = [];
  for (const s of [-1, 1]) {
    out.push(ell(0.26, 0.27, 0.17, { at: [s * x, y + 0.06, z], rot: [0, 0, s * -14], color, mat: 'painted', g: `mir${s}`, k: 0 }));
    out.push(ell(0.17, 0.18, 0.04, { at: [s * x, y + 0.06, z - 0.14], rot: [0, 0, s * -14], color: '#D3E2EE', mat: 'pane', g: `mirG${s}`, k: 0 }));
    out.push(cap([s * (x - 0.42), y - 0.1, z], [s * (x - 0.1), y, z], 0.09, { color, mat: 'painted', g: `mirS${s}`, k: 0 }));
  }
  return out;
}

/** A window that reflects the sky, painted on a body. Rounder than a slab. */
function windowPaint(hx, hy, hz, at, color = GLASS, r = 0.2, on) {
  return paint(box(hx, hy, hz, Math.max(r, Math.min(hx, hy) * 0.42), { at, color, mat: 'pane', soft: 0.014, on }));
}

/** Two pale slanting glints across a rear window: the mark that says glass, even when small. */
function windowGlint(x, y, z, height = 0.5, on) {
  return [
    paint(box(0.075, height, 0.4, 0.03, { at: [x, y, z], rot: [0, 0, 20], color: '#8FB2D2', mat: 'pane', soft: 0.02, on })),
    paint(box(0.03, height * 0.82, 0.4, 0.02, { at: [x + 0.2, y, z], rot: [0, 0, 20], color: '#7D9FC0', mat: 'pane', soft: 0.015, on })),
  ];
}

module.exports = { ...kit, polish, CHARACTER_LIGHT, wheel, wheels, headlights, tailLights, mirrors, windowPaint, windowGlint };
