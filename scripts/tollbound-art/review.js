#!/usr/bin/env node
/**
 * A turntable contact sheet, for checking a character from every side before it ships:
 * front, both three-quarters, both sides and behind, all from the same model.
 * Nothing here goes in the game. REVIEW_BIG=1 draws it larger.
 *
 *   node scripts/tollbound-art/review.js out.png                 everyone
 *   node scripts/tollbound-art/review.js out.png navie bumbo     just these
 */
const os = require('os');
const fs = require('fs');
const path = require('path');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

const REPO = path.join(__dirname, '..', '..');
const YAWS = [180, 145, 215, 90, 270, 0];

if (!isMainThread) {
  const { render } = require('./render');
  const { polish, CHARACTER_LIGHT } = require('./scenes/polish');
  const { sculpt } = require('./scenes/sculpt');
  const { HEROES } = require('./scenes/heroes');
  const { SIDEKICKS } = require('./scenes/sidekicks');
  const models = new Map();
  const modelOf = (id) => {
    if (!models.has(id)) {
      const hero = HEROES[id];
      const made = hero ? sculpt(hero.sculpt.parts(), hero.sculpt) : sculpt(SIDEKICKS[id].frontParts ? SIDEKICKS[id].frontParts(false) : SIDEKICKS[id].make(false), SIDEKICKS[id].sculpt);
      models.set(id, polish(made.parts));
    }
    return models.get(id);
  };
  parentPort.on('message', ({ id, yaw, ppu, target, slot }) => {
    const img = render(modelOf(id), { yaw, pitch: 9, ppu, target }, { ...CHARACTER_LIGHT, ss: 2 });
    parentPort.postMessage({ slot, width: img.width, height: img.height, data: img.data });
  });
  void workerData;
  return;
}

const { PNG } = require(path.join(REPO, 'node_modules', 'pngjs'));
const { HEROES } = require('./scenes/heroes');
const { SIDEKICKS } = require('./scenes/sidekicks');

const [out, ...names] = process.argv.slice(2);
if (!out) {
  console.error('Usage: review.js out.png [names]');
  process.exit(1);
}
const everyone = [...Object.keys(HEROES), ...Object.keys(SIDEKICKS)];
const who = names.length > 0 ? names : everyone;
const BIG = process.env.REVIEW_BIG ? 1.7 : 1;
const CELL = Math.round(150 * BIG);
const LABEL = 0;
const queue = [];
who.forEach((id, row) => {
  const hero = HEROES[id] !== undefined;
  YAWS.forEach((yaw, col) => {
    queue.push({ id, yaw, ppu: (hero ? 26 : 44) * BIG, target: hero ? [0, 1.9, 0] : [0, 1.1, 0], slot: { row, col } });
  });
});
const sheet = new PNG({ width: CELL * YAWS.length, height: (CELL + LABEL) * who.length });
sheet.data.fill(255);
for (let i = 0; i < sheet.data.length; i += 4) {
  sheet.data[i] = 233;
  sheet.data[i + 1] = 223;
  sheet.data[i + 2] = 198;
}
const place = (m) => {
  const ox = m.slot.col * CELL + Math.floor((CELL - m.width) / 2);
  const oy = m.slot.row * (CELL + LABEL) + Math.floor((CELL - m.height) / 2);
  for (let y = 0; y < m.height; y += 1) {
    for (let x = 0; x < m.width; x += 1) {
      const sx = x + ox;
      const sy = y + oy;
      if (sx < 0 || sy < 0 || sx >= sheet.width || sy >= sheet.height) {
        continue;
      }
      const i = (y * m.width + x) * 4;
      const a = m.data[i + 3] / 255;
      const d = (sy * sheet.width + sx) * 4;
      for (let c = 0; c < 3; c += 1) {
        sheet.data[d + c] = m.data[i + c] * a + sheet.data[d + c] * (1 - a);
      }
    }
  }
};
let next = 0;
let done = 0;
const count = Math.max(1, Math.min(os.cpus().length - 2, 14));
for (let i = 0; i < count; i += 1) {
  const w = new Worker(__filename);
  const give = () => {
    if (next < queue.length) {
      w.postMessage(queue[next]);
      next += 1;
    } else {
      w.terminate();
    }
  };
  w.on('message', (m) => {
    place({ ...m, data: Buffer.from(m.data) });
    done += 1;
    if (done === queue.length) {
      fs.writeFileSync(out, PNG.sync.write(sheet));
      console.log(`${who.length} characters, ${YAWS.length} angles: ${out}`);
      process.exit(0);
    }
    give();
  });
  w.on('error', (e) => {
    console.error(e);
    process.exit(1);
  });
  give();
}
