import { Router } from "express";
import { asyncHandler } from "../middleware/error.middleware.js";
import { createSchedule, listSchedules, updateSchedule, updateScheduleStatus, deleteSchedule } from "../controllers/maintenance.controller.js";
import { authenticateToken, authorizeRoles } from "../middleware/auth.middleware.js";

const router = Router();

/*
 * Reading a schedule is public; changing one is not.
 *
 * Every endpoint here was unauthenticated, including the four that write. Anyone
 * able to reach the API could create a closure on the corridor, edit someone
 * else's, advance its status, or delete it outright — and the dashboard records
 * each of those in the audit log against whatever actor the caller claimed to
 * be, which makes the log confirm a change it cannot attribute.
 *
 * The split rather than a blanket guard is deliberate. GET /list is the read
 * path the mobile application uses to show drivers what work is planned, and it
 * carries no session; putting it behind a token would take planned-closure
 * information away from the people the closures affect. The write endpoints have
 * no such consumer.
 */

// GET /api/maintenance/list — public: consumed by the mobile application
router.get("/list", asyncHandler(listSchedules));

// Everything below changes a schedule and requires an authenticated operator.
router.use(authenticateToken);
router.use(authorizeRoles(["data-analyst", "tcc-operator"]));

router.post("/schedule", asyncHandler(createSchedule));
router.put("/:id", asyncHandler(updateSchedule));
router.patch("/:id/status", asyncHandler(updateScheduleStatus));
router.delete("/:id", asyncHandler(deleteSchedule));

export default router;
