"use client";

import { useEffect, useState } from "react";

/**
 * Chart colours that follow the active theme.
 *
 * ECharts bakes colours into its option object, so it has no idea a CSS variable
 * changed. Left alone, every plot keeps near-black axis text and pale gridlines
 * after switching to dark, which is exactly the eye-strain problem the theme is
 * meant to solve. This reads the current values out of the stylesheet and
 * re-reads them when the theme changes, so options rebuild with the right ink.
 *
 * Series hues (blue, orange, the class ramp) are deliberately NOT themed: they
 * are categorical identity and must mean the same thing in both modes. Only the
 * chart's furniture — text, axes, gridlines, tooltips — changes.
 */

export type ChartTheme = {
  text: string;
  axis: string;
  split: string;
  tooltipBg: string;
  tooltipText: string;
  tooltipBorder: string;
  /** Lightest step of a sequential ramp; near-white in light, near-black in dark. */
  seqLightest: string;
  /** The resolved interface face (next/font hashes the family name). */
  fontFamily: string;
  /** Primary ink, for the "now" marker and crosshair labels. */
  ink: string;
  isDark: boolean;
};

/* Night Corridor dark is the default, so the pre-mount fallback is dark too. */
const FALLBACK: ChartTheme = {
  text: "#8590a6",
  axis: "rgba(255, 255, 255, 0)",
  split: "rgba(255, 255, 255, 0.06)",
  tooltipBg: "rgba(14, 22, 40, 0.96)",
  tooltipText: "#f4f1ea",
  tooltipBorder: "rgba(255, 255, 255, 0.12)",
  seqLightest: "#0e1628",
  fontFamily: "Outfit, ui-sans-serif, system-ui, sans-serif",
  ink: "#f4f1ea",
  isDark: true,
};

function read(): ChartTheme {
  if (typeof window === "undefined") return FALLBACK;
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string, fb: string) => cs.getPropertyValue(name).trim() || fb;
  const explicit = document.documentElement.getAttribute("data-theme");
  const isDark =
    explicit === "dark" ||
    (explicit !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  return {
    text: v("--chart-text", FALLBACK.text),
    axis: v("--chart-axis", FALLBACK.axis),
    split: v("--chart-split", FALLBACK.split),
    tooltipBg: v("--chart-tooltip-bg", FALLBACK.tooltipBg),
    tooltipText: v("--chart-tooltip-text", FALLBACK.tooltipText),
    tooltipBorder: v("--chart-tooltip-border", FALLBACK.tooltipBorder),
    seqLightest: v("--chart-seq-lightest", FALLBACK.seqLightest),
    fontFamily: getComputedStyle(document.body).fontFamily || FALLBACK.fontFamily,
    ink: v("--text-primary", FALLBACK.ink),
    isDark,
  };
}

/**
 * Current chart theme, refreshed on an explicit change and on OS changes while
 * the setting is "System". Include the returned object in a chart option's
 * dependency list so the option rebuilds.
 */
export function useChartTheme(): ChartTheme {
  const [theme, setTheme] = useState<ChartTheme>(FALLBACK);

  useEffect(() => {
    const refresh = () => setTheme(read());
    refresh();

    window.addEventListener("smartflow:themechange", refresh);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", refresh);

    return () => {
      window.removeEventListener("smartflow:themechange", refresh);
      mq.removeEventListener("change", refresh);
    };
  }, []);

  return theme;
}

/**
 * Axis, grid and tooltip defaults to spread into any cartesian ECharts option.
 * Applying these consistently is also what makes the plots look like one system
 * rather than a dozen separately-styled charts.
 *
 * Night Corridor chart kit (DESIGN.md): transparent ground, 11 px axis text in
 * the muted ink, no axis lines or ticks, horizontal gridlines only, a raised
 * hairline tooltip with tabular figures, and a crosshair on time axes.
 */
export function chartBase(t: ChartTheme) {
  const tooltipCss = [
    `box-shadow: 0 24px 60px ${t.isDark ? "rgba(0,0,0,0.55)" : "rgba(20,24,40,0.18)"}`,
    "border-radius: 10px",
    `font-family: ${t.fontFamily}`,
    "font-variant-numeric: tabular-nums",
    "font-weight: 400",
    "line-height: 1.5",
  ].join("; ") + ";";
  return {
    textStyle: { color: t.text, fontFamily: t.fontFamily, fontSize: 11 },
    axisCommon: {
      axisLine: { show: false, lineStyle: { color: t.axis } },
      axisTick: { show: false, lineStyle: { color: t.axis } },
      axisLabel: { color: t.text, fontSize: 11, fontFamily: t.fontFamily },
      splitLine: { lineStyle: { color: t.split, width: 1 } },
      nameTextStyle: { color: t.text, fontSize: 11, fontFamily: t.fontFamily },
    },
    /* Vertical gridlines off: the brief asks for horizontal ones only. */
    xAxisOnly: { splitLine: { show: false } },
    tooltip: {
      backgroundColor: t.tooltipBg,
      borderColor: t.tooltipBorder,
      borderWidth: 1,
      padding: [10, 12],
      textStyle: { color: t.tooltipText, fontFamily: t.fontFamily, fontSize: 15 },
      extraCssText: tooltipCss,
    },
    /* A crosshair on time-series charts (axis-triggered tooltips). */
    axisPointer: {
      type: "cross",
      lineStyle: { color: t.isDark ? "rgba(244,241,234,0.32)" : "rgba(11,18,32,0.3)", type: "dashed", width: 1 },
      crossStyle: { color: t.isDark ? "rgba(244,241,234,0.32)" : "rgba(11,18,32,0.3)", type: "dashed", width: 1 },
      label: { backgroundColor: t.tooltipBg, color: t.tooltipText, borderColor: t.tooltipBorder, borderWidth: 1, fontFamily: t.fontFamily, fontSize: 11 },
    },
    legend: {
      textStyle: { color: t.text, fontFamily: t.fontFamily, fontSize: 11 },
      inactiveColor: t.isDark ? "rgba(244,241,234,0.22)" : "rgba(11,18,32,0.22)",
      icon: "roundRect",
      itemWidth: 14,
      itemHeight: 6,
      itemGap: 14,
    },
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Merges `patch` under `base`, so anything a chart set explicitly wins. */
function underlay(base: any, patch: any): any {
  if (base == null) return patch;
  if (Array.isArray(base)) return base.map((b) => underlay(b, patch));
  if (typeof base !== "object") return base;
  const out: any = { ...patch, ...base };
  for (const k of Object.keys(patch)) {
    if (
      base[k] != null && typeof base[k] === "object" && !Array.isArray(base[k]) &&
      patch[k] != null && typeof patch[k] === "object" && !Array.isArray(patch[k])
    ) {
      out[k] = underlay(base[k], patch[k]);
    }
  }
  return out;
}

/**
 * Applies the theme's furniture (text, axes, gridlines, tooltip) to a chart
 * option without disturbing anything the chart set deliberately.
 *
 * Done once in each page's chartFrame rather than inside sixteen separate option
 * builders — one place to change, and no chart can be forgotten.
 */
export function applyChartTheme<T extends Record<string, any>>(option: T, t: ChartTheme): T {
  const base = chartBase(t);
  const out: any = { ...option };

  out.textStyle = underlay(option.textStyle, base.textStyle);
  if (out.backgroundColor == null) out.backgroundColor = "transparent";
  if (option.xAxis) {
    // Vertical gridlines go only where the chart said nothing about them.
    const noVertical = (a: any) => (a && typeof a === "object" && a.splitLine == null ? { ...a, ...base.xAxisOnly } : a);
    const x = Array.isArray(option.xAxis) ? option.xAxis.map(noVertical) : noVertical(option.xAxis);
    out.xAxis = underlay(x, base.axisCommon);
  }
  if (option.yAxis) out.yAxis = underlay(option.yAxis, base.axisCommon);
  // A chart with no tooltip configured should not gain one.
  if (option.tooltip) {
    const tip = underlay(option.tooltip, base.tooltip);
    if (!Array.isArray(tip) && tip.trigger === "axis") tip.axisPointer = underlay(tip.axisPointer, base.axisPointer);
    out.tooltip = tip;
  }
  if (option.legend) out.legend = underlay(option.legend, base.legend);

  // Draw in once (600 ms); never re-animate when data refreshes, because a
  // number changing must not look like a page load.
  if (out.animationDuration == null) out.animationDuration = 600;
  if (out.animationEasing == null) out.animationEasing = "cubicOut";
  if (out.animationDurationUpdate == null) out.animationDurationUpdate = 0;

  // Bars: 4 px rounded ends and a 40-60% band, unless the chart chose its own.
  // Stacked segments stay square, so a stack does not read as separate pills.
  if (Array.isArray(option.series)) {
    const yCategory = [].concat(option.yAxis ?? []).some((a: any) => a && a.type === "category");
    out.series = option.series.map((s: any) => {
      if (!s || s.type !== "bar") return s;
      const next: any = { ...s };
      if (next.stack == null) {
        next.itemStyle = underlay(s.itemStyle, { borderRadius: yCategory ? [0, 4, 4, 0] : [4, 4, 0, 0] });
      }
      if (next.barWidth == null && next.barCategoryGap == null && next.barMaxWidth == null) next.barCategoryGap = "50%";
      return next;
    });
  }

  return out as T;
}

/* ---------------------------------------------------------------------------
   Per-tab series palettes

   One colour family per analytics tab: blue for Traffic, violet for Incidents,
   teal for Emissions (see the Lane Signal note below). Both modes are selected steps, not an automatic flip.

   Every set below was produced by search and checked with the dataviz
   validator rather than picked by eye, because the constraints conflict and
   eyeballing cannot resolve them. Two findings from that:

   - Three series in ONE hue cannot satisfy the categorical gates. 3:1 contrast
     on white caps the lightest step near OKLCH L 0.68 and the band floors at
     0.43, so three steps land ~0.12 of L apart — against a hard normal-vision
     floor of 15 (roughly 0.15 of L). A search over lightness AND hue found no
     solution for any of the three families.

   - Most of these series are ordinal, not nominal: Class 1/2/3 runs light to
     heavy, air quality runs good to poor. Ordinal takes a one-hue ramp under
     its own rules — monotone lightness, visible step gaps, light end >= 2:1 on
     the surface — and all six ramps pass those cleanly.

   So the ramps below are ordinal by construction. Where a chart has two genuinely
   nominal series (northbound vs southbound, dry vs wet) it takes the OUTER two
   steps, which validate as categorical with a large margin: worst-pair dE 31-38
   against a floor of 15.
   --------------------------------------------------------------------------- */

export type VizTab = "traffic" | "incident" | "emissions";

/* Lane Signal redesign (3 Oct 2026): green, amber and red now belong to road
   state alone (the lane signals), so Incidents moved from amber to violet and
   Emissions from green to teal. Traffic keeps its blue. Every ramp below was
   re-run through the dataviz validator (--ordinal) against #ffffff and the new
   dark surface #0f1f3d: monotone lightness, adjacent dL >= 0.06, single hue,
   light end >= 2:1 (2.03-3.99:1). */
const SERIES_RAMPS: Record<VizTab, { light: [string, string, string]; dark: [string, string, string] }> = {
  traffic:   { light: ["#8ab6f5", "#3f7ad9", "#1d3f8f"], dark: ["#a8c8f8", "#5b8fe6", "#2f5fba"] },
  incident:  { light: ["#b4a7f2", "#7a5fe0", "#45299e"], dark: ["#d0c6ff", "#9d87f5", "#6a50d4"] },
  emissions: { light: ["#5fbcc6", "#1f97a5", "#0a5862"], dark: ["#a6edf2", "#3cc3cf", "#1c8a96"] },
};

/* ---------------------------------------------------------------------------
   NOMINAL series: three categories with no order between them.

   The ramps above are ordinal by construction, and the note explains why three
   steps of one hue cannot pass the categorical gates. That leaves a gap: a
   chart whose three series are genuinely nominal — road crashes vs motorcycle
   crashes vs stalled vehicles, say — has no order to encode and must not be
   given one. Handing it RAMP[0..2] is exactly the case the note rules out, and
   in dark mode those three ambers are near indistinguishable.

   So nominal triples get their own hues, anchored on the tab's colour so the
   page still reads as itself. Checked with the dataviz validator at --pairs
   all, because a reader compares any two lines, not only adjacent ones:

     light  amber/blue/magenta   worst pair dE 12.6 CVD, 20.8 normal
     dark   amber/blue/magenta   worst pair dE 13.1 CVD, 20.7 normal

   Green is deliberately absent: green against amber is dE 1.9 under
   protanopia, so an emissions-led nominal triple cannot be built from the
   tab hue. Emissions has no nominal triple today — its Class 1/2/3 series are
   ordinal and correctly take the ramp — and if one is ever needed it will have
   to lead with a hue other than green. */
/* Lane Signal: the amber and green leads above are retired (road-state hues).
   The one triple that passes every all-pairs gate in both modes without a
   state hue is violet / teal / magenta (validator, --pairs all: light vs
   #ffffff and dark vs #0f1f3d both ALL PASS). Blue cannot join it: on the
   navy dark surface blue and violet collapse under protan/deutan (dE < 4).
   Only Incidents draws a nominal triple today; the other tabs reuse the same
   validated set, led by their nearest hue. */
const NOMINAL_TRIPLES: Record<VizTab, { light: [string, string, string]; dark: [string, string, string] }> = {
  traffic:   { light: ["#0b8db0", "#4a3aa7", "#c2185b"], dark: ["#169bb8", "#8c7ff0", "#d55181"] },
  incident:  { light: ["#4a3aa7", "#0b8db0", "#c2185b"], dark: ["#8c7ff0", "#169bb8", "#d55181"] },
  emissions: { light: ["#0b8db0", "#4a3aa7", "#c2185b"], dark: ["#169bb8", "#8c7ff0", "#d55181"] },
};

/**
 * Three hues for three UNORDERED series, led by the tab's own colour.
 * Use this instead of seriesRamp whenever the series have no natural order;
 * use seriesRamp when they do (Class 1/2/3, good-to-poor air quality).
 */
export function seriesNominal(tab: VizTab, t: ChartTheme): [string, string, string] {
  return t.isDark ? NOMINAL_TRIPLES[tab].dark : NOMINAL_TRIPLES[tab].light;
}

/** The tab's three ordinal steps, lightest first, for the active theme. */
export function seriesRamp(tab: VizTab, t: ChartTheme): [string, string, string] {
  return t.isDark ? SERIES_RAMPS[tab].dark : SERIES_RAMPS[tab].light;
}

/**
 * The two steps to use for a pair of nominal series. Deliberately the outer two
 * rather than adjacent ones — that is what carries the ΔE margin.
 */
/**
 * The ramp for a heat grid.
 *
 * seriesRamp gives three steps, which is right for three lines and wrong for a
 * hundred and sixty-eight cells: interpolated across a grid it put most of the
 * data into a couple of mid blues that have to be stared at to be told apart.
 * Seven steps spanning nearly the full lightness range give adjacent cells
 * something to differ by, and the hue drifts toward indigo at the top so the
 * busiest cells separate on more than lightness alone.
 *
 * Light mode runs pale to deep. Dark mode runs the other way - near-black for
 * the quiet hours so they recede into the surface rather than glowing on it.
 */
export function heatRamp(t: ChartTheme): string[] {
  return t.isDark
    ? ["#13284d", "#1a3866", "#22508e", "#2f6dbb", "#4b90dc", "#86b9ef", "#c4defa"]
    : ["#f2f7fd", "#d3e5f8", "#a8caef", "#74a9e0", "#3f7fca", "#22589e", "#14356b"];
}

export function seriesPair(tab: VizTab, t: ChartTheme): [string, string] {
  const r = seriesRamp(tab, t);
  return [r[2], r[0]];
}
