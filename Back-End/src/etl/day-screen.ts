/**
 * Which days of a toll file may be loaded (6 Nov 2026).
 *
 * Two checks, run on the aggregate before anything is staged, so a day that fails them never touches the warehouse:
 *
 *   1. The date window the person loading chose ("load only 1 Jan to 24 May"). Days outside it are left out.
 *   2. Completeness, for files that REPLACE whole days (NLEX's own hourly export, toll-tir.ts). Such a load deletes
 *      every plaza-hour of each day it holds and writes the file's, so a day the export only half-contains would wipe
 *      a full day of record and leave the half. The 2026 export (6 Nov 2026) has seven such days after 24 May, each
 *      about 30 trips in hour 0 and nothing else. A day is held back when:
 *        - it is missing an hour that is not a toll holiday (1 Jan 00-05, 24 Dec 22-23, 25 Dec 00-05, 31 Dec 23: the
 *          only gaps in the full 2024 and 2025 exports), or
 *        - it has under 20% of the file's median day for that weekday (the lowest REAL days in 2024-2026 are 30%,
 *          typhoon Carina on 24 Jul 2024; then 43-53% for the November 2025 typhoons and Good Friday), or
 *        - it holds under 60% of the plazas the file's median day holds.
 *      Files that replace only the plaza-hours they hold (nlex_traffic_hourly, corrections) are not screened for
 *      completeness: a partial file there is the point, and it leaves the rest of the day alone.
 *
 * Held-back and missing days are listed, never filled or guessed.
 */
import type { TollHourlyAggregate } from "./toll-hourly.js";

export type DayWindow = { from?: string; to?: string };
export type DayStatus = "loaded" | "held" | "missing" | "outside";

export interface ScreenedDay {
  date: string;
  status: DayStatus;
  /** Trips the file holds for the day (accepted rows), hours with any trip, and plazas with any trip. */
  trips: number;
  hours: number;
  plazas: number;
  reason?: string;
}

export interface DayScreen {
  window: DayWindow | null;
  /** True when the file replaces whole days and was screened for completeness. */
  completeness: boolean;
  /** Every day from the file's first to its last, in order. */
  days: ScreenedDay[];
  loaded: number;
  held: number;
  missing: number;
  outside: number;
  /** Accepted rows on the days left out (held back or outside the window). */
  rowsLeftOut: number;
  thresholds: { minShareOfWeekday: number; minShareOfPlazas: number };
}

export const MIN_SHARE_OF_WEEKDAY = 0.2;
export const MIN_SHARE_OF_PLAZAS = 0.6;

/** The hours a toll holiday leaves empty in NLEX's export (seen in 2024, 2025 and 2026 alike). */
export function tollHolidayHours(date: string): Set<number> {
  const md = date.slice(5);
  if (md === "01-01") return new Set([0, 1, 2, 3, 4, 5]);
  if (md === "12-24") return new Set([22, 23]);
  if (md === "12-25") return new Set([0, 1, 2, 3, 4, 5]);
  if (md === "12-31") return new Set([23]);
  return new Set();
}

const median = (v: number[]): number => {
  if (v.length === 0) return 0;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const addDays = (iso: string, n: number): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const dow = (iso: string): number => new Date(`${iso}T00:00:00Z`).getUTCDay();

/**
 * Screen the aggregate's days and drop the ones that may not be loaded from it, in place. Returns what was decided
 * for every day, for the gate log and the page's coverage calendar.
 */
export function screenDays(agg: TollHourlyAggregate, opts: { window?: DayWindow | null; completeness: boolean }): DayScreen {
  const window = opts.window && (opts.window.from || opts.window.to) ? opts.window : null;
  const per = new Map<string, { trips: number; hours: Set<number>; plazas: Set<string> }>();
  for (const [key, s] of agg.fact) {
    const [date, hour, exit] = key.split("\t", 3);
    let d = per.get(date);
    if (!d) { d = { trips: 0, hours: new Set(), plazas: new Set() }; per.set(date, d); }
    d.trips += s[3];
    if (s[3] > 0) { d.hours.add(Number(hour)); d.plazas.add(exit); }
  }
  const present = [...per.keys()].sort();
  const inWindow = (d: string) => (!window?.from || d >= window.from) && (!window?.to || d <= window.to);

  // The yardsticks, from the days the window keeps: the median day of each weekday, and the median plaza count.
  const kept = present.filter(inWindow);
  const byDow = new Map<number, number[]>();
  for (const d of kept) {
    const a = byDow.get(dow(d)) ?? [];
    a.push(per.get(d)!.trips);
    byDow.set(dow(d), a);
  }
  const allMedian = median(kept.map((d) => per.get(d)!.trips));
  const plazaMedian = median(kept.map((d) => per.get(d)!.plazas.size));

  const days: ScreenedDay[] = [];
  const drop = new Set<string>();
  if (present.length) {
    for (let d = present[0]; d <= present[present.length - 1]; d = addDays(d, 1)) {
      const p = per.get(d);
      if (!inWindow(d)) {
        days.push({ date: d, status: "outside", trips: p?.trips ?? 0, hours: p?.hours.size ?? 0, plazas: p?.plazas.size ?? 0 });
        if (p) drop.add(d);
        continue;
      }
      if (!p) {
        days.push({ date: d, status: "missing", trips: 0, hours: 0, plazas: 0, reason: "not in the file" });
        continue;
      }
      const row: ScreenedDay = { date: d, status: "loaded", trips: Math.round(p.trips), hours: p.hours.size, plazas: p.plazas.size };
      if (opts.completeness) {
        const allowed = tollHolidayHours(d);
        const gaps = [];
        for (let h = 0; h < 24; h++) if (!p.hours.has(h) && !allowed.has(h)) gaps.push(h);
        const sameDow = byDow.get(dow(d)) ?? [];
        const yard = sameDow.length >= 3 ? median(sameDow) : allMedian;
        const why: string[] = [];
        if (gaps.length) why.push(gaps.length === 24 - allowed.size ? "no hours" : `missing ${gaps.length} hour${gaps.length === 1 ? "" : "s"} (${gaps.length > 6 ? `${gaps[0]}:00 to ${gaps[gaps.length - 1]}:00` : gaps.map((h) => `${h}:00`).join(", ")})`);
        if (yard > 0 && p.trips < MIN_SHARE_OF_WEEKDAY * yard) why.push(`${Math.round(p.trips).toLocaleString("en-US")} trips, ${Math.round((p.trips / yard) * 100)}% of a usual ${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][dow(d)]}`);
        if (plazaMedian > 0 && p.plazas.size < MIN_SHARE_OF_PLAZAS * plazaMedian) why.push(`${p.plazas.size} of the usual ${Math.round(plazaMedian)} plazas`);
        if (why.length) {
          row.status = "held";
          row.reason = why.join("; ");
          drop.add(d);
        }
      }
      days.push(row);
    }
  }

  // Take the left-out days out of the aggregate, so nothing of them is staged or replaced.
  let rowsLeftOut = 0;
  if (drop.size) {
    const dated = (key: string) => drop.has(key.slice(0, 10));
    for (const m of [agg.fact, agg.origin, agg.vkm] as Map<string, unknown>[]) {
      for (const key of [...m.keys()]) if (dated(key)) m.delete(key);
    }
    for (const d of drop) rowsLeftOut += agg.rowsByDate?.get(d) ?? 0;
    agg.dates = agg.dates.filter((d) => !drop.has(d));
    agg.rowsAccepted -= rowsLeftOut;
  }

  const count = (s: DayStatus) => days.filter((x) => x.status === s).length;
  return {
    window,
    completeness: opts.completeness,
    days,
    loaded: count("loaded"),
    held: count("held"),
    missing: count("missing"),
    outside: count("outside"),
    rowsLeftOut,
    thresholds: { minShareOfWeekday: MIN_SHARE_OF_WEEKDAY, minShareOfPlazas: MIN_SHARE_OF_PLAZAS },
  };
}
