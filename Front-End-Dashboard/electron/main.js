const { app, BrowserWindow, protocol, session, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { buildCsp, inlineScriptHashes } = require('./csp');

const isDev = !app.isPackaged;
const OUT_DIR = path.join(app.getAppPath(), 'out');
const staticEntry = path.join(OUT_DIR, 'index.html');

/*
 * How the installed app shows its screens (17 Nov 2026).
 *
 * The pages are read straight from the app's own files through a private
 * address, app://smartflow/..., registered below. There is no web server, no
 * port and no localhost: a copy installed on any computer runs on its own, and
 * all data comes from the deployed backend.
 *
 * Earlier versions served out/ on 127.0.0.1:3002. That worked, but the installed
 * app was then a localhost page, it could not open while anything else held
 * port 3002 (the dashboard's dev server does), and the backend had to allow that
 * address. loadFile() was not an option either: a file:// page sends
 * "Origin: null", which the backend's CORS allow-list (FRONTEND_ORIGIN) refuses.
 * A registered scheme sends a real origin, "app://smartflow", which the backend
 * allows by name.
 *
 * Development (npm run dev:desktop / electron .) still opens the Next dev server.
 */
const APP_SCHEME = 'app';
const APP_HOST = 'smartflow';
const APP_START_URL = `${APP_SCHEME}://${APP_HOST}/dashboard`;
const DEV_URL = process.env.NEXT_DEV_URL || 'http://localhost:3002/dashboard';

// Must run before the app is ready. "standard" gives the scheme normal URL rules (relative links,
// a real origin); "secure" lets its pages call the https backend and keep sign-in in local storage.
protocol.registerSchemesAsPrivileged([
  { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.map': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.wasm': 'application/wasm',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
};

/** Resolve a URL path inside out/, refusing anything that escapes it. */
function resolveInOut(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  const resolved = path.normalize(path.join(OUT_DIR, clean));
  if (resolved !== OUT_DIR && !resolved.startsWith(OUT_DIR + path.sep)) return null;
  return resolved;
}

/** The file a request maps to. A static export writes each route as a directory with index.html and as
 *  <route>.html, so both are tried before falling back to the 404 page, so deep links work. */
function fileFor(urlPath) {
  let p = urlPath || '/';
  // The production build uses relative asset paths (next.config assetPrefix './'), so an asset can be asked
  // for under the page or stylesheet that named it: a font in a stylesheet comes as
  // /_next/static/css/_next/static/media/x.woff2, a script on /dashboard/traffic as /dashboard/_next/... .
  // Every build asset lives under out/_next, so the path from the LAST "/_next/" on is the real one (the
  // stylesheet case starts with /_next/ itself).
  const nextAt = p.lastIndexOf('/_next/');
  if (nextAt > 0) p = p.slice(nextAt);
  const file = resolveInOut(p);
  if (!file) return null;
  const isFile = (c) => { try { return fs.statSync(c).isFile(); } catch { return false; } };
  // A missing asset (anything with an extension) is a 404, never a page: answering a font or script request
  // with HTML is how the fonts silently failed to load.
  if (path.extname(file)) return isFile(file) ? file : null;
  const candidates = [path.join(file, 'index.html'), file + '.html', path.join(OUT_DIR, '404.html'), staticEntry];
  return candidates.find(isFile) || null;
}

/*
 * Every response carries the Content-Security-Policy from electron/csp.js (audit A7 / S18). A page's own inline
 * scripts (the theme start-up script, Next's page data) are allowed by their hashes, worked out here from the page
 * being served; nothing else inline runs. Hashes are kept per file and rebuilt if the file changes.
 */
const BASE_CSP = buildCsp();
const pageCsp = new Map(); // file -> { mtimeMs, csp }

async function cspFor(file, body) {
  if (path.extname(file).toLowerCase() !== '.html') return BASE_CSP;
  const { mtimeMs } = await fs.promises.stat(file);
  const kept = pageCsp.get(file);
  if (kept && kept.mtimeMs === mtimeMs) return kept.csp;
  const csp = buildCsp(inlineScriptHashes(body.toString('utf8')));
  pageCsp.set(file, { mtimeMs, csp });
  return csp;
}

function registerAppProtocol() {
  protocol.handle(APP_SCHEME, async (request) => {
    const url = new URL(request.url);
    if (url.host !== APP_HOST) return new Response('Not found', { status: 404 });
    const file = fileFor(url.pathname);
    if (!file) return new Response('Not found', { status: 404 });
    const body = await fs.promises.readFile(file);
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Content-Security-Policy': await cspFor(file, body),
        // The browser must take the type above as given, never guess one from the bytes (24 Nov 2026, ZAP review).
        'X-Content-Type-Options': 'nosniff',
      },
    });
  });
}

/*
 * Where the window may go (audit A7 / S5). Only the app's own pages load inside it (and, in development, the Next
 * dev server). A link to a website, such as an event's source page or the Mapbox attribution, opens in the user's
 * own browser instead of an app window running this Electron's older Chromium. Anything else, including a file
 * dropped on the window (which would otherwise replace the app with that file), is refused.
 */
const DEV_ORIGIN = (() => { try { return new URL(DEV_URL).origin; } catch { return null; } })();

function isAppUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { return false; }
  // Node gives a custom scheme the origin "null", so compare scheme and host.
  if (u.protocol === `${APP_SCHEME}:` && u.host === APP_HOST) return true;
  return isDev && DEV_ORIGIN !== null && u.origin === DEV_ORIGIN;
}

function openInBrowser(raw) {
  let u;
  try { u = new URL(raw); } catch { return; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return;
  shell.openExternal(u.href).catch((error) => console.error('Could not open the link in the browser:', error));
}

function guardNavigation(contents) {
  contents.setWindowOpenHandler(({ url }) => {
    // A target=_blank link to one of the app's own pages opens it in this window; a website goes to the browser.
    // No second app window is ever created.
    if (isAppUrl(url)) contents.loadURL(url).catch(() => {});
    else openInBrowser(url);
    return { action: 'deny' };
  });
  contents.on('will-navigate', (event, url) => {
    const target = url || event.url;
    if (isAppUrl(target)) return;
    event.preventDefault();
    openInBrowser(target); // a plain link to a website; file://, data: and the rest are just refused
  });
  contents.on('will-redirect', (event, url) => {
    if (!isAppUrl(url || event.url)) event.preventDefault();
  });
  contents.on('will-attach-webview', (event) => event.preventDefault());
}

// Capabilities no page uses. A request for any of them (from an injected script, or a linked page) is refused
// instead of granted, Electron's default. Clipboard writes (the copy buttons) and full screen stay allowed.
const DENIED_PERMISSIONS = new Set([
  'media', 'display-capture', 'geolocation', 'notifications', 'midi', 'midiSysex', 'pointerLock', 'keyboardLock',
  'idle-detection', 'window-management', 'openExternal', 'speaker-selection', 'mediaKeySystem', 'fileSystem',
  'clipboard-read',
]);

async function createWindow() {
  const window = new BrowserWindow({
    width: 1440, height: 920, minWidth: 1200, minHeight: 760,
    backgroundColor: '#eef5fd', title: 'SmartFlow NLEX', show: false,
    // The SmartFlow logo on the title bar and taskbar; without it a dev run shows Electron's own icon.
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      // The page gets no Node, runs in Chromium's sandbox, and sees the preload only through contextBridge.
      contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, webviewTag: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  guardNavigation(window.webContents);
  // Listen before loading. 'ready-to-show' can fire before loadURL() resolves; registered after it (as it
  // was), the event was missed and the window stayed hidden for good: the app ran with nothing on screen.
  window.once('ready-to-show', () => window.show());

  if (isDev) {
    let hasLoaded = false;
    const fallbackToStatic = async () => {
      if (hasLoaded) return;
      hasLoaded = true;
      try { await window.loadURL(APP_START_URL); }
      catch (error) { console.error('Failed to load the built pages:', error); }
    };
    window.webContents.once('did-fail-load', fallbackToStatic);
    window.loadURL(DEV_URL).catch(fallbackToStatic);
    // DevTools on request only (Ctrl+Shift+I, or SMARTFLOW_DEVTOOLS=1). Its detached window carries
    // Electron's icon, and sharing the taskbar button with it put that icon in place of the SmartFlow logo.
    if (process.env.SMARTFLOW_DEVTOOLS === '1') window.webContents.openDevTools({ mode: 'detach' });
  } else {
    try { await window.loadURL(APP_START_URL); }
    catch (error) { console.error('Failed to load the app pages:', error); }
  }
  // Belt and braces: whatever happened above, never leave a running app with no window on screen.
  if (!window.isDestroyed() && !window.isVisible()) window.show();
}

// Same id as build.appId, so Windows groups the taskbar button under SmartFlow rather than Electron.
app.setAppUserModelId('ph.edu.ust.smartflow.nlex');

app.whenReady().then(() => {
  registerAppProtocol();
  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => {
    callback(!DENIED_PERMISSIONS.has(permission));
  });
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
