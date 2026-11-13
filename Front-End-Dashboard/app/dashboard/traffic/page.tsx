"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cachedJson } from "../../../lib/cached-json";
import { attachCategoryClick } from "../../../lib/chart-click";
import { useChartTheme, applyChartTheme, heatRamp, seriesRamp, seriesPair } from "../../../lib/chart-theme";
import { heatTip, heatValue, scrubHeatmap } from "../../../lib/heat-tooltip";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import { Activity, ArrowDownWideNarrow, ArrowUpNarrowWide, Building2, CalendarClock, CalendarDays, Clock, Gauge, Grid3x3, TrendingUp } from "lucide-react";
import { CardIcon, CardInsight } from "../../../components/dashboard/CardBits";
import FilterChips, { rangeText, type FilterChip } from "../../../components/dashboard/FilterChips";
import { SortHead, useSortedRows, type SortCol } from "../../../components/dashboard/SortableTable";
import { BoothStaffingPanel, CongestionResponsePanel, EventInterventionPanel } from "../../../components/dashboard/PrescriptiveTrafficPanels";
import ChartSkeleton, { KpiSkeleton } from "../../../components/dashboard/ChartSkeleton";
import CustomSelect from "../../../components/dashboard/CustomSelect";
import RampKey from "../../../components/dashboard/RampKey";
import PageHeader from "../../../components/dashboard/PageHeader";
import InfoTooltip from "../../../components/dashboard/InfoTooltip";
import PredictiveVolumeChart from "../../../components/dashboard/PredictiveVolumeChart";
import PredictiveCongestionChart from "../../../components/dashboard/PredictiveCongestionChart";
import PredictiveEventChart from "../../../components/dashboard/PredictiveEventChart";
import styles from "./traffic.module.css";
import DateRangePicker from "./components/DateRangePicker";
import { rangeDays, grainBlockedReason, bestGrainFor, bucketLabelFor, timeAxisLabels } from "../../../lib/granularity";
import CountUpValue from "../../../components/dashboard/CountUpValue";
import ModeTabLabel, { modeIndex } from "../../../components/dashboard/ModeTabLabel";
import StateNote from "../../../components/stage/StateNote";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";


const DOW_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
/** Full day names, for tooltips, pop-up titles and sentences; the grid's axis keeps the short ones. */
const DOW_FULL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Postgres dow (0=Sun) -> Mon-first

// ---------- Data contract ----------
type Analytics = {
  range: { from: string; to: string };
  meta: { plazas: string[]; minDate: string; maxDate: string; /** Last day of Waze jam reports. */ jamTo?: string | null };
  kpis: {
    totalVolume: number;
    prevTotalVolume: number;
    days: number;
    prevDays: number;
    congestionIndex: number | null;
    prevCongestionIndex: number | null;
  };
  /** nb + sb + bothdir = the day: bothdir is the plazas the record does not split by direction (as on Emissions). */
  dailyTrend: { d: string; nb: number; sb: number; bothdir: number }[];
  hourlyTrend: { d: string; hour: number; nb: number; sb: number; bothdir: number }[] | null;
  byPlaza: { plaza: string; v: number }[];
  hourDow: { dow: number; hour: number; v: number }[];
  plazaHourProfile?: { plaza: string; hour: number; v: number }[];
  speedByHour: { hour: number; speed: number; jam_level: number }[];
  eventImpact: {
    label: string; date: string; dayVolume: number; baseline: number; deviationPct: number | null;
    plaza?: string; venueExit?: string; view?: string; eventCount?: number; attendance?: number | null; onHoliday?: boolean; baselineDays?: number;
  }[];
  holidayImpact: {
    label: string; deviationPct: number; occurrences: number; baseline: number; volume: number;
    holidayType?: string; minBaselineDays?: number;
  }[];
  holidayYearly: { label: string; year: number; pct: number; volume: number }[];
};

/* Where arena events are measured (backend: traffic.service eventImpact `view`). Bocaue Barrier is not offered:
   it is the mainline barrier, so its entries are through traffic rather than arena trips. */
const EVENT_EXIT_VIEWS = [
  { value: "venue", label: "Venue exit (CDV / PH Arena)" },
  { value: "Bocaue Interchange", label: "Bocaue Interchange" },
  { value: "Tambubong", label: "Tambubong (Sta. Maria)" },
  { value: "Marilao", label: "Marilao" },
  { value: "All arena exits", label: "All arena exits combined" },
] as const;
type EventExitView = (typeof EVENT_EXIT_VIEWS)[number]["value"];

type Granularity = "hourly" | "daily" | "weekly" | "monthly";
type RangeMode = "3" | "12" | "all" | "custom";
type Direction = "Both" | "NB" | "SB";
type VehicleClass = "All" | "Class 1" | "Class 2" | "Class 3";

// Click-to-inspect popup content
type Detail = { title: string; subtitle?: string; rows: [string, string][]; note?: string };

const weekdayOf = (dateStr: string) =>
  new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-US", { weekday: "long" });

// ---------- Formatting ----------
const fmtInt = (n: number) => Math.round(n).toLocaleString("en-US");
const fmtCompact = (n: number) =>
  Math.abs(n) >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : Math.abs(n) >= 10_000 ? `${(n / 1_000).toFixed(0)}K` : fmtInt(n);
const fmtHour = (h: number) => (h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`);
// null = nothing to compare against (the previous period had no traffic): no percentage, not a made-up 0.0%.
const fmtPct = (p: number | null) => (p == null ? "no earlier data" : `${p >= 0 ? "+" : ""}${p.toFixed(1)}%`);

function movingAverage(values: number[], window: number): (number | null)[] {
  return values.map((_, i) => {
    if (i < window - 1) return null;
    let sum = 0;
    for (let j = i - window + 1; j <= i; j++) sum += values[j];
    return Math.round(sum / window);
  });
}

function weekStart(dateStr: string): string {
  const dt = new Date(`${dateStr}T00:00:00`);
  dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7)); // back to Monday
  return dt.toISOString().slice(0, 10);
}

type TrendRow = { label: string; nb: number; sb: number; bothdir: number; total: number };

function buildTrend(data: Analytics, grain: Granularity): TrendRow[] {
  if (grain === "hourly") {
    return (data.hourlyTrend ?? []).map((r) => ({
      label: `${r.d} ${String(r.hour).padStart(2, "0")}:00`,
      nb: r.nb,
      sb: r.sb,
      bothdir: r.bothdir ?? 0,
      total: r.nb + r.sb + (r.bothdir ?? 0),
    }));
  }
  if (grain === "daily") {
    return data.dailyTrend.map((r) => ({ label: r.d, nb: r.nb, sb: r.sb, bothdir: r.bothdir ?? 0, total: r.nb + r.sb + (r.bothdir ?? 0) }));
  }
  const keyOf = grain === "weekly" ? (d: string) => weekStart(d) : (d: string) => d.slice(0, 7);
  const acc = new Map<string, { nb: number; sb: number; bothdir: number }>();
  for (const r of data.dailyTrend) {
    const k = keyOf(r.d);
    const cur = acc.get(k) ?? { nb: 0, sb: 0, bothdir: 0 };
    acc.set(k, { nb: cur.nb + r.nb, sb: cur.sb + r.sb, bothdir: cur.bothdir + (r.bothdir ?? 0) });
  }
  return [...acc.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([label, v]) => ({ label, nb: v.nb, sb: v.sb, bothdir: v.bothdir, total: v.nb + v.sb + v.bothdir }));
}

const ROLLING_WINDOW: Record<Granularity, number> = { hourly: 24, daily: 7, weekly: 0, monthly: 0 };

export default function TrafficPage() {
  // Chart furniture follows the active theme; series hues stay fixed.
  const chartTheme = useChartTheme();

  /* This tab's colour family. The ramp is ordinal — lightest to darkest — and
     both modes are selected steps validated against their own surface, not an
     automatic flip. A pair of nominal series takes the outer two steps, which is
     where the separation margin lives. See lib/chart-theme. */
  const RAMP = seriesRamp("traffic", chartTheme);
  const [PAIR_A, PAIR_B] = seriesPair("traffic", chartTheme);
  const SEQ = [chartTheme.seqLightest, ...RAMP];
  // Speed is a status reading, not a series, so it keeps the reserved
  // good/warning/critical colours rather than the tab hue.
  // Speed is a measurement, not a road state, so it takes the Traffic blue ramp
  // (slowest = deepest) rather than red/amber/green: those now mean the lane
  // signals only, and on a min-to-max ramp they painted a 10 km/h jam green.
  const SEVERITY = [RAMP[2], RAMP[1], RAMP[0]];
  // Night Corridor draws no axis lines, so chartTheme.axis is transparent. The
  // residual "Others" bar, the zero line and scrubbed-out cells need a neutral
  // that is actually visible on both grounds.
  const NEUTRAL = chartTheme.isDark ? "rgba(244, 241, 234, 0.24)" : "rgba(11, 18, 32, 0.22)";
  const CELL_GAP = chartTheme.isDark ? "#0a1121" : "#fdfdfc";
  /* Above/below a baseline (17 Oct 2026, testers TR-5: "reuse the Volume-by-Plaza bar colouring for dark-mode
     visibility"). The pair's outer steps are right by day, but at night the deep step (#2f5fba) sinks into the
     navy card, so night takes the plaza chart's two brighter steps and both directions stay visible. */
  // Above the baseline is the deeper shade in both modes (user request, 4 Nov 2026); the ramp runs lightest to darkest.
  const ABOVE = chartTheme.isDark ? RAMP[1] : PAIR_A;
  const BELOW = chartTheme.isDark ? RAMP[0] : PAIR_B;
  const [activeTab, setActiveTab] = useState<"Descriptive" | "Predictive" | "Prescriptive">("Descriptive");

  // Global filters (Row A)
  const [rangeMode, setRangeMode] = useState<RangeMode>("12");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [plazaSel, setPlazaSel] = useState<string[]>([]); // empty = All
  const [direction, setDirection] = useState<Direction>("Both");
  const [vClass, setVClass] = useState<VehicleClass>("All");
  const [weather, setWeather] = useState<"all" | "dry" | "wet">("all");

  // Chart-local interactivity
  const [plazaSort, setPlazaSort] = useState<"desc" | "asc">("desc");
  const [impactSort, setImpactSort] = useState<"desc" | "asc">("desc");
  const [grain, setGrain] = useState<Granularity>("daily");
  const [splitDirection, setSplitDirection] = useState(false);
  const [impactMode, setImpactMode] = useState<"Events" | "Holidays">("Holidays");
  // Which exit the arena events are measured at: the venue's own (CDV), another arena exit, or all of them.
  const [eventExit, setEventExit] = useState<EventExitView>("venue");
  const [allPlazasOpen, setAllPlazasOpen] = useState(false);
  const [impactListOpen, setImpactListOpen] = useState(false);
  // The Arena list runs to dozens of events across several years; a year filter saves the scroll (testers TR-5).
  const [eventYear, setEventYear] = useState<string>("all");
  const [detail, setDetail] = useState<Detail | null>(null);

  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Custom mode waits until both dates are picked
    if (rangeMode === "custom" && (!customFrom || !customTo)) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams();
    if (rangeMode === "custom") {
      qs.set("from", customFrom);
      qs.set("to", customTo);
    } else {
      qs.set("months", rangeMode);
    }
    if (plazaSel.length > 0) qs.set("plazas", plazaSel.join(","));
    if (vClass !== "All") qs.set("vehicleClass", vClass);
    if (weather !== "all") qs.set("weather", weather);
    // Memoised per query string: switching tabs or returning to this page
    // renders from memory instead of refetching. Five minutes, refreshed
    // quietly in the background once stale. See lib/cached-json.
    cachedJson<{ success: boolean; message?: string; data: Analytics }>(`${BACKEND}/api/traffic/analytics?${qs}`)
      .then((json) => {
        if (cancelled) return;
        if (!json.success) throw new Error(json.message ?? "Request failed");
        setData(json.data);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [rangeMode, customFrom, customTo, plazaSel, vClass, weather]);

  // Hourly grain exists only when the server shipped hourly rows (spans <= ~3 months)
  const hourlyAvailable = !!data?.hourlyTrend;
  useEffect(() => {
    if (grain === "hourly" && data && !data.hourlyTrend) setGrain("daily");
  }, [data, grain]);

  /* How long a window is on screen, and what that allows.

     Measured from the range the API resolved rather than the raw custom inputs,
     so the 3-month and 12-month presets are governed by the same rule. */
  const spanDays = rangeDays(data?.range.from, data?.range.to);

  // A grain that stops being possible is demoted rather than left selected: the
  // control disables it, so without this the chart would sit on an impossible
  // bucket with no way to change it.
  useEffect(() => {
    if (spanDays == null) return;
    if (grainBlockedReason(grain, spanDays)) {
      setGrain(bestGrainFor(spanDays, hourlyAvailable) as typeof grain);
    }
  }, [spanDays, grain, hourlyAvailable]);

  // ---------- Derived values ----------
  const derived = useMemo(() => {
    if (!data) return null;
    const { kpis, byPlaza, hourDow } = data;

    const curAdt = kpis.days > 0 ? kpis.totalVolume / kpis.days : 0;
    const prevAdt = kpis.prevDays > 0 ? kpis.prevTotalVolume / kpis.prevDays : 0;
    const volumeDeltaPct: number | null = prevAdt > 0 ? ((curAdt - prevAdt) / prevAdt) * 100 : null;

    const weekdayByHour = new Map<number, { sum: number; n: number }>();
    for (const r of hourDow) {
      if (r.dow === 0 || r.dow === 6) continue;
      const cur = weekdayByHour.get(r.hour) ?? { sum: 0, n: 0 };
      weekdayByHour.set(r.hour, { sum: cur.sum + r.v, n: cur.n + 1 });
    }
    let peakHour = 0;
    let peakHourVolume = 0;
    for (const [h, b] of weekdayByHour) {
      const avg = b.sum / b.n;
      if (avg > peakHourVolume) {
        peakHourVolume = avg;
        peakHour = h;
      }
    }

    const plazaTotal = byPlaza.reduce((s, r) => s + r.v, 0);
    const busiest = byPlaza[0];

    const congestionDelta =
      kpis.congestionIndex != null && kpis.prevCongestionIndex != null
        ? kpis.congestionIndex - kpis.prevCongestionIndex
        : null;


    return { curAdt, volumeDeltaPct, peakHour, peakHourVolume, busiest, plazaTotal, congestionDelta };
  }, [data]);

    // ---------- Chart options ----------
  const trendRows = useMemo(() => (data ? buildTrend(data, grain) : []), [data, grain]);

  const trendOption = useMemo<EChartsOption | null>(() => {
    if (!data) return null;
    const rows = trendRows;
    if (rows.length === 0) return null;
    const window = ROLLING_WINDOW[grain];
    const labels = rows.map((r) => r.label);

    // Evenly stepped labels with the year said once; shared by the three analytics tabs.
    const axis = timeAxisLabels(labels, grain);

    // The raw series behind a moving average is context, not a second identity,
    // so it takes the ramp's lightest step rather than a hue of its own.
    const FAINT = RAMP[0];
    const nbLine = { name: "Northbound", type: "line" as const, data: rows.map((r) => r.nb), symbol: "none" as const, itemStyle: { color: PAIR_A }, lineStyle: { width: 2, color: PAIR_A }, endLabel: { show: true, formatter: "NB", color: PAIR_A, fontWeight: 600 } };
    const sbLine = { name: "Southbound", type: "line" as const, data: rows.map((r) => r.sb), symbol: "none" as const, itemStyle: { color: PAIR_B }, lineStyle: { width: 2, color: PAIR_B }, endLabel: { show: true, formatter: "SB", color: PAIR_B, fontWeight: 600 } };

    const series: EChartsOption["series"] = splitDirection
      // Direction picks which carriageway to keep. Both data series are already
      // in hand, so this is a choice about what to draw, not another request.
      ? direction === "NB" ? [nbLine] : direction === "SB" ? [sbLine] : [nbLine, sbLine]
      : window > 0
        ? [
          { name: grain === "hourly" ? "Hourly volume" : "Daily volume", type: "line", data: rows.map((r) => r.total), symbol: "none", itemStyle: { color: FAINT }, lineStyle: { width: 1, color: FAINT } },
          { name: `${window === 24 ? "24-hour" : "7-day"} average`, type: "line", data: movingAverage(rows.map((r) => r.total), window), symbol: "none", itemStyle: { color: PAIR_A }, lineStyle: { width: 2, color: PAIR_A } },
        ]
        : [{ name: "Volume", type: "line", data: rows.map((r) => r.total), symbol: rows.length <= 24 ? "circle" : "none", symbolSize: 7, itemStyle: { color: PAIR_A }, lineStyle: { width: 2, color: PAIR_A } }];

    // Hoisted: the grid should reserve the bottom strip only when the legend is
    // actually drawn in it, and both need the same answer.
    const showLegend = (splitDirection && direction === "Both") || window > 0;

    return {
      grid: { left: 52, right: splitDirection ? 44 : 16, top: 28, bottom: showLegend ? 52 : 26 },
      xAxis: {
        type: "category",
        data: labels,
        axisLabel: { formatter: axis.formatter, interval: axis.interval, fontSize: 12, hideOverlap: true },
        axisTick: { show: false },
      },
      // scale:true so the weekly rhythm is visible instead of a flat line on a zero base
      yAxis: { type: "value", scale: true, splitNumber: 3, name: "vehicles", nameGap: 12, nameTextStyle: { align: "right" }, axisLabel: { formatter: (v: number) => fmtCompact(v), fontSize: 12 } },
      tooltip: { trigger: "axis", axisPointer: { label: { formatter: (o) => bucketLabelFor(grain)(String((o as { value: unknown }).value)) } }, valueFormatter: (v) => (v == null ? "—" : `${fmtInt(Number(v))} vehicles`) },
      // A legend whenever there is more than one line. The old condition hid it
      // precisely when the chart split into northbound and southbound — the case
      // that needs it most, since two lines with no key are unreadable.
      // Split down to one carriageway leaves a single line, which its own end
      // label already names — a one-item legend would just be furniture.
      legend: { show: showLegend, bottom: 0, left: "center", itemGap: 18, padding: 0 },
      series,
    };
    // chartTheme: the series colours are the theme's own, so a theme switch must redraw (testers TR-5).
  }, [data, grain, splitDirection, direction, trendRows, chartTheme]);

  const heatmapOption = useMemo<EChartsOption | null>(() => {
    if (!data || data.hourDow.length === 0) return null;
    const heatData: [number, number, number][] = data.hourDow.map((r) => [r.hour, DOW_ORDER.indexOf(r.dow), r.v]);
    const heatValues = data.hourDow.map((r) => r.v);
    const heatMax = Math.max(...heatValues);
    /* The quietest hour on this corridor still carries about a quarter of the
       busiest one's traffic, so a scale anchored at zero spent its first
       quarter on values that never occur and squeezed every real cell into
       what was left. Anchoring at the observed minimum gives the whole ramp to
       the range that exists. */
    const heatMin = Math.min(...heatValues);
    return {
      // Legend lives in a slim strip below the plot, never on it
      grid: { left: 40, right: 10, top: 6, bottom: 26 },
      xAxis: { type: "category", data: Array.from({ length: 24 }, (_, h) => fmtHour(h)), splitArea: { show: false }, axisLabel: { interval: 3, fontSize: 12 }, axisTick: { show: false } },
      // inverse:true puts Mon at the top, Sun at the bottom
      yAxis: { type: "category", data: DOW_LABELS, inverse: true, splitArea: { show: false }, axisLabel: { interval: 0, fontSize: 12 }, axisTick: { show: false } },
      tooltip: {
        formatter: (p) => {
          const v = (p as unknown as { value: [number, number, number] }).value;
          // The shared heatmap tooltip (lib/heat-tooltip), so a Traffic cell and an Incident cell read alike.
          return heatTip({ title: `${DOW_FULL[v[1]]} • ${fmtHour(v[0])}`, value: heatValue(v[2], "vehicles/hr", 0), detail: ["on average"] });
        },
      },
      visualMap: {
        show: false,
        type: "continuous",
        min: heatMin,
        max: heatMax,
        calculable: false,
        // Seven steps rather than the three a line chart needs: see heatRamp.
        inRange: { color: heatRamp(chartTheme) },
        // The same neutral the speed chart uses when scrubbed. Keeping the ramp
        // at low opacity left every cell a slightly different washed-out blue,
        // which on the dark surface turned the grid into grey-blue mud and made
        // the highlighted cells harder to pick out, not easier. One flat grey
        // gives the lit band something uniform to stand against.
        outOfRange: { color: NEUTRAL },
        formatter: (v) => fmtCompact(Number(v)),
      },
      series: [{ type: "heatmap", data: heatData, itemStyle: { borderColor: CELL_GAP, borderWidth: 2, borderRadius: 3 }, emphasis: { itemStyle: { borderColor: chartTheme.ink, borderWidth: 1 } } }],
    };
    // chartTheme is a dependency because the ramp's lightest step comes from it.
  }, [data, chartTheme]);

  const plazaChart = useMemo<{
    option: EChartsOption;
    rows: { plaza: string; v: number; isOthers: boolean }[];
    others: { plaza: string; v: number }[];
  } | null>(() => {
    if (!data || data.byPlaza.length === 0) return null;
    const top = data.byPlaza.slice(0, 10).map((r) => ({ ...r, isOthers: false }));
    const others = data.byPlaza.slice(10);
    const othersSum = others.reduce((s, r) => s + r.v, 0);
    // `top` arrives largest-first. A category axis draws index 0 at the bottom,
    // so reversing puts the largest at the top ("highest first") and leaving it
    // as-is puts the smallest there ("lowest first").
    const ranked = plazaSort === "desc" ? [...top].reverse() : [...top];
    // "Others" is a residual bucket, not a plaza, so it is pinned to the bottom
    // rather than sorted with the rest. Ranking it alongside them sent it to the
    // top in ascending order, where the largest bar on the chart sat in the slot
    // that means "smallest".
    const othersRow = { plaza: `Others (${others.length})`, v: othersSum, isOthers: true };
    const display = othersSum > 0 ? [othersRow, ...ranked] : ranked;
    const rows = display;
    // Scaled against the largest real plaza, not against the Others total.
    const maxV = top[0]?.v ?? 1;
    const totalV = data.byPlaza.reduce((s, r) => s + r.v, 0);
    const labelInk = chartTheme.isDark ? "#e6edf9" : "#10213f";
    return {
      rows: display,
      others,
      option: {
        // Room for the longest plaza name ("Paso de Blas Valenzuela"), and for each bar's figure on its right.
        grid: { left: 162, right: 96, top: 4, bottom: 4 },
        // Each bar carries its own figure, so the axis is not drawn.
        xAxis: { type: "value", axisLabel: { show: false }, splitLine: { show: false }, axisLine: { show: false }, axisTick: { show: false } },
        // interval:0 — every plaza name must be readable, that IS the chart
        yAxis: {
          type: "category",
          data: display.map((r) => r.plaza),
          axisLine: { show: false },
          axisTick: { show: false },
          axisLabel: { interval: 0, fontSize: 12.5, fontWeight: 600, color: labelInk, width: 148, overflow: "truncate", margin: 12 },
        },
        // The same layout as the event chart's hover: the name in bold, then plain lines with the figures in bold.
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "shadow" },
          formatter: (p) => {
            const i = (Array.isArray(p) ? p[0] : p as { dataIndex: number }).dataIndex;
            const r = display[i];
            if (!r) return "";
            // Name and volume only (user request): the share is already printed on the bar.
            return `<b>${r.plaza}</b><br/>Volume: <b>${fmtInt(r.v)}</b> vehicles`;
          },
        },
        /* No legend. There is one series, so it drew a single chip reading
           "Volume by plaza" beneath a chart whose axis already says that, and
           the bars are shaded on a four-step sequential ramp, so its lone
           swatch matched no bar in particular and implied a category that does
           not exist. The strip it held is returned to the plot. */
        series: [
          {
            name: "Volume by plaza",
            type: "bar",
            data: display.map((r) => ({
              value: r.v,
              itemStyle: {
                // The residual bucket is neutral. On the ramp it came out darkest
                // of all — the shade this chart uses for the busiest plaza — which
                // is the wrong signal for a row that is not a plaza at all.
                color: r.isOthers
                  ? NEUTRAL
                  : SEQ[Math.min(3, 1 + Math.floor((r.v / maxV) * 2.99))],
                borderRadius: [0, 6, 6, 0],
              },
            })),
            barWidth: 14,
            showBackground: true,
            backgroundStyle: { color: chartTheme.isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(16, 33, 63, 0.05)", borderRadius: 6 },
            label: {
              show: true,
              position: "right",
              distance: 8,
              fontSize: 12,
              color: chartTheme.text,
              formatter: (p) => {
                const v = Number(p.value);
                return totalV > 0 ? `{v|${fmtCompact(v)}}{p|${((v / totalV) * 100).toFixed(1)}%}` : fmtCompact(v);
              },
              // The share gets its own left padding: plain spaces between rich runs are collapsed ("19.1M14.5%").
              rich: { v: { fontSize: 12.5, fontWeight: 700, color: labelInk }, p: { fontSize: 12, color: chartTheme.text, padding: [0, 0, 0, 6] } },
            },
          },
        ],
      },
    };
  }, [data, plazaSort, chartTheme]);

  const speedOption = useMemo<EChartsOption | null>(() => {
    if (!data || data.speedByHour.length === 0) return null;
    const speeds = data.speedByHour.map((r) => r.speed);
    // Framed on the data rather than on zero. Every hour here sits well under the
    // 20 km/h congestion threshold, so an axis stretched to hold that line spent
    // most of its height on empty space the readings never reach.
    const lo = Math.max(0, Math.floor(Math.min(...speeds)) - 1);
    const hi = Math.ceil(Math.max(...speeds)) + 1;
    return {
      grid: { left: 36, right: 14, top: 26, bottom: 26 },
      xAxis: { type: "category", data: data.speedByHour.map((r) => fmtHour(r.hour)), axisLabel: { interval: 3, fontSize: 12 }, axisTick: { show: false } },
      yAxis: { type: "value", min: lo, max: hi, splitNumber: 4, axisLabel: { formatter: "{value}", fontSize: 12 }, name: "km/h", nameGap: 10, nameTextStyle: { fontSize: 12 } },
      tooltip: {
        trigger: "axis",
        formatter: (p) => {
          const item = (p as { dataIndex: number }[])[0];
          const r = data.speedByHour[item.dataIndex];
          return `<b>${fmtHour(r.hour)}</b><br/>Avg speed in jams: <b>${r.speed} km/h</b><br/>Avg jam level: <b>${r.jam_level} / 5</b>`;
        },
      },
      visualMap: {
        show: false, type: "continuous", seriesIndex: 0, calculable: false,
        min: Math.min(...speeds), max: Math.max(...speeds), inRange: { color: SEVERITY },
        // Scrubbing greys the rest of the line out. A neutral reads more clearly
        // as "not this" on a single line than a washed-out version of the same
        // ramp, which just looks like a lighter reading.
        outOfRange: { color: NEUTRAL },
      },
      series: [
        {
          type: "line",
          data: speeds,
          smooth: 0.35,
          symbol: "circle",
          symbolSize: 7,
          // A ring around each point so it stays visible where the line runs
          // through a step of the same colour.
          itemStyle: { borderColor: chartTheme.tooltipBg, borderWidth: 1.5 },
          lineStyle: { width: 2 },
        },
      ],
    };
  }, [data, chartTheme]);

  type ImpactRow = {
    label: string;
    full: string;
    pct: number;
    baseline?: number;
    volume?: number;
    event?: Analytics["eventImpact"][number];
    holiday?: Analytics["holidayImpact"][number];
  };

  // Rows for the chosen exit. Events at another venue (Dau) only have their own exit, so they show under "venue".
  const eventRows = useMemo(
    () => (data ? data.eventImpact.filter((e) => (e.view ?? "venue") === eventExit) : []),
    [data, eventExit],
  );
  const eventYears = useMemo(
    () => [...new Set(eventRows.map((e) => e.date.slice(0, 4)))].sort().reverse(),
    [eventRows],
  );
  // A year picked earlier can drop out when the filters reload the list; it then reads as "All years" rather
  // than an empty table under a button that is no longer there.
  const yearShown = eventYears.includes(eventYear) ? eventYear : "all";
  const eventsShown = useMemo(
    () => (yearShown === "all" ? eventRows : eventRows.filter((e) => e.date.startsWith(yearShown))),
    [eventRows, yearShown],
  );

  /* The "View all" tables sort by any column (click a header; click again to flip). */
  type PlazaRow = { plaza: string; v: number; rank: number };
  const plazaRows = useMemo<PlazaRow[]>(() => (data ? data.byPlaza.map((r, i) => ({ ...r, rank: i + 1 })) : []), [data]);
  const plazaCols = useMemo<SortCol<PlazaRow>[]>(() => [
    { key: "rank", label: "#", value: (r) => r.rank, num: true, firstDir: "asc" },
    { key: "plaza", label: "Plaza", value: (r) => r.plaza },
    { key: "v", label: "Volume", value: (r) => r.v, num: true },
    { key: "share", label: "Share", value: (r) => r.v, num: true },
  ], []);
  const plazaSorted = useSortedRows(plazaRows, plazaCols, { key: "rank", dir: "asc" });
  type EventRow = (typeof eventsShown)[number];
  const eventCols = useMemo<SortCol<EventRow>[]>(() => [
    { key: "date", label: "Date", value: (e) => e.date, firstDir: "desc" },
    { key: "label", label: "Event", value: (e) => e.label },
    { key: "vol", label: eventExit === "venue" ? "Venue exit entries" : eventExit === "All arena exits" ? "All arena exits entries" : `${eventExit} entries`, value: (e) => e.dayVolume, num: true },
    { key: "base", label: "Baseline", value: (e) => e.baseline, num: true },
    { key: "dev", label: "Deviation", value: (e) => e.deviationPct, num: true },
    // The opening order: distance from normal (the size of the swing, up or down), the same ranking as the chart.
    { key: "dist", label: "", value: (e) => (e.deviationPct == null ? null : Math.abs(e.deviationPct)), num: true, hidden: true },
  ], [eventExit]);
  const eventSorted = useSortedRows(eventsShown, eventCols, { key: "dist", dir: "desc" });
  type HolidayRow = Analytics["holidayImpact"][number];
  const holidayCols = useMemo<SortCol<HolidayRow>[]>(() => [
    { key: "label", label: "Holiday", value: (h) => h.label },
    { key: "vol", label: "Avg volume", value: (h) => (h.volume > 0 ? h.volume : null), num: true },
    { key: "base", label: "Baseline", value: (h) => (h.baseline > 0 ? h.baseline : null), num: true },
    { key: "dev", label: "Deviation", value: (h) => h.deviationPct, num: true },
    { key: "n", label: "Days", value: (h) => h.occurrences, num: true },
    { key: "dist", label: "", value: (h) => Math.abs(h.deviationPct), num: true, hidden: true },
  ], []);
  const holidaySorted = useSortedRows(data?.holidayImpact ?? [], holidayCols, { key: "dist", dir: "desc" });

  const impactChart = useMemo<{ option: EChartsOption; rows: ImpactRow[] } | null>(() => {
    if (!data) return null;
    /* Each row is read as two lines: a short name (the artist, the part of an event title before " - "; or the
       holiday) over its date or occurrences. The full title is in the tooltip and the detail view. */
    const shortName = (t: string) => {
      // "Act - Tour", "Event: detail" and "Event (performers)" all lead with the name to show.
      const first = t.split(" + ")[0].split(" - ")[0].split(/:\s| \(/)[0].trim();
      return first.length > 20 ? `${first.slice(0, 19)}…` : first;
    };
    const longDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const rows: ImpactRow[] =
      impactMode === "Events"
        ? eventRows
          .filter((e) => e.deviationPct != null)
          .map((e) => ({ label: `${shortName(e.label)}\n${longDate(e.date)}${e.eventCount && e.eventCount > 1 ? ` · ${e.eventCount} events` : ""}`, full: `${e.label} (${e.date})`, pct: e.deviationPct as number, event: e, baseline: e.baseline, volume: e.dayVolume }))
        : data.holidayImpact.map((h) => ({ label: `${shortName(h.label)}\n${h.occurrences} occurrence${h.occurrences === 1 ? "" : "s"}`, full: `${h.label} · ${h.occurrences} occurrence(s)`, pct: h.deviationPct, holiday: h, baseline: h.baseline, volume: h.volume }));
    if (rows.length === 0) return null;
    // The eight furthest from normal fit legibly in the card; View all lists the rest.
    const display = [...rows]
      .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
      .slice(0, 8)
      // Ranked by distance from normal, like the View all list: the biggest swing, up or down, at the top ("desc").
      // The category axis draws its first row at the bottom, hence the order is reversed here.
      .sort((a, b) => (impactSort === "desc" ? Math.abs(a.pct) - Math.abs(b.pct) : Math.abs(b.pct) - Math.abs(a.pct)));
    const hasBelow = display.some((r) => r.pct < 0);
    const hasAbove = display.some((r) => r.pct >= 0);
    const labelInk = chartTheme.isDark ? "#e6edf9" : "#10213f";
    return {
      rows: display,
      option: {
        grid: { left: 150, right: hasAbove ? 64 : 16, top: 4, bottom: 22, containLabel: false },
        // The figure is printed on each bar, so the axis only frames the zero line.
        /* Head-room past the longest bar on each side, so its printed figure never runs into the labels (the
           negative side has no grid margin to spare: its figure sits left of the bar, beside the row names). */
        xAxis: {
          type: "value", axisLabel: { show: false }, splitLine: { show: false }, axisLine: { show: false }, axisTick: { show: false },
          min: hasBelow ? Math.min(...display.map((r) => r.pct)) * 1.32 : 0,
          max: hasAbove ? Math.max(...display.map((r) => r.pct)) * (hasBelow ? 1.18 : 1) : 0,
        },
        yAxis: {
          type: "category",
          data: display.map((r) => r.label),
          axisLine: { show: false },
          axisTick: { show: false },
          axisLabel: {
            interval: 0,
            width: 138,
            overflow: "truncate",
            lineHeight: 16,
            formatter: (v: string) => {
              const [name, sub] = v.split("\n");
              return `{n|${name}}\n{d|${sub ?? ""}}`;
            },
            rich: {
              n: { fontSize: 13, fontWeight: 700, color: labelInk, lineHeight: 18, align: "right" },
              d: { fontSize: 11.5, color: chartTheme.text, lineHeight: 16, align: "right", padding: [1, 0, 0, 0] },
            },
          },
        },
        tooltip: {
          axisPointer: { type: "shadow" },
          formatter: (p) => {
            const i = (p as { dataIndex: number }).dataIndex;
            const r = display[i];
            let tip = `<b>${r.full}</b><br/>${fmtPct(r.pct)} vs same-weekday baseline`;
            if (r.baseline != null && r.baseline > 0) {
              tip += `<br/>Baseline: <b>${fmtInt(r.baseline)}</b> vehicles`;
            }
            if (r.volume != null && r.volume > 0) {
              tip += `<br/>Actual: <b>${fmtInt(r.volume)}</b> vehicles`;
            }
            return tip;
          },
        },
        /* A key, not a filter: it names the two colours and ignores clicks. Always shown (user request), so it does not
           come and go as the exit or Events/Holidays changes which colours are drawn. */
        legend: {
          show: true, bottom: 0, left: "center", // right under the last bar; the gap to the insight is below the chart
          itemGap: 18, padding: 0,
          data: ["Above baseline", "Below baseline"],
          selectedMode: false,
        },
        series: [
          // Two zero-width entries purely so the legend can name what the two bar colours mean.
          { name: "Above baseline", type: "bar", data: [], itemStyle: { color: ABOVE } },
          { name: "Below baseline", type: "bar", data: [], itemStyle: { color: BELOW } },
          {
            name: "Deviation",
            type: "bar",
            data: display.map((r) => ({
              value: r.pct,
              itemStyle: { color: r.pct >= 0 ? ABOVE : BELOW, borderRadius: r.pct >= 0 ? [0, 6, 6, 0] : [6, 0, 0, 6] },
              label: { position: r.pct >= 0 ? "right" : "left" },
            })),
            barWidth: 14,
            showBackground: true,
            backgroundStyle: { color: chartTheme.isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(16, 33, 63, 0.05)", borderRadius: 6 },
            label: { show: true, distance: 8, fontSize: 12.5, fontWeight: 700, color: labelInk, formatter: (p) => fmtPct(Number(p.value)) },
            markLine: { symbol: "none", silent: true, lineStyle: { color: NEUTRAL, width: 1, type: "dashed" }, data: [{ xAxis: 0 }], label: { show: false } },
          },
        ],
      },
    };
    // chartTheme: this memo never listed it, so after a switch to dark the bars kept the DAY colours (TR-5).
  }, [data, eventRows, impactMode, impactSort, chartTheme]);

  // Separate from `takeaways` because it depends on the Events/Holidays toggle.
  // ---------- Click-to-inspect handlers ----------
  const filtersNote = `Filters: ${plazaSel.length > 0 ? `${plazaSel.length} plaza(s)` : "all plazas"} · ${vClass === "All" ? "all classes" : vClass}${data ? ` · ${data.range.from} to ${data.range.to}` : ""}`;

  const onTrendClick = (p: { dataIndex: number }) => {
    const i = p.dataIndex;
    const r = trendRows[i];
    if (!r) return;
    const totals = trendRows.map((x) => x.total);
    const avg = totals.reduce((s, v) => s + v, 0) / totals.length;
    const rank = 1 + totals.filter((v) => v > r.total).length;
    const prev = i > 0 ? trendRows[i - 1] : null;
    const periodWord = grain === "hourly" ? "hour" : grain === "daily" ? "day" : grain === "weekly" ? "week" : "month";
    const title =
      grain === "daily"
        ? `${weekdayOf(r.label)}, ${r.label}`
        : grain === "hourly"
          ? `${weekdayOf(r.label.slice(0, 10))}, ${r.label}`
          : grain === "weekly"
            ? `Week of ${r.label}`
            : r.label;
    const rows: [string, string][] = [
      ["Total volume", `${fmtInt(r.total)} vehicles`],
      ["Northbound", `${fmtInt(r.nb)} (${r.total > 0 ? ((r.nb / r.total) * 100).toFixed(1) : "0"}%)`],
      ["Southbound", `${fmtInt(r.sb)} (${r.total > 0 ? ((r.sb / r.total) * 100).toFixed(1) : "0"}%)`],
      ...(r.bothdir ? [["Plazas not split by direction", `${fmtInt(r.bothdir)} (${((r.bothdir / r.total) * 100).toFixed(1)}%)`] as [string, string]] : []),
      ["vs range average", avg > 0 ? fmtPct(((r.total - avg) / avg) * 100) : "—"],
      [`vs previous ${periodWord}`, prev && prev.total > 0 ? fmtPct(((r.total - prev.total) / prev.total) * 100) : "—"],
      ["Rank in range", `#${rank} of ${totals.length} ${periodWord}s by volume`],
    ];
    setDetail({ title, subtitle: `Entry volume · ${grain}`, rows, note: filtersNote });
  };

  const onHeatmapClick = (p: { value: [number, number, number] }) => {
    if (!data) return;
    const [hour, dowIdx, v] = p.value;
    const all = data.hourDow.map((r) => r.v).sort((a, b) => b - a);
    const rank = 1 + all.findIndex((x) => x <= v);
    const max = all[0] ?? 1;
    const sameHour = data.hourDow.filter((r) => r.hour === hour);
    const wd = sameHour.filter((r) => r.dow >= 1 && r.dow <= 5);
    const we = sameHour.filter((r) => r.dow === 0 || r.dow === 6);
    const avgOf = (rs: typeof sameHour) => (rs.length ? rs.reduce((s, r) => s + r.v, 0) / rs.length : 0);
    const rows: [string, string][] = [
      ["Average volume", `${fmtInt(v)} vehicles/hr`],
      ["Share of weekly peak", `${((v / max) * 100).toFixed(0)}% of ${fmtInt(max)}`],
      ["Rank", `#${rank} of ${all.length} hour-slots`],
      [`Weekday avg at ${fmtHour(hour)}`, `${fmtInt(avgOf(wd))} vehicles/hr`],
      [`Weekend avg at ${fmtHour(hour)}`, `${fmtInt(avgOf(we))} vehicles/hr`],
    ];
    setDetail({ title: `${DOW_FULL[dowIdx]} • ${fmtHour(hour)}`, subtitle: "Average entry volume for this hour-slot", rows, note: filtersNote });
  };

  const onPlazaClick = (p: { dataIndex: number }) => {
    if (!plazaChart || !data || !derived) return;
    const r = plazaChart.rows[p.dataIndex];
    if (!r) return;
    const share = derived.plazaTotal > 0 ? ((r.v / derived.plazaTotal) * 100).toFixed(1) : "0";
    if (r.isOthers) {
      const preview = plazaChart.others.slice(0, 5).map((o) => o.plaza).join(", ");
      setDetail({
        title: r.plaza,
        subtitle: `${plazaChart.others.length} remaining plazas combined`,
        rows: [
          ["Combined volume", `${fmtInt(r.v)} vehicles`],
          ["Share of selected volume", `${share}%`],
          ["Avg per day", `${fmtInt(r.v / Math.max(1, data.kpis.days))} vehicles`],
          ["Includes", `${preview}${plazaChart.others.length > 5 ? `, +${plazaChart.others.length - 5} more` : ""}`],
        ],
        note: `Use "View all plazas" for the full ranking. ${filtersNote}`,
      });
      return;
    }
    const rank = 1 + data.byPlaza.findIndex((x) => x.plaza === r.plaza);
    setDetail({
      title: r.plaza,
      subtitle: "Toll plaza entry volume",
      rows: [
        ["Volume in range", `${fmtInt(r.v)} vehicles`],
        ["Share of selected volume", `${share}%`],
        ["Avg per day", `${fmtInt(r.v / Math.max(1, data.kpis.days))} vehicles`],
        ["Rank", `#${rank} of ${data.byPlaza.length} plazas`],
      ],
      note: filtersNote,
    });
  };

  const onSpeedClick = (p: { dataIndex: number }) => {
    if (!data) return;
    const r = data.speedByHour[p.dataIndex];
    if (!r) return;
    const fastest = data.speedByHour.reduce((a, b) => (b.speed > a.speed ? b : a));
    const slowest = data.speedByHour.reduce((a, b) => (b.speed < a.speed ? b : a));
    setDetail({
      title: `${fmtHour(r.hour)} — Jam Conditions`,
      subtitle: "Averages across Waze jam reports in the selected range",
      rows: [
        ["Avg speed in jams", `${r.speed} km/h`],
        ["Avg jam level", `${r.jam_level} / 5`],
        ["vs 20 km/h threshold", `${(r.speed - 20).toFixed(1)} km/h`],
        ["Fastest hour", `${fmtHour(fastest.hour)} · ${fastest.speed} km/h`],
        ["Slowest hour", `${fmtHour(slowest.hour)} · ${slowest.speed} km/h`],
      ],
      note: "Jam data covers the whole expressway (not filterable by plaza or vehicle class).",
    });
  };

  const showEventDetail = (e: Analytics["eventImpact"][number]) => {
    setDetail({
      title: e.label,
      subtitle: `${e.eventCount && e.eventCount > 1 ? `${e.eventCount} events` : "Event"} · ${weekdayOf(e.date)}, ${e.date}`,
      rows: [
        [`${e.plaza ?? "Plaza"} entries that day`, `${fmtInt(e.dayVolume)} vehicles`],
        ["Same-weekday baseline", `${fmtInt(e.baseline)} vehicles`],
        ["Deviation", e.deviationPct != null ? fmtPct(e.deviationPct) : "—"],
        ...(e.attendance ? ([["Reported attendance", `${fmtInt(e.attendance)}`]] as [string, string][]) : []),
        ...(e.baselineDays ? ([["Days behind baseline", `${e.baselineDays}`]] as [string, string][]) : []),
        ...(e.onHoliday ? ([["Note", "This date is also a holiday"]] as [string, string][]) : []),
      ],
      note: `${
        e.onHoliday
          ? "This date is also a public holiday, so the deviation reflects the holiday as much as the event. "
          : ""
      }Baseline = average entries at ${e.plaza ?? "the same exit"} on the same weekday within ±45 days, excluding other event days and holidays. Figures are NLEX entries, so they capture traffic joining the expressway at ${
        e.plaza === "All arena exits" ? "the four arena exits (CDV/PH Arena, Bocaue Interchange, Tambubong, Marilao)" : e.plaza === e.venueExit || !e.plaza ? "the venue's own exit" : `${e.plaza}, near the venue`
      } rather than arrivals.`,
    });
  };

  const showHolidayDetail = (h: Analytics["holidayImpact"][number]) => {
    const yearly = (data?.holidayYearly ?? []).filter((y) => y.label === h.label).sort((a, b) => a.year - b.year);
    setDetail({
      title: h.label,
      subtitle: "Holiday traffic vs normal days",
      rows: [
        ...(h.holidayType ? ([["Holiday type", h.holidayType]] as [string, string][]) : []),
        ["Avg holiday volume", h.volume > 0 ? `${fmtInt(h.volume)} vehicles` : "—"],
        ["Same-weekday baseline", h.baseline > 0 ? `${fmtInt(h.baseline)} vehicles` : "—"],
        ["Avg deviation (all years)", fmtPct(h.deviationPct)],
        ...yearly.map((y): [string, string] => [String(y.year), `${fmtPct(y.pct)} · ${fmtInt(y.volume)} vehicles`]),
      ],
      note: "Each occurrence is compared with its own local baseline: the average volume on the same weekday within ±45 days of that date, excluding holidays and event days. Comparing locally rather than against all-history keeps the 2020–2021 pandemic period from distorting other years.",
    });
  };

  const onImpactClick = (p: { dataIndex: number }) => {
    if (!impactChart) return;
    const r = impactChart.rows[p.dataIndex];
    if (!r) return;
    if (r.event) showEventDetail(r.event);
    else if (r.holiday) showHolidayDetail(r.holiday);
  };

  // `categoryFallback: false` for charts whose handler needs the native event
  // payload (the heatmap reads p.value as [hour, dow, volume]); a synthesised
  // { dataIndex } would not satisfy it.
  const chartFrame = (
    option: EChartsOption | null,
    emptyNote: string,
    onClick?: (p: never) => void,
    categoryFallback = true,
    // Lets a caller keep the instance so it can drive the chart from outside —
    // the colour keys use it to highlight a band.
    onReady?: (chart: unknown) => void,
  ) => {
    if (loading && !data) return <ChartSkeleton />;
    if (error) return <div className="nct-state-slot"><StateNote kind="error">Live data unavailable — is the backend running on port 4000?</StateNote></div>;
    if (!option) return <div className="nct-state-slot"><StateNote kind="nodata">{emptyNote}</StateNote></div>;
    return (
      <ReactECharts
        option={applyChartTheme(option, chartTheme)}
        notMerge
        lazyUpdate
        style={{ width: "100%", height: "100%" }}
        opts={{ renderer: "canvas" }}
        onEvents={onClick ? { click: onClick as (p: unknown) => void } : undefined}
        // Lines are drawn with symbol:"none", so they have no clickable points
        // and ECharts' item click never fires with the right index. Resolve the
        // category from the cursor position instead.
        onChartReady={(chart) => {
          if (onClick && categoryFallback) attachCategoryClick(chart as never, onClick as never);
          onReady?.(chart);
        }}
      />
    );
  };

  // A skeleton rather than an ellipsis: the tile keeps its height, so the KPI
  // row does not resize under the cursor as the numbers arrive.
  /* Scrubbing a colour key highlights the matching part of its chart.

     The visualMaps are still there, just not drawn — so selectDataRange, the
     action the visible control used to fire, still works. Narrowing the range
     leaves matching cells at full strength and fades the rest, which is the
     highlight the old visualMap gave and the static strip had lost. */
  const heatChart = useRef<unknown>(null);
  const speedChart = useRef<unknown>(null);

  // The shared scrubber (lib/heat-tooltip), which was lifted from this page; the Incident grids use the same one.
  const scrub = scrubHeatmap;

  /* The key needs the same domain the chart coloured against, or pointing at a
     shade would report a value the heatmap never used. */
  const heatMaxValue = useMemo(
    () => (data ? Math.max(0, ...data.hourDow.map((r) => r.v)) : 0),
    [data],
  );
  const heatMinValue = useMemo(
    () => (data && data.hourDow.length > 0 ? Math.min(...data.hourDow.map((r) => r.v)) : 0),
    [data],
  );
  const speedRange = useMemo<[number, number]>(() => {
    const sp = (data?.speedByHour ?? []).map((r) => r.speed).filter((v) => v > 0);
    return sp.length ? [Math.min(...sp), Math.max(...sp)] : [0, 0];
  }, [data]);

  const kpiValue = (v: string | null) =>
    loading && !data ? <KpiSkeleton /> : <CountUpValue text={v ?? "—"} />;

  /* ---------- Card answers (Night Corridor: answer, context, evidence, method)
     Each line is computed from the loaded payload at render time, from the same
     arrays the charts draw; nothing here is fetched, stored or hardcoded. When
     the data is not in, the line is simply absent. */
  /* Quick insights, one per chart card, each computed from what that card draws. */
  const trendInsight = useMemo(() => {
    const days = (data?.dailyTrend ?? []).map((r) => ({ d: r.d, v: r.nb + r.sb + (r.bothdir ?? 0) })).filter((r) => r.v > 0);
    if (days.length < 2) return null;
    const sorted = [...days].sort((a, b) => a.v - b.v);
    const median = sorted[Math.floor(sorted.length / 2)].v;
    const hi = sorted[sorted.length - 1];
    const lo = sorted[0];
    return { median, hi, lo };
  }, [data]);
  const plazaInsight = useMemo(() => {
    const rows = [...(data?.byPlaza ?? [])].filter((r) => r.v > 0).sort((a, b) => b.v - a.v);
    const total = rows.reduce((s, r) => s + r.v, 0);
    if (rows.length < 6 || total <= 0) return null;
    const bottom = rows.slice(-5).reduce((s, r) => s + r.v, 0);
    const top3 = rows.slice(0, 3).reduce((s, r) => s + r.v, 0);
    return { top: rows[0], topPct: (rows[0].v / total) * 100, top3Pct: (top3 / total) * 100, bottomPct: (bottom / total) * 100 };
  }, [data]);
  const impactInsight = useMemo(() => {
    const rows: { label: string; date?: string; pct: number }[] = impactMode === "Events"
      ? eventRows.filter((e) => e.deviationPct != null).map((e) => ({ label: e.label, date: e.date, pct: e.deviationPct as number }))
      : (data?.holidayImpact ?? []).map((h) => ({ label: h.label, pct: h.deviationPct }));
    if (rows.length === 0) return null;
    const avg = rows.reduce((s, r) => s + r.pct, 0) / rows.length;
    const top = rows.reduce((a, b) => (Math.abs(b.pct) > Math.abs(a.pct) ? b : a));
    return { n: rows.length, above: rows.filter((r) => r.pct > 0).length, avg, top };
  }, [data, eventRows, impactMode]);
  const heatInsight = useMemo(() => {
    const rows = data?.hourDow ?? [];
    const wd = rows.filter((r) => r.dow >= 1 && r.dow <= 5);
    const we = rows.filter((r) => r.dow === 0 || r.dow === 6);
    if (wd.length === 0 || we.length === 0) return null;
    const mean = (a: { v: number }[]) => a.reduce((s, r) => s + r.v, 0) / a.length;
    const quiet = rows.reduce((m, r) => (r.v < m.v ? r : m), rows[0]);
    const busy = rows.reduce((m, r) => (r.v > m.v ? r : m), rows[0]);
    return { wd: mean(wd), we: mean(we), quiet, busy };
  }, [data]);
  const speedInsight = useMemo(() => {
    const rows = (data?.speedByHour ?? []).filter((r) => r.speed != null);
    if (rows.length < 2) return null;
    const fast = rows.reduce((m, r) => (r.speed > m.speed ? r : m), rows[0]);
    const slow = rows.reduce((m, r) => (r.speed < m.speed ? r : m), rows[0]);
    return { fast, slow, gapPct: fast.speed > 0 ? ((fast.speed - slow.speed) / fast.speed) * 100 : 0 };
  }, [data]);


  /* ---------- Active filters, as removable chips ----------
     Each × calls the filter's existing setter with its default value, the same
     call the default button makes. Range and Weather set on Descriptive still
     reach the volume forecast, so they are shown on Predictive too. */
  const RANGE_LABEL: Record<RangeMode, string> = { "3": "3 mo", "12": "12 mo", all: "All", custom: "Custom" };
  /* The Range is always shown, as the exact dates the data covers; any other filter only once it is moved off its
     default (user request: no "All weather" / "All classes" chips). */
  const chips: FilterChip[] = [];
  if (activeTab !== "Prescriptive") {
    const dates = rangeText(data?.range.from, data?.range.to);
    chips.push({
      key: "range",
      label: "Range",
      value: dates ?? (rangeMode === "custom" ? "Pick two dates" : RANGE_LABEL[rangeMode]),
      ...(rangeMode !== "12" ? { onClear: () => setRangeMode("12"), resetTo: "the last 12 months" } : {}),
    });
    if (weather !== "all") chips.push({
      key: "weather",
      label: "Weather",
      value: weather === "dry" ? "Dry hours" : "Wet hours",
      onClear: () => setWeather("all"),
      resetTo: "all weather",
    });
  }
  if (activeTab === "Descriptive") {
    if (vClass !== "All") chips.push({
      key: "class",
      label: "Class",
      value: vClass,
      onClear: () => setVClass("All"),
      resetTo: "all classes",
    });
  }

  const sortButton = (sort: "desc" | "asc", setSort: (s: "desc" | "asc") => void) => (
    <button
      type="button"
      className={styles.sortBtn}
      onClick={() => setSort(sort === "desc" ? "asc" : "desc")}
      title={sort === "desc" ? "Sorted highest first — click for lowest first" : "Sorted lowest first — click for highest first"}
      aria-label={`Sort order: ${sort === "desc" ? "highest first" : "lowest first"}. Activate to reverse.`}
    >
      {sort === "desc" ? <ArrowDownWideNarrow size={15} /> : <ArrowUpNarrowWide size={15} />}
    </button>
  );

  const closeIcon = (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M4.5 4.5L13.5 13.5M13.5 4.5L4.5 13.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
  );

  return (
    <section className={`${styles.page} viz-traffic`}>
      <PageHeader accent="traffic" icon={TrendingUp} title="Traffic Overview" subtitle="Volume, congestion, and speed patterns across NLEX" />

      {/* The mode switch, directly under the title: icon, name and a
          three-word hint, with the accent underline sliding to the active one. */}
      <div className={styles.modeTabs} style={{ ["--mode-i" as string]: modeIndex(activeTab) }}>
        {(["Descriptive", "Predictive", "Prescriptive"] as const).map((t) => (
          <button key={t} className={`${styles.modeTab} ${activeTab === t ? styles.modeTabActive : ""}`} onClick={() => setActiveTab(t)} aria-pressed={activeTab === t}>
            <ModeTabLabel mode={t} />
          </button>
        ))}
        <span className={styles.modeIndicator} aria-hidden="true" />
      </div>

      {/* The sticky filter bar. Predictive keeps the Range presets (they set how
          much history the forecast card shows) but not Custom, and not the
          Weather filter: the forecast card carries its own weather toggle.
          Prescriptive takes no filter at all. */}
      {/* No filter bar on Predictive: its Range control lives in the Volume Forecast card, the only chart it affects. */}
      {activeTab !== "Predictive" && <div className={styles.filterRow}>
        {activeTab !== "Prescriptive" && (
          <div className={styles.filterGroup}>
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" style={{ color: "var(--text-muted)" }}><rect x="2" y="2" width="12" height="12" rx="3" stroke="currentColor" strokeWidth="1.4" /><path d="M2 6h12" stroke="currentColor" strokeWidth="1.4" /><path d="M5.5 2V4M10.5 2V4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
            <span className={styles.filterLabel}>Range</span>
            <div className={styles.segmented} role="group" aria-label="Range">
              {(activeTab === "Descriptive" ? (["3", "12", "all", "custom"] as const) : (["3", "12", "all"] as const)).map((m) => (
                <button key={m} className={rangeMode === m ? "active" : ""} aria-pressed={rangeMode === m} onClick={() => setRangeMode(m)}>
                  {RANGE_LABEL[m]}
                </button>
              ))}
            </div>
            {activeTab === "Descriptive" && rangeMode === "custom" && (
              <DateRangePicker
                startDate={customFrom}
                minDate={data?.meta.minDate}
                maxDate={data?.meta.maxDate}
                endDate={customTo}
                onChange={(start, end) => {
                  setCustomFrom(start);
                  setCustomTo(end);
                }}
              />
            )}
          </div>
        )}

        {activeTab === "Descriptive" && (
          <div className={styles.filterGroup}>
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" style={{ color: "var(--text-muted)" }}><path d="M4.5 11.5a3 3 0 1 1 .4-5.97 4 4 0 0 1 7.75 1.1A2.5 2.5 0 0 1 12 11.5H4.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /><path d="M6 13.2v1M9 13.2v1M12 13.2v1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
            <span className={styles.filterLabel}>Weather</span>
            <div className={styles.segmented} role="group" aria-label="Weather">
              {(["all", "dry", "wet"] as const).map((w) => (
                <button key={w} className={weather === w ? "active" : ""} aria-pressed={weather === w} onClick={() => setWeather(w)}>
                  {w === "all" ? "All" : w === "dry" ? "Dry" : "Wet"}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Vehicle class: one page-wide filter (5 Nov 2026). Every volume chart, the KPIs, the plaza ranking, the hour
            grid and the event / holiday impact follow it; the Waze jam speeds have no class and do not. */}
        {activeTab === "Descriptive" && (
          <div className={styles.filterGroup}>
            <span className={styles.filterLabel}>Class</span>
            {/* A dropdown drawn as one of the bar's pills: filled in the accent once a class is picked. */}
            <div className={`nct-pill-select${vClass !== "All" ? " is-set" : ""}`}>
              <CustomSelect
                value={vClass}
                onChange={(v) => setVClass(v as VehicleClass)}
                options={[
                  { label: "All", value: "All" },
                  { label: "Class 1", value: "Class 1" },
                  { label: "Class 2", value: "Class 2" },
                  { label: "Class 3", value: "Class 3" },
                ]}
              />
            </div>
          </div>
        )}

        {activeTab === "Descriptive" && loading && data && <span className={styles.updating}>Updating…</span>}

        <FilterChips chips={chips} />
      </div>}

      <div className={styles.modeStage} key={activeTab}>
        {activeTab === "Descriptive" && (
          <>
            {/* KPI strip: the answer, the comparison, the method (i). */}
            <div className={styles.kpiRow}>
              <article className={styles.kpiTile}>
                <span className={styles.kpiIcon} aria-hidden="true"><Activity size={15} /></span>
                <h3>Total Volume<InfoTooltip text="All vehicles counted at NLEX toll plazas over the selected Range, compared with the equivalent prior period." /></h3>
                <div className={styles.kpiValue} title={data ? `${fmtInt(data.kpis.totalVolume)} vehicles` : undefined}>
                  {kpiValue(data ? fmtCompact(data.kpis.totalVolume) : null)}
                </div>
                <p className={styles.kpiHint}>
                  {derived ? (
                    <span className={derived.volumeDeltaPct == null ? undefined : derived.volumeDeltaPct >= 0 ? styles.deltaUp : styles.deltaDown}>{fmtPct(derived.volumeDeltaPct)}</span>
                  ) : "—"}{" "}
                  vs previous period
                </p>
              </article>
              <article className={styles.kpiTile}>
                <span className={styles.kpiIcon} aria-hidden="true"><CalendarClock size={15} /></span>
                <h3>Avg Daily Volume<InfoTooltip text="Total volume divided by the number of days in the Range — the corridor's typical day." /></h3>
                <div className={styles.kpiValue}>{kpiValue(derived ? fmtInt(derived.curAdt) : null)}</div>
                <p className={styles.kpiHint}>{data ? `vehicles a day, averaged over ${fmtInt(data.kpis.days)} day${data.kpis.days === 1 ? "" : "s"}` : "—"}</p>
              </article>
              <article className={styles.kpiTile}>
                <span className={styles.kpiIcon} aria-hidden="true"><Clock size={15} /></span>
                <h3>Peak Hour (Weekdays)<InfoTooltip text="The hour of a weekday that carries the most vehicles on average across the Range." /></h3>
                <div className={styles.kpiValue}>{kpiValue(derived ? fmtHour(derived.peakHour) : null)}</div>
                <p className={styles.kpiHint}>{derived ? `${fmtInt(derived.peakHourVolume)} vehicles/hr avg` : "—"}</p>
              </article>
              <article className={styles.kpiTile}>
                <span className={styles.kpiIcon} aria-hidden="true"><Building2 size={15} /></span>
                <h3>Busiest Plaza<InfoTooltip text="The toll plaza with the largest share of the Range's volume." /></h3>
                <div className={`${styles.kpiValue} nct-kpi-name`}>{kpiValue(derived?.busiest ? derived.busiest.plaza : null)}</div>
                <p className={styles.kpiHint}>
                  {derived?.busiest && derived.plazaTotal > 0 ? `${((derived.busiest.v / derived.plazaTotal) * 100).toFixed(1)}% of selected volume` : "—"}
                </p>
              </article>
              <article className={styles.kpiTile}>
                <span className={styles.kpiIcon} aria-hidden="true"><Gauge size={15} /></span>
                <h3>Congestion Index<InfoTooltip text="How bad the jams were: the average Waze level of the jams reported on the corridor over the Range, from 1 (light) to 5 (blocked road). Waze reports only jams, never free flow, so this measures how severe congestion is when it happens, not how often it happens; it stays near the middle and moves little with weather." /></h3>
                <div className={styles.kpiValue}>{kpiValue(data?.kpis.congestionIndex != null ? `${data.kpis.congestionIndex.toFixed(2)} / 5` : null)}</div>
                <p className={styles.kpiHint}>
                  {derived?.congestionDelta != null ? (
                    <>
                      <span className={derived.congestionDelta <= 0 ? styles.deltaUp : styles.deltaDown}>
                        {derived.congestionDelta >= 0 ? "+" : ""}{derived.congestionDelta.toFixed(2)}
                      </span>{" "}
                      vs prev · Waze jam level
                    </>
                  ) : data ? "no prior data" : "—"}
                </p>
                {/* Jam reports stop before the toll record does: say so when the Range runs past them. */}
                {data?.meta.jamTo && data.range.to > data.meta.jamTo && (
                  <p className={styles.kpiHint}>Waze jam data runs to {data.meta.jamTo}; later days are not in this figure.</p>
                )}
              </article>
            </div>

            {/* The main time series, full width. */}
            <article className={`${styles.chartCard} ${styles.hero} nct-span-full`}>
              <div className={styles.chartHead}>
                <div className="nc-head-main">
                <CardIcon icon={TrendingUp} />
                <div className={styles.headText}>
                  <h3>Volume Trend<InfoTooltip text="Vehicles per day, week or month over the Range, with the 7-day average smoothing out weekday swings. Click a point for that period's summary." /></h3>
                </div>
                </div>
              </div>
              <div className={`${styles.heroFilters} nct-hero-filters`}>
                <div className={styles.heroFilterGroup}>
                  <span className={styles.heroFilterLabel}>Direction</span>
                  <div className={`${styles.segmentedSmall} nct-wrap`}>
                    {(["Both", "NB", "SB"] as const).map((d) => (
                      <button
                        key={d}
                        className={direction === d ? "active" : ""}
                        // Only meaningful once the chart is split: unsplit it draws a
                        // single combined line, which is Both by definition and has no
                        // carriageway to choose between.
                        disabled={!splitDirection}
                        title={!splitDirection ? "Turn on Split NB / SB to choose a direction" : undefined}
                        aria-pressed={direction === d}
                        onClick={() => setDirection(d)}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
                <div className={styles.heroFilterDivider} />
                <div className={styles.heroFilterGroup}>
                  <span className={styles.heroFilterLabel}>Granularity</span>
                  <div className={`${styles.segmentedSmall} nct-wrap`}>
                    {(["hourly", "daily", "weekly", "monthly"] as const).map((g) => (
                      <button
                        key={g}
                        className={grain === g ? "active" : ""}
                        disabled={(g === "hourly" && !hourlyAvailable) || Boolean(grainBlockedReason(g, spanDays))}
                        title={
                          g === "hourly" && !hourlyAvailable
                            ? "Hourly detail is available for ranges up to 2 weeks"
                            : grainBlockedReason(g, spanDays) ?? undefined
                        }
                        aria-pressed={grain === g}
                        onClick={() => setGrain(g)}
                      >
                        {g.charAt(0).toUpperCase() + g.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className={styles.heroFilterGroup} style={{ marginLeft: "auto" }}>
                  <label className={styles.heroToggle}>
                    <input
                      type="checkbox"
                      checked={splitDirection}
                      onChange={(e) => {
                        const on = e.target.checked;
                        setSplitDirection(on);
                        // Turning split off returns the control to Both, so it is never
                        // left disabled while holding NB or SB — a state the reader
                        // could see but not change.
                        if (!on) setDirection("Both");
                      }}
                    />
                    <span className={styles.heroToggleTrack}><span className={styles.heroToggleThumb} /></span>
                    Split NB / SB
                  </label>
                </div>
              </div>
              <div className={styles.chartBody}>{chartFrame(trendOption, "No volume data for the selected filters", onTrendClick)}</div>
              {trendInsight && !error && (
                <CardInsight lead={`Busiest day: ${trendInsight.hi.d}, with ${fmtCompact(trendInsight.hi.v)} entries.`}>
                  Quietest: {trendInsight.lo.d} ({fmtCompact(trendInsight.lo.v)}). A typical day carries about {fmtCompact(trendInsight.median)}.
                </CardInsight>
              )}
            </article>

            {/* Breakdowns, two columns: by plaza, and against normal days. */}
            <article className={`${styles.chartCard} nct-span-half`}>
              <div className={styles.chartHead}>
                <div className="nc-head-main">
                <CardIcon icon={Building2} />
                <div className={styles.headText}>
                  <h3>Volume by Plaza<InfoTooltip text="Share of the Range's volume handled by each toll plaza, counted where each trip paid. Click a bar for that plaza's summary. SCTEX is an interchange, not a toll exit: its bar is the vehicles that entered NLEX through the Mabiga toll plaza (Mabalacat), the connection to SCTEX. No data records vehicles leaving NLEX at Mabiga." /></h3>
                </div>
                </div>
                <div className="nct-head-tools">
                  {sortButton(plazaSort, setPlazaSort)}
                  <button className={styles.secondaryButton} onClick={() => setAllPlazasOpen(true)}>
                    View all plazas
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M6 12l4-4-4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </button>
                </div>
              </div>
              <div className={styles.chartBody}>{chartFrame(plazaChart?.option ?? null, "No data for the selected filters", onPlazaClick)}</div>
              {plazaInsight && !error && (
                <CardInsight lead={`Busiest plaza: ${plazaInsight.top.plaza}, with ${plazaInsight.topPct.toFixed(1)}% of the volume.`}>
                  The top 3 plazas carry {plazaInsight.top3Pct.toFixed(1)}%; the five smallest together {plazaInsight.bottomPct.toFixed(1)}%.
                </CardInsight>
              )}
            </article>

            <article className={`${styles.chartCard} nct-span-half`}>
              <div className={styles.chartHead}>
                <div className="nc-head-main">
                <CardIcon icon={CalendarDays} />
                <div className={styles.headText}>
                  <h3>{impactMode === "Events" ? "Arena Event Impact" : "Holiday vs Normal Days"}<InfoTooltip text="How volume on Philippine Arena event days or public holidays compares with the normal days around them (±45-day local baseline). Toggle Events / Holidays above." /></h3>
                </div>
                </div>
                <div className="nct-head-tools">
                  <div className={styles.segmented} role="group" aria-label="Events or holidays">
                    {(["Events", "Holidays"] as const).map((m) => (
                      <button key={m} className={impactMode === m ? "active" : ""} aria-pressed={impactMode === m} onClick={() => setImpactMode(m)}>
                        {m}
                      </button>
                    ))}
                  </div>
                  {sortButton(impactSort, setImpactSort)}
                  <button className={styles.secondaryButton} onClick={() => setImpactListOpen(true)}>
                    View all
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M6 12l4-4-4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </button>
                  {/* Which exit the events are measured at: a sub-option of Events, so it sits right under that toggle. */}
                  {impactMode === "Events" && (
                    <div className="nct-exit-pick">
                      <CustomSelect
                        prefix="Measured at"
                        value={eventExit}
                        onChange={(v) => setEventExit(v as EventExitView)}
                        options={EVENT_EXIT_VIEWS.map((v) => ({ label: v.label, value: v.value }))}
                      />
                    </div>
                  )}
                </div>
              </div>
              <div className={styles.chartBody}>{chartFrame(impactChart?.option ?? null, "No impact data available", onImpactClick)}</div>
              {impactInsight && !error && (
                <CardInsight lead={`Furthest from normal: ${impactInsight.top.label}${impactInsight.top.date ? ` (${impactInsight.top.date})` : ""}, ${fmtPct(impactInsight.top.pct)}.`}>
                  {impactInsight.above} of {impactInsight.n} {impactMode === "Events" ? "event days" : "holidays"} ran above normal; the average change was {fmtPct(impactInsight.avg)}.
                </CardInsight>
              )}
            </article>

            {/* By hour: the hour × day heatmap, then jam speed by hour. */}
            <article className={`${styles.chartCard} nct-span-heat`}>
              <div className={styles.chartHead}>
                <div className="nc-head-main">
                <CardIcon icon={Grid3x3} />
                <div className={styles.headText}>
                  <h3>Average Volume by Hour and Day<InfoTooltip text="Typical vehicles per hour for each day of the week — darker cells are busier. Shows when the corridor peaks." /></h3>
                </div>
                </div>
              </div>
              <div className={styles.chartBody}>{chartFrame(heatmapOption, "No data for the selected filters", onHeatmapClick, false, (c) => { heatChart.current = c; })}</div>
              <RampKey
                colors={heatRamp(chartTheme)}
                min={heatMinValue}
                max={heatMaxValue}
                // Same figure and unit as the cell tooltip; the key used to say "4K vehicles" for a cell reading "4,123 vehicles/hr".
                format={(v) => heatValue(v, "vehicles/hr", 0)}
                lowLabel="Quieter"
                highLabel="Busier"
                onScrub={scrub(heatChart, heatMinValue, heatMaxValue)}
              />
              {heatInsight && !error && (
                <CardInsight lead={`Busiest time: ${DOW_FULL[DOW_ORDER.indexOf(heatInsight.busy.dow)]} • ${fmtHour(heatInsight.busy.hour)}, ${fmtInt(heatInsight.busy.v)} vehicles/hr on average.`}>
                  Quietest: {DOW_FULL[DOW_ORDER.indexOf(heatInsight.quiet.dow)]} • {fmtHour(heatInsight.quiet.hour)} ({fmtInt(heatInsight.quiet.v)}). Weekdays average {fmtInt(heatInsight.wd)} vehicles/hr, weekends {fmtInt(heatInsight.we)}.
                </CardInsight>
              )}
            </article>

            <article className={`${styles.chartCard} nct-span-speed`}>
              <div className={styles.chartHead}>
                <div className="nc-head-main">
                <CardIcon icon={Gauge} />
                <div className={styles.headText}>
                  <h3>Average Speed in Jams by Hour<InfoTooltip text="Mean speed reported inside Waze jams for each hour of the day — lower means slower-moving jams at that hour." /></h3>
                </div>
                </div>
              </div>
              <div className={styles.chartBody}>{chartFrame(speedOption, "No congestion data in the selected range", onSpeedClick, true, (c) => { speedChart.current = c; })}</div>
              {/* Read light to dark like the busyness key beside it (user request): Faster on the left, Slower on the
                  right. The chart's colours are unchanged (slowest = deepest); only the key runs the other way, so the
                  pointer position is flipped before it reaches the chart. */}
              <RampKey
                colors={[...SEVERITY].reverse()}
                min={speedRange[1]}
                max={speedRange[0]}
                format={(v) => `${v.toFixed(0)} km/h`}
                lowLabel="Faster"
                highLabel="Slower"
                onScrub={(t) => scrub(speedChart, speedRange[0], speedRange[1])(t == null ? null : 1 - t)}
              />
              {speedInsight && !error && (
                <CardInsight lead={`Slowest jams at ${fmtHour(speedInsight.slow.hour)}: ${speedInsight.slow.speed} km/h.`}>
                  That is {speedInsight.gapPct.toFixed(0)}% slower than at {fmtHour(speedInsight.fast.hour)}, the fastest hour ({speedInsight.fast.speed} km/h).
                </CardInsight>
              )}
            </article>
          </>
        )}

        {activeTab === "Predictive" && (
          <>
            <div className={styles.spanFull}>
              <PredictiveVolumeChart
                months={rangeMode === "custom" ? "all" : rangeMode}
                from={rangeMode === "custom" ? customFrom : undefined}
                to={rangeMode === "custom" ? customTo : undefined}
                weather={weather}
                onMonthsChange={(m) => setRangeMode(m)}
              />
            </div>
            {/* The hour-by-hour 48-hour forecast (adviser's brief) is the "Hourly" view of the card above since
                26 Oct 2026, one forecast graph instead of two. */}
            {/* Each on its own full row (8 Oct 2026, user request): side by side, the congestion card was
                twice the height of the event card and one of them always ended in blank space. Each card
                splits itself into two columns inside instead (.nct-split). */}
            <div className={styles.spanFull}><PredictiveCongestionChart /></div>
            <div className={styles.spanFull}><PredictiveEventChart /></div>
          </>
        )}

        {activeTab === "Prescriptive" && (
          /* Three panels, one per row of the analytics diagram, each acting on
             the Predictive tab's own forecast rather than a separate model.
             The booth plan takes the descriptive plaza shares and per-plaza
             hourly profiles from the same analytics payload the Descriptive
             tab charts, so it cannot disagree with the "Volume by Plaza" and
             hour-of-day views about where and when the peak is. */
          <>
            <div className={styles.spanFull}>
              {/* No props: the staffing model reads the warehouse directly now,
                  so the recommendation no longer moves when the operator
                  changes a date range on the descriptive tab. */}
              <BoothStaffingPanel />
            </div>
            {/* Two different sizes, so the tab is not a wall of equal cards:
                the advisory beside the wider event ranking. */}
            <div className="nct-span-resp">
              <CongestionResponsePanel />
            </div>
            <div className="nct-span-event">
              <EventInterventionPanel />
            </div>
          </>
        )}
      </div>

      {/* Dialogs sit outside the cross-fading stage, so its animation can never
          trap them under the sticky filter bar. They belong to Descriptive. */}
      {activeTab === "Descriptive" && detail && (
        <div className={styles.detailBackdrop} role="dialog" aria-modal="true" aria-label={detail.title} onClick={() => setDetail(null)}>
          <div className={styles.detailModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.detailAccent} />
            <div className={styles.detailHeader}>
              <div className={styles.detailIcon}><TrendingUp size={18} aria-hidden="true" /></div>
              <div className={styles.detailTitles}>
                <h3>{detail.title}</h3>
                {detail.subtitle && <p>{detail.subtitle}</p>}
              </div>
              <button className={styles.detailClose} onClick={() => setDetail(null)} aria-label="Close">
                {closeIcon}
              </button>
            </div>
            <div className={styles.detailBody}>
              {detail.rows.map(([k, v], i) => (
                <div key={k} className={`${styles.detailRow} ${i % 2 === 0 ? styles.detailRowAlt : ""}`}>
                  <span className={styles.detailKey}>{k}</span>
                  <span className={styles.detailVal}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* View-all-plazas modal */}
      {activeTab === "Descriptive" && allPlazasOpen && data && (
        <div className={styles.detailBackdrop} role="dialog" aria-modal="true" aria-label="All plazas" onClick={() => setAllPlazasOpen(false)}>
          <div className={`${styles.detailModal} ${styles.plazaModal}`} onClick={(e) => e.stopPropagation()}>
            <div className={styles.detailAccent} />
            <div className={styles.detailHeader}>
              <div className={styles.detailIcon}><Building2 size={18} aria-hidden="true" /></div>
              <div className={styles.detailTitles}>
                <h3>Volume by Plaza — Full Ranking</h3>
                <p>{data.byPlaza.length} exits · click a column to sort · SCTEX = vehicles entering NLEX through Mabiga (Mabalacat)</p>
              </div>
              <button className={styles.detailClose} onClick={() => setAllPlazasOpen(false)} aria-label="Close">
                {closeIcon}
              </button>
            </div>
            <div className={styles.plazaTableWrap}>
              <table className={styles.plazaTable}>
                <SortHead cols={plazaCols} sort={plazaSorted.sort} onSort={plazaSorted.toggle} />
                <tbody>
                  {plazaSorted.sorted.map((r) => (
                    <tr key={r.plaza}>
                      <td className={styles.plazaRank}>{r.rank}</td>
                      <td>{r.plaza}</td>
                      <td className={styles.plazaNum}>{fmtInt(r.v)}</td>
                      <td className={styles.plazaNum}>{derived && derived.plazaTotal > 0 ? `${((r.v / derived.plazaTotal) * 100).toFixed(1)}%` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* View-all events/holidays modal */}
      {activeTab === "Descriptive" && impactListOpen && data && (
        <div className={styles.detailBackdrop} role="dialog" aria-modal="true" aria-label={`All ${impactMode.toLowerCase()}`} onClick={() => setImpactListOpen(false)}>
          <div className={`${styles.detailModal} ${impactMode === "Events" ? styles.impactModal : styles.holidayModal}`} onClick={(e) => e.stopPropagation()}>
            <div className={styles.detailAccent} />
            <div className={styles.detailHeader}>
              <div className={styles.detailIcon}><CalendarClock size={18} aria-hidden="true" /></div>
              <div className={styles.detailTitles}>
                <h3>{impactMode === "Events" ? "Arena Events — Full List" : "Holidays — Full List"}</h3>
                <p>
                  {impactMode === "Events"
                    ? `${eventsShown.length} event${eventsShown.length === 1 ? "" : "s"}${yearShown === "all" ? "" : ` in ${yearShown}`} · measured at ${EVENT_EXIT_VIEWS.find((v) => v.value === eventExit)?.label ?? "the venue exit"} · ${eventSorted.sort.key === "dist" ? "furthest from normal first" : "click a column to sort"}, a row for details`
                    : `${data.holidayImpact.length} holidays · ${holidaySorted.sort.key === "dist" ? "furthest from normal first" : "click a column to sort"}, a row for details`}
                </p>
              </div>
              <button className={styles.detailClose} onClick={() => setImpactListOpen(false)} aria-label="Close">
                {closeIcon}
              </button>
            </div>
            {impactMode === "Events" && eventYears.length > 1 && (
              <div className={`${styles.segmented} nct-year-filter`} role="group" aria-label="Filter events by year">
                {["all", ...eventYears].map((y) => (
                  <button key={y} className={yearShown === y ? "active" : ""} aria-pressed={yearShown === y} onClick={() => setEventYear(y)}>
                    {y === "all" ? "All years" : y}
                  </button>
                ))}
              </div>
            )}
            <div className={styles.plazaTableWrap}>
              {impactMode === "Events" ? (
                <table className={styles.plazaTable}>
                  <SortHead cols={eventCols} sort={eventSorted.sort} onSort={eventSorted.toggle} />
                  <tbody>
                    {eventSorted.sorted.map((e) => (
                      <tr
                        key={`${e.date}-${e.label}`}
                        className={styles.clickableRow}
                        onClick={() => { setImpactListOpen(false); showEventDetail(e); }}
                      >
                        <td className={styles.plazaNum} style={{ whiteSpace: "nowrap" }}>{e.date}</td>
                        <td className={styles.eventName}>{e.label}</td>
                        <td className={styles.plazaNum}>{fmtInt(e.dayVolume)}</td>
                        <td className={styles.plazaNum}>{fmtInt(e.baseline)}</td>
                        <td className={styles.plazaNum}>
                          {e.deviationPct != null ? (
                            <span className={e.deviationPct >= 0 ? "nct-dev-pos" : "nct-dev-neg"} style={{ ["--dev" as string]: e.deviationPct >= 0 ? ABOVE : BELOW }}>{fmtPct(e.deviationPct)}</span>
                          ) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table className={styles.plazaTable}>
                  <SortHead cols={holidayCols} sort={holidaySorted.sort} onSort={holidaySorted.toggle} />
                  <tbody>
                    {holidaySorted.sorted.map((h) => (
                      <tr
                        key={h.label}
                        className={styles.clickableRow}
                        onClick={() => { setImpactListOpen(false); showHolidayDetail(h); }}
                      >
                        <td>{h.label}</td>
                        <td className={styles.plazaNum}>{h.volume > 0 ? fmtInt(h.volume) : "—"}</td>
                        <td className={styles.plazaNum}>{h.baseline > 0 ? fmtInt(h.baseline) : "—"}</td>
                        <td className={styles.plazaNum}>
                          <span className={h.deviationPct >= 0 ? "nct-dev-pos" : "nct-dev-neg"} style={{ ["--dev" as string]: h.deviationPct >= 0 ? ABOVE : BELOW }}>{fmtPct(h.deviationPct)}</span>
                        </td>
                        <td className={styles.plazaNum}>{h.occurrences}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
