"use client";

import type { ChartTheme } from "./chart-theme";

/**
 * Night Corridor chart kit: the series and marker styles every chart shares.
 *
 * applyChartTheme (lib/chart-theme.ts) already gives every chart its
 * furniture: text, axes, gridlines, tooltip, crosshair, legend, bar shape and
 * the one-time draw-in. These helpers cover what cannot be inferred from an
 * option: which line is a forecast, where "now" is, where the data has a gap.
 * They return plain ECharts fragments with literal colours (ECharts cannot
 * read CSS variables), so pass the ChartTheme from useChartTheme().
 *
 * Every helper is presentation only: none of them changes a value.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

/** "#rrggbb" + alpha → "rgba(...)". Leaves rgb()/rgba() strings alone. */
export function withAlpha(color: string, alpha: number): string {
  const hex = color.trim();
  if (!hex.startsWith("#")) return hex;
  const full = hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex;
  const n = parseInt(full.slice(1, 7), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Area under a line: fades from 28% at the line to 0% at the base. */
export function areaFade(color: string) {
  return {
    color: {
      type: "linear",
      x: 0,
      y: 0,
      x2: 0,
      y2: 1,
      colorStops: [
        { offset: 0, color: withAlpha(color, 0.28) },
        { offset: 1, color: withAlpha(color, 0) },
      ],
    },
  };
}

/** A measured line: 2 px. Smooth only where the data is continuous. */
export function lineStyle(color: string, smooth = false) {
  return { smooth, showSymbol: false, symbolSize: 6, lineStyle: { width: 2, color }, itemStyle: { color } };
}

/** A forecast line: the same 2 px, dashed, so it can never pass for history. */
export function forecastLineStyle(color: string) {
  return { showSymbol: false, symbolSize: 6, lineStyle: { width: 2, color, type: "dashed" as const }, itemStyle: { color } };
}

/** A confidence band's fill: 18%, no border. */
export function bandStyle(color: string) {
  return { lineStyle: { opacity: 0, width: 0 }, areaStyle: { color: withAlpha(color, 0.18) }, symbol: "none", showSymbol: false };
}

/**
 * The "now" marker: a thin vertical line in primary ink labelled NOW.
 * Put it in a series' markLine. `x` is the axis value of the present moment.
 */
export function nowMarkLine(t: ChartTheme, x: string | number) {
  return {
    silent: true,
    symbol: ["none", "none"],
    animation: false,
    lineStyle: { color: t.ink, width: 1, type: "solid" as const, opacity: 0.85 },
    label: {
      formatter: "NOW",
      position: "insideEndTop" as const,
      color: t.ink,
      fontFamily: t.fontFamily,
      fontSize: 10,
      fontWeight: 600,
    },
    data: [{ xAxis: x }],
  };
}

let hatchCache: { dark: HTMLCanvasElement | null; light: HTMLCanvasElement | null } = { dark: null, light: null };

function hatchCanvas(isDark: boolean): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const key = isDark ? "dark" : "light";
  if (hatchCache[key]) return hatchCache[key];
  const c = document.createElement("canvas");
  c.width = c.height = 10;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.strokeStyle = isDark ? "rgba(244, 241, 234, 0.14)" : "rgba(11, 18, 32, 0.14)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-2, 12);
  ctx.lineTo(12, -2);
  ctx.moveTo(-2, 2);
  ctx.lineTo(2, -2);
  ctx.moveTo(8, 12);
  ctx.lineTo(12, 8);
  ctx.stroke();
  hatchCache = { ...hatchCache, [key]: c };
  return c;
}

/**
 * Gap ranges in the data, drawn as hatched bands labelled "No data".
 * Put it in a series' markArea. The line itself must not interpolate across
 * the gap (leave the gap's points null and keep connectNulls off).
 */
export function gapMarkArea(t: ChartTheme, ranges: [string | number, string | number][], label = "No data") {
  const img = hatchCanvas(t.isDark);
  return {
    silent: true,
    itemStyle: { color: img ? { image: img, repeat: "repeat" } : (t.isDark ? "rgba(244,241,234,0.04)" : "rgba(11,18,32,0.04)") } as any,
    label: { show: true, position: "insideTop" as const, color: t.text, fontFamily: t.fontFamily, fontSize: 10, fontWeight: 600, formatter: label },
    data: ranges.map(([a, b]) => [{ xAxis: a }, { xAxis: b }]),
  };
}

/** Thousands separators for axes and tooltips, with an optional unit. */
export function fmtAxis(unit?: string, digits = 0) {
  const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: digits });
  return (v: number | string) => {
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) return String(v);
    return unit ? `${nf.format(n)} ${unit}` : nf.format(n);
  };
}
