"use client";

import { useEffect, useState } from "react";
import type { EChartsOption } from "echarts";
import DashboardChart from "./DashboardChart";
import InfoTooltip from "./InfoTooltip";
import { useChartTheme, seriesRamp, liftDarkText } from "../../lib/chart-theme";
import StateNote from "../stage/StateNote";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

// Mirrors src/services/incident-events.service.ts's response shape.
// No accident-vs-breakdown monthly trend here anymore: it was a duplicate of
// /analytics's Incident Trend chart (verified identical month-by-month counts
// once both endpoints respected the same Range and read the same client
// tables), so this panel is response-time analytics only.
type DeploymentTimeStat = {
  group: string;
  n: number;
  avgResponseMin: number | null;
  medianResponseMin: number | null;
  avgServiceMin: number | null;
  // How many of n carry a usable response / on-scene time, and how many responses were logged as 0 min.
  responseN?: number;
  serviceN?: number;
  zeroResponseN?: number;
};
type EventBreakdownData = {
  breakdownCauses: { mainCause: string; subCause: string; count: number }[];
  responseTimeByService: DeploymentTimeStat[];
  responseTimeByCause: DeploymentTimeStat[];
};

const fmtInt = (n: number) => Math.round(n).toLocaleString("en-US");

/* Full names for the abbreviated service labels, shown on hover. Only expansions
   that are certain are listed. AAP, RAMFA and RSIG are logged as acronyms and no
   file in this repo (ETL, SQL, models, docs) spells them out; they are left to
   say so rather than guess at what an operator reads as fact. */
const SERVICE_FULL_NAME: Record<string, string> = {
  EMS: "Emergency Medical Services",
  "Patrol Vehicle": "Patrol Vehicle (highway patrol unit)",
  Investigator: "Investigator (incident investigation unit)",
  Others: "Other services (not classified in the dispatch log)",
};
const fullServiceName = (g: string) =>
  SERVICE_FULL_NAME[g] ?? `${g}: acronym as logged; expansion not recorded in the data dictionary`;

type Metric = "median" | "avg" | "onscene";
const METRICS: { key: Metric; label: string; axis: string; pick: (r: DeploymentTimeStat) => number | null }[] = [
  { key: "median", label: "Median response", axis: "median response (min)", pick: (r) => r.medianResponseMin },
  { key: "avg", label: "Avg response", axis: "average response (min)", pick: (r) => r.avgResponseMin },
  { key: "onscene", label: "Avg on-scene", axis: "average on-scene time (min)", pick: (r) => r.avgServiceMin },
];

type Props = {
  // Same Range control as the rest of the Descriptive page. Defaults to this
  // panel's original fixed 12mo when unset.
  months?: "3" | "12" | "all";
  from?: string;
  to?: string;
};

export default function EventBreakdownPanel({ months = "12", from, to }: Props) {
  const chartTheme = useChartTheme();
  const RAMP = seriesRamp("incident", chartTheme);

  const [data, setData] = useState<EventBreakdownData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [responseView, setResponseView] = useState<"cause" | "service">("cause");
  const [metric, setMetric] = useState<Metric>("median");
  const [order, setOrder] = useState<"desc" | "asc">("desc");
  // Full-name hover for a y-axis label. ECharts' own axis tooltip can only echo
  // the label text, so the hover is reported here and drawn as a small overlay.
  const [axisTip, setAxisTip] = useState<{ name: string; x: number; y: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const qs = new URLSearchParams();
    if (months) qs.set("months", months);
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    fetch(`${BACKEND}/api/incident/event-breakdown?${qs}`, { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json();
        if (cancelled) return;
        if (!json.success) throw new Error(json.message ?? "Request failed");
        setData(json.data as EventBreakdownData);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load event breakdown");
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [months, from, to]);

  if (loading) {
    return (
      <article className="chart-card wide inc-card" style={{ minHeight: "320px", justifyContent: "center" }}>
        <div className="inc-loading" role="status">Loading event breakdown…</div>
      </article>
    );
  }

  if (error || !data || (data.responseTimeByCause.length === 0 && data.responseTimeByService.length === 0)) {
    return (
      <article className="chart-card wide inc-card" style={{ minHeight: "260px", justifyContent: "center" }}>
        <StateNote kind={error ? "error" : "nodata"} title="Response time breakdown unavailable">
          {error ?? "No breakdown dispatches with a logged response in this Range."}
        </StateNote>
      </article>
    );
  }

  const M = METRICS.find((m) => m.key === metric)!;
  // The ten most-dispatched groups (the API's order), then ranked by the chosen
  // measure: keeping the cut on volume stops a 3-dispatch group outranking AAP.
  const responseRows = (responseView === "service" ? data.responseTimeByService : data.responseTimeByCause)
    .filter((r) => M.pick(r) != null)
    .slice(0, 10)
    .sort((a, b) => (M.pick(b) ?? 0) - (M.pick(a) ?? 0));
  // A category axis draws index 0 at the bottom, so longest-first is the reverse.
  const displayRows = order === "desc" ? [...responseRows].reverse() : [...responseRows];
  // The answer: the slowest group on the measure being shown.
  // Groups with a handful of dispatches can top the ranking on one outlier (a
  // short Range gave "slowest: RSIG, 1 dispatches"), so the headline prefers
  // groups with at least 5; the bars still show everything.
  const slowest = responseRows.find((r) => r.n >= 5) ?? responseRows[0] ?? null;

  const responseOption: EChartsOption = {
    grid: { left: 118, right: 104, top: 8, bottom: 30 },
    xAxis: { type: "value", name: M.axis, nameLocation: "middle", nameGap: 24, splitNumber: 3, axisLabel: { formatter: (v: number) => `${v} min` } },
    yAxis: {
      type: "category",
      data: displayRows.map((r) => r.group),
      axisLabel: { fontSize: 12 },
      axisTick: { show: false },
      // Hovering an axis label shows the full service name for the acronyms.
      triggerEvent: true,
    },
    tooltip: {
      axisPointer: { type: "shadow" },
      formatter: (p) => {
        const i = (p as { dataIndex: number }).dataIndex;
        const r = displayRows[i];
        const full = responseView === "service" ? `<br/><span style="color:var(--text-muted)">${fullServiceName(r.group)}</span>` : "";
        const zeroN = r.zeroResponseN ? `<br/><span style="color:var(--text-muted)">${fmtInt(r.zeroResponseN)} of ${fmtInt(r.n)} logged at 0 min (dispatch and arrival at the same minute)</span>` : "";
        const zero = M.pick(r) === 0 ? `<br/><span style="color:var(--text-muted)">0 min: dispatch and arrival were logged at the same time</span>${zeroN}` : zeroN;
        return `<b>${r.group}</b>${full}<br/>Median response: ${r.medianResponseMin ?? "—"} min<br/>` +
          `Avg response: ${r.avgResponseMin ?? "—"} min<br/>Avg on-scene service time: ${r.avgServiceMin ?? "—"} min<br/>` +
          `${fmtInt(r.n)} dispatches${zero}`;
      },
    },
    series: [
      {
        type: "bar",
        // A value label on every bar: a 0-minute group (Investigators are logged
        // on scene, dispatch time = arrival time) has no bar to see and used to
        // read as an empty row.
        // A small group says how small (testers IN-9): Investigator's 0 min rests on 5 dispatches.
        label: {
          show: true, position: "right", fontSize: 12, color: chartTheme.ink,
          formatter: (p: unknown) => {
            const { value, dataIndex } = p as { value: number; dataIndex: number };
            const r = displayRows[dataIndex];
            return r && r.n < 20 ? `${value} min · ${fmtInt(r.n)} disp.` : `${value} min`;
          },
        },
        data: displayRows.map((r) => ({ value: M.pick(r), itemStyle: { color: RAMP[1], borderRadius: [0, 4, 4, 0] } })),
        barMaxWidth: 16,
      },
    ],
  };

  return (
    <article className="chart-card wide inc-card">
      <div className="inc-card-head">
        <div className="inc-card-titles">
          <h3 className="inc-card-title">
            Response Time Breakdown
            <InfoTooltip text="Dispatch response times (AAP, Patrol Vehicle, RAMFA, and others) from the breakdown log, by cause or by service." />
          </h3>
        </div>
        <div className="inc-card-tools">
          <div className="inc-seg" role="group" aria-label="Measure">
            {METRICS.map((m) => (
              <button key={m.key} onClick={() => setMetric(m.key)} aria-pressed={metric === m.key} className={metric === m.key ? "is-on" : ""}>
                {m.label}
              </button>
            ))}
          </div>
          <div className="inc-seg" role="group" aria-label="Sort order">
            {(["desc", "asc"] as const).map((o) => (
              <button key={o} onClick={() => setOrder(o)} aria-pressed={order === o} className={order === o ? "is-on" : ""}>
                {o === "desc" ? "Longest first" : "Shortest first"}
              </button>
            ))}
          </div>
          <div className="inc-seg" role="group" aria-label="Group by">
            {(["cause", "service"] as const).map((v) => (
              <button key={v} onClick={() => setResponseView(v)} aria-pressed={responseView === v} className={responseView === v ? "is-on" : ""}>
                {v === "cause" ? "By Cause" : "By Service"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {slowest && M.pick(slowest) != null && (
        <p className="inc-answer">
          <span className="inc-answer-value">{M.pick(slowest)} min</span>
          <span className="inc-answer-label">
            slowest {M.key === "onscene" ? "average on-scene time" : M.key === "avg" ? "average dispatch" : "median dispatch"} · <b>{slowest.group}</b>, {fmtInt(slowest.n)} {slowest.n === 1 ? "dispatch" : "dispatches"}
          </span>
        </p>
      )}

      <div>
        <h4 className="inc-subhead" style={{ marginBottom: 8 }}>{M.key === "onscene" ? "Average On-Scene Time" : M.key === "avg" ? "Average Dispatch Response Time" : "Median Dispatch Response Time"}</h4>
        <div style={{ position: "relative" }}>
          <DashboardChart
            option={responseOption}
            height={Math.max(180, displayRows.length * 32 + 20)}
            themeTweak={liftDarkText}
            onEvents={{
              mouseover: ((p: { componentType?: string; value?: string; name?: string; event?: { offsetX: number; offsetY: number } }) => {
                if (responseView !== "service" || p.componentType !== "yAxis" || !p.event) return;
                setAxisTip({ name: String(p.value ?? p.name ?? ""), x: p.event.offsetX, y: p.event.offsetY });
              }) as (p: never) => void,
              mouseout: ((p: { componentType?: string }) => {
                if (p.componentType === "yAxis") setAxisTip(null);
              }) as (p: never) => void,
            }}
          />
          {axisTip && (
            <div
              role="tooltip"
              style={{
                position: "absolute", left: axisTip.x + 12, top: axisTip.y + 12, zIndex: 5, pointerEvents: "none", maxWidth: 260,
                padding: "8px 11px", borderRadius: 10, fontSize: "0.8rem", lineHeight: 1.4,
                background: "var(--chart-tooltip-bg)", color: "var(--chart-tooltip-text)", border: "1px solid var(--chart-tooltip-border)",
                boxShadow: "0 12px 32px rgba(0,0,0,0.25)",
              }}
            >
              <b>{axisTip.name}</b>
              <div style={{ opacity: 0.85 }}>{fullServiceName(axisTip.name)}</div>
            </div>
          )}
        </div>
        {/* Why a row can look blank (testers IN-9: "Investigator row is blank"). Not missing data: the
            Investigator unit is logged on scene, dispatch time = arrival time, so most of its few
            dispatches read 0 min and the median is 0, a bar of no length. Said in words under the chart. */}
        {(() => {
          const zeroRows = displayRows.filter((r) => M.pick(r) === 0);
          if (zeroRows.length === 0) return null;
          return (
            <p className="inc-caption" style={{ marginTop: 6 }}>
              {zeroRows.map((r, i) => (
                <span key={r.group}>
                  {i > 0 ? "; " : ""}
                  <b>{r.group}</b> reads 0 min
                  {r.zeroResponseN != null ? `: ${fmtInt(r.zeroResponseN)} of its ${fmtInt(r.n)} dispatches were logged with dispatch and arrival at the same minute` : ""}
                </span>
              ))}
              . A real 0, not a gap, so there is no bar to draw.
            </p>
          );
        })()}
        {responseView === "service" && (
          <p className="inc-caption" style={{ marginTop: 6 }}>Hover a service name for its full name. Bars with fewer than 20 dispatches show their count.</p>
        )}
        <p className="inc-caption" style={{ marginTop: 6 }}>Follows Range. Weather and Incident type do not apply: the dispatch log carries neither.</p>
        <details className="nc-details">
          <summary>How this is measured</summary>
          <p style={{ margin: 0 }}>
            Built from breakdown_data&apos;s per-dispatch records — only the subset of breakdowns with a logged AAP/
            Patrol Vehicle/RAMFA dispatch are included; responses over 24h are treated as data-entry noise and excluded.
          </p>
        </details>
      </div>
    </article>
  );
}
