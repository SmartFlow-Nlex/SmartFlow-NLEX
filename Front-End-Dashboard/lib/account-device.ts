/* What this browser remembers about the person who signs in on it (19 Oct 2026, user request):
 *
 *   - "Remember me": the email address, filled in on the next visit. Nothing else.
 *   - "Remember this device for 7 days": a pass from the backend (Back-End/src/lib/device-trust.ts) that
 *     stands in for the authenticator code on later sign-ins here, for one account, until it expires. A
 *     password is still asked for every time; the pass only skips the code.
 *   - When anyone last did something in the dashboard, shared by every open tab, so signing out after a
 *     spell of inactivity (lib/idle.ts) counts activity in any of them.
 *
 * All of it is per-browser (localStorage), and Settings can forget each piece. Every read is guarded:
 * storage can be blocked, and a broken value is treated as absent.
 */

const EMAIL_KEY = "smartflow-remember-email";
const TRUST_KEY = "smartflow-device-trust";
export const LAST_ACTIVITY_KEY = "smartflow-last-activity";

export type DeviceTrust = { userId: string; email: string; token: string; expiresAt: string };

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string | null): void {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage blocked: the feature quietly does nothing */
  }
}

export function rememberedEmail(): string {
  return read(EMAIL_KEY) ?? "";
}
export function setRememberedEmail(email: string | null): void {
  write(EMAIL_KEY, email ? email.trim().toLowerCase() : null);
}

/** This browser's device pass, if it has one that has not expired. */
export function deviceTrust(): DeviceTrust | null {
  const raw = read(TRUST_KEY);
  if (!raw) return null;
  try {
    const t = JSON.parse(raw) as DeviceTrust;
    if (!t.token || !t.userId || !t.expiresAt) throw new Error("incomplete");
    if (new Date(t.expiresAt).getTime() <= Date.now()) {
      write(TRUST_KEY, null);
      return null;
    }
    return t;
  } catch {
    write(TRUST_KEY, null);
    return null;
  }
}

/** The pass, only when it belongs to this account. */
export function deviceTrustFor(userId: string | null | undefined): DeviceTrust | null {
  const t = deviceTrust();
  return t && userId && t.userId === userId ? t : null;
}

export function saveDeviceTrust(t: DeviceTrust): void {
  write(TRUST_KEY, JSON.stringify(t));
}
export function forgetDeviceTrust(): void {
  write(TRUST_KEY, null);
}

export function lastActivity(): number {
  const v = Number(read(LAST_ACTIVITY_KEY));
  return Number.isFinite(v) && v > 0 ? v : 0;
}
export function markActivity(at = Date.now()): void {
  write(LAST_ACTIVITY_KEY, String(at));
}

/** Sign-out after inactivity: the choices Settings offers, and the default. */
export const IDLE_CHOICES = [5, 10, 15, 30, 60] as const;
export const DEFAULT_IDLE_MINUTES = 15;
export function idleMinutesOf(metadata: Record<string, unknown> | null | undefined): number {
  const v = Number(metadata?.idle_minutes);
  return (IDLE_CHOICES as readonly number[]).includes(v) ? v : DEFAULT_IDLE_MINUTES;
}

/* A password change (19 Oct 2026, user request):
 *   - revokes every remembered device of the account: `trust_revoked_at` on the account, which the API
 *     compares with each pass's issue time (Back-End/src/lib/device-trust.ts), and this browser's own pass
 *     is dropped at once;
 *   - starts a 30-day cool-down before the next change of any kind, recorded as `password_changed_at`:
 *     Settings refuses it, and so does "Forgot password?" (19 Oct 2026, user request: a reset straight after a
 *     reset should be refused, not emailed). The cost, accepted: if someone else changed the password, the
 *     owner cannot reset it themselves for 30 days and needs an administrator (Supabase dashboard). Supabase
 *     itself does not know about the cool-down, so it is enforced by this interface and the backend.
 *   - emails the account that it happened and when it can next be changed (the backend sends it). */
export const PASSWORD_COOLDOWN_DAYS = 30;

/** The account fields to save together with a new password. */
export function passwordStamps(at = new Date()): { password_changed_at: string; trust_revoked_at: number } {
  return { password_changed_at: at.toISOString(), trust_revoked_at: at.getTime() };
}

/** When the next voluntary password change is allowed, or null when it is allowed now. */
export function passwordCooldownUntil(metadata: Record<string, unknown> | null | undefined, now = Date.now()): Date | null {
  const v = metadata?.password_changed_at;
  const at = typeof v === "string" ? Date.parse(v) : NaN;
  if (!Number.isFinite(at)) return null;
  const until = at + PASSWORD_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
  return until > now ? new Date(until) : null;
}

/** The cool-down message, the same wherever a change is refused. */
export function cooldownMessage(metadata: Record<string, unknown> | null | undefined): string | null {
  const until = passwordCooldownUntil(metadata);
  if (!until) return null;
  const at = typeof metadata?.password_changed_at === "string" ? new Date(metadata.password_changed_at) : null;
  const day = (d: Date) => d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  return `This password was changed${at ? ` on ${day(at)}` : " recently"}. It can be changed again on ${day(until)}. If you can't sign in, contact your administrator.`;
}

/** The name the dashboard shows for a person: the one they set in Settings, else the older full_name, else the email. */
export function displayNameOf(metadata: Record<string, unknown> | null | undefined, email: string | undefined): string {
  const set = typeof metadata?.display_name === "string" ? metadata.display_name.trim() : "";
  const legacy = typeof metadata?.full_name === "string" ? metadata.full_name.trim() : "";
  return set || legacy || email || "";
}
