/**
 * One tooltip shape for every heatmap and its gradient legend.
 *
 * The Traffic heatmap reads "<cell>" / "<b>value</b> unit". The Incident grids
 * used their own sentence structure, so hovering a cell here and a cell there
 * said the same thing two ways. Cells and the legend readout both go through
 * these, so the figure and its unit are formatted once.
 */
export const fmtHeatNumber = (v: number, digits = 1) =>
  v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** "2.4 incidents / day" — used by a cell's tooltip and by the legend readout. */
export const heatValue = (v: number, unit: string, digits = 1) => `${fmtHeatNumber(v, digits)} ${unit}`;

/** Cell tooltip: bold title, bold value with unit, then optional muted detail lines. */
export function heatTip(opts: { title: string; value: string; detail?: string[] }): string {
  const detail = (opts.detail ?? [])
    .map((d) => `<br/><span style="color:var(--text-muted)">${d}</span>`)
    .join("");
  return `<b>${opts.title}</b><br/><b>${opts.value}</b>${detail}`;
}

/** Tooltip for a cell with no reading. */
export const heatTipEmpty = (title: string, reason: string) => `<b>${title}</b><br/>No data: ${reason}`;

/** Scrubs a heatmap's first visualMap to a band around `t` (0..1), or resets on null. */
export function scrubHeatmap(chartRef: { current: unknown }, lo: number, hi: number) {
  return (t: number | null) => {
    // Read at call time: the chart instance arrives after the first render.
    const c = chartRef.current as { dispatchAction: (a: Record<string, unknown>) => void } | null;
    if (!c) return;
    if (t == null) {
      c.dispatchAction({ type: "selectDataRange", visualMapIndex: 0, selected: [lo, hi] });
      return;
    }
    // A band, not a point: an exact value would match almost no cell.
    const v = lo + t * (hi - lo);
    const pad = (hi - lo) * 0.08;
    c.dispatchAction({
      type: "selectDataRange",
      visualMapIndex: 0,
      selected: [Math.max(lo, v - pad), Math.min(hi, v + pad)],
    });
  };
}
