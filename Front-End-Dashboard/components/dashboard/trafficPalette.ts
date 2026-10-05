"use client";

import { useMemo } from "react";
import { useChartTheme, chartBase, type ChartTheme } from "../../lib/chart-theme";

/**
 * Literal colours for the Traffic page's canvas charts (Night Corridor).
 *
 * ECharts draws on a canvas and cannot resolve `var(--…)`, so the road-state
 * colours, the page accent and the surface the heatmap cells sit on are read
 * out of the stylesheet here and re-read whenever useChartTheme refreshes (an
 * explicit theme change or an OS change under "System"). The fallbacks are the
 * DESIGN.md values, used only before mount.
 *
 * Presentation only: nothing here touches a value, only how it is painted.
 */
export type TrafficPalette = {
  isDark: boolean;
  /** The four road-state tokens. These, and only these, colour states. */
  clear: string;
  slow: string;
  congested: string;
  none: string;
  /** Traffic's domain accent (the page accent, as a literal). */
  accent: string;
  /** Model violet: forecast and model labels. */
  model: string;
  /** The opaque card surface, for heatmap cell gaps. */
  surface: string;
  ink: string;
  ink2: string;
  muted: string;
  /** A quiet neutral for "not this" bars and residual buckets. */
  neutral: string;
  /** Fainter still: empty (not yet forecast) cells. */
  blank: string;
  hairline: string;
  tooltipBg: string;
  tooltipBorder: string;
  tooltipText: string;
  /** The theme's tooltip CSS, plus wrapping (ECharts sets nowrap). */
  tooltipCss: string;
};

const DARK = {
  clear: "#2fbf6b", slow: "#f6c544", congested: "#ff5a4a", none: "#586377",
  accent: "#4f8dff", model: "#ab9dff", surface: "#0a1121",
  ink: "#f4f1ea", ink2: "#b9c2d3", muted: "#8590a6",
};
const LIGHT = {
  clear: "#12804a", slow: "#946500", congested: "#c8322a", none: "#7d8799",
  accent: "#2357d8", model: "#5b47c9", surface: "#fdfdfc",
  ink: "#0b1220", ink2: "#3a4458", muted: "#5a6478",
};

function read(t: ChartTheme): TrafficPalette {
  const fb = t.isDark ? DARK : LIGHT;
  const cs = typeof window === "undefined" ? null : getComputedStyle(document.documentElement);
  const v = (name: string, f: string) => (cs?.getPropertyValue(name).trim() || f);
  return {
    isDark: t.isDark,
    clear: v("--signal-clear", fb.clear),
    slow: v("--signal-slow", fb.slow),
    congested: v("--signal-congested", fb.congested),
    none: v("--signal-none", fb.none),
    accent: v("--accent-traffic", fb.accent),
    model: v("--color-purple", fb.model),
    surface: v("--bg-surface-solid", fb.surface),
    ink: v("--text-primary", fb.ink),
    ink2: v("--text-secondary", fb.ink2),
    muted: v("--text-muted", fb.muted),
    neutral: t.isDark ? "rgba(244, 241, 234, 0.24)" : "rgba(11, 18, 32, 0.22)",
    blank: t.isDark ? "rgba(244, 241, 234, 0.05)" : "rgba(11, 18, 32, 0.05)",
    hairline: t.isDark ? "rgba(255, 255, 255, 0.12)" : "rgba(3, 6, 13, 0.14)",
    tooltipBg: t.tooltipBg,
    tooltipBorder: t.tooltipBorder,
    tooltipText: t.tooltipText,
    tooltipCss: `${chartBase(t).tooltip.extraCssText} max-width: 300px; white-space: normal;`,
  };
}

export function useTrafficPalette(): TrafficPalette {
  const t = useChartTheme();
  return useMemo(() => read(t), [t]);
}
