/**
 * Whether the app draws its maps with Mapbox, and with which style.
 *
 * Set `EXPO_PUBLIC_MAPBOX_TOKEN` and every map becomes Mapbox - the same
 * library and tiles the dashboard renders with, identical on iOS and Android.
 * Leave it unset and the app uses the platform maps instead: Apple Maps on
 * iOS, Google Maps on Android. Both paths work; only the look differs.
 *
 * Expo inlines `EXPO_PUBLIC_*` at bundle time, so changing it needs the dev
 * server restarted, not just a refresh.
 */

const token = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;

/** Null rather than empty string, so `useMapbox` cannot be true by accident. */
export const MAPBOX_TOKEN: string | null =
  typeof token === 'string' && token.startsWith('pk.') ? token : null;

export const useMapbox = (): boolean => MAPBOX_TOKEN !== null;

/**
 * Mapbox's own light style: pale grey land, white roads, quiet labels.
 *
 * Chosen because it is what the corridor needs - everything but NLEX turned
 * down - and it is close to the dashboard's own look. If the dashboard team
 * share their exact style URL (`mapbox://styles/grp4smartflow/...`), putting
 * it here makes the two match precisely; the token cannot list account styles,
 * so it has to be handed over rather than discovered.
 */
export const MAPBOX_STYLE_URL =
  process.env.EXPO_PUBLIC_MAPBOX_STYLE ?? 'mapbox://styles/mapbox/light-v11';

/** Mapbox's dark counterpart, so the map is not a bright panel in dark mode. */
const MAPBOX_DARK_STYLE_URL =
  process.env.EXPO_PUBLIC_MAPBOX_DARK_STYLE ?? 'mapbox://styles/mapbox/dark-v11';

export const mapboxStyleUrl = (isDark: boolean): string =>
  isDark ? MAPBOX_DARK_STYLE_URL : MAPBOX_STYLE_URL;
