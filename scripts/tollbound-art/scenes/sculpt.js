/**
 * Faces as geometry. A character's eyes, smile, cheeks and lamps are sculpted into its
 * model instead of being drawn over the finished picture: the kit finds the real surface
 * with a ray, presses a soft dimple into it, seats a small dark oval there, paints a smile
 * that follows the curve of the body (or cuts an open one), and seats lamps in the paint. So all of it takes the
 * same light and shadow as the rest of the model, from every angle. Only what moves (the
 * glints and the closing lids) is added at run time, clipped to the outline the bake measured.
 *
 * Nothing here touches what can be seen from behind: rear views keep their own part
 * list, and these parts all sit on the front of the model.
 */
const { compile, hexLinear, sphere, ell, box, cap, dee, sub, paint } = require('../sdf');
void hexLinear;

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const round = (v) => Math.round(v * 10000) / 10000;
const rounded = (p) => p.map(round);

/** Rotation (for a part whose own z should point along `n`) in the order the modeller applies it. */
function facing(n, roll = 0) {
  const ax = (-Math.asin(Math.max(-1, Math.min(1, n[1]))) * 180) / Math.PI;
  const ay = (Math.atan2(n[0], n[2]) * 180) / Math.PI;
  return [round(ax), round(ay), round(roll)];
}

/** A model that can be asked where its surface is, and what it is made of there. */
function surveyor(parts, warp) {
  const scene = compile(parts, { warp });
  const { map, look } = scene;
  const normal = (p) => {
    const e = 0.006;
    return norm([map(p[0] + e, p[1], p[2]) - map(p[0] - e, p[1], p[2]), map(p[0], p[1] + e, p[2]) - map(p[0], p[1] - e, p[2]), map(p[0], p[1], p[2] + e) - map(p[0], p[1], p[2] - e)]);
  };
  /** Comes in from the front along -z; the first thing met. */
  const probe = (x, y, from) => {
    let z = from;
    for (let i = 0; i < 240; i += 1) {
      const d = map(x, y, z);
      if (d < 0.0015) {
        const p = [x, y, z];
        const seen = look(x, y, z);
        return { p, n: normal(p), group: seen.part?.g ?? null, mat: seen.mat, rgb: [seen.r, seen.g, seen.b] };
      }
      z -= Math.max(d * 0.85, 0.0015);
      if (z < from - 8) {
        break;
      }
    }
    return null;
  };
  return { probe };
}

const toSrgb = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
function linearHex(rgb) {
  return `#${rgb.map((v) => Math.max(0, Math.min(255, Math.round(toSrgb(Math.max(0, v)) * 255))).toString(16).padStart(2, '0')).join('')}`;
}

/** What the sculpted front replaces: the old stuck-on lamps, the old straight bumper, and painted face ovals (named by position). */
function isReplaced(p, spec) {
  if (typeof p.g === 'string' && /^hl/.test(p.g)) {
    return true;
  }
  if (spec.bumper && p.g === 'fb') {
    return true;
  }
  if (spec.drop && typeof p.g === 'string' && spec.drop.test(p.g)) {
    return true;
  }
  if (p.op === 'paint' && spec.dropPaint) {
    return spec.dropPaint.some((at) => at[0] === p.at[0] && at[1] === p.at[1] && at[2] === p.at[2]);
  }
  return false;
}

/** A plump bumper that wraps round the nose. */
function bumperParts({ w, y, z, r = 0.17, back = 0.34, color, mat = 'painted' }) {
  const o = { color, mat, g: 'fb', k: round(r * 0.8) };
  return [
    cap([-w * 0.68, y, z], [w * 0.68, y, z], r, o),
    cap([w * 0.68, y, z], [w, y, z - back], r * 0.92, o),
    cap([-w * 0.68, y, z], [-w, y, z - back], r * 0.92, o),
  ];
}

/** A windscreen as the face: a pale pane that melts into the paint round it, following the body's own curve, with an optional faint seal in a deeper colour. */
function paneParts({ at, hw, hh, r, color, seal, depth = 1.3, on, seam = 0.05, edge = 0.035 }) {
  const out = [];
  if (seal) {
    out.push(paint(box(round(hw + seam), round(hh + seam), depth, round(r + seam), { at, color: seal, mat: 'painted', soft: round(edge * 0.8), on })));
  }
  out.push(paint(box(hw, hh, depth, r, { at, color, mat: 'soft', soft: edge, on })));
  return out;
}

/**
 * Where a smile runs, for t from -1 to 1 along its width: the shape is much of a character's personality.
 * smile: a plain arc. cat: two small arcs. smirk: one corner higher. wave: a little ripple. flat: nearly straight.
 */
function smileLine(kind, t, sag, skew) {
  switch (kind) {
    case 'cat': {
      const q = Math.abs(t) * 2 - 1;
      return sag * (q * q - 1) * 0.8 + sag * 0.1;
    }
    case 'smirk':
      return sag * (t * t - 1) + skew * t;
    case 'wave':
      return Math.sin(t * Math.PI * 1.5) * sag * 0.42 + sag * (t * t - 1) * 0.4;
    case 'flat':
      return sag * 0.25 * (t * t - 1);
    default:
      return sag * (t * t - 1);
  }
}

/**
 * Sculpts a face (and front lamps) into a list of parts.
 * spec: {
 *   eyes: [[x, y, z hint], ...],  eye: height radius of the oval,  wide: its width against its height,
 *   roll: tilt in degrees (outer corners down when positive),  eyeColor,  dimple: how deep the eye sits (share of its height),
 *   eyeDepth: how far the eye domes out,  iris: a coloured eye painted on the oval,
 *   mouth: [x, y, z hint],  smile: { w, sag, depth, color, kind, skew } or null,
 *   openMouth: { y (top lip), z, w, h, lift, depth, color, tongue }: a real cut in the skin, in place of a smile,
 *   cheek: { color, r, dx, dy, soft },  lamps: { x, y, z, r, ring, color, hot, seat, on },
 *   extra: more parts to add before the survey
 * }
 */
function sculpt(baseParts, spec, warp = 0.004) {
  const kept = baseParts.filter((p) => !isReplaced(p, spec));
  const before = [...kept, ...(spec.bumper ? bumperParts(spec.bumper) : []), ...(spec.extra || []), ...(spec.pane ? paneParts(spec.pane) : [])];
  const { probe } = surveyor(before, warp);
  const out = [...before];
  const baseEye = spec.eye;
  const balls = [];
  const wide = spec.wide || 0.76;
  const eyeColor = spec.eyeColor || '#2A2430';
  const dimple = spec.dimple === undefined ? 0.2 : spec.dimple;

  for (const [i, hint] of spec.eyes.entries()) {
    const s = hint[0] < 0 ? -1 : hint[0] > 0 ? 1 : i === 0 ? -1 : 1;
    // A little difference between the two eyes, where a character wants one: charm, not a mistake.
    const r = baseEye * (spec.eyeSizes ? spec.eyeSizes[i] : 1);
    const hit = probe(hint[0], hint[1], hint[2] + 0.7);
    if (hit === null) {
      throw new Error(`No surface for an eye at ${hint}`);
    }
    const on = spec.on || hit.group;
    // Lean the eye only part of the way with a curved surface: both keep looking out of the same face.
    const n = norm(add(hit.n, [0, 0, 1], 1.4));
    const rot = facing(n, s * -(spec.roll || 0));
    // A soft dimple in the skin, so the eye sits in the face instead of on it.
    if (dimple > 0) {
      out.push(sub(ell(round(r * wide * 1.3), round(r * 1.28), round(r * dimple * 1.5), { at: rounded(add(hit.p, n, r * dimple * 0.72)), rot, g: on, k: round(r * 0.3) })));
    }
    const c = add(hit.p, n, -r * (dimple * 0.9));
    const g = `eyeball${i}`;
    out.push(ell(round(r * wide), round(r), round(r * (spec.eyeDepth === undefined ? 0.5 : spec.eyeDepth)), { at: rounded(c), rot, color: eyeColor, mat: 'eye', g, k: 0, solo: true }));
    balls.push({ c: rounded(c), r: round(r), g, gaze: rounded(norm(add(n, [0, 0, 1], 2))) });
    // A coloured iris painted on the dark oval: the outline stays, then the colour, deeper on top and lighter low, then the pupil.
    if (spec.iris) {
      const { fill = 0.84, color, deep, light, pupil, pupilSize = 0.46 } = spec.iris;
      const onEye = (sx, sy, dy, tone, soft) => paint(ell(round(r * wide * sx), round(r * sy), round(r * 1.4), { at: rounded(add(c, [0, dy * r, 0])), rot, color: tone, mat: 'eye', soft: round(r * soft), on: g }));
      out.push(onEye(fill, fill, 0, color, 0.05), onEye(fill * 0.92, fill * 0.5, -fill * 0.52, light, 0.3), onEye(fill * 1.04, fill * 0.52, fill * 0.6, deep, 0.28), onEye(pupilSize, pupilSize * 1.1, 0.02, pupil, 0.07));
    }
    if (spec.cheek) {
      const ch = spec.cheek;
      const blush = probe(hint[0] + s * ch.dx, hint[1] + ch.dy, hint[2] + 0.9);
      if (blush !== null) {
        out.push(paint(ell(round(ch.r * 1.25), round(ch.r * 0.8), round(ch.r), { at: rounded(blush.p), color: ch.color, mat: 'soft', soft: ch.soft === undefined ? ch.r * 0.8 : ch.soft, on: blush.group })));
      }
    }
  }

  // The smile: a shallow groove that follows the surface, fading out at the ends.
  const eyeMid = balls.reduce((m, b) => add(m, b.c, 1 / balls.length), [0, 0, 0]);
  const r = baseEye;
  let mouth = spec.mouth || spec.talkAt || add(eyeMid, [0, -1, 0], r * 1.9);
  let mouthW = 0;
  if (spec.smile && spec.mouth && !spec.openMouth) {
    const { w, sag, depth, kind = 'smile', skew = 0 } = spec.smile;
    const steps = 20;
    const path = [];
    for (let i = 0; i <= steps; i += 1) {
      const t = (i / steps) * 2 - 1;
      const x = spec.mouth[0] + t * w;
      const y = spec.mouth[1] + smileLine(kind, t, sag, skew);
      const hit = probe(x, y, spec.mouth[2] + 0.8);
      if (hit !== null) {
        path.push({ p: hit.p, t, group: hit.group });
      }
    }
    if (path.length > 2) {
      const mid = path[Math.floor(path.length / 2)];
      const on = spec.smile.on || mid.group;
      // Unless told otherwise, the smile is a deep shade of whatever it is cut into.
      const near = probe(spec.mouth[0], spec.mouth[1] - sag, spec.mouth[2] + 0.8);
      const color = spec.smile.color || linearHex(near.rgb.map((v) => v * 0.16 + 0.006));
      for (let i = 0; i < path.length - 1; i += 1) {
        const a = path[i];
        const b = path[i + 1];
        const fade = 1 - Math.pow(Math.abs((a.t + b.t) / 2), 4) * 0.5;
        out.push(paint(cap(rounded(a.p), rounded(b.p), round(depth * fade * 1.15), { color, mat: 'eye', soft: round(depth * 0.22), on })));
      }
      mouth = mid.p;
      mouthW = w;
    }
  }

  // An open smile: a real cut in the skin, with the inside of the mouth and the tongue sitting in it. Solo, so the bake can measure the opening from any angle.
  let mouthGroup = null;
  if (spec.openMouth) {
    const { x = 0, y, z, w: mw, h: mh, lift, depth = 0.16, color: inside = '#5C1A26', tongue = '#F2808A', tongueTop = 0.42, tongueWide = 0.72, on: skin } = spec.openMouth;
    const hit = probe(x, y - mh * 0.45, z + 0.8);
    if (hit === null) {
      throw new Error(`No surface for a mouth at ${x}, ${y}`);
    }
    const on = skin || hit.group;
    const n = norm(add(hit.n, [0, 0, 1], 0.6));
    const rot = facing(n);
    // The slab's origin is the middle of the top lip: the point on the surface's plane straight above where it was probed.
    const lip = [x, y, round(hit.p[2] - ((y - hit.p[1]) * n[1]) / Math.max(0.3, n[2]))];
    out.push(sub(dee(mw, mh, lift, 0.6, { at: rounded(add(lip, n, 0.6 - depth)), rot, g: on, k: round(Math.min(0.035, mw * 0.1)) })));
    mouthGroup = 'mouthball';
    const mid = [x, y - mh * 0.45, lip[2]];
    // Walls and floor of the cut take the same dark, then a plate the bake can measure.
    out.push(paint(dee(mw, mh, lift, 0.6, { at: rounded(add(lip, n, 0.6 - depth)), rot, color: inside, mat: 'soft', soft: 0.012, on })));
    out.push(box(round(mw * 0.98), round((mh + lift) * 0.5), 0.05, 0.02, { at: rounded(add([x, y + (lift - mh) / 2, lip[2]], n, -depth * 0.55 - 0.05)), rot, color: inside, mat: 'soft', g: mouthGroup, k: 0, solo: true }));
    // The tongue swells up from behind the lower lip, and the lip clips it.
    const tongueH = mh * (1 - tongueTop);
    out.push(ell(round(mw * tongueWide), round(tongueH), round(depth * 0.5), { at: rounded(add([x, y - mh, lip[2]], n, -depth * 0.52)), rot, color: tongue, mat: 'soft', g: mouthGroup, k: 0, solo: true }));
    mouth = mid;
    mouthW = mw;
  }

  // A lamp: a flat cream disc with a pale ring round it, lying on the surface, no glow to speak of.
  if (spec.lamps) {
    const { y, z, r: lr, color = '#FBF1CF', hot = '#FFFBEB', seat = '#E6E8F2' } = spec.lamps;
    // A disc only lies whole on a surface that faces forward: on a rounded body, slide up (then in) until one does.
    let { x } = spec.lamps;
    let seatY = y;
    let found = probe(x, seatY, z + 0.8);
    for (let i = 0; i < 16 && found !== null && found.n[2] < 0.86; i += 1) {
      seatY += 0.04;
      found = probe(x, seatY, z + 0.8);
    }
    for (let i = 0; i < 10 && found !== null && found.n[2] < 0.86; i += 1) {
      x *= 0.96;
      found = probe(x, seatY, z + 0.8);
    }
    for (const s of [-1, 1]) {
      const hit = probe(s * x, seatY, z + 0.8);
      if (hit === null) {
        continue;
      }
      const on = spec.lamps.on || hit.group;
      const n = norm(add(hit.n, [0, 0, 1], 0.8));
      out.push(paint(sphere(round(lr * (spec.lamps.ring || 1.24)), { at: rounded(hit.p), color: seat, mat: 'soft', soft: 0.012, on })));
      const lens = add(hit.p, n, -lr * 0.2);
      out.push(ell(round(lr), round(lr), round(lr * 0.36), { at: rounded(lens), rot: facing(n), color, mat: 'lens', g: `lamp${s}`, k: 0, solo: true }));
      out.push(paint(sphere(round(lr * 0.62), { at: rounded(add(hit.p, n, lr * 0.14)), color: hot, mat: 'lens', soft: round(lr * 0.4), on: `lamp${s}` })));
    }
  }

  return {
    parts: out,
    face: {
      balls,
      eyes: balls.map((b) => b.c),
      mouth,
      mouthW: round(mouthW),
      mouthGroup,
      eye: round(r),
      noMouth: !spec.mouth && !spec.talkAt && !spec.openMouth,
    },
  };
}

void box;
void dot;
module.exports = { sculpt };
