import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";

/* "Remember this device for 7 days" (19 Oct 2026, user request).
 *
 * Sign-in is a password and then an authenticator code, and the API refuses a
 * session that has not passed the code (its token's `aal` is still "aal1"; see
 * middleware/auth.middleware.ts). A trusted device is the one exception: after a
 * full sign-in, a browser may ask for a pass that stands in for the code on later
 * sign-ins from that browser, for one account, for seven days.
 *
 * The pass is stateless: the account id and the expiry, signed with
 * DEVICE_TRUST_SECRET (HMAC-SHA256). Nothing is stored server-side, so nothing is
 * written to the database. The consequences are stated rather than hidden:
 *
 *   - it only ever stands in for the code. A password is still required, so a
 *     copied pass alone opens nothing;
 *   - it is bound to one account (`sub`): another account's session cannot use it;
 *   - it lapses on its own after seven days, and the browser can forget it at any
 *     time (Settings);
 *   - a password change, or "Sign out of all devices", revokes every pass the
 *     account had (19 Oct 2026: a pass issued before a password change kept skipping
 *     the code afterwards). Those set `trust_revoked_at` on the account, and a pass
 *     issued before that moment is refused. Changing the secret revokes every pass
 *     of every account.
 *
 * With no DEVICE_TRUST_SECRET configured the feature is off: no pass is issued
 * and none is accepted, so the code is always asked for. Fail closed.
 */

export const DEVICE_TRUST_DAYS = 7;
const VERSION = 2; // 2 adds `iat`, so a pass can be revoked by date; version-1 passes are refused

export function deviceTrustEnabled(): boolean {
  return typeof env.DEVICE_TRUST_SECRET === "string" && env.DEVICE_TRUST_SECRET.length >= 32;
}

function sign(body: string): string {
  return createHmac("sha256", env.DEVICE_TRUST_SECRET as string).update(body).digest("base64url");
}

/** A pass for this account, valid for DEVICE_TRUST_DAYS; null when the feature is off. */
export function issueDeviceTrust(userId: string): { token: string; expiresAt: string } | null {
  if (!deviceTrustEnabled()) return null;
  const iat = Date.now();
  const exp = iat + DEVICE_TRUST_DAYS * 24 * 60 * 60 * 1000;
  const body = Buffer.from(JSON.stringify({ v: VERSION, sub: userId, iat, exp })).toString("base64url");
  return { token: `${body}.${sign(body)}`, expiresAt: new Date(exp).toISOString() };
}

/** When the account last revoked its passes (password changed, signed out everywhere), in ms; 0 when never. */
export function trustRevokedAt(userMetadata: Record<string, unknown> | null | undefined): number {
  const v = userMetadata?.trust_revoked_at;
  const ms = typeof v === "number" ? v : typeof v === "string" ? Date.parse(v) : NaN;
  return Number.isFinite(ms) ? ms : 0;
}

/** True only for an untampered, unexpired pass issued to this account after its last revocation. */
export function deviceTrustValid(token: string | undefined | null, userId: string | undefined | null, revokedAt = 0): boolean {
  if (!deviceTrustEnabled() || !token || !userId) return false;
  const [body, mac] = token.split(".");
  if (!body || !mac) return false;
  const expected = Buffer.from(sign(body));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;
  try {
    const claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { v?: number; sub?: string; iat?: number; exp?: number };
    return (
      claims.v === VERSION &&
      claims.sub === userId &&
      typeof claims.iat === "number" &&
      claims.iat > revokedAt &&
      typeof claims.exp === "number" &&
      claims.exp > Date.now()
    );
  } catch {
    return false;
  }
}
