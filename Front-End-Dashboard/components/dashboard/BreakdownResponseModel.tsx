"use client";

import { useEffect, useState } from "react";
import type { EChartsOption } from "echarts";
import { useThemeTokens } from "./useThemeTokens";
import DashboardChart from "./DashboardChart";
import InfoTooltip from "./InfoTooltip";
import NarrativePanel from "./NarrativePanel";
import StateNote from "../stage/StateNote";
import { fmtNum, fmtTrainedAt } from "./incidentPredictive.shared";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

// Mirrors src/services/breakdown-response.service.ts's response shape.
//
// The trained-model counterpart to the Descriptive tab's Response Time
// Breakdown card (EventBreakdownPanel.tsx / /api/incident/event-breakdown),
// which shows the same two groupings (by cause, by service) as measured
// history only. This card adds the predicted half: a Cox PH / XGBoost model
// (see train_breakdown_response_models.py) predicting a breakdown
// deployment's response_time_min from pre-dispatch context, reported here
// as Actual vs Predicted median minutes per group on a held-out,
// event-grouped split (never rows of the same breakdown split across
// train/holdout — see the training script's own doc comment for why that
// grouping matters).
//
// Placed on the Predictive tab in place of Time to Clear: that card modeled
// accident CLEARANCE time (site_cleared - event_start, from accident_data);
// this one models breakdown dispatch RESPONSE time (report to first
// responder, from breakdown_data's deployments log) -- a different table, a
// different duration, matched to this tab's own "predicted" framing instead
// of Time to Clear's survival-curve one because the thing it's replacing
// (Response Time Breakdown) is itself a by-cause/by-service bar chart, not a
// curve.
type GroupStat = { group: string; n: number; actualMedianMin: number | null; predictedMedianMin: number | null };

type BreakdownResponseData = {
  byCause: GroupStat[];
  byService: GroupStat[];
  championModel: string | null;
  trainedAt: string | null;
  metadata: {
    champion?: string;
    cox_ph?: { concordance_index: number | null; mae_minutes: number | null; n: number; cox_n: number; cox_coverage_pct: number };
    xgboost?: { mae_minutes: number | null; r2: number | null; n: number };
  } | null;
};

// The same "this is the forward-looking one" green PredictiveIncidentChart's
// Forecast line and Future-zone furniture use — kept identical rather than a
// second hand-picked green, so "predicted" reads as one consistent color
// across every card on this tab, not just within this one.
const PREDICTED_COLOR_LIGHT = "#0b8db0";
const PREDICTED_COLOR_DARK = "#169bb8";

// Inline cap — matches TOP_N_GROUPS in the training script, so "why these
// groups" has one real answer (evidence, not a display-only truncation of a
// longer trained set).
const INLINE_LIMIT = 8;

export default function BreakdownResponseModel() {
  const [data, setData] = useState<BreakdownResponseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"cause" | "service">("cause");
  const T = useThemeTokens();

  const predictedColor = T.isDark ? PREDICTED_COLOR_DARK : PREDICTED_COLOR_LIGHT;

  useEffect(() => {
    let cancelled = false;
    fetch(`${BACKEND}/api/incident/breakdown-response`, { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json();
        if (cancelled) return;
        if (!json.success) throw new Error(json.message ?? "Request failed");
        setData(json.data as BreakdownResponseData);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load breakdown response model");
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
      <article className="chart-card wide inc-card" style={{ minHeight: "320px", justifyContent: "center" }}>
        <div className="inc-loading" role="status">Loading response-time model…</div>
      </article>
    );
  }

  if (error || !data || (data.byCause.length === 0 && data.byService.length === 0)) {
    return (
      <article className="chart-card wide inc-card" style={{ minHeight: "260px", justifyContent: "center" }}>
        <StateNote kind={error ? "error" : "nodata"} title="Response-time model unavailable">
          {error ?? "The breakdown response-time pipeline hasn't written its output yet — run train_breakdown_response_models.py --write-db."}
        </StateNote>
      </article>
    );
  }

  const meta = data.metadata;
  const champion = data.championModel ?? meta?.champion ?? null;
  const championMetrics =
    champion === "XGBoost"
      ? {
          mae: meta?.xgboost?.mae_minutes ?? null,
          n: meta?.xgboost?.n ?? null,
          scoreLabel: "R²",
          scoreValue: meta?.xgboost?.r2 != null ? fmtNum(meta.xgboost.r2, 3) : null,
        }
      : {
          mae: meta?.cox_ph?.mae_minutes ?? null,
          n: meta?.cox_ph?.n ?? null,
          scoreLabel: "Concordance",
          scoreValue: meta?.cox_ph?.concordance_index != null ? fmtNum(meta.cox_ph.concordance_index, 3) : null,
        };

  const rows = (view === "cause" ? data.byCause : data.byService).slice(0, INLINE_LIMIT);
  const displayRows = [...rows].reverse(); // ECharts category axis draws bottom-up; reversed so the busiest group lands on top

  const chartOption: EChartsOption = {
    // No legend: a legend is for telling series apart, and a single-series
    // bar chart has nothing to tell apart (same reasoning
    // PredictiveCorridorChart's own shadeFor doc comment gives for dropping
    // its legend).
    grid: { left: 130, right: 48, top: 8, bottom: 28 },
    xAxis: { type: "value", name: "predicted median response (min)", nameLocation: "middle", nameGap: 24, nameTextStyle: { color: T.chartText }, splitNumber: 3, axisLabel: { color: T.chartText, formatter: (v: number) => `${v} min` }, splitLine: { lineStyle: { color: T.chartSplit } } },
    yAxis: { type: "category", data: displayRows.map((r) => r.group), axisLabel: { color: T.chartText }, axisTick: { show: false } },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      backgroundColor: T.tooltipBg,
      borderColor: T.border,
      textStyle: { color: T.tooltipText },
      formatter: (params: unknown) => {
        const items = params as { dataIndex: number }[];
        if (items.length === 0) return "";
        const r = displayRows[items[0].dataIndex];
        return `<b>${r.group}</b><br/>Predicted median: ${r.predictedMedianMin ?? "—"} min<br/>${r.n.toLocaleString("en-US")} held-out dispatches`;
      },
    },
    series: [
      {
        name: "Predicted",
        type: "bar",
        data: displayRows.map((r) => r.predictedMedianMin),
        barMaxWidth: 16,
        itemStyle: { color: predictedColor, borderRadius: [0, 4, 4, 0] },
        label: {
          show: true, position: "right", color: T.textPrimary, fontSize: 11, fontWeight: 600,
          formatter: (p: unknown) => `${(p as { value: number | null }).value ?? "—"}m`,
        },
      },
    ],
  };

  return (
    <article className="chart-card wide inc-card">
      <div className="inc-card-head">
        <div className="inc-card-titles">
          <h3 className="inc-card-title">
            Response Time Breakdown
            <InfoTooltip text="Predicted dispatch response time (AAP, Patrol Vehicle, RAMFA, and others), by cause or by service -- a trained model (Cox PH vs XGBoost, whichever scores lower held-out error) predicting a deployment's response_time_min from pre-dispatch context, scored against the actual measured median on a chronological, event-grouped holdout. The descriptive counterpart to this card (Descriptive tab) shows the same two groupings from measured history alone, with no model behind it." />
          </h3>
        </div>
        {champion && (
          <span
            className="inc-tag"
            style={{ fontSize: "var(--fs-label)", padding: "3px 10px" }}
            title={`Champion model: ${champion} -- MAE ${championMetrics.mae != null ? fmtNum(championMetrics.mae, 1) : "—"} min on ${championMetrics.n?.toLocaleString("en-US") ?? "—"} held-out dispatches${championMetrics.scoreValue ? `, ${championMetrics.scoreLabel.toLowerCase()} ${championMetrics.scoreValue}` : ""}`}
          >
            Model: {champion}
          </span>
        )}
      </div>

      {/* The answer first: how far off the model is on dispatches it never saw. */}
      <div className="inc-stats">
        <div className="inc-stat">
          <span className="inc-stat-label">Held-out MAE</span>
          <span className="inc-stat-value">{championMetrics.mae != null ? `${fmtNum(championMetrics.mae, 1)} min` : "—"}</span>
        </div>
        <div className="inc-stat">
          <span className="inc-stat-label">{championMetrics.scoreLabel}</span>
          <span className="inc-stat-value">{championMetrics.scoreValue ?? "—"}</span>
        </div>
        <div className="inc-stat">
          <span className="inc-stat-label">Trained</span>
          <span className="inc-stat-value is-text">{fmtTrainedAt(data.trainedAt)}</span>
        </div>
      </div>

      <div>
        <div className="inc-card-head" style={{ alignItems: "center", marginBottom: 8 }}>
          <h4 className="inc-subhead">Predicted Median Response Time</h4>
          <div className="inc-seg" role="group" aria-label="Group by">
            {(["cause", "service"] as const).map((v) => (
              <button key={v} onClick={() => setView(v)} aria-pressed={view === v} className={view === v ? "is-on" : ""}>
                {v === "cause" ? "By Cause" : "By Service"}
              </button>
            ))}
          </div>
        </div>
        {rows.length === 0 ? (
          <p className="inc-caption">No {view === "cause" ? "cause" : "service"} groups met the training script&apos;s evidence cutoff.</p>
        ) : (
          <>
            <DashboardChart option={chartOption} height={Math.max(180, displayRows.length * 34 + 20)} />
            <p className="inc-caption" style={{ marginTop: 6 }}>
              Top {rows.length} {view === "cause" ? "causes" : "services"} by held-out evidence.
            </p>
            <details className="nc-details">
              <summary>How this is measured</summary>
              <p style={{ margin: 0 }}>
                Built from breakdown_data&apos;s per-dispatch records; responses over 24h are treated as data-entry noise and excluded,
                same as the Descriptive tab&apos;s own figures.
              </p>
            </details>
          </>
        )}
      </div>

      {/* Tied to the active view (By Cause / By Service), the same way
          IncidentSeverityModels' own ClearanceNarrative regenerates per
          toggled dimension -- switching tabs is a real change of subject,
          not a cosmetic one, so the narrative should follow it rather than
          describing whichever view happened to be open when it was first
          generated. Its own endpoint (not ranking-narrative): that one's
          prompt frames every row as a corridor LOCATION, which a breakdown
          cause or service is not. */}
      {rows.length > 0 && (
        <NarrativePanel
          metrics={rows.map((r) => ({ model: r.group }))}
          endpoint="/api/ai-insight/breakdown-response-narrative"
          subjectKey={JSON.stringify(["breakdown-response", view, champion, rows.map((r) => [r.group, r.predictedMedianMin, r.n])])}
          contextLine={`Predicted median response time across ${rows.length} ${view === "cause" ? "causes" : "services"}${champion ? ` · ${champion}` : ""}.`}
          buildBody={() => ({
            dimension: view,
            championModel: champion,
            maeMinutes: championMetrics.mae,
            trainedAt: data.trainedAt,
            groups: rows.map((r) => ({
              group: r.group,
              n: r.n,
              predictedMedianMin: r.predictedMedianMin,
            })),
          })}
        />
      )}
    </article>
  );
}
