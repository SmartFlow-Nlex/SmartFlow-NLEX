import { Router } from "express";
import { asyncHandler } from "../middleware/error.middleware.js";
import { authenticateToken } from "../middleware/auth.middleware.js";
import {
  modelNarrative,
  congestionNarrative,
  eventSurgeNarrative,
  rankingNarrative,
  insightStatus,
  explainFeature,
  incidentModelsNarrative,
  clearanceNarrative,
  breakdownResponseNarrative,
  corridorRiskNarrative,
  highIncidentDayNarrative,
} from "../controllers/ai-insight.controller.js";

const router = Router();

/*
 * These endpoints were left unauthenticated on the stated grounds that "the
 * dashboard carries no Supabase session today", so gating them would have left
 * the narrative buttons failing beneath charts that worked. That reason expired
 * when two-step sign-in landed: the dashboard now holds a session on every page,
 * and the callers pass it (components/dashboard/AiModelInsight.tsx and
 * FeatureBriefing.tsx both go through lib/api.ts).
 *
 * Gating them matters because each call spends language-model tokens against the
 * project's own key. An open endpoint that costs money per request is a billing
 * exposure whether or not it returns anything sensitive — and these return
 * corridor analysis, which is not nothing.
 *
 * /status stays public: it reports only whether the provider is configured, and
 * the interface uses it to decide whether to offer the buttons at all.
 */
router.get("/status", asyncHandler(insightStatus));

router.use(authenticateToken);
router.post("/model-narrative", asyncHandler(modelNarrative));
router.post("/congestion-narrative", asyncHandler(congestionNarrative));
router.post("/event-surge-narrative", asyncHandler(eventSurgeNarrative));
router.post("/ranking-narrative", asyncHandler(rankingNarrative));
router.post("/explain", asyncHandler(explainFeature));

/* The incident module's other panels. Separate endpoints because none of them
 * is scored on the forecast scale -- see ai-insight.incident.service.ts. */
router.post("/incident-models-narrative", asyncHandler(incidentModelsNarrative));
router.post("/clearance-narrative", asyncHandler(clearanceNarrative));
router.post("/breakdown-response-narrative", asyncHandler(breakdownResponseNarrative));
router.post("/corridor-risk-narrative", asyncHandler(corridorRiskNarrative));
router.post("/high-incident-day-narrative", asyncHandler(highIncidentDayNarrative));

export default router;
