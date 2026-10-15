const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');

const isDev = !app.isPackaged;
const OUT_DIR = path.join(app.getAppPath(), 'out');
const staticEntry = path.join(OUT_DIR, 'index.html');

/*
 * The packaged app serves its own files over HTTP instead of loading them from
 * disk.
 *
 * loadFile() opens the pages on a file:// origin, and a file:// page sends
 * "Origin: null" on every cross-origin request. The backend's CORS allow-list
 * (FRONTEND_ORIGIN) admits named origins only, so an installed copy rendered
 * its interface perfectly and then failed every data call — the hardest kind of
 * failure to diagnose, because nothing looks broken until a panel stays empty.
 *
 * Serving out/ on 127.0.0.1:3002 puts the packaged app on an origin the backend
 * already allows, and makes the packaged and unpackaged runs take the same code
 * path rather than diverging at the one point that matters.
 */
const SERVE_PORT = 3002;
const SERVE_HOST = '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
};

/** Resolve a URL path inside out/, refusing anything that escapes it. */
function resolveInOut(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  const resolved = path.normalize(path.join(OUT_DIR, clean));
  if (resolved !== OUT_DIR && !resolved.startsWith(OUT_DIR + path.sep)) return null;
  return resolved;
}

function startStaticServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let file = resolveInOut(req.url || '/');
      if (!file) { res.writeHead(403).end('Forbidden'); return; }

      // A static export writes each route as a directory with index.html, and also
      // as <route>.html. Try both before giving up, so deep links work.
      const candidates = [file];
      if (!path.extname(file)) candidates.push(path.join(file, 'index.html'), file + '.html');
      candidates.push(path.join(OUT_DIR, '404.html'), staticEntry);

      const found = candidates.find((c) => { try { return fs.statSync(c).isFile(); } catch { return false; } });
      if (!found) { res.writeHead(404).end('Not found'); return; }

      res.writeHead(200, { 'Content-Type': MIME[path.extname(found).toLowerCase()] || 'application/octet-stream' });
      fs.createReadStream(found).pipe(res);
    });

    server.once('error', reject);
    server.listen(SERVE_PORT, SERVE_HOST, () => resolve(server));
  });
}

async function createWindow() {
  const window = new BrowserWindow({
    width: 1440, height: 920, minWidth: 1200, minHeight: 760,
    backgroundColor: '#eef5fd', title: 'SmartFlow NLEX', show: false,
    webPreferences: {
      contextIsolation: true, nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  if (isDev) {
    const devUrl = process.env.NEXT_DEV_URL || `http://${SERVE_HOST}:${SERVE_PORT}/dashboard`;
    let hasLoaded = false;
    const fallbackToStatic = async () => {
      if (hasLoaded) return;
      hasLoaded = true;
      try { await window.loadFile(staticEntry); }
      catch (error) { console.error('Failed to load static fallback:', error); }
    };
    window.webContents.once('did-fail-load', fallbackToStatic);
    window.loadURL(devUrl).catch(fallbackToStatic);
    window.webContents.openDevTools({ mode: 'detach' });
  } else {
    try {
      await startStaticServer();
      await window.loadURL(`http://${SERVE_HOST}:${SERVE_PORT}/dashboard`);
    } catch (error) {
      // A port clash is the one failure worth naming out loud: the backend's
      // allow-list is keyed to this port, so silently moving to another one
      // would reintroduce exactly the CORS failure this server exists to avoid.
      dialog.showErrorBox(
        'SmartFlow NLEX could not start',
        `The application serves its interface on ${SERVE_HOST}:${SERVE_PORT}, and that port is ` +
        `already in use.\n\nClose whatever is using it and start SmartFlow again.\n\n${error.message}`,
      );
      app.quit();
      return;
    }
  }

  window.once('ready-to-show', () => window.show());
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
