import { hex, identity, mat4, multiply, placement, type Mat4, type Vec3 } from './math';

/**
 * Sculpts meshes from simple rounded shapes: ellipsoids, tubes, cones and soft boxes.
 * Every vertex carries its own colour, the bone it follows and how much it sways in
 * the wind, so a whole character or a whole patch of forest is one draw call.
 */

export const STRIDE = 11;
const MAX_VERTS = 65000;

export type Color = string | Vec3;
const rgb = (c: Color): Vec3 => (typeof c === 'string' ? hex(c) : c);

export class MeshBuilder {
  verts: number[] = [];
  indices: number[] = [];
  bone = 0;
  sway = 0;
  private readonly m: Mat4 = mat4();
  private readonly stack: Mat4[] = [];

  get vertexCount(): number {
    return this.verts.length / STRIDE;
  }

  get full(): boolean {
    return this.vertexCount > MAX_VERTS - 2000;
  }

  /** Everything drawn inside `fn` is placed at this spot, turned about Y and scaled. */
  at(x: number, y: number, z: number, yaw: number, scale: number, fn: () => void): this {
    this.stack.push(this.m.slice() as Mat4);
    const local = placement(mat4(), x, y, z, yaw, scale);
    multiply(this.m, this.stack[this.stack.length - 1], local);
    fn();
    this.m.set(this.stack.pop() as Mat4);
    return this;
  }

  resetTransform(): void {
    identity(this.m);
    this.stack.length = 0;
  }

  private vertex(x: number, y: number, z: number, nx: number, ny: number, nz: number, c: Vec3): number {
    const m = this.m;
    const i = this.vertexCount;
    this.verts.push(
      m[0] * x + m[4] * y + m[8] * z + m[12],
      m[1] * x + m[5] * y + m[9] * z + m[13],
      m[2] * x + m[6] * y + m[10] * z + m[14],
      m[0] * nx + m[4] * ny + m[8] * nz,
      m[1] * nx + m[5] * ny + m[9] * nz,
      m[2] * nx + m[6] * ny + m[10] * nz,
      c[0],
      c[1],
      c[2],
      this.bone,
      this.sway,
    );
    return i;
  }

  /** A raw vertex in world space, for terrain and other grids. */
  rawVertex(x: number, y: number, z: number, nx: number, ny: number, nz: number, c: Vec3): number {
    return this.vertex(x, y, z, nx, ny, nz, c);
  }

  private grid(rows: number, cols: number, base: number): void {
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const a = base + r * (cols + 1) + c;
        const b = a + cols + 1;
        this.indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }

  /** An egg: rx, ry, rz are its radii. `tilt` leans it about X then Z. */
  ellipsoid(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, color: Color, opts: { rows?: number; cols?: number; tiltX?: number; tiltZ?: number; yaw?: number } = {}): this {
    const rows = opts.rows ?? 8;
    const cols = opts.cols ?? 10;
    const c = rgb(color);
    const base = this.vertexCount;
    const sx = Math.sin(opts.tiltX ?? 0);
    const cxr = Math.cos(opts.tiltX ?? 0);
    const sz = Math.sin(opts.tiltZ ?? 0);
    const czr = Math.cos(opts.tiltZ ?? 0);
    const sy = Math.sin(opts.yaw ?? 0);
    const cyr = Math.cos(opts.yaw ?? 0);
    const turn = (x: number, y: number, z: number): Vec3 => {
      const y1 = y * cxr - z * sx;
      const z1 = y * sx + z * cxr;
      const x2 = x * czr - y1 * sz;
      const y2 = x * sz + y1 * czr;
      return [x2 * cyr + z1 * sy, y2, -x2 * sy + z1 * cyr];
    };
    for (let r = 0; r <= rows; r += 1) {
      const lat = (r / rows) * Math.PI;
      const sl = Math.sin(lat);
      const cl = Math.cos(lat);
      for (let k = 0; k <= cols; k += 1) {
        const lon = (k / cols) * Math.PI * 2;
        const ux = sl * Math.cos(lon);
        const uy = cl;
        const uz = sl * Math.sin(lon);
        const p = turn(ux * rx, uy * ry, uz * rz);
        const n = turn(ux / rx, uy / ry, uz / rz);
        const l = Math.hypot(n[0], n[1], n[2]) || 1;
        this.vertex(cx + p[0], cy + p[1], cz + p[2], n[0] / l, n[1] / l, n[2] / l, c);
      }
    }
    this.grid(rows, cols, base);
    return this;
  }

  ball(cx: number, cy: number, cz: number, r: number, color: Color, rows = 6, cols = 8): this {
    return this.ellipsoid(cx, cy, cz, r, r, r, color, { rows, cols });
  }

  /** A soft-cornered box: `round` from 0 (nearly sharp) to 1 (a ball). */
  rbox(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, color: Color, round = 0.45, yaw = 0): this {
    const rows = 8;
    const cols = 12;
    const c = rgb(color);
    const base = this.vertexCount;
    const e = Math.max(0.12, round);
    const pow = (v: number, p: number): number => Math.sign(v) * Math.pow(Math.abs(v), p);
    const cy2 = Math.cos(yaw);
    const sy2 = Math.sin(yaw);
    for (let r = 0; r <= rows; r += 1) {
      const lat = Math.PI / 2 - (r / rows) * Math.PI;
      for (let k = 0; k <= cols; k += 1) {
        const lon = (k / cols) * Math.PI * 2 + Math.PI / 4;
        const x = pow(Math.cos(lat), e) * pow(Math.cos(lon), e);
        const y = pow(Math.sin(lat), e);
        const z = pow(Math.cos(lat), e) * pow(Math.sin(lon), e);
        const q = 2 / e - 1;
        let nx = pow(x, q) / sx;
        const ny = pow(y, q) / sy;
        let nz = pow(z, q) / sz;
        const l = Math.hypot(nx, ny, nz) || 1;
        nx /= l;
        nz /= l;
        const px = x * sx * 0.5;
        const pz = z * sz * 0.5;
        this.vertex(cx + px * cy2 + pz * sy2, cy + y * sy * 0.5, cz - px * sy2 + pz * cy2, nx * cy2 + nz * sy2, ny / l, -nx * sy2 + nz * cy2, c);
      }
    }
    this.grid(rows, cols, base);
    return this;
  }

  /** A tube from a to b, tapering from r1 to r2, with rounded ends. For limbs, trunks and poles. */
  tube(a: Vec3, b: Vec3, r1: number, r2: number, color: Color, sides = 8, ends = true): this {
    const c = rgb(color);
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const dz = b[2] - a[2];
    const len = Math.hypot(dx, dy, dz) || 1;
    const ax: Vec3 = [dx / len, dy / len, dz / len];
    const ref: Vec3 = Math.abs(ax[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    let ux = ax[1] * ref[2] - ax[2] * ref[1];
    let uy = ax[2] * ref[0] - ax[0] * ref[2];
    let uz = ax[0] * ref[1] - ax[1] * ref[0];
    const ul = Math.hypot(ux, uy, uz) || 1;
    ux /= ul;
    uy /= ul;
    uz /= ul;
    const vx = ax[1] * uz - ax[2] * uy;
    const vy = ax[2] * ux - ax[0] * uz;
    const vz = ax[0] * uy - ax[1] * ux;
    const base = this.vertexCount;
    for (let r = 0; r <= 1; r += 1) {
      const p = r === 0 ? a : b;
      const rad = r === 0 ? r1 : r2;
      for (let k = 0; k <= sides; k += 1) {
        const t = (k / sides) * Math.PI * 2;
        const ct = Math.cos(t);
        const st = Math.sin(t);
        const nx = ux * ct + vx * st;
        const ny = uy * ct + vy * st;
        const nz = uz * ct + vz * st;
        this.vertex(p[0] + nx * rad, p[1] + ny * rad, p[2] + nz * rad, nx, ny, nz, c);
      }
    }
    this.grid(1, sides, base);
    if (ends) {
      this.ball(a[0], a[1], a[2], r1, c, 4, sides);
      this.ball(b[0], b[1], b[2], r2, c, 4, sides);
    }
    return this;
  }

  /** A cone sitting on (x, y, z), pointing up. `sides` low for a faceted look. */
  cone(x: number, y: number, z: number, r: number, h: number, color: Color, sides = 10, tip?: Color): this {
    const c = rgb(color);
    const t = tip === undefined ? c : rgb(tip);
    const slope = r / Math.hypot(r, h);
    const up = h / Math.hypot(r, h);
    const base = this.vertexCount;
    for (let k = 0; k <= sides; k += 1) {
      const a = (k / sides) * Math.PI * 2;
      const nx = Math.cos(a);
      const nz = Math.sin(a);
      this.vertex(x, y + h, z, nx * up, slope, nz * up, t);
    }
    for (let k = 0; k <= sides; k += 1) {
      const a = (k / sides) * Math.PI * 2;
      const nx = Math.cos(a);
      const nz = Math.sin(a);
      this.vertex(x + nx * r, y, z + nz * r, nx * up, slope, nz * up, c);
    }
    this.grid(1, sides, base);
    const centre = this.vertex(x, y, z, 0, -1, 0, c);
    const ring = this.vertexCount;
    for (let k = 0; k <= sides; k += 1) {
      const a = (k / sides) * Math.PI * 2;
      this.vertex(x + Math.cos(a) * r, y, z + Math.sin(a) * r, 0, -1, 0, c);
    }
    for (let k = 0; k < sides; k += 1) {
      this.indices.push(centre, ring + k, ring + k + 1);
    }
    return this;
  }

  /** A flat disc facing up, for rings, pads and painted marks. */
  disc(x: number, y: number, z: number, r: number, color: Color, sides = 16): this {
    const c = rgb(color);
    const centre = this.vertex(x, y, z, 0, 1, 0, c);
    const ring = this.vertexCount;
    for (let k = 0; k <= sides; k += 1) {
      const a = (k / sides) * Math.PI * 2;
      this.vertex(x + Math.cos(a) * r, y, z + Math.sin(a) * r, 0, 1, 0, c);
    }
    for (let k = 0; k < sides; k += 1) {
      this.indices.push(centre, ring + k + 1, ring + k);
    }
    return this;
  }

  /** A flat quad between four corners, in order, facing the side they wind counter-clockwise from. */
  quad(a: Vec3, b: Vec3, c: Vec3, d: Vec3, color: Color): this {
    const col = rgb(color);
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = d[0] - a[0];
    const vy = d[1] - a[1];
    const vz = d[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    const i = this.vertexCount;
    this.vertex(a[0], a[1], a[2], nx, ny, nz, col);
    this.vertex(b[0], b[1], b[2], nx, ny, nz, col);
    this.vertex(c[0], c[1], c[2], nx, ny, nz, col);
    this.vertex(d[0], d[1], d[2], nx, ny, nz, col);
    this.indices.push(i, i + 1, i + 2, i, i + 2, i + 3);
    return this;
  }
}
