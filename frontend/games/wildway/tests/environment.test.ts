import type { MeshBuilder } from '../web/gl/builder';
import type { Renderer } from '../web/gl/renderer';
import { clearOf, cuteHouse } from '../web/world/buildings';
import { bamboo, bush, fern, flower, palm, rock, roundTree, Scatter, stump, tallTree, tuft } from '../web/world/scenery';
import { assert, test } from './harness';

/** Builds without a GPU, keeping each mesh's vertex count. */
const counts: number[] = [];
const fake = {
  mesh: (b: MeshBuilder) => {
    counts.push(b.vertexCount);
    return { count: b.indices.length, center: [0, 0, 0], radius: 1 };
  },
} as unknown as Renderer;

/** A random source that counts how often it is asked. */
const counter = (): { rand: () => number; n: () => number } => {
  let n = 0;
  return {
    rand: () => {
      n += 1;
      return 0.5;
    },
    n: () => n,
  };
};

test('environment: every plant draws exactly as many random numbers as before, so no layout moves', () => {
  /* The numbers each builder drew before the plants were redrawn on 9 November. */
  const expected: [string, (s: Scatter, rand: () => number) => void, number][] = [
    ['tallTree', (s, rand) => tallTree(s, 3, 0, 4, 1, rand, 1), 1],
    ['roundTree', (s, rand) => roundTree(s, 3, 0, 4, 1, rand), 1],
    ['palm', (s, rand) => palm(s, 3, 0, 4, 1, rand), 1],
    ['bamboo', (s, rand) => bamboo(s, 3, 0, 4, rand), 18],
    ['bush', (s, rand) => bush(s, 3, 0, 4, 1, rand), 1],
    ['rock', (s, rand) => rock(s, 3, 0, 4, 1, rand), 2],
    /* With every draw 0.5, a fern has 4 + floor(1.5) = 5 fronds: one draw for the count, one each. */
    ['fern', (s, rand) => fern(s, 3, 0, 4, rand), 6],
    ['tuft', (s, rand) => tuft(s, 3, 0, 4, rand), 9],
    ['flower', (s, rand) => flower(s, 3, 0, 4, rand), 1],
    ['stump', (s, rand) => stump(s, 3, 0, 4, rand), 1],
  ];
  for (const [name, plant, want] of expected) {
    const c = counter();
    plant(new Scatter(), c.rand);
    assert.equal(c.n(), want, `${name}:`);
  }
});

test('environment: a crowded patch is split, so no scenery mesh passes the 16-bit index limit', () => {
  const s = new Scatter();
  const c = counter();
  /* Far more than one patch's mesh can hold, all in one 26 m square. */
  for (let i = 0; i < 260; i += 1) {
    tallTree(s, 2 + (i % 20), 0, 2 + Math.floor(i / 20), 1, c.rand, i);
    cuteHouse(s, 5, 0, 5, { w: 6, d: 4.5, wall: '#ffd9a8', roof: '#c8452e', style: (i % 3) as 0 | 1 | 2, facing: 1 });
  }
  counts.length = 0;
  const chunks = s.build(fake);
  assert.ok(chunks.length > 2, `the patch was split into ${chunks.length} meshes`);
  for (const n of counts) {
    assert.ok(n <= 65535, `a mesh has ${n} vertices`);
  }
});

test('environment: decorations keep clear of buttons, colliders and paths', () => {
  const clear = clearOf({ door: [0, 0] }, [{ x: 10, z: 0, r: 1 }], (x) => Math.abs(x - 20));
  assert.ok(!clear(1, 0, 0.5), 'too near a button');
  assert.ok(!clear(10.5, 1, 0.5), 'on a collider');
  assert.ok(!clear(21, 0, 0.5), 'on a path');
  assert.ok(clear(5, 5, 0.5), 'in the open');
  assert.ok(clear(1.8, 1.2, 0.3, 1.5), 'a bench may sit a little nearer, when asked');
});
