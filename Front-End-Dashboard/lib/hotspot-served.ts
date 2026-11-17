/**
 * Which forecast the incident-hotspot grid actually shows.
 *
 * train_incident_spatial_models.py scores every candidate on rolling origins and, when no model beats the best
 * baseline, serves that baseline (spatial_lstm.served_model, metrics.champion_is_baseline). The grid's numbers are
 * then the baseline's, so the cards name it and quote its error, not the Spatial LSTM's (15 Nov 2026: the rolling
 * test put the same-weekday average at MAE 2.115 and the Spatial LSTM at 2.230, and the card still said "Spatial LSTM").
 */
type SpatialMeta = { served_model?: string; metrics?: object } | null | undefined;

const BASELINES: Record<string, { label: string; maeKey: string }> = {
  "Baseline: same weekday, trailing 52 weeks": {
    label: "Same-weekday average (last 52 weeks)",
    maeKey: "baseline_mae_same_weekday_52w",
  },
  "Baseline: trailing 365-day mean": { label: "Average of the last 365 days", maeKey: "baseline_mae_trailing_365" },
};

export type HotspotServed = {
  /** True when the grid shows a baseline because no model beat it. */
  isBaseline: boolean;
  /** What to call the grid's forecast. */
  name: string;
  /** The held-out error of what the grid shows. */
  mae: number | null;
  /** The Spatial LSTM's own held-out error, for the comparison line. */
  lstmMae: number | null;
};

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function hotspotServed(meta: SpatialMeta): HotspotServed {
  const m = (meta?.metrics ?? {}) as Record<string, unknown>;
  const lstmMae = num(m.MAE);
  const served = meta?.served_model;
  if (m.champion_is_baseline === true && served) {
    const known = BASELINES[served];
    const bare = served.replace(/^Baseline:\s*/i, "");
    return {
      isBaseline: true,
      name: known?.label ?? bare.charAt(0).toUpperCase() + bare.slice(1),
      mae: known ? num(m[known.maeKey]) : null,
      lstmMae,
    };
  }
  return { isBaseline: false, name: "Spatial LSTM", mae: lstmMae, lstmMae };
}
