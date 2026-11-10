import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import type { AuthenticatedRequest } from "./auth.middleware.js";

/**
 * Per-user limit on AI calls (security audit #14, 9 Nov 2026). Every call spends tokens against the project's key,
 * and the general limit is per address and skips this machine, so one signed-in account could spend without bound.
 * 40 calls per 10 minutes per account is far above what a person clicking "explain" or typing commands uses.
 * Mounted after authenticateToken, so the key is the account, not the address.
 */
export const aiLimiter = rateLimit({
  windowMs: 10 * 60_000,
  limit: 40,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => (req as AuthenticatedRequest).user?.id ?? ipKeyGenerator(req.ip ?? ""),
  message: { success: false, code: "ai_rate_limited", message: "Too many AI requests from this account. Try again in a few minutes." },
});
