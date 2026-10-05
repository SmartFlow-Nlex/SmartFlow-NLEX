"use client";

/**
 * Night Corridor heat grids for the incident pages.
 *
 * Presentation only: both grids re-draw numbers the page has already loaded
 * and fetch nothing of their own.
 *
 *  - HourDayHeatmap (Descriptive): /api/incident/analytics' `heatmap` (the same
 *    Hour x Day-of-week table "When Incidents Happen" draws its Weekday/Weekend
 *    lines from), averaged per day of that weekday in the Range, the same
 *    normalisation that chart and the Patrol Alert Schedule use.
 *  - HourSourceHeatmap (/incident/hourly): the day's per-hour Road / Moto /
 *    Stalled counts, the same figures the chart tooltip lists per hour.
 *
 * Cells with no data are drawn in a flat no-data grey and say so in the
 * tooltip; they are never drawn as zero.
 */

import type { EChartsOption } from "echarts";
import DashboardChart from "./DashboardChart";
import { useChartTheme } from "../../lib/chart-theme";
import { withAlpha } from "../../lib/chart-kit";
import { useThemeTokens } from "./useThemeTokens";

const fmtHour = (h: number) => (h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`);
const fmtInt = (n: number) => Math.round(n).toLocaleString("en-US");
const fmt1 = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** The incident magnitude ramp, literal for ECharts. Light runs pale to deep;
 *  dark runs dim to bright so quiet cells recede into the card. Mirrors
 *  --inc-heat-lo / --inc-heat-hi in app/styles/nc-incident.css. */
export function incidentHeatRamp(isDark: boolean): string[] {
  return isDark
    ? ["#241d4f", "#30276a", "#43358f", "#5a46b5", "#7a66db", "#a596f3", "#d0c6ff"]
    : ["#e6e1f9", "#cfc6f4", "#b0a2ec", "#8f7ce2", "#7055d3", "#573bb8", "#45299e"];
}

function HeatKey({ ramp, min, max, unit, showNone }: { ramp: string[]; min: string; max: string; unit: string; showNone?: boolean }) {
  return (
    <div className="inc-heat-key" aria-hidden="true">
      <span>{min}</span>
      <i style={{ background: `linear-gradient(90deg, ${ramp.join(", ")})` }} />
      <span>
        {max} {unit}
      </span>
      {showNone && <span className="inc-heat-none">No data</span>}
    </div>
  );
}

const DOW_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function HourDayHeatmap({
  heatmap,
  range,
}: {
  heatmap: { dow: number; hour: number; v: number }[];
  range: { from: string; to: string };
}) {
  const chartTheme = useChartTheme();
  const T = useThemeTokens();
  const ramp = incidentHeatRamp(chartTheme.isDark);

  // How many of each weekday fall in the Range, so a cell is "incidents per
  // Friday at 5 PM", not a raw sum that favours whichever weekday occurs most.
  const dowCount = [0, 0, 0, 0, 0, 0, 0];
  const end = new Date(`${range.to}T00:00:00`);
  for (const d = new Date(`${range.from}T00:00:00`); d <= end; d.setDate(d.getDate() + 1)) dowCount[d.getDay()]++;
  const totals: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const r of heatmap) totals[r.dow][r.hour] += r.v;

  const cells: [number, number, number][] = [];
  const empty: [number, number, number][] = [];
  let max = 0;
  let best = null as { row: number; hour: number; avg: number } | null;
  DOW_ORDER.forEach((dow, row) => {
    for (let h = 0; h < 24; h++) {
      if (dowCount[dow] === 0) {
        empty.push([h, row, 1]);
        continue;
      }
      const avg = totals[dow][h] / dowCount[dow];
      cells.push([h, row, Number(avg.toFixed(2))]);
      if (avg > max) max = avg;
      if (!best || avg > best.avg) best = { row, hour: h, avg };
    }
  });
  const missingDays = DOW_ORDER.map((dow, i) => (dowCount[dow] === 0 ? DOW_LABELS[i] : null)).filter(Boolean) as string[];
  const noData = withAlpha(T.textMuted, 0.16);

  const option: EChartsOption = {
    grid: { left: 44, right: 12, top: 6, bottom: 28 },
    xAxis: {
      type: "category",
      data: Array.from({ length: 24 }, (_, h) => fmtHour(h)),
      axisLabel: { interval: 2 },
      splitLine: { show: false },
    },
    yAxis: { type: "category", data: DOW_LABELS, inverse: true, splitLine: { show: false } },
    // ECharts needs a visualMap for every heatmap series: the ramp for the
    // data, and a flat no-data grey for the cells that have no reading.
    visualMap: [
      { show: false, type: "continuous", min: 0, max: Math.max(max, 0.01), dimension: 2, seriesIndex: 0, inRange: { color: ramp } },
      { show: false, type: "piecewise", dimension: 2, seriesIndex: 1, pieces: [{ min: 0, max: 2, color: noData }] },
    ],
    tooltip: {
      trigger: "item",
      formatter: (p: unknown) => {
        const { value, seriesIndex } = p as { value: [number, number, number]; seriesIndex: number };
        const [h, row] = value;
        const dow = DOW_ORDER[row];
        const label = `<b>${DOW_LABELS[row]} · ${fmtHour(h)} – ${fmtHour((h + 1) % 24)}</b>`;
        if (seriesIndex === 1) return `${label}<br/>No ${DOW_LABELS[row]} in this Range`;
        return `${label}<br/>${fmt1(totals[dow][h] / dowCount[dow])} incidents per ${DOW_LABELS[row]} on average<br/><span style="color:var(--text-muted)">${fmtInt(totals[dow][h])} total across ${fmtInt(dowCount[dow])} ${DOW_LABELS[row]}s</span>`;
      },
    },
    series: [
      {
        name: "Avg incidents per day",
        type: "heatmap",
        data: cells,
        itemStyle: { borderColor: T.surface, borderWidth: 2, borderRadius: 3 },
        emphasis: { itemStyle: { borderColor: T.textPrimary, borderWidth: 1 } },
      },
      {
        name: "No data",
        type: "heatmap",
        data: empty,
        itemStyle: { borderColor: T.surface, borderWidth: 2 },
      },
    ],
  };

  return (
    <>
      {best && (
        <div className="inc-answer inc-chart-answer">
          <span className="inc-answer-value">
            {DOW_LABELS[best.row]} {fmtHour(best.hour)}
          </span>
          <span className="inc-answer-label">
            busiest hour of the week · <b>{fmt1(best.avg)}</b> incidents per {DOW_LABELS[best.row]} on average
          </span>
        </div>
      )}
      <DashboardChart option={option} height={248} />
      <HeatKey ramp={ramp} min="0" max={fmt1(max)} unit="incidents / day" showNone={missingDays.length > 0} />
      {missingDays.length > 0 && <p className="inc-caption">No {missingDays.join(", ")} in this Range, so those rows are greyed out as no data.</p>}
    </>
  );
}

type HourRow = { hour: number; road: number; moto: number; stalled: number; total: number; isWet: boolean | null };
type SourceKey = "road" | "moto" | "stalled";

export function HourSourceHeatmap({
  hours,
  passes,
  hasIncidentLog,
  covered,
  sliceLabel,
}: {
  hours: HourRow[];
  /** The page's own weather-slice rule: an hour outside the slice has no cell. */
  passes: (h: HourRow) => boolean;
  hasIncidentLog: boolean;
  covered: Record<SourceKey, boolean>;
  /** "wet" | "dry" when a slice is active, for the tooltip. */
  sliceLabel: string | null;
}) {
  const chartTheme = useChartTheme();
  const T = useThemeTokens();
  const ramp = incidentHeatRamp(chartTheme.isDark);
  const ROWS: { key: SourceKey; label: string }[] = [
    { key: "road", label: "Road crashes" },
    { key: "moto", label: "Motorcycle crashes" },
    { key: "stalled", label: "Stalled vehicles" },
  ];

  const cells: [number, number, number][] = [];
  const empty: [number, number, number][] = [];
  let max = 0;
  const sums: Record<SourceKey, number> = { road: 0, moto: 0, stalled: 0 };
  ROWS.forEach((r, row) => {
    hours.forEach((h, i) => {
      if (!hasIncidentLog || !covered[r.key] || !passes(h)) {
        empty.push([i, row, 1]);
        return;
      }
      const v = h[r.key];
      cells.push([i, row, v]);
      sums[r.key] += v;
      if (v > max) max = v;
    });
  });
  const lead = ROWS.filter((r) => hasIncidentLog && covered[r.key]).sort((a, b) => sums[b.key] - sums[a.key])[0];
  const noData = withAlpha(T.textMuted, 0.16);

  const reasonFor = (row: number, i: number) => {
    const r = ROWS[row];
    if (!hasIncidentLog) return "No incident log covers this date";
    if (!covered[r.key]) return `${r.label} are not logged this far`;
    if (!passes(hours[i])) return hours[i].isWet === null ? "No weather reading for this hour" : `Outside the ${sliceLabel ?? ""} slice`;
    return "";
  };

  const option: EChartsOption = {
    grid: { left: 128, right: 12, top: 6, bottom: 44 },
    xAxis: {
      type: "category",
      data: hours.map((h) => fmtHour(h.hour)),
      axisLabel: { interval: 1, rotate: 45 },
      splitLine: { show: false },
    },
    yAxis: { type: "category", data: ROWS.map((r) => r.label), inverse: true, splitLine: { show: false } },
    visualMap: [
      { show: false, type: "continuous", min: 0, max: Math.max(max, 1), dimension: 2, seriesIndex: 0, inRange: { color: ramp } },
      { show: false, type: "piecewise", dimension: 2, seriesIndex: 1, pieces: [{ min: 0, max: 2, color: noData }] },
    ],
    tooltip: {
      trigger: "item",
      formatter: (p: unknown) => {
        const { value, seriesIndex } = p as { value: [number, number, number]; seriesIndex: number };
        const [i, row] = value;
        const h = hours[i];
        const head = `<b>${fmtHour(h.hour)}</b> · ${ROWS[row].label}`;
        if (seriesIndex === 1) return `${head}<br/>No data: ${reasonFor(row, i)}`;
        return `${head}<br/>${fmtInt(value[2])} incident${value[2] === 1 ? "" : "s"}`;
      },
    },
    series: [
      {
        name: "Incidents",
        type: "heatmap",
        data: cells,
        itemStyle: { borderColor: T.surface, borderWidth: 2, borderRadius: 3 },
        emphasis: { itemStyle: { borderColor: T.textPrimary, borderWidth: 1 } },
      },
      {
        name: "No data",
        type: "heatmap",
        data: empty,
        itemStyle: { borderColor: T.surface, borderWidth: 2 },
      },
    ],
  };

  return (
    <>
      {lead ? (
        <div className="inc-answer inc-chart-answer">
          <span className="inc-answer-value">{fmtInt(sums[lead.key])}</span>
          <span className="inc-answer-label">
            <b>{lead.label}</b>, the largest source in view
          </span>
        </div>
      ) : (
        <p className="inc-context" style={{ margin: "-4px 0 12px" }}>
          {hasIncidentLog ? "None of the three sources is logged this far" : "No incident log covers this date"}, so every cell is greyed out as no data.
        </p>
      )}
      <DashboardChart option={option} height={200} />
      <HeatKey ramp={ramp} min="0" max={fmtInt(max)} unit="incidents" showNone={empty.length > 0} />
    </>
  );
}
