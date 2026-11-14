"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

/** One row per day for the week ahead, already pointing at that day's
 *  worst hour. Served by /api/map-comparison/forecast/peaks. */
export type DailyPeak = {
  day: string;
  hoursAhead: number;
  at: string;
  /** Jams the map paints red (Severe), the live map's "congested". */
  congested: number;
  /** Jams it paints amber (Heavy), the live map's "slow". */
  slow?: number;
  confidence: number;
};

/* The ranges the forecast picker offers, and how finely each is stepped.
   Hour by hour is right for half a day and useless for a week: 168 options in
   a dropdown is a list nobody reads, so the longer ranges step coarser. */
export const HORIZON_RANGES = [
  { key: "12h", label: "Next 12 h", hours: 12, step: 1 },
  { key: "24h", label: "Next 24 h", hours: 24, step: 2 },
  { key: "7d", label: "Next 7 days", hours: 168, step: 6 },
] as const;

export type HorizonRangeKey = (typeof HORIZON_RANGES)[number]["key"];

/* When the forecast run was made. Hour N of the forecast is base + N, not now + N: the run can be hours old
   (the scheduled job runs every 3-7 h), so labelling from the page clock put "+3 h" on an hour that was already
   past (2 Nov 2026). Set once by the page from /forecast model info; until then the page clock stands in. */
let forecastBaseMs: number | null = null;
export function setForecastBase(iso: string | null | undefined) {
  const t = iso ? new Date(iso).getTime() : NaN;
  forecastBaseMs = Number.isFinite(t) ? t : null;
}

/** The hour a horizon lands on, rounded down.
 *
 *  The model forecasts an hour bucket, not a moment, so a label of 12:26 PM
 *  implied a precision the prediction does not have. */
function hourOf(hoursAhead: number): Date {
  const t = new Date((forecastBaseMs ?? Date.now()) + hoursAhead * 3_600_000);
  t.setMinutes(0, 0, 0);
  return t;
}

/** How many hours from now forecast hour N is (0 for the current hour). */
export function hoursFromNow(hoursAhead: number): number {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  return Math.round((hourOf(hoursAhead).getTime() - now.getTime()) / 3_600_000);
}

const timeOf = (d: Date) =>
  d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

/** "Today", "Tomorrow", or the date — what a person calls the day. */
function dayOf(d: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((new Date(d).setHours(0, 0, 0, 0) - today.getTime()) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

/** Day and time together, for anywhere the day is not already established. */
export function clockFor(hoursAhead: number): string {
  const t = hourOf(hoursAhead);
  const day = dayOf(t);
  return day === "Today" ? timeOf(t) : `${day} · ${timeOf(t)}`;
}

/** Day and time apart, for the large timestamp on the forecast map. */
export function dayTimeFor(hoursAhead: number): { day: string; time: string } {
  const t = hourOf(hoursAhead);
  return { day: dayOf(t), time: timeOf(t) };
}

/** The hours worth offering for a range, clamped to what the warehouse holds. */
export function horizonOptionsFor(range: HorizonRangeKey, maxHorizon: number | null): number[] {
  const r = HORIZON_RANGES.find((x) => x.key === range) ?? HORIZON_RANGES[0];
  // Hours of an older run that are already past are not a forecast any more; start at the current hour. When the
  // whole run is past, offer it anyway: the labels then show the past times honestly rather than an empty picker.
  const elapsed = forecastBaseMs == null ? 0 : -hoursFromNow(0);
  const first = elapsed >= 1 && elapsed < (maxHorizon ?? r.hours) ? elapsed : 1;
  const reach = Math.min(first - 1 + r.hours, maxHorizon ?? r.hours);
  const out: number[] = [];
  for (let h = first; h <= reach; h += r.step) out.push(h);
  // Always offer the far end of what is available, even when the step would
  // have skipped over it.
  if (reach >= 1 && out[out.length - 1] !== reach) out.push(reach);
  return out;
}

/**
 * Which hour the Forecasted Traffic map is showing.
 *
 * One component, rendered by both the panel and its expanded view, so the two
 * cannot offer different options or drift out of step — they are handed the
 * same state and produce the same control.
 *
 * It offers only ranges the warehouse can answer. gold.ml_predictive_congestion
 * holds whatever the pipeline was last asked to write, so a range beyond that
 * is shown but disabled and says why rather than drawing an empty corridor.
 */
export default function ForecastHorizonPicker({
  horizon,
  setHorizon,
  range,
  setRange,
  maxHorizon,
  compact = false,
  live,
  onPick,
}: {
  horizon: number;
  setHorizon: (h: number) => void;
  range: HorizonRangeKey;
  setRange: (r: HorizonRangeKey) => void;
  maxHorizon: number | null;
  /** Drops the heading, for a header bar that already has one. */
  compact?: boolean;
  /** Night Corridor timeline: the "Live" end at the left of the scrubber. It
   *  points the corridor strip at the live map; the forecast hour is
   *  untouched, because the forecast endpoint has no "live" hour. */
  live?: { label: string; active: boolean; onSelect: () => void };
  /** Told when a tick on the timeline is picked (after setHorizon). */
  onPick?: (h: number) => void;
}) {
  const options = useMemo(() => horizonOptionsFor(range, maxHorizon), [range, maxHorizon]);

  /* A week, one row per day.
   *
   * Hourly across seven days is twenty-nine rows that mostly repeat: nobody
   * scrolls a dropdown hunting for 11 PM on Tuesday. What the week view is for
   * is which day is bad and when, so each row names a date and the hour that
   * day is most likely to be congested — the peak the backend computes from
   * the same rows the map draws. */
  const [peaks, setPeaks] = useState<DailyPeak[] | null>(null);

  useEffect(() => {
    if (range !== "7d") return;
    let cancelled = false;
    fetch(`${BACKEND}/api/map-comparison/forecast/peaks`, { cache: "no-store" })
      .then((r) => r.json())
      .then((b) => {
        if (!cancelled) setPeaks(b?.success ? (b.data as DailyPeak[]) : null);
      })
      .catch(() => {
        // Falls through to the hourly list below, which always works.
        if (!cancelled) setPeaks(null);
      });
    return () => {
      cancelled = true;
    };
  }, [range, maxHorizon]);

  const usePeaks = range === "7d" && peaks !== null && peaks.length > 0;

  /* Grouped by day.
   *
   * A week of options is twenty-nine rows, and flat they repeated the same
   * date four times over with the offset leading every line — so picking
   * "Monday evening" meant reading "+61 h" first and counting dates. Native
   * optgroups give the day once as a heading and leave the row to say the
   * time, which is what is actually being chosen. */
  const groups = useMemo(() => {
    const byDay: { day: string; items: { h: number; time: string }[] }[] = [];
    for (const h of options) {
      const t = hourOf(h);
      const day = dayOf(t);
      const last = byDay[byDay.length - 1];
      if (last && last.day === day) last.items.push({ h, time: timeOf(t) });
      else byDay.push({ day, items: [{ h, time: timeOf(t) }] });
    }
    return byDay;
  }, [options]);

  /* The hours the dropdown actually offers. In the week view those are each
     day's peak hour, not the six-hourly steps -- and checking the choice
     against the steps snapped every pick back to +1 h, because a peak at
     +42 h is never one of 1, 7, 13 ... The week view looked dead: whatever day
     was chosen, the map stayed on the next hour. */
  const offered = useMemo(
    () => (usePeaks ? peaks!.map((p) => p.hoursAhead) : options),
    [usePeaks, peaks, options],
  );

  // If the range or the data no longer covers the chosen hour, fall back to
  // one that exists rather than requesting a gap.
  useEffect(() => {
    if (offered.length > 0 && !offered.includes(horizon)) setHorizon(offered[0]);
  }, [offered, horizon, setHorizon]);

  /* While the strip shows Live, no forecast hour is "selected" (13 Nov 2026): a lit tick beside a lit Live button
     said two different times at once. The forecast map keeps its hour; the timeline just stops claiming it. */
  const liveOn = !!live?.active;

  /* The page's dock (13 Nov 2026, user request "easier to understand and navigate"): one row, read left to right --
     Live now, the forecast hours on a track, and how far ahead the track reaches. The dropdown and the separate day
     word went: the chosen hour is already printed large over its tick. The expanded view keeps the compact form. */
  if (!compact) {
    const rangeButtons = (
      <div className="mc-horizon-ranges" role="group" aria-label="How far ahead">
        {HORIZON_RANGES.map((r) => {
          const reach = maxHorizon ?? 0;
          const ok = reach >= r.hours;
          return (
            <button
              key={r.key}
              type="button"
              className={`mc-horizon-range${range === r.key ? " is-active" : ""}`}
              aria-pressed={range === r.key}
              disabled={!ok}
              title={ok ? `Show the hours within ${r.label.toLowerCase()} on the track` : `The forecast currently reaches +${reach} h.`}
              onClick={() => {
                setRange(r.key);
                setHorizon(Math.min(horizon, r.hours));
              }}
            >
              {r.label.replace("Next ", "")}
            </button>
          );
        })}
      </div>
    );
    return (
      <div className={`mc-horizon lm-time${liveOn ? " is-live" : " is-forecast"}`}>
        {live && (
          <button
            type="button"
            className={`lm-scrub-live${liveOn ? " is-active" : ""}`}
            aria-pressed={liveOn}
            onClick={live.onSelect}
            title="Show what Waze reports now"
          >
            <i aria-hidden="true" />
            <span className="lm-scrub-live-word">Live</span>
            <span className="lm-scrub-live-age">{live.label}</span>
          </button>
        )}
        <span className="lm-time-sep" aria-hidden="true">or</span>
        <div className="lm-scrub" role="group" aria-label="Forecast hour">
          <div className="lm-scrub-track" style={{ ["--ticks" as string]: offered.length }}>
            {liveOn && <span className="lm-scrub-hint">Pick an hour to see its forecast</span>}
            {offered.map((h, i) => {
              const t = usePeaks ? new Date(peaks![i].at) : hourOf(h);
              const on = h === horizon && !liveOn;
              const every = offered.length <= 13 ? 1 : offered.length <= 30 ? 4 : 8;
              const labelled = on || usePeaks || i % every === 0 || i === offered.length - 1;
              const ahead = hoursFromNow(h);
              const short = usePeaks
                ? t.toLocaleDateString(undefined, { weekday: "short" })
                : ahead <= 0 ? "Now" : `+${ahead} h`;
              return (
                <button
                  key={`${h}-${i}`}
                  type="button"
                  className={`lm-tick${on ? " is-on" : ""}${labelled ? " is-labelled" : ""}`}
                  aria-pressed={on}
                  aria-label={`Forecast for ${dayOf(t)} ${timeOf(t)}, ${ahead <= 0 ? "this hour" : `${ahead} h from now`}`}
                  title={`${dayOf(t)} · ${timeOf(t)} · ${ahead <= 0 ? "this hour" : `+${ahead} h from now`}`}
                  onClick={() => {
                    setHorizon(h);
                    onPick?.(h);
                  }}
                >
                  {on && (
                    <span className="lm-tick-now" aria-hidden="true">
                      <b>{timeOf(t)}</b>
                      <small>{dayOf(t)}</small>
                    </span>
                  )}
                  <span className="lm-tick-mark" aria-hidden="true" />
                  <span className="lm-tick-label" aria-hidden="true">{short}</span>
                </button>
              );
            })}
          </div>
        </div>
        {rangeButtons}
      </div>
    );
  }

  return (
    <div className={`mc-horizon${compact ? " is-compact" : ""}`}>
      <div className="mc-horizon-ranges" role="group" aria-label="Forecast range">
        {HORIZON_RANGES.map((r) => {
          const reach = maxHorizon ?? 0;
          const ok = reach >= r.hours;
          return (
            <button
              key={r.key}
              type="button"
              className={`mc-horizon-range${range === r.key ? " is-active" : ""}`}
              aria-pressed={range === r.key}
              disabled={!ok}
              title={
                ok
                  ? `Pick any hour within ${r.label.toLowerCase()}`
                  : `The forecast currently reaches +${reach} h. Run the congestion pipeline further ahead to use this.`
              }
              onClick={() => {
                setRange(r.key);
                setHorizon(Math.min(horizon, r.hours));
              }}
            >
              {r.label}
            </button>
          );
        })}
      </div>

      <HourMenu
        value={horizon}
        onChange={setHorizon}
        groups={
          usePeaks
            ? [{
                day: "Each day's worst hour",
                items: peaks!.map((p) => {
                  const t = new Date(p.at);
                  return {
                    h: p.hoursAhead,
                    main: `${dayOf(t)} · ${timeOf(t)}`,
                    // "0 congested" is true but reads as a missing number; a day with nothing heavy is "clear".
                    side: p.congested + (p.slow ?? 0) > 0
                      ? [p.congested > 0 ? `${p.congested} congested` : "", (p.slow ?? 0) > 0 ? `${p.slow} slow` : ""].filter(Boolean).join(" · ")
                      : "clear",
                  };
                }),
              }]
            : groups.map((g) => ({
                day: g.day,
                items: g.items.map((o) => ({
                  h: o.h,
                  main: o.time,
                  side: hoursFromNow(o.h) <= 0 ? "now" : `+${hoursFromNow(o.h)} h`,
                })),
              }))
        }
      />

      {/* A native select shows only the chosen row's text, which inside a day
          group no longer names the day. This says which one, so the closed
          control is never ambiguous. The expanded header states it in its own
          subtitle, so it is not repeated there. */}
    </div>
  );
}

type MenuGroup = { day: string; items: { h: number; main: string; side: string }[] };

/**
 * The hour picker's menu (13 Nov 2026, user request "improve the drop down design"). A native <select> drew the
 * browser's own list, which cannot be styled: a white box, grey day headings and a solid blue bar on the chosen
 * row. This is the same choice in the dashboard's style: day headings, the time with its offset set apart on the
 * right, a tint and a check on the chosen hour. Closes on Escape or a click outside; arrow keys move the choice.
 */
function HourMenu({ value, onChange, groups }: { value: number; onChange: (h: number) => void; groups: MenuGroup[] }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement | null>(null);
  const list = useRef<HTMLDivElement | null>(null);
  const flat = groups.flatMap((g) => g.items);
  const current = flat.find((i) => i.h === value) ?? flat[0];

  useEffect(() => {
    if (!open) return;
    const out = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    /* Escape closes the menu only: caught on the way down (capture, on window) and stopped there, so the expanded
       view's own Escape handler does not close the whole view as well. */
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
    };
    document.addEventListener("mousedown", out);
    window.addEventListener("keydown", key, true);
    // Bring the chosen hour into view when the list opens.
    list.current?.querySelector<HTMLElement>("[aria-selected='true']")?.scrollIntoView({ block: "nearest" });
    return () => { document.removeEventListener("mousedown", out); window.removeEventListener("keydown", key, true); };
  }, [open]);

  const step = (d: 1 | -1) => {
    const i = flat.findIndex((x) => x.h === value);
    const next = flat[Math.max(0, Math.min(flat.length - 1, (i < 0 ? 0 : i) + d))];
    if (next) onChange(next.h);
  };

  return (
    <div className={`lm-hour${open ? " is-open" : ""}`} ref={wrap}>
      <button
        type="button"
        className="lm-hour-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Forecast hour"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); step(1); }
          if (e.key === "ArrowUp") { e.preventDefault(); step(-1); }
        }}
      >
        <span className="lm-hour-main">{current?.main ?? "—"}</span>
        {current && <span className="lm-hour-side">{current.side}</span>}
        <ChevronDown size={15} aria-hidden="true" className="lm-hour-chev" />
      </button>
      {open && (
        <div className="lm-hour-menu" role="listbox" aria-label="Forecast hour" ref={list}>
          {groups.map((g) => (
            <div key={g.day} className="lm-hour-group">
              <div className="lm-hour-day">{g.day}</div>
              {g.items.map((it) => {
                const on = it.h === value;
                return (
                  <button
                    key={it.h}
                    type="button"
                    role="option"
                    aria-selected={on}
                    className={`lm-hour-opt${on ? " is-on" : ""}`}
                    onClick={() => { onChange(it.h); setOpen(false); }}
                  >
                    <span className="lm-hour-check" aria-hidden="true">{on && <Check size={14} strokeWidth={2.6} />}</span>
                    <span className="lm-hour-main">{it.main}</span>
                    <span className="lm-hour-side">{it.side}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
