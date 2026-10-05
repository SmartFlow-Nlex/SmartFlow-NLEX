"use client";

import { useEffect, useState } from "react";
import type { EChartsOption } from "echarts";
import DashboardChart from "./DashboardChart";
import InfoTooltip from "./InfoTooltip";
import { useChartTheme, seriesRamp } from "../../lib/chart-theme";
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
};
type EventBreakdownData = {
  breakdownCauses: { mainCause: string; subCause: string; count: number }[];
  responseTimeByService: DeploymentTimeStat[];
  responseTimeByCause: DeploymentTimeStat[];
};

const fmtInt = (n: number) => Math.round(n).toLocaleString("en-US");

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
          {error ?? "No breakdown dispatch data has been ingested yet."}
        </StateNote>
      </article>
    );
  }

  const responseRows = (responseView === "service" ? data.responseTimeByService : data.responseTimeByCause)
    .filter((r) => r.medianResponseMin != null)
    .slice(0, 10);
  const displayRows = [...responseRows].reverse();
  // The answer: the slowest median among the groups on the chart.
  const slowest = responseRows.reduce<DeploymentTimeStat | null>(
    (a, r) => (a == null || (r.medianResponseMin ?? -1) > (a.medianResponseMin ?? -1) ? r : a),
    null
  );

  const responseOption: EChartsOption = {
    grid: { left: 110, right: 42, top: 8, bottom: 28 },
    xAxis: { type: "value", name: "median response (min)", nameLocation: "middle", nameGap: 24, splitNumber: 3, axisLabel: { formatter: (v: number) => `${v} min` } },
    yAxis: { type: "category", data: displayRows.map((r) => r.group), axisLabel: {}, axisTick: { show: false } },
    tooltip: {
      axisPointer: { type: "shadow" },
      formatter: (p) => {
        const i = (p as { dataIndex: number }).dataIndex;
        const r = displayRows[i];
        return `<b>${r.group}</b><br/>Median response: ${r.medianResponseMin} min<br/>` +
          `Avg response: ${r.avgResponseMin ?? "—"} min<br/>Avg on-scene service time: ${r.avgServiceMin ?? "—"} min<br/>` +
          `${fmtInt(r.n)} dispatches`;
      },
    },
    series: [
      {
        type: "bar",
        data: displayRows.map((r) => ({ value: r.medianResponseMin, itemStyle: { color: RAMP[1], borderRadius: [0, 4, 4, 0] } })),
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
        <div className="inc-seg" role="group" aria-label="Group by">
          {(["cause", "service"] as const).map((v) => (
            <button key={v} onClick={() => setResponseView(v)} aria-pressed={responseView === v} className={responseView === v ? "is-on" : ""}>
              {v === "cause" ? "By Cause" : "By Service"}
            </button>
          ))}
        </div>
      </div>

      {slowest?.medianResponseMin != null && (
        <p className="inc-answer">
          <span className="inc-answer-value">{slowest.medianResponseMin} min</span>
          <span className="inc-answer-label">
            slowest median dispatch · <b>{slowest.group}</b>, {fmtInt(slowest.n)} dispatches
          </span>
        </p>
      )}

      <div>
        <h4 className="inc-subhead" style={{ marginBottom: 8 }}>Median Dispatch Response Time</h4>
        <DashboardChart option={responseOption} height={Math.max(180, displayRows.length * 32 + 20)} />
        <p className="inc-caption" style={{ marginTop: 6 }}>Last 12 months; does not follow Range or Weather.</p>
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
