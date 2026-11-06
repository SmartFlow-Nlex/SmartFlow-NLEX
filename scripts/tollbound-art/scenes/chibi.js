/**
 * Makes a model lovable: shorter and rounder, on small chubby wheels, with corners that
 * have become pillows and face panels that melt into the paint. It works part by part
 * rather than warping space, so a wheel stays a circle and an accessory keeps its shape.
 * Width is left alone, so a character still fills the same part of a lane as its hit box.
 *
 * c: {
 *   z: length, against the original.  belt: the height where the body meets the head.
 *   low, up: height of what is below and above the belt.  head: width of what is above it.
 *   wheel: wheel size.  round: how pillowy a box's corners get (share of its smallest side).
 *   k: how much more softly the main body parts melt together.  faceSoft: edge of a painted face panel.
 *   panel: the colour a cream face panel takes, so it belongs to this character's body.
 * }
 */
const CREAM = '#F8EDD8';
const BODY_GROUPS = /^(body|cab|cabin|neck|top|stone|rock|cake|cup|jelly|bud|shell|head)$/;
const WHEEL_GROUPS = /^(w-?[0-9.]|ty|fw$)/;
const num = (v) => Math.round(v * 10000) / 10000;

function shaper(c) {
  const z = c.z === undefined ? 1 : c.z;
  const belt = c.belt === undefined ? Infinity : c.belt;
  const low = c.low === undefined ? 1 : c.low;
  const up = c.up === undefined ? 1 : c.up;
  const head = c.head === undefined ? 1 : c.head;
  const mapY = (y) => (y <= belt ? y * low : belt * low + (y - belt) * up);
  const point = (p) => [num(p[1] > belt ? p[0] * head : p[0]), num(mapY(p[1])), num(p[2] * z)];
  return { z, head, belt, mapY, point };
}

const isWheel = (p) => p.type === 'cyl' && p.rot && p.rot[2] === 90 && (p.mat === 'tread' || p.mat === 'rubber' || (typeof p.g === 'string' && WHEEL_GROUPS.test(p.g)) || p.op === 'sub');

function chibify(parts, c) {
  if (!c) {
    return parts;
  }
  const s = shaper(c);
  const wheel = c.wheel === undefined ? 1 : c.wheel;
  const round = c.round === undefined ? 0 : c.round;
  const melt = c.k === undefined ? 1 : c.k;
  const faceSoft = c.faceSoft === undefined ? 0.03 : c.faceSoft;
  return parts.map((p) => {
    const out = { ...p };
    if (isWheel(p)) {
      out.args = [num(p.args[0] * wheel), p.args[1], num(p.args[2] * wheel)];
      out.at = [p.at[0], num(p.at[1] * wheel), num(p.at[2] * s.z)];
      return out;
    }
    if (p.type === 'cap') {
      const A = s.point(p.args.slice(0, 3));
      const B = s.point(p.args.slice(3, 6));
      out.args = [...A, ...B, p.args[6]];
    } else {
      out.at = s.point(p.at);
    }
    const [x, y] = p.at;
    const above = y > s.belt;
    const wx = above ? s.head : 1;
    const heightOf = (h) => (s.mapY(y + h) - s.mapY(y - h)) / 2;
    switch (p.type) {
      case 'ell':
        out.args = p.rot
          ? [num(p.args[0] * wx), num(p.args[1] * ((heightOf(p.args[1]) / p.args[1] + s.z) / 2)), num(p.args[2] * ((heightOf(p.args[1]) / p.args[1] + s.z) / 2))]
          : [num(p.args[0] * wx), num(heightOf(p.args[1])), num(p.args[2] * s.z)];
        break;
      case 'box': {
        const hx = p.args[0] * wx;
        const hy = heightOf(p.args[1]);
        const hz = p.args[2] * s.z;
        const small = Math.min(hx, hy, hz);
        const pillow = p.op === 'add' ? Math.max(p.args[3], small * round) : p.args[3];
        out.args = [num(hx), num(hy), num(hz), num(Math.min(pillow, small * 0.97))];
        break;
      }
      case 'cyl':
        out.args = p.rot ? p.args : [p.args[0], num(heightOf(p.args[1])), p.args[2]];
        break;
      case 'cone':
        out.args = [p.args[0], p.args[1], num(p.args[2] * (p.rot ? (heightOf(p.args[2]) / p.args[2] + s.z) / 2 : heightOf(p.args[2]) / p.args[2]))];
        break;
      default:
        break;
    }
    void x;
    if (p.op === 'add' && melt !== 1 && typeof p.g === 'string' && BODY_GROUPS.test(p.g) && p.k > 0) {
      out.k = num(p.k * melt);
    }
    // A face panel melts into the paint, in a colour of its own body, rather than sitting on it like a sticker.
    if (p.op === 'paint' && p.type === 'ell' && (p.mat === 'clay' || p.mat === 'soft' || p.mat === 'paper') && p.soft <= 0.05) {
      out.soft = Math.max(p.soft, faceSoft);
      if (p.color === CREAM && c.panel) {
        out.color = c.panel;
      }
    }
    return out;
  });
}

/** A face spec is written in the original model's coordinates; this moves it onto the reshaped one. */
function remapSpec(spec, c) {
  const s = shaper(c);
  const out = { ...spec };
  if (spec.eyes) out.eyes = spec.eyes.map(s.point);
  if (spec.mouth) out.mouth = s.point(spec.mouth);
  if (spec.talkAt) out.talkAt = s.point(spec.talkAt);
  if (spec.dropPaint) out.dropPaint = spec.dropPaint.map(s.point);
  if (spec.extra) out.extra = chibify(spec.extra, c);
  if (spec.lamps) out.lamps = { ...spec.lamps, y: num(s.mapY(spec.lamps.y)), z: num(spec.lamps.z * s.z) };
  if (spec.bumper) out.bumper = { ...spec.bumper, y: num(s.mapY(spec.bumper.y)), z: num(spec.bumper.z * s.z), back: num((spec.bumper.back === undefined ? 0.34 : spec.bumper.back) * s.z) };
  if (spec.pane) {
    const y = spec.pane.at[1];
    out.pane = { ...spec.pane, at: s.point(spec.pane.at), hh: num((s.mapY(y + spec.pane.hh) - s.mapY(y - spec.pane.hh)) / 2), hw: num(spec.pane.hw * (y > s.belt ? s.head : 1)), depth: num((spec.pane.depth === undefined ? 1.3 : spec.pane.depth) * s.z * 0.62) };
  }
  return out;
}

module.exports = { chibify, remapSpec };
