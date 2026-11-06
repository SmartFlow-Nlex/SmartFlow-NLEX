#!/usr/bin/env node
/**
 * Runs Clean Air Shift's tests: compiles frontend/games/cleanAirShift/core and
 * tests with the repo's TypeScript (no extra test framework), then runs every
 * test registered through tests/harness.ts.
 *
 *   node scripts/test-clean-air-shift.js            all tests
 *   node scripts/test-clean-air-shift.js balance    only tests whose name contains "balance"
 *   node scripts/test-clean-air-shift.js --table    print the bots' results for every shift
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..', 'frontend', 'games', 'cleanAirShift');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'clean-air-tests-'));

function compileDir(dir) {
  for (const name of fs.readdirSync(path.join(root, dir))) {
    if (!name.endsWith('.ts')) {
      continue;
    }
    const source = fs.readFileSync(path.join(root, dir, name), 'utf8');
    const { outputText, diagnostics } = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
      fileName: name,
      reportDiagnostics: true,
    });
    if (diagnostics && diagnostics.length > 0) {
      for (const d of diagnostics) {
        console.error(`${dir}/${name}: ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`);
      }
      process.exit(1);
    }
    fs.mkdirSync(path.join(out, dir), { recursive: true });
    fs.writeFileSync(path.join(out, dir, name.replace(/\.ts$/, '.js')), outputText);
  }
}

compileDir('core');
compileDir('tests');

function table() {
  const { DAYS, dailyDay } = require(path.join(out, 'core', 'days.js'));
  const { SKILLS, playShift, botAct, newBotMemory } = require(path.join(out, 'core', 'bot.js'));
  const { startShift, startSim, budgetGone } = require(path.join(out, 'core', 'shift.js'));
  const { step, STEP_S, totalDuration } = require(path.join(out, 'core', 'sim.js'));
  const rows = [...DAYS, ...['2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07'].map(dailyDay)];
  const pct = (v) => `${(v * 100).toFixed(0)}%`.padStart(4);
  /* How busy a skill is, and how crowded the plaza gets for it. */
  const busy = (def, skill) => {
    const run = startShift(def);
    const sim = startSim(run, false);
    const memory = newBotMemory();
    while (!sim.done && !budgetGone(run, sim)) {
      if (skill) botAct(sim, skill, memory, STEP_S);
      step(sim, STEP_S);
    }
    return { line: sim.longestQueue, moves: sim.moves, t: sim.t, cars: sim.arrived };
  };
  console.log('shift            secs nomgr | need 1/2/3      | novice    | casual    | good      | expert    | idle ends at | line none/casual/good | moves casual/good');
  for (const def of rows) {
    const base = startShift(def).unmanaged;
    const cells = ['novice', 'casual', 'good', 'expert'].map((name) => {
      const r = playShift(def, SKILLS[name]);
      const share = 1 - r.used / r.unmanaged;
      return `${pct(share)} ${r.finished ? r.stars : 'X'}* `;
    });
    const idle = busy(def, null);
    const casual = busy(def, SKILLS.casual);
    const good = busy(def, SKILLS.good);
    console.log(`${def.id.padEnd(16)} ${String(totalDuration(def)).padStart(4)} ${base.total.toFixed(0).padStart(4)}kg | ${def.need.map((n) => pct(n)).join(' ')}  | ${cells.join(' | ')} | ${idle.t.toFixed(0).padStart(4)}s        | ${idle.line}/${casual.line}/${good.line}  | ${casual.moves}/${good.moves} of ${good.cars}`);
  }
}

(async () => {
  if (process.argv[2] === '--table') {
    table();
    fs.rmSync(out, { recursive: true, force: true });
    return;
  }
  const harness = require(path.join(out, 'tests', 'harness.js'));
  const files = fs.readdirSync(path.join(out, 'tests')).filter((f) => f.endsWith('.test.js')).sort();
  for (const file of files) {
    require(path.join(out, 'tests', file));
  }
  const started = Date.now();
  const { passed, failed } = await harness.runAll(process.argv[2]);
  console.log(`\n${passed} passed, ${failed} failed (${((Date.now() - started) / 1000).toFixed(1)} s)`);
  fs.rmSync(out, { recursive: true, force: true });
  process.exit(failed > 0 ? 1 : 0);
})();
