import type { Request, Response } from "express";
import { z } from "zod";
import { getEmissionsIndexFromDb, getPeakPenaltyFromDb, getClimateResilienceFromDb, getEmissionsAnalyticsFromDb, getFleetMixForecast, getFleetProfile, getForecastProtocol } from "../services/emissions.service.js";
import { getEmissionForecast, getHorizonAccuracy } from "../services/traffic.service.js";
import { getPrescriptiveStrategies } from "../services/emissions-prescriptive.service.js";

const EmissionsAnalyticsQuerySchema = z.object({
  months: z.enum(["3", "12", "all"]).optional().default("12"),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/* The Descriptive tab's Class control (17 Oct 2026): it has always sent vehicleClass, and zod stripped it
   as an unknown key, so the filter did nothing. Coerced from the query string to the number the service takes. */
const EmissionsDescriptiveQuerySchema = EmissionsAnalyticsQuerySchema.extend({
  vehicleClass: z.coerce.number().int().min(1).max(3).optional().transform((v) => v as 1 | 2 | 3 | undefined),
});

/* The Prescriptive tab takes the same Range as the Descriptive one. Its policy input (heavyShiftPp, a chosen
   Class-3 target) went with the Class 3 shift on 2 Nov 2026: not data-backed. An old link that still sends it is
   accepted and ignored. */
const PrescriptiveQuerySchema = EmissionsAnalyticsQuerySchema;

// GET /api/emissions/prescriptive — the data-backed recommendations, computed
export const getEmissionsPrescriptive = async (req: Request, res: Response) => {
  const query = PrescriptiveQuerySchema.parse(req.query);
  const data = await getPrescriptiveStrategies(query);

  if (!data) {
    return res.status(503).json({ success: false, message: "Prescriptive strategies unavailable: database not reachable" });
  }

  res.json({ success: true, source: "database", data });
};

// GET /api/emissions/analytics — descriptive dashboard aggregates
export const getEmissionsAnalytics = async (req: Request, res: Response) => {
  const query = EmissionsDescriptiveQuerySchema.parse(req.query);
  const data = await getEmissionsAnalyticsFromDb(query);

  if (!data) {
    return res.status(503).json({ success: false, message: "Emissions analytics unavailable: database not reachable" });
  }

  res.json({ success: true, source: "database", data });
};

// [DEV-01] GET /api/v1/emissions/index
export const getEmissionsIndex = async (_req: Request, res: Response) => {
  const dbRow = await getEmissionsIndexFromDb();
  if (dbRow) {
    return res.json({ success: true, source: "database", data: dbRow });
  }

  res.json({ success: true, source: "mock", data: { aqi_level: 45, co2_emissions_tons: 120.5 } });
};

// [DEV-01] GET /api/v1/emissions/peak-penalty
export const getPeakPenalty = async (_req: Request, res: Response) => {
  const dbRow = await getPeakPenaltyFromDb();
  if (dbRow) {
    return res.json({ success: true, source: "database", data: dbRow });
  }

  res.json({ success: true, source: "mock", data: { penalty_count: 1, excess_emissions: 450.2 } });
};

// [DEV-02] GET /api/v1/emissions/resilience
export const getClimateResilience = async (_req: Request, res: Response) => {
  const dbRows = await getClimateResilienceFromDb();
  if (dbRows) {
    return res.json({ success: true, source: "database", data: dbRows });
  }

  res.json({ success: true, source: "mock", data: [{ weather_condition: "Clear", preventable_incidents: 2 }] });
};

const EmissionForecastQuerySchema = z.object({
  months: z.enum(["3", "6", "12", "all"]).optional().default("all"),
});

/**
 * GET /api/emissions/forecast — the served corridor CO2 forecast (90 days stored, each stretch tested by rolling origin).
 *
 * Public, matching /analytics: it is the predictive half of the same panel and
 * carries no more sensitivity than the descriptive half already exposed.
 */
export const getEmissionsForecast = async (req: Request, res: Response) => {
  const { months } = EmissionForecastQuerySchema.parse(req.query);

  let data;
  let horizon;
  let protocol;
  try {
    [data, horizon, protocol] = await Promise.all([
      getEmissionForecast(months === "all" ? undefined : Number(months)),
      // What each stretch of the 90-day projection is worth: the rolling-origin
      // buckets the headline WMAPE is the mean of.
      getHorizonAccuracy("Corridor CO2"),
      // How it was tested (origins x days ahead), from the stored split label.
      getForecastProtocol("Corridor CO2"),
    ]);
  } catch (error) {
    const kind = (error as { kind?: string }).kind;
    // 503 says "try again"; 500 says "this will not fix itself". Sending 503 for
    // a broken query told the client to retry something that could never succeed.
    return res.status(kind === "connectivity" ? 503 : 500).json({
      success: false,
      retryable: kind === "connectivity",
      message:
        kind === "connectivity"
          ? "Emission forecast temporarily unavailable: the database did not respond in time"
          : "Emission forecast failed: the stored forecast could not be read",
    });
  }

  if (!data) {
    return res.status(503).json({ success: false, retryable: true, message: "Emission forecast unavailable: no database connection is configured" });
  }
  if (!data.series.length) {
    return res.status(404).json({ success: false, message: "No emission forecast has been trained yet" });
  }

  const champion = data.metrics.find((m) => m.model === data.championModel) ?? null;
  // Models the trainer marked indistinguishable from the leader. Naming one a
  // winner when the gap is smaller than the run-to-run jitter would be false
  // precision, so the API reports the whole tied set.
  const coChampions = data.metrics
    .filter((m) => m.accepted && typeof m.diagnosis === "string" && m.diagnosis.startsWith("tied with"))
    .map((m) => m.model);
  /* The baselines are stored beside the models. MASE is each model's WMAPE over the BEST baseline's (that row scores
     1.000), so the card names that baseline rather than assuming one; "last week" is kept apart because it is the
     comparison a reader reaches for first. */
  const baselines = data.metrics
    .filter((m) => /^Baseline:/.test(m.model) && m.wmape != null)
    .sort((a, b) => (a.wmape as number) - (b.wmape as number));
  const brief = (m: (typeof baselines)[number] | undefined) => (m ? { model: m.model, wmape: m.wmape, mase: m.mase } : null);
  res.json({
    success: true,
    source: "database",
    data: {
      ...data,
      /* How far ahead the stored metrics were tested (17 Nov 2026: hard-coded 7 while the study scored every day out
         to 90): the split label's days ahead, else the horizon table's last bucket. */
      horizonDays: protocol?.horizonDays ?? (horizon?.length ? Math.max(...horizon.map((b) => b.hHi)) : null),
      protocol,
      bestBaseline: brief(baselines[0]),
      lastWeekBaseline: brief(baselines.find((m) => m.model === "Baseline: last week")),
      champion,
      coChampions,
      horizonAccuracy: horizon ?? [],
      /* The served models read no weather: no weather forecast covers a window that starts after the record ends,
         so the trainer serves the weather-free variant of each family (uses_weather false) and rejects the weather
         twins. Not "climatology": nothing stands in for the weather. */
      weatherAtForecastTime: champion?.uses_weather ? "observed" : "none",
    },
  });
};

const FleetMixQuerySchema = z.object({
  // Days of observed context to return before the projection. Bounded because
  // the series is daily and unbounded growth here is a slow page, not a richer
  // chart — the default covers a full seasonal swing.
  days: z.coerce.number().int().min(30).max(1500).optional().default(180),
});

// GET /api/emissions/fleet-mix — fleet composition forecast, with its accuracy by stretch of days ahead
export const getFleetMix = async (req: Request, res: Response) => {
  const { days } = FleetMixQuerySchema.parse(req.query);
  const [forecast, horizon] = await Promise.all([getFleetMixForecast(days), getHorizonAccuracy("Fleet Mix")]);
  /* The rolling-origin buckets (days 1-7, 8-14, 15-30), so the card can say every projected day was scored rather
     than "7 days validated" (17 Nov 2026). Empty when the table holds none. */
  const data = forecast ? { ...forecast, horizonAccuracy: horizon ?? [] } : null;

  if (!data) {
    return res.status(503).json({
      success: false,
      retryable: true,
      message: "Fleet-mix forecast unavailable: database not reachable",
    });
  }
  // An empty series is not an error — it means train_fleet_mix.py has not been
  // run yet. Saying so beats an empty chart with no explanation.
  if (data.series.length === 0) {
    return res.json({
      success: true,
      source: "database",
      data,
      message: "No fleet-mix forecast stored yet. Run train_fleet_mix.py to publish one.",
    });
  }
  return res.json({ success: true, source: "database", data });
};

// GET /api/emissions/fleet-profile — per-class CO2 factors + observed mix.
// Read by the simulation sandbox so its agents emit what the warehouse says
// they emit, rather than what was compiled into the bundle.
export const getFleetProfileHandler = async (_req: Request, res: Response) => {
  const data = await getFleetProfile();
  if (!data) {
    return res.status(503).json({
      success: false,
      retryable: true,
      message: "Fleet profile unavailable: database not reachable",
    });
  }
  return res.json({ success: true, source: "database", data });
};
