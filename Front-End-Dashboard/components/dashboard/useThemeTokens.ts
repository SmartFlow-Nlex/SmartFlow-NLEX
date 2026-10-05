"use client";

import { useEffect, useState } from "react";

/**
 * Reads the app's CSS theme tokens as literal colour values.
 *
 * Plain DOM styling can use `var(--bg-surface)` directly, but ECharts resolves
 * nothing — it needs a real colour string. Hardcoding one meant the chart stayed
 * on the light palette in dark mode: white tooltips, near-black axis labels on a
 * near-black card, and a bright legend strip.
 *
 * Re-reads on both ways the theme can change:
 *   - an explicit choice, which sets data-theme on <html>
 *   - the "System" setting, which follows prefers-color-scheme with no attribute
 */

export type ThemeTokens = {
  isDark: boolean;
  surface: string;
  surfaceHover: string;
  body: string;
  border: string;
  borderStrong: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  chartText: string;
  chartAxis: string;
  chartSplit: string;
  tooltipBg: string;
  tooltipText: string;
};

/* Night Corridor dark is the default theme, so the pre-mount fallback is dark. */
const FALLBACK: ThemeTokens = {
  isDark: true,
  surface: "rgba(10, 16, 30, 0.86)",
  surfaceHover: "rgba(16, 24, 44, 0.9)",
  body: "#03060d",
  border: "rgba(255, 255, 255, 0.08)",
  borderStrong: "rgba(255, 255, 255, 0.12)",
  textPrimary: "#f4f1ea",
  textSecondary: "#b9c2d3",
  textMuted: "#8590a6",
  chartText: "#8590a6",
  chartAxis: "rgba(255, 255, 255, 0)",
  chartSplit: "rgba(255, 255, 255, 0.06)",
  tooltipBg: "rgba(14, 22, 40, 0.96)",
  tooltipText: "#f4f1ea",
};

function read(): ThemeTokens {
  if (typeof window === "undefined") return FALLBACK;
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string, fb: string) => cs.getPropertyValue(name).trim() || fb;

  const attr = document.documentElement.getAttribute("data-theme");
  const isDark =
    attr === "dark" ||
    (attr !== "light" && window.matchMedia?.("(prefers-color-scheme: dark)").matches);

  return {
    isDark: Boolean(isDark),
    surface: v("--bg-surface", FALLBACK.surface),
    surfaceHover: v("--bg-surface-hover", FALLBACK.surfaceHover),
    body: v("--bg-body", FALLBACK.body),
    border: v("--border-default", FALLBACK.border),
    borderStrong: v("--border-strong", FALLBACK.borderStrong),
    textPrimary: v("--text-primary", FALLBACK.textPrimary),
    textSecondary: v("--text-secondary", FALLBACK.textSecondary),
    textMuted: v("--text-muted", FALLBACK.textMuted),
    chartText: v("--chart-text", FALLBACK.chartText),
    chartAxis: v("--chart-axis", FALLBACK.chartAxis),
    chartSplit: v("--chart-split", FALLBACK.chartSplit),
    tooltipBg: v("--chart-tooltip-bg", FALLBACK.tooltipBg),
    tooltipText: v("--chart-tooltip-text", FALLBACK.tooltipText),
  };
}

export function useThemeTokens(): ThemeTokens {
  // Start from the light fallback so server and first client render agree;
  // the effect corrects it before paint matters.
  const [tokens, setTokens] = useState<ThemeTokens>(FALLBACK);

  useEffect(() => {
    const sync = () => setTokens(read());
    sync();

    const mo = new MutationObserver(sync);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });

    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    mq?.addEventListener?.("change", sync);

    return () => {
      mo.disconnect();
      mq?.removeEventListener?.("change", sync);
    };
  }, []);

  return tokens;
}

/** Zone tints. The light values wash out on a dark card, so they are lifted. */
export function zoneTints(isDark: boolean) {
  // One quiet ramp instead of blue / orange / green washes, which read as road
  // states. Past is near-plain, the held-out test window a faint neutral, and
  // the forecast a faint expressway-blue tint (Night Corridor values).
  return isDark
    ? {
        past: "rgba(244, 241, 234, 0.02)",
        present: "rgba(244, 241, 234, 0.05)",
        future: "rgba(92, 122, 255, 0.10)",
        divider: "rgba(244, 241, 234, 0.4)",
      }
    : {
        past: "rgba(11, 18, 32, 0.015)",
        present: "rgba(11, 18, 32, 0.045)",
        future: "rgba(54, 96, 255, 0.07)",
        divider: "rgba(11, 18, 32, 0.4)",
      };
}
