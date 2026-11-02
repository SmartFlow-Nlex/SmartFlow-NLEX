import { GpApp } from './app';
import { connectHost } from './host';

/**
 * Entry point of the Navie Grand Prix page: in the app it runs inside the
 * WebView of app/arcade/grand-prix.tsx; in a desktop browser, against the
 * stand-in host in host.ts.
 */

const app = new GpApp(connectHost());
app.start(document.getElementById('app')!);
window.addEventListener('pagehide', () => app.dispose(), { once: true });
