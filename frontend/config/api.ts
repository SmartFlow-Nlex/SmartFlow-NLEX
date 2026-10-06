import { Platform } from 'react-native';

/**
 * Every backend address the app talks to, in one place.
 *
 * The SmartFlow backend runs on whichever teammate's laptop is hosting, so the
 * host changes person to person. Override it without editing code by setting an
 * environment variable before starting the dev server - Expo inlines any
 * `EXPO_PUBLIC_*` variable into the bundle:
 *
 *   EXPO_PUBLIC_API_HOST=192.168.1.42 npx expo start
 *
 * Restart the dev server after changing it; the value is baked in at bundle
 * time, so a Fast Refresh will not pick it up.
 *
 * To point one service somewhere else entirely (say the dashboard runs on a
 * different machine from the community API), override that whole URL instead:
 *
 *   EXPO_PUBLIC_CORRIDOR_API_URL=http://10.0.0.5:4000 npx expo start
 */

/** Host to use when nothing is configured - the machine this was developed against. */
const DEFAULT_API_HOST = '192.168.2.196';

/**
 * An Android *emulator* reaches the dev machine through the special 10.0.2.2
 * alias rather than the LAN address. There is no reliable way to detect "inside
 * an emulator" from JS without a native module (expo-device is not installed),
 * so this is a flag to flip by hand if you switch to emulator-based testing.
 * Expo Go on a real phone - how this project is actually tested - wants the LAN
 * address and should leave this false.
 */
const USE_ANDROID_EMULATOR_HOST = false;

function resolveHost(): string {
  if (Platform.OS === 'android' && USE_ANDROID_EMULATOR_HOST) {
    return '10.0.2.2';
  }
  const configured = process.env.EXPO_PUBLIC_API_HOST;
  return configured !== undefined && configured.length > 0 ? configured : DEFAULT_API_HOST;
}

/** Host only, no scheme or port. Exported so error messages can name it. */
export const API_HOST = resolveHost();

const CORRIDOR_API_PORT = 4000;
const COMMUNITY_API_PORT = 3000;

/**
 * Dashboard / Waze-ingest backend: live corridor status.
 * This is the one that has to be running for the Map screen to show real data.
 */
export const CORRIDOR_API_BASE_URL =
  process.env.EXPO_PUBLIC_CORRIDOR_API_URL ?? `http://${API_HOST}:${CORRIDOR_API_PORT}`;

/**
 * Community feed and user profile API.
 *
 * Note this deliberately uses the LAN host rather than localhost: on a phone,
 * "localhost" is the phone itself, so the previous hardcoded localhost:3000
 * could never have reached anything. Both callers fall back to local data when
 * it is unreachable, which is why that went unnoticed.
 */
export const COMMUNITY_API_BASE_URL =
  process.env.EXPO_PUBLIC_COMMUNITY_API_URL ?? `http://${API_HOST}:${COMMUNITY_API_PORT}`;

/**
 * SmartFlow's own Express backend - the assistant chat lives here, and so does
 * the LLM key, which is why chat requests go through this rather than straight
 * from the app to the model.
 *
 * Once the backend is deployed (see render.yaml at the repo root), set this to
 * the public URL and the app stops depending on anyone's laptop being on, or on
 * the LAN address of the day:
 *
 *   EXPO_PUBLIC_BACKEND_API_URL=https://smartflow-backend.onrender.com
 *
 * Falls back to the community host, so a purely local setup still works with
 * nothing configured.
 */
export const BACKEND_API_BASE_URL =
  process.env.EXPO_PUBLIC_BACKEND_API_URL ?? COMMUNITY_API_BASE_URL;

/**
 * The team's dashboard, where our backend reads the traffic from.
 *
 * The app never reads data from it - only pings it awake. On Render's free
 * tier it sleeps, and a request from our backend (another Render service) is
 * refused with HTTP 429 rather than waking it, so the backend alone can never
 * bring it back. A request from the phone does wake it. See wakeTrafficSource.
 */
export const TRAFFIC_SOURCE_URL =
  process.env.EXPO_PUBLIC_TRAFFIC_SOURCE_URL ?? 'https://smartflow-nlex.onrender.com';

/**
 * The assistant reasons and calls tools, so it needs longer than a data fetch.
 *
 * 75s, not 45: a question asked after an idle spell waits for the team's
 * dashboard to wake (about 23s) before the model even sees the traffic, and the
 * model itself takes 3-22s. At 45s those cold questions timed out as "not
 * responding" on a system that was about to answer.
 */
export const ASSISTANT_TIMEOUT_MS = 75000;

/**
 * How long Lex's welcome may take before the screen greets with its own line.
 *
 * Shorter than a question: the greeting never reads the traffic feed, so it
 * waits only on our backend waking (20-25s) and a 2-3s generation. Past that,
 * a greeting arriving after the user has started typing would be in the way.
 */
export const GREETING_TIMEOUT_MS = 35000;

/**
 * How long to wait before declaring a backend unreachable, in milliseconds.
 *
 * Generous because both this backend and the dashboard it reads run on a free
 * tier that sleeps: waking one takes 20-25s, and the first request of the day
 * may wait on both in turn. At 10s the app gave up while the servers were still
 * starting and showed an error on a system that was about to answer. A long
 * first load is better than a wrong verdict - the screen shows a loading state
 * throughout, and every later request returns in well under a second.
 */
export const API_TIMEOUT_MS = 60000;
