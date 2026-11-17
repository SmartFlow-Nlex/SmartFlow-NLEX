import { newActor, pose, react, type Actor } from '../web/anim';
import type { MeshBuilder } from '../web/gl/builder';
import type { Renderer } from '../web/gl/renderer';
import { MAX_BONES } from '../web/gl/renderer';
import { makeAwit, makeBaging, makeChief, makeDayo, makeDriver, makeHornbill, makeOfficer, makeRanger, makeResident, makeSpecialist, makeSukat, makeVet, type Character, type HeroId } from '../web/models';
import { assert, test } from './harness';

/** Builds the meshes without a GPU: the "mesh" keeps the builder's vertex data to inspect. */
const built: { verts: number[]; count: number }[] = [];
const fake = {
  mesh: (b: MeshBuilder) => {
    built.push({ verts: b.verts, count: b.vertexCount });
    return { count: b.indices.length };
  },
} as unknown as Renderer;

const STRIDE = 11;
const BONE = 9;

const cast = (): { name: string; kind: HeroId | 'person'; make: () => Character }[] => [
  { name: 'Dayo', kind: 'dayo', make: () => makeDayo(fake) },
  { name: 'Baging', kind: 'baging', make: () => makeBaging(fake) },
  { name: 'Sukat', kind: 'sukat', make: () => makeSukat(fake) },
  { name: 'Awit', kind: 'awit', make: () => makeAwit(fake) },
  { name: 'ranger', kind: 'person', make: () => makeRanger(fake) },
  { name: 'vet', kind: 'person', make: () => makeVet(fake) },
  { name: 'officer', kind: 'person', make: () => makeOfficer(fake) },
  { name: 'specialist', kind: 'person', make: () => makeSpecialist(fake) },
  { name: 'chief', kind: 'person', make: () => makeChief(fake) },
  { name: 'driver', kind: 'person', make: () => makeDriver(fake, '#e2452f') },
  { name: 'tech', kind: 'person', make: () => makeDriver(fake, '#14995c') },
  { name: 'Ate Joy', kind: 'person', make: () => makeResident(fake, '#ef6c8f', '#3a4a7a') },
  { name: 'Mang Ernesto', kind: 'person', make: () => makeResident(fake, '#f0a24a', '#4a5a3a', '#a06a42') },
];

/** A bone's scale on one axis, after posing. */
const scaleOf = (a: Actor, bone: number, axis = 1): number => a.ch.rig.scale[bone * 3 + axis];

test('characters: every vertex follows a real bone, within the renderer’s limit and 16-bit indices', () => {
  for (const c of cast()) {
    built.length = 0;
    const ch = c.make();
    const bones = ch.rig.rot.length / 3;
    assert.ok(bones <= MAX_BONES, `${c.name} has ${bones} bones`);
    const mesh = built[0];
    assert.ok(mesh.count < 65000, `${c.name} has ${mesh.count} vertices`);
    for (let i = 0; i < mesh.count; i += 1) {
      const b = mesh.verts[i * STRIDE + BONE];
      assert.ok(b >= 0 && b < bones, `${c.name}: a vertex follows bone ${b} of ${bones}`);
    }
  }
  built.length = 0;
  const bird = makeHornbill(fake);
  assert.equal(bird.rig.rot.length / 3, 7, 'the hornbill has its eye bone');
});

test('characters: every face has its parts, and a crate sits above the head', () => {
  for (const c of cast()) {
    built.length = 0;
    const ch = c.make();
    assert.ok(ch.face !== undefined, `${c.name} has a face`);
    if (c.kind === 'person') {
      assert.ok((ch.carryTop ?? 0) >= 1.4, `${c.name} carries above the head`);
      continue;
    }
    /* A hero's crate rests on its very top (a big head grows from the neck). Awit's kite is built full size but
       rides folded small on her back; Baging's floppy cap tip folds back out of the way. */
    const mesh = built[0];
    const neck = 0.86;
    const grow = ch.headScale ?? 1;
    let top = 0;
    for (let i = 0; i < mesh.count; i += 1) {
      const bone = mesh.verts[i * STRIDE + BONE];
      if (c.kind === 'dayo' && bone === 15) {
        continue;
      }
      if (c.kind === 'awit' && bone === 7) {
        continue;
      }
      if (c.kind === 'baging' && bone === 13) {
        continue;
      }
      const y = mesh.verts[i * STRIDE + 1];
      top = Math.max(top, y > neck ? neck + (y - neck) * grow : y);
    }
    assert.ok((ch.carryTop ?? 0) >= top - 0.06, `${c.name} carries at ${ch.carryTop}, its top is ${top.toFixed(2)}`);
    assert.ok((ch.carryTop ?? 0) <= top + 0.35, `${c.name}'s crate does not float: ${ch.carryTop} over a top of ${top.toFixed(2)}`);
  }
});

test('faces: neutral shows open eyes and a small smile; happy closes the eyes and opens the mouth', () => {
  for (const c of cast()) {
    const a = newActor(c.kind, c.make(), 0, 0, 0);
    const f = a.ch.face;
    if (f === undefined) {
      continue;
    }
    /* A calm moment: no blink, no fidget (the moment portraits use). */
    a.t = 1;
    a.seed = 0.2;
    pose(a);
    assert.ok(scaleOf(a, f.eyes) > 0.9, `${c.name}: eyes open`);
    assert.ok(scaleOf(a, f.happy) < 0.01, `${c.name}: happy eyes hidden`);
    assert.ok(scaleOf(a, f.smile) > 0.9, `${c.name}: smiling`);
    assert.ok(scaleOf(a, f.open) < 0.01, `${c.name}: mouth closed`);
    react(a, 'happy', 2);
    pose(a);
    assert.ok(scaleOf(a, f.eyes) < 0.01 && scaleOf(a, f.happy) > 0.9, `${c.name}: happy eyes`);
    if (a.ch.grin === true) {
      /* Navie's grin is already open, so it grows instead. */
      assert.ok(scaleOf(a, f.smile) > 1.15 && scaleOf(a, f.open) < 0.01, `${c.name}: a bigger grin`);
    } else {
      assert.ok(scaleOf(a, f.open) > 0.5 && scaleOf(a, f.smile) < 0.01, `${c.name}: open smile`);
    }
    react(a, 'surprised', 2);
    pose(a);
    assert.ok(scaleOf(a, f.eyes) > 1.05, `${c.name}: surprised eyes are wide`);
    react(a, 'worried', 2);
    pose(a);
    assert.ok(Math.abs(a.ch.rig.rot[f.browL * 3 + 2]) > 0.2, `${c.name}: worried brows tilt`);
    a.exprT = 0;
    pose(a);
    assert.ok(scaleOf(a, f.smile) > 0.9, `${c.name}: the feeling wears off`);
  }
});

test('faces: everyone blinks every few seconds, and no two blink in step', () => {
  for (const c of cast()) {
    const a = newActor(c.kind, c.make(), 0, 0, 0);
    const f = a.ch.face;
    if (f === undefined) {
      continue;
    }
    a.seed = 0.4;
    let closed = 0;
    for (let t = 0; t < 10; t += 1 / 60) {
      a.t = t;
      pose(a);
      if (scaleOf(a, f.eyes) < 0.5) {
        closed += 1 / 60;
      }
    }
    assert.ok(closed > 0.05 && closed < 0.6, `${c.name}: eyes shut for ${closed.toFixed(2)} s in 10 s`);
  }
  const a = newActor('dayo', makeDayo(fake), 0, 0, 0);
  const b = newActor('dayo', makeDayo(fake), 0, 0, 0);
  a.seed = 0.1;
  b.seed = 0.7;
  let together = 0;
  for (let t = 0; t < 20; t += 1 / 60) {
    a.t = t;
    b.t = t;
    pose(a);
    pose(b);
    if (scaleOf(a, 9) < 0.5 && scaleOf(b, 9) < 0.5) {
      together += 1;
    }
  }
  assert.ok(together < 10, 'two people rarely blink together');
});
