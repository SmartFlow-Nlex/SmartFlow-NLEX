"use client";

import { useEffect, useState } from "react";
import type { EChartsOption } from "echarts";
import { useThemeTokens } from "./useThemeTokens";
import DashboardChart from "./DashboardChart";
import InfoTooltip from "./InfoTooltip";
import NarrativePanel from "./NarrativePanel";
import StateNote from "../stage/StateNote";
import { fmtNum, fmtTrainedAt, fmtDateRange } from "./incidentPredictive.shared";
import { fetchJsonWithRetry } from "./prescriptiveTraffic.shared";
import CustomSelect from "./CustomSelect";

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
  /** The held-out dispatches the predictions apply to, by event date. */
  holdoutWindow?: { from: string; to: string; n: number } | null;
  /** The day and time block the group medians were cut to; null for every held-out dispatch. */
  slot?: { dow: number | null; block: number | null; n: number } | null;
};

/* Day and time filter (19 Oct 2026, testers IN-12: "show the date/time the prediction is for; add a day/time
   filter; make it read as predictive"). The model takes the hour and the weekday as inputs, so what it
   expects depends on when a breakdown is reported. dow is 0 = Sunday, as the API numbers it; a block is
   three hours (an hour of one weekday holds too few held-out dispatches for the smaller causes). */
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const fmtHour = (h: number) => (h === 0 || h === 24 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`);
const blockLabel = (b: number) => `${fmtHour(b * 3)} – ${fmtHour(b * 3 + 3)}`;
type Slot = { dow: number | "any"; block: number | "any" };

/** The corridor's local day and 3-hour block right now (Manila, UTC+8, whatever the browser's zone). */
function manilaNow(): { dow: number; block: number; date: Date } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", weekday: "short", hour: "numeric", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  const hour = Number(get("hour")) % 24;
  return { dow, block: Math.floor(hour / 3), date: new Date(`${get("year")}-${get("month")}-${get("day")}T00:00:00`) };
}

/** "Fri 24 Oct": the next calendar day (today included) that falls on dow, in Manila. */
function nextDateFor(dow: number): string {
  const now = manilaNow();
  const d = new Date(now.date);
  d.setDate(d.getDate() + ((dow - now.dow + 7) % 7));
  return d.toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" });
}

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
  // Retry, slow note and Try again (17 Oct 2026, testers TR-12): the first read on a cold backend can be slow.
  const [attempt, setAttempt] = useState(0);
  const [slow, setSlow] = useState(false);
  // Opens on the corridor's current day and time block: "what to expect if a breakdown is reported now".
  const [slot, setSlot] = useState<Slot>(() => {
    const n = manilaNow();
    return { dow: n.dow, block: n.block };
  });
  const T = useThemeTokens();

  const predictedColor = T.isDark ? PREDICTED_COLOR_DARK : PREDICTED_COLOR_LIGHT;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams();
    if (slot.dow !== "any") qs.set("dow", String(slot.dow));
    if (slot.block !== "any") qs.set("block", String(slot.block));
    fetchJsonWithRetry(`${BACKEND}/api/incident/breakdown-response${qs.toString() ? `?${qs}` : ""}`, "breakdown response model")
      .then((json) => {
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
  }, [attempt, slot]);

  useEffect(() => {
    setSlow(false);
    if (!loading) return;
    const t = window.setTimeout(() => setSlow(true), 5000);
    return () => window.clearTimeout(t);
  }, [loading]);

  // The full loading card only before the first answer; a new day or time keeps the last one on screen.
  if (loading && !data) {
    return (
      <article className="chart-card wide inc-card" style={{ minHeight: "320px", justifyContent: "center" }}>
        <div className="inc-loading" role="status">
          <span>
            Loading response-time model…
            {slow && <span className="inc-loading-note">The first read after the server starts can take up to a minute. It retries on its own.</span>}
          </span>
        </div>
      </article>
    );
  }

  if (!data || (!data.slot && data.byCause.length === 0 && data.byService.length === 0)) {
    return (
      <article className="chart-card wide inc-card" style={{ minHeight: "260px", justifyContent: "center" }}>
        <StateNote kind={error ? "error" : "nodata"} title="Response-time model unavailable">
          {error ?? "The breakdown response-time pipeline hasn't written its output yet — run train_breakdown_response_models.py --write-db."}
          {error && (
            <button type="button" className="btn-muted inc-retry" onClick={() => setAttempt((n) => n + 1)}>Try again</button>
          )}
        </StateNote>
      </article>
    );
  }

  const meta = data.metadata;
  const champion = data.championModel ?? meta?.champion ?? null;
  const holdoutFraction = (meta as { holdout_fraction?: unknown } | null)?.holdout_fraction;
  const holdoutShare = typeof holdoutFraction === "number" ? `${Math.round(holdoutFraction * 100)}%` : null;
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

  // A group the model left without a prediction in this slot (EMS has one such dispatch) has no bar to draw.
  const rows = (view === "cause" ? data.byCause : data.byService).filter((r) => r.predictedMedianMin != null).slice(0, INLINE_LIMIT);
  const displayRows = [...rows].reverse(); // ECharts category axis draws bottom-up; reversed so the busiest group lands on top

  // The slot in words, as the answer reads it: "Fridays, 3 PM – 6 PM". Read off the response, not the
  // controls, so while a new choice loads (or if it fails) the words still match the bars on screen.
  const shown: Slot = { dow: data.slot?.dow ?? "any", block: data.slot?.block ?? "any" };
  const slotDay = shown.dow === "any" ? "any day" : `${DAY_NAMES[shown.dow]}s`;
  const slotTime = shown.block === "any" ? "any time" : blockLabel(shown.block);
  const slotPhrase = shown.dow === "any" && shown.block === "any" ? "any day and time" : `${slotDay}, ${slotTime}`;
  const now = manilaNow();
  const isNow = slot.dow === now.dow && slot.block === now.block;
  const shownIsNow = shown.dow === now.dow && shown.block === now.block;
  const lead = rows.find((r) => r.group === (view === "service" ? "AAP" : rows[0]?.group)) ?? rows[0] ?? null;

  const chartOption: EChartsOption = {
    // No legend: a legend is for telling series apart, and a single-series
    // bar chart has nothing to tell apart (same reasoning
    // PredictiveCorridorChart's own shadeFor doc comment gives for dropping
    // its legend).
    grid: { left: 130, right: 92, top: 8, bottom: 32 },
    xAxis: { type: "value", name: "expected median response (min)", nameLocation: "middle", nameGap: 26, nameTextStyle: { color: T.chartText, fontSize: 12 }, splitNumber: 3, axisLabel: { color: T.chartText, fontSize: 12, formatter: (v: number) => `${v} min` }, splitLine: { lineStyle: { color: T.chartSplit } } },
    yAxis: { type: "category", data: displayRows.map((r) => r.group), axisLabel: { color: T.chartText, fontSize: 12 }, axisTick: { show: false } },
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
        // The measured median of the same dispatches rides along, so the expectation can be checked.
        return `<b>${r.group}</b> · ${slotPhrase}<br/>Expected median: <b>${r.predictedMedianMin ?? "—"} min</b><br/>` +
          `<span style="color:var(--text-muted)">Measured on the same ${r.n.toLocaleString("en-US")} held-out dispatches: ${r.actualMedianMin ?? "—"} min</span>`;
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
          show: true, position: "right", color: T.textPrimary, fontSize: 12, fontWeight: 600,
          // A small group says how small: a median over a handful of dispatches is not a firm expectation.
          formatter: (p: unknown) => {
            const { value, dataIndex } = p as { value: number | null; dataIndex: number };
            const r = displayRows[dataIndex];
            return `${value ?? "—"} min${r && r.n < 20 ? ` · ${r.n} disp.` : ""}`;
          },
        },
      },
    ],
  };

  return (
    <article className="chart-card wide nct-card">
      {/* Card, title, stats and control row in the Traffic tab's style (16 Oct 2026). */}
      <div className="nct-card-head-split">
        <div className="nct-head-text">
          <h3 className="nct-title">
            Expected Breakdown Response Time
            <InfoTooltip text="Predicted dispatch response time (AAP, Patrol Vehicle, RAMFA, and others), by cause or by service -- a trained model (Cox PH vs XGBoost, whichever scores lower held-out error) predicting a deployment's response_time_min from pre-dispatch context, scored against the actual measured median on a chronological, event-grouped holdout. The descriptive counterpart to this card (Descriptive tab) shows the same two groupings from measured history alone, with no model behind it." />
          </h3>
          {/* What the expectation is for (17 Oct 2026, testers IN-12; day and time since 19 Oct): the day and
              time chosen below, read off the model's predictions for held-out dispatches reported then. It is
              not a fresh forecast for one calendar date, so the next such date is offered as an example only. */}
          <p className="nct-sub">
            What the model expects if a breakdown is reported on <b>{slotPhrase}</b>
            {shown.dow !== "any" && <> (next: <b>{nextDateFor(shown.dow)}{shown.block !== "any" ? `, ${blockLabel(shown.block)}` : ""}</b>{shownIsNow ? ", now" : ""})</>}.
            {" "}The median of its predictions for the{" "}
            <b>{(data.slot?.n ?? data.holdoutWindow?.n ?? 0).toLocaleString("en-US")}</b> held-out dispatches reported then
            {data.holdoutWindow ? <> in <b>{fmtDateRange(data.holdoutWindow.from, data.holdoutWindow.to)}</b></> : null}
            {holdoutShare ? ` (the latest ${holdoutShare}, never trained on)` : " (never trained on)"}.
          </p>
        </div>
        {champion && (
          <span
            className="pill purple"
            title={`Champion model: ${champion} -- MAE ${championMetrics.mae != null ? fmtNum(championMetrics.mae, 1) : "—"} min on ${championMetrics.n?.toLocaleString("en-US") ?? "—"} held-out dispatches${championMetrics.scoreValue ? `, ${championMetrics.scoreLabel.toLowerCase()} ${championMetrics.scoreValue}` : ""}`}
          >
            Model: {champion}
          </span>
        )}
      </div>

      {/* The answer first: how far off the model is on dispatches it never saw. */}
      <div className="nct-stats nct-stats-auto">
        <div className="nct-stat">
          <span className="nct-stat-value">{championMetrics.mae != null ? `${fmtNum(championMetrics.mae, 1)} min` : "—"}</span>
          <span className="nct-stat-label">Held-out MAE</span>
        </div>
        <div className="nct-stat">
          <span className="nct-stat-value">{championMetrics.scoreValue ?? "—"}</span>
          <span className="nct-stat-label">{championMetrics.scoreLabel}</span>
        </div>
        <div className="nct-stat">
          <span className="nct-stat-value">{fmtTrainedAt(data.trainedAt)}</span>
          <span className="nct-stat-label">Trained</span>
        </div>
      </div>

      {/* Day and time: what the expectation below is for. */}
      <div className="inc-controls" role="group" aria-label="Day and time the expectation is for" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 12px" }}>
        <span className="nct-stat-label">Day</span>
        <CustomSelect
          value={String(slot.dow)}
          onChange={(v) => setSlot((s) => ({ ...s, dow: v === "any" ? "any" : Number(v) }))}
          options={[{ label: "Any day", value: "any" }, ...DAY_ORDER.map((d) => ({ label: DAY_NAMES[d], value: String(d) }))]}
        />
        <span className="nct-stat-label">Time</span>
        <CustomSelect
          value={String(slot.block)}
          onChange={(v) => setSlot((s) => ({ ...s, block: v === "any" ? "any" : Number(v) }))}
          options={[{ label: "Any time", value: "any" }, ...Array.from({ length: 8 }, (_, b) => ({ label: blockLabel(b), value: String(b) }))]}
        />
        <button type="button" className={`nct-pill-btn${isNow ? " is-on" : ""}`} aria-pressed={isNow} onClick={() => setSlot({ dow: now.dow, block: now.block })}>
          Now
        </button>
        {loading && <span className="inc-status-line" role="status">Updating…</span>}
        {error && data && <span className="inc-status-line is-warn" role="alert">Couldn&apos;t load this day and time ({error}); showing the last answer.</span>}
      </div>

      {lead?.predictedMedianMin != null && (
        <p className="inc-answer">
          <span className="inc-answer-value">{lead.predictedMedianMin} min</span>
          <span className="inc-answer-label">
            expected {view === "service" ? <>for <b>{lead.group}</b> to respond</> : <>response to a breakdown of cause <b>{lead.group}</b></>} on {slotPhrase}
            {lead.actualMedianMin != null && <> · measured {lead.actualMedianMin} min on the same dispatches</>}
          </span>
        </p>
      )}

      <div aria-busy={loading} className="inc-busy-body">
        <div className="nct-subhead-row" style={{ marginBottom: 8 }}>
          <h4 className="nct-subhead">Expected Median Response · {slotPhrase}</h4>
          <div className="nct-pills" role="group" aria-label="Group by">
            {(["cause", "service"] as const).map((v) => (
              <button key={v} type="button" onClick={() => setView(v)} aria-pressed={view === v} className={`nct-pill-btn${view === v ? " is-on" : ""}`}>
                {v === "cause" ? "By Cause" : "By Service"}
              </button>
            ))}
          </div>
        </div>
        {rows.length === 0 ? (
          <p className="nct-foot">{data.slot ? <>No {view === "cause" ? "cause" : "service"} group has a held-out dispatch with a prediction on {slotPhrase}. Try Any time or Any day.</> : <>No {view === "cause" ? "cause" : "service"} groups met the training script&apos;s evidence cutoff.</>}</p>
        ) : (
          <>
            <DashboardChart option={chartOption} height={Math.max(180, displayRows.length * 34 + 20)} />
            <p className="nct-foot" style={{ marginTop: 6 }}>
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
          subjectKey={JSON.stringify(["breakdown-response", view, shown, champion, rows.map((r) => [r.group, r.predictedMedianMin, r.n])])}
          contextLine={`Expected median response time on ${slotPhrase} across ${rows.length} ${view === "cause" ? "causes" : "services"}${champion ? ` · ${champion}` : ""}.`}
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
