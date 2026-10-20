import { useEffect, useState } from 'react';
import * as Linking from 'expo-linking';
import { RESET_PASSWORD_PATH } from './authApi';

/**
 * The latest password-reset link the app was opened with, caught from the
 * moment the app starts.
 *
 * Not left to the reset screen: with the app already open, tapping the link in
 * the email arrives as an event, the router opens the reset screen in answer to
 * it, and by the time that screen subscribes the event has passed. Expo's
 * `useURL()` then gave the URL the app was LAUNCHED with, which holds no reset
 * session, and the screen said there was no link (20 Oct, Expo Go on a tunnel).
 *
 * Registered when this module loads, which is when the app starts: the auth
 * index re-exports it and the root layout imports the auth index.
 */
let latest: string | null = null;
const listeners = new Set<(url: string) => void>();

function offer(url: string | null): void {
  if (url === null || !url.includes(RESET_PASSWORD_PATH)) {
    return;
  }
  latest = url;
  listeners.forEach((listener) => listener(url));
}

Linking.addEventListener('url', ({ url }) => offer(url));
// A link that started the app rather than arriving while it ran.
void Linking.getInitialURL()
  .then(offer)
  .catch(() => undefined);

/** The latest reset link, and each one that arrives while the screen is open. */
export function useRecoveryUrl(): string | null {
  const [url, setUrl] = useState<string | null>(latest);
  useEffect(() => {
    // One may have arrived between the first render and this subscription.
    setUrl(latest);
    listeners.add(setUrl);
    return () => {
      listeners.delete(setUrl);
    };
  }, []);
  return url;
}
