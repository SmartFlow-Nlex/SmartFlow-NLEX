import { db } from "../config/db.js";
import { getUpcomingEventSurge } from "./traffic.service.js";

/*
 * WHAT AN ARENA EVENT DOES TO THE SANDBOX'S ROAD, HOUR BY HOUR (mock defense, 3 Nov 2026: "add what will happen
 * if there is an event, pwede to mag base doon sa Event Prediction").
 *
 * The Event Prediction (gold.ml_event_surge_forecast, written by build_event_surge.py) is a DAILY uplift per exit:
 * an event day's median total against the median non-event, non-holiday day of the same weekday and month, on the
 * real Philippine Arena calendar, kept only where its bootstrap 95% interval clears 1.0 ("material"). The sandbox
 * runs one hour at a time, so it needs to know WHEN in the day that extra traffic comes.
 *
 * That comes from the same records, built the same way: for each material exit and hour, the median over past
 * calendar event days (holidays left out, as the model leaves them out) of that hour's volume against the same
 * exit's median for that hour on non-event, non-holiday days of the same weekday and month. The hourly ratios are
 * then scaled together so that, over the day, they add up to exactly the model's daily uplift: the hours say when,
 * the Event Prediction says how much. Exits the model does not count as affected are left at 1.
 *
 * Nothing here is assumed: no arrival curve, no attendance-to-cars factor. An exit that the records show rising
 * after a concert rises in the sandbox at those hours, by that much; one that does not, does not.
 */

export type EventExitProfile = {
  exit: string;
  /** The Event Prediction's daily uplift and its 95% interval. */
  uplift: number;
  upliftLo: number | null;
  upliftHi: number | null;
  nEvents: number;
  /** Ratio to a normal day at each hour 0-23, scaled so the day adds up to `uplift`. */
  hourly: number[];
};

export type EventDayPayload = {
  events: { date: string; title: string; isDerived: boolean; capacity: number | null; venue: string | null; extraVehicles: number }[];
  exits: EventExitProfile[];
  /** Extra vehicles across the affected exits at each hour of a typical event day (corridor-wide). */
  addedByHour: number[];
  /** The hour of the day the event adds the most vehicles. */
  peakHour: number;
  pastEventDays: number;
  method: string;
};

const TTL_MS = 6 * 60 * 60 * 1000;
let cache: { at: number; data: EventDayPayload } | null = null;
let building: Promise<EventDayPayload | null> | null = null;

export async function getEventDayProfile(): Promise<EventDayPayload | null> {
  if (!db) return null;
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
  building ??= build().finally(() => { building = null; });
  const data = await building;
  if (data) cache = { at: Date.now(), data };
  return data;
}

async function build(): Promise<EventDayPayload | null> {
  try {
    const [model, hourly, upcoming] = await Promise.all([
      db!.query(
        `SELECT exit_name AS exit, uplift::float, uplift_lo::float AS lo, uplift_hi::float AS hi, n_events::int AS n
           FROM gold.ml_event_surge_forecast WHERE material`,
      ),
      db!.query(
        `WITH ev AS (SELECT DISTINCT event_date::date AS d FROM silver.philippine_arena_events_clean WHERE event_date IS NOT NULL),
              hol AS (SELECT DISTINCT date_day::date AS d FROM public.ph_holidays),
              h AS (
                SELECT date, exit_canonical AS ex, hour, SUM(total)::float AS v
                  FROM gold.fact_traffic_hourly
                 WHERE total IS NOT NULL
                   AND exit_canonical IN (SELECT exit_name FROM gold.ml_event_surge_forecast WHERE material)
                 GROUP BY 1, 2, 3),
              base AS (
                SELECT ex, hour, EXTRACT(DOW FROM date)::int AS dow, EXTRACT(MONTH FROM date)::int AS m,
                       PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY v) AS b
                  FROM h
                 WHERE date NOT IN (SELECT d FROM ev) AND date NOT IN (SELECT d FROM hol)
                 GROUP BY 1, 2, 3, 4),
              evh AS (
                SELECT h.ex, h.hour, h.v, b.b
                  FROM h
                  JOIN ev ON ev.d = h.date
                  JOIN base b ON b.ex = h.ex AND b.hour = h.hour
                             AND b.dow = EXTRACT(DOW FROM h.date) AND b.m = EXTRACT(MONTH FROM h.date)
                 WHERE h.date NOT IN (SELECT d FROM hol) AND b.b > 0)
         SELECT ex AS exit, hour::int, PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY v / b)::float AS r,
                AVG(b)::float AS base, COUNT(*)::int AS n
           FROM evh GROUP BY 1, 2`,
      ),
      getUpcomingEventSurge(),
    ]);

    const byExit = new Map<string, { r: number[]; base: number[]; n: number }>();
    for (const row of hourly.rows as { exit: string; hour: number; r: number; base: number; n: number }[]) {
      if (row.hour < 0 || row.hour > 23) continue;
      const e = byExit.get(row.exit) ?? { r: Array(24).fill(1), base: Array(24).fill(0), n: 0 };
      e.r[row.hour] = Number(row.r);
      e.base[row.hour] = Number(row.base);
      e.n = Math.max(e.n, Number(row.n));
      byExit.set(row.exit, e);
    }

    const exits: EventExitProfile[] = [];
    const addedByHour = Array(24).fill(0);
    let pastEventDays = 0;
    for (const m of model.rows as { exit: string; uplift: number; lo: number | null; hi: number | null; n: number }[]) {
      const shape = byExit.get(m.exit);
      const uplift = Number(m.uplift);
      let ratios = Array(24).fill(uplift);
      if (shape) {
        const normal = shape.base.reduce((s, b) => s + b, 0);
        const raw = shape.base.reduce((s, b, h) => s + b * shape.r[h], 0);
        // Scaled so the day's extra traffic is the Event Prediction's, spread the way past event days spread it.
        const k = normal > 0 && raw > 0 ? (uplift * normal) / raw : 1;
        ratios = shape.r.map((r) => Math.round(r * k * 10000) / 10000);
        shape.base.forEach((b, h) => (addedByHour[h] += b * (ratios[h] - 1)));
        pastEventDays = Math.max(pastEventDays, shape.n);
      }
      exits.push({ exit: m.exit, uplift, upliftLo: m.lo, upliftHi: m.hi, nEvents: Number(m.n), hourly: ratios });
    }
    exits.sort((a, b) => b.uplift - a.uplift);
    const added = addedByHour.map((v) => Math.round(v));
    const peakHour = added.reduce((best, v, h) => (v > added[best] ? h : best), 0);

    return {
      events: (upcoming ?? []).map((e) => ({
        date: e.date, title: e.title, isDerived: e.isDerived, capacity: e.capacity, venue: e.venue,
        extraVehicles: Math.round(e.exits.reduce((s, x) => s + (x.surge - x.baseline), 0)),
      })),
      exits,
      addedByHour: added,
      peakHour,
      pastEventDays,
      method:
        "Event Prediction (gold.ml_event_surge_forecast): each affected exit's daily uplift on Philippine Arena days. " +
        "Spread over the day by the same exits' hourly ratios on past calendar event days (gold.fact_traffic_hourly, " +
        "holidays excluded) against non-event, non-holiday days of the same weekday and month, scaled to add up to that daily uplift.",
    };
  } catch (error) {
    console.error("Failed to build the event-day profile:", error);
    return null;
  }
}
