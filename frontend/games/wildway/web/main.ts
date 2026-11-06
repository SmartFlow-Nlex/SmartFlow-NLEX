import { WildwayApp } from './app';
import { connectHost } from './host';

/**
 * Entry point of the NLEX: Wildway Guardians page: in the app it runs inside the WebView
 * of app/arcade/wildway-guardians.tsx; in a desktop browser, against the stand-in host.
 */

const app = new WildwayApp(connectHost());
app.start(document.getElementById('app') as HTMLElement);
window.addEventListener('pagehide', () => app.dispose(), { once: true });
