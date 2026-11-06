#!/usr/bin/env node
/**
 * Bakes every Tollbound Heroes model into a sprite.
 *
 *   node scripts/tollbound-art/bake.js                 everything (unchanged sprites come from the cache)
 *   node scripts/tollbound-art/bake.js h.navie s.pip   only names starting with these
 *   node scripts/tollbound-art/bake.js --sheet out.png also lay the results out on one contact sheet (needs no filter)
 *
 * Pipeline: scenes/index.js lists the jobs; worker threads ray-march each to a
 * PNG in .cache/ (keyed by a hash of its parts and camera, so only what changed
 * is drawn again); headless Chrome encodes them to WebP; assets/art/ receives the
 * files and manifest.json describes each sprite: size, ground anchor, pixels per
 * model unit and, for faces, where the eyes and mouth landed. scripts/build-road-trip.js
 * inlines the lot into the game's page.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const { spawn } = require('child_process');

const HERE = __dirname;
const REPO = path.join(HERE, '..', '..');
const CACHE = path.join(HERE, '.cache');
const OUT = path.join(REPO, 'frontend', 'games', 'roadTrip', 'assets', 'art');

function jobHash(job) {
  const parts = JSON.stringify(job.parts());
  return crypto.createHash('sha1').update(`v5|${parts}|${JSON.stringify(job.view)}|${JSON.stringify(job.options || {})}|${JSON.stringify(job.face || null)}|${JSON.stringify(job.anchor || null)}|${JSON.stringify(job.points || null)}`).digest('hex').slice(0, 16);
}

if (!isMainThread) {
  const { PNG } = require(path.join(REPO, 'node_modules', 'pngjs'));
  const { render } = require('./render');
  const { jobs } = require('./scenes');
  const byName = new Map(jobs().map((j) => [j.name, j]));
  parentPort.on('message', ({ name, hash }) => {
    const job = byName.get(name);
    const balls = job.face && job.face.balls ? job.face.balls : [];
    const mouthGroup = job.face && job.face.mouthGroup;
    const img = render(job.parts(), job.view, { ...(job.options || {}), track: [...balls.map((b) => b.g), ...(mouthGroup ? [mouthGroup] : [])] });
    const png = new PNG({ width: img.width, height: img.height });
    img.data.copy(png.data);
    fs.writeFileSync(path.join(CACHE, `${hash}.png`), PNG.sync.write(png, { colorType: 6 }));
    const anchor = img.project(job.anchor || [0, 0, 0]);
    const meta = { w: img.width, h: img.height, ax: round(anchor[0]), ay: round(anchor[1]), ppu: job.view.ppu };
    if (job.face) {
      const px = (p) => img.project(p).map(round);
      meta.face = { eyes: job.face.eyes.map(px), mouth: px(job.face.mouth), eye: round(job.face.eye * job.view.ppu), turn: job.face.turn === undefined ? 1 : job.face.turn };
      if (balls.length > 0) {
        // The sculpted face: where each lid opening fell in this view, where the iris sits, and the skin colour for closing the lids.
        const { right, up, back } = img.axes;
        const dotp = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
        meta.face.open = balls.map((b) => (img.outlines[b.g] ? img.outlines[b.g].poly : null));
        meta.face.lid = balls.map((b) => (img.outlines[b.g] ? img.outlines[b.g].skin : '#cccccc'));
        meta.face.iris = balls.map((b) => {
          // Eyes look most of the way toward whoever is watching, whichever way the body is turned.
          const g = [b.gaze[0] * 0.42 + back[0] * 0.58, b.gaze[1] * 0.42 + back[1] * 0.58, b.gaze[2] * 0.42 + back[2] * 0.58];
          const l = Math.hypot(g[0], g[1], g[2]) || 1;
          const dir = [g[0] / l, g[1] / l, g[2] / l];
          const at = px([b.c[0] + dir[0] * b.r, b.c[1] + dir[1] * b.r, b.c[2] + dir[2] * b.r]);
          const across = Math.sqrt(Math.max(0.1, 1 - dotp(dir, right) ** 2));
          const down = Math.sqrt(Math.max(0.1, 1 - dotp(dir, up) ** 2));
          return [at[0], at[1], round(across), round(down)];
        });
        meta.face.mouthW = round((job.face.mouthW || 0) * job.view.ppu);
        if (mouthGroup && img.outlines[mouthGroup]) {
          meta.face.mouthOpen = img.outlines[mouthGroup].poly;
          meta.face.mouthLid = img.outlines[mouthGroup].skin;
        }
      }
    }
    if (job.points) {
      meta.points = Object.fromEntries(Object.entries(job.points).map(([k, p]) => [k, img.project(p).map(round)]));
    }
    fs.writeFileSync(path.join(CACHE, `${hash}.json`), JSON.stringify(meta));
    parentPort.postMessage({ name });
  });
  void workerData;
  return;
}

function round(v) {
  return Math.round(v * 10) / 10;
}

function runWorkers(todo) {
  const count = Math.max(1, Math.min(os.cpus().length - 2, 14));
  return new Promise((resolve, reject) => {
    if (todo.length === 0) {
      resolve();
      return;
    }
    let next = 0;
    let done = 0;
    const workers = [];
    const give = (w) => {
      if (next < todo.length) {
        w.postMessage(todo[next]);
        next += 1;
      }
    };
    for (let i = 0; i < Math.min(count, todo.length); i += 1) {
      const w = new Worker(__filename, { workerData: {} });
      workers.push(w);
      w.on('message', () => {
        done += 1;
        if (done % 10 === 0 || done === todo.length) {
          console.log(`  drawn ${done}/${todo.length}`);
        }
        if (done === todo.length) {
          workers.forEach((x) => x.terminate());
          resolve();
        } else {
          give(w);
        }
      });
      w.on('error', reject);
      give(w);
    }
  });
}

// -- WebP through headless Chrome ---------------------------------------------------

function findChrome() {
  const candidates = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
  return candidates.find((c) => c && fs.existsSync(c));
}

async function encodeWebp(items) {
  const chrome = findChrome();
  if (!chrome) {
    throw new Error('Chrome not found: set CHROME_PATH (it encodes the WebP files).');
  }
  const port = 9555;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-art-'));
  const proc = spawn(chrome, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
  try {
    let target = null;
    for (let i = 0; i < 50 && target === null; i += 1) {
      try {
        const r = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' });
        target = await r.json();
      } catch {
        await new Promise((res) => setTimeout(res, 200));
      }
    }
    if (target === null) {
      throw new Error('Chrome did not start');
    }
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      ws.addEventListener('open', res);
      ws.addEventListener('error', rej);
    });
    let id = 0;
    const pending = new Map();
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) {
        pending.get(m.id)(m);
        pending.delete(m.id);
      }
    });
    const call = (method, params) =>
      new Promise((res) => {
        id += 1;
        pending.set(id, res);
        ws.send(JSON.stringify({ id, method, params }));
      });
    await call('Runtime.enable', {});
    let written = 0;
    for (const item of items) {
      const png = fs.readFileSync(item.png).toString('base64');
      const expr = `new Promise((res, rej) => { const i = new Image(); i.onload = () => { const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; c.getContext('2d').drawImage(i, 0, 0); res(c.toDataURL('image/webp', ${item.quality})); }; i.onerror = rej; i.src = 'data:image/png;base64,${png}'; })`;
      const r = await call('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      const url = r.result && r.result.result && r.result.result.value;
      if (typeof url !== 'string' || !url.startsWith('data:image/webp')) {
        throw new Error(`WebP encoding failed for ${item.png}: ${JSON.stringify(r).slice(0, 300)}`);
      }
      fs.writeFileSync(item.out, Buffer.from(url.split(',')[1], 'base64'));
      written += 1;
    }
    ws.close();
    return written;
  } finally {
    proc.kill();
    setTimeout(() => {
      try {
        fs.rmSync(profile, { recursive: true, force: true });
      } catch {
        // Chrome may still be letting go of the folder; it lives in the temp directory.
      }
    }, 1500);
  }
}

// -- contact sheet --------------------------------------------------------------------

function contactSheet(entries, file, cell = 150, cols = 12) {
  const { PNG } = require(path.join(REPO, 'node_modules', 'pngjs'));
  const rows = Math.ceil(entries.length / cols);
  const sheet = new PNG({ width: cols * cell, height: rows * cell });
  sheet.data.fill(0);
  for (let i = 0; i < sheet.data.length; i += 4) {
    sheet.data[i] = 214;
    sheet.data[i + 1] = 222;
    sheet.data[i + 2] = 205;
    sheet.data[i + 3] = 255;
  }
  entries.forEach((e, i) => {
    const src = PNG.sync.read(fs.readFileSync(e.png));
    const scale = Math.min(1, (cell - 8) / Math.max(src.width, src.height));
    const dw = Math.max(1, Math.floor(src.width * scale));
    const dh = Math.max(1, Math.floor(src.height * scale));
    const ox = (i % cols) * cell + Math.floor((cell - dw) / 2);
    const oy = Math.floor(i / cols) * cell + Math.floor((cell - dh) / 2);
    for (let y = 0; y < dh; y += 1) {
      for (let x = 0; x < dw; x += 1) {
        const sx = Math.min(src.width - 1, Math.floor(x / scale));
        const sy = Math.min(src.height - 1, Math.floor(y / scale));
        const si = (sy * src.width + sx) * 4;
        const di = ((oy + y) * sheet.width + ox + x) * 4;
        const a = src.data[si + 3] / 255;
        for (let c = 0; c < 3; c += 1) {
          sheet.data[di + c] = src.data[si + c] * a + sheet.data[di + c] * (1 - a);
        }
      }
    }
  });
  fs.writeFileSync(file, PNG.sync.write(sheet));
}

// -- main ---------------------------------------------------------------------------------

async function main() {
  const { jobs } = require('./scenes');
  const args = process.argv.slice(2);
  const sheetAt = args.indexOf('--sheet');
  const sheetFile = sheetAt >= 0 ? args[sheetAt + 1] : null;
  const filters = args.filter((a, i) => !a.startsWith('--') && (sheetAt < 0 || i !== sheetAt + 1));
  fs.mkdirSync(CACHE, { recursive: true });
  fs.mkdirSync(OUT, { recursive: true });
  const all = jobs();
  const names = new Set();
  for (const j of all) {
    if (names.has(j.name)) {
      throw new Error(`Two sprites are called ${j.name}`);
    }
    names.add(j.name);
  }
  const chosen = filters.length === 0 ? all : all.filter((j) => filters.some((f) => j.name.startsWith(f)));
  const hashes = new Map(chosen.map((j) => [j.name, jobHash(j)]));
  const todo = chosen.filter((j) => !fs.existsSync(path.join(CACHE, `${hashes.get(j.name)}.png`))).map((j) => ({ name: j.name, hash: hashes.get(j.name) }));
  const t0 = Date.now();
  console.log(`${chosen.length} sprites, ${todo.length} to draw`);
  await runWorkers(todo);
  console.log(`Drawn in ${((Date.now() - t0) / 1000).toFixed(1)} s`);

  const fileOf = (name) => path.join(OUT, `${name}.webp`);
  const manifestFile = path.join(OUT, 'manifest.json');
  const previous = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, 'utf8')) : { sprites: {} };
  const encode = chosen
    .filter((j) => {
      const known = previous.sprites[j.name];
      return !known || known.hash !== hashes.get(j.name) || !fs.existsSync(fileOf(j.name));
    })
    .map((j) => ({ png: path.join(CACHE, `${hashes.get(j.name)}.png`), out: fileOf(j.name), quality: j.quality || 0.86 }));
  if (encode.length > 0) {
    console.log(`Encoding ${encode.length} WebP files...`);
    await encodeWebp(encode);
  }

  const sprites = filters.length === 0 ? {} : { ...previous.sprites };
  for (const j of chosen) {
    const meta = JSON.parse(fs.readFileSync(path.join(CACHE, `${hashes.get(j.name)}.json`), 'utf8'));
    sprites[j.name] = { ...meta, hash: hashes.get(j.name), ...(j.meta || {}), bytes: fs.statSync(fileOf(j.name)).size };
  }
  if (filters.length === 0) {
    // Whatever no longer has a job goes.
    for (const f of fs.readdirSync(OUT)) {
      if (f.endsWith('.webp') && !sprites[f.slice(0, -5)]) {
        fs.unlinkSync(path.join(OUT, f));
      }
    }
  }
  fs.writeFileSync(manifestFile, `${JSON.stringify({ sprites }, null, 0).replace(/\},"/g, '},\n"')}\n`);
  const total = Object.values(sprites).reduce((s, m) => s + m.bytes, 0);
  console.log(`${Object.keys(sprites).length} sprites in the manifest, ${(total / 1024).toFixed(0)} KB of WebP`);
  if (sheetFile) {
    contactSheet(chosen.map((j) => ({ png: path.join(CACHE, `${hashes.get(j.name)}.png`) })), sheetFile);
    console.log(`Contact sheet: ${sheetFile}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
