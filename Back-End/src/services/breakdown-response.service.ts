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
};

export async function getBreakdownResponseFromDb(): Promise<BreakdownResponseData | null> {
  if (!db) return null;
  try {
    const [statsRes, curveRes, metaRes, predRes] = await Promise.all([
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

    return {
      byCause: statsRes.rows.filter((r) => r.dimension === "cause").map(toStat),
      byService: statsRes.rows.filter((r) => r.dimension === "service").map(toStat),
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
    };
  } catch (error) {
    console.error("Failed to fetch breakdown response models:", error);
    return null;
  }
}
