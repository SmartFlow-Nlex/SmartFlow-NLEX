"use client";

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

export default function DashboardChart({ option, height = 260, onEvents, themeTweak, onChartReady }: Props) {
  // Themed here rather than at each call site, so every chart drawn through this
  // component — including the predictive ones — follows light/dark automatically.
  const base = useChartTheme();
  const chartTheme = themeTweak ? themeTweak(base) : base;

  return (
    <ReactECharts
      option={applyChartTheme(option, chartTheme)}
      notMerge
      lazyUpdate
      style={{ width: "100%", height }}
      opts={{ renderer: "canvas" }}
      onEvents={onEvents}
      onChartReady={onChartReady ? (c) => onChartReady(c) : undefined}
    />
  );
}
