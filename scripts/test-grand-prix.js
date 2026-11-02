#!/usr/bin/env node
/**
 * Runs Navie Grand Prix tests: compiles frontend/games/grandPrix/core and
 * tests with the repo's TypeScript (no extra test framework), then runs every
 * test registered through tests/harness.ts.
 *
 *   node scripts/test-grand-prix.js            all tests
 *   node scripts/test-grand-prix.js reward     only tests whose name contains "reward"
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..', 'frontend', 'games', 'grandPrix');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'grand-prix-tests-'));

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

(async () => {
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
