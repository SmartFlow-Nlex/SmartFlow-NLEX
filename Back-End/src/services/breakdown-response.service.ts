import { db } from "../config/db.js";

// Reads gold.ml_breakdown_response_predictions / _curve / _group_stats /
// _metadata — written by
// Back-End/incident_model_scripts/train_breakdown_response_models.py.
//
// The trained-model counterpart to the Descriptive tab's Response Time
// Breakdown card (getEventBreakdownFromDb / /api/incident/event-breakdown),
// which reports the same two groupings (by cause, by service) from measured
// history alone. This adds the predicted half: a Cox PH / XGBoost model
// (whichever holds up better on a chronological, event-grouped holdout —
// see the training script's own doc comment for why the split is grouped by
// breakdown event, not by row) predicting a deployment's response_time_min
// from pre-dispatch context, reported as Actual vs Predicted median minutes
// per group — the same Actual/Predicted shape
// incident-severity.service.ts's severityBreakdown already uses for
// severity counts, here applied to a continuous duration instead.
//
// breakdown_data only: accident_data carries no per-dispatch response
// record at all (see incident.service.ts's avgTimeToFirstResponder KPI
// comment), so there is nothing to blend in from that table.

export type BreakdownResponseGroupStat = {
  group: string;
  n: number;
  actualMedianMin: number | null;
  predictedMedianMin: number | null;
};

// Empirical (Kaplan-Meier) survival curve points — same shape as
// incident-severity.service.ts's SurvivalCurvePoint, minus the km-quantile
// fields that dimension never uses here (this pipeline only groups by
// 'baseline' / 'cause' / 'service', see the training script's build_curves).
export type BreakdownResponseCurvePoint = {
  group: string;
  dimension: string;
  timeMin: number;
  survivalProbability: number;
  n: number;
};

export type BreakdownResponseData = {
  byCause: BreakdownResponseGroupStat[];
  byService: BreakdownResponseGroupStat[];
  survivalCurve: BreakdownResponseCurvePoint[];
  championModel: string | null;
  trainedAt: string | null;
  metadata: Record<string, unknown> | null;
  /** The held-out dispatches the predictions apply to, by event date (17 Oct 2026, testers IN-12). */
  holdoutWindow: { from: string; to: string; n: number } | null;
  /** The day and time block byCause/byService were cut to, or null for every held-out dispatch. */
  slot: { dow: number | null; block: number | null; n: number } | null;
};

/* A day of week (0 = Sunday, as Postgres and JS number them) and a 3-hour block of the day (0 = 12-3 AM
   ... 7 = 9 PM-12 AM). Either may be absent. */
export type BreakdownResponseSlot = { dow?: number; block?: number };

export async function getBreakdownResponseFromDb(slot: BreakdownResponseSlot = {}): Promise<BreakdownResponseData | null> {
  if (!db) return null;
  try {
    /* Cut to a day and time (19 Oct 2026, testers IN-12: "show the date/time the prediction is for; add a
       day/time filter; make it read as predictive"). The model takes hour_of_day, dow and is_weekend as
       inputs (train_breakdown_response_models.py, NUMERIC_COLS), so its prediction for a dispatch depends
       on when the breakdown was reported. The medians are taken over the held-out dispatches reported in
       that slot, from the per-dispatch predictions the trainer wrote. reported_at is timestamptz but holds
       the source's local (UTC+8) wall time as if it were UTC: the trainer reads silver's timestamp-without-
       zone event_encoded_date as a naive time (its hour_of_day is that wall-clock hour) and inserts it
       through a UTC session. So it is read back AT TIME ZONE 'UTC', which returns that wall time whatever
       the session TimeZone is; 'Asia/Manila' (right for emissions' real instants) would shift it 8 hours.
       Blocks are three hours, not one: an hour of one weekday holds about 60 held-out dispatches, too few
       for the smaller causes. */
    const hasSlot = slot.dow != null || slot.block != null;
    // The slot read is independent of the five below, so it runs alongside them.
    const [slotRes, statsRes, curveRes, metaRes, predRes, windowRes] = await Promise.all([
      hasSlot
        ? db.query<{ dimension: string; group_label: string; n: number; actual_median_min: number | null; predicted_median_min: number | null }>(
            `WITH p AS (
               SELECT main_cause, service, actual_response_min, predicted_response_min
               FROM gold.ml_breakdown_response_predictions
               WHERE ($1::int IS NULL OR EXTRACT(dow FROM reported_at AT TIME ZONE 'UTC')::int = $1)
                 AND ($2::int IS NULL OR FLOOR(EXTRACT(hour FROM reported_at AT TIME ZONE 'UTC') / 3)::int = $2)
             )
             SELECT 'cause' AS dimension, main_cause AS group_label, COUNT(*)::int AS n,
                    ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY actual_response_min))::numeric, 1)::float AS actual_median_min,
                    ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY predicted_response_min))::numeric, 1)::float AS predicted_median_min
             FROM p WHERE main_cause IS NOT NULL GROUP BY main_cause
             UNION ALL
             SELECT 'service', service, COUNT(*)::int,
                    ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY actual_response_min))::numeric, 1)::float,
                    ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY predicted_response_min))::numeric, 1)::float
             FROM p WHERE service IS NOT NULL GROUP BY service
             ORDER BY 1, 3 DESC`,
            [slot.dow ?? null, slot.block ?? null]
          )
        : null,
      db.query<{ dimension: string; group_label: string; n: number; actual_median_min: number | null; predicted_median_min: number | null }>(
        `SELECT dimension, group_label, n, actual_median_min, predicted_median_min
         FROM gold.ml_breakdown_response_group_stats
         ORDER BY dimension, n DESC`
      ),
      db.query<{ group_label: string; dimension: string; time_min: number; survival_probability: number; n: number }>(
        `SELECT group_label, dimension, time_min, survival_probability, n
         FROM gold.ml_breakdown_response_curve
         ORDER BY group_label, time_min`
      ),
      db.query<{ metadata_json: Record<string, unknown>; created_at: string }>(
        `SELECT metadata_json, created_at FROM gold.ml_breakdown_response_metadata
         ORDER BY created_at DESC LIMIT 1`
      ),
      db.query<{ response_model: string; trained_at: string }>(
        `SELECT response_model, trained_at FROM gold.ml_breakdown_response_predictions
         ORDER BY trained_at DESC LIMIT 1`
      ),
      // The table holds the holdout rows only (the trainer deletes and rewrites it each run).
      db.query<{ from_date: string | null; to_date: string | null; n: string | number }>(
        `SELECT MIN(event_date)::text AS from_date, MAX(event_date)::text AS to_date, COUNT(*) AS n
         FROM gold.ml_breakdown_response_predictions`
      ),
    ]);

    if (statsRes.rows.length === 0 && curveRes.rows.length === 0) {
      // Tables exist (ensure_schema ran) but the pipeline hasn't written yet.
      return null;
    }

    const toStat = (r: { group_label: string; n: number; actual_median_min: number | null; predicted_median_min: number | null }): BreakdownResponseGroupStat => ({
      group: r.group_label,
      n: r.n,
      actualMedianMin: r.actual_median_min == null ? null : Number(r.actual_median_min),
      predictedMedianMin: r.predicted_median_min == null ? null : Number(r.predicted_median_min),
    });

    // The trainer's whole-holdout group stats, unless a slot was asked for. The trainer keeps only groups
    // with enough evidence (TOP_N_GROUPS), so a slot keeps the same group names and no others.
    const known = new Set(statsRes.rows.map((r) => `${r.dimension}|${r.group_label}`));
    const groupRows = slotRes ? slotRes.rows.filter((r) => known.has(`${r.dimension}|${r.group_label}`)) : statsRes.rows;
    // Every dispatch in the slot, not only the groups kept: every held-out row has a service (the trainer
    // selects only deployments that name one), so summing all the slot's service rows, before the filter, counts each once.
    const slotN = slotRes ? slotRes.rows.filter((r) => r.dimension === "service").reduce((s, r) => s + Number(r.n), 0) : 0;

    return {
      byCause: groupRows.filter((r) => r.dimension === "cause").map(toStat),
      byService: groupRows.filter((r) => r.dimension === "service").map(toStat),
      slot: hasSlot ? { dow: slot.dow ?? null, block: slot.block ?? null, n: slotN } : null,
      survivalCurve: curveRes.rows.map((r) => ({
        group: r.group_label,
        dimension: r.dimension,
        timeMin: Number(r.time_min),
        survivalProbability: Number(r.survival_probability),
        n: r.n,
      })),
      championModel: predRes.rows[0]?.response_model ?? (metaRes.rows[0]?.metadata_json?.champion as string | undefined) ?? null,
      trainedAt: predRes.rows[0]?.trained_at ? new Date(predRes.rows[0].trained_at).toISOString() : null,
      metadata: metaRes.rows[0]?.metadata_json ?? null,
      holdoutWindow:
        windowRes.rows[0]?.from_date && windowRes.rows[0]?.to_date
          ? { from: windowRes.rows[0].from_date, to: windowRes.rows[0].to_date, n: Number(windowRes.rows[0].n) }
          : null,
    };
  } catch (error) {
    console.error("Failed to fetch breakdown response models:", error);
    return null;
  }
}
