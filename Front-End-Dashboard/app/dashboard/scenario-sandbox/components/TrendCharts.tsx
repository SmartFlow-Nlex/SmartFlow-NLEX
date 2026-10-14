"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from "react";
import type { Direction } from "../scenarios/adapter";
import type { Baseline } from "../useDirectionSim";
import { TREND_STEP_S, type TrendSample } from "../trends";
import { DIRECTION_NAME } from "./DirectionPill";

/* The readouts over time: four small line charts under the road — speed, throughput, longest queue, CO2 —
 * one line per carriageway, so what a crash costs, and how long the road takes to get over it, can be read
 * rather than watched. Small multiples, not one chart with two axes: the four are in different units, and
 * an axis per unit on one plot invents correlations the data does not have.
 *
 * On each: the captured baseline as a dashed line in the carriageway's colour (it is a reference, which is
 * what a dashed line says), the scenario events as a faint band over the time they ran with a strip in their
 * carriageway's colour along the top, and the latest value at the end of each line. One crosshair moves
 * across all four, so the speed falling and the queue growing are read at the same moment; the tooltip is
 * the hovered chart's, and the same values are in the table view, reached without hovering. Arrow keys move
 * the crosshair when a chart has focus.
 *
 * Colours: northbound blue, southbound amber — the carriageway pills' hues, stepped for a chart line and
 * checked for colour-blind separation and contrast against the page's light and dark surfaces (and the
 * full-screen notes panel, which is dark in either theme). Values and labels are in text colours; a line key
 * beside them carries which carriageway it is. */

export type TrendSeries = {
  readonly direction: Direction;
  readonly samples: readonly TrendSample[];
  readonly baseline: Baseline | null;
  /** This carriageway's scenario events, in scenario seconds (the base `samples` use). */
  readonly events: readonly { readonly id: string; readonly name: string; readonly startS: number; readonly endS: number }[];
};

type MetricKey = "speedKmh" | "throughputPerMin" | "queueM" | "co2KgPerMin";
type MetricDef = { readonly key: MetricKey; readonly title: string; readonly unit: string; readonly decimals: number; readonly base: (b: Baseline) => number };
const METRICS: readonly MetricDef[] = [
  { key: "speedKmh", title: "Avg speed", unit: "km/h", decimals: 0, base: (b) => b.avgSpeedKmh },
  { key: "throughputPerMin", title: "Throughput", unit: "veh/min", decimals: 0, base: (b) => b.throughputPerMin },
  { key: "queueM", title: "Longest queue", unit: "m", decimals: 0, base: (b) => b.longestQueueM },
  { key: "co2KgPerMin", title: "CO₂ rate", unit: "kg/min", decimals: 1, base: (b) => b.co2RatePerMin },
];

const RANGES: readonly { readonly label: string; readonly s: number }[] = [
  { label: "15 min", s: 900 },
  { label: "30 min", s: 1800 },
  { label: "1 h", s: 3600 },
  { label: "All", s: Number.POSITIVE_INFINITY },
];

/** Plot geometry, CSS px. The x-axis band is part of the chart's own height, so the card never scrolls inside. */
const H = 150;
const PAD = { top: 12, right: 52, bottom: 20, left: 38 };
/** Two samples further apart than this are not joined: the run was rebuilt or skipped past them. */
const GAP_S = TREND_STEP_S * 3.5;

const fmtNum = (v: number, d: number) => v.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
const pad2 = (n: number) => String(n).padStart(2, "0");
/** Clock time of scenario second `t`, HH:MM (or HH:MM:SS). */
function clockOf(clockStartMin: number, t: number, seconds = false): string {
  const total = Math.round((clockStartMin * 60 + t) % 86400 + 86400) % 86400;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return seconds ? `${pad2(h)}:${pad2(m)}:${pad2(s)}` : `${pad2(h)}:${pad2(m)}`;
}

/** A clean upper bound and step for a 0-based axis with about three ticks. */
function niceScale(max: number): { top: number; step: number } {
  if (!(max > 0)) return { top: 1, step: 0.5 };
  const raw = max / 3;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= raw) ?? 10 * mag;
  return { top: Math.ceil(max / step) * step, step };
}

/** Clock-aligned time ticks, at most `most` of them, in scenario seconds. */
function timeTicks(t0: number, t1: number, clockStartMin: number, most: number): number[] {
  const spanMin = Math.max(1, (t1 - t0) / 60);
  const stepMin = [1, 2, 5, 10, 15, 30, 60, 120, 240].find((s) => spanMin / s <= most) ?? 480;
  const out: number[] = [];
  // Ticks fall on whole clock minutes divisible by the step.
  const startClockMin = clockStartMin + t0 / 60;
  let m = Math.ceil(startClockMin / stepMin) * stepMin;
  for (; (m - clockStartMin) * 60 <= t1 + 1e-6 && out.length < most + 1; m += stepMin) out.push((m - clockStartMin) * 60);
  return out;
}

function useWidth<T extends HTMLElement>(): readonly [RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(Math.round(el.getBoundingClientRect().width));
    // On the next frame, not inside the callback: the new width re-lays out what is being observed.
    let raf = 0;
    const ro = new ResizeObserver(([e]) => {
      const nw = Math.round(e.contentRect.width);
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setW(nw));
    });
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);
  return [ref, w] as const;
}

/** The sample of `s` nearest `t`, or null when it has none within a step and a half. */
function sampleNear(s: readonly TrendSample[], t: number): TrendSample | null {
  if (s.length === 0) return null;
  let lo = 0;
  let hi = s.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (s[mid].t < t) lo = mid + 1;
    else hi = mid;
  }
  const best = lo > 0 && Math.abs(s[lo - 1].t - t) < Math.abs(s[lo].t - t) ? s[lo - 1] : s[lo];
  return Math.abs(best.t - t) <= TREND_STEP_S * 1.5 ? best : null;
}

export default function TrendCharts({ series, clockStartMin }: { series: readonly TrendSeries[]; clockStartMin: number }) {
  const [rangeS, setRangeS] = useState(1800);
  const [hoverT, setHoverT] = useState<number | null>(null);
  const [active, setActive] = useState<MetricKey | null>(null);
  const [table, setTable] = useState(false);

  const lastT = Math.max(0, ...series.map((s) => (s.samples.length ? s.samples[s.samples.length - 1].t : 0)));
  const firstT = Math.min(...series.map((s) => (s.samples.length ? s.samples[0].t : lastT)));
  const t0 = Number.isFinite(rangeS) ? Math.max(firstT, lastT - rangeS) : firstT;
  // At least two minutes across, so the first samples are not one point stretched over the whole width.
  const t1 = Math.max(lastT, t0 + 120);
  const visible = series.map((s) => ({ ...s, samples: s.samples.filter((x) => x.t >= t0 && x.t <= t1) }));
  const any = visible.some((s) => s.samples.length > 0);
  const multi = series.length > 1;
  const anyBaseline = series.some((s) => s.baseline !== null);
  const anyEvent = series.some((s) => s.events.some((e) => e.endS > t0 && e.startS < t1));

  // The crosshair snaps to a sample time, and keys step it a sample at a time.
  const times = visible.reduce((a, s) => (s.samples.length > a.length ? s.samples : a), [] as readonly TrendSample[]).map((x) => x.t);
  const snap = (t: number): number | null => {
    if (times.length === 0) return null;
    let best = times[0];
    for (const x of times) if (Math.abs(x - t) < Math.abs(best - t)) best = x;
    return best;
  };
  const step = (dir: -1 | 1 | "home" | "end") => {
    if (times.length === 0) return;
    if (dir === "home") return setHoverT(times[0]);
    if (dir === "end") return setHoverT(times[times.length - 1]);
    const i = hoverT === null ? times.length - 1 : times.indexOf(snap(hoverT) ?? times[times.length - 1]);
    setHoverT(times[Math.max(0, Math.min(times.length - 1, i + dir))]);
  };

  return (
    <section className="sandbox-trends" data-trends aria-label="Trends: the readouts over time">
      <div className="sandbox-trends-head">
        <div>
          <strong>Trends</strong>
          <span className="sandbox-trends-sub">every {TREND_STEP_S} s of simulated time since the road filled</span>
        </div>
        <div className="sandbox-trends-controls">
          <div className="sandbox-trends-seg" role="radiogroup" aria-label="Time shown">
            {RANGES.map((r) => (
              <button key={r.label} role="radio" aria-checked={rangeS === r.s} className={rangeS === r.s ? "active" : ""} onClick={() => setRangeS(r.s)} data-trend-range={r.label}>
                {r.label}
              </button>
            ))}
          </div>
          <button className="sandbox-trends-table-toggle" aria-pressed={table} onClick={() => setTable((v) => !v)} data-trend-table-toggle>
            {table ? "Charts" : "Table"}
          </button>
        </div>
      </div>

      {(multi || anyBaseline || anyEvent) && any && (
        <div className="sandbox-trends-legend" aria-hidden>
          {multi && series.map((s) => (
            <span key={s.direction}><i className="key-line" style={{ background: `var(--trend-${s.direction})` }} />{DIRECTION_NAME[s.direction]}</span>
          ))}
          {anyBaseline && <span><i className="key-dash" />Baseline (captured)</span>}
          {anyEvent && <span><i className="key-band" />Scenario event running</span>}
        </div>
      )}

      {!any ? (
        <p className="sandbox-trends-empty" data-trends-empty>
          The trends start once the road has filled — the first minute of a run is warm-up, which is nobody&apos;s scenario.
        </p>
      ) : table ? (
        <TrendTable series={visible} clockStartMin={clockStartMin} />
      ) : (
        <div className="sandbox-trends-grid">
          {METRICS.map((m) => (
            <TrendChart
              key={m.key}
              metric={m}
              series={visible}
              t0={t0}
              t1={t1}
              clockStartMin={clockStartMin}
              hoverT={hoverT}
              showTip={active === m.key}
              onHover={(t) => {
                setActive(t === null ? null : m.key);
                setHoverT(t === null ? null : snap(t));
              }}
              onKey={(e) => {
                const k = e.key;
                if (k === "ArrowLeft" || k === "ArrowRight" || k === "Home" || k === "End") {
                  e.preventDefault();
                  setActive(m.key);
                  step(k === "ArrowLeft" ? -1 : k === "ArrowRight" ? 1 : k === "Home" ? "home" : "end");
                } else if (k === "Escape") {
                  setHoverT(null);
                  setActive(null);
                }
              }}
              onFocus={() => {
                setActive(m.key);
                if (hoverT === null && times.length) setHoverT(times[times.length - 1]);
              }}
              onBlur={() => {
                setActive(null);
                setHoverT(null);
              }}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function TrendChart({
  metric,
  series,
  t0,
  t1,
  clockStartMin,
  hoverT,
  showTip,
  onHover,
  onKey,
  onFocus,
  onBlur,
}: {
  metric: MetricDef;
  series: readonly TrendSeries[];
  t0: number;
  t1: number;
  clockStartMin: number;
  hoverT: number | null;
  showTip: boolean;
  onHover: (t: number | null) => void;
  onKey: (e: KeyboardEvent<SVGSVGElement>) => void;
  onFocus: () => void;
  onBlur: () => void;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const W = Math.max(200, width);
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const val = (s: TrendSample) => s[metric.key];

  const maxV = Math.max(
    0,
    ...series.flatMap((s) => s.samples.map(val)),
    ...series.map((s) => (s.baseline ? metric.base(s.baseline) : 0)),
  );
  const { top, step } = niceScale(maxV * 1.05);
  const x = (t: number) => PAD.left + ((t - t0) / Math.max(1, t1 - t0)) * plotW;
  const y = (v: number) => PAD.top + plotH - (Math.max(0, v) / top) * plotH;

  const paths = series.map((s) => {
    let d = "";
    let prev: TrendSample | null = null;
    for (const p of s.samples) {
      d += `${prev === null || p.t - prev.t > GAP_S ? "M" : "L"}${x(p.t).toFixed(1)},${y(val(p)).toFixed(1)}`;
      prev = p;
    }
    return d;
  });
  const yTicks: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += step) yTicks.push(v);
  const xTicks = timeTicks(t0, t1, clockStartMin, W < 320 ? 2 : 4);

  // The latest value at the end of each line — unless two would sit on top of each other, when the legend and
  // the tooltip carry them (labels nudged apart stop pointing at their lines).
  const ends = series.map((s) => (s.samples.length ? s.samples[s.samples.length - 1] : null));
  const endYs = ends.map((p) => (p ? y(val(p)) : null));
  const endsClash = endYs.length === 2 && endYs[0] !== null && endYs[1] !== null && Math.abs(endYs[0] - endYs[1]) < 13;

  const hovered = hoverT === null ? [] : series.map((s) => sampleNear(s.samples, hoverT));
  const now = series.map((s) => (s.samples.length ? val(s.samples[s.samples.length - 1]) : null));
  const label =
    `${metric.title}, ${metric.unit}, ${clockOf(clockStartMin, t0)} to ${clockOf(clockStartMin, t1)}: ` +
    series
      .map((s, i) => `${DIRECTION_NAME[s.direction]} ${now[i] === null ? "no readings" : `${fmtNum(now[i]!, metric.decimals)} now`}${s.baseline ? `, baseline ${fmtNum(metric.base(s.baseline), metric.decimals)}` : ""}`)
      .join("; ");

  const pointer = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left;
    if (px < PAD.left - 6 || px > PAD.left + plotW + 6) return onHover(null);
    onHover(t0 + ((px - PAD.left) / plotW) * (t1 - t0));
  };

  const tipLeft = hoverT === null ? 0 : x(hoverT);
  const tipOnLeft = tipLeft > PAD.left + plotW * 0.55;
  const activeEvents = hoverT === null ? [] : series.flatMap((s) => s.events.filter((e) => e.startS <= hoverT && e.endS > hoverT).map((e) => ({ ...e, direction: s.direction })));

  return (
    <figure className="sandbox-trend" data-trend={metric.key} ref={ref}>
      <figcaption>
        {metric.title} <span>{metric.unit}</span>
      </figcaption>
      <svg
        width={W}
        height={H}
        role="img"
        aria-label={label}
        tabIndex={0}
        onPointerMove={pointer}
        onPointerLeave={() => onHover(null)}
        onKeyDown={onKey}
        onFocus={onFocus}
        onBlur={onBlur}
      >
        {/* Scenario events: a faint band over the time each ran, a strip in its carriageway's colour along the top. */}
        {series.map((s, si) =>
          s.events
            .filter((e) => e.endS > t0 && e.startS < t1)
            .map((e) => {
              const a = x(Math.max(t0, e.startS));
              const b = x(Math.min(t1, e.endS));
              return (
                <g key={`${s.direction}-${e.id}`}>
                  <rect className="trend-band" x={a} y={PAD.top} width={Math.max(1, b - a)} height={plotH} />
                  <rect x={a} y={PAD.top - 9 + si * 4} width={Math.max(2, b - a)} height={3} rx={1.5} style={{ fill: `var(--trend-${s.direction})` }} opacity={0.85} />
                </g>
              );
            }),
        )}
        {yTicks.map((v) => (
          <g key={v}>
            <line className={v === 0 ? "trend-axis" : "trend-grid"} x1={PAD.left} x2={PAD.left + plotW} y1={y(v)} y2={y(v)} />
            <text className="trend-tick" x={PAD.left - 6} y={y(v)} textAnchor="end" dominantBaseline="middle">
              {fmtNum(v, step < 1 ? 1 : 0)}
            </text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text key={t} className="trend-tick" x={x(t)} y={H - 5} textAnchor="middle">
            {clockOf(clockStartMin, t)}
          </text>
        ))}
        {series.map((s) =>
          s.baseline ? (
            <line
              key={`base-${s.direction}`}
              className="trend-base"
              x1={PAD.left}
              x2={PAD.left + plotW}
              y1={y(metric.base(s.baseline))}
              y2={y(metric.base(s.baseline))}
              style={{ stroke: `var(--trend-${s.direction})` }}
            />
          ) : null,
        )}
        {series.map((s, i) => (
          <path key={s.direction} className="trend-line" d={paths[i]} style={{ stroke: `var(--trend-${s.direction})` }} />
        ))}
        {ends.map((p, i) =>
          p ? (
            <g key={`end-${series[i].direction}`}>
              <circle className="trend-dot" cx={x(p.t)} cy={endYs[i]!} r={4} style={{ fill: `var(--trend-${series[i].direction})` }} />
              {!endsClash && (
                <text className="trend-end" x={x(p.t) + 8} y={endYs[i]!} dominantBaseline="middle">
                  {fmtNum(val(p), metric.decimals)}
                </text>
              )}
            </g>
          ) : null,
        )}
        {hoverT !== null && (
          <g>
            <line className="trend-cross" x1={x(hoverT)} x2={x(hoverT)} y1={PAD.top} y2={PAD.top + plotH} />
            {hovered.map((p, i) =>
              p ? <circle key={i} className="trend-dot" cx={x(p.t)} cy={y(val(p))} r={4} style={{ fill: `var(--trend-${series[i].direction})` }} /> : null,
            )}
          </g>
        )}
      </svg>
      {showTip && hoverT !== null && (
        <div className="sandbox-trend-tip" style={tipOnLeft ? { right: W - tipLeft + 10 } : { left: tipLeft + 10 }} role="status">
          <div className="tip-time">{clockOf(clockStartMin, hoverT, true)}</div>
          {series.map((s, i) => {
            const p = hovered[i];
            const b = s.baseline ? metric.base(s.baseline) : null;
            const delta = p && b !== null && b > 0 ? ((val(p) - b) / b) * 100 : null;
            return (
              <div key={s.direction} className="tip-row">
                <i className="key-line" style={{ background: `var(--trend-${s.direction})` }} />
                <b>{p ? `${fmtNum(val(p), metric.decimals)} ${metric.unit}` : "—"}</b>
                <span>
                  {DIRECTION_NAME[s.direction]}
                  {delta !== null ? ` · ${delta >= 0 ? "+" : "−"}${fmtNum(Math.abs(delta), 0)}% vs baseline` : ""}
                </span>
              </div>
            );
          })}
          {activeEvents.map((e) => (
            <div key={`${e.direction}-${e.id}`} className="tip-event">
              <i className="key-band" />
              {e.name} · {e.direction}
            </div>
          ))}
        </div>
      )}
    </figure>
  );
}

/** The same readings as rows, one a minute, newest first: every value reachable without a pointer. */
function TrendTable({ series, clockStartMin }: { series: readonly TrendSeries[]; clockStartMin: number }) {
  const byMinute = new Map<number, (TrendSample | null)[]>();
  series.forEach((s, i) => {
    for (const p of s.samples) {
      const minute = Math.floor(p.t / 60);
      const row = byMinute.get(minute) ?? series.map(() => null);
      if (row[i] === null) row[i] = p; // the first reading in each minute
      byMinute.set(minute, row);
    }
  });
  const rows = [...byMinute.entries()].sort((a, b) => b[0] - a[0]);
  return (
    <div className="sandbox-trends-tablewrap" data-trends-table>
      <table className="sandbox-trends-table">
        <thead>
          <tr>
            <th scope="col">Time</th>
            {METRICS.flatMap((m) =>
              series.map((s) => (
                <th key={`${m.key}-${s.direction}`} scope="col">
                  {m.title}
                  {series.length > 1 ? ` ${s.direction}` : ""} <span>{m.unit}</span>
                </th>
              )),
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map(([minute, row]) => (
            <tr key={minute}>
              <th scope="row">{clockOf(clockStartMin, minute * 60)}</th>
              {METRICS.flatMap((m) => row.map((p, i) => <td key={`${m.key}-${i}`}>{p ? fmtNum(p[m.key], m.decimals) : "—"}</td>))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
