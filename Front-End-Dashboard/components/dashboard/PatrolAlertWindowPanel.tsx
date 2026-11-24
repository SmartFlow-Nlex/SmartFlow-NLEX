"use client";

import { useEffect, useRef, useState } from "react";
import { BarChart3, CalendarDays, CalendarRange, Clock, ListOrdered, ShieldCheck } from "lucide-react";
import { Shell, Empty, SourceBadge } from "./prescriptiveShell";
import { incidentHeatRamp } from "./IncidentHeatmaps";
import { useThemeTokens } from "./useThemeTokens";
import RampKey from "./RampKey";
import { heatValue } from "../../lib/heat-tooltip";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

const fmtHour = (h: number) => (h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`);

// The Descriptive tab's incident ramp (incidentHeatRamp in IncidentHeatmaps.tsx), so the week grid reads the same as
// "Incidents by Hour and Day" (20 Nov 2026: the paler accent-only ramp looked washed out beside it). t in 0..1 is
// placed along the 7 stops and mixed between the two either side, as ECharts' continuous visualMap does.
function heatShade(t: number, ramp: string[]): string {
  const x = Math.max(0, Math.min(1, t)) * (ramp.length - 1);
  const i = Math.min(ramp.length - 2, Math.floor(x));
  return `color-mix(in srgb, ${ramp[i + 1]} ${((x - i) * 100).toFixed(1)}%, ${ramp[i]})`;
}

// An hour's rank among the week's 168 hours, for the tooltip's "Top n%". (The grid itself is shaded like the
// Descriptive heatmap: linearly from 0 to the busiest hour.)
function percentileOf(v: number, all: number[]): number {
  let lower = 0;
  let equal = 0;
  for (const x of all) {
    if (x < v) lower++;
    else if (x === v) equal++;
  }
  return all.length <= 1 ? 0 : (lower + equal / 2) / (all.length - 1);
}

// Mon..Sun, the Descriptive tab's Time-of-Day order (DOW_ORDER/DOW_LABELS in incident/page.tsx), not JS's Sun-first getDay().
const DOW_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DOW_FULL: Record<string, string> = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" };

type HeatmapPoint = { dow: number; hour: number; v: number };
type AnalyticsSlice = { heatmap: HeatmapPoint[]; range: { from: string; to: string } };

/* Alert hours by test, not by eye (2 Nov 2026, "no assumptions"). An hour used to be an alert hour when its average
   sat above the day's mean, so a Tuesday 9 AM a hair above average counted, however few incidents it rested on. Now
   each weekday-hour's incidents over the Range's N such days are a Poisson count k, its rate k / N incidents per day,
   and its exact (Garwood) 95% interval comes from the Poisson distribution itself. An hour is an alert hour only when
   the interval's LOWER bound is above that weekday's own mean hourly rate: the data says, at 95%, that the hour runs
   above that day's normal. Everything is the Range's own counts; nothing is set by hand. */
function poissonCdf(k: number, lam: number): number {
  if (k < 0) return 0;
  if (lam <= 0) return 1;
  // Summed in log space so a large rate (a long Range) does not underflow exp(-lam).
  let logT = -lam;
  let m = logT;
  let s = 1;
  for (let i = 1; i <= k; i++) {
    logT += Math.log(lam) - Math.log(i);
    if (logT > m) {
      s = s * Math.exp(m - logT) + 1;
      m = logT;
    } else s += Math.exp(logT - m);
  }
  return Math.min(1, Math.exp(m) * s);
}

const ciCache = new Map<number, [number, number]>();

/** Exact 95% interval for a Poisson count k: P(X >= k | lower) = 2.5% and P(X <= k | upper) = 2.5%. */
function poissonCi(k: number): [number, number] {
  const hit = ciCache.get(k);
  if (hit) return hit;
  // Bisection on a function that rises with the rate; 80 halvings is far below any displayed digit.
  const root = (f: (lam: number) => number, lo: number, hi: number) => {
    for (let i = 0; i < 80; i++) {
      const mid = (lo + hi) / 2;
      if (f(mid) > 0) hi = mid;
      else lo = mid;
    }
    return (lo + hi) / 2;
  };
  const lower = k === 0 ? 0 : root((l) => 1 - poissonCdf(k - 1, l) - 0.025, 0, k);
  const upper = root((u) => 0.025 - poissonCdf(k, u), k, k + 10 + 6 * Math.sqrt(k + 1));
  const ci: [number, number] = [lower, upper];
  ciCache.set(k, ci);
  return ci;
}

type Profile = { hours: number[]; lo: number[]; hi: number[]; mean: number; peakHour: number; alert: boolean[]; windows: [number, number][] };

/** counts[h] = incidents at hour h over `days` such weekdays. Rates are per day; an alert hour's 95% lower bound clears the day's mean. */
function buildProfile(counts: number[], days: number): Profile {
  const n = counts.length || 1;
  const d = days > 0 ? days : 1;
  const mean = counts.reduce((s, v) => s + v, 0) / n / d;
  const hours = counts.map((k) => k / d);
  const ci = counts.map((k) => poissonCi(k));
  const lo = ci.map((c) => c[0] / d);
  const hi = ci.map((c) => c[1] / d);
  const alert = lo.map((l) => days > 0 && l > mean);
  const peakHour = hours.indexOf(Math.max(...hours));
  const windows: [number, number][] = [];
  let start: number | null = null;
  for (let h = 0; h < counts.length; h++) {
    if (alert[h] && start === null) start = h;
    if (!alert[h] && start !== null) {
      windows.push([start, h]);
      start = null;
    }
  }
  if (start !== null) windows.push([start, counts.length]);
  return { hours, lo, hi, mean, peakHour, alert, windows };
}

const windowLabel = ([start, end]: [number, number]) => `${fmtHour(start)} – ${fmtHour(end % 24)}`;
const windowSpanHours = ([start, end]: [number, number]) => end - start;

type DayRow = { label: string; dow: number; days: number; profile: Profile; primary: [number, number] | null };

type Props = {
  // Same Range control every other Prescriptive card takes: each weekday's hours are measured over the selected window.
  months?: "3" | "12" | "all";
  from?: string;
  to?: string;
};

export default function PatrolAlertWindowPanel({ months = "12", from, to }: Props) {
  const [data, setData] = useState<AnalyticsSlice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // The week grid's hovered hour (with where to draw its tooltip, relative to the panel) and the hour clicked to pin.
  const [hover, setHover] = useState<{ dow: number; h: number; x: number; y: number; below: boolean } | null>(null);
  const [pick, setPick] = useState<{ dow: number; h: number } | null>(null);
  const heatRef = useRef<HTMLElement | null>(null);
  const ramp = incidentHeatRamp(useThemeTokens().isDark);
  // Where the cursor is along the colour key (0..1), so the grid can light the hours of that shade, as on Descriptive.
  const [scrub, setScrub] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPick(null);
    // Cleared here, not just on success, so a retry after a Range change shows "Updating…", not the last error.
    setError(null);
    const qs = new URLSearchParams();
    if (months) qs.set("months", months);
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    fetch(`${BACKEND}/api/incident/analytics?${qs}`, { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json();
        if (cancelled) return;
        if (!json.success) throw new Error(json.message ?? "Request failed");
        setData({ heatmap: json.data.heatmap, range: json.data.range });
        setError(null);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load the hourly incident profile");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [months, from, to]);

  const hint =
    "The hours to put patrol on alert, per weekday, from past incidents in the Range. Each hour's rate comes with its 95% range from the incident count itself (Poisson); an hour is an alert hour only when even the low end of that range is above the weekday's average hour. Based on past incidents, not the forecast: the incident model forecasts daily totals, not hours.";

  if (loading && data === null) {
    return (
      <Shell title="Patrol Alert Schedule" hint={hint}>
        <Empty msg="Loading patrol alert schedule…" />
      </Shell>
    );
  }
  // Only reachable with no successful load yet, or an empty response: nothing stale to fall back to.
  if (!data || data.heatmap.length === 0) {
    return (
      <Shell title="Patrol Alert Schedule" hint={hint}>
        <Empty kind={error ? "error" : "nodata"} msg={`Patrol alert schedule unavailable: ${error ?? "no hourly incident data for this Range."}`} />
      </Shell>
    );
  }

  // How many of each weekday fall in the Range: the N each hour's count is a rate over.
  const dowCount = Array(7).fill(0);
  const end = new Date(`${data.range.to}T00:00:00`);
  for (const d = new Date(`${data.range.from}T00:00:00`); d <= end; d.setDate(d.getDate() + 1)) dowCount[d.getDay()]++;

  const countByDow: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const r of data.heatmap) countByDow[r.dow][r.hour] += r.v;

  const rows: DayRow[] = DOW_ORDER.map((dow, i) => {
    const days = dowCount[dow];
    const hourly = countByDow[dow];
    const profile = buildProfile(hourly, days);
    const primary =
      profile.windows.length > 0
        ? [...profile.windows].sort((a, b) => windowSpanHours(b) - windowSpanHours(a))[0]
        : null;
    return { label: DOW_LABELS[i], dow, days, profile, primary };
  });

  const observed = rows.filter((r) => r.days > 0);
  if (observed.length === 0) {
    return (
      <Shell title="Patrol Alert Schedule" hint={hint} updating={loading && !error}>
        <Empty kind="nodata" msg="Patrol alert schedule unavailable: no days in the selected Range have incident data." />
      </Shell>
    );
  }
  const alertCount = rows.reduce((t, r) => t + r.profile.alert.filter(Boolean).length, 0);
  const withWindow = rows.filter((r) => r.primary != null) as (DayRow & { primary: [number, number] })[];
  const widest = withWindow.length > 0 ? [...withWindow].sort((a, b) => windowSpanHours(b.primary) - windowSpanHours(a.primary))[0] : null;
  // The single hour furthest above its day's normal, judged by its LOW end: the surest alert of the week.
  let surest: { r: DayRow; h: number } | null = null;
  for (const r of rows) {
    for (let h = 0; h < 24; h++) {
      if (!r.profile.alert[h]) continue;
      const lift = r.profile.lo[h] / r.profile.mean;
      if (!surest || lift > surest.r.profile.lo[surest.h] / surest.r.profile.mean) surest = { r, h };
    }
  }
  const allHours = rows.flatMap((r) => r.profile.hours);
  const maxHour = Math.max(...allHours);
  const minDays = Math.min(...observed.map((r) => r.days));
  const maxDays = Math.max(...observed.map((r) => r.days));
  const rate = (v: number) => v.toFixed(v < 10 ? 2 : 1);

  /* The hours that are alert hours on most weekdays (reference layout's "focus" takeaway, 20 Nov 2026): for each
     hour, the weekdays on which it is an alert hour; the longest run of hours alert on at least `need` of the observed
     weekdays. Computed from the same test as the table; nothing is set by hand except "most" = more than half. */
  const need = Math.floor(observed.length / 2) + 1;
  const alertDays = Array.from({ length: 24 }, (_, h) => rows.filter((r) => r.days > 0 && r.profile.alert[h]).length);
  let common: [number, number] | null = null;
  for (let h = 0, start = -1; h <= 24; h++) {
    const on = h < 24 && alertDays[h] >= need;
    if (on && start < 0) start = h;
    if (!on && start >= 0) {
      if (!common || h - start > common[1] - common[0]) common = [start, h];
      start = -1;
    }
  }
  const commonMin = common ? Math.min(...alertDays.slice(common[0], common[1])) : 0;
  const daysSpan = minDays === maxDays ? `${minDays}` : `${minDays}–${maxDays}`;
  const pickRow = pick ? rows.find((r) => r.dow === pick.dow) ?? null : null;
  // The hour whose day and hour labels light up: the hovered one, else the pinned one.
  const focus = hover ?? pick;

  return (
    <Shell
      title="Patrol Alert Schedule"
      hint={hint}
      updating={loading && !error}
      right={<SourceBadge kind="history" detail="Past incidents by hour and weekday in the Range; the incident model forecasts daily totals, not hours" />}
    >
      {error && (
        <div role="alert" style={{ fontSize: "0.78rem", color: "var(--color-warning)" }}>
          Couldn&apos;t refresh ({error}) — showing the last loaded result.
        </div>
      )}

      {/* The answer and its three supporting figures (reference layout, 20 Nov 2026). */}
      <div className="px-sum px-sum-rec">
        <div className="px-rec">
          <small>Recommendation</small>
          <b>{alertCount > 0 ? `Put patrol on alert in ${alertCount} hours a week` : "No hour is clearly above normal"}</b>
        </div>
        <div className="px-sum-item">
          <span className="px-icon" aria-hidden="true"><CalendarDays size={20} strokeWidth={2} /></span>
          <span>
            <small>Longest alert period</small>
            <b>{widest ? `${widest.label}, ${windowLabel(widest.primary)}` : "None in this Range"}</b>
            {widest && <em>{windowSpanHours(widest.primary)} hours in a row</em>}
          </span>
        </div>
        <div className="px-sum-item">
          <span className="px-icon" aria-hidden="true"><BarChart3 size={20} strokeWidth={2} /></span>
          <span>
            <small>Surest alert hour (95%)</small>
            <b>{surest ? `${surest.r.label}, ${fmtHour(surest.h)}` : "—"}</b>
            {surest && <em>{rate(surest.r.profile.lo[surest.h])}–{rate(surest.r.profile.hi[surest.h])} incidents/day vs a {rate(surest.r.profile.mean)} {surest.r.label} hour</em>}
          </span>
        </div>
        <div className="px-sum-item">
          <span className="px-icon" aria-hidden="true"><ShieldCheck size={20} strokeWidth={2} /></span>
          <span>
            <small>Confidence</small>
            <b>95%</b>
            <em>Each alert hour&apos;s low end is above its weekday&apos;s average, over {daysSpan} of each weekday</em>
          </span>
        </div>
      </div>

      {/* The week at a glance: one row per weekday, one cell per hour, shaded by rank among all 168 hours; a dot marks
          an alert hour. Hover an hour for its figures; click to pin it (its day is then highlighted in the table). */}
      <section className="px-panel px-heat" ref={heatRef}>
        <div className="px-panel-head">
          <span className="px-chip" aria-hidden="true"><CalendarRange size={17} strokeWidth={2.2} /></span>
          <h4>Weekly Incident Intensity by Hour</h4>
          <div className="px-legend">
            <RampKey colors={ramp} min={0} max={maxHour} format={(v) => heatValue(v, "incidents / day", 2)} lowLabel="Quieter" highLabel="Busier" onScrub={setScrub} />
            <span><i className="is-dot" />Alert hour</span>
          </div>
        </div>
        <div className="px-week-wrap">
          <div className="px-week" onMouseLeave={() => setHover(null)} role="img" aria-label={`Incidents by hour and weekday; alert hours marked. ${withWindow.map((r) => `${DOW_FULL[r.label]} ${r.profile.windows.map(windowLabel).join(", ")}`).join("; ")}`}>
            <span />
            {Array.from({ length: 24 }, (_, h) => (
              <span key={`h${h}`} className={`px-week-hour${focus && focus.h === h ? " is-on" : ""}`}>{fmtHour(h)}</span>
            ))}
            {rows.map((r) => (
              <div key={`w${r.dow}`} className="px-week-row">
                <span className={`px-week-day${widest && r.dow === widest.dow ? " is-widest" : ""}${focus && focus.dow === r.dow ? " is-on" : ""}`}>{r.label}</span>
                {r.profile.hours.map((v, h) => {
                  const on = r.days > 0;
                  const isPick = pick != null && pick.dow === r.dow && pick.h === h;
                  // Scrubbing the key: hours within 8% of the scale of the pointed-at value stay lit (Descriptive's band).
                  const dim = scrub != null && on && Math.abs((maxHour > 0 ? v / maxHour : 0) - scrub) > 0.08;
                  return (
                    <i
                      key={h}
                      className={`px-week-cell${on && r.profile.alert[h] ? " is-alert" : ""}${on ? " is-live" : ""}${isPick ? " is-pick" : ""}${dim ? " is-dim" : ""}`}
                      style={{ background: on ? heatShade(maxHour > 0 ? v / maxHour : 0, ramp) : undefined }}
                      onMouseEnter={on ? (e) => {
                        const box = heatRef.current?.getBoundingClientRect();
                        const c = e.currentTarget.getBoundingClientRect();
                        if (!box) return;
                        // Above the cell unless that would leave the panel's top; centred, kept inside the panel.
                        const below = c.top - box.top < 150;
                        setHover({ dow: r.dow, h, x: Math.max(130, Math.min(box.width - 130, c.left - box.left + c.width / 2)), y: below ? c.bottom - box.top + 8 : c.top - box.top - 8, below });
                      } : undefined}
                      onClick={on ? () => setPick(isPick ? null : { dow: r.dow, h }) : undefined}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        {hover && (() => {
          const r = rows.find((x) => x.dow === hover.dow);
          if (!r) return null;
          return (
            <div className={`px-heat-tip${hover.below ? " is-below" : ""}`} style={{ left: hover.x, top: hover.y }} role="tooltip">
              <HourFigures r={r} h={hover.h} rank={percentileOf(r.profile.hours[hover.h], allHours)} rate={rate} />
            </div>
          );
        })()}
        <div className="px-heat-pick" aria-live="polite">
          {pickRow && pick ? (
            <>
              <HourFigures r={pickRow} h={pick.h} rank={percentileOf(pickRow.profile.hours[pick.h], allHours)} rate={rate} inline />
              <button type="button" className="px-heat-clear" onClick={() => setPick(null)}>Clear</button>
            </>
          ) : (
            <span className="is-muted">Hover an hour for its figures; click one to pin it.</span>
          )}
        </div>
      </section>

      <div className="px-split">
        <section className="px-panel">
          <div className="px-panel-head">
            <span className="px-chip" aria-hidden="true"><ListOrdered size={17} strokeWidth={2.2} /></span>
            <h4>Alert Schedule by Day</h4>
          </div>
          <div className="px-table-wrap">
            <table className="px-table">
              <thead>
                <tr>
                  <th>Day</th>
                  <th>Alert hours</th>
                  <th>Busiest hour, per day (95%)</th>
                  <th>Average hour</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const p = r.profile;
                  const isWidest = widest != null && r.dow === widest.dow;
                  return (
                    <tr key={r.dow} className={[isWidest ? "is-first" : "", pick && pick.dow === r.dow ? "is-pick" : ""].join(" ").trim() || undefined}>
                      <td className="px-name">{r.label}</td>
                      {r.days === 0 ? (
                        <td colSpan={3} className="is-muted">No {r.label} in this Range</td>
                      ) : (
                        <>
                          <td className={isWidest ? "px-accent" : p.windows.length ? undefined : "is-muted"}>
                            {p.windows.length > 0 ? p.windows.map(windowLabel).join(", ") : "None clearly above normal"}
                          </td>
                          <td className="px-tab">
                            {fmtHour(p.peakHour)}: {rate(p.hours[p.peakHour])} <span className="is-muted">({rate(p.lo[p.peakHour])}–{rate(p.hi[p.peakHour])})</span>
                          </td>
                          <td className="px-tab">
                            {rate(p.mean)} <span className="is-muted">({r.days} days)</span>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="px-panel">
          <div className="px-panel-head">
            <span className="px-chip" aria-hidden="true"><ShieldCheck size={17} strokeWidth={2.2} /></span>
            <h4>Key Takeaways</h4>
          </div>
          <ul className="px-takeaways">
            <li>
              <span className="px-icon" aria-hidden="true"><Clock size={20} strokeWidth={2} /></span>
              <span><b>{alertCount} hours / week</b><em>Total recommended patrol alert time.</em></span>
            </li>
            <li>
              <span className="px-icon" aria-hidden="true"><BarChart3 size={20} strokeWidth={2} /></span>
              <span>
                <b>{common ? `${fmtHour(common[0])} – ${fmtHour(common[1] % 24)}` : "No shared window"}</b>
                <em>{common ? `Alert hours on at least ${commonMin} of ${observed.length} weekdays: the week's most consistent stretch.` : `No hour is an alert hour on more than half the weekdays.`}</em>
              </span>
            </li>
            <li>
              <span className="px-icon" aria-hidden="true"><ShieldCheck size={20} strokeWidth={2} /></span>
              <span><b>95% confidence</b><em>An alert hour&apos;s whole 95% range sits above its weekday&apos;s average hour, so a busy-looking hour resting on few incidents does not count.</em></span>
            </li>
          </ul>
        </section>
      </div>
    </Shell>
  );
}

/** One weekday-hour's figures, for the week grid's tooltip and its pinned line. All from the same Poisson test as the table. */
function HourFigures({ r, h, rank, rate, inline = false }: { r: DayRow; h: number; rank: number; rate: (v: number) => string; inline?: boolean }) {
  const p = r.profile;
  const v = p.hours[h];
  const vs = p.mean > 0 ? v / p.mean : 0;
  const top = Math.max(1, Math.round((1 - rank) * 100));
  return (
    <div className={`px-hf${inline ? " is-inline" : ""}`}>
      <div className="px-hf-head">
        <b>{DOW_FULL[r.label]}, {fmtHour(h)} – {fmtHour((h + 1) % 24)}</b>
        <span className={`px-hf-tag${p.alert[h] ? " is-alert" : ""}`}>{p.alert[h] ? "Alert hour" : "Not an alert hour"}</span>
      </div>
      <dl>
        <div><dt>Incidents per {r.label}</dt><dd>{rate(v)}</dd></div>
        <div><dt>95% range</dt><dd>{rate(p.lo[h])}–{rate(p.hi[h])}</dd></div>
        <div><dt>{r.label} average hour</dt><dd>{rate(p.mean)} <span className="is-muted">({vs.toFixed(1)}×)</span></dd></div>
        <div><dt>Of all 168 hours</dt><dd>{rank >= 0.5 ? `Top ${top}%` : `Bottom ${Math.max(1, Math.round(rank * 100))}%`}</dd></div>
      </dl>
      <p className="px-hf-note">
        {p.alert[h]
          ? `Even the low end of its range is above the ${r.label} average, over ${r.days} ${r.label}s.`
          : p.hi[h] < p.mean
            ? `Its whole range is below the ${r.label} average, over ${r.days} ${r.label}s.`
            : `Its range reaches down to the ${r.label} average, so it is not clearly above it (${r.days} ${r.label}s).`}
      </p>
    </div>
  );
}
