"use client";

import { useEffect, useState } from "react";
import type { EChartsOption } from "echarts";
import { useThemeTokens } from "./useThemeTokens";
import DashboardChart from "./DashboardChart";
import InfoTooltip from "./InfoTooltip";
import { shadeFor } from "./PredictiveCorridorChart";
import { fmtInt, fmtNum } from "./incidentPredictive.shared";
import CorridorRiskNarrative from "./CorridorRiskNarrative";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

// Reads /api/incident/spatial — the two per-exit models from
// train_incident_spatial_models.py that, until now, had a working endpoint
// and nothing rendering it: GWR's local coefficient map (explanatory, fit
// in-sample over the 20 exits) and the Spatial LSTM's next-24h per-exit
// ranking (a genuine, temporally-held-out forecast). Kept as one panel with
// two clearly separated halves rather than two cards, since the point of
// showing both together is the contrast — one is a forecast, the other
// isn't, and conflating them would be the mistake this panel exists to avoid.
//
// The Spatial LSTM half is this card's actual "hotspots" output — on the
// Predictive tab in place of Predicted Incidents Ranking (which apportions
// the walk-forward forecast's total by historical location share, a
// derived split rather than a per-exit model) because this ranking is a
// real next-24h forecast, genuinely held out in time rather than derived.
type GwrCoefficient = {
  exitId: number; exitName: string; km: number; variable: string;
  coefficient: number; stdError: number | null; tValue: number | null; significant: boolean | null;
};
type SegmentRisk = {
  exitId: number; exitName: string; km: number; forecastDate: string;
  // 1 = the real next-24h model output; 2..horizonDays is a recursive
  // rollout (each day's prediction feeds the next day's input) — see
  // spatial_lstm.rollout_assumptions below for what it holds flat to do so.
  horizonDay: number;
  predictedIncidents: number; lastObservedCount: number | null; rank: number;
};
type GwrMetrics = { MAE: number; Poisson_Deviance: number; n: number; loocv_mae: number | null; loocv_n: number };
type LstmMetrics = { MAE: number; Poisson_Deviance: number; n?: number; epochs?: number };
type Metadata = {
  gwr?: { bandwidth: number; metrics: GwrMetrics; variables: string[] };
  spatial_lstm?: {
    metrics: LstmMetrics; seq_len: number; n_neighbors: number;
    horizon_days?: number; rollout_assumptions?: string;
  };
};
type SpatialData = {
  coefficients: GwrCoefficient[];
  segmentRisk: SegmentRisk[];
  metadata: Metadata | null;
  trainedAt: string | null;
};

const VARIABLE_LABEL: Record<string, string> = {
  km: "Corridor position",
  access_count: "Access-point count",
  mean_log_volume: "Typical traffic volume",
};

export default function CorridorRiskModelsPanel() {
  const [data, setData] = useState<SpatialData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Both periods are slices of the SAME rollout (train_incident_spatial_models.py
  // writes the full month; this just shows the first 7 of those 28 days, or
  // all of them) -- switching never refetches or retrains anything.
  const [period, setPeriod] = useState<"week" | "month">("week");
  // Exits pulled in beyond the default top 5 (by exitId) -- same "a set, not
  // a boolean, so a reader can pull in the two or three they care about"
  // pattern PredictiveCongestionChart's own exit picker uses, adapted from
  // its km-position default (southern end) to a risk-rank default (this
  // card's whole point is which exits are the biggest predicted hotspot).
  const [extraExits, setExtraExits] = useState<number[]>([]);
  const T = useThemeTokens();

  const amberInk = T.isDark ? "#fbbf24" : "#b45309";
  const amberWash = T.isDark ? "rgba(251,191,36,0.12)" : "#fffbeb";
  const amberBorder = T.isDark ? "rgba(251,191,36,0.32)" : "#fde68a";

  useEffect(() => {
    let cancelled = false;
    fetch(`${BACKEND}/api/incident/spatial`, { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json();
        if (cancelled) return;
        if (!json.success) throw new Error(json.message ?? "Request failed");
        setData(json.data as SpatialData);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load spatial risk models");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <article className="chart-card wide" style={{ height: "320px", padding: "20px", display: "grid", placeItems: "center" }}>
        <div style={{ color: "var(--text-muted)" }}>Loading corridor risk models…</div>
      </article>
    );
  }

  if (error || !data || (data.segmentRisk.length === 0 && data.coefficients.length === 0)) {
    return (
      <article className="chart-card wide" style={{ height: "260px", padding: "20px", display: "grid", placeItems: "center" }}>
        <div style={{ textAlign: "center", maxWidth: "420px" }}>
          <div style={{ fontWeight: 700, color: "var(--text-secondary)", marginBottom: "6px" }}>Corridor risk models unavailable</div>
          <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
            {error ?? "The spatial pipeline hasn't written its output yet — run train_incident_spatial_models.py --write-db."}
          </div>
        </div>
      </article>
    );
  }

  const lstmMeta = data.metadata?.spatial_lstm;
  const gwrMeta = data.metadata?.gwr;
  const day1Rows = data.segmentRisk.filter((r) => r.horizonDay === 1).sort((a, b) => a.rank - b.rank);

  // Day x exit grid: one column per horizon day. Rows are RANKED, not
  // corridor-ordered -- highest day-1 predicted risk first -- and collapsed
  // to the top 5 by default, same "don't land a reader on all 20" instinct
  // PredictiveCongestionChart's own exit picker uses, just ranked by this
  // card's own risk forecast instead of corridor position (which has no
  // special claim on "most important" for a hotspot card).
  const COLLAPSED_EXITS = 5;
  const rankedExits = day1Rows.map((r) => ({ exitId: r.exitId, exitName: r.exitName, km: r.km, rank: r.rank, predictedIncidents: r.predictedIncidents }));
  const defaultShownIds = new Set(rankedExits.slice(0, COLLAPSED_EXITS).map((e) => e.exitId));
  const shownIds = new Set([...defaultShownIds, ...extraExits]);
  const shownExits = rankedExits.filter((e) => shownIds.has(e.exitId));
  const hiddenExits = rankedExits.filter((e) => !shownIds.has(e.exitId));
  // Reversed so rank 1 renders at the TOP of ECharts' bottom-up category axis.
  const gridExits = [...shownExits].reverse();

  // Week/Month are both slices of the SAME rollout the training script
  // writes (up to 28 days) -- the toggle below just changes how many of
  // those columns are shown, never what was trained or fetched.
  const allHorizonDays = Array.from(new Set(data.segmentRisk.map((r) => r.horizonDay))).sort((a, b) => a - b);
  const horizonDays = period === "week" ? allHorizonDays.filter((d) => d <= 7) : allHorizonDays;
  const cellByKey = new Map(data.segmentRisk.map((r) => [`${r.exitId}-${r.horizonDay}`, r]));
  // Scaled against the FULL rollout regardless of which period is showing,
  // so a cell's shade means the same thing whichever toggle is active and
  // switching between them doesn't repaint the grid a different color for
  // the same underlying number.
  const maxPredicted = Math.max(...data.segmentRisk.map((r) => r.predictedIncidents), 1e-9);
  // Month view packs up to 28 two-line labels into the same width a week
  // view gives 7 -- every 4th day in month view, matching the same
  // "thin dense labels, don't drop them" instinct PredictiveVolumeChart's
  // own period dividers use for a long Monthly range.
  const dayLabelInterval = period === "month" ? 3 : 0;
  const dayLabels = horizonDays.map((d) => {
    const row = data.segmentRisk.find((r) => r.horizonDay === d);
    const dateLabel = row ? new Date(`${row.forecastDate}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
    return period === "week" ? `Day ${d}\n${dateLabel}` : dateLabel;
  });

  const gridOption: EChartsOption = {
    grid: { left: 150, right: 16, top: 8, bottom: 40 },
    xAxis: {
      type: "category", data: dayLabels, position: "top",
      axisLabel: { color: T.chartText, fontSize: 10, lineHeight: 14, interval: dayLabelInterval },
      axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false },
    },
    yAxis: {
      type: "category", data: gridExits.map((e) => e.exitName),
      axisLabel: { color: T.chartText, fontSize: 10 },
      axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false },
    },
    tooltip: {
      backgroundColor: T.tooltipBg, borderColor: T.border, textStyle: { color: T.tooltipText },
      formatter: (p: unknown) => {
        const d = (p as { data: { exitName: string; km: number; horizonDay: number; predicted: number | null; lastObserved: number | null; forecastDate: string | null } }).data;
        if (d.predicted == null) return `<b>${d.exitName}</b><br/>No forecast for this day`;
        const dateLabel = d.forecastDate ? new Date(`${d.forecastDate}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : `Day ${d.horizonDay}`;
        return `<b>${d.exitName}</b> (Km ${d.km})<br/>${dateLabel}${d.horizonDay > 1 ? ` · rollout day ${d.horizonDay}` : " · direct forecast"}<br/>Predicted: ${fmtNum(d.predicted, 2)}` +
          (d.lastObserved != null ? `<br/>Last observed: ${fmtInt(d.lastObserved)}` : "");
      },
    },
    // Hidden, and every cell's own itemStyle.color (set below) wins over
    // whatever this would have painted anyway -- but ECharts' cartesian
    // heatmap renderer reads its value-to-visual mapping from a visualMap
    // component, not from itemStyle alone. Without one declared at all, the
    // series laid out its grid (axes, row/column geometry all render fine)
    // but drew no cells -- this is what was blank before.
    visualMap: {
      show: false, min: 0, max: maxPredicted,
      dimension: 2, seriesIndex: 0,
      inRange: { color: [T.surfaceHover, shadeFor(1)] },
    },
    series: [
      {
        type: "heatmap",
        xAxisIndex: 0, yAxisIndex: 0,
        data: gridExits.flatMap((ex, y) =>
          horizonDays.map((day, x) => {
            const row = cellByKey.get(`${ex.exitId}-${day}`);
            const predicted = row?.predictedIncidents ?? null;
            return {
              value: [x, y, predicted ?? 0],
              exitName: ex.exitName, km: ex.km, horizonDay: day,
              predicted, lastObserved: row?.lastObservedCount ?? null, forecastDate: row?.forecastDate ?? null,
              itemStyle: { color: predicted == null ? T.surfaceHover : shadeFor(predicted / maxPredicted) },
            };
          })
        ),
        // Numeric labels only in the week view -- 28 month-view columns
        // squeeze each cell too narrow for a legible number, and a half
        // visible digit reads worse than none; the color ramp (plus hover)
        // still carries the value there.
        label: {
          show: period === "week", color: "#fff", fontSize: 9, fontWeight: 700,
          formatter: (p: unknown) => {
            const v = (p as { data: { predicted: number | null } }).data.predicted;
            return v == null ? "" : v.toFixed(1);
          },
        },
        itemStyle: { borderColor: T.isDark ? "#0d1117" : "#fff", borderWidth: period === "week" ? 2 : 1, borderRadius: period === "week" ? 3 : 1 },
        emphasis: { itemStyle: { shadowBlur: 6, shadowColor: "rgba(0,0,0,0.25)" } },
      },
    ],
  };

  const sigByExit = new Map<number, GwrCoefficient[]>();
  for (const c of data.coefficients) {
    if (c.variable === "intercept" || !c.significant) continue;
    const arr = sigByExit.get(c.exitId) ?? [];
    arr.push(c);
    sigByExit.set(c.exitId, arr);
  }
  const exitsWithSignal = [...sigByExit.entries()]
    .map(([exitId, coefs]) => {
      const ref = data.coefficients.find((c) => c.exitId === exitId)!;
      return { exitId, exitName: ref.exitName, km: ref.km, coefs };
    })
    .sort((a, b) => a.km - b.km);

  return (
    <article className="chart-card wide" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "18px" }}>
      <div>
        <h3 style={{ fontSize: "1.05rem", color: "var(--text-primary)", fontWeight: 700, margin: 0, letterSpacing: "-0.01em" }}>
          Incident Hotspots — Spatial LSTM &amp; GWR
          <InfoTooltip text="Two per-exit models, distinct from the walk-forward forecast's own corridor breakdown (which apportions the daily total by historical location share). The Spatial LSTM is trained specifically on each exit's own history plus its neighbors' — a genuine next-24h forecast, and this card's actual hotspot output. GWR is a separate, explanatory-only fit: with only 20 exits there's no meaningful train/test split, so it's scored in-sample and via leave-one-exit-out, not treated as a forecast." />
        </h3>
        <p style={{ color: "var(--text-muted)", fontSize: "0.82rem", margin: "4px 0 0 0" }}>
          {data.trainedAt ? `Last trained ${new Date(data.trainedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : ""}
        </p>
      </div>

      {/* Spatial LSTM — the genuine forecast, this card's hotspot grid.
          Day x exit, matching Traffic Predictive's Congestion State Map
          pattern (a state/intensity grid, not a ranked list) -- scaled down
          to what this model actually produces: a continuous predicted-count
          intensity per cell instead of a discrete jam state, and no hourly
          resolution, since the Spatial LSTM forecasts one day at a time, not
          one hour at a time. */}
      <div>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "10px", flexWrap: "wrap", marginBottom: "8px" }}>
          <div>
            <div style={{ fontSize: "0.68rem", fontWeight: 800, color: "var(--page-accent, #4f46e5)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
              Spatial LSTM — {horizonDays.length}-day hotspot grid
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              Day 1 is the real next-24h forecast; later days are a recursive rollout — each day&apos;s own prediction feeds the next day&apos;s input, the same walk-forward idea the main Forecast chart uses.
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px" }}>
            <div style={{ display: "inline-flex", gap: "2px", padding: "3px", background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "999px" }}>
              {(["week", "month"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setPeriod(v)}
                  style={{
                    padding: "4px 12px", borderRadius: "999px", border: "none", cursor: "pointer",
                    background: period === v ? "var(--page-accent, #4f46e5)" : "transparent",
                    color: period === v ? "var(--text-on-dark)" : "var(--text-secondary)",
                    fontWeight: 600, fontSize: "0.72rem",
                  }}
                >
                  {v === "week" ? "Next 7 days" : "Next month"}
                </button>
              ))}
            </div>
            {lstmMeta && (
              <div style={{ display: "flex", gap: "10px", fontSize: "0.72rem", color: "var(--text-muted)" }}>
                <span>Holdout MAE {fmtNum(lstmMeta.metrics.MAE, 3)}</span>
                <span>Poisson deviance {fmtNum(lstmMeta.metrics.Poisson_Deviance, 3)}</span>
              </div>
            )}
          </div>
        </div>
        {/* Which exits are drawn -- a select instead of fifteen chips, same
            control PredictiveCongestionChart's own exit picker uses, here
            listing hidden exits by RANK (closest to breaking into the top 5
            first) instead of by how soon they turn severe. */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.72rem", color: "var(--text-muted)", flexWrap: "wrap", marginBottom: "8px" }}>
          <span><b style={{ color: "var(--text-secondary)" }}>{shownExits.length}</b> of {rankedExits.length} exits</span>
          {hiddenExits.length > 0 && (
            <select
              value=""
              onChange={(e) => { if (e.target.value) setExtraExits((cur) => [...cur, Number(e.target.value)]); }}
              style={{ font: "inherit", fontWeight: 600, color: "var(--text-secondary)", background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: 8, padding: "3px 8px", cursor: "pointer" }}
            >
              <option value="">Add exit…</option>
              {hiddenExits.map((e) => (
                <option key={e.exitId} value={e.exitId}>
                  {e.exitName} — rank {e.rank}, {fmtNum(e.predictedIncidents, 1)} predicted
                </option>
              ))}
            </select>
          )}
          {hiddenExits.length > 0 && (
            <button
              onClick={() => setExtraExits(hiddenExits.map((e) => e.exitId))}
              style={{ padding: "3px 9px", borderRadius: 999, cursor: "pointer", fontSize: "0.71rem", fontWeight: 700, background: "var(--bg-surface)", border: "1px solid var(--border-default)", color: "var(--text-secondary)" }}
            >
              All {rankedExits.length}
            </button>
          )}
          {extraExits.length > 0 && (
            <button
              onClick={() => setExtraExits([])}
              style={{ padding: "3px 6px", borderRadius: 999, cursor: "pointer", fontSize: "0.71rem", fontWeight: 600, background: "transparent", border: "none", color: "var(--text-muted)" }}
            >
              reset
            </button>
          )}
        </div>
        {/* Month view packs up to 28 columns in -- scrolls horizontally
            rather than squeezing cells past the point a reader can hover
            them individually; week view's 7 columns always fit the card. */}
        <div style={{ overflowX: period === "month" ? "auto" : "visible" }}>
          <div style={{ minWidth: period === "month" ? `${150 + horizonDays.length * 32}px` : "100%" }}>
            <DashboardChart option={gridOption} height={Math.max(280, gridExits.length * 24 + 50)} />
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "8px" }}>
          <span style={{ width: 10, height: 10, borderRadius: "999px", background: `linear-gradient(90deg, color-mix(in srgb, #d97706 50%, ${T.isDark ? "#0d1117" : "white"}), #451a03)`, display: "inline-block" }} />
          <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>darker = higher predicted incidents · hover a cell for its numbers</span>
        </div>
        {lstmMeta?.rollout_assumptions && (
          <p style={{ color: "var(--text-muted)", fontSize: "0.72rem", margin: "6px 0 0 0" }}>
            Days past 1 hold two inputs flat rather than forecasting them: {lstmMeta.rollout_assumptions}. Treat day{" "}
            {horizonDays[horizonDays.length - 1]} as a shape, not a commitment — the further from day 1, the more the rollout&apos;s own error compounds.
          </p>
        )}
      </div>

      {/* GWR — explanatory only, honestly labeled */}
      <div style={{ borderTop: "1px solid var(--border-default)", paddingTop: "14px" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "10px", flexWrap: "wrap", marginBottom: "8px" }}>
          <div>
            <div style={{ fontSize: "0.68rem", fontWeight: 800, color: amberInk, letterSpacing: "0.04em", textTransform: "uppercase" }}>
              GWR — explanatory, not a forecast
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Does an exit&apos;s incident rate relate to its structural traits differently along the corridor?</div>
          </div>
        </div>
        {gwrMeta && (
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "10px" }}>
            <div style={{ flex: "1 1 160px", padding: "10px 14px", borderRadius: "10px", background: amberWash, border: `1px solid ${amberBorder}` }}>
              <div style={{ fontSize: "0.68rem", color: amberInk, fontWeight: 600, textTransform: "uppercase" }}>In-sample MAE</div>
              <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--text-primary)" }}>{fmtNum(gwrMeta.metrics.MAE, 3)}</div>
              <div style={{ fontSize: "0.68rem", color: amberInk }}>fit and scored on the same 20 exits</div>
            </div>
            <div style={{ flex: "1 1 160px", padding: "10px 14px", borderRadius: "10px", background: "var(--bg-surface-hover)", border: "1px solid var(--border-default)" }}>
              <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase" }}>Leave-one-exit-out MAE</div>
              <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--text-primary)" }}>
                {gwrMeta.metrics.loocv_mae != null ? fmtNum(gwrMeta.metrics.loocv_mae, 3) : "—"}
              </div>
              <div style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>each exit predicted from the other 19 — the honest number</div>
            </div>
          </div>
        )}
        {exitsWithSignal.length > 0 ? (
          <table style={{ width: "100%", fontSize: "0.76rem", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ color: "var(--text-muted)", textAlign: "left" }}>
                <th style={{ fontWeight: 600, paddingBottom: "4px" }}>Exit</th>
                <th style={{ fontWeight: 600, paddingBottom: "4px" }}>Locally significant trait(s)</th>
              </tr>
            </thead>
            <tbody>
              {exitsWithSignal.map((row) => (
                <tr key={row.exitId} style={{ borderTop: "1px solid var(--border-default)" }}>
                  <td style={{ padding: "4px 0", color: "var(--text-secondary)", fontWeight: 600 }}>{row.exitName} (Km {row.km})</td>
                  <td style={{ padding: "4px 0", color: "var(--text-muted)" }}>
                    {row.coefs
                      .map((c) => `${VARIABLE_LABEL[c.variable] ?? c.variable} (${c.coefficient > 0 ? "+" : ""}${fmtNum(c.coefficient, 2)})`)
                      .join(", ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ color: "var(--text-muted)", fontSize: "0.78rem", margin: 0 }}>No locally significant coefficients at |t| &gt; 1.96 in the current fit.</p>
        )}
      </div>
      <CorridorRiskNarrative
        gwr={
          gwrMeta
            ? {
                bandwidth: gwrMeta.bandwidth ?? null,
                mae: gwrMeta.metrics?.MAE ?? null,
                loocvMae: gwrMeta.metrics?.loocv_mae ?? null,
                loocvN: gwrMeta.metrics?.loocv_n ?? null,
                poissonDeviance: gwrMeta.metrics?.Poisson_Deviance ?? null,
                n: gwrMeta.metrics?.n ?? null,
                // Sent as the panel's own human labels, so the narrative names
                // the variables the same way the table above it does rather
                // than echoing raw column names back at the reader.
                variables: (gwrMeta.variables ?? []).map((v) => VARIABLE_LABEL[v] ?? v),
                coefficients: data.coefficients.map((c) => ({
                  exitName: c.exitName,
                  km: c.km ?? null,
                  variable: VARIABLE_LABEL[c.variable] ?? c.variable,
                  coefficient: c.coefficient,
                  tValue: c.tValue ?? null,
                  significant: c.significant ?? null,
                })),
              }
            : null
        }
        spatialLstm={
          lstmMeta
            ? {
                mae: lstmMeta.metrics?.MAE ?? null,
                poissonDeviance: lstmMeta.metrics?.Poisson_Deviance ?? null,
                n: lstmMeta.metrics?.n ?? null,
                epochs: lstmMeta.metrics?.epochs ?? null,
                seqLen: lstmMeta.seq_len ?? null,
                nNeighbors: lstmMeta.n_neighbors ?? null,
                forecastDate: day1Rows[0]?.forecastDate ?? null,
                topExits: day1Rows.map((s) => ({
                  exitName: s.exitName,
                  km: s.km ?? null,
                  rank: s.rank,
                  predictedIncidents: s.predictedIncidents,
                  lastObservedCount: s.lastObservedCount ?? null,
                })),
              }
            : null
        }
        trainedAt={data.trainedAt}
      />
    </article>
  );
}
