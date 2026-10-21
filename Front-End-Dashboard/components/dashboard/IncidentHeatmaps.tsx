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
 *  - HourSourceHeatmap (/incident/hourly): the day's per-hour Accident /
 *    Breakdown counts, the same figures the chart tooltip lists per hour (the
 *    event tables the forecast is trained on, since 19 Oct 2026).
 *
 * Cells with no data are drawn in a flat no-data grey and say so in the
 * tooltip; they are never drawn as zero.
 */

import { memo, useMemo, useRef } from "react";
import type { EChartsOption } from "echarts";
import DashboardChart from "./DashboardChart";
import RampKey from "./RampKey";
import { useChartTheme, liftDarkText } from "../../lib/chart-theme";
import { withAlpha } from "../../lib/chart-kit";
import { heatTip, heatTipEmpty, heatValue, scrubHeatmap } from "../../lib/heat-tooltip";
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

/** The gradient legend: Traffic's interactive key (hover reads out the value and
 *  lights the matching cells), plus this tab's "No data" chip. */
function HeatKey({
  ramp, min, max, unit, digits, showNone, onScrub,
}: { ramp: string[]; min: number; max: number; unit: string; digits: number; showNone?: boolean; onScrub: (t: number | null) => void }) {
  return (
    <div className="inc-heat-legend">
      <RampKey
        colors={ramp}
        min={min}
        max={max}
        format={(v) => heatValue(v, unit, digits)}
        lowLabel="Quieter"
        highLabel="Busier"
        onScrub={onScrub}
      />
      {showNone && <span className="inc-heat-key"><span className="inc-heat-none">No data</span></span>}
    </div>
  );
}

const DOW_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** A cell of the hour x day grid: dow as the API numbers it (0 = Sunday), hour 0-23. */
export type HeatCell = { dow: number; hour: number };

/* Memoised: the page re-renders on every hovered cell (the breakdown under the grid follows it), and
   the chart must not be handed a fresh option each time, or the tooltip under the cursor is reset. */
export const HourDayHeatmap = memo(HourDayHeatmapGrid);

function HourDayHeatmapGrid({
  heatmap,
  range,
  onHoverCell,
  onPickCell,
}: {
  heatmap: { dow: number; hour: number; v: number; accident?: number; breakdown?: number }[];
  range: { from: string; to: string };
  /** The cell under the cursor, or null when it leaves the grid: the page breaks it down below. */
  onHoverCell?: (c: HeatCell | null) => void;
  /** A clicked cell, so the breakdown below can stay on it once the cursor moves off. */
  onPickCell?: (c: HeatCell) => void;
}) {
  const chartTheme = useChartTheme();
  const T = useThemeTokens();
  const ramp = incidentHeatRamp(chartTheme.isDark);
  const chartRef = useRef<unknown>(null);

  /* Cell hover and click, reported to the page (19 Oct 2026, testers IN-8). One stable handler object:
     echarts-for-react disposes and rebuilds the chart whenever onEvents changes identity, which under a
     hover that re-renders the page would wipe the tooltip on every move. The callbacks are read through
     a ref so the object never has to change. globalout fires when the cursor leaves the whole chart, so
     the reported hover cannot stay stuck on the last cell. */
  const cbRef = useRef({ onHoverCell, onPickCell });
  cbRef.current = { onHoverCell, onPickCell };
  const cellEvents = useMemo(() => {
    const cellOf = (p: { seriesIndex?: number; value?: [number, number, number] }) =>
      p.seriesIndex === 0 && p.value ? { dow: DOW_ORDER[p.value[1]], hour: p.value[0] } : null;
    return {
      mouseover: ((p: { seriesIndex?: number; value?: [number, number, number] }) => {
        const c = cellOf(p);
        if (c) cbRef.current.onHoverCell?.(c);
      }) as (p: never) => void,
      globalout: (() => cbRef.current.onHoverCell?.(null)) as (p: never) => void,
      click: ((p: { seriesIndex?: number; value?: [number, number, number] }) => {
        const c = cellOf(p);
        if (c) cbRef.current.onPickCell?.(c);
      }) as (p: never) => void,
    };
  }, []);

  // How many of each weekday fall in the Range, so a cell is "incidents per
  // Friday at 5 PM", not a raw sum that favours whichever weekday occurs most.
  const dowCount = [0, 0, 0, 0, 0, 0, 0];
  const end = new Date(`${range.to}T00:00:00`);
  for (const d = new Date(`${range.from}T00:00:00`); d <= end; d.setDate(d.getDate() + 1)) dowCount[d.getDay()]++;
  const totals: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  const accTotals: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  const brkTotals: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  const hasSplit = heatmap.some((r) => r.accident != null);
  for (const r of heatmap) {
    totals[r.dow][r.hour] += r.v;
    accTotals[r.dow][r.hour] += r.accident ?? 0;
    brkTotals[r.dow][r.hour] += r.breakdown ?? 0;
  }

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
      { show: false, type: "continuous", min: 0, max: Math.max(max, 0.01), dimension: 2, seriesIndex: 0, inRange: { color: ramp }, outOfRange: { color: noData } },
      { show: false, type: "piecewise", dimension: 2, seriesIndex: 1, pieces: [{ min: 0, max: 2, color: noData }] },
    ],
    tooltip: {
      trigger: "item",
      formatter: (p: unknown) => {
        const { value, seriesIndex } = p as { value: [number, number, number]; seriesIndex: number };
        const [h, row] = value;
        const dow = DOW_ORDER[row];
        const title = `${DOW_LABELS[row]} · ${fmtHour(h)} – ${fmtHour((h + 1) % 24)}`;
        if (seriesIndex === 1) return heatTipEmpty(title, `no ${DOW_LABELS[row]} in this Range`);
        // The type split rides in the muted lines, so the value line keeps Traffic's shape (testers IN-8).
        return heatTip({
          title,
          value: `${heatValue(totals[dow][h] / dowCount[dow], "incidents / day")} on average`,
          detail: [
            ...(hasSplit
              ? [`Accidents ${fmt1(accTotals[dow][h] / dowCount[dow])} · Breakdowns ${fmt1(brkTotals[dow][h] / dowCount[dow])} per day`]
              : []),
            `${fmtInt(totals[dow][h])} total across ${fmtInt(dowCount[dow])} ${DOW_LABELS[row]}s · click to keep it below`,
          ],
        });
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
      <DashboardChart
        option={option}
        height={248}
        themeTweak={liftDarkText}
        onChartReady={(c) => { chartRef.current = c; }}
        onEvents={cellEvents}
      />
      <HeatKey ramp={ramp} min={0} max={Math.max(max, 0.01)} unit="incidents / day" digits={1} showNone={missingDays.length > 0} onScrub={scrubHeatmap(chartRef, 0, Math.max(max, 0.01))} />
      {missingDays.length > 0 && <p className="inc-caption">No {missingDays.join(", ")} in this Range, so those rows are greyed out as no data.</p>}
    </>
  );
}

type HourRow = { hour: number; accident: number; breakdown: number; total: number; isWet: boolean | null };
type SourceKey = "accident" | "breakdown";

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
  const chartRef = useRef<unknown>(null);
  const ROWS: { key: SourceKey; label: string }[] = [
    { key: "accident", label: "Accidents" },
    { key: "breakdown", label: "Breakdowns" },
  ];

  const cells: [number, number, number][] = [];
  const empty: [number, number, number][] = [];
  let max = 0;
  const sums: Record<SourceKey, number> = { accident: 0, breakdown: 0 };
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
      { show: false, type: "continuous", min: 0, max: Math.max(max, 1), dimension: 2, seriesIndex: 0, inRange: { color: ramp }, outOfRange: { color: noData } },
      { show: false, type: "piecewise", dimension: 2, seriesIndex: 1, pieces: [{ min: 0, max: 2, color: noData }] },
    ],
    tooltip: {
      trigger: "item",
      formatter: (p: unknown) => {
        const { value, seriesIndex } = p as { value: [number, number, number]; seriesIndex: number };
        const [i, row] = value;
        const h = hours[i];
        const title = `${fmtHour(h.hour)} · ${ROWS[row].label}`;
        if (seriesIndex === 1) return heatTipEmpty(title, reasonFor(row, i));
        return heatTip({ title, value: heatValue(value[2], value[2] === 1 ? "incident" : "incidents", 0) });
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
          {hasIncidentLog ? "Neither source is logged this far" : "No incident log covers this date"}, so every cell is greyed out as no data.
        </p>
      )}
      <DashboardChart option={option} height={200} themeTweak={liftDarkText} onChartReady={(c) => { chartRef.current = c; }} />
      <HeatKey ramp={ramp} min={0} max={Math.max(max, 1)} unit="incidents" digits={0} showNone={empty.length > 0} onScrub={scrubHeatmap(chartRef, 0, Math.max(max, 1))} />
    </>
  );
}
