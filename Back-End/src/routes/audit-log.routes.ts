import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { asyncHandler } from "../middleware/error.middleware.js";
import { exportAuditLogs, getAuditSummary, listAuditLogs, recordActivity, writeAuditEvent } from "../controllers/audit-log.controller.js";
import { authenticateToken, authorizeRoles } from "../middleware/auth.middleware.js";

const router = Router();

// What a page reports about itself (viewed, signed in, signed out, exported): any user, signed in or not.
// Only those four kinds are accepted; the user is the one the token names, if any.
// Open to anonymous callers (a sign-in page reports itself before there is a token), so it has its own tight limit:
// 30 a minute per address, against the API's 200 per 15 minutes (security audit #10, 9 Nov 2026). Anonymous
// entries are recorded as "anonymous", never under a name the caller claims (services/audit.ts).
const activityLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: (req) => req.ip === "127.0.0.1" || req.ip === "::1" || req.ip === "::ffff:127.0.0.1",
  message: { success: false, message: "Too many activity reports; slow down." },
});
router.post("/activity", activityLimiter, asyncHandler(recordActivity));

// Apply auth middleware to the remaining audit-log endpoints
router.use(authenticateToken);
router.use(authorizeRoles(["data-analyst"]));

// Reads name people and what they did, and the page is the data analyst's only, so the API says the same (31 Oct 2026).
router.get("/list", asyncHandler(listAuditLogs));
router.get("/summary", asyncHandler(getAuditSummary));
router.post("/event", asyncHandler(writeAuditEvent));
router.get("/export", asyncHandler(exportAuditLogs));

export default router;
