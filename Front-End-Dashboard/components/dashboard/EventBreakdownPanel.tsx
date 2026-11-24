"use client";

import { memo, useEffect, useRef, useState } from "react";
import { attachCategoryClick } from "../../lib/chart-click";
import { ArrowDownWideNarrow, ArrowUpNarrowWide, Timer } from "lucide-react";
import styles from "../../app/dashboard/traffic/traffic.module.css";
import { CardIcon, CardInsight } from "./CardBits";
import CustomSelect from "./CustomSelect";
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
  /** Click a bar (or its row) for its figures, in the page's own detail pop-up (19 Nov 2026, user request). */
  onPick?: (d: { title: string; subtitle?: string; rows: [string, string][]; note?: string }) => void;
};

function EventBreakdownPanel({ months = "12", from, to, onPick }: Props) {
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
  // The chart is wired once, when it is ready; the click reads the rows on screen through this ref.
  const pickRef = useRef<(i: number) => void>(() => {});

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

  // The fastest group on the same footing as the slowest (5 dispatches or more), for the card's insight.
  const fastest = [...responseRows].reverse().find((r) => r.n >= 5 && r !== slowest) ?? null;
  // Shaded by rank (19 Nov 2026): the slowest third darkest, then the middle, then the quickest. Shading by the share
  // of the longest time put four of five bars in the same darkest step, because the times sit close together.
  const rankOf = new Map(responseRows.map((r, i) => [r.group, i]));
  const tierOf = (g: string) => {
    const i = rankOf.get(g) ?? 0;
    const n = Math.max(1, responseRows.length);
    return i < Math.ceil(n / 3) ? RAMP[2] : i < Math.ceil((2 * n) / 3) ? RAMP[1] : RAMP[0];
  };
  const dispatches = responseRows.reduce((sum, r) => sum + r.n, 0);
  const pickRow = (i: number) => {
    const r = displayRows[i];
    if (!r || !onPick) return;
    const fig = (v: number | null) => (v == null ? "—" : `${v} min`);
    const rank = responseRows.indexOf(r) + 1;
    onPick({
      title: r.group,
      subtitle: responseView === "service" ? fullServiceName(r.group) : "Breakdown cause, dispatch response",
      rows: [
        ["Median response", fig(r.medianResponseMin)],
        ["Average response", fig(r.avgResponseMin)],
        ["Average on-scene time", fig(r.avgServiceMin)],
        ["Dispatches", fmtInt(r.n)],
        ...(r.zeroResponseN ? ([["Logged at 0 min", `${fmtInt(r.zeroResponseN)} (dispatch and arrival at the same minute)`]] as [string, string][]) : []),
        ["Rank", `${rank} of ${responseRows.length}, slowest first by ${measureWord}`],
      ],
      note: "Follows Range. Weather and Incident type do not apply: the dispatch log carries neither.",
    });
  };
  // Kept current on every render (the panel returns early while loading, so this cannot be an effect), so a
  // click always reads the rows on screen.
  pickRef.current = pickRow;
  const gap = slowest && fastest && M.pick(slowest) != null && M.pick(fastest) != null ? (M.pick(slowest) as number) - (M.pick(fastest) as number) : null;
  const labelInk = chartTheme.isDark ? "#e6edf9" : "#10213f";
  const measureWord = M.key === "onscene" ? "average on-scene time" : M.key === "avg" ? "average response" : "median response";

  /* Laid out like the Traffic tab's bar cards (19 Nov 2026, user: "look good same as the traffic descriptive"):
     a track behind each bar, the minutes and the dispatch count printed at its end, no value axis, and the shade
     stepping with the time. */
  const responseOption: EChartsOption = {
    grid: { left: 130, right: 132, top: 4, bottom: 4 },
    xAxis: { type: "value", axisLabel: { show: false }, splitLine: { show: false }, axisLine: { show: false }, axisTick: { show: false } },
    yAxis: {
      type: "category",
      data: displayRows.map((r) => r.group),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { interval: 0, fontSize: 12.5, fontWeight: 600, color: labelInk, width: 116, overflow: "truncate", margin: 12 },
      // Hovering an axis label shows the full service name for the acronyms.
      triggerEvent: true,
    },
    /* Shown anywhere along a row (trigger "axis"), in the Traffic tab's layout (19 Nov 2026, user: the chart had
       no hover: an item tooltip only fired on the bar itself, and a 0-minute group has no bar to land on). */
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "none" },
      formatter: (p) => {
        const i = (Array.isArray(p) ? p[0] : (p as { dataIndex: number })).dataIndex;
        const r = displayRows[i];
        if (!r) return "";
        const full = responseView === "service" ? `<br/><span style="opacity:0.8">${fullServiceName(r.group)}</span>` : "";
        const zeroN = r.zeroResponseN ? `<br/><span style="opacity:0.8">${fmtInt(r.zeroResponseN)} of ${fmtInt(r.n)} logged at 0 min (dispatch and arrival at the same minute)</span>` : "";
        const fig = (v: number | null) => (v == null ? "—" : `${v} min`);
        return `<b>${r.group}</b>${full}<br/>Median response: <b>${fig(r.medianResponseMin)}</b><br/>` +
          `Avg response: <b>${fig(r.avgResponseMin)}</b><br/>Avg on-scene: <b>${fig(r.avgServiceMin)}</b><br/>` +
          `Dispatches: <b>${fmtInt(r.n)}</b>${zeroN}`;
      },
    },
    series: [
      {
        type: "bar",
        // Every bar carries its minutes and how many dispatches it rests on: a 0-minute group has no bar to see,
        // and a small group says how small (testers IN-9).
        label: {
          show: true,
          position: "right",
          distance: 8,
          formatter: (p: unknown) => {
            const { value, dataIndex } = p as { value: number; dataIndex: number };
            const r = displayRows[dataIndex];
            return `{v|${value} min}{p|${r ? `${fmtInt(r.n)} disp.` : ""}}`;
          },
          rich: { v: { fontSize: 12.5, fontWeight: 700, color: labelInk }, p: { fontSize: 12, color: chartTheme.text, padding: [0, 0, 0, 6] } },
        },
        data: displayRows.map((r) => ({ value: M.pick(r), itemStyle: { color: tierOf(r.group), borderRadius: [0, 6, 6, 0] } })),
        barWidth: 14,
        // Hover: this bar stays, the others fade (it replaced a cropped grey band, 19 Nov 2026).
        emphasis: { focus: "self" },
        blur: { itemStyle: { opacity: 0.4 } },
        showBackground: true,
        backgroundStyle: { color: chartTheme.isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(16, 33, 63, 0.05)", borderRadius: 6 },
      },
    ],
  };

  return (
    <article className={`${styles.chartCard} inc-resp-card`}>
      <div className={styles.chartHead}>
        <div className="nc-head-main">
          <CardIcon icon={Timer} />
          <div className={styles.headText}>
            <h3>
              Response Time Breakdown
              <InfoTooltip text="Dispatch response times (AAP, Patrol Vehicle, RAMFA, and others) from the breakdown log, by cause or by service. Built from breakdown_data's per-dispatch records: only breakdowns with a logged dispatch are included, and responses over 24 h are treated as data-entry noise and left out. Follows Range; Weather and Incident type do not apply, because the dispatch log carries neither. By service, hover a name for the unit's full name." />
            </h3>
          </div>
        </div>
        {/* The shared sort button, then the measure and the grouping as self-labelled menus (19 Nov 2026), as on
            the Causes and Dry vs Wet cards: seven pill buttons in a row read as one wall of choices. */}
        <div className="nct-head-tools inc-resp-tools">
          <button
            type="button"
            className={styles.sortBtn}
            onClick={() => setOrder(order === "desc" ? "asc" : "desc")}
            title={order === "desc" ? "Longest first — click for shortest first" : "Shortest first — click for longest first"}
            aria-label={`Sort order: ${order === "desc" ? "longest first" : "shortest first"}. Activate to reverse.`}
          >
            {order === "desc" ? <ArrowDownWideNarrow size={15} /> : <ArrowUpNarrowWide size={15} />}
          </button>
          <CustomSelect prefix="Measure" value={metric} options={METRICS.map((m) => ({ label: m.label, value: m.key }))} onChange={(v) => setMetric(v as Metric)} />
          <CustomSelect
            prefix="Group"
            value={responseView}
            options={[{ label: "By cause", value: "cause" }, { label: "By service", value: "service" }]}
            onChange={(v) => setResponseView(v as "cause" | "service")}
          />
        </div>
      </div>

      <div className="inc-resp-body">
      <div style={{ position: "relative", minWidth: 0 }}>
        <DashboardChart
          option={responseOption}
          height={Math.max(180, displayRows.length * 34 + 12)}
          themeTweak={liftDarkText}
          onEvents={{
            mouseover: ((p: { componentType?: string; value?: string; name?: string; event?: { offsetX: number; offsetY: number } }) => {
              if (responseView !== "service" || p.componentType !== "yAxis" || !p.event) return;
              setAxisTip({ name: String(p.value ?? p.name ?? ""), x: p.event.offsetX, y: p.event.offsetY });
            }) as (p: never) => void,
            mouseout: ((p: { componentType?: string }) => {
              if (p.componentType === "yAxis") setAxisTip(null);
            }) as (p: never) => void,
            // A click on a bar or its name; the rest of the row is caught by attachCategoryClick below.
            click: ((p: { componentType?: string; dataIndex?: number; value?: string }) => {
              if (p.componentType === "series" && p.dataIndex != null) pickRef.current(p.dataIndex);
              else if (p.componentType === "yAxis") pickRef.current(displayRows.findIndex((r) => r.group === p.value));
            }) as (p: never) => void,
          }}
          onChartReady={onPick ? (c) => attachCategoryClick(c as never, ((q: { dataIndex: number }) => pickRef.current(q.dataIndex)) as never) : undefined}
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
      {/* The bars' headline figures, each from the rows drawn (19 Nov 2026): the full-width card left the bars
          stretched across it with nothing beside them. Slowest and fastest count only groups with 5+ dispatches. */}
      <dl className="inc-resp-stats">
        {slowest && M.pick(slowest) != null && (
          <div>
            <dt>Slowest</dt>
            <dd><b>{M.pick(slowest)} min</b><span>{slowest.group}</span></dd>
          </div>
        )}
        {fastest && M.pick(fastest) != null && (
          <div>
            <dt>Fastest</dt>
            <dd><b>{M.pick(fastest)} min</b><span>{fastest.group}</span></dd>
          </div>
        )}
        {gap != null && (
          <div>
            <dt>Gap</dt>
            <dd><b>{Number(gap.toFixed(1))} min</b><span>between the two</span></dd>
          </div>
        )}
        <div>
          <dt>Dispatches</dt>
          <dd><b>{fmtInt(dispatches)}</b><span>in {responseRows.length} {responseView === "service" ? "services" : "causes"}</span></dd>
        </div>
      </dl>
      </div>
      {/* Why a row can look blank (testers IN-9): the Investigator unit is logged on scene, dispatch time = arrival
          time, so its median is 0, a bar of no length. Said in words, only when such a row is shown. */}
      {(() => {
        const zeroRows = displayRows.filter((r) => M.pick(r) === 0);
        if (zeroRows.length === 0) return null;
        return (
          <p className="inc-caption" style={{ margin: "4px 0 0" }}>
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
      {slowest && M.pick(slowest) != null && (
        <CardInsight lead={`Slowest ${measureWord}: ${slowest.group}, ${M.pick(slowest)} min over ${fmtInt(slowest.n)} ${slowest.n === 1 ? "dispatch" : "dispatches"}.`}>
          {fastest && M.pick(fastest) != null && gap != null
            ? `That is ${Number(gap.toFixed(1))} min longer than ${fastest.group} (${M.pick(fastest)} min), the quickest with 5 or more dispatches.`
            : null}
        </CardInsight>
      )}
    </article>
  );
}

/* Memoised (19 Nov 2026): opening the page's detail pop-up from a click here re-rendered the page, which handed the
   chart a new option mid-gesture and ECharts threw on the bar it was highlighting. Its props do not change then. */
export default memo(EventBreakdownPanel);
