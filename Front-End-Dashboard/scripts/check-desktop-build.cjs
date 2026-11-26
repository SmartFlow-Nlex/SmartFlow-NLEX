/*
 * Desktop build guard (21 Nov 2026, audit H12 / A8).
 *
 * The installer bakes NEXT_PUBLIC_BACKEND_URL into its pages at build time. A clean checkout used to build an app
 * that pointed at http://localhost:4000 (the tracked .env), because the Render address lived only in an untracked
 * .env.production. That app installs, opens, and then fails every data call on any other computer, which looks
 * like a backend outage. This guard makes that build fail instead, loudly, before anything ships.
 *
 *   node scripts/check-desktop-build.cjs env      before `next build`: the backend URL Next will bake in, resolved
 *                                                 the way `next build` resolves it (.env.production.local,
 *                                                 .env.local, .env.production, .env, with real environment
 *                                                 variables winning), must be an https address that is not this
 *                                                 computer or a private network, and the desktop app's CSP
 *                                                 (electron/csp.js) must allow it and the Supabase address.
 *   node scripts/check-desktop-build.cjs bundle   after `next build`: the same checks, and out/ must actually
 *                                                 contain that backend URL (a stale out/ built for localhost
 *                                                 does not).
 *
 * electron-builder also runs the bundle check by itself (package.json build.beforePack), so packaging straight
 * from an existing out/ with `npx electron-builder` is checked too.
 */
const fs = require('fs');
const path = require('path');

const PROJECT_DIR = path.resolve(__dirname, '..');

class BuildGuardError extends Error {}

function fail(lines) {
  throw new BuildGuardError(['', 'DESKTOP BUILD STOPPED (scripts/check-desktop-build.cjs):', ...lines.map((l) => `  ${l}`), ''].join('\n'));
}

/** process.env as `next build` will see it in this folder. */
function resolvedEnv(projectDir) {
  const { loadEnvConfig } = require(require.resolve('@next/env', { paths: [projectDir, __dirname] }));
  loadEnvConfig(projectDir, false, { info() {}, error: console.error });
  return process.env;
}

/** True for addresses a client PC cannot reach: this computer, a private LAN or link-local. */
function isLocalHost(hostname) {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h === '0.0.0.0' || h === '::' || h === '::1') return true;
  const v4 = /^(\d+)\.(\d+)\.\d+\.\d+$/.exec(h);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 127 || a === 10 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
  }
  // IPv6 unique-local (fc00::/7) and link-local (fe80::/10).
  return h.includes(':') && /^(f[cd][0-9a-f]{2}|fe[89ab][0-9a-f]):/.test(h);
}

function checkEnv(projectDir = PROJECT_DIR) {
  const env = resolvedEnv(projectDir);
  const { connectAllows, BACKEND_ORIGINS, SUPABASE_ORIGINS } = require(path.join(projectDir, 'electron', 'csp.js'));
  const backend = (env.NEXT_PUBLIC_BACKEND_URL || '').trim();
  const problems = [];

  let url = null;
  if (!backend) problems.push('NEXT_PUBLIC_BACKEND_URL is not set. Put the deployed API address in Front-End-Dashboard/.env.production.');
  else {
    try { url = new URL(backend); } catch { problems.push(`NEXT_PUBLIC_BACKEND_URL is not a valid URL: "${backend}".`); }
  }
  if (url) {
    if (isLocalHost(url.hostname)) {
      problems.push(`NEXT_PUBLIC_BACKEND_URL points at ${url.host}, which only exists on the computer that built the app.`,
        'The installed app would fail every data call. Set the deployed API (e.g. https://smartflow-nlex.onrender.com)',
        'in .env.production, and make sure .env.local / .env.production.local or a shell variable does not override it.');
    } else if (url.protocol !== 'https:') {
      problems.push(`NEXT_PUBLIC_BACKEND_URL must be https:, got "${backend}".`);
    } else if (!connectAllows(backend)) {
      problems.push(`The app's Content-Security-Policy does not allow ${url.origin}, so every data call would be blocked.`,
        `Add it to BACKEND_ORIGINS in electron/csp.js (now: ${BACKEND_ORIGINS.join(', ')}).`);
    }
  }

  const supabase = (env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  if (!supabase || !(env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim()) {
    problems.push('NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set (Front-End-Dashboard/.env); nobody could sign in.');
  } else if (!connectAllows(supabase)) {
    problems.push(`The app's Content-Security-Policy does not allow the Supabase address in NEXT_PUBLIC_SUPABASE_URL, so sign-in would be blocked.`,
      `Add its https:// and wss:// origins to SUPABASE_ORIGINS in electron/csp.js (now: ${SUPABASE_ORIGINS.join(', ')}).`);
  }
  if (problems.length) fail(problems);

  // Not fatal: the app still works, but its maps show "no token".
  const token = (env.NEXT_PUBLIC_MAPBOX_TOKEN || '').trim();
  if (!token.startsWith('pk.')) {
    console.warn('WARNING: NEXT_PUBLIC_MAPBOX_TOKEN is not a Mapbox public token (pk.…); the maps in this build will show "no token".'
      + ' It is kept out of git; put it in Front-End-Dashboard/.env.local before building.');
  }
  return backend;
}

function* scriptFiles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* scriptFiles(full);
    else if (entry.name.endsWith('.js')) yield full;
  }
}

function checkBundle(projectDir = PROJECT_DIR) {
  const backend = checkEnv(projectDir);
  const chunks = path.join(projectDir, 'out', '_next', 'static');
  if (!fs.existsSync(path.join(projectDir, 'out', 'index.html')) || !fs.existsSync(chunks)) {
    fail(['out/ has no built pages. Run `npm run dist` (it builds them first).']);
  }
  for (const file of scriptFiles(chunks)) {
    if (fs.readFileSync(file, 'utf8').includes(backend)) {
      console.log(`Desktop build check passed: out/ calls ${backend}.`);
      return backend;
    }
  }
  fail([`out/ was not built for ${backend}: no page script contains it, so the pages call another address`,
    '(most likely http://localhost:4000 from the tracked .env). Rebuild the pages with `npm run dist`.']);
}

/** electron-builder hook (package.json build.beforePack): refuse to package a bundle built for the wrong backend. */
async function beforePack(context) {
  checkBundle((context && context.packager && context.packager.projectDir) || PROJECT_DIR);
}

module.exports = { beforePack, checkEnv, checkBundle, isLocalHost };

if (require.main === module) {
  const mode = process.argv[2] || 'env';
  try {
    if (mode === 'env') console.log(`Desktop build check passed: the pages will call ${checkEnv()}.`);
    else if (mode === 'bundle') checkBundle();
    else { console.error('Usage: node scripts/check-desktop-build.cjs [env|bundle]'); process.exit(2); }
  } catch (error) {
    console.error(error instanceof BuildGuardError ? error.message : error);
    process.exit(1);
  }
}
