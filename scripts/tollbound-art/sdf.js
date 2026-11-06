/**
 * Tollbound Heroes art pipeline, part 1: a tiny signed-distance modeller.
 *
 * Every character and prop in the game is a small model made of rounded solids
 * that melt into each other, like shapes pressed out of clay. A scene is a flat
 * list of parts; `compile` turns it into a fast distance function plus a colour
 * lookup, and render.js ray-marches that into a sprite. No model files, no
 * packages, no external art: what the game shows is authored here.
 *
 * Space: x right, y up, z forward (a vehicle's nose points at +z). 1 unit is
 * about a third of a small car's width.
 */

// -- part constructors ---------------------------------------------------------

/** Options every part takes: at [x,y,z], rot [rx,ry,rz] in degrees, color, mat, g (group), k (melt radius), op. */
const P = (type, args, o = {}) => ({
  type,
  args,
  at: o.at || [0, 0, 0],
  rot: o.rot || null,
  color: o.color || '#888888',
  mat: o.mat || 'clay',
  g: o.g === undefined ? 0 : o.g,
  k: o.k === undefined ? 0.06 : o.k,
  op: o.op || 'add',
  taper: o.taper || 0,
  soft: o.soft === undefined ? 0.012 : o.soft,
  // A paint can be kept to one group, so a seam on a cap never runs on down the car.
  on: o.on,
  // A part seated in a cut (an eyeball, a lamp): it must win over the skin it sits inside.
  solo: o.solo,
  // Bends a part along its own x: its ends drop by bend * x * x. Only set where wanted, so nothing else changes.
  bend: o.bend,
});

const sphere = (r, o) => P('sphere', [r], o);
const ell = (rx, ry, rz, o) => P('ell', [rx, ry, rz], o);
/** A rounded box; half sizes include the rounding. `taper` narrows x toward the top (cabins, boxes with a lean). */
const box = (hx, hy, hz, r, o) => P('box', [hx, hy, hz, r], o);
/** Rounded cylinder along y (rot it for wheels). */
const cyl = (r, hy, rr, o) => P('cyl', [r, hy, rr], o);
/** Capsule between two local points. */
const cap = (a, b, r, o) => P('cap', [...a, ...b, r], o);
/** Ring in the xz plane. */
const tor = (R, r, o) => P('tor', [R, r], o);
/** Rounded cone along y: radius r1 at -h, r2 at +h. */
const cone = (r1, r2, h, o) => P('cone', [r1, r2, h], o);

/**
 * A D-shaped slab, for an open mouth, flat along its own z. hw: half its width. hh: how far the lip drops below
 * the middle of the top edge. lift: how far the corners rise above that middle. hz: half its depth.
 */
const dee = (hw, hh, lift, hz, o) => P('dee', [hw, hh, lift, hz], o);

/** A leaning bar with level ends, for a letter's diagonal. t: half its width across x. hh: half its height. skew: how far it leans per unit of height. hz: half its depth. */
const slant = (t, hh, skew, hz, o) => P('slant', [t, hh, skew, hz], o);

/** Marks a part as cutting into its group (windows, arches) rather than adding. */
const sub = (part) => ({ ...part, op: 'sub' });
/** Marks a part as colouring what lies inside it, without changing the shape (stripes, panels, faces). */
const paint = (part) => ({ ...part, op: 'paint' });

// -- compile ---------------------------------------------------------------------

function rotation(rot) {
  if (!rot) {
    return null;
  }
  const [ax, ay, az] = rot.map((d) => (d * Math.PI) / 180);
  const cx = Math.cos(ax);
  const sx = Math.sin(ax);
  const cy = Math.cos(ay);
  const sy = Math.sin(ay);
  const cz = Math.cos(az);
  const sz = Math.sin(az);
  // Local to world is Rz*Ry*Rx; world to local is its transpose (returned here).
  const m = [cy * cz, sx * sy * cz - cx * sz, cx * sy * cz + sx * sz, cy * sz, sx * sy * sz + cx * cz, cx * sy * sz - sx * cz, -sy, sx * cy, cx * cy];
  return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
}

/** Source for the distance from world point (x,y,z) to one part: a block that leaves the answer in `d`. */
function partCode(p) {
  const [ax, ay, az] = p.at;
  let code = `let lx=x-(${ax}),ly=y-(${ay}),lz=z-(${az});`;
  const m = rotation(p.rot);
  if (m) {
    code += `{const a=lx,b=ly,c=lz;lx=${m[0]}*a+${m[1]}*b+${m[2]}*c;ly=${m[3]}*a+${m[4]}*b+${m[5]}*c;lz=${m[6]}*a+${m[7]}*b+${m[8]}*c;}`;
  }
  if (p.bend) {
    code += `ly+=(${p.bend})*lx*lx;`;
  }
  const a = p.args;
  switch (p.type) {
    case 'sphere':
      code += `d=Math.sqrt(lx*lx+ly*ly+lz*lz)-${a[0]};`;
      break;
    case 'ell': {
      const [rx, ry, rz] = a;
      code += `{const u=lx/${rx},v=ly/${ry},w=lz/${rz},u2=lx/${rx * rx},v2=ly/${ry * ry},w2=lz/${rz * rz};const k0=Math.sqrt(u*u+v*v+w*w),k1=Math.sqrt(u2*u2+v2*v2+w2*w2);d=k1<1e-9?-${Math.min(rx, ry, rz)}:k0*(k0-1)/k1;}`;
      break;
    }
    case 'box': {
      const [hx, hy, hz, r] = a;
      const taper = p.taper ? `lx/=Math.max(0.15,1-(${p.taper})*(ly/${hy}+1)/2);` : '';
      code += `${taper}{const qx=Math.abs(lx)-(${hx - r}),qy=Math.abs(ly)-(${hy - r}),qz=Math.abs(lz)-(${hz - r});const ox=Math.max(qx,0),oy=Math.max(qy,0),oz=Math.max(qz,0);d=Math.sqrt(ox*ox+oy*oy+oz*oz)+Math.min(Math.max(qx,qy,qz),0)-${r};}`;
      break;
    }
    case 'cyl': {
      const [r, hy, rr] = a;
      code += `{const dx=Math.sqrt(lx*lx+lz*lz)-(${r - rr}),dy=Math.abs(ly)-(${hy - rr});const ox=Math.max(dx,0),oy=Math.max(dy,0);d=Math.sqrt(ox*ox+oy*oy)+Math.min(Math.max(dx,dy),0)-${rr};}`;
      break;
    }
    case 'cap': {
      const [x0, y0, z0, x1, y1, z1, r] = a;
      const bx = x1 - x0;
      const by = y1 - y0;
      const bz = z1 - z0;
      const bb = bx * bx + by * by + bz * bz || 1e-6;
      code += `{const pa=lx-(${x0}),pb=ly-(${y0}),pc=lz-(${z0});let h=(pa*(${bx})+pb*(${by})+pc*(${bz}))/${bb};h=h<0?0:h>1?1:h;const qa=pa-(${bx})*h,qb=pb-(${by})*h,qc=pc-(${bz})*h;d=Math.sqrt(qa*qa+qb*qb+qc*qc)-${r};}`;
      break;
    }
    case 'tor': {
      const [R, r] = a;
      code += `{const q=Math.sqrt(lx*lx+lz*lz)-${R};d=Math.sqrt(q*q+ly*ly)-${r};}`;
      break;
    }
    case 'cone': {
      const [r1, r2, h] = a;
      // Near enough for a rounded frustum: distance to a slanted cylinder in (radial, y).
      const s = (r2 - r1) / (2 * h);
      const n = Math.sqrt(1 + s * s);
      code += `{const q=Math.sqrt(lx*lx+lz*lz);const r=${r1}+(ly+${h})*(${s});const side=(q-r)/${n};const caps=Math.abs(ly)-${h};d=side>0&&caps>0?Math.sqrt(side*side+caps*caps):Math.max(side,caps);}`;
      break;
    }
    case 'dee': {
      const [hw, hh, lift, hz] = a;
      const ry = hh + lift;
      // Inside the lower half of an ellipse through the corners, and under a shallow curve for the top lip.
      code += `{const u=lx/${hw},v=(ly-(${lift}))/${ry},u2=lx/${hw * hw},v2=(ly-(${lift}))/${ry * ry};const k0=Math.sqrt(u*u+v*v),k1=Math.sqrt(u2*u2+v2*v2);const e=k1<1e-9?-${Math.min(hw, ry)}:k0*(k0-1)/k1;const s=2*(${lift})*lx/${hw * hw};const t=(ly-(${lift})*lx*lx/${hw * hw})/Math.sqrt(1+s*s);const f=Math.max(e,t);const c=Math.abs(lz)-${hz};d=f>0&&c>0?Math.sqrt(f*f+c*c):Math.max(f,c);}`;
      break;
    }
    case 'slant': {
      const [t, hh, skew, hz] = a;
      code += `{const sx=(Math.abs(lx-(${skew})*ly)-${t})/${Math.hypot(1, skew)},sy=Math.abs(ly)-${hh},sz=Math.abs(lz)-${hz};d=Math.max(sx,sy,sz);}`;
      break;
    }
    default:
      throw new Error(`unknown part ${p.type}`);
  }
  return code;
}

/** A generous bounding sphere for one part, in world space. */
function partBounds(p) {
  const a = p.args;
  switch (p.type) {
    case 'sphere':
      return { c: p.at, r: a[0] };
    case 'ell':
      return { c: p.at, r: Math.max(a[0], a[1], a[2]) };
    case 'box':
      return { c: p.at, r: Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]) };
    case 'cyl':
      return { c: p.at, r: Math.sqrt(a[0] * a[0] + a[1] * a[1]) };
    case 'tor':
      return { c: p.at, r: a[0] + a[1] };
    case 'cone':
      return { c: p.at, r: Math.sqrt(Math.max(a[0], a[1]) ** 2 + a[2] * a[2]) };
    case 'dee':
      return { c: p.at, r: Math.hypot(a[0], a[1] + a[2], a[3]) };
    case 'slant':
      return { c: p.at, r: Math.hypot(a[0] + Math.abs(a[2]) * a[1], a[1], a[3]) };
    case 'cap': {
      const mx = (a[0] + a[3]) / 2;
      const my = (a[1] + a[4]) / 2;
      const mz = (a[2] + a[5]) / 2;
      const half = Math.sqrt((a[3] - a[0]) ** 2 + (a[4] - a[1]) ** 2 + (a[5] - a[2]) ** 2) / 2;
      const m = rotation(p.rot);
      // m is world-to-local; multiply by its transpose for local-to-world.
      const wx = m ? m[0] * mx + m[3] * my + m[6] * mz : mx;
      const wy = m ? m[1] * mx + m[4] * my + m[7] * mz : my;
      const wz = m ? m[2] * mx + m[5] * my + m[8] * mz : mz;
      return { c: [p.at[0] + wx, p.at[1] + wy, p.at[2] + wz], r: half + a[6] };
    }
    default:
      return { c: p.at, r: 3 };
  }
}

function hexLinear(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h, 16);
  const f = (c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return [f((n >> 16) & 255), f((n >> 8) & 255), f(n & 255)];
}

/**
 * Compiles parts into { map(x,y,z), look(x,y,z), center, radius }. Parts in a
 * group melt together with their own radius and `sub` parts cut the group;
 * groups meet with a hard edge. A small warp makes every form a little hand-made.
 */
function compile(parts, options = {}) {
  const warp = options.warp === undefined ? 0.012 : options.warp;
  const groups = new Map();
  parts.forEach((p) => {
    if (p.op === 'paint') {
      return;
    }
    if (!groups.has(p.g)) {
      groups.set(p.g, []);
    }
    groups.get(p.g).push(p);
  });
  let src = 'let best=1e9,d=0;\n';
  if (warp > 0) {
    src += `{const wx=x,wy=y,wz=z;x=wx+${warp}*Math.sin(wy*3.1+wz*1.7);y=wy+${warp}*Math.sin(wz*2.9+wx*2.3);z=wz+${warp}*Math.sin(wx*3.3+wy*1.9);}\n`;
  }
  let cx = 0;
  let cy = 0;
  let cz = 0;
  let count = 0;
  const allBounds = [];
  for (const members of groups.values()) {
    const adds = members.filter((p) => p.op === 'add');
    const bs = adds.map(partBounds);
    if (bs.length === 0) {
      continue;
    }
    allBounds.push(...bs);
    const gx = bs.reduce((s, b) => s + b.c[0], 0) / bs.length;
    const gy = bs.reduce((s, b) => s + b.c[1], 0) / bs.length;
    const gz = bs.reduce((s, b) => s + b.c[2], 0) / bs.length;
    const R = Math.max(...bs.map((b) => Math.hypot(b.c[0] - gx, b.c[1] - gy, b.c[2] - gz) + b.r)) + 0.1;
    cx += gx;
    cy += gy;
    cz += gz;
    count += 1;
    // Outside this group's bounds and further than what is already known: its bound is good enough.
    src += `{const bx=x-(${gx}),by=y-(${gy}),bz=z-(${gz});const bd=Math.sqrt(bx*bx+by*by+bz*bz)-${R};if(bd>0.25&&bd>=best){}else if(bd>0.25){best=bd;}else{let g=1e9;\n`;
    // Added parts first, then cuts, whatever order they were listed in.
    for (const p of [...adds, ...members.filter((q) => q.op === 'sub')]) {
      src += `{${partCode(p)}`;
      const k = p.k;
      if (p.op === 'add') {
        src += k > 0 ? `if(g>=1e8)g=d;else{const h=Math.max(${k}-Math.abs(g-d),0)/${k};g=Math.min(g,d)-h*h*${k}*0.25;}}\n` : `if(d<g)g=d;}\n`;
      } else {
        src += k > 0 ? `{const m=-d;const h=Math.max(${k}-Math.abs(g-m),0)/${k};g=Math.max(g,m)+h*h*${k}*0.25;}}\n` : `{const m=-d;if(m>g)g=m;}}\n`;
      }
    }
    src += `if(g<best)best=g;}}\n`;
  }
  src += 'return best;';
  // eslint-disable-next-line no-new-func
  const map = new Function('x', 'y', 'z', src);

  const looks = parts.map((p) => {
    // eslint-disable-next-line no-new-func
    const dist = new Function('x', 'y', 'z', `let d=0;{${partCode(p)}}return d;`);
    return { dist, rgb: hexLinear(p.color), mat: p.mat, op: p.op, g: p.g, soft: p.soft, part: p };
  });
  const adds = looks.filter((l) => l.op === 'add');
  const paints = looks.filter((l) => l.op === 'paint');

  /** Colour and material at a surface point: the nearest added part (softly blended within its own group), then any paint over it. */
  function look(x, y, z) {
    let w = 0;
    let r = 0;
    let g = 0;
    let b = 0;
    let bestD = 1e9;
    let mat = 'clay';
    let group = null;
    let part = null;
    const ds = new Array(adds.length);
    for (let i = 0; i < adds.length; i += 1) {
      const d = adds[i].dist(x, y, z);
      ds[i] = d;
      if (d < bestD && !adds[i].part.solo) {
        bestD = d;
        mat = adds[i].mat;
        group = adds[i].g;
        part = adds[i].part;
      }
    }
    for (let i = 0; i < adds.length; i += 1) {
      if (adds[i].part.solo && Math.abs(ds[i]) < 0.014) {
        bestD = ds[i];
        mat = adds[i].mat;
        group = adds[i].g;
        part = adds[i].part;
        break;
      }
    }
    for (let i = 0; i < adds.length; i += 1) {
      const l = adds[i];
      if (l.g !== group) {
        continue;
      }
      const d = ds[i];
      const weight = Math.exp(-Math.max(d, -0.02) * 70);
      w += weight;
      r += l.rgb[0] * weight;
      g += l.rgb[1] * weight;
      b += l.rgb[2] * weight;
    }
    r /= w;
    g /= w;
    b /= w;
    for (const l of paints) {
      if (l.part.on !== undefined && l.part.on !== group) {
        continue;
      }
      // A part seated in the surface (an eye, a lamp's glass) only takes paint aimed at it by name: a face panel never paints over an eye.
      if (l.part.on === undefined && part?.solo) {
        continue;
      }
      const d = l.dist(x, y, z);
      if (d < l.soft) {
        const a = d <= -l.soft ? 1 : (l.soft - d) / (2 * l.soft);
        r += (l.rgb[0] - r) * a;
        g += (l.rgb[1] - g) * a;
        b += (l.rgb[2] - b) * a;
        if (a > 0.5) {
          mat = l.mat;
        }
      }
    }
    return { r, g, b, mat, part };
  }

  let radius = 0;
  const center = count ? [cx / count, cy / count, cz / count] : [0, 0, 0];
  for (const b of allBounds) {
    radius = Math.max(radius, Math.hypot(b.c[0] - center[0], b.c[1] - center[1], b.c[2] - center[2]) + b.r);
  }
  return { map, look, center, radius: radius + 0.2 };
}

module.exports = { sphere, ell, box, cyl, cap, tor, cone, dee, slant, sub, paint, compile, hexLinear };
