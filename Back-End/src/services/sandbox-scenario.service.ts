import { db } from "../config/db.js";
import { cached } from "../utils/ttl-cache.js";
import {
  getMLPredictiveVolume,
  getMLPredictiveVolumeHourly,
  getMLModelMetrics,
  getEmissionForecast,
} from "./traffic.service.js";
import {
  getIncidentHourlyFromDb,
  getIncidentPredictiveFromDb,
  getIncidentPredictiveAnchors,
} from "./incident.service.js";

/* ══════════════════════════════════════════════════════════════════════════════
   SCENARIO CONTEXT — THE PRESCRIPTIVE JOIN

   The three predictive modules each answer "what will happen" for their own
   quantity. The sandbox answers "what should we do about it". This is the seam:
   it takes one forecast date and returns what all three modules expect for that
   day, so a simulation can start from a predicted Tuesday rather than from an
   annual average.

   The dates offered are the ones the VOLUME and EMISSION forecasts both cover,
   because the volume forecast is what actually seeds the simulation. The
   horizons differ — volume and emissions store 90 future days, incidents
   currently 28 — so a date past the incident horizon is still offered, but its
   incident figures are returned as absent (covered: false) with a note saying
   so. They are never filled from a default or stretched from another date:
   a scenario is seeded only from what a model actually forecast for that day.
   When the incident model's horizon grows, the covered range grows with it.

   Nothing here decides policy. It reports what was forecast and how accurate
   each forecast has been; the operator decides what to simulate against it.
══════════════════════════════════════════════════════════════════════════════ */

/**
 * A corridor forecast to the traffic on ONE STRETCH, in ONE DIRECTION (17 Nov 2026).
 *
 * The forecast is a corridor total: every vehicle once, at whichever plaza it paid. It is not the flow past any
 * one point, and it has no direction. This used to load the busiest plaza's share of it (18.4%, Bocaue Barrier)
 * as the inflow of every stretch and both carriageways alike: 3,465 veh/h at 08:00 on 25 May 2026 at Km 12, Km 50
 * and Km 86, northbound and southbound, where the record puts 2,755 / 4,407 at Km 12 and 1,059 / 126 at Km 86.
 *
 * What the forecast can say honestly is how busy the corridor will be at an hour against how busy it usually is
 * then. So this returns that ratio for each hour — the forecast's corridor total against the corridor's mean for
 * the same hour over every day in the record (gold.fact_traffic_hourly, the same days the sandbox's per-stretch
 * flows are averaged over) — and the sandbox multiplies each stretch's own recorded flow for that hour and
 * direction by it (useDirectionSim). The stretch keeps its own level and its own direction; the forecast moves it.
 * The assumption left is that a stretch's share of the corridor at an hour is the same on the forecast day as on
 * an average day.
 */

/** Read once and kept, like the inputs below: the record changes only when toll data is reloaded. */
async function getTypicalCorridorHourly(): Promise<number[] | null> {
  if (!db) return null;
  try {
    const { rows } = await db.query(
      `SELECT hour::int AS hour, AVG(v)::float AS v
         FROM (SELECT date, hour, SUM(total) AS v FROM gold.fact_traffic_hourly WHERE total IS NOT NULL GROUP BY 1, 2) d
        GROUP BY 1 ORDER BY 1`,
    );
    const out: number[] = Array(24).fill(0);
    for (const r of rows as { hour: number; v: number }[]) if (r.hour >= 0 && r.hour < 24) out[r.hour] = Number(r.v) || 0;
    return out.every((v) => v > 0) ? out : null;
  } catch (error) {
    console.error("Failed to read the corridor's typical hourly volume:", error);
    return null;
  }
}

export type ScenarioContext = {
  date: string;
  /** Every date the volume and emission forecasts both cover. The picker offers only these. */
  availableDates: string[];
  volume: {
    /** Corridor-wide daily total the champion predicts for this date. */
    dailyVehicles: number | null;
    /**
     * Corridor-wide vehicles the champion predicts for each hour (0-23) of this date: the Traffic page's own
     * hourly drill-down for the same model — the day's prediction spread over this weekday's typical shape.
     * Null when no hourly shape exists for the date.
     */
    hourly: (number | null)[] | null;
    /** The corridor's mean vehicles at each hour (0-23) over every day in the record (gold.fact_traffic_hourly). */
    typicalHourly: number[] | null;
    /**
     * `hourly` / `typicalHourly`: how much busier (above 1) or quieter (below 1) the corridor is forecast to be at
     * each hour than it usually is then. The sandbox multiplies each stretch's own recorded flow by it.
     */
    hourlyScale: (number | null)[] | null;
    /** The forecast day's total against the record's mean daily total: the scale used when the date has no hourly shape. */
    dayScale: number | null;
    model: string | null;
    wmape: number | null;
  };
  incidents: {
    /** Whether the incident model forecasts THIS date. When false, every figure below is empty. */
    covered: boolean;
    /** Last date the incident model forecasts, or null if its forecast is unavailable. */
    coverageEnd: string | null;
    /** Corridor-wide expected incidents on this date. */
    predictedForDate: number | null;
    model: string | null;
    /**
     * Expected incidents at each exit ON THIS DATE — the module publishes an
     * apportionment over its whole horizon, divided here by the horizon length
     * so the figure beside a one-day scenario is a one-day figure. Empty for a
     * date outside that horizon: the apportionment describes those 28 days, not
     * any later one.
     */
    byExit: { exitName: string; km: number; perDay: number }[];
    horizonDays: number;
    /**
     * Whole incidents the champion expects in each hour (0-23) of this date, corridor-wide: the Incident
     * page's own hourly drill-down for the same model. That model predicts a daily count only, so this is
     * the day spread over the weekday's typical shape and rounded — a derived curve, as that page labels it.
     * Null when the date is outside the incident horizon or no shape exists.
     */
    hourly: number[] | null;
    hourlyModel: string | null;
  };
  emissions: {
    predictedTonnes: number | null;
    model: string | null;
    wmape: number | null;
  };
  /**
   * The fleet-mix model's forecast Class 1 / 2 / 3 shares for this date (fractions summing to 1), which is what
   * sets the mix of vehicles the road runs. That model's horizon is 7 days against the volume model's ~90, so most
   * dates have none: null, and the road keeps the observed hourly mix rather than borrowing another day's.
   */
  fleet: { c1: number; c2: number; c3: number; heavyShare: number; heavySurge: boolean; model: string | null } | null;
  /** Set when a module forecasts the date but stored no value for it, or does not forecast it. */
  notes: string[];
};

/**
 * Calendar date on the corridor, as Asia/Manila.
 *
 * The three modules do not agree on a type. gold.ml_predictive_volume stores a
 * timestamp — midnight Manila, which is 16:00Z the day BEFORE — while the
 * incident and emission series return plain "YYYY-MM-DD" strings. Formatting the
 * timestamp naively gave "Wed Dec 31" and, once that was fixed, taking its UTC
 * date would still have named the previous day and matched nothing.
 *
 * Shifting by +8h before reading the UTC parts lands on the same day the charts
 * label, without depending on the server's own timezone.
 */
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

const iso = (value: unknown): string => {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return "";
  return new Date(d.getTime() + MANILA_OFFSET_MS).toISOString().slice(0, 10);
};

const readableDay = (isoDay: string) =>
  new Date(`${isoDay}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

/**
 * gold.ml_predictive_fleet_mix is written by the fleet-mix training script, and no API route serves it, so it is read
 * here. Absent table, absent day, or shares that do not form a composition all give null — never a default mix.
 */
async function getFleetMixForDate(date: string): Promise<ScenarioContext["fleet"]> {
  if (!db) return null;
  try {
    const { rows } = await db.query(
      `SELECT pred_c1::float AS c1, pred_c2::float AS c2, pred_c3::float AS c3,
              heavy_pred::float AS heavy, heavy_surge, champion_model
       FROM gold.ml_predictive_fleet_mix
       WHERE forecast_date = $1::date AND pred_c1 IS NOT NULL AND pred_c2 IS NOT NULL AND pred_c3 IS NOT NULL
       ORDER BY updated_at DESC LIMIT 1`,
      [date],
    );
    const r = rows[0];
    if (!r) return null;
    const sum = r.c1 + r.c2 + r.c3;
    if (![r.c1, r.c2, r.c3].every((v) => Number.isFinite(v) && v >= 0) || Math.abs(sum - 1) > 0.02) return null;
    return {
      c1: r.c1 / sum,
      c2: r.c2 / sum,
      c3: r.c3 / sum,
      heavyShare: (r.c2 + r.c3) / sum,
      heavySurge: Boolean(r.heavy_surge),
      model: r.champion_model ?? null,
    };
  } catch {
    return null;
  }
}

/* The five inputs below are the same whichever date is asked for, and together they took 7-8 s to
 * read. Every date the operator picks is a new URL to the route cache, so each pick read all five
 * again. They are now kept for ten minutes, like the routes that serve them elsewhere (the tables
 * change only when a pipeline re-runs); only the per-date work further down runs for each pick. */
const SCENARIO_INPUT_TTL_MS = 10 * 60_000;

export async function getScenarioContext(date?: string): Promise<ScenarioContext | null> {
  const anchors = await cached("incident:anchors", SCENARIO_INPUT_TTL_MS, getIncidentPredictiveAnchors);

  const [volumes, metrics, emissions, incidents, typicalHourly] = await Promise.all([
    cached("scenario:volume", SCENARIO_INPUT_TTL_MS, () => getMLPredictiveVolume({ months: "all" })),
    cached("scenario:metrics", SCENARIO_INPUT_TTL_MS, () => getMLModelMetrics("80_20")),
    cached("scenario:emissions", SCENARIO_INPUT_TTL_MS, () => getEmissionForecast()),
    // "all" weather: the scenario picker does not filter by weather, so the
    // unfiltered forecast is the right one to seed from.
    anchors
      ? cached(`scenario:incidents:${JSON.stringify(anchors)}`, SCENARIO_INPUT_TTL_MS, () => getIncidentPredictiveFromDb({ weather: "all" }, anchors))
      : Promise.resolve(null),
    cached("scenario:typical-hourly", SCENARIO_INPUT_TTL_MS, getTypicalCorridorHourly),
  ]);

  // Volume seeds the simulation and emissions define the offered range, so
  // both are required. Incidents are not: a missing incident forecast leaves
  // those figures empty rather than taking the whole panel down.
  if (!volumes || !emissions) return null;

  // ── the dates on offer ──────────────────────────────────────────────────────
  const volFuture = new Map<string, any>();
  for (const r of volumes as any[]) if (r.is_future) volFuture.set(iso(r.date), r);

  const emiFuture = new Map<string, any>();
  for (const r of (emissions as any).series ?? []) {
    if (r.zone === "future") emiFuture.set(iso(r.date), r);
  }

  const incFuture = new Map<string, any>();
  for (const r of (incidents as any)?.daily ?? []) {
    if (r.predictionType === "future") incFuture.set(iso(r.date), r);
  }
  const incDates = [...incFuture.keys()].sort();
  const coverageEnd = incDates.length > 0 ? incDates[incDates.length - 1] : null;

  const availableDates = [...volFuture.keys()].filter((d) => emiFuture.has(d)).sort();

  if (availableDates.length === 0) return null;

  const chosen = date && availableDates.includes(date) ? date : availableDates[0];
  const notes: string[] = [];

  // ── volume ──────────────────────────────────────────────────────────────────
  /* The best model available, preferring an accepted one.
   *
   * This used to REQUIRE `accepted`, and since the honest retrain every volume
   * model fails the MASE gate — none beats a seasonal-naive baseline. So
   * `champion` was always null, the column was never read, and the panel
   * refused to load a day whose forecast was sitting right there: Prophet has
   * 354,854 vehicles stored for 2026-01-21.
   *
   * Refusing to seed a what-if sandbox because the forecast is imperfect is
   * not a choice to make on the operator's behalf. The best-ranked model is
   * used and the rejection is REPORTED instead — the same call the traffic
   * optimiser makes. */
  const accepted = (metrics ?? []).find((m) => m.accepted && m.wmape != null) ?? null;
  const champion = accepted ?? (metrics ?? []).find((m) => m.wmape != null) ?? null;
  const vRow = volFuture.get(chosen);

  // Read the champion's own column rather than a fixed one, so a retrain that
  // changes the winner changes what the sandbox is seeded from.
  const COLUMN: Record<string, string> = {
    Prophet: "pred_prophet",
    LSTM: "pred_lstm",
    HoltWinters: "pred_holtwinters",
    SARIMAX: "pred_sarimax",
    Holts_Linear: "pred_holts_linear",
    Prophet_nw: "pred_prophet_nw",
    SARIMAX_nw: "pred_sarimax_nw",
    LSTM_nw: "pred_lstm_nw",
  };
  const col = champion ? COLUMN[champion.model] : undefined;
  const rawDaily = col && vRow?.[col] != null ? Number(vRow[col]) : null;

  if (typicalHourly == null) {
    notes.push(
      "The corridor's typical hourly volume could not be read, so the forecast cannot be compared with a usual day and is not loaded into the simulation.",
    );
  }

  /* Seeded from a model that was rejected — said plainly rather than hidden.
     The operator should know the level is indicative before they build a
     scenario on it. */
  if (champion != null && accepted == null) {
    notes.push(
      `${champion.model} is the best-ranked volume model but did NOT pass its acceptance gate: it does not beat a seasonal-naive baseline on MASE. The scenario is seeded from it anyway — treat the level as indicative.`,
    );
  }
  if (rawDaily == null) {
    /* Say which of the two it actually is. "The champion stored no prediction"
       was reported for BOTH a missing row and a missing champion, and it was
       always the second — which sent the reader hunting for absent data that
       was never absent. */
    notes.push(
      champion == null
        ? "No volume model has usable metrics, so corridor volume could not be seeded."
        : `The ${champion.model} forecast has no row for this date.`,
    );
  }

  // ── incidents ───────────────────────────────────────────────────────────────
  const covered = incFuture.has(chosen);
  const iRow = incFuture.get(chosen);
  const horizonDays = Math.max(1, Number((incidents as any)?.corridorForecastDays) || incFuture.size);
  const byExit = covered
    ? ((incidents as any)?.corridorForecast ?? [])
        .map((x: any) => ({
          exitName: String(x.exitName),
          km: Number(x.km),
          // The published figure covers the whole horizon; a one-day scenario
          // needs a one-day number.
          perDay: Number(x.predictedIncidents) / horizonDays,
        }))
        .sort((a: any, b: any) => b.perDay - a.perDay)
    : [];

  if (!covered) {
    notes.push(
      coverageEnd
        ? `No incident forecast for this date — the incident model currently forecasts through ${readableDay(coverageEnd)}. Traffic and CO₂ are still forecast; place incidents yourself to test a response.`
        : "The incident forecast is unavailable, so no incident figures are shown. Traffic and CO₂ are still forecast.",
    );
  }

  // ── the hour ────────────────────────────────────────────────────────────────
  // The Traffic and Incident pages each draw this date hour by hour. Reading the same functions with the
  // same model is what makes the sandbox show the figures those pages show, rather than a copy of their
  // logic that can drift. Either can be missing (no weekday shape, outside the incident horizon), and
  // then the field is null — never a number borrowed from another hour or day.
  const [hourlyVol, hourlyInc, fleet] = await Promise.all([
    champion && rawDaily != null && col ? getMLPredictiveVolumeHourly(chosen, champion.model, "all") : Promise.resolve(null),
    covered ? getIncidentHourlyFromDb(chosen) : Promise.resolve(null),
    getFleetMixForDate(chosen),
  ]);
  if (!fleet) {
    notes.push(
      "No fleet-mix forecast for this date (that model forecasts about a week ahead), so the vehicle mix on the road is the observed mix for the chosen hour.",
    );
  }
  const hourly = hourlyVol?.hours.some((h) => h.predicted != null) ? hourlyVol.hours.map((h) => h.predicted) : null;
  const round3 = (v: number) => Math.round(v * 1000) / 1000;
  const hourlyScale =
    hourly && typicalHourly
      ? hourly.map((v, h) => (v == null || !(typicalHourly[h] > 0) ? null : round3(v / typicalHourly[h])))
      : null;
  const typicalDay = typicalHourly ? typicalHourly.reduce((s, v) => s + v, 0) : 0;
  const dayScale = rawDaily != null && Number.isFinite(rawDaily) && typicalDay > 0 ? round3(rawDaily / typicalDay) : null;
  const incChampion = (hourlyInc as any)?.models?.find((m: any) => m.isChampion) ?? null;
  const incHourly: number[] | null =
    incChampion && Array.isArray(incChampion.hours) && incChampion.hours.every((v: unknown) => typeof v === "number")
      ? (incChampion.hours as number[])
      : null;

  // ── emissions ───────────────────────────────────────────────────────────────
  const eRow = emiFuture.get(chosen);
  const eChampion = (emissions as any).championModel ?? null;
  const eMetric = ((emissions as any).metrics ?? []).find((m: any) => m.model === eChampion) ?? null;

  return {
    date: chosen,
    availableDates,
    volume: {
      dailyVehicles: rawDaily,
      hourly,
      typicalHourly: typicalHourly ? typicalHourly.map((v) => Math.round(v)) : null,
      hourlyScale,
      dayScale,
      model: champion?.model ?? null,
      wmape: champion?.wmape ?? null,
    },
    incidents: {
      covered,
      coverageEnd,
      predictedForDate: covered && iRow?.predicted != null ? Number(iRow.predicted) : null,
      model: (incidents as any)?.summary?.championModel ?? null,
      byExit,
      horizonDays,
      hourly: incHourly,
      hourlyModel: incHourly ? String(incChampion.key) : null,
    },
    emissions: {
      predictedTonnes: eRow?.predicted != null ? Number(eRow.predicted) : null,
      model: eChampion,
      wmape: eMetric?.wmape ?? null,
    },
    fleet,
    notes,
  };
}
