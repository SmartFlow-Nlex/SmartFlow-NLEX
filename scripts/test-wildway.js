#!/usr/bin/env node
/**
 * Runs NLEX: Wildway Guardians tests: compiles frontend/games/wildway/core and tests with
 * the repo's TypeScript (no extra test framework), then runs every test registered
 * through tests/harness.ts.
 *
 *   node scripts/test-wildway.js            all tests
 *   node scripts/test-wildway.js emissions  only tests whose name contains "emissions"
 *   node scripts/test-wildway.js --plans    print every plan the Hornbill transport board can make
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..', 'frontend', 'games', 'wildway');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'wildway-tests-'));

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

function plans() {
  const { HORNBILL_TRANSPORT, allPlans, evaluatePlan } = require(path.join(out, 'core', 'transport.js'));
  const base = evaluatePlan(HORNBILL_TRANSPORT, HORNBILL_TRANSPORT.baseline);
  console.log(`baseline ${base.co2Kg.toFixed(2)} kg, feasible ${base.feasible}`);
  const rows = allPlans(HORNBILL_TRANSPORT).map((p) => ({ p, r: evaluatePlan(HORNBILL_TRANSPORT, p) }));
  rows.sort((a, b) => a.r.co2Kg - b.r.co2Kg);
  for (const { p, r } of rows) {
    console.log(`${r.feasible ? 'OK ' : 'no '} ${r.co2Kg.toFixed(2).padStart(6)} kg  ${(base.co2Kg - r.co2Kg).toFixed(2).padStart(6)} saved  ${p.fleetId.padEnd(13)} ${p.routeId.padEnd(9)} ${p.departureId.padEnd(6)} ${r.feasible ? '' : r.violations[0].text}`);
  }
}

(async () => {
  if (process.argv[2] === '--plans') {
    plans();
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
