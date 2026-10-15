import { Platform } from 'react-native';

/**
 * Device notifications, wrapped so the rest of the app never has to care where
 * it is running.
 *
 * These are LOCAL notifications: the app schedules them on this device while
 * it is running. They are not sent from a server, and deliberately so - Expo
 * Go dropped remote push in SDK 53, so anything server-sent would simply not
 * arrive in the way this project is demoed. Everything here works in Expo Go
 * today; see `docs` note at the bottom for what changes if a development build
 * is ever made.
 *
 * Two hazards this file exists to contain:
 *
 *   1. Importing `expo-notifications` at module scope has been reported to
 *      crash Android Expo Go at startup. So it is required lazily, inside a
 *      try, and a failure leaves the app running without notifications rather
 *      than taking it down.
 *   2. Web has no notification scheduler of this kind. Every entry point below
 *      answers "not available" there instead of throwing into a render.
 */

/** The module, once it has loaded. Null until tried, false once known bad. */
let cached: typeof import('expo-notifications') | null | false = null;

/**
 * Load `expo-notifications`, or decide once that it cannot be had.
 *
 * Deliberately synchronous `require` rather than a dynamic import: this is
 * called from notification paths that must not introduce a render-time await,
 * and Metro resolves it the same way either way.
 */
function moduleOrNull(): typeof import('expo-notifications') | null {
  if (cached !== null) {
    return cached === false ? null : cached;
  }
  if (Platform.OS === 'web') {
    cached = false;
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const loaded = require('expo-notifications') as typeof import('expo-notifications');
    loaded.setNotificationHandler({
      handleNotification: async () => ({
        // Shown even while the app is open: a driver looking at the map is
        // exactly who needs to be told the road ahead just closed.
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
    cached = loaded;
    return loaded;
  } catch {
    cached = false;
    return null;
  }
}

/** False on web, and on any build where the module refused to load. */
export function notificationsAvailable(): boolean {
  return moduleOrNull() !== null;
}

export type PermissionState = 'granted' | 'denied' | 'unavailable';

/**
 * Ask for permission, or report what was already decided.
 *
 * Only ever called from the Notifications switch in Settings, so the prompt
 * appears because someone asked for notifications - not on first launch, where
 * a permission dialog with no context is the one most people refuse.
 */
export async function requestPermission(): Promise<PermissionState> {
  const notifications = moduleOrNull();
  if (notifications === null) {
    return 'unavailable';
  }
  try {
    const existing = await notifications.getPermissionsAsync();
    if (existing.granted) {
      return 'granted';
    }
    // `canAskAgain` false means the OS will no longer show the prompt, so
    // asking again does nothing and the user has to go to system settings.
    if (!existing.canAskAgain) {
      return 'denied';
    }
    const asked = await notifications.requestPermissionsAsync();
    return asked.granted ? 'granted' : 'denied';
  } catch {
    return 'unavailable';
  }
}

export async function hasPermission(): Promise<boolean> {
  const notifications = moduleOrNull();
  if (notifications === null) {
    return false;
  }
  try {
    return (await notifications.getPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

export interface Notice {
  title: string;
  body: string;
  /** Carried through so tapping a notification can open the right alert. */
  data?: Record<string, string>;
}

/**
 * Show one notification now.
 *
 * `trigger: null` means immediately. Failures are swallowed: a notification
 * that cannot be shown is not a reason for the screen behind it to fall over,
 * and the alert it describes is on the Alerts tab regardless.
 */
export async function notifyNow(notice: Notice): Promise<boolean> {
  const notifications = moduleOrNull();
  if (notifications === null) {
    return false;
  }
  try {
    await notifications.scheduleNotificationAsync({
      content: {
        title: notice.title,
        body: notice.body,
        data: notice.data ?? {},
      },
      trigger: null,
    });
    return true;
  } catch {
    return false;
  }
}

/*
 * If a development build is ever made, remote push becomes possible and almost
 * nothing here changes: add `getExpoPushTokenAsync({ projectId })`, send the
 * token to the backend, and have the server post to Expo's push service. The
 * app would still show what arrives through the same handler set above. It
 * needs an EAS `projectId` in app.json first - there is none today, and
 * `getExpoPushTokenAsync` cannot issue a token without one.
 */
