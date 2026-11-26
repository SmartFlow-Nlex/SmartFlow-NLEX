/*
 * The Content-Security-Policy for the desktop app's pages (21 Nov 2026, audit A7 / S18).
 *
 * The pages are served by electron/main.js through app://smartflow, so the policy goes on those responses as a
 * header. A static export has no server of its own to send one, so before this the pages had none, and any script
 * injected into a page (S16: a Waze field written into a map popup) could read the sign-in session and the
 * device pass in local storage and send them anywhere.
 *
 * This file is plain data plus two small functions, with no Electron import, so the build guard
 * (scripts/check-desktop-build.cjs) can load it too and refuse to build an installer whose backend or Supabase
 * address is missing from connect-src: the app would install and then fail every data call.
 *
 * Where each source comes from (checked against the code and the built bundle, 21 Nov 2026):
 *   'self'                    app://smartflow itself: the pages, _next scripts and styles, the self-hosted Inter
 *                             and Saira fonts, public/ images, the police-warning video, and the .txt route data
 *                             Next fetches on client-side navigation.
 *   inline script hashes      The static export puts inline scripts in every page: the theme and effects start-up
 *                             scripts (app/layout.tsx) and Next's page data (self.__next_f.push). They differ per
 *                             page, so main.js hashes the ones in each page it serves instead of allowing
 *                             'unsafe-inline'. With hashes present, injected inline scripts and on*= handlers stay
 *                             blocked.
 *   'wasm-unsafe-eval'        mapbox-gl 3 compiles WebAssembly decoders (Draco, meshopt, building-gen) that it
 *                             fetches from api.mapbox.com. This allows WebAssembly only, not JavaScript eval.
 *   style 'unsafe-inline'     React writes style="" attributes into the exported HTML and the map and chart
 *                             libraries set inline styles; blocking them would unstyle the pages.
 *   data: / blob:             Mapbox builds its worker from a blob: URL (worker-src), its logo and markers are
 *                             data: images, tiles and three.js textures use blob:/data: images, and the audit-log
 *                             and sandbox exports download a blob: file.
 *   BACKEND_ORIGINS           The deployed API (NEXT_PUBLIC_BACKEND_URL in .env.production).
 *   SUPABASE_ORIGINS          Supabase Auth (NEXT_PUBLIC_SUPABASE_URL in .env); wss: in case supabase-js ever
 *                             opens its realtime socket (no page subscribes to a channel today).
 *   MAP_ORIGINS               The light map style mapbox://styles/mapbox/light-v11 (api.mapbox.com: style,
 *                             tiles, sprites, glyphs, wasm; *.tiles.mapbox.com: older tile hosts;
 *                             events.mapbox.com: Mapbox's required usage ping) and the dark CARTO style
 *                             (basemaps.cartocdn.com style.json; tiles.basemaps.cartocdn.com tiles, sprite, glyphs).
 *   frame-src / object-src    'none': the app embeds no frames or plugins.
 *
 * Changing the backend or the Supabase project: update the lists below as well as the .env file. The build
 * guard fails, and says so, until both agree.
 */
const crypto = require('crypto');

const BACKEND_ORIGINS = ['https://smartflow-nlex.onrender.com'];
const SUPABASE_ORIGINS = ['https://qjbnilmopummgivymdiq.supabase.co', 'wss://qjbnilmopummgivymdiq.supabase.co'];
const MAP_ORIGINS = [
  'https://api.mapbox.com', 'https://events.mapbox.com', 'https://*.tiles.mapbox.com',
  'https://basemaps.cartocdn.com', 'https://*.basemaps.cartocdn.com',
];
const MAP_IMAGE_ORIGINS = ['https://api.mapbox.com', 'https://*.tiles.mapbox.com',
  'https://basemaps.cartocdn.com', 'https://*.basemaps.cartocdn.com'];

const CONNECT_SRC = ["'self'", 'data:', 'blob:', ...BACKEND_ORIGINS, ...SUPABASE_ORIGINS, ...MAP_ORIGINS];

/** The policy, with any inline-script hashes of the page it is sent with. */
function buildCsp(scriptHashes = []) {
  return [
    "default-src 'self'",
    ["script-src 'self' 'wasm-unsafe-eval'", ...scriptHashes].join(' '),
    "style-src 'self' 'unsafe-inline'",
    ['img-src', "'self'", 'data:', 'blob:', ...MAP_IMAGE_ORIGINS].join(' '),
    "font-src 'self' data:",
    ['connect-src', ...CONNECT_SRC].join(' '),
    "worker-src 'self' blob:",
    "child-src 'self' blob:",
    "media-src 'self' data: blob:",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

// A script element with no src attribute; its text is what the browser hashes. Next's page data escapes "</" inside
// its strings, so the first </script> always ends the element.
const INLINE_SCRIPT = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;

/** 'sha256-...' sources for every inline script in an HTML page. */
function inlineScriptHashes(html) {
  const hashes = new Set();
  for (const m of html.matchAll(INLINE_SCRIPT)) {
    if (/\bsrc\s*=/i.test(m[1]) || !m[2]) continue;
    // The HTML parser turns CR LF and lone CR into LF before the script text exists; hash what the browser hashes.
    const text = m[2].replace(/\r\n?/g, '\n');
    hashes.add(`'sha256-${crypto.createHash('sha256').update(text, 'utf8').digest('base64')}'`);
  }
  return [...hashes];
}

/** Whether a URL's origin is allowed by connect-src (exact origin, or a "*." host wildcard). */
function connectAllows(url) {
  let u;
  try { u = new URL(url); } catch { return false; }
  const origin = `${u.protocol}//${u.host}`;
  return CONNECT_SRC.some((src) => {
    if (src === origin) return true;
    const m = /^([a-z]+:)\/\/\*\.(.+)$/.exec(src);
    return !!m && u.protocol === m[1] && u.host.endsWith(`.${m[2]}`);
  });
}

module.exports = { buildCsp, inlineScriptHashes, connectAllows, BACKEND_ORIGINS, SUPABASE_ORIGINS };
