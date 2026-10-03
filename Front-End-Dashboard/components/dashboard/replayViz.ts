import { useEffect, useRef, useState } from "react";

/* Shared vocabulary for the "what we predicted vs what happened" charts.
 *
 * Two Predictive-tab cards answer the same question — the congestion map over
 * a held-out week, the event card over held-out event days — so they say it the
 * same way: the same two hues, the same meaning for solid and dashed. A reader
 * who learns one chart can read the other.
 *
 * Blue and magenta (Lane Signal, 3 Oct 2026: green now means a clear road, so
 * the forecast line moved off it). Both clear 3:1 against the white panel and
 * the navy dark panel (#3a80e0 3.9 / 4.2, #d1488a 4.2 / 3.9), separate under
 * CVD, and neither collides with the Moving/Heavy/Severe ramp on the
 * congestion grid, so a line is never mistaken for a traffic state.
 * Identity is never carried by colour alone: every chart using these also
 * labels each series and varies its line style. */
export const REPLAY_ACTUAL = "#3a80e0";
export const REPLAY_FORECAST = "#d1488a";

/** Width of an element, tracked live. These charts sit inside a <details>, so
 *  they have no width until the panel opens — a one-shot measure on mount
 *  would render them into a zero-width box. */
export function useMeasuredWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setW(entry.contentRect.width));
    ro.observe(el);
    setW(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/* Shared chrome for every ECharts tooltip on the Predictive tab.
 *
 * `white-space: normal` is the load-bearing part: ECharts sets nowrap on the
 * tooltip container, so a max-width alone never wraps anything - a long note
 * simply ran out of its own box and across the card beside it. `confine`
 * keeps the panel inside the chart rather than letting it escape under the
 * sidebar when a cell near the left edge is hovered. */
export const TOOLTIP_CSS =
  "box-shadow: 0 10px 28px rgba(15,23,42,0.18); border-radius: 10px; max-width: 300px; white-space: normal;";
