import { App } from './app';
import { runDevSheet } from './dev';
import { connectHost } from './host';

/**
 * Entry point of the Tollbound Heroes page (formerly Navie's Road Trip). In the app this runs inside the
 * WebView of app/arcade/road-trip.tsx; in a desktop browser it runs against
 * a stand-in host (see host.ts) for development and the test harness.
 */

const sheet = new URLSearchParams(location.search).get('sheet');
if (sheet !== null && window.__ROAD_TRIP_DEV__ === true) {
  runDevSheet(sheet);
} else {
  const app = new App(connectHost());
  app.start(document.getElementById('app')!);
  window.addEventListener('pagehide', () => app.dispose(), { once: true });
}
