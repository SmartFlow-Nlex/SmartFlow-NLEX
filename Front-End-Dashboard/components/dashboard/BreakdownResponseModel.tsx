"use client";

import { useEffect, useState } from "react";
import type { EChartsOption } from "echarts";
import { useThemeTokens } from "./useThemeTokens";
import DashboardChart from "./DashboardChart";
import InfoTooltip from "./InfoTooltip";
import NarrativePanel, { GenerateReportButton } from "./NarrativePanel";
import { CalendarDays, Car, Clock, Info, Layers } from "lucide-react";
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
    /** The simple median lookups both models were scored against, on the same held-out dispatches. */
    baselines?: Record<string, { mae_minutes: number | null }>;
    /** The champion rule's outcome (honest_eval.pick_champion). */
    selection?: { best_baseline?: string; champion?: string; champion_is_baseline?: boolean; vs_baseline_significant?: boolean | null };
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
  // The report opens from the foot row (reference layout, 20 Nov 2026).
  const [reportOpen, setReportOpen] = useState(false);
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
  const selEarly = meta?.selection;
  const baselineMae = selEarly?.best_baseline ? meta?.baselines?.[selEarly.best_baseline]?.mae_minutes ?? null : null;
  const championMetrics =
    selEarly?.champion_is_baseline
      ? { mae: baselineMae, n: meta?.xgboost?.n ?? meta?.cox_ph?.n ?? null, scoreLabel: "R²", scoreValue: null as string | null }
      : champion === "XGBoost"
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

  /* How the model behind the card was chosen (17 Nov 2026). The tooltip said "whichever scores lower held-out
     error"; the rule is a model is used only if its error is lower than the best simple median lookup's, the
     simpler of two qualifying models wins a lead that is within chance, and with none qualifying the lookup is
     shown. The current outcome is read from the training run. */
  const sel = meta?.selection;
  const baseName = sel?.best_baseline ? sel.best_baseline.replace(/\s*\(baseline\)\s*$/i, "").replace(/ x /g, " × ") : null;
  const baseMae = sel?.best_baseline ? meta?.baselines?.[sel.best_baseline]?.mae_minutes ?? null : null;
  const ruleOutcome =
    sel?.champion_is_baseline && baseName
      ? ` In this run neither model beat the ${baseName.toLowerCase()}, so that lookup is shown.`
      : champion && championMetrics.mae != null && baseName && baseMae != null
        ? ` In this run ${champion} was used: an average miss of ${championMetrics.mae.toFixed(1)} min against ${baseMae.toFixed(1)} min for the ${baseName.toLowerCase()}${sel?.vs_baseline_significant === false ? ", a gap within chance" : ""}.`
        : "";
  const modelRuleText =
    "Predicted response time of a dispatched unit (AAP, Patrol Vehicle, RAMFA, and others), from dispatch to arrival at the scene, by cause or by service, from what is known before dispatch, scored against the measured times on the most recent held-out dispatches. " +
    "A trained model (Cox PH or XGBoost) is used only if its error on those dispatches is lower than the best simple median lookup's; if both qualify and the better one's lead is within chance, the simpler one is used." +
    ruleOutcome +
    " Built from breakdown_data's per-dispatch records; responses over 24 h are treated as data-entry noise and excluded, as in the Descriptive tab's figures." +
    " The descriptive counterpart to this card (Descriptive tab) shows the same two groupings from measured history alone, with no model behind it.";

  // A group the model left without a prediction in this slot (EMS has one such dispatch) has no bar to draw.
  const rows = (view === "cause" ? data.byCause : data.byService).filter((r) => r.predictedMedianMin != null).slice(0, INLINE_LIMIT);
  const displayRows = [...rows].reverse(); // ECharts category axis draws bottom-up; reversed so the busiest group lands on top

  // The slot in words, as the answer reads it: "Fridays, 3 PM – 6 PM". Read off the response, not the
  // controls, so while a new choice loads (or if it fails) the words still match the bars on screen.
  const shown: Slot = { dow: data.slot?.dow ?? "any", block: data.slot?.block ?? "any" };
  const slotDay = shown.dow === "any" ? "any day" : `${DAY_NAMES[shown.dow]}s`;
  const slotTime = shown.block === "any" ? "any time" : blockLabel(shown.block);
  const slotPhrase = shown.dow === "any" && shown.block === "any" ? "any day and time" : `${slotDay}, ${slotTime}`;
  const lead = rows.find((r) => r.group === (view === "service" ? "AAP" : rows[0]?.group)) ?? rows[0] ?? null;

  // The axis ends on the next round 10 minutes past the longest bar, so the bars use the width (reference layout).
  const maxPred = Math.max(0, ...displayRows.map((r) => r.predictedMedianMin ?? 0));
  const chartOption: EChartsOption = {
    // No legend: a single-series bar chart has nothing to tell apart.
    grid: { left: 120, right: 130, top: 6, bottom: 44 },
    xAxis: {
      type: "value", name: "Expected median response (min)", nameLocation: "middle", nameGap: 30,
      nameTextStyle: { color: T.chartText, fontSize: 12 },
      min: 0, max: Math.max(10, Math.ceil(maxPred / 10) * 10), interval: 10,
      axisLabel: { color: T.chartText, fontSize: 12, formatter: (v: number) => `${v} min` },
      splitLine: { lineStyle: { color: T.chartSplit } },
    },
    yAxis: {
      type: "category", data: displayRows.map((r) => r.group),
      axisLabel: { color: T.textPrimary, fontSize: 13 }, axisTick: { show: false },
      axisLine: { lineStyle: { color: T.chartAxis } },
    },
    tooltip: {
      trigger: "axis",
      // No grey band behind the hovered row (19 Nov 2026): it was cropped at the plot's edges.
      axisPointer: { type: "none" },
      backgroundColor: T.tooltipBg,
      borderColor: T.border,
      textStyle: { color: T.tooltipText },
      formatter: (params: unknown) => {
        const items = params as { dataIndex: number }[];
        if (items.length === 0) return "";
        const r = displayRows[items[0].dataIndex];
        // The measured median of the same dispatches rides along, so the expectation can be checked.
        return `<b>${r.group}</b> · ${slotPhrase}<br/>Expected median: <b>${r.predictedMedianMin == null ? "—" : fmtNum(r.predictedMedianMin, 1)} min</b><br/>` +
          `<span style="color:var(--text-muted)">Measured on the same ${r.n.toLocaleString("en-US")} held-out dispatches: ${r.actualMedianMin == null ? "—" : fmtNum(r.actualMedianMin, 1)} min</span>`;
      },
    },
    series: [
      {
        name: "Predicted",
        type: "bar",
        data: displayRows.map((r) => r.predictedMedianMin),
        barMaxWidth: 24,
        itemStyle: { color: predictedColor, borderRadius: [0, 6, 6, 0] },
        emphasis: { focus: "self" },
        blur: { itemStyle: { opacity: 0.45 } },
        label: {
          show: true, position: "right", distance: 8,
          // A small group says how small: a median over a handful of dispatches is not a firm expectation.
          formatter: (p: unknown) => {
            const { value, dataIndex } = p as { value: number | null; dataIndex: number };
            const r = displayRows[dataIndex];
            return `{v|${value == null ? "—" : fmtNum(value, 1)} min}${r && r.n < 20 ? `{n|(${r.n} disp.)}` : ""}`;
          },
          rich: {
            v: { color: T.textPrimary, fontSize: 13, fontWeight: 700 },
            n: { color: T.textMuted, fontSize: 12, padding: [0, 0, 0, 6] },
          },
        },
      },
    ],
  };

  const groupNoun = view === "cause" ? "causes" : "services";
  /* What the expectation is for: the model's predictions for held-out dispatches reported on that weekday and in that
     time block. It is not a forecast for any calendar date, today's included, so the "next: <date>, now" example and
     the Now button were taken out (20 Nov 2026, user: "why does it have a now option"); the held-out dispatches end
     on the date below. The card still opens on the current weekday and block (Manila) as a starting choice. */
  const slotSentence =
    `What the model expects for a breakdown reported on ${slotPhrase}, any week (not a forecast for particular dates)` +
    `: the median of its predictions for the ${(data.slot?.n ?? data.holdoutWindow?.n ?? 0).toLocaleString("en-US")} held-out dispatches reported then` +
    (data.holdoutWindow ? ` in ${fmtDateRange(data.holdoutWindow.from, data.holdoutWindow.to)}` : "") +
    (holdoutShare ? ` (the latest ${holdoutShare}, never trained on).` : " (never trained on).");

  return (
    <article className="chart-card wide nct-card brk-card" style={{ ["--brk-predicted" as string]: predictedColor }}>
      <div className="nct-card-head-split">
        {/* Title and its ⓘ only, as on Traffic (20 Nov 2026, user); what the expectation is read from moved in. */}
        <div className="nct-head-text">
          <h3 className="nct-title">
            Expected Breakdown Response Time
            <InfoTooltip text={`${slotSentence} ${modelRuleText}`} />
          </h3>
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

      {/* How far off the model is on dispatches it never saw, and when it was trained. */}
      <div className="brk-stats">
        <div className="brk-stat">
          <span className="brk-stat-icon" aria-hidden="true"><Clock size={22} strokeWidth={2} /></span>
          <span>
            <b>{championMetrics.mae != null ? `${fmtNum(championMetrics.mae, 1)} min` : "—"}</b>
            <small>Held-out MAE</small>
          </span>
        </div>
        <div className="brk-stat">
          <span className="brk-stat-icon" aria-hidden="true"><Layers size={22} strokeWidth={2} /></span>
          <span>
            <b>{championMetrics.scoreValue ?? "—"}</b>
            <small>{championMetrics.scoreLabel}</small>
          </span>
        </div>
        <div className="brk-stat">
          <span className="brk-stat-icon" aria-hidden="true"><CalendarDays size={22} strokeWidth={2} /></span>
          <span>
            <b>{fmtTrainedAt(data.trainedAt)}</b>
            <small>Trained</small>
          </span>
        </div>
      </div>

      {lead?.predictedMedianMin != null && (
        <p className="brk-answer">
          <span className="brk-answer-icon" aria-hidden="true"><Car size={24} strokeWidth={2} /></span>
          <span className="brk-answer-value">{fmtNum(lead.predictedMedianMin, 1)} min</span>
          <span className="brk-answer-text">
            Expected {view === "service" ? <>for <b>{lead.group}</b> to respond</> : <>response to a breakdown of cause <b>{lead.group}</b></>} on {slotPhrase}
            {lead.actualMedianMin != null && <>, measured {fmtNum(lead.actualMedianMin, 1)} min on the same dispatches</>}.
          </span>
        </p>
      )}

      <div aria-busy={loading} className="inc-busy-body brk-body">
        <div className="brk-section-head">
          <h4 className="nct-subhead">
            Expected Median Response <span className="brk-dot" aria-hidden="true">•</span> {slotPhrase}
          </h4>
          {/* Day and time the expectation is for, then the grouping. */}
          <div className="brk-tools" role="group" aria-label="Day, time and grouping">
            <CustomSelect
              prefix="Day"
              value={String(slot.dow)}
              onChange={(v) => setSlot((s) => ({ ...s, dow: v === "any" ? "any" : Number(v) }))}
              options={[{ label: "Any day", value: "any" }, ...DAY_ORDER.map((d) => ({ label: DAY_NAMES[d], value: String(d) }))]}
            />
            <CustomSelect
              prefix="Time"
              value={String(slot.block)}
              onChange={(v) => setSlot((s) => ({ ...s, block: v === "any" ? "any" : Number(v) }))}
              options={[{ label: "Any time", value: "any" }, ...Array.from({ length: 8 }, (_, b) => ({ label: blockLabel(b), value: String(b) }))]}
            />
            <div className="nct-pills" role="group" aria-label="Group by">
              {(["cause", "service"] as const).map((v) => (
                <button key={v} type="button" onClick={() => setView(v)} aria-pressed={view === v} className={`nct-pill-btn${view === v ? " is-on" : ""}`}>
                  {v === "cause" ? "By Cause" : "By Service"}
                </button>
              ))}
            </div>
          </div>
        </div>
        {loading && <p className="inc-status-line" role="status">Updating…</p>}
        {error && data && <p className="inc-status-line is-warn" role="alert">Couldn&apos;t load this day and time ({error}); showing the last answer.</p>}
        {rows.length === 0 ? (
          <p className="nct-foot">{data.slot ? <>No {view === "cause" ? "cause" : "service"} group has a held-out dispatch with a prediction on {slotPhrase}. Try Any time or Any day.</> : <>No {view === "cause" ? "cause" : "service"} groups met the training script&apos;s evidence cutoff.</>}</p>
        ) : (
          <>
            <DashboardChart option={chartOption} height={Math.max(200, displayRows.length * 40 + 56)} />
            <p className="brk-note">
              <Info size={16} strokeWidth={2} aria-hidden="true" />
              Top {rows.length} {groupNoun} by held-out evidence.
            </p>
          </>
        )}
      </div>

      {rows.length > 0 && !reportOpen && (
        <div className="brk-foot">
          <GenerateReportButton onClick={() => setReportOpen(true)} />
        </div>
      )}

      {/* Tied to the active view (By Cause / By Service): switching is a change of subject, so the narrative
          follows it. Its own endpoint (not ranking-narrative), whose prompt frames rows as corridor locations. */}
      {rows.length > 0 && (
        <NarrativePanel
          open={reportOpen}
          onOpenChange={setReportOpen}
          metrics={rows.map((r) => ({ model: r.group }))}
          endpoint="/api/ai-insight/breakdown-response-narrative"
          subjectKey={JSON.stringify(["breakdown-response", view, shown, champion, rows.map((r) => [r.group, r.predictedMedianMin, r.n])])}
          contextLine={`Expected median response time on ${slotPhrase} across ${rows.length} ${groupNoun}${champion ? ` · ${champion}` : ""}.`}
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
