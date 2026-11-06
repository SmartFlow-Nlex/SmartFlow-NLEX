/**
 * Tollbound Heroes art pipeline, part 2: ray-marches a compiled scene into a
 * straight-alpha RGBA image. One lighting setup for everything in the game, so
 * a character in the garage and a tree on the road belong to the same world:
 * a warm key from the upper left of the picture, a soft sky fill, a little
 * bounce from the ground, gentle self-shadow and ambient occlusion. The world is
 * matte, with a faint hand-pressed texture. Heroes and sidekicks get their own
 * finish on top (the materials with a `coat`): soft wrapped light, shadows that keep
 * their colour, gentle highlights and a slight hand-painted mottling.
 */
const { compile } = require('./sdf');

const MATS = {
  // spec: highlight strength; gloss: highlight tightness; bump: surface texture; grain: colour mottling.
  clay: { spec: 0.1, gloss: 18, bump: 0.05, grain: 0.035, sheen: 0.12 },
  rubber: { spec: 0.05, gloss: 10, bump: 0.03, grain: 0.02, sheen: 0.05 },
  paint: { spec: 0.16, gloss: 34, bump: 0.018, grain: 0.015, sheen: 0.14 },
  wood: { spec: 0.05, gloss: 12, bump: 0.09, grain: 0.09, sheen: 0.06, streak: 1 },
  paper: { spec: 0.03, gloss: 8, bump: 0.06, grain: 0.05, sheen: 0.14 },
  fabric: { spec: 0.02, gloss: 6, bump: 0.12, grain: 0.07, sheen: 0.2 },
  metal: { spec: 0.32, gloss: 40, bump: 0.02, grain: 0.02, sheen: 0.1 },
  glass: { spec: 0.42, gloss: 70, bump: 0.005, grain: 0, sheen: 0.3 },
  glow: { spec: 0.1, gloss: 20, bump: 0.01, grain: 0, sheen: 0, emit: 1 },
  leaf: { spec: 0.05, gloss: 10, bump: 0.16, grain: 0.14, sheen: 0.1, wrap: 0.5 },
};

/** The character finish, for heroes and sidekicks only (scenes/polish.js maps onto these). Soft, slightly hand-painted, with gentle highlights: never metallic. */
const CHARACTER_MATS = {
  painted: { spec: 0.15, gloss: 20, bump: 0, grain: 0, sheen: 0.07, coat: 0.009, wrap: 0.52, soft: 0.5, brush: 0.85 },
  soft: { spec: 0.03, gloss: 10, bump: 0, grain: 0, sheen: 0.08, coat: 0.004, wrap: 0.6, soft: 0.55, brush: 1 },
  felt: { spec: 0.07, gloss: 12, bump: 0, grain: 0, sheen: 0.12, coat: 0.004, wrap: 0.54, soft: 0.55, brush: 0.9 },
  pane: { spec: 0.12, gloss: 26, bump: 0, grain: 0, sheen: 0, coat: 0.02, wrap: 0.42, soft: 0.5, brush: 0.5 },
  lens: { spec: 0.1, gloss: 22, bump: 0, grain: 0, sheen: 0, coat: 0.016, wrap: 0.72, soft: 0.85, glow: 0.07 },
  lamp: { spec: 0.1, gloss: 22, bump: 0, grain: 0, sheen: 0, coat: 0.016, wrap: 0.6, soft: 0.8, glow: 0.3 },
  tread: { spec: 0.02, gloss: 8, bump: 0, grain: 0, sheen: 0.12, coat: 0.004, wrap: 0.46, soft: 0.6, tread: 1, brush: 0.6 },
  tin: { spec: 0.12, gloss: 18, bump: 0, grain: 0, sheen: 0.06, coat: 0.03, wrap: 0.5, soft: 0.6, metal: 1, brush: 0.7 },
  jelly: { spec: 0.14, gloss: 24, bump: 0, grain: 0, sheen: 0.12, coat: 0.016, wrap: 0.8, soft: 0.8, glow: 0.14, brush: 0.5 },
  eye: { spec: 0.1, gloss: 40, bump: 0, grain: 0, sheen: 0, coat: 0.012, wrap: 0.75, soft: 0.3 },
};

const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Cheap value noise, for texture only.
function hash3(x, y, z) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function noise(x, y, z) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const w = fz * fz * (3 - 2 * fz);
  const l = (a, b, t) => a + (b - a) * t;
  return l(
    l(l(hash3(ix, iy, iz), hash3(ix + 1, iy, iz), u), l(hash3(ix, iy + 1, iz), hash3(ix + 1, iy + 1, iz), u), v),
    l(l(hash3(ix, iy, iz + 1), hash3(ix + 1, iy, iz + 1), u), l(hash3(ix, iy + 1, iz + 1), hash3(ix + 1, iy + 1, iz + 1), u), v),
    w,
  );
}
const fbm = (x, y, z) => noise(x, y, z) * 0.6 + noise(x * 2.1 + 7, y * 2.1 + 3, z * 2.1 + 5) * 0.3 + noise(x * 4.3 + 1, y * 4.3 + 9, z * 4.3 + 2) * 0.1;

function normalize(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const toSrgb = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
/** A soft shoulder so bright areas stay painterly instead of clipping. */
const tone = (v) => {
  const x = Math.max(0, v);
  return x < 0.6 ? x : 0.6 + (1 - Math.exp(-(x - 0.6) / 0.4)) * 0.4;
};

/**
 * view: { yaw, pitch, dist, target:[x,y,z], ppu (pixels per unit) }
 * yaw 0 looks from behind (-z) toward +z; 180 looks at the front.
 * options: { ss (supersample), shadow (0-1 strength of a baked ground shadow), ground (its y) }
 */
function render(parts, view, options = {}) {
  const scene = compile(parts, options);
  const { map, look } = scene;
  const character = options.finish !== undefined;
  const ss = options.ss || 2;
  const yaw = (view.yaw * Math.PI) / 180;
  const pitch = (view.pitch * Math.PI) / 180;
  const target = view.target || scene.center;
  const dist = view.dist || 18;
  const back = [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
  const eye = [target[0] + back[0] * dist, target[1] + back[1] * dist, target[2] + back[2] * dist];
  const fw = normalize([-back[0], -back[1], -back[2]]);
  const right = normalize(cross([0, 1, 0], fw));
  const up = cross(fw, right);
  const ppu = view.ppu;
  // The picture frame: fits the bounding sphere as seen from the camera.
  const rad = scene.radius * (dist / Math.max(1, dist - scene.radius)) + 0.3;
  const offC = [scene.center[0] - target[0], scene.center[1] - target[1], scene.center[2] - target[2]];
  const cu = dot(offC, right);
  const cv = dot(offC, up);
  const groundY = options.ground === undefined ? 0 : options.ground;
  const pad = options.shadow ? options.shadowPad || 0.7 : 0;
  // A view may name its own picture frame (rooms); otherwise it fits the model.
  const f = view.frame;
  const left = f ? f.left : cu - rad - pad;
  const top = f ? f.top : cv + rad + 0.1;
  const wUnits = f ? f.width : 2 * (rad + pad);
  const hUnits = f ? f.height : 2 * rad + 0.2 + pad * 0.5;
  const W = Math.ceil(wUnits * ppu);
  const H = Math.ceil(hUnits * ppu);
  const SW = W * ss;
  const SH = H * ss;
  const out = new Float32Array(W * H * 4);
  // Groups whose visible pixels should be measured: how a face's moving parts stay inside its lids.
  const tracked = new Map((options.track || []).map((g) => [g, new Uint8Array(W * H)]));

  // Lights fixed to the picture: the key always comes from the upper left of what you see.
  const lightDir =
    options.light ||
    normalize([
      right[0] * -0.62 + up[0] * 0.66 + back[0] * 0.42,
      right[1] * -0.62 + up[1] * 0.66 + back[1] * 0.42 + 0.25,
      right[2] * -0.62 + up[2] * 0.66 + back[2] * 0.42,
    ]);
  const keyColor = options.keyColor || [1.0, 0.94, 0.84];
  const keyPower = options.keyPower === undefined ? 1.55 : options.keyPower;
  const skyColor = options.skyColor || [0.78, 0.86, 1.0];
  const skyPower = options.skyPower === undefined ? 0.62 : options.skyPower;
  const bounceColor = options.bounceColor || [0.86, 0.76, 0.6];
  const bouncePower = options.bouncePower === undefined ? 0.26 : options.bouncePower;

  const R = scene.radius + 0.4;
  const C = scene.center;
  const eps = 0.0025;
  const softShadow = (px, py, pz, lx, ly, lz) => {
    let t = 0.06;
    let res = 1;
    for (let i = 0; i < 28 && t < 7; i += 1) {
      const d = map(px + lx * t, py + ly * t, pz + lz * t);
      if (d < 0.001) {
        return 0;
      }
      res = Math.min(res, (9 * d) / t);
      t += Math.max(0.02, Math.min(d, 0.5));
    }
    return res;
  };
  const occlusion = (px, py, pz, nx, ny, nz) => {
    let occ = 0;
    let w = 1;
    for (let i = 1; i <= 5; i += 1) {
      const h = 0.04 + 0.11 * i;
      occ += (h - map(px + nx * h, py + ny * h, pz + nz * h)) * w;
      w *= 0.62;
    }
    return Math.max(0, 1 - 1.15 * occ);
  };

  /**
   * What a glossy surface sees: sky above, warm ground below, a soft line between them,
   * one big soft window of light over the key's shoulder and a cool strip on the far
   * side. It writes into `refl`, so a surface reads as a smooth toy under a studio lamp.
   */
  const refl = [0, 0, 0];
  const studio = (ex, ey, ez) => {
    const above = smooth(-0.1, 0.14, ey);
    const high = Math.max(0, Math.min(1, ey * 1.15));
    let er = 0.17 + above * (0.88 - high * 0.42 - 0.17);
    let eg = 0.16 + above * (0.94 - high * 0.3 - 0.16);
    let eb = 0.18 + above * (1.02 - high * 0.1 - 0.18);
    const cu = ex * right[0] + ey * right[1] + ez * right[2];
    const cv = ex * up[0] + ey * up[1] + ez * up[2];
    const cb = ex * back[0] + ey * back[1] + ez * back[2];
    if (cb > -0.25) {
      const q = Math.pow(Math.abs(cu + 0.4) / 0.46, 3) + Math.pow(Math.abs(cv - 0.6) / 0.32, 3);
      const box = smooth(1.35, 0.7, q) * 2.3;
      er += box;
      eg += box * 0.97;
      eb += box * 0.92;
    }
    const strip = smooth(0.62, 0.92, cu) * smooth(0.95, 0.2, Math.abs(cv)) * 0.85;
    er += strip * 0.8;
    eg += strip * 0.9;
    eb += strip;
    refl[0] = er;
    refl[1] = eg;
    refl[2] = eb;
  };

  for (let sy = 0; sy < SH; sy += 1) {
    const row = Math.floor(sy / ss);
    for (let sx = 0; sx < SW; sx += 1) {
      const u = left + ((sx + 0.5) / SW) * wUnits;
      const v = top - ((sy + 0.5) / SH) * hUnits;
      const persp = 1 / dist;
      // A gentle perspective: a long lens at `dist`.
      const dx = fw[0] + (right[0] * u + up[0] * v) * persp;
      const dy = fw[1] + (right[1] * u + up[1] * v) * persp;
      const dz = fw[2] + (right[2] * u + up[2] * v) * persp;
      const dl = Math.hypot(dx, dy, dz);
      const rx = dx / dl;
      const ry = dy / dl;
      const rz = dz / dl;
      // Bounding sphere first: most of a sprite's corners are empty.
      const ox = eye[0] - C[0];
      const oy = eye[1] - C[1];
      const oz = eye[2] - C[2];
      const b = ox * rx + oy * ry + oz * rz;
      const c = ox * ox + oy * oy + oz * oz - R * R;
      const disc = b * b - c;
      let hit = false;
      let t = 0;
      if (disc > 0) {
        const root = Math.sqrt(disc);
        t = Math.max(0.01, -b - root);
        const tMax = -b + root;
        for (let i = 0; i < 110 && t < tMax; i += 1) {
          const d = map(eye[0] + rx * t, eye[1] + ry * t, eye[2] + rz * t);
          if (d < eps) {
            hit = true;
            break;
          }
          t += d * 0.92;
        }
      }
      const idx = (row * W + Math.floor(sx / ss)) * 4;
      if (!hit) {
        if (options.shadow && ry < 0) {
          // The soft contact shadow on the ground under the model.
          const tg = (groundY - eye[1]) / ry;
          const gx = eye[0] + rx * tg;
          const gz = eye[2] + rz * tg;
          const s = softShadow(gx, groundY + 0.02, gz, lightDir[0], lightDir[1], lightDir[2]);
          let occ = 1;
          for (let i = 1; i <= 4; i += 1) {
            const h = 0.1 * i * i;
            occ -= Math.max(0, h - map(gx, groundY + h, gz)) * (0.9 / i);
          }
          occ = Math.max(0, occ);
          const a = Math.min(1, (1 - s) * 0.55 + (1 - occ) * 0.7) * options.shadow;
          if (a > 0.002) {
            // Ink, weighted by its coverage (resolved below with the rest).
            out[idx + 0] += 0.09 * a;
            out[idx + 1] += 0.12 * a;
            out[idx + 2] += 0.22 * a;
            out[idx + 3] += a;
          }
        }
        continue;
      }
      const px = eye[0] + rx * t;
      const py = eye[1] + ry * t;
      const pz = eye[2] + rz * t;
      // Normal (tetrahedron).
      const e = 0.004;
      const n1 = map(px + e, py - e, pz - e);
      const n2 = map(px - e, py - e, pz + e);
      const n3 = map(px - e, py + e, pz - e);
      const n4 = map(px + e, py + e, pz + e);
      let nx = n1 - n2 - n3 + n4;
      let ny = -n1 - n2 + n3 + n4;
      let nz = -n1 + n2 - n3 + n4;
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl;
      ny /= nl;
      nz /= nl;
      const lk = look(px, py, pz);
      if (tracked.size > 0 && lk.part) {
        const seen = tracked.get(lk.part.g);
        if (seen) {
          seen[row * W + Math.floor(sx / ss)] = 1;
        }
      }
      const m = (character && CHARACTER_MATS[lk.mat]) || MATS[lk.mat] || MATS.clay;
      // Hand-pressed surface: the normal wobbles a little, the colour mottles a little.
      if (m.bump > 0) {
        const f = lk.mat === 'leaf' ? 7 : lk.mat === 'fabric' ? 22 : 9;
        const bx = fbm(px * f + 11, py * f, pz * f) - 0.5;
        const by = fbm(px * f, py * f + 13, pz * f) - 0.5;
        const bz = fbm(px * f, py * f, pz * f + 17) - 0.5;
        nx += bx * m.bump * 2;
        ny += by * m.bump * 2;
        nz += bz * m.bump * 2;
        const l2 = Math.hypot(nx, ny, nz) || 1;
        nx /= l2;
        ny /= l2;
        nz /= l2;
      }
      let ar = lk.r;
      let ag = lk.g;
      let ab = lk.b;
      if (m.brush) {
        // Hand-painted: broad blotches of slightly warmer and cooler paint, with a little of the brush's direction in them.
        const blot = fbm(px * 2.6 + 3, py * 2.6, pz * 2.6 + 8) - 0.5;
        const stroke = fbm(px * 5.2, py * 1.7 + 9, pz * 5.2 + 4) - 0.5;
        const v = 1 + (blot * 0.2 + stroke * 0.13) * m.brush;
        ar *= v * (1 + blot * 0.1 * m.brush);
        ag *= v;
        ab *= v * (1 - blot * 0.1 * m.brush);
      }
      if (m.grain > 0) {
        const streak = m.streak ? fbm(px * 2.2, py * 18, pz * 2.2) : fbm(px * 5, py * 5, pz * 5);
        const g = 1 + (streak - 0.5) * m.grain * 2.4;
        ar *= g;
        ag *= g;
        ab *= g;
      }
      if (m.emit) {
        // Lit from within: bright where it faces you, deepening and warming toward the edges, a touch lighter on top.
        const facing = Math.max(0, -(rx * nx + ry * ny + rz * nz));
        const k = 0.62 + 0.5 * facing * facing + 0.12 * (0.5 + 0.5 * ny);
        out[idx + 0] += toSrgb(tone(ar * 1.1 * k));
        out[idx + 1] += toSrgb(tone(ag * (0.82 + 0.28 * facing) * k));
        out[idx + 2] += toSrgb(tone(ab * (0.68 + 0.42 * facing) * k));
        out[idx + 3] += 1;
        continue;
      }
      const lx = lightDir[0];
      const ly = lightDir[1];
      const lz = lightDir[2];
      if (m.coat !== undefined) {
        // The character finish: soft light that wraps, shadows that keep their colour, a clear coat over it.
        if (m.tread && lk.part) {
          // A tyre: ribs round the running surface, a raised ring on the sidewall.
          const ay = py - lk.part.at[1];
          const az = pz - lk.part.at[2];
          const radius = lk.part.args[0];
          const rr = Math.hypot(ay, az) / radius;
          if (Math.abs(nx) < 0.62) {
            const rib = Math.sin(Math.atan2(ay, az) * 30);
            const groove = Math.abs(px - lk.part.at[0]) < lk.part.args[1] * 0.16 ? 0.82 : 1;
            const k = groove * (1 + rib * 0.1);
            ar *= k;
            ag *= k;
            ab *= k;
            nz += Math.cos(Math.atan2(ay, az) * 30) * 0.05 * (ay / (radius * rr || 1));
            ny -= Math.cos(Math.atan2(ay, az) * 30) * 0.05 * (az / (radius * rr || 1));
            const l3 = Math.hypot(nx, ny, nz) || 1;
            nx /= l3;
            ny /= l3;
            nz /= l3;
          } else if (rr > 0.72 && rr < 0.84) {
            ar *= 1.2;
            ag *= 1.2;
            ab *= 1.2;
          }
        }
        // Soft light that wraps, shadows that keep their colour, the faintest coat over it.
        const ndlC = nx * lx + ny * ly + nz * lz;
        const diffC = Math.max(0, (ndlC + m.wrap) / (1 + m.wrap));
        const shadowC = diffC > 0.001 ? softShadow(px + nx * 0.02, py + ny * 0.02, pz + nz * 0.02, lx, ly, lz) : 0;
        const aoC = occlusion(px, py, pz, nx, ny, nz);
        const hemiC = 0.5 + 0.5 * ny;
        const litC = diffC * diffC * (3 - 2 * diffC) * (1 - m.soft * (1 - shadowC)) * keyPower;
        const aoK = 0.42 + 0.58 * aoC;
        const skyC = skyPower * hemiC * aoK;
        const bouC = bouncePower * (1 - hemiC) * aoK;
        // Toward the shadow, colour deepens rather than greys.
        const deep = (1 - Math.min(1, litC)) * 0.34 * aoK;
        let r0 = ar * (keyColor[0] * litC + skyColor[0] * skyC + bounceColor[0] * bouC) + ar * ar * deep + ar * deep * 0.1;
        let g0 = ag * (keyColor[1] * litC + skyColor[1] * skyC + bounceColor[1] * bouC) + ag * ag * deep;
        let b0 = ab * (keyColor[2] * litC + skyColor[2] * skyC + bounceColor[2] * bouC) + ab * ab * deep + ab * deep * 0.04;
        const faceC = Math.max(0, -(rx * nx + ry * ny + rz * nz));
        if (m.glow) {
          const g = m.glow * (0.5 + 0.5 * faceC * faceC);
          r0 += ar * g;
          g0 += ag * g;
          b0 += ab * g;
        }
        const dn = rx * nx + ry * ny + rz * nz;
        studio(rx - 2 * dn * nx, ry - 2 * dn * ny, rz - 2 * dn * nz);
        const fresnel = m.coat + (1 - m.coat) * Math.pow(1 - faceC, 5) * Math.min(1, m.coat * 8);
        const seen = fresnel * Math.max(0, Math.min(1, aoC * 1.5 - 0.25));
        const tr = m.metal ? ar * 1.5 + 0.06 : 1;
        const tg = m.metal ? ag * 1.5 + 0.06 : 1;
        const tb = m.metal ? ab * 1.5 + 0.06 : 1;
        r0 += refl[0] * seen * tr;
        g0 += refl[1] * seen * tg;
        b0 += refl[2] * seen * tb;
        const hxC = lx - rx;
        const hyC = ly - ry;
        const hzC = lz - rz;
        const hlC = Math.hypot(hxC, hyC, hzC) || 1;
        const ndhC = Math.max(0, (nx * hxC + ny * hyC + nz * hzC) / hlC);
        const specC = Math.pow(ndhC, m.gloss) * m.spec * shadowC;
        const rim = Math.pow(1 - faceC, 3) * m.sheen * (0.4 + 0.6 * hemiC) * aoC;
        out[idx + 0] += toSrgb(tone(r0 + specC + rim * skyColor[0]));
        out[idx + 1] += toSrgb(tone(g0 + specC + rim * skyColor[1]));
        out[idx + 2] += toSrgb(tone(b0 + specC + rim * skyColor[2]));
        out[idx + 3] += 1;
        continue;
      }
      const ndl = nx * lx + ny * ly + nz * lz;
      const wrap = m.wrap === undefined ? 0.28 : m.wrap;
      const diff = Math.max(0, (ndl + wrap) / (1 + wrap));
      const shadow = diff > 0.001 ? softShadow(px + nx * 0.02, py + ny * 0.02, pz + nz * 0.02, lx, ly, lz) : 0;
      const ao = occlusion(px, py, pz, nx, ny, nz);
      const hemi = 0.5 + 0.5 * ny;
      // The shadow side keeps colour: the terminator warms and saturates a little, like painted clay.
      const lit = diff * (0.25 + 0.75 * shadow) * keyPower;
      const term = Math.max(0, 1 - Math.abs(ndl) * 2.2) * 0.1;
      const aoK = 0.35 + 0.65 * ao;
      let cr = ar * (keyColor[0] * lit + (skyColor[0] * skyPower * hemi + bounceColor[0] * bouncePower * (1 - hemi)) * aoK + term);
      let cg = ag * (keyColor[1] * lit + (skyColor[1] * skyPower * hemi + bounceColor[1] * bouncePower * (1 - hemi)) * aoK + term * 0.6);
      let cb = ab * (keyColor[2] * lit + (skyColor[2] * skyPower * hemi + bounceColor[2] * bouncePower * (1 - hemi)) * aoK + term * 0.3);
      // Highlight: small and restrained. Sheen: a pale rim that lifts forms off dark backgrounds.
      const hx = lx - rx;
      const hy = ly - ry;
      const hz = lz - rz;
      const hl = Math.hypot(hx, hy, hz) || 1;
      const ndh = Math.max(0, (nx * hx + ny * hy + nz * hz) / hl);
      const spec = Math.pow(ndh, m.gloss) * m.spec * shadow;
      const fres = Math.pow(1 - Math.max(0, -(rx * nx + ry * ny + rz * nz)), 3.5) * m.sheen * (0.4 + 0.6 * hemi) * ao;
      cr += spec + fres * skyColor[0];
      cg += spec + fres * skyColor[1];
      cb += spec + fres * skyColor[2];
      out[idx + 0] += toSrgb(tone(cr));
      out[idx + 1] += toSrgb(tone(cg));
      out[idx + 2] += toSrgb(tone(cb));
      out[idx + 3] += 1;
    }
  }

  // Resolve the supersamples; crop to what was drawn.
  const samples = ss * ss;
  const px8 = Buffer.alloc(W * H * 4);
  let minX = W;
  let minY = H;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const i = (y * W + x) * 4;
      const a = out[i + 3];
      if (a <= 0) {
        continue;
      }
      px8[i] = Math.min(255, (out[i] / a) * 255 + 0.5);
      px8[i + 1] = Math.min(255, (out[i + 1] / a) * 255 + 0.5);
      px8[i + 2] = Math.min(255, (out[i + 2] / a) * 255 + 0.5);
      px8[i + 3] = Math.min(255, (a / samples) * 255 + 0.5);
      if (px8[i + 3] > 2) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) {
    minX = 0;
    minY = 0;
    maxX = 0;
    maxY = 0;
  }
  const margin = 2;
  const cx0 = Math.max(0, minX - margin);
  const cy0 = Math.max(0, minY - margin);
  const cx1 = Math.min(W - 1, maxX + margin);
  const cy1 = Math.min(H - 1, maxY + margin);
  const cw = cx1 - cx0 + 1;
  const ch = cy1 - cy0 + 1;
  const crop = Buffer.alloc(cw * ch * 4);
  for (let y = 0; y < ch; y += 1) {
    px8.copy(crop, y * cw * 4, ((y + cy0) * W + cx0) * 4, ((y + cy0) * W + cx1 + 1) * 4);
  }

  /** Projects a world point to sprite pixels (after the crop). */
  const project = (p) => {
    const q = [p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]];
    const depth = dot(q, fw);
    const pu = (dot(q, right) / depth) * dist;
    const pv = (dot(q, up) / depth) * dist;
    return [((pu - left) / wUnits) * W - cx0, ((top - pv) / hUnits) * H - cy0];
  };
  // Each tracked group's outline, as a star-shaped polygon round its middle, plus the colour of the skin just outside it.
  const outlines = {};
  for (const [g, mask] of tracked) {
    let sum = 0;
    let mx = 0;
    let my = 0;
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        if (mask[y * W + x]) {
          sum += 1;
          mx += x;
          my += y;
        }
      }
    }
    if (sum < 6) {
      outlines[g] = null;
      continue;
    }
    mx /= sum;
    my /= sum;
    const spokes = 32;
    const radii = [];
    for (let i = 0; i < spokes; i += 1) {
      const a = (i / spokes) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      let best = 0;
      for (let d = 0; d < Math.max(W, H); d += 0.5) {
        const ix = Math.round(mx + ca * d);
        const iy = Math.round(my + sa * d);
        if (ix < 0 || iy < 0 || ix >= W || iy >= H) {
          break;
        }
        if (mask[iy * W + ix]) {
          best = d;
        } else if (d > best + 3) {
          break;
        }
      }
      radii.push(best + 0.5);
    }
    const poly = [];
    for (let i = 0; i < spokes; i += 1) {
      const a = (i / spokes) * Math.PI * 2;
      const rr = (radii[(i + spokes - 1) % spokes] + radii[i] * 2 + radii[(i + 1) % spokes]) / 4;
      poly.push(Math.round((mx + Math.cos(a) * rr - cx0 + 0.5) * 10) / 10, Math.round((my + Math.sin(a) * rr - cy0 + 0.5) * 10) / 10);
    }
    // The skin colour: pixels a little above the opening, the median of each channel.
    const samples = [[], [], []];
    for (let i = 0; i < spokes; i += 1) {
      const a = (i / spokes) * Math.PI * 2;
      const reach = radii[i] + Math.max(5, radii[i] * 0.34);
      const ix = Math.round(mx + Math.cos(a) * reach);
      const iy = Math.round(my + Math.sin(a) * reach);
      if (ix < 0 || iy < 0 || ix >= W || iy >= H || mask[iy * W + ix]) {
        continue;
      }
      const p = (iy * W + ix) * 4;
      if (px8[p + 3] > 240) {
        samples[0].push(px8[p]);
        samples[1].push(px8[p + 1]);
        samples[2].push(px8[p + 2]);
      }
    }
    const median = (list) => (list.length === 0 ? 200 : list.sort((u, v) => u - v)[Math.floor(list.length * 0.62)]);
    const hex = samples.map((list) => median(list).toString(16).padStart(2, '0')).join('');
    outlines[g] = { poly, cx: Math.round((mx - cx0 + 0.5) * 10) / 10, cy: Math.round((my - cy0 + 0.5) * 10) / 10, skin: `#${hex}` };
  }
  return { width: cw, height: ch, data: crop, project, ppu, outlines, axes: { right, up, back } };
}

module.exports = { render };
