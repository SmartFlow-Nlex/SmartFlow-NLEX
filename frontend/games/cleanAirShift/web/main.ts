import { CleanAirApp } from './app';
import { connectHost } from './host';

/**
 * Entry point of the Carbon Rush page: in the app it runs inside the WebView
 * of app/arcade/clean-air-shift.tsx; in a desktop browser, against the stand-in
 * host in host.ts.
 */

const app = new CleanAirApp(connectHost());
app.start(document.getElementById('app') as HTMLElement);
window.addEventListener('pagehide', () => app.dispose(), { once: true });
