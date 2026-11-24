"use client";

import { useEffect, useRef } from "react";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import { useChartTheme, applyChartTheme, type ChartTheme } from "../../lib/chart-theme";

type Props = {
  option: EChartsOption;
  /** Pixels, or "100%" to fill a sized parent. */
  height?: number | string;
  /** ECharts event handlers, e.g. `{ click: (p) => ... }` for drill-downs. */
  onEvents?: Record<string, (params: never) => void>;
  /** Adjusts the theme for this chart only (e.g. brighter dark-mode text). */
  themeTweak?: (t: ChartTheme) => ChartTheme;
  /** Hands back the ECharts instance, for legends that drive the chart. */
  onChartReady?: (chart: unknown) => void;
};

type Sized = { getWidth(): number; getHeight(): number; resize(o?: { width: "auto"; height: "auto" }): void; isDisposed?(): boolean };

export default function DashboardChart({ option, height = 260, onEvents, themeTweak, onChartReady }: Props) {
  // Themed here rather than at each call site, so every chart drawn through this
  // component — including the predictive ones — follows light/dark automatically.
  const base = useChartTheme();
  const chartTheme = themeTweak ? themeTweak(base) : base;

  /* A chart that fills its parent ("100%") must follow that parent's size (20 Nov 2026). echarts-for-react skips the
     first size change it hears of and only starts listening once the chart is built, so a parent that changed size
     while the chart was being built (the forecast cards' summary column loading beside it) left the canvas at its
     first size, spilling over what sits under the slot. Charts with a fixed pixel height are left to the library. */
  const ref = useRef<ReactECharts>(null);
  const fills = typeof height === "string";
  const fit = () => {
    const el = (ref.current as unknown as { ele?: HTMLElement } | null)?.ele;
    const chart = ref.current?.getEchartsInstance() as unknown as Sized | undefined;
    if (!el || !chart || chart.isDisposed?.()) return;
    if (Math.abs(chart.getWidth() - el.clientWidth) > 1 || Math.abs(chart.getHeight() - el.clientHeight) > 1) {
      // "auto" on both: the library builds the chart with its first size fixed in pixels, which a bare resize() keeps.
      chart.resize({ width: "auto", height: "auto" });
    }
  };
  const fitRef = useRef(fit);
  fitRef.current = fit;
  useEffect(() => {
    if (!fills || typeof ResizeObserver === "undefined") return;
    const el = (ref.current as unknown as { ele?: HTMLElement } | null)?.ele;
    if (!el) return;
    const ro = new ResizeObserver(() => fitRef.current());
    ro.observe(el);
    return () => ro.disconnect();
  }, [fills]);

  return (
    <ReactECharts
      ref={ref}
      option={applyChartTheme(option, chartTheme)}
      notMerge
      lazyUpdate
      style={{ width: "100%", height }}
      opts={{ renderer: "canvas" }}
      onEvents={onEvents}
      onChartReady={(c) => {
        if (fills) requestAnimationFrame(() => fitRef.current());
        onChartReady?.(c);
      }}
    />
  );
}
