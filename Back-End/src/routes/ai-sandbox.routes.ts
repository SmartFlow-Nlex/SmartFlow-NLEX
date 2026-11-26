import { Router } from "express";
import { asyncHandler } from "../middleware/error.middleware.js";
import { parseSandboxCommand, commandStatus, scenarioContext, demandExits, demandProfile, plazaFlows, hotspots, eventDay } from "../controllers/sandbox-command.controller.js";
import { authenticateToken, authorizeRoles } from "../middleware/auth.middleware.js";
import { aiLimiter } from "../middleware/ai-limit.js";

const router = Router();

/**
 * The command parser reads nothing and writes nothing, but every call costs GLM tokens, so it takes a signed-in
 * user of a role the Sandbox is open to (2 Nov 2026). It was open while the dashboard sent no session token; the
 * sandbox now sends one (lib/api.ts apiFetch). The status check stays open: it says only whether the parser is set up.
 */
router.get("/command/status", asyncHandler(commandStatus));
router.post("/command", authenticateToken, authorizeRoles(["data-analyst", "tcc-operator"]), aiLimiter, asyncHandler(parseSandboxCommand));
router.get("/scenario", asyncHandler(scenarioContext));

/* Observed demand. Public for the same reason as the routes above: the
 * dashboard carries no session yet, and these read published warehouse
 * aggregates with no per-user content. */
router.get("/demand-exits", asyncHandler(demandExits));
router.get("/demand-profile", asyncHandler(demandProfile));
router.get("/plaza-flows", asyncHandler(plazaFlows));
// Where incidents of a kind are recorded — the published logs, aggregated; no per-user content.
router.get("/hotspots", asyncHandler(hotspots));
// Upcoming Arena event days and their hourly effect per exit, from the Event Prediction; no per-user content.
router.get("/event-day", asyncHandler(eventDay));

/* POST /config-lanes and GET /results/:id were removed (17 Nov 2026): mocks nothing called, the first answering
   "Lanes configured successfully" to anything valid and the second inventing a completed result for any id.
   POST /simulate followed (19 Nov 2026 audit S19): it inserted a 'running' row into sandbox_simulations that
   nothing ever read or completed, and answered source "mock" when the database was down. The simulation runs in
   the browser (scenario-sandbox/simulation.ts); the empty table is left for a later clean-up. */

export default router;
