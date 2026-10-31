import { Router, type Response } from "express";
import { asyncHandler } from "../middleware/error.middleware.js";
import { authenticateToken, requestPassedCode, type AuthenticatedRequest } from "../middleware/auth.middleware.js";
import { deviceTrustEnabled, issueDeviceTrust, DEVICE_TRUST_DAYS } from "../lib/device-trust.js";
import { audit } from "../services/audit.js";
import { mailConfigured, sendPasswordChanged, sendPasswordReset, sendResetRefused } from "../lib/mailer.js";
import { supabaseAdmin } from "../lib/supabase-admin.js";
import { env } from "../config/env.js";

/* Trusted devices (19 Oct 2026, user request: "remember me for 7 days so you don't have to input the code
   multiple times"). See lib/device-trust.ts for what a pass is and is not. */
const router = Router();

// GET /api/auth/trusted-device/status -- whether this server can remember devices at all. Public and harmless
// (a yes/no), so the sign-in page offers the checkbox only when ticking it will work: with no secret configured
// the box was offered and silently did nothing, and the code was asked every time (2026-10-27).
router.get("/trusted-device/status", (_req, res) => {
  res.json({ success: true, data: { enabled: deviceTrustEnabled(), days: DEVICE_TRUST_DAYS } });
});

// POST /api/auth/trusted-device -- issue a pass. Only a session that has just passed the authenticator code
// may ask: a pass cannot be renewed with another pass, so trust never extends itself past seven days.
router.post(
  "/trusted-device",
  authenticateToken,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!deviceTrustEnabled()) {
      return res.status(503).json({ success: false, code: "device_trust_unconfigured", message: "Remembering devices is not set up on this server." });
    }
    if (!requestPassedCode(req)) {
      return res.status(403).json({ success: false, code: "code_required", message: "Enter an authenticator code before remembering this device." });
    }
    const pass = issueDeviceTrust(req.user.id);
    if (!pass) return res.status(503).json({ success: false, code: "device_trust_unconfigured", message: "Remembering devices is not set up on this server." });
    audit(req, { action: "session.device_trusted", module: "session", entityType: "session", outcome: "success", details: { days: DEVICE_TRUST_DAYS } });
    res.json({ success: true, data: pass });
  }),
);

// POST /api/auth/trusted-device/check -- does this browser's pass stand in for the code for this session?
// authenticateToken answers 401 mfa_required when it does not; reaching the handler means it does.
router.post(
  "/trusted-device/check",
  authenticateToken,
  asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
    res.json({ success: true });
  }),
);

/* POST /api/auth/password-changed -- email the account that its password changed, and when it can next
   change it (19 Oct 2026, user request: a 30-day cool-down, with an email saying so). The page calls this
   right after Supabase accepted the new password; the server only sends when the account's own record says
   the password changed in the last ten minutes, so it cannot be used to send these emails at will. */
const PASSWORD_COOLDOWN_DAYS = 30;
router.post(
  "/password-changed",
  authenticateToken,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const meta = (req.user?.user_metadata ?? {}) as Record<string, unknown>;
    const changedAt = typeof meta.password_changed_at === "string" ? new Date(meta.password_changed_at) : null;
    if (!changedAt || Number.isNaN(changedAt.getTime()) || Date.now() - changedAt.getTime() > 10 * 60_000) {
      return res.status(409).json({ success: false, code: "no_recent_change", message: "No password change to report." });
    }
    const how = req.body?.how === "reset" ? "reset" : "settings";
    const nextAllowed = new Date(changedAt.getTime() + PASSWORD_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
    if (!mailConfigured() || !req.user?.email) return res.json({ success: true, data: { sent: false, reason: "email_unconfigured", nextAllowed } });
    try {
      const sent = await sendPasswordChanged(req.user.email, changedAt, nextAllowed, how);
      res.json({ success: true, data: { sent, nextAllowed } });
    } catch (err) {
      console.error("Password-changed email failed:", err);
      res.json({ success: true, data: { sent: false, reason: "send_failed", nextAllowed } });
    }
  }),
);

/* POST /api/auth/password-reset {email} -- Navie emails the reset link itself (19 Oct 2026), with the mascot
   attached. Supabase's admin API creates the recovery link without sending anything; this server sends it
   from the Navie mailbox. A link only, no code: the user's choice.

   - Answers the same "sent" whether or not an account uses the address, so it cannot be used to find out
     who has an account.
   - One email per address, and a few per caller, per minute (in memory), so it cannot be used to flood an
     inbox.
   - 503 reset_unconfigured when there is no admin key or no mailbox: the page then falls back to Supabase's
     own email, so resetting never stops working. */
const RESET_EVERY_MS = 60_000;
const lastResetFor = new Map<string, number>();
const resetsByCaller = new Map<string, number[]>();
router.post(
  "/password-reset",
  asyncHandler(async (req, res: Response) => {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return res.status(400).json({ success: false, code: "bad_email", message: "Enter the email address you sign in with." });
    }
    const admin = supabaseAdmin();
    if (!admin || !mailConfigured()) {
      return res.status(503).json({ success: false, code: "reset_unconfigured", message: "Navie's reset email is not set up on this server." });
    }
    const now = Date.now();
    const caller = req.ip ?? "unknown";
    const recent = (resetsByCaller.get(caller) ?? []).filter((t) => now - t < RESET_EVERY_MS);
    if ((lastResetFor.get(email) ?? 0) > now - RESET_EVERY_MS || recent.length >= 5) {
      return res.status(429).json({ success: false, code: "over_email_send_rate_limit", message: "Wait a minute before asking for another email." });
    }
    lastResetFor.set(email, now);
    resetsByCaller.set(caller, [...recent, now]);
    if (lastResetFor.size > 5000) lastResetFor.clear();

    const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email });
    /* Inside the 30-day wait after a change (19 Oct 2026, user request): no reset link, but an email saying
       when the password was changed and when the next change is allowed. The link generateLink just made is
       never sent, so it is never used. The page is told "sent" either way, so it learns nothing about the
       account; the owner learns the details in their own inbox. */
    const changedAt = Date.parse(String((data?.user?.user_metadata as Record<string, unknown> | undefined)?.password_changed_at ?? ""));
    if (!error && Number.isFinite(changedAt) && changedAt + PASSWORD_COOLDOWN_DAYS * 864e5 > Date.now()) {
      try {
        await sendResetRefused(email, new Date(changedAt), new Date(changedAt + PASSWORD_COOLDOWN_DAYS * 864e5));
      } catch (err) {
        console.error("Reset-refused email failed:", err);
        return res.status(502).json({ success: false, code: "send_failed", message: "The email could not be sent. Try again in a minute." });
      }
      return res.json({ success: true, data: { sent: true, via: "navie" } });
    }
    const hash = data?.properties?.hashed_token;
    if (!error && hash) {
      const origin = (env.ALLOWED_ORIGINS[0] ?? "http://localhost:3002").replace(/\/$/, "");
      // Straight to the sign-in page, which redeems the link's token itself (no Supabase redirect involved).
      const link = `${origin}/?reset=${encodeURIComponent(hash)}`;
      try {
        await sendPasswordReset(email, link);
      } catch (err) {
        console.error("Password-reset email failed:", err);
        return res.status(502).json({ success: false, code: "send_failed", message: "The email could not be sent. Try again in a minute." });
      }
    }
    // Same answer when no account uses the address (generateLink errors): nothing to tell an outsider.
    res.json({ success: true, data: { sent: true, via: "navie" } });
  }),
);

export default router;
