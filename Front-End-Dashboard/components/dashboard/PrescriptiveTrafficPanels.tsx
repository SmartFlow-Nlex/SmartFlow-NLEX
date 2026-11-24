"use client";

/* The Traffic Prescriptive tab: three panels, one per row of the analytics
 * diagram, each acting on the Predictive tab's own forecast.
 *
 * They live in one file because they share a single cached fetch and a single
 * decision-logic module; splitting them would triple the boilerplate without
 * separating anything that is actually independent.
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Activity, AlertTriangle, BellRing, CalendarClock, CalendarDays, ChartLine, ChevronDown, ChevronRight, Clock, Crosshair,
  ChartColumn, FileText, Gauge, Info, Lightbulb, MapPin, Megaphone, ShieldCheck, Target, Ticket, TrendingUp, Trophy, Users,
} from "lucide-react";
import { fmtKm } from "../../lib/km-post";
import InfoTooltip from "./InfoTooltip";
import StateNote from "../stage/StateNote";
import { SourceBadge, ForecastAge } from "./prescriptiveShell";
import GroupMenu, { type GroupMenuGroup } from "./GroupMenu";
import {
  loadForecast, loadPrescriptive, rankByLowerBound, exitsFromEvents, exitsFromUpcoming, FORECAST_TTL_MS, PRESCRIPTIVE_TTL_MS,
  type ForecastPayload, type TrafficPrescriptive, type StaffingHour, type StaffingLevel,
} from "./prescriptiveTraffic.shared";

const fmtInt = (n: number) => Math.round(n).toLocaleString("en-US");
const fmtHour = (h: number) => (h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`);
const shortDay = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

/* True once a load has taken longer than a few seconds, so the panel can say why it is waiting. */
function useSlow(waiting: boolean, afterMs = 6000) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    setSlow(false);
    if (!waiting) return;
    const t = window.setTimeout(() => setSlow(true), afterMs);
    return () => window.clearTimeout(t);
  }, [waiting, afterMs]);
  return slow;
}

/* What the event ranking's "how sure" rests on (2 Nov 2026). The Firm / Fair / Loose words it replaced cut the
   interval width at 0.05 and 0.12, which were set by hand; the interval itself is shown instead. */
const ESTIMATE_HINT =
  "Uplift is the median ratio of the exit's traffic on past event nights to a normal day (the median of the same " +
  "weekday over the 8 weeks before, on days with no event and no holiday). Its 95% interval comes from resampling those event " +
  "days (a bootstrap). The ranking uses the interval's lower end: the rise the past event days support even at their weakest.";

/* Ask again on a cycle and whenever the tab comes back into view (19 Nov 2026, user: "prescriptive should
   automatically adjust"). The loaders keep an answer for their TTL, so a tick inside it costs nothing; each tick
   also re-renders, so "how old" labels move with the clock. */
function useAutoRefresh(everyMs: number) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const bump = () => { if (document.visibilityState === "visible") setTick((n) => n + 1); };
    const t = window.setInterval(bump, everyMs);
    document.addEventListener("visibilitychange", bump);
    return () => { window.clearInterval(t); document.removeEventListener("visibilitychange", bump); };
  }, [everyMs]);
  return tick;
}

function useForecast() {
  const [data, setData] = useState<ForecastPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const tick = useAutoRefresh(FORECAST_TTL_MS);
  useEffect(() => {
    let alive = true;
    loadForecast()
      .then((d) => { if (alive) { setData(d); setError(null); } })
      .catch((e) => { if (alive) setError(String(e?.message ?? e)); });
    return () => { alive = false; };
  }, [attempt, tick]);
  const slow = useSlow(!data && !error);
  // A failed background refresh keeps the last good answer on screen.
  return { data, error: data ? null : error, slow, retry: () => { setError(null); setAttempt((n) => n + 1); } };
}

/* Night Corridor chrome for the three panels: a near-opaque card with a
   hairline, a 20 px headline with its method behind (i), and the panel's
   own controls on the same line. */
function Shell({ title, hint, children, right, meta, badge, sub }: {
  title: string; hint: string; right?: React.ReactNode; children: React.ReactNode;
  /** Where the card's advice comes from (SourceBadge) and how fresh it is (ForecastAge), under the title. */
  meta?: React.ReactNode;
  /** A badge on the title line, and a one-line description under it (Staffing Priority, 19 Nov 2026). */
  badge?: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <article className="chart-card wide nct-card">
      <div className="nct-card-head-split">
        <div className="nct-head-text">
          <h3 className="nct-title">
            {title} <InfoTooltip text={hint} />
            {badge}
          </h3>
          {sub && <p className="nct-sub">{sub}</p>}
          {meta && <div className="rx-head-meta">{meta}</div>}
        </div>
        {right}
      </div>
      {children}
    </article>
  );
}

const Banner = ({ tone = "info", children }: { tone?: "info" | "alert"; children: React.ReactNode }) => (
  <div className={`nct-banner${tone === "alert" ? " is-alert" : ""}`}>
    {tone === "alert" && <AlertTriangle size={18} strokeWidth={2} aria-hidden="true" className="nct-banner-icon" />}
    <div className="nct-banner-text">{children}</div>
  </div>
);

/* Empty, loading and error states keep their words; the mascot only
   decorates them (headlights dimmed for "no data", hazards for errors). */
const Empty = ({ msg, slow, onRetry }: { msg: string; slow?: boolean; onRetry?: () => void }) => {
  const kind = /unavailable/i.test(msg) ? "error" : /…$/.test(msg) ? "loading" : "nodata";
  return (
    <article className="chart-card wide nct-card nct-empty-card">
      <StateNote kind={kind} role={kind === "error" ? "alert" : undefined}>
        {msg}
        {slow && kind === "loading" && (
          <span className="nct-empty-note">Still working: the first load after the server starts can take up to a minute.</span>
        )}
        {onRetry && kind === "error" && (
          <button type="button" className="btn-muted nct-empty-retry" onClick={onRetry}>Try again</button>
        )}
      </StateNote>
    </article>
  );
};

const Foot = ({ children }: { children: React.ReactNode }) => (
  <p className="nct-foot">{children}</p>
);

/* ==================================================================== 1 ====
 * Staffing priority by forecast demand (2 Nov 2026).
 *
 * Replaced the Booth Staffing Plan, which planned booths from OpenStreetMap
 * booth counts and a booth-throughput slider: neither is measured anywhere in
 * the warehouse. This compares each plaza-hour's forecast with that plaza's
 * own usual level for the hour and day type, and says how sure it is from the
 * forecast chain's measured held-out error (traffic-prescriptive.service.ts).
 */

function usePrescriptive() {
  const [data, setData] = useState<TrafficPrescriptive | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const tick = useAutoRefresh(PRESCRIPTIVE_TTL_MS);
  useEffect(() => {
    let off = false;
    loadPrescriptive()
      .then((d) => { if (!off) { setData(d); setError(null); } })
      .catch((e) => { if (!off) setError(e instanceof Error ? e.message : String(e)); });
    return () => { off = true; };
  }, [attempt, tick]);
  const slow = useSlow(!data && !error);
  // A failed background refresh keeps the last good answer on screen.
  return { data, error: data ? null : error, slow, retry: () => { setError(null); setAttempt((n) => n + 1); } };
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
/** "93%" -- or "99% or more" / "1% or less", the resolution the measured quantiles carry. */
const chanceText = (c: number) => (c >= 0.99 ? "99% or more" : c <= 0.01 ? "1% or less" : pct(c));
const LEVEL_WORD: Record<StaffingLevel, string> = { above: "Near-certain", likely: "Likely", normal: "Normal" };

/** One plaza's day as 24 cells, shaded by the forecast against its usual level for that hour (load), with the
 *  hours likely or near-certain to pass its usual peak marked. */
function HourHeat({ hours, peakHour }: { hours: StaffingHour[]; peakHour: number }) {
  return (
    <div className="nct-heat" role="img" aria-label={`Forecast against the usual level by hour; busiest at ${fmtHour(peakHour)}`}>
      {hours.map((h) => (
        <span
          key={h.hour}
          className={`nct-heat-cell${h.level === "likely" ? " is-tight" : ""}${h.level === "above" ? " is-over" : ""}${h.hour === peakHour ? " is-peak" : ""}`}
          style={{ ["--lvl" as string]: Math.max(0, Math.min(1, ((h.load ?? 0) - 0.6) / 0.6)).toFixed(3) }}
          title={
            `${fmtHour(h.hour)}: ${fmtInt(h.forecast)} vehicles forecast` +
            (h.low != null && h.high != null ? ` (80% band ${fmtInt(h.low)}–${fmtInt(h.high)})` : "") +
            (h.usual != null ? `; usual ${fmtInt(h.usual)}` : "") +
            (h.usualPeak != null ? `, usual peak ${fmtInt(h.usualPeak)}` : "") +
            (h.chance != null ? `; ${chanceText(h.chance)} chance of passing the usual peak` : "; not rated (under the measured range)")
          }
        />
      ))}
    </div>
  );
}

const listOf = (xs: string[]) =>
  xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;

/** The lead hour's chance as a ring: the share of the circle that is filled is the chance itself. */
function ChanceRing({ chance, level }: { chance: number | null; level: StaffingLevel | null }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  const v = chance == null ? 0 : Math.max(0, Math.min(1, chance));
  return (
    <div className={`sp-ring is-${level ?? "normal"}`} role="img"
      aria-label={chance == null ? "Not rated" : `${chanceText(chance)} chance of passing the usual peak`}>
      <svg viewBox="0 0 108 108" aria-hidden="true">
        <circle cx="54" cy="54" r={r} className="sp-ring-track" />
        <circle cx="54" cy="54" r={r} className="sp-ring-fill"
          strokeDasharray={`${(v * c).toFixed(2)} ${c.toFixed(2)}`} transform="rotate(-90 54 54)" />
      </svg>
      <span className="sp-ring-text">
        <b>{chance == null ? "—" : pct(chance)}</b>
        <span>chance</span>
      </span>
    </div>
  );
}

/** "1 PM" or "1–3 PM" / "11 AM–1 PM", for a run of clock hours. */
const hourSpan = (a: number, b: number) => {
  if (a === b) return fmtHour(a);
  const [ha, pa] = fmtHour(a).split(" ");
  const [hb, pb] = fmtHour(b).split(" ");
  return pa === pb ? `${ha}–${hb} ${pb}` : `${fmtHour(a)}–${fmtHour(b)}`;
};

/* Week-table shading (19 Nov 2026): three steps of the plaza's usual level instead of a continuous wash, so the
   key can say what each shade means. Amber and red stay the measured chance of passing the usual peak. */
const loadBand = (load: number | null | undefined) =>
  load == null ? "" : load >= 1 ? " is-b3" : load >= 0.9 ? " is-b2" : " is-b1";

export function BoothStaffingPanel() {
  const [view, setView] = useState<"week" | "hour">("week");
  const [showAll, setShowAll] = useState(false);
  const [allPriorities, setAllPriorities] = useState(false);
  const { data, error, slow, retry } = usePrescriptive();

  if (error) return <Empty msg={`Prescriptive traffic unavailable: ${error}`} onRetry={retry} />;
  if (!data) return <Empty msg="Comparing the forecast with each plaza's usual level…" slow={slow} />;
  if (data.week.length === 0 || !data.shiftPlan) return <Empty msg="No future days in the volume forecast." />;
  if (data.shiftPlan.plazas.length === 0) return <Empty msg="No plaza volumes are recorded to apportion the forecast with." />;

  const days = data.week;
  const plan = data.shiftPlan;
  const b = data.basis;
  const lead = data.priorities[0] ?? null;
  const others = data.priorities.slice(1);
  const more = allPriorities ? others : others.slice(0, 5);
  const above = days.reduce((s, d) => s + d.aboveCells, 0);
  const likely = days.reduce((s, d) => s + d.likelyCells, 0);

  // Week table: each plaza-day's hour most likely to pass its usual peak; plazas in order of their week's highest chance.
  const byDay = days.map((d) => new Map(d.plazas.map((p) => [p.plaza, p] as const)));
  const rows = plan.plazas
    .map((p) => {
      const each = byDay.map((m) => m.get(p.plaza) ?? null);
      const best = Math.max(-1, ...each.map((x) => x?.top?.chance ?? -1));
      return { plaza: p.plaza, sharePct: p.sharePct, each, best };
    })
    .sort((x, y) => y.best - x.best);
  const visible = showAll ? rows : rows.slice(0, 8);
  // Without priorities: the closest any plaza-hour comes, so "normal" says how close.
  const closest = lead ?? days
    .flatMap((d) => d.plazas.map((p) => (p.top ? { ...p.top, date: d.date, dayType: d.dayType, plaza: p.plaza } : null)))
    .filter((x): x is NonNullable<typeof x> => x != null)
    .sort((x, y) => (y.chance ?? -1) - (x.chance ?? -1))[0] ?? null;
  const past = b.forecastFrom && b.usualTo && b.forecastFrom <= b.usualTo;
  const focusDate = lead?.date ?? null;
  const dayShort = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { weekday: "short" });
  const monthDay = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const [m0, m1] = [monthDay(days[0].date), monthDay(days[days.length - 1].date)];
  const range = m0.split(" ")[0] === m1.split(" ")[0] ? `${m0} – ${m1.split(" ")[1]}` : `${m0} – ${m1}`;

  /* --- The suggested actions, each worked out from the numbers above (19 Nov 2026). --- */
  // 1. Staffing: the likely hours grouped into one window per plaza and day.
  const windows = new Map<string, { plaza: string; date: string; from: number; to: number; best: number }>();
  for (const p of data.priorities) {
    const k = `${p.plaza}|${p.date}`;
    const w = windows.get(k);
    if (w) { w.from = Math.min(w.from, p.hour); w.to = Math.max(w.to, p.hour); w.best = Math.max(w.best, p.chance ?? 0); }
    else windows.set(k, { plaza: p.plaza, date: p.date, from: p.hour, to: p.hour, best: p.chance ?? 0 });
  }
  const staffWins = [...windows.values()].sort((x, y) => y.best - x.best);
  const staffNamed = staffWins.slice(0, 3);
  const staffPlazas = new Set(staffWins.map((w) => w.plaza));
  // 2. Monitoring: the plazas forecast furthest above their usual level, other than those already being staffed.
  const watch = rows
    .map((r) => {
      const top = r.each
        .map((p, i) => (p?.top?.load != null ? { load: p.top.load, hour: p.top.hour, date: days[i].date } : null))
        .filter((x): x is NonNullable<typeof x> => x != null)
        .sort((x, y) => y.load - x.load)[0];
      return top ? { plaza: r.plaza, ...top } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x != null && x.load >= 1 && !staffPlazas.has(x.plaza))
    .sort((x, y) => y.load - x.load)
    .slice(0, 3);
  // 3. Schedule: the day carrying most of the likely hours, and the hours they fall in.
  const busiest = [...days].sort((x, y) => (y.aboveCells + y.likelyCells) - (x.aboveCells + x.likelyCells) || y.corridorForecast - x.corridorForecast)[0];
  const busiestCells = busiest.aboveCells + busiest.likelyCells;
  const busiestHours = [
    ...data.priorities.filter((p) => p.date === busiest.date).map((p) => p.hour),
    ...busiest.plazas.filter((p) => p.top && p.top.level !== "normal").map((p) => p.top!.hour),
  ];
  const firstHour = busiestHours.length ? Math.min(...busiestHours) : null;
  const lastHour = busiestHours.length ? Math.max(...busiestHours) : null;

  const actions: { icon: ReactNode; title: string; body: ReactNode }[] = [
    {
      icon: <Users size={20} aria-hidden="true" />,
      title: "Staffing",
      body: staffNamed.length ? (
        <>
          Add staff at{" "}
          {staffNamed.map((w, i) => (
            <span key={`${w.plaza}|${w.date}`}>
              {i > 0 && (i === staffNamed.length - 1 ? " and " : ", ")}
              <b>{w.plaza}</b> ({dayShort(w.date)} {hourSpan(w.from, w.to)})
            </span>
          ))}
          {staffWins.length > staffNamed.length && <>, plus {staffWins.length - staffNamed.length} more</>}.
        </>
      ) : (
        <>Normal staffing at every plaza: no hour this week is likely to pass its usual peak.</>
      ),
    },
    {
      icon: <Activity size={20} aria-hidden="true" />,
      title: "Monitoring",
      body: watch.length ? (
        <>
          Watch{" "}
          {watch.map((w, i) => (
            <span key={w.plaza}>
              {i > 0 && (i === watch.length - 1 ? " and " : ", ")}
              <b>{w.plaza}</b> ({pct(w.load)} of usual, {dayShort(w.date)} {fmtHour(w.hour)})
            </span>
          ))}
          : above their usual level, though not likely past the peak.
        </>
      ) : (
        <>No other plaza is forecast above its usual level this week.</>
      ),
    },
    {
      icon: <CalendarClock size={20} aria-hidden="true" />,
      title: "Schedule",
      body: busiestCells > 0 && firstHour != null && lastHour != null ? (
        <>
          <b>{shortDay(busiest.date)}</b> holds {busiestCells} of the week&apos;s {above + likely} likely hours
          {/* The ranked list is capped, so past it only the likeliest hours' times are known. */}
          {above + likely > data.priorities.length ? ", the likeliest" : ","}{" "}
          {firstHour === lastHour ? <>at {fmtHour(firstHour)}</> : <>from {fmtHour(firstHour)} to {fmtHour(lastHour)}</>}.
          Have the extra staff in place before {fmtHour(firstHour)}.
        </>
      ) : (
        <>
          Busiest day for the corridor: <b>{shortDay(busiest.date)}</b>, {fmtInt(busiest.corridorForecast)} vehicles forecast,
          within the usual range.
        </>
      ),
    },
  ];

  const Toggle = (
    <div className="nct-pills" role="group" aria-label="Plan view">
      {(["week", "hour"] as const).map((v) => (
        <button
          key={v}
          onClick={() => setView(v)}
          aria-pressed={view === v}
          className={`nct-pill-btn${view === v ? " is-on" : ""}`}
        >
          {v === "week" ? "Week ahead" : "Hour by hour"}
        </button>
      ))}
    </div>
  );

  const levelChip = lead
    ? { cls: lead.level === "above" ? "is-above" : "is-likely", text: lead.level === "above" ? "Near-certain to pass peak" : "Likely to pass peak" }
    : { cls: "is-normal", text: "Normal staffing" };

  return (
    <Shell
      title="Staffing Priority"
      hint={`Each plaza-hour's forecast against that plaza's own usual level for the same hour and day type (median of the latest 12 months; usual peak = its ${b.usualPeakPercentile}th percentile, passed on 1 comparable day in 10). Staff above normal where the forecast is likely to pass the usual peak. How sure comes from the forecast's measured error on held-out days.`}
      badge={<SourceBadge kind="forecast" detail={`${data.champion.model ?? "Champion"} volume forecast against each plaza's measured usual level`} />}
      sub="Where and when to staff above normal, from the forecast against each plaza's usual traffic."
      right={<div className="nct-panel-controls">{Toggle}</div>}
    >
      <div className="sp">
        {/* The lead hour: where, when, the numbers behind it, and what to do. */}
        <section className={`sp-hero ${levelChip.cls}`} aria-label="Top staffing priority">
          <ChanceRing chance={closest?.chance ?? null} level={lead?.level ?? null} />
          <div className="sp-where">
            {closest ? (
              <>
                {!lead && <span className="sp-kicker">Closest to its usual peak</span>}
                <p className="sp-where-name"><MapPin size={18} aria-hidden="true" />{closest.plaza}</p>
                <p className="sp-where-when">
                  <span><CalendarDays size={15} aria-hidden="true" />{shortDay(closest.date)}</span>
                  <span><Clock size={15} aria-hidden="true" />{fmtHour(closest.hour)}</span>
                </p>
              </>
            ) : (
              <p className="sp-where-name">Every plaza</p>
            )}
            <span className={`sp-chip ${levelChip.cls}`}>{levelChip.text}</span>
          </div>
          {closest && (
            <>
              <div className="sp-stat">
                <span className="sp-stat-k">Forecast</span>
                <span className="sp-stat-v"><b>{fmtInt(closest.forecast)}</b> vehicles</span>
                {closest.low != null && closest.high != null && (
                  <span className="sp-stat-n"><TrendingUp size={14} aria-hidden="true" />80% band {fmtInt(closest.low)}–{fmtInt(closest.high)}</span>
                )}
              </div>
              <div className="sp-stat">
                <span className="sp-stat-k">Usual peak</span>
                <span className="sp-stat-v"><b>{closest.usualPeak != null ? fmtInt(closest.usualPeak) : "—"}</b> vehicles</span>
                <span className="sp-stat-n">
                  {closest.usual != null && <>typical {closest.dayType} {fmtInt(closest.usual)} · </>}passed 1 day in 10
                </span>
              </div>
            </>
          )}
          <div className="sp-stat">
            <span className="sp-stat-k">This week</span>
            <span className="sp-stat-v"><b>{likely + above}</b> hour{likely + above === 1 ? "" : "s"}</span>
            <span className="sp-stat-n">likely to pass the usual peak{above > 0 && <>, {above} near-certain</>}</span>
          </div>
          <div className="sp-rec">
            <p className="sp-rec-k"><Lightbulb size={17} aria-hidden="true" />Recommendation</p>
            <p className="sp-rec-v">
              {lead ? (
                <>Staff <b>{lead.plaza}</b> above normal on {shortDay(lead.date)} at {fmtHour(lead.hour)}: the forecast
                  has a {chanceText(lead.chance ?? 0)} chance of passing its usual peak.</>
              ) : (
                <>Normal staffing at every plaza, {shortDay(days[0].date)} to {shortDay(days[days.length - 1].date)}.</>
              )}
            </p>
          </div>
        </section>

        {!data.champion.accepted && (
          <Banner tone="alert">
            <b>No volume model passed its acceptance gate:</b> the forecast is last week repeated, and the band is that method&apos;s own measured error.
          </Banner>
        )}
        {past && (
          <Banner tone="alert">
            <b>Its first day, {b.forecastFrom}, is already inside the record, which now runs to {b.usualTo}:</b>{" "}
            this plan is for days already past. Retrain the volume models to plan the coming week.
          </Banner>
        )}

        <div className={`sp-grid${view === "hour" ? " is-hour" : ""}`}>
          {/* Next most likely hours. */}
          <section className="sp-panel sp-others" aria-labelledby="sp-others-h">
            <header className="sp-panel-head">
              <h4 id="sp-others-h"><AlertTriangle size={17} aria-hidden="true" className="sp-ico-warn" />Other likely hours</h4>
              <span className="sp-panel-sub">Next most likely to pass the usual peak</span>
            </header>
            {more.length > 0 ? (
              <>
                <div className="sp-list-head" aria-hidden="true">
                  <span>Chance</span><span>Plaza and hour</span><span>Forecast vs peak</span>
                </div>
                <ul className="sp-list">
                  {more.map((p) => (
                    <li key={`${p.date}|${p.plaza}|${p.hour}`}>
                      <span className={`sp-pct ${p.level === "above" ? "is-above" : "is-likely"}`}
                        aria-label={`${chanceText(p.chance ?? 0)} chance, ${LEVEL_WORD[p.level].toLowerCase()}`}>
                        {pct(p.chance ?? 0)}
                      </span>
                      <span className="sp-list-where">
                        <b>{p.plaza}</b>
                        <span>{shortDay(p.date)}, {fmtHour(p.hour)}</span>
                      </span>
                      <span className="sp-list-vs">
                        <b>{fmtInt(p.forecast)}</b>
                        <span>vs {p.usualPeak != null ? fmtInt(p.usualPeak) : "—"}</span>
                      </span>
                    </li>
                  ))}
                </ul>
                {others.length > 5 && (
                  <button type="button" className="sp-link" onClick={() => setAllPriorities((v) => !v)}>
                    {allPriorities ? "Show the top 5" : `Show all ${others.length}`}
                    <ChevronRight size={15} aria-hidden="true" className={allPriorities ? "is-up" : ""} />
                  </button>
                )}
              </>
            ) : (
              <p className="sp-empty">No other hour this week is likely to pass its usual peak.</p>
            )}
          </section>

          {/* The week, or the first day hour by hour. */}
          <section className="sp-panel sp-outlook" aria-labelledby="sp-outlook-h">
            <header className="sp-panel-head">
              <h4 id="sp-outlook-h">
                <ChartLine size={17} aria-hidden="true" className="sp-ico" />
                {view === "hour" ? "Hour by hour" : "Weekly outlook"}
                <span className="sp-range">{view === "hour" ? `${shortDay(plan.date)} · ${plan.dayType}` : range}</span>
              </h4>
              <span className="sp-panel-sub">
                {view === "hour"
                  ? "Each hour's forecast against the plaza's usual level for that hour."
                  : "Each day's hour most likely to pass the usual peak, as % of the plaza's usual level."}
              </span>
            </header>

            {view === "hour" ? (
              <div className="nct-hour-rows sp-hour-rows">
                <div className="nct-hour-row nct-heat-axis" aria-hidden="true">
                  <div />
                  <div className="nct-heat">
                    {Array.from({ length: 24 }, (_, h) => (
                      <span key={h} className="nct-heat-tick">{h % 6 === 0 ? fmtHour(h).replace(" ", "") : ""}</span>
                    ))}
                  </div>
                  <div />
                </div>
                {(showAll ? plan.plazas : plan.plazas.slice(0, 8)).map((p) => (
                  <div key={p.plaza} className="nct-hour-row">
                    <div className="nct-hour-name">
                      {p.plaza}
                      <span>{p.sharePct}% of corridor</span>
                    </div>
                    <HourHeat hours={p.hours} peakHour={p.peakHour} />
                    <div className="nct-hour-peak">
                      {p.top?.load != null ? <><b>{pct(p.top.load)}</b> of usual</> : "—"}
                      {p.top && <> at {fmtHour(p.top.hour)}</>}
                      {p.top?.chance != null && <span className="nct-hour-queue">{chanceText(p.top.chance)} past peak</span>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="sp-table-wrap">
                <table className="sp-week">
                  <thead>
                    <tr>
                      <th>Plaza</th>
                      {days.map((d) => (
                        <th key={d.date} className={d.date === focusDate ? "is-focus" : undefined}>
                          {dayShort(d.date)}
                          <span>{monthDay(d.date)}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((r, ri) => (
                      <tr key={r.plaza}>
                        <th scope="row">{r.plaza}</th>
                        {r.each.map((p, i) => {
                          const t = p?.top ?? null;
                          const focus = days[i].date === focusDate;
                          return (
                            <td key={days[i].date}
                              title={t
                                ? `${fmtHour(t.hour)}: ${fmtInt(t.forecast)} vehicles forecast` +
                                  (t.low != null && t.high != null ? ` (80% band ${fmtInt(t.low)}–${fmtInt(t.high)})` : "") +
                                  `; usual ${t.usual != null ? fmtInt(t.usual) : "—"}, usual peak ${t.usualPeak != null ? fmtInt(t.usualPeak) : "—"}` +
                                  (t.chance != null ? `; ${chanceText(t.chance)} chance of passing it` : "")
                                : "Not rated"}
                              className={`sp-cell${loadBand(t?.load)}${t?.level === "likely" ? " is-likely" : ""}${t?.level === "above" ? " is-above" : ""}${focus ? " is-focus" : ""}${focus && ri === visible.length - 1 ? " is-focus-end" : ""}`}>
                              <b>
                                {t?.load != null ? pct(t.load) : "—"}
                                {t?.level === "above" ? <i aria-label="Near-certain to pass the usual peak">!</i> : t?.level === "likely" ? <i aria-label="Likely to pass the usual peak">▲</i> : null}
                              </b>
                              {t && <span>{fmtHour(t.hour)}</span>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <footer className="sp-outlook-foot">
              {rows.length > 8 ? (
                <button type="button" className="sp-link is-boxed" onClick={() => setShowAll((v) => !v)}>
                  {showAll ? "Show the first 8" : `Show all ${rows.length} plazas`}
                  <ChevronRight size={15} aria-hidden="true" className={showAll ? "is-up" : ""} />
                </button>
              ) : <span />}
              {view === "hour" ? (
                <span className="nct-key">
                  <span className="nct-key-item"><i className="nct-heat-swatch" style={{ ["--lvl" as string]: "0.25" }} />Below usual</span>
                  <span className="nct-key-item"><i className="nct-heat-swatch" style={{ ["--lvl" as string]: "0.85" }} />Above usual</span>
                  <span className="nct-key-item"><i className="nct-heat-swatch is-tight" />Likely past peak</span>
                  <span className="nct-key-item"><i className="nct-hatch" />Near-certain</span>
                </span>
              ) : (
                <span className="sp-key">
                  <span><i className="sp-cell is-b1" />Below usual <small>(under 90%)</small></span>
                  <span><i className="sp-cell is-b2" />Near usual <small>(90–99%)</small></span>
                  <span><i className="sp-cell is-b3" />Above usual <small>(100%+)</small></span>
                  <span><i className="sp-cell is-likely" />▲ Likely past peak</span>
                  {above > 0 && <span><i className="sp-cell is-above" />! Near-certain</span>}
                </span>
              )}
            </footer>
          </section>

          {/* What to do, from the numbers above. */}
          <section className="sp-panel sp-actions" aria-labelledby="sp-actions-h">
            <header className="sp-panel-head">
              <h4 id="sp-actions-h"><Target size={17} aria-hidden="true" className="sp-ico" />Suggested actions</h4>
            </header>
            <ul className="sp-action-list">
              {actions.map((a) => (
                <li key={a.title} className="sp-action">
                  <span className="sp-action-ico">{a.icon}</span>
                  <div>
                    <p className="sp-action-t">{a.title}</p>
                    <p className="sp-action-b">{a.body}</p>
                  </div>
                </li>
              ))}
            </ul>
            <p className="sp-note">
              <Info size={16} aria-hidden="true" />
              Each action is worked out from this week&apos;s forecast and each plaza&apos;s usual traffic.
            </p>
          </section>
        </div>

        <details className="sp-measure">
          <summary>
            <FileText size={20} aria-hidden="true" className="sp-measure-ico" />
            <span>
              <b>How this is measured</b>
              <span>Where the chance, the usual peak and the forecast band come from.</span>
            </span>
            <ChevronDown size={18} aria-hidden="true" className="sp-measure-chev" />
          </summary>
          <div>
            <Foot>
              Forecast: the {data.champion.model ?? "champion"} corridor forecast (WMAPE {data.champion.wmapePct ?? "—"}% per day) times each
              plaza&apos;s share and hourly profile, weekday and weekend apart, over {b.usualFrom} to {b.usualTo}. Usual: the plaza&apos;s
              median for that hour and day type over the same 12 months ({b.usualWeekdays} weekdays, {b.usualWeekends} weekend days); usual
              peak: its {b.usualPeakPercentile}th percentile.{" "}
              {b.band ? (
                <>
                  How sure: this whole chain replayed on the model&apos;s {b.band.days} held-out days ({b.band.from} to {b.band.to}),
                  {" "}{fmtInt(b.band.cells)} plaza-hours, missed by {b.band.wmapePct}% per plaza-hour. The 80% band and each chance are that
                  plaza&apos;s measured spread of actual ÷ forecast. Near-certain = 90% or more (the band&apos;s low end passes the usual peak);
                  likely = 50% or more. Hours under {b.minCellVehicles} vehicles were not in the replay, so they are not rated.
                </>
              ) : (
                <>No held-out error could be measured, so no hour is rated.</>
              )}
              {data.plazasWithoutBand.length > 0 && <> {listOf(data.plazasWithoutBand)}: too few held-out hours to rate.</>}
            </Foot>
          </div>
        </details>
      </div>
    </Shell>
  );
}

/* ==================================================================== 2 ====
 * Congestion response advisory.
 */

/** A segment's next 12 forecast hours as one box per hour (19 Nov 2026; it was a strip of unlabelled bars, and the
 *  user could not tell what it meant). Each box names its clock hour and the chance of High congestion in it; the
 *  shade deepens with that chance, boxes under the Act line are grey, the likeliest hour is outlined, and hours
 *  already past (the run is old) are faded. Compact: the boxes alone, with the numbers on hover. */
type HourPt = { h: number; pHigh: number };
function HighTimeline({ hours, cut, clock, isPast, compact = false }: {
  hours: HourPt[]; cut: number | null; compact?: boolean;
  /** Clock label for forecast hour +h ("3 PM"); without one the boxes say "+3h". */
  clock?: (h: number) => string;
  isPast?: (h: number) => boolean;
}) {
  if (hours.length === 0) return null;
  const peak = hours.reduce((a, b) => (b.pHigh > a.pHigh ? b : a));
  const at = (h: number) => (clock ? clock(h) : `+${h}h`);
  return (
    <span className={`cr-hrs${compact ? " is-compact" : ""}`} role="img"
      aria-label={`Chance of High congestion, hour by hour; likeliest ${at(peak.h)} at ${Math.round(peak.pHigh * 100)}%`}>
      {Array.from({ length: 12 }, (_, i) => {
        const h = i + 1;
        const pt = hours.find((x) => x.h === h);
        const v = pt?.pHigh ?? null;
        const over = v != null && cut != null && v >= cut;
        const cls = `cr-hr${v == null ? " is-none" : over ? " is-act" : ""}${pt && h === peak.h ? " is-peak" : ""}` +
          `${over && v >= 0.45 ? " is-strong" : ""}${isPast?.(h) ? " is-past" : ""}`;
        return (
          <span key={h} className={cls}
            style={v != null ? { ["--p" as string]: Math.min(1, v / 0.6).toFixed(3) } : undefined}
            title={`${at(h)} (+${h}h): ${v == null ? "no forecast" : `${Math.round(v * 100)}% chance of High congestion`}` +
              `${over ? ", at or above the Act line" : ""}${isPast?.(h) ? " (already past)" : ""}`}>
            {!compact && (
              <>
                <b>{v == null ? "—" : `${Math.round(v * 100)}%`}</b>
                <span>{at(h)}</span>
              </>
            )}
          </span>
        );
      })}
    </span>
  );
}

/** One line under a segment's name saying what its 12 hours add up to. */
function hoursSummary(hours: HourPt[], cut: number | null, at: (h: number) => string): ReactNode {
  if (hours.length === 0) return null;
  const peak = hours.reduce((a, b) => (b.pHigh > a.pHigh ? b : a));
  const over = cut == null ? [] : hours.filter((x) => x.pHigh >= cut).map((x) => x.h).sort((x, y) => x - y);
  const likeliest = <>likeliest <b>{at(peak.h)}</b> ({Math.round(peak.pHigh * 100)}%)</>;
  if (cut == null) return likeliest;
  if (over.length === 0) return <>Under the Act line all {hours.length} hours · {likeliest}</>;
  return <>At Act from <b>{at(over[0])}</b>, {over.length} of {hours.length} hours · {likeliest}</>;
}
const CONGESTION_AUTO_RETRIES = 6;
const CONGESTION_RETRY_MS = 15_000;
export function CongestionResponsePanel() {
  const [showMonitor, setShowMonitor] = useState(false);
  const [allAct, setAllAct] = useState(false);
  const [copied, setCopied] = useState(false);
  const { data, error, slow, retry } = usePrescriptive();

  const rows = useMemo(() => data?.congestion ?? [], [data]);

  /* No segments is not an answer to sit on (TR-12, 19 Oct 2026). It means the forecast read failed
     while the server was starting, or the hourly model was rewriting its table; both clear within a
     minute or two, so the panel asks again on its own, and after that offers the button. */
  const noRows = !!data && rows.length === 0;
  const [autoTries, setAutoTries] = useState(0);
  useEffect(() => {
    if (!noRows || autoTries >= CONGESTION_AUTO_RETRIES) return;
    const t = window.setTimeout(() => { setAutoTries((n) => n + 1); retry(); }, CONGESTION_RETRY_MS);
    return () => window.clearTimeout(t);
    // retry is a fresh closure each render; noRows and autoTries are what decide a new attempt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noRows, autoTries]);

  if (error) return <Empty msg={`Prescriptive traffic unavailable: ${error}`} onRetry={retry} />;
  if (!data) return <Empty msg="Ranking segments…" slow={slow} />;
  if (rows.length === 0) {
    const why = data.congestionUnavailable
      ? "The congestion forecast could not be read yet. The server may still be starting up."
      : "The congestion forecast came back empty. The hourly model may be rewriting it.";
    return autoTries < CONGESTION_AUTO_RETRIES
      ? <Empty msg={`${why} Trying again in ${CONGESTION_RETRY_MS / 1000} seconds…`} />
      : <Empty msg={`Congestion forecast unavailable. ${why}`} onRetry={() => { setAutoTries(0); retry(); }} />;
  }

  const cal = data.congestionCalibration;
  const calibrated = !!cal?.ok && cal.threshold != null;
  const cut = calibrated ? cal!.threshold : null;
  const act = rows.filter((r) => r.label === "Act");
  const monitor = rows.filter((r) => r.label === "Monitor");
  // The cards: the Act segments most likely to turn High, or with none at Act the three closest to the line.
  const cards = (act.length ? act : rows).slice(0, 3);
  const inline = act.slice(3);
  const timelineOf = (segment: string) => data.congestionTimeline?.find((t) => t.segment === segment)?.hours ?? [];
  // A segment with no forecast rows is not a quiet segment. It is named, and "corridor clear" is not said while any is missing.
  const missing = data.congestionMissing ?? [];
  const lead = act.length ? Math.min(...act.map((r) => r.firstAct ?? 99)) : null;

  // Manila wall-clock text ("2026-10-19 14:00"), split rather than parsed so no browser zone shifts it.
  const [baseD, baseT] = (data.congestionBaseTs ?? "").split(" ");
  const baseH = baseT ? Number(baseT.slice(0, 2)) : NaN;
  const baseHour = baseD && Number.isFinite(baseH) ? `${fmtHour(baseH)} ${shortDay(baseD)}` : null;
  const baseMs = baseD && baseT ? new Date(`${baseD}T${baseT}:00+08:00`).getTime() : NaN;
  // The hourly job can lag (it runs every 3-7 h in the cloud), so past six hours the age is flagged.
  const stale = Number.isFinite(baseMs) && Date.now() - baseMs > 6 * 3_600_000;
  // The clock hour forecast hour +h lands on, in Manila time, for the advisory text.
  const clockAt = (h: number) => (Number.isFinite(baseMs) ? fmtHour((new Date(baseMs + h * 3_600_000).getUTCHours() + 8) % 24) : `+${h}h`);
  const hourClock = Number.isFinite(baseMs) ? clockAt : undefined;
  // An hour is past once its whole hour has gone by; read at render, which the auto-refresh repeats.
  const hourPast = Number.isFinite(baseMs) ? (h: number) => baseMs + (h + 1) * 3_600_000 <= Date.now() : undefined;
  const pastHours = hourPast ? Array.from({ length: 12 }, (_, i) => i + 1).filter(hourPast).length : 0;
  /* Advisory text for the Mobile App, from the Act cards. The system publishes advisories only through the
     Mobile App Control Centre (it cannot drive message signs), so the panel copies the text and links there.
     "Possible", not "expected": the measured precision at the Act line is well under one in two. */
  const advised = act.slice(0, 3);
  const advisoryText = advised.length
    ? `Heavy congestion possible on NLEX at ${listOf(advised.map((r) => r.segment))}` +
      (advised[0].firstAct != null ? `, from around ${clockAt(advised[0].firstAct)}` : "") +
      ". Expect delays; travel earlier or later if you can."
    : "";
  const copyAdvisory = () => {
    navigator.clipboard?.writeText(advisoryText).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    }).catch(() => setCopied(false));
  };
  const span = (a: string | null, z: string | null) => (a && z ? `${shortDay(a.slice(0, 10))} to ${shortDay(z.slice(0, 10))}` : "");

  return (
    <Shell
      title="Congestion Response Advisory"
      hint="Act = a segment's chance of High congestion reaches the Act line within 12 hours. The line is not set by hand: it is the cut-off that best balanced High hours caught against false alarms (F1) on the archived forecasts, then checked on the last 7 days, which it never saw."
      meta={
        <>
          <SourceBadge kind="forecast" detail="The congestion forecast's chance of High congestion, 1 to 12 hours ahead" />
          {baseHour && <ForecastAge at={baseHour} stale={stale} />}
        </>
      }
    >
      {/* Layout (19 Nov 2026, user's reference): the verdict, then the Act line's record beside the advisory, the three
          cards as where / when / peak tiles over how sure, and the rest of the Act list beside the next 12 hours. */}
      <div className="sp cr">
        <Banner tone={act.length ? "alert" : "info"}>
          {!calibrated ? (
            <><b>No Act line yet.</b> {cal?.reason ?? "The forecast archive could not be read."} Segments are listed by their chance of High.</>
          ) : act.length > 0 ? (
            <>
              <b className="nct-bad">Act:</b> {act.length} segment{act.length === 1 ? "" : "s"} reach the {pct(cut!)} line
              {lead != null && lead < 99 && <> from <b>+{lead}h</b></>}: <b>{listOf(act.slice(0, 3).map((r) => r.segment))}</b>
              {act.length > 3 && <> and {act.length - 3} more</>}.
            </>
          ) : missing.length > 0 ? (
            <><b>No segment reaches the {pct(cut!)} line</b> in the next 12 hours, but {missing.length} segment{missing.length === 1 ? " has" : "s have"} no forecast at all.</>
          ) : (
            <><b>Corridor clear.</b> No segment reaches the {pct(cut!)} line in the next 12 hours.</>
          )}
          {baseHour && <> <span className="nct-dim">Hours count from the {baseHour} forecast.</span></>}
        </Banner>

        {(calibrated && cal && cal.precision != null && cal.recall != null) || advisoryText ? (
          <div className="cr-top">
            {calibrated && cal && cal.precision != null && cal.recall != null && (
              <div className="cr-calib" role="group" aria-label="How the Act line performed on held-out days">
                <div className="cr-calib-cell">
                  <span className="cr-calib-ico"><Gauge size={18} aria-hidden="true" /></span>
                  <span>
                    <span className="cr-k">Act line</span>
                    <span className="cr-v"><b>{pct(cut!)}</b> chance of High</span>
                  </span>
                </div>
                <div className="cr-calib-cell">
                  <span className="cr-calib-ico"><BellRing size={18} aria-hidden="true" /></span>
                  <span>
                    <span className="cr-k">When it said Act</span>
                    <span className="cr-v">High followed <b>{pct(cal.precision)}</b>{cal.baseRate != null && <span className="nct-dim"> (vs {pct(cal.baseRate)} of all hours)</span>}</span>
                  </span>
                </div>
                <div className="cr-calib-cell">
                  <span className="cr-calib-ico"><Crosshair size={18} aria-hidden="true" /></span>
                  <span>
                    <span className="cr-k">It caught <InfoTooltip text={`Picked on ${span(cal.fitFrom, cal.fitTo)} (F1 ${cal.fitF1?.toFixed(2)}), then measured on ${span(cal.testFrom, cal.testTo)}: ${fmtInt(cal.testRows)} forecast-hours it never saw (F1 ${cal.f1?.toFixed(2)}). In all, ${fmtInt(cal.scored)} forecast-hours from ${cal.runs} runs scored against Waze jam speeds, ${fmtInt(cal.scoredHigh)} of them High.`} /></span>
                    <span className="cr-v"><b>{pct(cal.recall)}</b> of High hours</span>
                  </span>
                </div>
              </div>
            )}
            {advisoryText && (
              <div className="cr-advisory" role="group" aria-label="Advisory for the Mobile App">
                <span className="cr-advisory-ico"><Megaphone size={18} aria-hidden="true" /></span>
                <div className="cr-advisory-text">
                  <p className="cr-advisory-k">Advisory</p>
                  <p className="cr-advisory-v">{advisoryText}</p>
                </div>
                <div className="nct-publish-actions cr-advisory-actions">
                  <button type="button" className="nct-pill-btn" onClick={copyAdvisory} aria-live="polite">
                    {copied ? "Copied" : "Copy advisory"}
                  </button>
                  <a className="nct-pill-btn is-on" href="/dashboard/mobile">Publish in Mobile App</a>
                </div>
              </div>
            )}
          </div>
        ) : null}

        <div className="cr-cards">
          {cards.map((r, i) => {
            const isAct = r.label === "Act";
            return (
              <article key={r.segment} className={`cr-card${isAct ? " is-act" : ""}`}>
                <header className="cr-card-head">
                  <span className="cr-rank" aria-label={`Rank ${i + 1}`}>{i + 1}</span>
                  <span className={`cr-label${isAct ? " is-act" : ""}`}>{calibrated ? r.label : "Unrated"}</span>
                </header>
                <p className="cr-card-action">{r.action}</p>
                <dl className="cr-tiles">
                  <div>
                    <dt><MapPin size={15} aria-hidden="true" />Where</dt>
                    <dd><b>{r.segment}</b>{r.km != null && <span className="nct-dim"> · km {fmtKm(r.km)}</span>}</dd>
                  </div>
                  <div>
                    <dt><Clock size={15} aria-hidden="true" />When</dt>
                    <dd>
                      {r.firstAct != null ? (
                        <>From <b>+{r.firstAct}h</b>{Number.isFinite(baseMs) && <span className="nct-dim"> (around {clockAt(r.firstAct)})</span>}</>
                      ) : (
                        <span className="nct-dim">Below the line</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt><TrendingUp size={15} aria-hidden="true" />Peak</dt>
                    <dd><b>{pct(r.probability)}</b> chance of High at +{r.hoursAhead}h</dd>
                  </div>
                </dl>
                {r.hitRate != null && (
                  <p className="cr-sure">
                    <ShieldCheck size={16} aria-hidden="true" />
                    <span>
                      <span className="cr-k">How sure</span>
                      High followed <b>{pct(r.hitRate)}</b> of {fmtInt(r.hitN)} past forecasts at {pct(r.probability)} or more
                    </span>
                  </p>
                )}
              </article>
            );
          })}
        </div>

        <div className={`cr-grid${inline.length ? "" : " is-single"}`}>
          {inline.length > 0 && (
            <section className="sp-panel cr-more" aria-labelledby="cr-more-h">
              <header className="sp-panel-head">
                <h4 id="cr-more-h">
                  <AlertTriangle size={17} aria-hidden="true" className="cr-ico-bad" />Also at Act
                  <span className="sp-range">{inline.length} more segment{inline.length === 1 ? "" : "s"}</span>
                </h4>
              </header>
              <div className="cr-row cr-row-head" aria-hidden="true">
                <span>Segment</span><span>From</span><span>Peak</span><span>How sure</span><span>Next 12 h</span>
              </div>
              <ul className="cr-rows">
                {(allAct ? inline : inline.slice(0, 6)).map((r) => (
                  <li key={r.segment} className="cr-row">
                    <span className="cr-row-seg">
                      <b>{r.segment}</b>
                      {r.km != null && <span>km {fmtKm(r.km)}</span>}
                    </span>
                    <span className="cr-row-when">
                      {r.firstAct != null ? <><b>+{r.firstAct}h</b>{Number.isFinite(baseMs) && <span> ({clockAt(r.firstAct)})</span>}</> : "—"}
                    </span>
                    <span className="cr-row-peak"><b>{pct(r.probability)}</b> <span>at +{r.hoursAhead}h</span></span>
                    <span className="cr-row-sure">
                      {r.hitRate != null ? <><b>{pct(r.hitRate)}</b> <span>of {fmtInt(r.hitN)}</span></> : <span>—</span>}
                    </span>
                    <span className="cr-row-tl"><HighTimeline hours={timelineOf(r.segment)} cut={cut} clock={hourClock} isPast={hourPast} compact /></span>
                  </li>
                ))}
              </ul>
              {inline.length > 6 && (
                <button type="button" className="sp-link is-boxed" onClick={() => setAllAct((v) => !v)}>
                  {allAct ? "Show the first 6" : `Show all ${inline.length}`}
                  <ChevronRight size={15} aria-hidden="true" className={allAct ? "is-up" : ""} />
                </button>
              )}
            </section>
          )}

          <section className="sp-panel cr-next" aria-labelledby="cr-next-h">
            <header className="sp-panel-head">
              <h4 id="cr-next-h"><ChartLine size={17} aria-hidden="true" className="sp-ico" />Next 12 hours</h4>
              <span className="sp-panel-sub">
                Each box is one hour and the chance that the segment turns High (heavy congestion) in it,
                for the {cards.length === 1 ? "top segment" : `top ${cards.length}`}.
              </span>
            </header>
            {pastHours > 0 && (
              <p className="cr-past-note">
                <Clock size={15} aria-hidden="true" />
                <span>
                  {pastHours === 12 ? "All 12" : `The first ${pastHours}`} of these hours {pastHours === 1 ? "has" : "have"} already passed: they count
                  from the {baseHour} run, and no newer run has arrived yet.
                </span>
              </p>
            )}
            <ul className="cr-tl-list">
              {cards.map((r) => {
                const tl = timelineOf(r.segment);
                return (
                  <li key={r.segment}>
                    <span className="cr-tl-name">{r.segment}</span>
                    <span className="cr-tl-meta">{hoursSummary(tl, cut, hourClock ?? ((h) => `+${h}h`))}</span>
                    {tl.length > 0 ? <HighTimeline hours={tl} cut={cut} clock={hourClock} isPast={hourPast} /> : <span className="nct-dim">No hourly forecast</span>}
                  </li>
                );
              })}
            </ul>
            <p className="cr-tl-key">
              <span><i className="cr-key-ramp" />Darker = more likely</span>
              {cut != null && <span><i className="cr-key-under" />Under the {pct(cut)} Act line</span>}
              <span><i className="cr-key-peak" />Likeliest hour</span>
            </p>
            {monitor.length > 0 && act.length > 0 && (
              <div className="cr-monitor">
                <button type="button" onClick={() => setShowMonitor((v) => !v)} className="sp-link" aria-expanded={showMonitor}>
                  {showMonitor ? "Hide" : "Show"} the {monitor.length} segment{monitor.length === 1 ? "" : "s"} at Monitor
                  <ChevronRight size={15} aria-hidden="true" className={showMonitor ? "is-up" : ""} />
                </button>
                {showMonitor && (
                  <div className="nct-chip-row" style={{ marginTop: 10 }}>
                    {monitor.map((r) => (
                      <span key={r.segment} className="nct-mini-chip">{r.segment} · {pct(r.probability)}</span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>

        {missing.length > 0 && (
          <div className="nct-panel-intro">
            <b className="nct-warn">No forecast:</b> {listOf(missing)}. Not ranked, and not clear either:
            treat {missing.length === 1 ? "it" : "them"} as unknown until the congestion model next runs.
          </div>
        )}

        <details className="sp-measure">
          <summary>
            <FileText size={20} aria-hidden="true" className="sp-measure-ico" />
            <span>
              <b>How this is measured</b>
              <span>How the Act line is set and checked against what the road then did.</span>
            </span>
            <ChevronDown size={18} aria-hidden="true" className="sp-measure-chev" />
          </summary>
          <div>
            <Foot>
              Every archived forecast is matched with what the road then did (High = the Waze jam speed for that exit-hour). The Act
              line is the cut-off with the best F1 on all but the last 7 days; the precision and recall shown are on those 7 days.
              There is one line, not two: no higher cut-off in the archive buys a precision worth a second tier. A volume-to-capacity
              ratio is not shown: no capacity or lane-count column exists anywhere in the warehouse.
            </Foot>
          </div>
        </details>
      </div>
    </Shell>
  );
}

/* ==================================================================== 3 ====
 * Event intervention ranking.
 */

export function EventInterventionPanel() {
  const { data, error, slow, retry } = useForecast();
  // "" = a typical event day; otherwise an upcoming event's date. Defaults to the next one.
  const [pick, setPick] = useState<string | null>(null);
  // A year filter beside the event menu, as on the Predictive tab's Event Surge card (19 Nov 2026, user request).
  const [eventYear, setEventYear] = useState<string>("all");
  const [allExits, setAllExits] = useState(false);
  const upcoming = useMemo(() => data?.upcomingEvents ?? [], [data]);
  const chosenDate = pick ?? upcoming[0]?.date ?? "";
  const chosen = upcoming.find((e) => e.date === chosenDate) ?? null;
  const ranked = useMemo(
    () => (data ? rankByLowerBound(chosen ? exitsFromUpcoming(chosen) : exitsFromEvents(data.events)) : []),
    [data, chosen],
  );

  if (error) return <Empty msg={`Forecast unavailable: ${error}`} onRetry={retry} />;
  if (!data) return <Empty msg="Loading forecast…" slow={slow} />;

  const top = ranked.slice(0, 3);
  const atLeast = top.reduce((s, r) => s + r.extraLo, 0);
  const estimate = top.reduce((s, r) => s + r.extra, 0);
  const anchor = data.events.find((e) => e.material)?.anchorExit ?? null;
  const longDay = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  const total = chosen ? chosen.exits.length : data.events.length;
  const eventName = chosen ? chosen.title.split(" - ")[0] : "A typical event day";
  const shown = allExits ? ranked : ranked.slice(0, 5);
  const max = Math.max(1, ...ranked.map((r) => r.extraHi));
  const barPct = (v: number) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
  // Insights, each read off the ranking (19 Nov 2026).
  const steepest = [...ranked].sort((a, b) => b.upliftLo - a.upliftLo || b.uplift - a.uplift)[0] ?? null;
  const nMin = ranked.length ? Math.min(...ranked.map((r) => r.nEvents)) : 0;
  const nMax = ranked.length ? Math.max(...ranked.map((r) => r.nEvents)) : 0;

  /* The event menu (19 Nov 2026, user request "match this with the event predictive"): the Predictive tab's own
     grouped dropdown and Year filter in place of the browser's select. */
  const actOf = (t: string) => t.split(" - ")[0];
  const upcomingYears = [...new Set(upcoming.map((e) => e.date.slice(0, 4)))].sort();
  const thisYear = new Date().getFullYear();
  const years = [...new Set([...upcomingYears, String(thisYear), String(thisYear + 1), String(thisYear + 2)])].sort();
  const pastDays = Math.max(0, ...data.events.map((e) => e.nEvents ?? 0));
  const eventGroups: GroupMenuGroup[] = [
    { items: [{ value: "", main: "A typical event day", side: pastDays ? `${pastDays} past event days` : undefined }] },
    ...(eventYear !== "all" && !upcomingYears.includes(eventYear)
      ? [{ label: eventYear, items: [{ value: "__none", main: "No events listed for this year yet" }] }]
      : []),
    ...upcomingYears.filter((y) => eventYear === "all" || y === eventYear).map((year) => ({
      label: year,
      items: upcoming.flatMap((u, i) => {
        if (!u.date.startsWith(year)) return [];
        const act = actOf(u.title);
        const sameAct = upcoming.filter((x) => actOf(x.title) === act);
        const nth = upcoming.slice(0, i + 1).filter((x) => actOf(x.title) === act).length;
        const lead = Math.round((new Date(`${u.date}T00:00:00`).getTime() - Date.now()) / 86_400_000);
        const tags: { label: string; tone?: "muted" | "warn" | "accent" }[] = [];
        if (sameAct.length > 1) tags.push({ label: `Day ${nth}`, tone: "accent" });
        if (u.isDerived) tags.push({ label: "Inferred", tone: "warn" });
        return [{
          value: u.date,
          main: <><b className="gm-date">{shortDay(u.date)}</b>{act}</>,
          side: lead >= 0 ? (lead === 0 ? "today" : `in ${lead} d`) : undefined,
          tags,
        }];
      }),
    })),
  ];

  const Picker = upcoming.length > 0 && (
    <div className="ev-pickers">
      <span className="fc-label">Year</span>
      <GroupMenu
        value={eventYear}
        onChange={(y) => {
          setEventYear(y);
          // An event from another year is no longer listed: move to that year's first event, or the typical day.
          if (y !== "all" && !chosenDate.startsWith(y)) setPick(upcoming.find((e) => e.date.startsWith(y))?.date ?? "");
        }}
        ariaLabel="Year"
        minWidth={120}
        menuWidth={220}
        groups={[{
          items: [
            { value: "all", main: "All years", side: `${upcoming.length} events` },
            ...years.map((y) => {
              const n = upcoming.filter((u) => u.date.startsWith(y)).length;
              return { value: y, main: y, side: n ? `${n} event${n === 1 ? "" : "s"}` : "none listed yet" };
            }),
          ],
        }]}
      />
      <span className="fc-label">Plan for</span>
      <GroupMenu
        value={chosenDate}
        onChange={(v) => { if (v !== "__none") setPick(v); }}
        groups={eventGroups}
        ariaLabel="Event to plan for"
        minWidth={300}
        menuWidth={440}
        buttonLabel={chosen ? <><b className="gm-date">{shortDay(chosen.date)}</b>{actOf(chosen.title)}</> : "A typical event day"}
      />
    </div>
  );

  const insights: { icon: ReactNode; title: string; body: ReactNode }[] = ranked.length
    ? [
        {
          icon: <Trophy size={19} aria-hidden="true" />,
          title: "Most extra traffic",
          body: <><b>{ranked[0].exit}</b>: at least {fmtInt(ranked[0].extraLo)} extra vehicles (estimate {fmtInt(ranked[0].extra)}).</>,
        },
        ...(steepest
          ? [{
              icon: <TrendingUp size={19} aria-hidden="true" />,
              title: "Steepest rise",
              body: <><b>{steepest.exit}</b>: {steepest.uplift.toFixed(2)}× a normal day (95% interval {steepest.upliftLo.toFixed(2)}–{steepest.upliftHi.toFixed(2)}).</>,
            }]
          : []),
        {
          icon: <ShieldCheck size={19} aria-hidden="true" />,
          title: "Evidence",
          body: <>Each exit&apos;s rise is measured on {nMin === nMax ? nMin : `${nMin} to ${nMax}`} past event days; the ranking uses the low end of its 95% interval.</>,
        },
        {
          icon: <MapPin size={19} aria-hidden="true" />,
          title: "Coverage",
          body: <>{ranked.length} of {total} exits show a rise clearly above a normal day{anchor ? <>; the surge is anchored on <b>{anchor}</b></> : null}.</>,
        },
      ]
    : [];

  return (
    <Shell
      title="Event Intervention Ranking"
      hint="Exits ranked by the extra vehicles each is sure to carry on the event day: the lower end of its uplift's 95% interval times its normal-day baseline. Only exits whose whole interval sits above a normal day are ranked. No weights: a loose estimate already has a low floor."
      badge={<SourceBadge kind="forecast" detail="The event-surge model (uplift measured on past Arena event days) applied to the upcoming Arena calendar" />}
      sub="The exits with the most extra traffic on an event day, and where to send resources first."
      right={Picker || undefined}
    >
      {/* Layout (19 Nov 2026, user's reference): the event plan as one row, then the ranked exits beside insights read
          off the same ranking. */}
      <div className="sp ev">
        {ranked.length === 0 ? (
          <Banner>
            <b>No exit shows a rise that is clearly above normal</b> {chosen ? <>for {eventName}</> : <>on an event day</>}: every uplift interval reaches a normal day.
          </Banner>
        ) : (
          <>
            <section className="ev-hero" aria-label="Event plan">
              <span className="ev-hero-ico"><Ticket size={26} aria-hidden="true" /></span>
              <div className="ev-hero-plan">
                <span className="ev-kicker">Event plan</span>
                <p className="ev-hero-name">{eventName}</p>
                <p className="ev-hero-line">
                  <CalendarDays size={15} aria-hidden="true" />
                  {chosen ? <>{longDay(chosen.date)}{chosen.isDerived ? " (recurring, inferred)" : ""}</> : <>Any Arena event day</>}
                </p>
                <p className="ev-hero-line"><MapPin size={15} aria-hidden="true" />{listOf(top.map((r) => r.exit))}</p>
              </div>
              <div className="sp-stat ev-stat">
                <span className="sp-stat-k">At least</span>
                <span className="sp-stat-v"><b>{fmtInt(atLeast)}</b></span>
                <span className="sp-stat-n">extra vehicles at these {top.length === 1 ? "one" : top.length === 2 ? "two" : "three"} (estimate {fmtInt(estimate)})</span>
              </div>
              <div className="sp-stat ev-stat">
                <span className="sp-stat-k">How sure <InfoTooltip text={ESTIMATE_HINT} /></span>
                <span className="sp-stat-v"><b>95%</b></span>
                <span className="sp-stat-n">lower bounds, from {top[0]?.nEvents ?? 0} past event days</span>
              </div>
              <div className="sp-rec">
                <p className="sp-rec-k"><Lightbulb size={17} aria-hidden="true" />Recommendation</p>
                <p className="sp-rec-v">
                  Deploy patrol and advisory resources first at <b>{listOf(top.map((r) => r.exit))}</b>
                  {chosen ? <> on {shortDay(chosen.date)}</> : null}.
                  {anchor && <> The surge is anchored on {anchor}.</>}
                </p>
              </div>
            </section>

            <div className="ev-grid">
              <section className="sp-panel ev-rank" aria-labelledby="ev-rank-h">
                <header className="ev-rank-head">
                  <span className="sp-panel-head">
                    <h4 id="ev-rank-h"><MapPin size={17} aria-hidden="true" className="sp-ico" />
                      {allExits ? `All ${ranked.length} ranked exits` : `Top ${Math.min(5, ranked.length)} exits`}
                    </h4>
                    <span className="sp-panel-sub">Ranked by the extra vehicles each is sure to carry (the 95% interval&apos;s low end).</span>
                  </span>
                  {ranked.length > 5 && (
                    <button type="button" className="sp-link is-boxed" onClick={() => setAllExits((v) => !v)}>
                      {allExits ? "Show the top 5" : `Show all ${ranked.length}`}
                      <ChevronRight size={15} aria-hidden="true" className={allExits ? "is-up" : ""} />
                    </button>
                  )}
                </header>
                <div className="ev-row ev-row-head" aria-hidden="true">
                  <span>Rank</span><span>Exit</span><span>Extra vehicles</span><span />
                  <span className="num">Uplift</span><span className="num">Event days</span>
                </div>
                <ol className="ev-rows">
                  {shown.map((r) => (
                    <li key={r.exit} className={`ev-row${r.rank <= 3 ? " is-top" : ""}`}
                      aria-label={`${r.rank}. ${r.exit}: at least ${fmtInt(r.extraLo)} extra vehicles, estimate ${fmtInt(r.extra)}, up to ${fmtInt(r.extraHi)}`}>
                      <span className="ev-rank-n">{r.rank}</span>
                      <span className="ev-exit">{r.exit}</span>
                      <span className="nct-evbar-track ev-track" aria-hidden="true"
                        title={`At least ${fmtInt(r.extraLo)}, estimate ${fmtInt(r.extra)}, up to ${fmtInt(r.extraHi)}`}>
                        <span className="nct-evbar-est" style={{ width: barPct(r.extra) }} />
                        <span className="nct-evbar-fill" style={{ width: barPct(r.extraLo) }} />
                        <span className="nct-evbar-whisker" style={{ left: barPct(r.extraLo), width: `calc(${barPct(r.extraHi)} - ${barPct(r.extraLo)})` }} />
                      </span>
                      <span className="ev-val"><b>≥ {fmtInt(r.extraLo)}</b><span>est. {fmtInt(r.extra)} · up to {fmtInt(r.extraHi)}</span></span>
                      <span className="ev-up num"><b>{r.uplift.toFixed(2)}×</b><span>{r.upliftLo.toFixed(2)}–{r.upliftHi.toFixed(2)}</span></span>
                      <span className="ev-n num">{r.nEvents}</span>
                    </li>
                  ))}
                </ol>
                <p className="ev-key">
                  <span><i className="is-lo" />At least (what the rank uses)</span>
                  <span><i className="is-est" />Estimate</span>
                  <span><i className="is-hi" />Up to (95% interval)</span>
                </p>
              </section>

              <section className="sp-panel ev-insights" aria-labelledby="ev-ins-h">
                <header className="sp-panel-head">
                  <h4 id="ev-ins-h"><ChartColumn size={17} aria-hidden="true" className="sp-ico" />Key insights</h4>
                </header>
                <ul className="sp-action-list">
                  {insights.map((a) => (
                    <li key={a.title} className="sp-action">
                      <span className="sp-action-ico">{a.icon}</span>
                      <div>
                        <p className="sp-action-t">{a.title}</p>
                        <p className="sp-action-b">{a.body}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </>
        )}

        <details className="sp-measure">
          <summary>
            <FileText size={20} aria-hidden="true" className="sp-measure-ico" />
            <span>
              <b>How this is measured</b>
              <span>How the extra vehicles and the 95% interval are worked out.</span>
            </span>
            <ChevronDown size={18} aria-hidden="true" className="sp-measure-chev" />
          </summary>
          <div>
            <Foot>
              Extra vehicles = the exit&apos;s normal day {chosen ? "for that weekday (last 8 weeks of real data)" : ""} times (uplift − 1). The rank
              uses the lower end of the uplift&apos;s 95% interval, so an exit with a loose estimate ranks on what it is sure to add.
              Exits whose interval reaches 1 are left out. The per-exit forecast for each date is also on the Predictive tab&apos;s Event
              Surge card.
            </Foot>
          </div>
        </details>
      </div>
    </Shell>
  );
}
