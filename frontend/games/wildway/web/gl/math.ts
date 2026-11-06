/** Just enough 3D maths: column-major 4x4 matrices in Float32Arrays, and plain [x, y, z] vectors. */

export type Vec3 = [number, number, number];
export type Mat4 = Float32Array;

export const mat4 = (): Mat4 => {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
};

export function identity(m: Mat4): Mat4 {
  m.fill(0);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

export function multiply(out: Mat4, a: Mat4, b: Mat4, offset = 0, aOffset = 0): Mat4 {
  const a00 = a[aOffset];
  const a01 = a[aOffset + 1];
  const a02 = a[aOffset + 2];
  const a03 = a[aOffset + 3];
  const a10 = a[aOffset + 4];
  const a11 = a[aOffset + 5];
  const a12 = a[aOffset + 6];
  const a13 = a[aOffset + 7];
  const a20 = a[aOffset + 8];
  const a21 = a[aOffset + 9];
  const a22 = a[aOffset + 10];
  const a23 = a[aOffset + 11];
  const a30 = a[aOffset + 12];
  const a31 = a[aOffset + 13];
  const a32 = a[aOffset + 14];
  const a33 = a[aOffset + 15];
  for (let i = 0; i < 4; i += 1) {
    const b0 = b[i * 4];
    const b1 = b[i * 4 + 1];
    const b2 = b[i * 4 + 2];
    const b3 = b[i * 4 + 3];
    out[offset + i * 4] = a00 * b0 + a10 * b1 + a20 * b2 + a30 * b3;
    out[offset + i * 4 + 1] = a01 * b0 + a11 * b1 + a21 * b2 + a31 * b3;
    out[offset + i * 4 + 2] = a02 * b0 + a12 * b1 + a22 * b2 + a32 * b3;
    out[offset + i * 4 + 3] = a03 * b0 + a13 * b1 + a23 * b2 + a33 * b3;
  }
  return out;
}

export function perspective(out: Mat4, fovY: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fovY / 2);
  out.fill(0);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) / (near - far);
  out[11] = -1;
  out[14] = (2 * far * near) / (near - far);
  return out;
}

export function lookAt(out: Mat4, eye: Vec3, target: Vec3, up: Vec3 = [0, 1, 0]): Mat4 {
  let zx = eye[0] - target[0];
  let zy = eye[1] - target[1];
  let zz = eye[2] - target[2];
  const zl = Math.hypot(zx, zy, zz) || 1;
  zx /= zl;
  zy /= zl;
  zz /= zl;
  let xx = up[1] * zz - up[2] * zy;
  let xy = up[2] * zx - up[0] * zz;
  let xz = up[0] * zy - up[1] * zx;
  const xl = Math.hypot(xx, xy, xz) || 1;
  xx /= xl;
  xy /= xl;
  xz /= xl;
  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;
  out[0] = xx;
  out[1] = yx;
  out[2] = zx;
  out[3] = 0;
  out[4] = xy;
  out[5] = yy;
  out[6] = zy;
  out[7] = 0;
  out[8] = xz;
  out[9] = yz;
  out[10] = zz;
  out[11] = 0;
  out[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
  out[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
  out[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
  out[15] = 1;
  return out;
}

/** Translation, then rotation about Y, then uniform scale. Enough for anything standing on the ground. */
export function placement(out: Mat4, x: number, y: number, z: number, yaw = 0, s = 1): Mat4 {
  const c = Math.cos(yaw) * s;
  const n = Math.sin(yaw) * s;
  out.fill(0);
  out[0] = c;
  out[2] = -n;
  out[5] = s;
  out[8] = n;
  out[10] = c;
  out[12] = x;
  out[13] = y;
  out[14] = z;
  out[15] = 1;
  return out;
}

/** Rotation from Euler angles (X, then Y, then Z) with non-uniform scale, about a pivot, with an offset. */
export function pivoted(out: Mat4, px: number, py: number, pz: number, rx: number, ry: number, rz: number, sx: number, sy: number, sz: number, ox: number, oy: number, oz: number): Mat4 {
  const cx = Math.cos(rx);
  const nx = Math.sin(rx);
  const cy = Math.cos(ry);
  const ny = Math.sin(ry);
  const cz = Math.cos(rz);
  const nz = Math.sin(rz);
  const m00 = cy * cz + ny * nx * nz;
  const m01 = cx * nz;
  const m02 = -ny * cz + cy * nx * nz;
  const m10 = -cy * nz + ny * nx * cz;
  const m11 = cx * cz;
  const m12 = ny * nz + cy * nx * cz;
  const m20 = ny * cx;
  const m21 = -nx;
  const m22 = cy * cx;
  out[0] = m00 * sx;
  out[1] = m01 * sx;
  out[2] = m02 * sx;
  out[3] = 0;
  out[4] = m10 * sy;
  out[5] = m11 * sy;
  out[6] = m12 * sy;
  out[7] = 0;
  out[8] = m20 * sz;
  out[9] = m21 * sz;
  out[10] = m22 * sz;
  out[11] = 0;
  out[12] = px + ox - (out[0] * px + out[4] * py + out[8] * pz);
  out[13] = py + oy - (out[1] * px + out[5] * py + out[9] * pz);
  out[14] = pz + oz - (out[2] * px + out[6] * py + out[10] * pz);
  out[15] = 1;
  return out;
}

export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
export const smooth = (a: number, b: number, v: number): number => {
  const k = clamp((v - a) / (b - a), 0, 1);
  return k * k * (3 - 2 * k);
};
export const ease = (rate: number, dt: number): number => 1 - Math.exp(-rate * dt);

/** The shortest way round from one angle to another. */
export function angleTo(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) {
    d -= Math.PI * 2;
  } else if (d < -Math.PI) {
    d += Math.PI * 2;
  }
  return d;
}

export function hex(color: string): Vec3 {
  const n = parseInt(color.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** A little repeatable randomness for placing scenery. */
export function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
