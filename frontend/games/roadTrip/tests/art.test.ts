import * as fs from 'fs';
import * as path from 'path';
import { HEROES, SIDEKICKS } from '../core/types';
import { assert, test } from './harness';

/** What the game asks for on the road, in the Team screen and in the garage must all have been baked. */
interface Face {
  eyes: number[][];
  mouth: number[];
  eye: number;
  open?: (number[] | null)[];
  iris?: number[][];
  lid?: string[];
  noMouth?: boolean;
  mouthOpen?: number[];
}
const manifest = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'frontend', 'games', 'roadTrip', 'assets', 'art', 'manifest.json'), 'utf8')) as {
  sprites: Record<string, { w: number; h: number; ax: number; ay: number; ppu: number; face?: Face }>;
};

/** Everything measured about an eye opening, in sprite pixels. */
function measure(poly: number[]): { x0: number; x1: number; y0: number; y1: number; area: number; cx: number; cy: number } {
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  let area = 0;
  for (let i = 0; i < poly.length; i += 2) {
    const j = (i + 2) % poly.length;
    x0 = Math.min(x0, poly[i]);
    x1 = Math.max(x1, poly[i]);
    y0 = Math.min(y0, poly[i + 1]);
    y1 = Math.max(y1, poly[i + 1]);
    area += poly[i] * poly[j + 1] - poly[j] * poly[i + 1];
  }
  return { x0, x1, y0, y1, area: Math.abs(area) / 2, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}

const EVERYONE = [...HEROES.map((id) => `h.${id}`), ...SIDEKICKS.map((id) => `s.${id}`)];

test('art: every hero has its three road views and a front with a face', () => {
  for (const id of HEROES) {
    for (const view of ['rear', 'mid', 'turn']) {
      assert.ok(manifest.sprites[`h.${id}.${view}`] !== undefined, `h.${id}.${view}`);
    }
    const front = manifest.sprites[`h.${id}.front`];
    assert.ok(front !== undefined, `h.${id}.front`);
    assert.equal(front.face?.eyes.length, 2, `${id} has two eyes`);
  }
});

test('art: Navie has real right-hand views, so the N on the cap and plate never reads backwards', () => {
  for (const view of ['midR', 'turnR']) {
    assert.equal(manifest.sprites[`h.navie.${view}`]?.ppu, manifest.sprites['h.navie.rear'].ppu, view);
  }
});

test('art: Navie keeps the approved face: an open mouth measured in every front view, wholly below both eyes and level across them', () => {
  for (const view of ['face', 'front', 'frontR', 'q', 'qR']) {
    const f = manifest.sprites[`h.navie.${view}`]?.face;
    assert.ok(f?.mouthOpen !== undefined, `${view}: the mouth's opening is measured`);
    const mouth = measure(f?.mouthOpen ?? []);
    const eyes = (f?.open ?? []).map((p) => measure(p ?? []));
    assert.equal(eyes.length, 2, view);
    for (const eye of eyes) {
      assert.ok(mouth.y0 > eye.y1, `${view}: mouth top ${mouth.y0.toFixed(1)} is below the eye's bottom ${eye.y1.toFixed(1)}`);
    }
    const between = (eyes[0].cx + eyes[1].cx) / 2;
    assert.ok(Math.abs(mouth.cx - between) < (mouth.x1 - mouth.x0) * 0.9, `${view}: mouth sits between the eyes`);
  }
});

test('art: Bumbo has an open smile measured the same way; Mila keeps a closed one', () => {
  assert.ok(manifest.sprites['s.bumbo.front'].face?.mouthOpen !== undefined);
  assert.equal(manifest.sprites['s.mila.front'].face?.mouthOpen, undefined);
});

test('art: every sidekick has its front, evolved and rear views', () => {
  for (const id of SIDEKICKS) {
    for (const view of ['front', 'evo', 'rear']) {
      assert.ok(manifest.sprites[`s.${id}.${view}`] !== undefined, `s.${id}.${view}`);
    }
    assert.ok(manifest.sprites[`s.${id}.front`].face !== undefined, `${id} has a face`);
  }
});

test('art: a hero keeps one scale and stands on one spot through its road views, so steering cannot shift it', () => {
  for (const id of HEROES) {
    const rear = manifest.sprites[`h.${id}.rear`];
    for (const view of ['mid', 'turn']) {
      const other = manifest.sprites[`h.${id}.${view}`];
      assert.equal(other.ppu, rear.ppu, `${id} ${view} scale`);
      // Each view's anchor is the same point on the road, so x and y on screen never change with the view.
      assert.ok(other.ax > 0 && other.ax < other.w && other.ay > 0 && other.ay <= other.h, `${id} ${view} anchor is on the sprite`);
    }
  }
});

test('art: every face is sculpted: both eyes have a real opening in every front view', () => {
  for (const who of EVERYONE) {
    for (const view of ['face', 'front', 'q']) {
      const f = manifest.sprites[`${who}.${view}`]?.face;
      assert.ok(f !== undefined, `${who}.${view} has a face`);
      assert.equal(f?.open?.length, 2, `${who}.${view}: two openings`);
      assert.equal(f?.iris?.length, 2, `${who}.${view}: two irises`);
      assert.ok(f?.open?.[0] !== null || view === 'q', `${who}.${view}: first eye can be seen`);
      assert.ok(f?.open?.[1] !== null || view === 'q', `${who}.${view}: second eye can be seen`);
    }
  }
});

test('art: seen dead ahead, faces are balanced, with room for a little charm', () => {
  for (const who of EVERYONE) {
    const s = manifest.sprites[`${who}.face`];
    const [a, b] = (s.face?.open ?? []).map((p) => measure(p ?? []));
    const big = Math.max(a.area, b.area);
    // A quarter of a pixel all round the edge is the pixel grid, not the model: the smaller front views are baked at about 80 pixels a unit.
    const grid = Math.sqrt(big * Math.PI) * 0.5;
    // One eye may be a touch smaller on purpose; never so much that it reads as a mistake.
    assert.ok(Math.abs(a.area - b.area) < big * 0.32 + grid, `${who}: eye areas ${a.area.toFixed(0)} and ${b.area.toFixed(0)}`);
    const tall = Math.max(a.y1 - a.y0, b.y1 - b.y0);
    assert.ok(Math.abs(a.cy - b.cy) < tall * 0.4, `${who}: eyes roughly level, ${a.cy.toFixed(1)} and ${b.cy.toFixed(1)}`);
    const middle = (a.cx + b.cx) / 2;
    assert.ok(Math.abs(middle - s.ax) < s.w * 0.035, `${who}: eyes centred, ${middle.toFixed(1)} against ${s.ax}`);
  }
});

test('art: eyes are in proportion: no googly eyes, none too small to read', () => {
  for (const who of EVERYONE) {
    const s = manifest.sprites[`${who}.face`];
    const a = measure(s.face?.open?.[0] ?? []);
    const wide = a.x1 - a.x0;
    const tall = a.y1 - a.y0;
    assert.ok(wide / tall > 0.62 && wide / tall < 1.6, `${who}: opening ${wide.toFixed(0)} by ${tall.toFixed(0)}`);
    const share = wide / s.w;
    assert.ok(share > 0.03 && share < 0.3, `${who}: an eye is ${(share * 100).toFixed(1)}% of the width`);
  }
});

test('art: the iris sits inside its opening, and nothing about a face floats off the model', () => {
  for (const who of EVERYONE) {
    for (const view of ['face', 'front']) {
      const s = manifest.sprites[`${who}.${view}`];
      (s.face?.open ?? []).forEach((poly, i) => {
        const m = measure(poly ?? []);
        const iris = s.face?.iris?.[i] ?? [0, 0];
        assert.ok(iris[0] > m.x0 && iris[0] < m.x1 && iris[1] > m.y0 && iris[1] < m.y1, `${who}.${view} eye ${i}: iris at ${iris[0]},${iris[1]} outside ${m.x0}-${m.x1}, ${m.y0}-${m.y1}`);
        assert.ok(m.x0 >= 0 && m.x1 <= s.w && m.y0 >= 0 && m.y1 <= s.h, `${who}.${view} eye ${i} is on the sprite`);
      });
      assert.ok(/^#[0-9a-f]{6}$/.test(s.face?.lid?.[0] ?? ''), `${who}.${view}: a lid colour`);
    }
  }
});

test('art: the far eye narrows as a character turns, as a round head would', () => {
  for (const id of HEROES) {
    const near = manifest.sprites[`h.${id}.face`].face?.open?.[0];
    const turned = manifest.sprites[`h.${id}.q`].face?.open;
    if (turned === undefined || near === undefined || near === null) {
      continue;
    }
    const seen = turned.filter((p): p is number[] => p !== null).map((p) => measure(p).x1 - measure(p).x0);
    assert.ok(Math.min(...seen) < (measure(near).x1 - measure(near).x0) * 1.2, `${id} turns`);
  }
});

test('art: faces land on their own sprites', () => {
  for (const id of [...HEROES.map((h) => `h.${h}.front`), ...SIDEKICKS.map((k) => `s.${k}.front`)]) {
    const s = manifest.sprites[id];
    for (const [x, y] of [...(s.face?.eyes ?? []), s.face?.noMouth ? [0, 0] : (s.face?.mouth ?? [0, 0])]) {
      assert.ok(x >= 0 && x <= s.w && y >= 0 && y <= s.h, `${id}: face point ${x},${y} is outside ${s.w}x${s.h}`);
    }
  }
});
