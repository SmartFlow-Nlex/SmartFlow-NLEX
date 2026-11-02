/**
 * The welcome email a new account gets.
 *
 * Sent by a small Google Apps Script running as navie.smartflow@gmail.com, whose
 * code and setup steps are in supabase/welcome-email.gs. Not by our backend:
 * Render's free tier blocks outgoing email connections. Not by Supabase: its
 * mailer only sends its own sign-in templates.
 *
 * The script is handed the new session's token, never an address. It asks
 * Supabase whose token that is, and writes only to that account's own email.
 * The URL is therefore safe to keep in the app; without it nothing is sent.
 */
const WELCOME_EMAIL_URL = process.env.EXPO_PUBLIC_WELCOME_EMAIL_URL ?? '';
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** Not awaited, and never throws: a missed welcome must not fail a sign-up. */
export function sendWelcomeEmail(token: string): void {
  if (WELCOME_EMAIL_URL.length === 0) {
    return;
  }
  fetch(WELCOME_EMAIL_URL, {
    method: 'POST',
    // Apps Script reads the body whatever its type, and plain text needs no CORS
    // check on the web build. It cannot read headers, so the token is in the body.
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ token, apikey: SUPABASE_KEY }),
  })
    .then((response) => response.json() as Promise<{ sent?: boolean; reason?: string }>)
    .then((result) => {
      if (__DEV__ && result.sent !== true) {
        console.warn(`Welcome email not sent: ${result.reason ?? 'no reason given'}`);
      }
    })
    .catch((error: unknown) => {
      if (__DEV__) {
        console.warn('Welcome email not sent', error);
      }
    });
}
