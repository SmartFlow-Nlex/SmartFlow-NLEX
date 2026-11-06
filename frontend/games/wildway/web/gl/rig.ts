import { mat4, multiply, pivoted, type Vec3 } from './math';
import { MAX_BONES } from './renderer';

/**
 * A skeleton: each bone is a pivot in the model's rest pose, and a parent. A pose sets
 * rotation, offset and scale per bone, and non-uniform scale is what gives squash and
 * stretch. Every shape on a bone moves with it rigidly, which suits sculpted toys.
 */

export class Rig {
  readonly matrices: Float32Array;
  readonly rot: Float32Array;
  readonly off: Float32Array;
  readonly scale: Float32Array;
  private readonly world: Float32Array[];
  private readonly local = mat4();

  constructor(
    private readonly pivots: readonly Vec3[],
    private readonly parents: readonly number[],
  ) {
    if (pivots.length > MAX_BONES) {
      throw new Error('Too many bones');
    }
    this.matrices = new Float32Array(MAX_BONES * 16);
    for (let i = 0; i < MAX_BONES; i += 1) {
      this.matrices.set(mat4(), i * 16);
    }
    const n = pivots.length;
    this.rot = new Float32Array(n * 3);
    this.off = new Float32Array(n * 3);
    this.scale = new Float32Array(n * 3).fill(1);
    this.world = pivots.map(() => mat4());
  }

  reset(): this {
    this.rot.fill(0);
    this.off.fill(0);
    this.scale.fill(1);
    return this;
  }

  turn(bone: number, x: number, y = 0, z = 0): this {
    this.rot[bone * 3] += x;
    this.rot[bone * 3 + 1] += y;
    this.rot[bone * 3 + 2] += z;
    return this;
  }

  move(bone: number, x: number, y = 0, z = 0): this {
    this.off[bone * 3] += x;
    this.off[bone * 3 + 1] += y;
    this.off[bone * 3 + 2] += z;
    return this;
  }

  size(bone: number, x: number, y: number = x, z: number = x): this {
    this.scale[bone * 3] *= x;
    this.scale[bone * 3 + 1] *= y;
    this.scale[bone * 3 + 2] *= z;
    return this;
  }

  /** Works out every bone's matrix. Parents must come before their children. */
  update(): Float32Array {
    for (let i = 0; i < this.pivots.length; i += 1) {
      const p = this.pivots[i];
      pivoted(
        this.local,
        p[0],
        p[1],
        p[2],
        this.rot[i * 3],
        this.rot[i * 3 + 1],
        this.rot[i * 3 + 2],
        this.scale[i * 3],
        this.scale[i * 3 + 1],
        this.scale[i * 3 + 2],
        this.off[i * 3],
        this.off[i * 3 + 1],
        this.off[i * 3 + 2],
      );
      const parent = this.parents[i];
      if (parent < 0) {
        this.world[i].set(this.local);
      } else {
        multiply(this.world[i], this.world[parent], this.local);
      }
      this.matrices.set(this.world[i], i * 16);
    }
    return this.matrices;
  }
}
