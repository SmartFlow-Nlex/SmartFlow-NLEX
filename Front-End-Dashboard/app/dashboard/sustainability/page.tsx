"use client";

import { useEffect, useMemo, useState } from "react";
import { cachedJson } from "../../../lib/cached-json";
import { attachCategoryClick } from "../../../lib/chart-click";
import { useChartTheme, applyChartTheme, seriesRamp, seriesPair } from "../../../lib/chart-theme";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import { CalendarClock, Clock, Leaf, Timer, Truck, Wind, X } from "lucide-react";
import DashboardChart from "../../../components/dashboard/DashboardChart";
import ChartSkeleton, { KpiSkeleton } from "../../../components/dashboard/ChartSkeleton";
import CustomSelect from "../../../components/dashboard/CustomSelect";
import PageHeader from "../../../components/dashboard/PageHeader";
import InfoTooltip from "../../../components/dashboard/InfoTooltip";
import ModeTabLabel, { modeIndex } from "../../../components/dashboard/ModeTabLabel";
import StateNote from "../../../components/stage/StateNote";
import { areaFade } from "../../../lib/chart-kit";
import PredictiveEmissionChart from "../../../components/dashboard/PredictiveEmissionChart";
import FleetMixForecastChart from "../../../components/dashboard/FleetMixForecastChart";
import PrescriptiveEmissionsPanel from "../../../components/dashboard/PrescriptiveEmissionsPanel";
import DateRangePicker from "../traffic/components/DateRangePicker";
import { rangeDays, grainBlockedReason, bestGrainFor, axisLabelFor, bucketLabelFor } from "../../../lib/granularity";
import styles from "../traffic/traffic.module.css";
import CountUpValue from "../../../components/dashboard/CountUpValue";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

const CLASS_SHORT = ["Class 1 · Light", "Class 2 · Medium", "Class 3 · Heavy"];
const AQI_BANDS = ["Good (AQI 1–2)", "Moderate (AQI 3)", "Poor (AQI 4–5)"] as const;

/* The chart kit's 28% → 0% area fade. Its gradient object types `type` as a
   plain string where ECharts wants the literal "linear", hence the cast. */
const fadeArea = (c: string) => areaFade(c) as unknown as { color: string };

const DOW_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0];

// ---------- Data contract ----------
type Analytics = {
  range: { from: string; to: string };
  meta: { minDate: string; maxDate: string; source?: string; exits?: number };
  kpis: {
    totalCo2T: number;
    prevCo2T: number;
    /** Idling CO2 behind cleared accidents in the Range (Back-End emissions-source.ts). */
    delayCarbonT?: number;
    delayCarbonPct?: number;
    delayIncidents?: number;
    delayLongIncidents?: number;
    delayLongSharePct?: number;
    avgAqi: number | null;
    aqiSamples: number;
    avgPm25: number | null;
  };
  /** nb + sb + bothdir = the day: bothdir is the plazas the record does not split by direction. */
  dailyTrend: { d: string; c1: number; c2: number; c3: number; nb: number; sb: number; bothdir?: number }[];
  /** Present only for ranges of 14 days or less; null otherwise. */
  hourlyTrend: { d: string; hour: number; c1: number; c2: number; c3: number; nb: number; sb: number }[] | null;
  heatmap: { dow: number; hour: number; v: number }[];
  classes: { class: number; label: string; co2_g_per_km: number; volume: number; co2_t: number; pm25_kg: number; no2_kg: number }[];
  aqiMonthly: { m: string; good: number; moderate: number; poor: number; pm25: number | null }[];
};

type Granularity = "hourly" | "daily" | "weekly" | "monthly";
/**
 * Two controls, two jobs.
 *
 * `classView` lives on the hero chart and only decides which of its stacked
 * series are drawn — it never refetches, so the rest of the tab is untouched.
 * `classFilter` sits with the date range and narrows the query itself, so every
 * panel reports that class.
 */
type ClassChoice = "All" | "1" | "2" | "3";
type RangeMode = "3" | "12" | "all" | "custom";
type Detail = { title: string; subtitle?: string; rows: [string, string][]; note?: string };

// ---------- Formatting ----------
const fmtInt = (n: number) => Math.round(n).toLocaleString("en-US");
const fmt1 = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtCompact = (n: number) => Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
const fmtHour = (h: number) => (h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`);
const fmtPct = (p: number) => `${p >= 0 ? "+" : ""}${p.toFixed(1)}%`;
const monthLabel = (m: string) =>
  new Date(`${m}-01T00:00:00`).toLocaleDateString("en-US", { month: "short", year: "2-digit" });

function weekStart(dateStr: string): string {
  const dt = new Date(`${dateStr}T00:00:00`);
  dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7));
  return dt.toISOString().slice(0, 10);
}

export default function SustainabilityPage() {
  // Chart furniture follows the active theme; series hues stay fixed.
  const chartTheme = useChartTheme();

  /* This tab's colour family. The ramp is ordinal — lightest to darkest — and
     both modes are selected steps validated against their own surface, not an
     automatic flip. A pair of nominal series takes the outer two steps, which is
     where the separation margin lives. See lib/chart-theme. */
  const RAMP = seriesRamp("emissions", chartTheme);
  const [PAIR_A, PAIR_B] = seriesPair("emissions", chartTheme);
  const SEQ = [chartTheme.seqLightest, ...RAMP];
  const [activeTab, setActiveTab] = useState<"Descriptive" | "Predictive" | "Prescriptive">("Descriptive");

  // Global filters
  const [rangeMode, setRangeMode] = useState<RangeMode>("12");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  // Chart-local interactivity
  const [grain, setGrain] = useState<Granularity>("monthly");
  const [timeView, setTimeView] = useState<"hour" | "dow">("hour");
  const [classView, setClassView] = useState<ClassChoice>("All");
  const [classFilter, setClassFilter] = useState<ClassChoice>("All");
  const [detail, setDetail] = useState<Detail | null>(null);

  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
    if (classFilter !== "All") qs.set("vehicleClass", classFilter);
    // Memoised per query string: switching tabs or returning to this page
    // renders from memory instead of refetching. Five minutes, refreshed
    // quietly in the background once stale. See lib/cached-json.
    cachedJson<{ success: boolean; message?: string; data: Analytics }>(`${BACKEND}/api/emissions/analytics?${qs}`)
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
  }, [rangeMode, customFrom, customTo, classFilter]);

  /* How long a window is on screen, and what that allows.

     Measured from the range the API resolved rather than the raw custom inputs,
     so the 3-month and 12-month presets are governed by the same rule. */
  const spanDays = rangeDays(data?.range.from, data?.range.to);
  // The API decides: it omits the series entirely past 14 days.
  const hourlyAvailable = Boolean(data?.hourlyTrend);

  // A grain that stops being possible is demoted rather than left selected: the
  // control disables it, so without this the chart would sit on an impossible
  // bucket with no way to change it.
  useEffect(() => {
    if (spanDays == null) return;
    if (grainBlockedReason(grain, spanDays)) {
      setGrain(bestGrainFor(spanDays, hourlyAvailable) as typeof grain);
    }
  }, [spanDays, grain, hourlyAvailable]);

  // ---------- Derived ----------
  const derived = useMemo(() => {
    if (!data) return null;
    const { kpis, classes } = data;
    const deltaPct = kpis.prevCo2T > 0 ? ((kpis.totalCo2T - kpis.prevCo2T) / kpis.prevCo2T) * 100 : 0;

    const totVol = classes.reduce((s, c) => s + c.volume, 0);
    const totCo2 = classes.reduce((s, c) => s + c.co2_t, 0);
    const heavy = classes.filter((c) => c.class >= 2);
    const heavyVolPct = totVol > 0 ? (heavy.reduce((s, c) => s + c.volume, 0) / totVol) * 100 : 0;
    const heavyCo2Pct = totCo2 > 0 ? (heavy.reduce((s, c) => s + c.co2_t, 0) / totCo2) * 100 : 0;

    const days = data.dailyTrend.length;
    const avgDailyT = days > 0 ? kpis.totalCo2T / days : 0;

    return { deltaPct, heavyVolPct, heavyCo2Pct, avgDailyT, totVol, totCo2 };
  }, [data]);

    // ---------- Hero: CO2 trend by class ----------
  type TrendRow = { label: string; c1: number; c2: number; c3: number; nb: number; sb: number; bothdir?: number; total: number };
  const trendRows = useMemo<TrendRow[]>(() => {
    if (!data) return [];
    // Hourly reads a different series entirely — the API only sends it for short
    // ranges, so the control is disabled when it is absent.
    const src =
      grain === "hourly"
        ? (data.hourlyTrend ?? []).map((r) => ({
            ...r,
            d: `${r.d} ${String(r.hour).padStart(2, "0")}:00`,
          }))
        : data.dailyTrend;

    const keyOf =
      grain === "hourly" || grain === "daily"
        ? (d: string) => d
        : grain === "weekly"
          ? weekStart
          : (d: string) => d.slice(0, 7);
    const acc = new Map<string, { c1: number; c2: number; c3: number; nb: number; sb: number; bothdir: number; days: number }>();
    for (const r of src) {
      const k = keyOf(r.d);
      const cur = acc.get(k) ?? { c1: 0, c2: 0, c3: 0, nb: 0, sb: 0, bothdir: 0, days: 0 };
      acc.set(k, { c1: cur.c1 + r.c1, c2: cur.c2 + r.c2, c3: cur.c3 + r.c3, nb: cur.nb + r.nb, sb: cur.sb + r.sb, bothdir: cur.bothdir + ("bothdir" in r ? (r.bothdir ?? 0) : 0), days: cur.days + 1 });
    }
    let rows = [...acc.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([label, v]) => ({ label, ...v, total: v.c1 + v.c2 + v.c3 }));
    // A partial first/last bucket (a "month" holding 2 days) reads as a fake
    // collapse in a stacked trend — trim incomplete edge buckets for rolled-up grains.
    if (grain !== "daily" && grain !== "hourly" && rows.length > 2) {
      const expected = (label: string) =>
        grain === "weekly"
          ? 7
          : new Date(Number(label.slice(0, 4)), Number(label.slice(5, 7)), 0).getDate();
      if (rows[0].days < expected(rows[0].label)) rows = rows.slice(1);
      if (rows.length > 2 && rows[rows.length - 1].days < expected(rows[rows.length - 1].label)) rows = rows.slice(0, -1);
    }
    return rows;
  }, [data, grain]);

  const trendOption = useMemo<EChartsOption | null>(() => {
    if (trendRows.length === 0) return null;
    const labels = trendRows.map((r) => r.label);
    const boundaryKey = grain === "monthly" ? (l: string) => l : (l: string) => l.slice(0, 7);
    const labelInterval = (i: number) => i === 0 || boundaryKey(labels[i]) !== boundaryKey(labels[i - 1]);

    const mk = (name: string, key: "c1" | "c2" | "c3", color: string) => ({
      name,
      type: "line" as const,
      stack: "co2",
      data: trendRows.map((r) => Number(r[key].toFixed(1))),
      symbol: "none",
      smooth: false,
      itemStyle: { color },
      lineStyle: { width: 1, color },
      areaStyle: { color, opacity: 0.85 },
    });

    return {
      grid: { left: 62, right: 16, top: 22, bottom: classView === "All" ? 52 : 26 },
      xAxis: { type: "category", data: labels, axisLabel: { formatter: axisLabelFor(grain), interval: labelInterval, hideOverlap: true }, axisTick: { show: false } },
      yAxis: { type: "value", name: "tonnes CO₂", nameGap: 12, nameTextStyle: { align: "left" }, splitNumber: 3, axisLabel: { formatter: (v: number) => `${fmtCompact(v)} t` } },
      tooltip: {
        trigger: "axis",
        formatter: (p) => {
          const items = p as { seriesName: string; dataIndex: number; value: number; marker: string }[];
          const i = items[0].dataIndex;
          const r = trendRows[i];
          const rows = items.map((x) => `${x.marker} ${x.seriesName}: ${fmtInt(x.value)} t`).join("<br/>");
          return `<b>${bucketLabelFor(grain)(r.label)}</b><br/>${rows}<br/>Total: <b>${fmtInt(r.total)} t</b>`;
        },
      },
      /* Only while all three classes are drawn. Picking a single class filters
         the series list down to one, and the legend then named the one line on
         the chart -- which the Class control the reader just used already told
         them. */
      legend: { show: classView === "All", bottom: 0, left: "center", itemWidth: 14, itemHeight: 8, itemGap: 18, padding: 0, textStyle: { fontSize: 11 } },
      // Drawn from data already in hand: the response carries c1, c2 and c3 per
      // bucket, so this hides series rather than asking for different numbers.
      series: [mk(CLASS_SHORT[0], "c1", RAMP[0]), mk(CLASS_SHORT[1], "c2", RAMP[1]), mk(CLASS_SHORT[2], "c3", RAMP[2])]
        .filter((_, i) => classView === "All" || classView === String(i + 1)),
    };
    // chartTheme picks the ramp, so a theme switch redraws the series.
  }, [trendRows, grain, classView, chartTheme]);

  // ---------- When emissions happen (weekday/weekend hourly profile) ----------
  const timeProfile = useMemo(() => {
    if (!data || data.heatmap.length === 0) return null;
    const dowCount = [0, 0, 0, 0, 0, 0, 0];
    const end = new Date(`${data.range.to}T00:00:00`);
    for (const d = new Date(`${data.range.from}T00:00:00`); d <= end; d.setDate(d.getDate() + 1)) dowCount[d.getDay()]++;
    const weekdayDays = dowCount[1] + dowCount[2] + dowCount[3] + dowCount[4] + dowCount[5];
    const weekendDays = dowCount[0] + dowCount[6];
    const totalDays = weekdayDays + weekendDays;

    const wkHour = Array<number>(24).fill(0);
    const weHour = Array<number>(24).fill(0);
    const dowTotals = Array<number>(7).fill(0);
    for (const r of data.heatmap) {
      if (r.dow >= 1 && r.dow <= 5) wkHour[r.hour] += r.v;
      else weHour[r.hour] += r.v;
      dowTotals[r.dow] += r.v;
    }

    const weekday = wkHour.map((v) => (weekdayDays > 0 ? v / weekdayDays : 0));
    const weekend = weHour.map((v) => (weekendDays > 0 ? v / weekendDays : 0));
    const allHour = wkHour.map((v, h) => (totalDays > 0 ? (v + weHour[h]) / totalDays : 0));
    const hourTotals = wkHour.map((v, h) => v + weHour[h]);
    const peakHour = allHour.indexOf(Math.max(...allHour));
    const quietHour = allHour.indexOf(Math.min(...allHour));

    const dowAvg = DOW_ORDER.map((d) => (dowCount[d] > 0 ? dowTotals[d] / dowCount[d] : 0));
    const dowTotalOrdered = DOW_ORDER.map((d) => dowTotals[d]);
    const dowDaysOrdered = DOW_ORDER.map((d) => dowCount[d]);
    const busiestDow = dowAvg.indexOf(Math.max(...dowAvg));

    return { weekday, weekend, allHour, hourTotals, peakHour, quietHour, dowAvg, dowTotalOrdered, dowDaysOrdered, busiestDow };
  }, [data]);

  // The peak hour is the card's answer (drawn above this line); the takeaway
  // carries the rest of the same computed finding.
  const timeTakeaway = timeProfile
    ? `Quietest around ${fmtHour(timeProfile.quietHour)} · heaviest day: ${DOW_LABELS[timeProfile.busiestDow]}`
    : null;

  const timeOption = useMemo<EChartsOption | null>(() => {
    if (!timeProfile) return null;

    if (timeView === "hour") {
      const peakIdx = timeProfile.weekday.indexOf(Math.max(...timeProfile.weekday));
      return {
        grid: { left: 48, right: 16, top: 22, bottom: 54 },
        xAxis: { type: "category", boundaryGap: false, data: Array.from({ length: 24 }, (_, h) => fmtHour(h)), axisLabel: { interval: 3 }, axisTick: { show: false } },
        yAxis: { type: "value", name: "avg t CO₂ / day", nameGap: 12, nameTextStyle: { align: "left" }, splitNumber: 3, axisLabel: { formatter: (v: number) => `${v} t` } },
        tooltip: { trigger: "axis", valueFormatter: (v) => (v == null ? "—" : `${fmt1(Number(v))} t`) },
        legend: { show: true, bottom: 0, left: "center", itemWidth: 14, itemHeight: 8, itemGap: 18, padding: 0, textStyle: { fontSize: 11 } },
        series: [
          {
            name: "Weekdays",
            type: "line",
            data: timeProfile.weekday.map((v) => Number(v.toFixed(2))),
            symbol: "none",
            smooth: true,
            itemStyle: { color: PAIR_A },
            lineStyle: { width: 2, color: PAIR_A },
            markPoint: {
              symbol: "circle",
              symbolSize: 8,
              itemStyle: { color: PAIR_A, borderColor: chartTheme.tooltipBg, borderWidth: 2 },
              label: { show: true, position: "top", fontSize: 11, color: chartTheme.ink, fontFamily: chartTheme.fontFamily, formatter: `Peak · ${fmtHour(peakIdx)}` },
              data: [{ name: "Peak", coord: [peakIdx, Number(timeProfile.weekday[peakIdx].toFixed(2))] }],
            },
          },
          {
            name: "Weekends",
            type: "line",
            data: timeProfile.weekend.map((v) => Number(v.toFixed(2))),
            symbol: "none",
            smooth: true,
            itemStyle: { color: PAIR_B },
            lineStyle: { width: 2, color: PAIR_B },
          },
        ],
      };
    }

    const maxIdx = timeProfile.busiestDow;
    return {
      grid: { left: 48, right: 16, top: 22, bottom: 54 },
      xAxis: { type: "category", data: DOW_LABELS, axisLabel: { interval: 0 }, axisTick: { show: false } },
      yAxis: { type: "value", name: "avg t CO₂ / day", nameGap: 12, nameTextStyle: { align: "left" }, splitNumber: 3, axisLabel: { formatter: (v: number) => `${v} t` } },
      tooltip: {
        formatter: (p) => {
          const i = (p as { dataIndex: number }).dataIndex;
          return `<b>${DOW_LABELS[i]}</b><br/>${fmt1(timeProfile.dowAvg[i])} t CO₂ per ${DOW_LABELS[i]} on average<br/>${fmtInt(timeProfile.dowTotalOrdered[i])} t total across ${fmtInt(timeProfile.dowDaysOrdered[i])} ${DOW_LABELS[i]}s`;
        },
      },
      series: [
        {
          type: "bar",
          data: timeProfile.dowAvg.map((v, i) => ({
            value: Number(v.toFixed(1)),
            itemStyle: { color: i === maxIdx ? PAIR_A : RAMP[0], borderRadius: [4, 4, 0, 0] },
            label: i === maxIdx ? { show: true, position: "top", fontSize: 11, color: chartTheme.ink, fontFamily: chartTheme.fontFamily, formatter: () => `${fmt1(v)} t` } : undefined,
          })),
          barMaxWidth: 26,
        },
      ],
    };
    // chartTheme picks the series hues and label ink.
  }, [timeProfile, timeView, chartTheme]);

  // ---------- Fleet mix vs pollution load ----------
  const fleetRows = useMemo(() => {
    if (!data || data.classes.length === 0 || !derived) return null;
    const cls = [...data.classes].sort((a, b) => a.class - b.class);
    const metric = (key: "volume" | "co2_t" | "no2_kg" | "pm25_kg") => {
      const tot = cls.reduce((s, c) => s + c[key], 0);
      return { values: cls.map((c) => c[key]), shares: cls.map((c) => (tot > 0 ? (c[key] / tot) * 100 : 0)), tot };
    };
    return {
      cls,
      rows: [
        { label: "Traffic volume", unit: "vehicles", ...metric("volume") },
        { label: "CO₂", unit: "t", ...metric("co2_t") },
        { label: "NO₂", unit: "kg", ...metric("no2_kg") },
        { label: "PM2.5", unit: "kg", ...metric("pm25_kg") },
      ],
    };
  }, [data, derived]);

  // The heavy CO2 share is the card's answer; the takeaway sets it against
  // the heavy share of traffic.
  const fleetTakeaway =
    derived && derived.heavyVolPct > 0
      ? `From just ${derived.heavyVolPct.toFixed(1)}% of traffic`
      : null;

  const fleetOption = useMemo<EChartsOption | null>(() => {
    if (!fleetRows) return null;
    const rows = [...fleetRows.rows].reverse(); // display top-to-bottom: volume first
    return {
      grid: { left: 92, right: 16, top: 10, bottom: 54 },
      xAxis: { type: "value", max: 100, interval: 25, axisLabel: { formatter: "{value}%" } },
      yAxis: { type: "category", data: rows.map((r) => r.label), axisLabel: { interval: 0, color: chartTheme.ink }, axisTick: { show: false } },
      tooltip: {
          axisPointer: { type: "shadow" },
        trigger: "axis",
        formatter: (p) => {
          const items = p as { seriesIndex: number; dataIndex: number; value: number; marker: string }[];
          const r = rows[items[0].dataIndex];
          const lines = items
            .map((x) => `${x.marker} ${CLASS_SHORT[x.seriesIndex]}: ${x.value.toFixed(1)}% (${fmtCompact(r.values[x.seriesIndex])} ${r.unit})`)
            .join("<br/>");
          return `<b>${r.label}</b><br/>${lines}`;
        },
      },
      legend: { show: true, bottom: 0, left: "center", itemWidth: 14, itemHeight: 8, itemGap: 18, padding: 0, textStyle: { fontSize: 11 } },
      series: fleetRows.cls.map((c, ci) => ({
        name: CLASS_SHORT[ci],
        type: "bar" as const,
        stack: "share",
        data: rows.map((r) => Number(r.shares[ci].toFixed(1))),
        itemStyle: { color: RAMP[ci], borderColor: chartTheme.tooltipBg, borderWidth: 1 },
        barMaxWidth: 18,
      })),
    };
    // chartTheme supplies the stack divider colour.
  }, [fleetRows, chartTheme]);

  // ---------- Heavy-vehicle share of CO2 over time ----------
  const heavyShareRows = useMemo(() => {
    return trendRows.map((r) => ({
      label: r.label,
      share: r.total > 0 ? ((r.c2 + r.c3) / r.total) * 100 : 0,
    }));
  }, [trendRows]);

  const heavyShareTakeaway = useMemo(() => {
    if (heavyShareRows.length < 2) return null;
    const first = heavyShareRows[0].share;
    const last = heavyShareRows[heavyShareRows.length - 1].share;
    const dir = last - first > 0.5 ? "Rising" : first - last > 0.5 ? "Falling" : "Steady";
    // "Now x%" is the card's answer, drawn above this line from the same last row.
    return `${dir} across the range (from ${first.toFixed(1)}%)`;
  }, [heavyShareRows]);

  const heavyShareOption = useMemo<EChartsOption | null>(() => {
    if (heavyShareRows.length === 0) return null;
    const labels = heavyShareRows.map((r) => r.label);
    const boundaryKey = grain === "monthly" ? (l: string) => l : (l: string) => l.slice(0, 7);
    const labelInterval = (i: number) => i === 0 || boundaryKey(labels[i]) !== boundaryKey(labels[i - 1]);
    const avg = heavyShareRows.reduce((s, r) => s + r.share, 0) / heavyShareRows.length;
    return {
      grid: { left: 44, right: 16, top: 16, bottom: 26 },
      xAxis: { type: "category", data: labels, axisLabel: { interval: labelInterval, hideOverlap: true }, axisTick: { show: false } },
      yAxis: {
        type: "value",
        splitNumber: 3,
        axisLabel: { formatter: "{value}%" },
        min: (v: { min: number }) => Math.max(0, Math.floor(v.min - 2)),
        max: (v: { max: number }) => Math.ceil(v.max + 2),
      },
      tooltip: {
        trigger: "axis",
        formatter: (p) => {
          const items = p as { dataIndex: number; value: number }[];
          const r = trendRows[items[0].dataIndex];
          return `<b>${r.label}</b><br/>Heavy-vehicle share: <b>${items[0].value}%</b><br/>${fmtInt(r.c2 + r.c3)} t of ${fmtInt(r.total)} t CO₂`;
        },
      },
      /* No legend: one line, on a chart whose title and y-axis both already
         say it is the heavy-vehicle share. */
      series: [
        {
          name: "Heavy-vehicle share of CO₂",
          type: "line",
          data: heavyShareRows.map((r) => Number(r.share.toFixed(1))),
          symbol: "none",
          smooth: true,
          itemStyle: { color: PAIR_A },
          lineStyle: { width: 2, color: PAIR_A },
          areaStyle: fadeArea(PAIR_A),
          markLine: {
            silent: true,
            symbol: "none",
            lineStyle: { color: chartTheme.text, type: "dashed", width: 1, opacity: 0.7 },
            label: { fontSize: 11, color: chartTheme.text, fontFamily: chartTheme.fontFamily, formatter: `avg ${avg.toFixed(1)}%`, position: "insideEndTop" },
            data: [{ yAxis: Number(avg.toFixed(1)) }],
          },
        },
      ],
    };
    // chartTheme colours the average markLine's label.
  }, [heavyShareRows, trendRows, grain, chartTheme]);

  // ---------- Measured air quality ----------
  const aqiOption = useMemo<EChartsOption | null>(() => {
    if (!data || data.aqiMonthly.length === 0) return null;
    const rows = data.aqiMonthly;
    const labels = rows.map((r) => monthLabel(r.m));
    const totals = rows.map((r) => r.good + r.moderate + r.poor);
    const share = (v: number, i: number) => (totals[i] > 0 ? Number(((v / totals[i]) * 100).toFixed(1)) : 0);
    const keys = ["good", "moderate", "poor"] as const;
    return {
      grid: { left: 40, right: 16, top: 10, bottom: 54 },
      xAxis: { type: "category", data: labels, axisLabel: { hideOverlap: true }, axisTick: { show: false } },
      yAxis: { type: "value", max: 100, splitNumber: 4, axisLabel: { formatter: "{value}%" } },
      tooltip: {
          axisPointer: { type: "shadow" },
        trigger: "axis",
        formatter: (p) => {
          const items = p as { seriesIndex: number; dataIndex: number; value: number; marker: string }[];
          const i = items[0].dataIndex;
          const r = rows[i];
          const lines = items
            .map((x) => `${x.marker} ${AQI_BANDS[x.seriesIndex]}: ${x.value}% (${fmtInt(r[keys[x.seriesIndex]])} readings)`)
            .join("<br/>");
          return `<b>${labels[i]}</b><br/>${lines}<br/>Avg PM2.5: ${r.pm25 != null ? `${fmt1(r.pm25)} µg/m³` : "—"}`;
        },
      },
      legend: { show: true, bottom: 0, left: "center", itemWidth: 14, itemHeight: 8, itemGap: 18, padding: 0, textStyle: { fontSize: 11 } },
      series: keys.map((k, ki) => ({
        name: AQI_BANDS[ki],
        type: "bar" as const,
        stack: "aqi",
        data: rows.map((r, i) => share(r[k], i)),
        itemStyle: { color: RAMP[ki], borderColor: chartTheme.tooltipBg, borderWidth: 1 },
        barMaxWidth: 22,
      })),
    };
    // chartTheme supplies the ramp and the stack divider colour.
  }, [data, chartTheme]);

  // ---------- KPI sparkline (daily total CO2) ----------
  const sparkOption = useMemo<EChartsOption | null>(() => {
    if (!data || data.dailyTrend.length < 2) return null;
    // 7-day rolling mean — raw daily totals are too noisy at sparkline size
    const daily = data.dailyTrend.map((r) => r.c1 + r.c2 + r.c3);
    const vals = daily.map((_, i) => {
      const win = daily.slice(Math.max(0, i - 6), i + 1);
      return Number((win.reduce((s, v) => s + v, 0) / win.length).toFixed(1));
    });
    return {
      grid: { left: 0, right: 0, top: 2, bottom: 2 },
      xAxis: { type: "category", show: false, data: vals.map((_, i) => i) },
      yAxis: { type: "value", show: false, min: "dataMin" },
      series: [{ type: "line", data: vals, symbol: "none", smooth: true, lineStyle: { width: 1.5, color: PAIR_A }, areaStyle: fadeArea(PAIR_A) }],
    };
    // chartTheme picks the line colour.
  }, [data, chartTheme]);

  /* ---------- Hour × weekday heat grid (Night Corridor) ----------
     Presentation only: the same `heatmap` rows the "When Emissions Happen"
     card already reads, laid out as a grid. Each cell is that weekday-hour's
     total over the Range divided by how many of that weekday the Range holds,
     the same per-day averaging timeProfile uses. No click: tooltip only. */
  const heatGrid = useMemo(() => {
    if (!data || data.heatmap.length === 0) return null;
    const dowCount = [0, 0, 0, 0, 0, 0, 0];
    const end = new Date(`${data.range.to}T00:00:00`);
    for (const d = new Date(`${data.range.from}T00:00:00`); d <= end; d.setDate(d.getDate() + 1)) dowCount[d.getDay()]++;
    const cells = data.heatmap
      .filter((r) => DOW_ORDER.includes(r.dow) && r.hour >= 0 && r.hour < 24)
      .map((r) => ({
        hour: r.hour,
        row: DOW_ORDER.indexOf(r.dow),
        avg: dowCount[r.dow] > 0 ? r.v / dowCount[r.dow] : 0,
        total: r.v,
        days: dowCount[r.dow],
      }));
    if (cells.length === 0) return null;
    const vals = cells.map((c) => c.avg);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const top = cells.reduce((a, b) => (b.avg > a.avg ? b : a));
    const low = cells.reduce((a, b) => (b.avg < a.avg ? b : a));
    // Dark runs quiet-dark to busy-bright, light runs paper to deep, both in
    // this tab's teal ramp so a busy cell is never read as a road state.
    const colors = chartTheme.isDark
      ? [chartTheme.seqLightest, RAMP[2], RAMP[1], RAMP[0]]
      : [chartTheme.seqLightest, RAMP[0], RAMP[1], RAMP[2]];
    const option: EChartsOption = {
      grid: { left: 44, right: 12, top: 8, bottom: 30 },
      xAxis: {
        type: "category",
        data: Array.from({ length: 24 }, (_, h) => fmtHour(h)),
        splitArea: { show: false },
        axisLabel: { interval: 2 },
        axisTick: { show: false },
      },
      yAxis: { type: "category", data: DOW_LABELS, inverse: true, axisTick: { show: false }, splitLine: { show: false } },
      visualMap: { show: false, min, max, dimension: 2, inRange: { color: colors } },
      tooltip: {
        trigger: "item",
        formatter: (p) => {
          const c = cells[(p as { dataIndex: number }).dataIndex];
          if (!c) return "";
          const day = DOW_LABELS[c.row];
          return `<b>${day} · ${fmtHour(c.hour)} – ${fmtHour((c.hour + 1) % 24)}</b><br/>${fmt1(c.avg)} t CO₂ on an average ${day}<br/>${fmtInt(c.total)} t total across ${fmtInt(c.days)} ${day}s`;
        },
      },
      series: [
        {
          type: "heatmap",
          data: cells.map((c) => [c.hour, c.row, Number(c.avg.toFixed(2))]),
          itemStyle: { borderColor: chartTheme.tooltipBg, borderWidth: 2, borderRadius: 3 },
          emphasis: { itemStyle: { borderColor: chartTheme.ink, borderWidth: 1 } },
        },
      ],
    };
    return { option, min, max, top, low, colors };
  }, [data, chartTheme]);

  // ---------- Click-to-inspect ----------
  const filtersNote = data ? `Range: ${data.range.from} to ${data.range.to}` : "";

  const onTrendClick = (p: { dataIndex: number }) => {
    const r = trendRows[p.dataIndex];
    if (!r) return;
    const totals = trendRows.map((x) => x.total);
    const avg = totals.reduce((s, v) => s + v, 0) / totals.length;
    const rank = 1 + totals.filter((v) => v > r.total).length;
    const periodWord = grain === "daily" ? "day" : grain === "weekly" ? "week" : "month";
    const title = grain === "weekly" ? `Week of ${r.label}` : r.label;
    setDetail({
      title,
      subtitle: `Modeled CO₂ · ${periodWord}ly`,
      rows: [
        ["Total CO₂", `${fmtInt(r.total)} t`],
        [CLASS_SHORT[0], `${fmtInt(r.c1)} t`],
        [CLASS_SHORT[1], `${fmtInt(r.c2)} t`],
        [CLASS_SHORT[2], `${fmtInt(r.c3)} t`],
        ["Northbound / Southbound", `${fmtInt(r.nb)} t / ${fmtInt(r.sb)} t`],
        ...(r.bothdir ? [["Plazas not split by direction", `${fmtInt(r.bothdir)} t`] as [string, string]] : []),
        ["vs range average", avg > 0 ? fmtPct(((r.total - avg) / avg) * 100) : "—"],
        ["Rank in range", `#${rank} of ${totals.length} ${periodWord}s`],
      ],
      note: filtersNote,
    });
  };

  const onTimeClick = (p: { dataIndex: number }) => {
    if (!timeProfile) return;
    if (timeView === "hour") {
      const h = p.dataIndex;
      const totals = [...timeProfile.hourTotals].sort((a, b) => b - a);
      const rank = 1 + totals.findIndex((x) => x <= timeProfile.hourTotals[h]);
      setDetail({
        title: `${fmtHour(h)} – ${fmtHour((h + 1) % 24)}`,
        subtitle: "Modeled CO₂ in this hour of day",
        rows: [
          ["Avg on a weekday", `${fmt1(timeProfile.weekday[h])} t`],
          ["Avg on a weekend day", `${fmt1(timeProfile.weekend[h])} t`],
          ["Total in range", `${fmtInt(timeProfile.hourTotals[h])} t`],
          ["Rank among hours", `#${rank} of 24`],
        ],
        note: filtersNote,
      });
    } else {
      const i = p.dataIndex;
      const avgs = [...timeProfile.dowAvg].sort((a, b) => b - a);
      const rank = 1 + avgs.findIndex((x) => x <= timeProfile.dowAvg[i]);
      setDetail({
        title: DOW_LABELS[i],
        subtitle: "Modeled CO₂ on this day of week",
        rows: [
          ["Avg per day", `${fmt1(timeProfile.dowAvg[i])} t`],
          ["Total in range", `${fmtInt(timeProfile.dowTotalOrdered[i])} t across ${fmtInt(timeProfile.dowDaysOrdered[i])} ${DOW_LABELS[i]}s`],
          ["Rank among days", `#${rank} of 7`],
        ],
        note: filtersNote,
      });
    }
  };

  const onFleetClick = (p: { dataIndex: number }) => {
    if (!fleetRows) return;
    const rows = [...fleetRows.rows].reverse();
    const r = rows[p.dataIndex];
    if (!r) return;
    setDetail({
      title: r.label,
      subtitle: "Share by vehicle class",
      rows: fleetRows.cls.map((c, ci) => [
        CLASS_SHORT[ci],
        `${r.shares[ci].toFixed(1)}% · ${fmtCompact(r.values[ci])} ${r.unit}`,
      ]) as [string, string][],
      note: `Emission factors (CO₂ g/km): ${fleetRows.cls.map((c, ci) => `${CLASS_SHORT[ci].split(" ")[0]} ${c.class}: ${fmtInt(c.co2_g_per_km)}`).join(" · ")}. ${filtersNote}`,
    });
  };

  const onHeavyShareClick = (p: { dataIndex: number }) => {
    const r = trendRows[p.dataIndex];
    if (!r) return;
    const share = r.total > 0 ? ((r.c2 + r.c3) / r.total) * 100 : 0;
    setDetail({
      title: grain === "weekly" ? `Week of ${r.label}` : r.label,
      subtitle: "Heavy-vehicle share of modeled CO₂",
      rows: [
        ["Heavy-vehicle share", `${share.toFixed(1)}%`],
        [CLASS_SHORT[1], `${fmtInt(r.c2)} t`],
        [CLASS_SHORT[2], `${fmtInt(r.c3)} t`],
        [CLASS_SHORT[0], `${fmtInt(r.c1)} t`],
        ["Total CO₂", `${fmtInt(r.total)} t`],
      ],
      note: `Heavy = Class 2 + Class 3 (buses, trucks). ${filtersNote}`,
    });
  };

  const onAqiClick = (p: { dataIndex: number }) => {
    if (!data) return;
    const r = data.aqiMonthly[p.dataIndex];
    if (!r) return;
    const tot = r.good + r.moderate + r.poor;
    setDetail({
      title: monthLabel(r.m),
      subtitle: "Measured air quality (OpenWeatherMap, hourly station readings)",
      rows: [
        [AQI_BANDS[0], `${fmtInt(r.good)} readings (${tot > 0 ? ((r.good / tot) * 100).toFixed(1) : "—"}%)`],
        [AQI_BANDS[1], `${fmtInt(r.moderate)} readings (${tot > 0 ? ((r.moderate / tot) * 100).toFixed(1) : "—"}%)`],
        [AQI_BANDS[2], `${fmtInt(r.poor)} readings (${tot > 0 ? ((r.poor / tot) * 100).toFixed(1) : "—"}%)`],
        ["Avg PM2.5", r.pm25 != null ? `${fmt1(r.pm25)} µg/m³` : "—"],
      ],
      note: `AQI is the 1–5 OpenWeatherMap scale measured at expressway stations — the observed counterpart to the modeled emissions. ${filtersNote}`,
    });
  };

  const chartFrame = (option: EChartsOption | null, emptyNote: string, onClick?: (p: never) => void) => {
    if (loading && !data) return <ChartSkeleton />;
    if (error)
      return (
        <div className="nc-em-state">
          <StateNote kind="error" size={44}>Live data unavailable — is the backend running on port 4000?</StateNote>
        </div>
      );
    if (!option)
      return (
        <div className="nc-em-state">
          <StateNote kind="nodata" size={44}>{emptyNote}</StateNote>
        </div>
      );
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
        onChartReady={
          onClick
            ? (chart) => attachCategoryClick(chart as never, onClick as never)
            : undefined
        }
      />
    );
  };

  // A skeleton rather than an ellipsis: the tile keeps its height, so the KPI
  // row does not resize under the cursor as the numbers arrive.
  const kpiValue = (v: string | null) =>
    loading && !data ? <KpiSkeleton /> : <CountUpValue text={v ?? "—"} />;
  const aqiWord = (a: number) => (a < 1.5 ? "Good" : a < 2.5 ? "Fair" : a < 3.5 ? "Moderate" : a < 4.5 ? "Poor" : "Very poor");

  /* ---------- Card answers ----------
     Each card opens with its answer: one number with its unit, computed here
     from the rows already loaded, at render time. Nothing below is fetched or
     stored; when the rows are missing the answer is simply not drawn. */
  const visibleOf = (r: TrendRow) => (classView === "All" ? r.total : r[`c${classView}` as "c1" | "c2" | "c3"]);
  const lastTrend = trendRows.length > 0 ? trendRows[trendRows.length - 1] : null;
  const trendMean = trendRows.length > 0 ? trendRows.reduce((s, r) => s + visibleOf(r), 0) / trendRows.length : 0;
  const lastVsMean = lastTrend && trendMean > 0 ? ((visibleOf(lastTrend) - trendMean) / trendMean) * 100 : null;
  const heroPeriod = grain === "hourly" ? "hour" : grain === "daily" ? "day" : grain === "weekly" ? "week" : "month";
  const lastShare = heavyShareRows.length > 0 ? heavyShareRows[heavyShareRows.length - 1].share : null;
  const aqiTotals =
    data && data.aqiMonthly.length > 0
      ? data.aqiMonthly.reduce((a, r) => ({ good: a.good + r.good, all: a.all + r.good + r.moderate + r.poor }), { good: 0, all: 0 })
      : null;
  const aqiGoodPct = aqiTotals && aqiTotals.all > 0 ? (aqiTotals.good / aqiTotals.all) * 100 : null;
  const aqiSpan =
    data && data.aqiMonthly.length > 0
      ? `${monthLabel(data.aqiMonthly[0].m)} – ${monthLabel(data.aqiMonthly[data.aqiMonthly.length - 1].m)}`
      : "";

  /* The Range control. Shown on the Prescriptive tab as well: its strategies
     are computed over this Range, and with the control only on the
     Descriptive tab the reader could neither see which Range the bars
     described nor change it without leaving the tab. */
  const rangeControl = (
    <div className={styles.filterGroup}>
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" style={{ color: "var(--text-muted)" }}><rect x="2" y="2" width="12" height="12" rx="3" stroke="currentColor" strokeWidth="1.4" /><path d="M2 6h12" stroke="currentColor" strokeWidth="1.4" /><path d="M5.5 2V4M10.5 2V4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
      <span className={styles.filterLabel}>Range</span>
      <div className={styles.segmented}>
        {(["3", "12", "all", "custom"] as const).map((m) => (
          <button key={m} className={rangeMode === m ? "active" : ""} onClick={() => setRangeMode(m)} aria-pressed={rangeMode === m}>
            {rangeMode === m && <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ marginRight: 4, marginBottom: -1 }}><path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
            {m === "3" ? "3 mo" : m === "12" ? "12 mo" : m === "all" ? "All" : "Custom"}
          </button>
        ))}
      </div>
      {rangeMode === "custom" && (
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
  );

  /* Active filters as removable chips. Each × calls the control's own setter
     with its default (12 months, all classes): exactly what choosing that
     option in the control itself does. */
  const rangeChipText =
    rangeMode === "12"
      ? null
      : rangeMode === "3"
        ? "3 mo"
        : rangeMode === "all"
          ? "All dates"
          : customFrom && customTo
            ? `${customFrom} – ${customTo}`
            : "Custom · pick dates";
  const classChipText = classFilter === "All" ? null : CLASS_SHORT[Number(classFilter) - 1];
  const filterChips = (withClass: boolean) => {
    const chips: { key: string; label: string; text: string; reset: string; clear: () => void }[] = [];
    if (rangeChipText) chips.push({ key: "range", label: "Range", text: rangeChipText, reset: "12 mo", clear: () => setRangeMode("12") });
    if (withClass && classChipText) chips.push({ key: "class", label: "Class", text: classChipText, reset: "all classes", clear: () => setClassFilter("All") });
    if (chips.length === 0) return null;
    return (
      <div className="nc-em-chips" role="group" aria-label="Active filters">
        {chips.map((c) => (
          <span key={c.key} className="nc-em-chip">
            <span className="nc-em-chip-key">{c.label}</span>
            {c.text}
            <button type="button" onClick={c.clear} aria-label={`Clear ${c.label.toLowerCase()} filter, back to ${c.reset}`} title={`Back to ${c.reset}`}>
              <X size={12} strokeWidth={2.2} aria-hidden="true" />
            </button>
          </span>
        ))}
      </div>
    );
  };

  /* The mode switch, directly under the page title: one segmented control
     with an accent underline that slides to the active mode. Same buttons,
     same order, same onClick as before. */
  const modeTabs = (
    <div className={styles.modeTabs} style={{ ["--mode-i" as string]: modeIndex(activeTab) }}>
      {(["Descriptive", "Predictive", "Prescriptive"] as const).map((t) => (
        <button key={t} className={`${styles.modeTab} ${activeTab === t ? styles.modeTabActive : ""}`} onClick={() => setActiveTab(t)} aria-pressed={activeTab === t}>
          <ModeTabLabel mode={t} />
        </button>
      ))}
      <span className={styles.modeIndicator} aria-hidden="true" />
    </div>
  );

  /* The sticky filter bar. Predictive has no filters (as before), so it has
     no bar; Prescriptive keeps the Range its strategies are computed over. */
  const filterBar =
    activeTab === "Descriptive" ? (
      <div className={styles.filterRow}>
        {rangeControl}

        <div className={styles.filterGroup}>
          {/* Narrows the query, so every panel on the tab reports this class.
                Distinct from the hero chart's own Show control, which only hides
                series in that one plot. */}
          <span className={styles.filterLabel}>Class</span>
          <CustomSelect
            value={classFilter}
            onChange={(v) => {
              setClassFilter(v as ClassChoice);
              // A local view of a class the tab no longer loads would be blank.
              if (v !== "All") setClassView("All");
            }}
            options={[
              { label: "All classes", value: "All" },
              { label: CLASS_SHORT[0], value: "1" },
              { label: CLASS_SHORT[1], value: "2" },
              { label: CLASS_SHORT[2], value: "3" },
            ]}
          />
        </div>

        {loading && data && <span className={styles.updating}>Updating…</span>}
        <span className={styles.spacer} />
        {filterChips(true)}
      </div>
    ) : activeTab === "Prescriptive" ? (
      <div className={styles.filterRow}>
        {rangeControl}
        <span className={styles.spacer} />
        {filterChips(false)}
      </div>
    ) : null;

  return (
    <section className={`${styles.page} viz-emissions nc-em-page`}>
      <PageHeader accent="emissions" icon={Leaf} title="Emissions Overview" subtitle="Vehicle emissions and air quality trends across NLEX" />
      {modeTabs}
      {filterBar}

      {activeTab === "Predictive" && (
        <div className={styles.modeStage} key="Predictive">
          <div className={styles.spanFull}><PredictiveEmissionChart /></div>
          {/* The diagram's second Emission Forecasting box. Below the CO2
              panel rather than beside it: the fleet mix is what DRIVES the
              emission forecast, so it reads as the explanation of the chart
              above rather than a competing headline. */}
          <div className={styles.spanFull}><FleetMixForecastChart /></div>
        </div>
      )}

      {activeTab === "Prescriptive" && (
        <div className={styles.modeStage} key="Prescriptive">
          {/* Ranked action cards, then the evidence card (title, chart, basis).
              The panel draws both, so its loading, error and no-data states
              keep the card's title. It reads the Range exactly as before. */}
          <PrescriptiveEmissionsPanel
            months={rangeMode === "custom" ? "12" : rangeMode}
            from={rangeMode === "custom" ? customFrom : undefined}
            to={rangeMode === "custom" ? customTo : undefined}
          />
        </div>
      )}

      {activeTab === "Descriptive" && (
        <div className={styles.modeStage} key="Descriptive">
          {/* KPI strip: answer, context, method (the ⓘ) on every tile */}
          <div className={`${styles.kpiRow} ds-rise nc-em-kpis`}>
            <article className={styles.kpiTile}>
              <span className={styles.kpiIcon} aria-hidden="true"><Leaf size={15} /></span>
              <h3>Total CO₂ (Modeled)<InfoTooltip text="Tonnes of CO₂ over the Range: the hourly toll counts at every exit × that exit's segment length × the DENR/DOTC factor for each vehicle class. Modeled, not a sensor reading — and the same record the CO₂ forecast is trained on, so the two agree." /></h3>
              <div className={styles.kpiValue} title={data ? `${fmtInt(data.kpis.totalCo2T)} tonnes` : undefined}>
                {kpiValue(data ? `${fmtCompact(data.kpis.totalCo2T)} t` : null)}
              </div>
              <p className={styles.kpiHint}>
                {derived ? (
                  <span className={derived.deltaPct <= 0 ? styles.deltaUp : styles.deltaDown}>{fmtPct(derived.deltaPct)}</span>
                ) : "—"}{" "}
                vs previous period
              </p>
            </article>
            <article className={styles.kpiTile}>
              <span className={styles.kpiIcon} aria-hidden="true"><CalendarClock size={15} /></span>
              <h3>Avg Daily CO₂<InfoTooltip text="Modeled CO₂ divided by the number of days in the Range." /></h3>
              <div className={styles.kpiValue}>{kpiValue(derived ? `${fmtInt(derived.avgDailyT)} t` : null)}</div>
              <div className={`${styles.sparkBox} nc-em-spark`}>
                {sparkOption && <ReactECharts option={applyChartTheme(sparkOption, chartTheme)} style={{ width: "100%", height: "100%" }} opts={{ renderer: "canvas" }} />}
              </div>
              {sparkOption && <p className={styles.kpiHint}>7-day rolling mean of daily CO₂</p>}
            </article>
            <article className={styles.kpiTile}>
              <span className={styles.kpiIcon} aria-hidden="true"><Truck size={15} /></span>
              <h3>Heavy-Vehicle Impact<InfoTooltip text="How much of the modeled CO₂ comes from trucks and buses versus their share of traffic — heavy classes emit far more per vehicle." /></h3>
              <div className={styles.kpiValue}>{kpiValue(derived ? `${derived.heavyCo2Pct.toFixed(1)}%` : null)}</div>
              <p className={styles.kpiHint}>
                {derived ? `of CO₂ from just ${derived.heavyVolPct.toFixed(1)}% of traffic` : "—"}
              </p>
            </article>
            <article className={styles.kpiTile}>
              <span className={styles.kpiIcon} aria-hidden="true"><Clock size={15} /></span>
              <h3>Peak Emission Hour<InfoTooltip text="The hour of the day with the highest modeled CO₂, which follows the volume peak weighted by fleet mix." /></h3>
              <div className={styles.kpiValue}>{kpiValue(timeProfile ? fmtHour(timeProfile.peakHour) : null)}</div>
              <p className={styles.kpiHint}>
                {timeProfile ? `${fmt1(timeProfile.allHour[timeProfile.peakHour])} t/day in that hour` : "—"}
              </p>
            </article>
            <article className={styles.kpiTile}>
              <span className={styles.kpiIcon} aria-hidden="true"><Timer size={15} /></span>
              <h3>Delay-Induced CO₂<InfoTooltip text="Idling CO₂ from the queues behind accidents in the Range. Each queue builds while the incident is live and drains as it clears (area λ×T²/2 at that segment's vehicles per hour), so long incidents carry most of it. Moving vehicles' CO₂ does not change with speed in this model: this is the part a delay adds." /></h3>
              <div className={styles.kpiValue}>{kpiValue(data?.kpis.delayCarbonT != null ? `${fmtInt(data.kpis.delayCarbonT)} t` : null)}</div>
              <p className={styles.kpiHint}>
                {data?.kpis.delayCarbonT != null
                  ? `${(data.kpis.delayCarbonPct ?? 0).toFixed(2)}% of CO₂ · ${(data.kpis.delayLongSharePct ?? 0).toFixed(0)}% from ${fmtInt(data.kpis.delayLongIncidents ?? 0)} incidents over 3\u00a0h`
                  : "—"}
              </p>
            </article>
            <article className={styles.kpiTile}>
              <span className={styles.kpiIcon} aria-hidden="true"><Wind size={15} /></span>
              <h3>Measured Air Quality<InfoTooltip text="Latest measured pollutant readings near the corridor, shown alongside the modeled CO₂ for context." /></h3>
              <div className={styles.kpiValue}>
                {kpiValue(data?.kpis.avgAqi != null ? `${data.kpis.avgAqi.toFixed(1)} / 5` : null)}
              </div>
              <p className={styles.kpiHint}>
                {data?.kpis.avgAqi != null
                  ? `${aqiWord(data.kpis.avgAqi)} · avg PM2.5 ${data.kpis.avgPm25 != null ? fmt1(data.kpis.avgPm25) : "—"} µg/m³`
                  : "no station readings in range"}
              </p>
            </article>
          </div>

          {/* Main time series, full width: modeled CO2 trend by class */}
          <article className={`${styles.chartCard} ${styles.chart1} ${styles.hero}`}>
            <div className={styles.chartHead}>
              <div className={styles.headText}>
                <h3>CO₂ Emissions Trend by Vehicle Class<InfoTooltip text="Modeled CO₂ per day, week or month, split by vehicle class so you can see which classes drive the total." /></h3>
                {lastTrend && (
                  <p className="nc-em-answer">
                    <b>{fmtInt(visibleOf(lastTrend))} t</b>
                    <span>CO₂ in the latest {heroPeriod} · {bucketLabelFor(grain)(lastTrend.label)}</span>
                  </p>
                )}
                {lastTrend && (
                  <p className={styles.subtitle}>
                    {lastVsMean != null ? `${fmtPct(lastVsMean)} vs the range average · ` : ""}
                    {filtersNote}
                  </p>
                )}
              </div>
            </div>
            <div className={styles.heroFilters}>
              <div className={styles.heroFilterGroup}>
                <span className={styles.heroFilterLabel}>Show</span>
                <CustomSelect
                  value={classView}
                  onChange={(v) => setClassView(v as ClassChoice)}
                  // Locked once the tab itself is filtered to one class: the other two
                  // series hold nothing at that point, so there is nothing left for
                  // this control to show or hide.
                  disabled={classFilter !== "All"}
                  title={
                    classFilter !== "All"
                      ? "The tab is filtered to one class — set Class back to all to choose what this chart shows"
                      : undefined
                  }
                  options={[
                    { label: "All classes", value: "All" },
                    { label: CLASS_SHORT[0], value: "1" },
                    { label: CLASS_SHORT[1], value: "2" },
                    { label: CLASS_SHORT[2], value: "3" },
                  ]}
                />
              </div>
              <div className={styles.heroFilterDivider} />
              <div className={styles.heroFilterGroup}>
                <span className={styles.heroFilterLabel}>Granularity</span>
                <div className={styles.segmentedSmall}>
                  {(["hourly", "daily", "weekly", "monthly"] as const).map((g) => (
                    <button
                      key={g}
                      className={grain === g ? "active" : ""}
                      aria-pressed={grain === g}
                      disabled={(g === "hourly" && !hourlyAvailable) || Boolean(grainBlockedReason(g, spanDays))}
                      title={
                        g === "hourly" && !hourlyAvailable
                          ? "Hourly detail is available for ranges up to 2 weeks"
                          : grainBlockedReason(g, spanDays) ?? undefined
                      }
                      onClick={() => setGrain(g)}
                    >
                      {grain === g && <svg width="10" height="10" viewBox="0 0 16 16" fill="none" style={{ marginRight: 4, marginBottom: -1 }}><path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                      {g.charAt(0).toUpperCase() + g.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className={styles.chartBody}>{chartFrame(trendOption, "No emissions data for the selected range", onTrendClick)}</div>
          </article>

          {/* Breakdowns, two columns: when + who */}
          <article className={`${styles.chartCard} ${styles.chart2} nc-em-half`}>
            <div className={styles.chartHead}>
              <div className={styles.headText}>
                <h3>When Emissions Happen<InfoTooltip text="Modeled CO₂ by hour of day and day of week — when the corridor's emissions concentrate." /></h3>
                {timeProfile && (
                  <p className="nc-em-answer">
                    <b>{fmtHour(timeProfile.peakHour)}</b>
                    <span>peak hour, all days</span>
                  </p>
                )}
                {timeTakeaway && <p className={styles.subtitle}>{timeTakeaway}</p>}
              </div>
              <div className={styles.segmentedSmall}>
                {(["hour", "dow"] as const).map((v) => (
                  <button key={v} className={timeView === v ? "active" : ""} onClick={() => setTimeView(v)} aria-pressed={timeView === v}>
                    {timeView === v && <svg width="10" height="10" viewBox="0 0 16 16" fill="none" style={{ marginRight: 4, marginBottom: -1 }}><path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                    {v === "hour" ? "By hour" : "By day"}
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.chartBody}>{chartFrame(timeOption, "No data for the selected range", onTimeClick)}</div>
          </article>

          <article className={`${styles.chartCard} ${styles.chart3} nc-em-half`}>
            <div className={styles.chartHead}>
              <div className={styles.headText}>
                <h3>Fleet Mix vs Pollution Load<InfoTooltip text="Each vehicle class's share of traffic next to its share of CO₂ — the gap shows which classes pollute out of proportion to their numbers." /></h3>
                {fleetTakeaway && derived && (
                  <p className="nc-em-answer">
                    <b>{derived.heavyCo2Pct.toFixed(1)}%</b>
                    <span>of CO₂ from heavy vehicles (Class 2–3)</span>
                  </p>
                )}
                {fleetTakeaway && <p className={styles.subtitle}>{fleetTakeaway}</p>}
              </div>
            </div>
            <div className={styles.chartBody}>{chartFrame(fleetOption, "No data for the selected range", onFleetClick)}</div>
          </article>

          {/* where it is heading + measured reality */}
          <article className={`${styles.chartCard} ${styles.chart4} nc-em-half`}>
            <div className={styles.chartHead}>
              <div className={styles.headText}>
                <h3>Heavy-Vehicle Share of CO₂<InfoTooltip text="The fraction of modeled CO₂ attributable to heavy vehicles over the Range." /></h3>
                {heavyShareTakeaway && lastShare != null && (
                  <p className="nc-em-answer">
                    <b>{lastShare.toFixed(1)}%</b>
                    <span>now, latest {heroPeriod}</span>
                  </p>
                )}
                {heavyShareTakeaway && <p className={styles.subtitle}>{heavyShareTakeaway}</p>}
              </div>
            </div>
            <div className={styles.chartBody}>{chartFrame(heavyShareOption, "No data for the selected range", onHeavyShareClick)}</div>
          </article>

          <article className={`${styles.chartCard} ${styles.chart5} nc-em-half`}>
            <div className={styles.chartHead}>
              <div className={styles.headText}>
                <h3>Measured Air Quality by Month<InfoTooltip text="Monthly measured pollutant levels near the corridor, for comparison against the modeled emissions." /></h3>
                {aqiGoodPct != null && aqiTotals && (
                  <p className="nc-em-answer">
                    <b>{aqiGoodPct.toFixed(1)}%</b>
                    <span>of readings {AQI_BANDS[0]}</span>
                  </p>
                )}
                {aqiGoodPct != null && aqiTotals && (
                  <p className={styles.subtitle}>
                    {fmtInt(aqiTotals.all)} station readings · {aqiSpan}
                  </p>
                )}
              </div>
            </div>
            <div className={styles.chartBody}>{chartFrame(aqiOption, "No station readings in the selected range", onAqiClick)}</div>
          </article>

          {/* Heat grid: the hour × weekday data the page already loads */}
          <article className={`${styles.chartCard} ${styles.chart1} nc-em-heat`}>
            <div className={styles.chartHead}>
              <div className={styles.headText}>
                <h3>CO₂ by Hour and Weekday<InfoTooltip text="Average modeled CO₂ in each hour of each weekday over the Range: that slot's total divided by the number of those weekdays in the Range." /></h3>
                {heatGrid && (
                  <p className="nc-em-answer">
                    <b>{DOW_LABELS[heatGrid.top.row]} · {fmtHour(heatGrid.top.hour)}</b>
                    <span>busiest hour of the week, {fmt1(heatGrid.top.avg)} t on average</span>
                  </p>
                )}
                {heatGrid && (
                  <p className={styles.subtitle}>
                    Quietest: {DOW_LABELS[heatGrid.low.row]} · {fmtHour(heatGrid.low.hour)}, {fmt1(heatGrid.low.avg)} t · {filtersNote}
                  </p>
                )}
              </div>
            </div>
            <div className={`${styles.chartBody} nc-em-heat-body`}>{chartFrame(heatGrid?.option ?? null, "No data for the selected range")}</div>
            {heatGrid && data && !error && (
              <div className="nc-em-heat-key" aria-hidden="true">
                <span>{fmt1(heatGrid.min)} t</span>
                <i style={{ background: `linear-gradient(90deg, ${heatGrid.colors.join(", ")})` }} />
                <span>{fmt1(heatGrid.max)} t</span>
                <span className="nc-em-heat-unit">avg t CO₂ in the hour</span>
              </div>
            )}
          </article>
        </div>
      )}

      {/* Click-to-inspect detail modal (opened from the Descriptive charts) */}
      {activeTab === "Descriptive" && detail && (
        <div className={styles.detailBackdrop} role="dialog" aria-modal="true" aria-label={detail.title} onClick={() => setDetail(null)}>
          <div className={styles.detailModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.detailAccent} />
            <div className={styles.detailHeader}>
              <div className={styles.detailIcon}><Leaf size={18} aria-hidden="true" /></div>
              <div className={styles.detailTitles}>
                <h3>{detail.title}</h3>
                {detail.subtitle && <p>{detail.subtitle}</p>}
              </div>
              <button className={styles.detailClose} onClick={() => setDetail(null)} aria-label="Close">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M4.5 4.5L13.5 13.5M13.5 4.5L4.5 13.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
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
            {detail.note && (
              <div className={styles.detailFooter}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: 1 }}><circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4" /><path d="M8 7v4M8 5.2v.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
                <p>{detail.note}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
